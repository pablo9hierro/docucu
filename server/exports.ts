/**
 * Exportação. O navegador renderiza cada quadro com o MESMO renderizador do
 * preview e envia JPEGs em lotes; aqui eles entram no FFmpeg (image2pipe → H.264).
 * Depois o áudio é mixado a partir dos arquivos originais com o mesmo plano
 * usado pelo player (src/core/audio.ts).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Project } from '../src/core/model';
import { buildAudioPlan, buildFfmpegAudioGraph } from '../src/core/audio';
import { uid } from '../src/core/id';
import { EXPORT_DIR, ffmpegPaths } from './config';
import { getDb, now } from './db';
import { getMediaRow, originalPath } from './media';
import { run } from './ffmpeg';

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** 14 (alta) … 28 (leve) */
  crf: number;
}

interface Job {
  id: string;
  project: Project;
  settings: ExportSettings;
  proc: ChildProcessWithoutNullStreams;
  videoFile: string;
  finalFile: string;
  stderr: string;
  framesReceived: number;
  totalFrames: number;
  exited: Promise<number>;
  cancelled: boolean;
}

const jobs = new Map<string, Job>();

function setStatus(id: string, status: string, fields: { progress?: number; file?: string | null; error?: string | null } = {}) {
  const done = status === 'done' || status === 'error' || status === 'cancelled';
  getDb()
    .prepare(
      'UPDATE exports SET status = ?, progress = COALESCE(?, progress), file = COALESCE(?, file), error = ?, finished_at = ? WHERE id = ?',
    )
    .run(status, fields.progress ?? null, fields.file ?? null, fields.error ?? null, done ? now() : null, id);
}

function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'video'
  );
}

export function startExport(project: Project, settings: ExportSettings): { id: string; totalFrames: number } {
  const id = uid();
  const totalFrames = Math.max(1, Math.round(settings.duration * settings.fps));
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const videoFile = path.join(EXPORT_DIR, `${id}-video.mp4`);
  const finalFile = path.join(EXPORT_DIR, `${slug(project.name)}-${stamp}.mp4`);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const args = [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(settings.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', `scale=${even(settings.width)}:${even(settings.height)}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(settings.crf),
    '-profile:v', 'high', '-r', String(settings.fps), '-movflags', '+faststart',
    videoFile,
  ];
  const proc = spawn(ffmpegPaths().ffmpeg, args, { windowsHide: true });
  const job: Job = {
    id,
    project,
    settings,
    proc,
    videoFile,
    finalFile,
    stderr: '',
    framesReceived: 0,
    totalFrames,
    cancelled: false,
    exited: new Promise((resolve) => proc.on('close', (code) => resolve(code ?? -1))),
  };
  proc.stderr.on('data', (d: Buffer) => {
    job.stderr = (job.stderr + d.toString()).slice(-20_000);
  });
  proc.stdin.on('error', () => {
    /* tratado no fechamento do processo */
  });
  jobs.set(id, job);
  getDb()
    .prepare('INSERT INTO exports (id, project_id, status, progress, settings, created_at) VALUES (?, ?, ?, 0, ?, ?)')
    .run(id, project.id, 'rendering', JSON.stringify(settings), now());
  return { id, totalFrames };
}

/** Escreve um lote de JPEGs concatenados no stdin do FFmpeg, respeitando backpressure. */
export async function pushFrames(id: string, data: Buffer, count: number): Promise<void> {
  const job = jobs.get(id);
  if (!job) throw new Error('Exportação não encontrada.');
  if (job.proc.exitCode !== null) throw new Error(`FFmpeg encerrou: ${job.stderr.slice(-500)}`);
  await new Promise<void>((resolve, reject) => {
    const ok = job.proc.stdin.write(data, (err) => (err ? reject(err) : undefined));
    if (ok) resolve();
    else job.proc.stdin.once('drain', () => resolve());
  });
  job.framesReceived += count;
  setStatus(id, 'rendering', { progress: Math.min(0.9, (job.framesReceived / job.totalFrames) * 0.9) });
}

export async function finishExport(id: string): Promise<string> {
  const job = jobs.get(id);
  if (!job) throw new Error('Exportação não encontrada.');
  job.proc.stdin.end();
  const code = await job.exited;
  if (code !== 0) {
    setStatus(id, 'error', { error: job.stderr.slice(-800) });
    jobs.delete(id);
    throw new Error(`Falha na codificação do vídeo: ${job.stderr.slice(-400)}`);
  }
  setStatus(id, 'mixing', { progress: 0.92 });
  try {
    await muxAudio(job);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(id, 'error', { error: msg });
    jobs.delete(id);
    throw e;
  } finally {
    if (existsSync(job.videoFile)) unlinkSync(job.videoFile);
  }
  setStatus(id, 'done', { progress: 1, file: job.finalFile });
  jobs.delete(id);
  return job.finalFile;
}

async function muxAudio(job: Job) {
  const plan = buildAudioPlan(job.project);
  const inputs: string[] = ['-i', job.videoFile];
  const index = new Map<string, number>();
  for (const seg of plan) {
    if (index.has(seg.mediaId)) continue;
    const row = getMediaRow(seg.mediaId);
    if (!row) continue;
    index.set(seg.mediaId, index.size + 1);
    inputs.push('-i', originalPath(row));
  }
  const graph = buildFfmpegAudioGraph(plan, index, job.settings.duration);
  const args = ['-y', '-v', 'error', ...inputs];
  if (graph) {
    args.push('-filter_complex', graph.filter, '-map', '0:v:0', '-map', graph.output);
  } else {
    args.push('-f', 'lavfi', '-t', job.settings.duration.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    args.push('-map', '0:v:0', '-map', `${index.size + 1}:a:0`);
  }
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', job.finalFile);
  const r = await run('ffmpeg', args);
  if (r.code !== 0) throw new Error(`Falha na mixagem de áudio: ${r.stderr.split('\n').slice(-6).join('\n')}`);
}

export function cancelExport(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.cancelled = true;
  job.proc.kill('SIGKILL');
  jobs.delete(id);
  setStatus(id, 'cancelled');
  setTimeout(() => {
    for (const f of [job.videoFile]) if (existsSync(f)) unlinkSync(f);
  }, 500);
}

export interface ExportRow {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  file: string | null;
  error: string | null;
  settings: string;
  created_at: string;
  finished_at: string | null;
}

export function getExport(id: string): ExportRow | undefined {
  return getDb().prepare('SELECT * FROM exports WHERE id = ?').get(id) as unknown as ExportRow | undefined;
}

export function listExports(projectId?: string): ExportRow[] {
  const db = getDb();
  return (
    projectId
      ? db.prepare('SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(projectId)
      : db.prepare('SELECT * FROM exports ORDER BY created_at DESC LIMIT 50').all()
  ) as unknown as ExportRow[];
}
