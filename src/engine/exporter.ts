/**
 * Exportação quadro a quadro: posiciona cada vídeo no instante exato, renderiza
 * com o mesmo `renderFrame` do preview e envia JPEGs em lotes ao FFmpeg local.
 */
import type { MediaAsset, Project, VideoClip } from '../core/model';
import { evaluateScene } from '../core/scene';
import { renderFrame, type MediaSources } from '../render/renderer';
import { ensureFonts } from '../render/fonts';
import { exportsApi, type ExportSettings } from '../platform/api';

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'done';
  frame: number;
  total: number;
  fps: number;
}

const BATCH = 10;

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error(`Não foi possível carregar o vídeo ${url}`));
    v.src = url;
  });
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function seekExact(v: HTMLVideoElement, t: number): Promise<void> {
  const target = Math.max(0, Math.min(t, (v.duration || Infinity) - 0.001));
  if (Math.abs(v.currentTime - target) < 1e-4 && !v.seeking && v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    v.addEventListener('seeked', done, { once: true });
    v.currentTime = target;
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao codificar quadro.'))), 'image/jpeg', quality),
  );
}

export async function runExport(
  project: Project,
  media: Record<string, MediaAsset>,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<{ id: string; file: string }> {
  onProgress({ phase: 'preparing', frame: 0, total: 0, fps: 0 });
  await ensureFonts();

  // prepara um elemento por clipe de vídeo e todas as imagens usadas
  const videos = new Map<string, HTMLVideoElement>();
  const images = new Map<string, HTMLImageElement>();
  for (const c of project.clips) {
    if (c.type === 'video') {
      const m = media[c.mediaId];
      if (!m) throw new Error(`Mídia ausente: ${c.name}`);
      videos.set(c.id, await loadVideo(m.url));
    }
    const ids = c.type === 'image' ? [c.mediaId] : c.type === 'sponsors' ? c.mediaIds : [];
    for (const id of ids) {
      const m = media[id];
      if (m && !images.has(id)) images.set(id, await loadImage(m.url));
    }
  }
  const sources: MediaSources = {
    video: (clip: VideoClip) => videos.get(clip.id) ?? null,
    image: (id) => images.get(id) ?? null,
    size: (id) => {
      const i = images.get(id);
      return i ? { w: i.naturalWidth, h: i.naturalHeight } : null;
    },
  };

  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const { id, totalFrames } = await exportsApi.start(project, settings);
  let cancelled = false;
  const onAbort = () => {
    cancelled = true;
    void exportsApi.cancel(id);
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    let batch: Blob[] = [];
    let inflight: Promise<void> = Promise.resolve();
    const t0 = performance.now();
    for (let i = 0; i < totalFrames; i++) {
      if (cancelled) throw new DOMException('Exportação cancelada', 'AbortError');
      const t = i / settings.fps;
      const active = evaluateScene(project, t).filter((it) => it.clip.type === 'video');
      await Promise.all(active.map((it) => seekExact(videos.get(it.clip.id)!, it.mediaTime)));
      renderFrame(ctx, project, t, sources, { editorHints: false });
      batch.push(await toJpeg(canvas, 0.93));
      if (batch.length >= BATCH || i === totalFrames - 1) {
        const send = batch;
        batch = [];
        await inflight; // no máximo um lote em voo
        inflight = exportsApi.pushFrames(id, send);
      }
      const elapsed = (performance.now() - t0) / 1000;
      onProgress({ phase: 'rendering', frame: i + 1, total: totalFrames, fps: (i + 1) / Math.max(elapsed, 0.001) });
    }
    await inflight;
    onProgress({ phase: 'encoding', frame: totalFrames, total: totalFrames, fps: 0 });
    const r = await exportsApi.finish(id);
    onProgress({ phase: 'done', frame: totalFrames, total: totalFrames, fps: 0 });
    return { id, file: r.file };
  } finally {
    signal.removeEventListener('abort', onAbort);
    for (const v of videos.values()) {
      v.removeAttribute('src');
      v.load();
    }
  }
}
