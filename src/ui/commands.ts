/** Comandos do editor — chamados por botões, atalhos de teclado e painéis. */
import type { Clip, MediaAsset, Project, ShapeClip } from '../core/model';
import { isVisual } from '../core/model';
import {
  createAudioClip,
  createBlurClip,
  createImageClip,
  createShapeClip,
  createSponsorsClip,
  createTextClip,
  createVideoClip,
  fitContain,
  fitCover,
} from '../core/factory';
import { uid } from '../core/id';
import { clipEnd, deleteClips, duplicateClip, findClip, placeClip, projectDuration, splitClip } from '../core/timeline';
import { applyTemplate } from '../core/templates';
import { getEditor } from '../state/store';
import { preview } from '../engine/preview';
import { effectiveTransform } from '../core/edit';

const st = getEditor;

/** Adiciona mídia: vídeo vai para a trilha principal ao fim do conteúdo (ou na agulha). */
export function addMedia(m: MediaAsset, at?: number) {
  const s = st();
  if (!s.project) return;
  if (m.status !== 'ready') {
    s.notify('Aguarde o processamento do arquivo.', 'info');
    return;
  }
  let clip: Clip;
  const p = s.project;
  if (m.kind === 'video') {
    const main = p.tracks.find((t) => t.kind === 'visual');
    const mainEnd = Math.max(0, ...p.clips.filter((c) => c.trackId === main?.id).map(clipEnd));
    clip = createVideoClip(p, m, at ?? mainEnd);
    s.apply((pr) => placeClip(pr, clip, main?.id));
  } else if (m.kind === 'image') {
    clip = createImageClip(p, m, at ?? s.time);
    s.apply((pr) => placeClip(pr, clip));
  } else {
    clip = createAudioClip(p, m, at ?? s.time);
    s.apply((pr) => placeClip(pr, clip));
  }
  s.select([clip.id]);
}

export function addText(presetId: string) {
  const s = st();
  if (!s.project) return;
  const c = createTextClip(s.project, presetId, s.time);
  s.apply((p) => placeClip(p, c));
  s.select([c.id]);
}

export function addSponsors(mediaIds: string[] = []) {
  const s = st();
  if (!s.project) return;
  const c = createSponsorsClip(s.project, mediaIds, s.time);
  s.apply((p) => placeClip(p, c));
  s.select([c.id]);
}

export function addShape(kind: ShapeClip['shape']) {
  const s = st();
  if (!s.project) return;
  const c = createShapeClip(s.project, kind, s.time);
  s.apply((p) => placeClip(p, c));
  s.select([c.id]);
}

export function addBlur(rect: { x: number; y: number; width: number; height: number }, shape: 'rect' | 'ellipse') {
  const s = st();
  if (!s.project) return;
  const c = createBlurClip(s.project, rect, s.time, shape);
  s.apply((p) => placeClip(p, c));
  s.select([c.id]);
  s.set('tool', 'select');
}

export function applyTemplateCmd(id: string, logo?: MediaAsset) {
  const s = st();
  if (!s.project) return;
  if (!s.project.clips.some((c) => c.type === 'video')) {
    s.notify('Adicione um vídeo antes de aplicar o modelo.', 'info');
  }
  let added: string[] = [];
  s.apply((p) => {
    const r = applyTemplate(p, id, { logo });
    added = r.addedIds;
    return r.project;
  });
  s.select(added.slice(0, 1));
}

export function splitAtPlayhead() {
  const s = st();
  if (!s.project) return;
  const t = s.time;
  const targets = (s.selection.length ? s.project.clips.filter((c) => s.selection.includes(c.id)) : s.project.clips).filter(
    (c) => t > c.start && t < clipEnd(c),
  );
  if (!targets.length) {
    s.notify('Posicione a agulha sobre um clipe para dividir.');
    return;
  }
  const newIds: string[] = [];
  s.apply((p) => {
    let pr = p;
    for (const c of targets) {
      const r = splitClip(pr, c.id, t);
      pr = r.project;
      if (r.newId) newIds.push(r.newId);
    }
    return pr;
  });
  if (newIds.length) s.select(newIds);
}

export function deleteSelection(ripple = false) {
  const s = st();
  if (!s.project || !s.selection.length) return;
  const ids = [...s.selection];
  s.apply((p) => deleteClips(p, ids, ripple));
  s.select([]);
}

export function duplicateSelection() {
  const s = st();
  if (!s.project || !s.selection.length) return;
  const ids: string[] = [];
  s.apply((p) => {
    let pr = p;
    for (const id of s.selection) {
      const r = duplicateClip(pr, id);
      pr = r.project;
      if (r.newId) ids.push(r.newId);
    }
    return pr;
  });
  s.select(ids);
}

export function copySelection() {
  const s = st();
  if (!s.project || !s.selection.length) return;
  s.set('clipboard', s.project.clips.filter((c) => s.selection.includes(c.id)).map((c) => structuredClone(c)));
  s.notify(`${s.selection.length} item(ns) copiado(s)`);
}

export function paste() {
  const s = st();
  if (!s.project || !s.clipboard?.length) return;
  const minStart = Math.min(...s.clipboard.map((c) => c.start));
  const ids: string[] = [];
  s.apply((p) => {
    let pr = p;
    for (const c of s.clipboard!) {
      const copy = { ...structuredClone(c), id: uid(), start: s.time + (c.start - minStart) } as Clip;
      ids.push(copy.id);
      pr = placeClip(pr, copy, c.trackId);
    }
    return pr;
  });
  s.select(ids);
}

export function togglePlay() {
  const s = st();
  if (!s.project) return;
  if (s.playing) {
    preview.stop();
    s.setPlaying(false);
    return;
  }
  if (projectDuration(s.project) <= 0) return;
  s.setPlaying(true);
  preview.play(
    s.project,
    s.time,
    (t) => st().setTime(t),
    () => st().setPlaying(false),
  );
}

export function stopPlayback() {
  preview.stop();
  st().setPlaying(false);
}

export function seek(t: number) {
  const s = st();
  if (s.playing) {
    stopPlayback();
  }
  s.setTime(t);
}

export function stepFrames(n: number) {
  const s = st();
  if (!s.project) return;
  seek(Math.round((s.time + n / s.project.fps) * s.project.fps) / s.project.fps);
}

/** Encaixa (contain) ou preenche (cover) o quadro com a mídia selecionada. */
export function fitSelection(mode: 'contain' | 'cover') {
  const s = st();
  const p = s.project;
  if (!p) return;
  s.apply((pr) => ({
    ...pr,
    clips: pr.clips.map((c) => {
      if (!s.selection.includes(c.id) || (c.type !== 'video' && c.type !== 'image')) return c;
      const m = s.media[c.mediaId];
      const r = m && m.width ? m.width / m.height : c.transform.width / c.transform.height;
      const tr = mode === 'contain' ? fitContain(r * 1000, 1000, p.width, p.height) : fitCover(r * 1000, 1000, p.width, p.height);
      return { ...c, transform: { ...tr, rotation: 0, opacity: c.transform.opacity }, keyframes: [] };
    }),
  }));
}

/** Separa o áudio do vídeo selecionado em um clipe de áudio independente. */
export function detachAudio() {
  const s = st();
  const p = s.project;
  if (!p) return;
  const v = p.clips.find((c) => s.selection.includes(c.id) && c.type === 'video');
  if (!v || v.type !== 'video' || !v.hasAudio) {
    s.notify('Selecione um vídeo com áudio.');
    return;
  }
  const a: Clip = {
    type: 'audio',
    id: uid(),
    trackId: '',
    name: `Áudio · ${v.name}`,
    start: v.start,
    duration: v.duration,
    mediaId: v.mediaId,
    sourceIn: v.sourceIn,
    sourceDuration: v.sourceDuration,
    speed: v.speed,
    volume: v.volume,
    muted: false,
    fadeIn: v.fadeIn,
    fadeOut: v.fadeOut,
  };
  s.apply((pr) => placeClip({ ...pr, clips: pr.clips.map((c) => (c.id === v.id ? { ...c, muted: true } : c)) }, a));
  s.select([a.id]);
}

/** Move os elementos visuais selecionados alguns pixels (setas do teclado). */
export function nudge(dx: number, dy: number) {
  const s = st();
  if (!s.project) return;
  s.apply((p: Project) => {
    let pr = p;
    for (const id of s.selection) {
      const c = findClip(pr, id);
      if (!c || !isVisual(c)) continue;
      const tr = effectiveTransform(c, s.time);
      const next = { ...tr, x: tr.x + dx, y: tr.y + dy };
      pr = {
        ...pr,
        clips: pr.clips.map((x) => {
          if (x.id !== id || !isVisual(x)) return x;
          if (x.keyframes.length) {
            const local = Math.max(0, s.time - x.start);
            const kfs = x.keyframes.filter((k) => Math.abs(k.t - local) > 1 / 60);
            kfs.push({ ...next, t: local, easing: 'ease-in-out' });
            return { ...x, keyframes: kfs.sort((a, b) => a.t - b.t) };
          }
          return { ...x, transform: next };
        }),
      };
    }
    return pr;
  }, 'nudge');
}
