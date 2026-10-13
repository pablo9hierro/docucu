import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ffmpegPaths } from '../server/config';

const DIR = path.resolve('e2e/.fixtures');

/** Gera (uma vez) um vídeo de teste 16:9 com tom de 440 Hz. */
export function testVideo(): string {
  mkdirSync(DIR, { recursive: true });
  const out = path.join(DIR, 'teste-16x9.mp4');
  if (!existsSync(out)) {
    execFileSync(ffmpegPaths().ffmpeg, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=6',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out,
    ]);
  }
  return out;
}

/** Cópia com nome único, para localizar o item recém-importado na biblioteca. */
export function uniqueTestVideo(): { file: string; name: string } {
  const name = `clip-${Date.now().toString(36)}`;
  const file = path.join(DIR, `${name}.mp4`);
  copyFileSync(testVideo(), file);
  return { file, name };
}

export function probe(file: string): { duration: number; streams: string[]; width: number; height: number } {
  const out = execFileSync(ffmpegPaths().ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  const j = JSON.parse(out) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[] };
  const v = j.streams.find((s) => s.codec_type === 'video');
  return { duration: Number(j.format.duration), streams: j.streams.map((s) => s.codec_type), width: v?.width ?? 0, height: v?.height ?? 0 };
}
