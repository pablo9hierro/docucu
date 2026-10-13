/**
 * Exportação 100% local (celular e navegador), sem servidor e sem FFmpeg:
 * - quadros: o mesmo `renderFrame` do preview → VideoEncoder (H.264 do aparelho);
 * - áudio: mixado num OfflineAudioContext com o MESMO plano do player
 *   (buildAudioPlan: início, trecho, velocidade, volume, fades) → AudioEncoder;
 * - contêiner: MP4 montado em JavaScript (mp4-muxer).
 */
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { MediaAsset, Project } from '../core/model';
import { buildAudioPlan } from '../core/audio';
import { renderFrame } from '../render/renderer';
import { ensureFonts } from '../render/fonts';
import { ensureBrandAssets } from '../render/brandAssets';
import { exportFileName, type ExportProgress, type ExportSettings, type Exporter } from '../platform/types';
import { prepareFrameSource } from './frameSource';

const SAMPLE_RATE = 48000;

/** Escolhe um perfil H.264 que o aparelho saiba codificar nesse tamanho. */
async function pickVideoConfig(width: number, height: number, fps: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  const codecs = fps > 30 ? ['avc1.64002a', 'avc1.4d002a', 'avc1.640033'] : ['avc1.640028', 'avc1.4d0028', 'avc1.640033', 'avc1.42e028', 'avc1.42e01f'];
  for (const codec of codecs) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const cfg: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, hardwareAcceleration, avc: { format: 'avc' } };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return cfg;
      } catch {
        /* tenta o próximo */
      }
    }
  }
  return null;
}

async function pickAudioConfig(): Promise<{ cfg: AudioEncoderConfig; muxCodec: 'aac' | 'opus' } | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  const tries: [string, 'aac' | 'opus'][] = [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ];
  for (const [codec, muxCodec] of tries) {
    const cfg: AudioEncoderConfig = { codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192_000 };
    try {
      const r = await AudioEncoder.isConfigSupported(cfg);
      if (r.supported) return { cfg, muxCodec };
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

/** Mixagem offline: mesmo plano de áudio do player e da exportação via FFmpeg. */
async function mixAudio(project: Project, media: Record<string, MediaAsset>, duration: number): Promise<AudioBuffer | null> {
  const plan = buildAudioPlan(project);
  if (!plan.length) return null;
  const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const decoded = new Map<string, AudioBuffer | null>();
  for (const seg of plan) {
    if (!decoded.has(seg.mediaId)) {
      const m = media[seg.mediaId];
      let buf: AudioBuffer | null = null;
      if (m) {
        try {
          const data = await (await fetch(m.url)).arrayBuffer();
          buf = await ctx.decodeAudioData(data);
        } catch {
          buf = null; // vídeo sem trilha de áudio decodificável
        }
      }
      decoded.set(seg.mediaId, buf);
    }
    const buf = decoded.get(seg.mediaId);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = seg.speed;
    const gain = ctx.createGain();
    const end = seg.start + seg.duration;
    const g = gain.gain;
    g.setValueAtTime(seg.fadeIn > 0 ? 0 : seg.volume, seg.start);
    if (seg.fadeIn > 0) g.linearRampToValueAtTime(seg.volume, seg.start + seg.fadeIn);
    if (seg.fadeOut > 0) {
      g.setValueAtTime(seg.volume, Math.max(seg.start, end - seg.fadeOut));
      g.linearRampToValueAtTime(0, end);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(seg.start, seg.sourceIn, seg.duration * seg.speed);
  }
  return ctx.startRendering();
}

const BITRATE: Record<number, number> = { 16: 12_000_000, 19: 8_000_000, 24: 4_500_000 };

export async function exportWithWebCodecs(
  project: Project,
  media: Record<string, MediaAsset>,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; fileName: string }> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('Este aparelho não tem o codificador de vídeo (WebCodecs). Atualize o Android System WebView/Chrome.');
  }
  onProgress({ phase: 'preparing', frame: 0, total: 0, fps: 0 });
  await Promise.all([ensureFonts(), ensureBrandAssets()]);

  const fps = settings.fps;
  const pixels = settings.width * settings.height;
  const bitrate = Math.round((BITRATE[settings.crf] ?? 8_000_000) * Math.min(1.4, Math.max(0.4, pixels / (1080 * 1920))));
  let width = settings.width;
  let height = settings.height;
  let vcfg = await pickVideoConfig(width, height, fps, bitrate);
  if (!vcfg) {
    // aparelho não codifica nesse tamanho: cai para 720p mantendo a proporção
    const k = 720 / Math.min(width, height);
    width = Math.round((width * k) / 2) * 2;
    height = Math.round((height * k) / 2) * 2;
    vcfg = await pickVideoConfig(width, height, fps, Math.round(bitrate * 0.55));
  }
  if (!vcfg) throw new Error('O codificador H.264 deste aparelho não aceitou o formato do vídeo.');

  const audioBuffer = await mixAudio(project, media, settings.duration);
  const acfg = audioBuffer ? await pickAudioConfig() : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(acfg ? { audio: { codec: acfg.muxCodec, numberOfChannels: 2, sampleRate: SAMPLE_RATE } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encodeError: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encodeError = e instanceof Error ? e : new Error(String(e))),
  });
  venc.configure(vcfg);

  const src = await prepareFrameSource(project, media);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const total = Math.max(1, Math.round(settings.duration * fps));
  const frameUs = 1e6 / fps;
  const t0 = performance.now();

  try {
    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw new DOMException('Exportação cancelada', 'AbortError');
      if (encodeError) throw encodeError;
      const t = i / fps;
      await src.seek(t);
      renderFrame(ctx, project, t, src.sources, { editorHints: false });
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      // controla a fila do codificador para não estourar a memória do aparelho
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      const elapsed = (performance.now() - t0) / 1000;
      onProgress({ phase: 'rendering', frame: i + 1, total, fps: (i + 1) / Math.max(elapsed, 0.001) });
    }
    await venc.flush();
    if (encodeError) throw encodeError;
    onProgress({ phase: 'encoding', frame: total, total, fps: 0 });

    if (audioBuffer && acfg) {
      const aenc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => (encodeError = e instanceof Error ? e : new Error(String(e))),
      });
      aenc.configure(acfg.cfg);
      const L = audioBuffer.getChannelData(0);
      const R = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : L;
      const block = 4096;
      for (let off = 0; off < audioBuffer.length; off += block) {
        const n = Math.min(block, audioBuffer.length - off);
        const planar = new Float32Array(n * 2);
        planar.set(L.subarray(off, off + n), 0);
        planar.set(R.subarray(off, off + n), n);
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: SAMPLE_RATE,
          numberOfFrames: n,
          numberOfChannels: 2,
          timestamp: Math.round((off / SAMPLE_RATE) * 1e6),
          data: planar,
        });
        aenc.encode(data);
        data.close();
        while (aenc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 1));
      }
      await aenc.flush();
      aenc.close();
      if (encodeError) throw encodeError;
    }
    muxer.finalize();
    onProgress({ phase: 'done', frame: total, total, fps: 0 });
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    return { blob, fileName: exportFileName(project.name) };
  } finally {
    if (venc.state !== 'closed') venc.close();
    src.dispose();
  }
}

export const localExporter: Exporter = { exportVideo: exportWithWebCodecs };
