/**
 * Exportação no PC: renderiza cada quadro com o mesmo `renderFrame` do preview
 * e envia JPEGs em lotes ao FFmpeg do servidor local.
 */
import type { MediaAsset, Project } from '../core/model';
import { renderFrame } from '../render/renderer';
import { ensureFonts } from '../render/fonts';
import { ensureBrandAssets } from '../render/brandAssets';
import { exportsApi } from '../platform/server';
import type { ExportProgress, ExportSettings } from '../platform/types';
import { prepareFrameSource } from './frameSource';
import { abortable, abortError } from './abortable';

const BATCH = 10;

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
  await Promise.all([ensureFonts(), ensureBrandAssets()]);
  const src = await prepareFrameSource(project, media);
  if (signal.aborted) {
    src.dispose();
    throw abortError();
  }

  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  let started: { id: string; totalFrames: number };
  try {
    started = await abortable(exportsApi.start(project, settings), signal);
  } catch (e) {
    src.dispose();
    throw e;
  }
  const { id, totalFrames } = started;
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
      await abortable(src.seek(t), signal);
      renderFrame(ctx, project, t, src.sources, { editorHints: false });
      batch.push(await abortable(toJpeg(canvas, 0.93), signal));
      if (batch.length >= BATCH || i === totalFrames - 1) {
        const send = batch;
        batch = [];
        await abortable(inflight, signal); // no máximo um lote em voo
        inflight = exportsApi.pushFrames(id, send);
      }
      const elapsed = (performance.now() - t0) / 1000;
      onProgress({ phase: 'rendering', frame: i + 1, total: totalFrames, fps: (i + 1) / Math.max(elapsed, 0.001) });
    }
    await abortable(inflight, signal);
    onProgress({ phase: 'encoding', frame: totalFrames, total: totalFrames, fps: 0 });
    const r = await abortable(exportsApi.finish(id), signal);
    onProgress({ phase: 'done', frame: totalFrames, total: totalFrames, fps: 0 });
    return { id, file: r.file };
  } finally {
    signal.removeEventListener('abort', onAbort);
    src.dispose();
  }
}
