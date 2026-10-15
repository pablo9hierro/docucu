/**
 * Motor do preview: mantém um elemento de mídia por clipe, sincroniza com o
 * relógio da timeline e roteia o áudio por Web Audio (ganho > 100% e fades).
 */
import type { AudioClip, MediaAsset, Project, VideoClip } from '../core/model';
import { buildAudioPlan, gainAt, type AudioSegment } from '../core/audio';
import { clipEnd, projectDuration } from '../core/timeline';
import type { MediaSources } from '../render/renderer';
import { createPitchShifter, type PitchShifter } from './pitchShifter';

type MediaEl = HTMLVideoElement | HTMLAudioElement;

class PreviewEngine {
  private els = new Map<string, { el: MediaEl; url: string; pending: number | null }>();
  private images = new Map<string, HTMLImageElement>();
  private gains = new WeakMap<MediaEl, GainNode>();
  private audioRoutes = new WeakMap<MediaEl, { src: MediaElementAudioSourceNode; pitch: number; shifter: PitchShifter | null }>();
  private audioCtx: AudioContext | null = null;
  private listeners = new Set<() => void>();
  private media: Record<string, MediaAsset> = {};
  private clock: { t0: number; perf0: number } | null = null;

  readonly sources: MediaSources = {
    video: (clip) => {
      const e = this.els.get(clip.id)?.el as HTMLVideoElement | undefined;
      return e && e.readyState >= 2 && e.videoWidth > 0 ? e : null;
    },
    image: (mediaId) => {
      const img = this.image(mediaId);
      return img && img.complete && img.naturalWidth > 0 ? img : null;
    },
    size: (mediaId) => {
      const img = this.image(mediaId);
      if (img && img.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight };
      const m = this.media[mediaId];
      return m && m.width ? { w: m.width, h: m.height } : null;
    },
  };

  setMedia(media: Record<string, MediaAsset>) {
    this.media = media;
  }

  onInvalidate(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private invalidate = () => {
    for (const fn of this.listeners) fn();
  };

  image(mediaId: string): HTMLImageElement | null {
    const m = this.media[mediaId];
    if (!m) return null;
    let img = this.images.get(m.url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.onload = this.invalidate;
      img.src = m.url;
      this.images.set(m.url, img);
    }
    return img;
  }

  /** Web Audio só pode iniciar após um gesto do usuário. */
  unlockAudio() {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new AudioContext();
        for (const { el } of this.els.values()) this.route(el);
      } catch {
        this.audioCtx = null;
      }
    }
    void this.audioCtx?.resume();
  }

  private route(el: MediaEl) {
    if (!this.audioCtx || this.gains.has(el)) return;
    try {
      const src = this.audioCtx.createMediaElementSource(el);
      const g = this.audioCtx.createGain();
      src.connect(g).connect(this.audioCtx.destination);
      this.gains.set(el, g);
      this.audioRoutes.set(el, { src, pitch: 1, shifter: null });
    } catch {
      /* elemento já roteado */
    }
  }

  /** Disfarce de voz no preview: insere/remove o trocador de tom entre a mídia e o volume. */
  private setPitch(el: MediaEl, pitch: number) {
    const r = this.audioRoutes.get(el);
    const g = this.gains.get(el);
    if (!r || !g || !this.audioCtx || Math.abs(r.pitch - pitch) < 1e-3) return;
    r.src.disconnect();
    r.shifter?.dispose();
    r.shifter = null;
    if (Math.abs(pitch - 1) > 1e-3) {
      r.shifter = createPitchShifter(this.audioCtx, pitch);
      r.src.connect(r.shifter.input);
      r.shifter.output.connect(g);
    } else {
      r.src.connect(g);
    }
    r.pitch = pitch;
  }

  private setGain(el: MediaEl, v: number) {
    const g = this.gains.get(el);
    if (g && this.audioCtx) {
      g.gain.setTargetAtTime(v, this.audioCtx.currentTime, 0.015);
      el.volume = 1;
    } else {
      el.volume = Math.max(0, Math.min(1, v));
    }
    el.muted = v <= 0;
  }

  private ensure(clip: VideoClip | AudioClip): MediaEl | null {
    const m = this.media[clip.mediaId];
    if (!m || m.status !== 'ready') return null;
    const cur = this.els.get(clip.id);
    if (cur && cur.url === m.url) return cur.el;
    if (cur) this.dispose(clip.id);
    const el: MediaEl = clip.type === 'video' ? document.createElement('video') : document.createElement('audio');
    el.preload = 'auto';
    el.src = m.url;
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.disablePictureInPicture = true;
    }
    const entry = { el, url: m.url, pending: null as number | null };
    el.addEventListener('loadeddata', this.invalidate);
    el.addEventListener('seeked', () => {
      if (entry.pending !== null) {
        const t = entry.pending;
        entry.pending = null;
        el.currentTime = t;
      }
      this.invalidate();
    });
    this.els.set(clip.id, entry);
    this.route(el);
    return el;
  }

  private dispose(id: string) {
    const e = this.els.get(id);
    if (!e) return;
    e.el.pause();
    e.el.removeAttribute('src');
    e.el.load();
    this.els.delete(id);
  }

  private seek(id: string, t: number) {
    const e = this.els.get(id);
    if (!e) return;
    const el = e.el;
    const target = Math.max(0, Math.min(t, (el.duration || Infinity) - 0.001));
    if (el.seeking) {
      e.pending = target;
      return;
    }
    if (Math.abs(el.currentTime - target) > 1 / 120) el.currentTime = target;
  }

  /** Sincroniza todos os elementos com o tempo `t`. */
  sync(p: Project, t: number, playing: boolean) {
    const plan = new Map<string, AudioSegment>(buildAudioPlan(p).map((s) => [s.clipId, s]));
    const alive = new Set<string>();
    for (const c of p.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      alive.add(c.id);
      const el = this.ensure(c);
      if (!el) continue;
      const track = p.tracks.find((tr) => tr.id === c.trackId);
      const active = t >= c.start && t < clipEnd(c) && !(c.type === 'video' && track?.hidden);
      const mediaT = c.sourceIn + (t - c.start) * c.speed;
      const seg = plan.get(c.id);
      if (playing && active) {
        if (el.playbackRate !== c.speed) el.playbackRate = c.speed;
        this.setGain(el, seg ? gainAt(seg, t) : 0);
        this.setPitch(el, seg ? seg.pitch : 1);
        if (el.paused) {
          el.currentTime = Math.max(0, mediaT);
          void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - mediaT) > 0.25) {
          el.currentTime = Math.max(0, mediaT);
        }
      } else {
        if (!el.paused) el.pause();
        if (active && c.type === 'video') this.seek(c.id, mediaT);
      }
    }
    for (const id of [...this.els.keys()]) if (!alive.has(id)) this.dispose(id);
  }

  // --------------------------------------------------------------- relógio
  play(p: Project, from: number, onTime: (t: number) => void, onEnd: () => void) {
    this.unlockAudio();
    const dur = projectDuration(p);
    const start = from >= dur - 0.02 ? 0 : from;
    this.clock = { t0: start, perf0: performance.now() };
    const tick = () => {
      if (!this.clock) return;
      const t = this.clock.t0 + (performance.now() - this.clock.perf0) / 1000;
      if (t >= dur) {
        this.clock = null;
        onTime(dur);
        onEnd();
        return;
      }
      onTime(t);
      requestAnimationFrame(tick);
    };
    onTime(start);
    requestAnimationFrame(tick);
  }

  stop() {
    this.clock = null;
  }

  get isRunning() {
    return this.clock !== null;
  }
}

export const preview = new PreviewEngine();
