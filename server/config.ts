import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.PN_DATA_DIR ?? path.join(ROOT, 'data'));
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const DERIVED_DIR = path.join(DATA_DIR, 'derived');
export const EXPORT_DIR = path.join(DATA_DIR, 'exports');
export const BRAND_DIR = path.resolve(process.env.PN_BRAND_DIR ?? path.join(ROOT, 'brand'));
export const DB_FILE = path.join(DATA_DIR, 'studio.sqlite');
export const API_PORT = Number(process.env.PN_API_PORT ?? 5174);

export function ensureDirs() {
  for (const d of [DATA_DIR, MEDIA_DIR, DERIVED_DIR, EXPORT_DIR, BRAND_DIR]) mkdirSync(d, { recursive: true });
}

/**
 * Localiza um executável do FFmpeg: variável de ambiente, PATH e, no Windows,
 * a pasta de pacotes do winget (o PATH de terminais antigos não é atualizado).
 */
function locate(bin: 'ffmpeg' | 'ffprobe'): string | null {
  const env = process.env[bin === 'ffmpeg' ? 'PN_FFMPEG' : 'PN_FFPROBE'];
  if (env && existsSync(env)) return env;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(cmd, [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).find((l) => l.trim());
    if (first) return first.trim();
  } catch {
    /* não está no PATH */
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const exe = `${bin}.exe`;
    const links = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', exe);
    if (existsSync(links)) return links;
    const pkgs = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(pkgs)) {
      for (const d of readdirSync(pkgs).filter((n) => n.toLowerCase().includes('ffmpeg'))) {
        const base = path.join(pkgs, d);
        for (const sub of readdirSync(base)) {
          const cand = path.join(base, sub, 'bin', exe);
          if (existsSync(cand)) return cand;
        }
      }
    }
  }
  return null;
}

let cached: { ffmpeg: string; ffprobe: string } | null = null;

export function ffmpegPaths(): { ffmpeg: string; ffprobe: string } {
  if (cached) return cached;
  const ffmpeg = locate('ffmpeg');
  const ffprobe = locate('ffprobe');
  if (!ffmpeg || !ffprobe) {
    throw new Error(
      'FFmpeg/FFprobe não encontrados. Instale com "winget install Gyan.FFmpeg" (Windows), ' +
        '"brew install ffmpeg" (macOS) ou "sudo apt install ffmpeg" (Linux), ou defina PN_FFMPEG e PN_FFPROBE.',
    );
  }
  cached = { ffmpeg, ffprobe };
  return cached;
}
