// Verifica dependências do ambiente antes de iniciar.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => console.log(`  ✗ ${m}`);
let problems = 0;

console.log('Primeiras Notícias Studio — verificação do ambiente');

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > 22 || (maj === 22 && min >= 13)) ok(`Node.js ${process.versions.node}`);
else {
  fail(`Node.js ${process.versions.node} — é necessário 22.13 ou superior (módulo node:sqlite).`);
  problems++;
}

function find(bin) {
  const env = process.env[bin === 'ffmpeg' ? 'PN_FFMPEG' : 'PN_FFPROBE'];
  if (env && existsSync(env)) return env;
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).find((l) => l.trim());
    if (first) return first.trim();
  } catch {}
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const links = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', `${bin}.exe`);
    if (existsSync(links)) return links;
    const pkgs = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(pkgs)) {
      for (const d of readdirSync(pkgs).filter((n) => n.toLowerCase().includes('ffmpeg'))) {
        for (const sub of readdirSync(path.join(pkgs, d))) {
          const c = path.join(pkgs, d, sub, 'bin', `${bin}.exe`);
          if (existsSync(c)) return c;
        }
      }
    }
  }
  return null;
}

for (const bin of ['ffmpeg', 'ffprobe']) {
  const p = find(bin);
  if (p) {
    try {
      const v = execFileSync(p, ['-version'], { encoding: 'utf8' }).split('\n')[0];
      ok(v.slice(0, 70));
    } catch {
      fail(`${bin} encontrado em ${p}, mas não executou.`);
      problems++;
    }
  } else {
    fail(`${bin} não encontrado. Windows: winget install Gyan.FFmpeg · macOS: brew install ffmpeg · Linux: sudo apt install ffmpeg`);
    problems++;
  }
}

if (problems) {
  console.log(`\n${problems} problema(s) encontrado(s). Corrija e rode novamente.`);
  process.exit(1);
}
console.log('Tudo certo.\n');
