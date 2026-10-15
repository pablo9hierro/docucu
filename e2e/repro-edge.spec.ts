import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ffmpegPaths } from '../server/config';

// Reprodução do travamento no fim da exportação usando o Edge REAL (decodificação por hardware).
test.use({ channel: 'msedge', headless: true, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=VaapiVideoDecoder'] } });

function phoneVideo() {
  const dir = path.resolve('e2e/.fixtures');
  mkdirSync(dir, { recursive: true });
  const name = `vertical-${Date.now().toString(36)}`;
  const file = path.join(dir, `${name}.mp4`);
  if (!existsSync(file)) {
    execFileSync(ffmpegPaths().ffmpeg, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=30',
      '-f', 'lavfi', '-i', 'sine=frequency=300:duration=30',
      '-c:v', 'libx264', '-profile:v', 'high', '-g', '30', '-bf', '3', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
    ]);
  }
  return { file, name };
}

for (const mode of ['local', 'servidor'] as const) {
  test(`exportação até o fim no Edge real (${mode})`, async ({ page }) => {
    test.setTimeout(300_000);
    page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('PN_')) && console.log('[console]', m.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(mode === 'local' ? '/?local=1' : '/');
    await page.getByTestId('new-reel').click();
    const { file, name } = phoneVideo();
    await page.getByTestId('file-input').setInputFiles(file);
    const item = page.getByTestId('media-item').filter({ hasText: name });
    await expect(item).toHaveClass(/ready/, { timeout: 120_000 });
    await item.click();
    await page.getByTestId('rail-text').click();
    await page.getByTestId('frame-topo').click();
    await page.getByTestId('preset-pn-faixa').click();
    await page.getByTestId('open-export').click();
    const dl = page.waitForEvent('download', { timeout: 240_000 });
    await page.getByTestId('start-export').click();
    const timer = setInterval(async () => {
      const txt = await page.locator('.export-progress').innerText().catch(() => '');
      console.log('[progresso]', txt.replace(/\s+/g, ' ').slice(0, 90));
    }, 10_000);
    try {
      const d = await dl;
      console.log('BAIXOU', d.suggestedFilename());
    } finally {
      clearInterval(timer);
    }
  });
}
