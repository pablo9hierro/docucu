import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ffmpegPaths } from '../server/config';

// Projeto longo com vários trechos de vídeo (como o do usuário), no Edge real.
test.use({ channel: 'msedge', headless: true, launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });

function clip(i: number) {
  const dir = path.resolve('e2e/.fixtures');
  mkdirSync(dir, { recursive: true });
  const name = `trecho${i}-${Date.now().toString(36)}`;
  const file = path.join(dir, `${name}.mp4`);
  execFileSync(ffmpegPaths().ffmpeg, [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', `testsrc2=size=1080x1920:rate=30:duration=12`,
    '-f', 'lavfi', '-i', `sine=frequency=${200 + i * 100}:duration=12`,
    '-c:v', 'libx264', '-profile:v', 'high', '-g', '30', '-bf', '3', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
  ]);
  return { file, name };
}

for (const mode of ['local', 'servidor'] as const) {
  test(`vários trechos (~72 s) exportam até o fim no Edge real (${mode})`, async ({ page }) => {
    test.setTimeout(600_000);
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(mode === 'local' ? '/?local=1' : '/');
    await page.getByTestId('new-reel').click();
    const clips = [clip(1), clip(2), clip(3)];
    await page.getByTestId('file-input').setInputFiles(clips.map((c) => c.file));
    for (const c of clips) await expect(page.getByTestId('media-item').filter({ hasText: c.name })).toHaveClass(/ready/, { timeout: 120_000 });
    const ed = (t: number) => page.evaluate((tt) => (window as unknown as { __editor: { getState(): { setTime(x: number): void } } }).__editor.getState().setTime(tt), t);
    for (let k = 0; k < 6; k++) {
      await ed(k * 12);
      await page.getByTestId('media-item').filter({ hasText: clips[k % 3]!.name }).click();
    }
    await page.getByTestId('rail-text').click();
    await ed(0);
    await page.getByTestId('frame-editorial').click();
    await page.getByTestId('preset-pn-urgente').click();
    await page.getByTestId('open-export').click();
    const dl = page.waitForEvent('download', { timeout: 540_000 });
    await page.getByTestId('start-export').click();
    const timer = setInterval(async () => {
      const txt = await page.locator('.modal').innerText().catch(() => '');
      console.log('[progresso]', txt.replace(/\s+/g, ' ').slice(0, 120));
    }, 20_000);
    try {
      const d = await dl;
      console.log('BAIXOU', d.suggestedFilename());
    } finally {
      clearInterval(timer);
    }
  });
}
