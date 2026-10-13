import { expect, test, type Page } from '@playwright/test';
import { probe, uniqueTestVideo } from './fixtures';

type Clip = { id: string; type: string; start: number; duration: number; transform?: { x: number; y: number; width: number; height: number } };
type Snapshot = { clips: Clip[]; selection: string[]; time: number };

async function state(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const s = (window as unknown as { __editor: { getState(): { project: { clips: Clip[] }; selection: string[]; time: number } } }).__editor.getState();
    return { clips: s.project.clips, selection: s.selection, time: s.time };
  });
}

async function newReelWithVideo(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-reel').click();
  await expect(page.getByTestId('stage')).toBeVisible();
  const { file, name } = uniqueTestVideo();
  await page.getByTestId('file-input').setInputFiles(file);
  const item = page.getByTestId('media-item').filter({ hasText: name });
  await expect(item).toHaveClass(/ready/, { timeout: 60_000 });
  await item.click();
  await expect(page.getByTestId('clip-video')).toHaveCount(1);
}

test('fluxo completo: importar, manchete, manipular, desfocar, cortar e exportar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await newReelWithVideo(page);
  let s = await state(page);
  expect(s.clips[0]!.duration).toBeCloseTo(6, 0);

  // manchete
  await page.getByTestId('rail-text').click();
  await page.getByTestId('preset-pn-faixa').click();
  await expect(page.getByTestId('clip-text')).toHaveCount(1);
  s = await state(page);
  const text = s.clips.find((c) => c.type === 'text')!;
  expect(s.selection).toEqual([text.id]);

  // arrastar a manchete no canvas (manipulação direta)
  await page.evaluate(() => (window as unknown as { __editor: { getState(): { setTime(t: number): void } } }).__editor.getState().setTime(2));
  const stage = page.getByTestId('stage-overlay');
  const box = (await stage.boundingBox())!;
  const scale = box.width / 1080;
  const cx = box.x + text.transform!.x * scale;
  const cy = box.y + text.transform!.y * scale;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 60, { steps: 8 });
  await page.mouse.up();
  s = await state(page);
  const moved = s.clips.find((c) => c.id === text.id)!;
  expect(moved.transform!.y).toBeLessThan(text.transform!.y - 40);

  // redimensionar pela alça lateral: muda só a largura
  const handle = page.locator('[data-handle="e"]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 80, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  s = await state(page);
  const resized = s.clips.find((c) => c.id === text.id)!;
  expect(resized.transform!.width).toBeLessThan(moved.transform!.width - 50);
  expect(resized.transform!.height).toBeCloseTo(moved.transform!.height, 0);

  // desfazer volta a largura
  await page.keyboard.press('Control+z');
  s = await state(page);
  expect(s.clips.find((c) => c.id === text.id)!.transform!.width).toBeCloseTo(moved.transform!.width, 0);

  // desfoque desenhado no canvas
  await page.getByTestId('rail-blur').click();
  await page.getByTestId('blur-rect').click();
  await page.mouse.move(box.x + 60, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 300, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('clip-blur')).toHaveCount(1);

  // dividir o vídeo na agulha (2 s)
  await page.getByTestId('clip-video').click({ position: { x: 20, y: 20 } });
  await page.evaluate(() => (window as unknown as { __editor: { getState(): { setTime(t: number): void } } }).__editor.getState().setTime(2));
  await page.keyboard.press('s');
  await expect(page.getByTestId('clip-video')).toHaveCount(2);

  // aparar a borda direita do último trecho de vídeo pela timeline
  const last = page.getByTestId('clip-video').nth(1);
  await last.click({ position: { x: 30, y: 20 } });
  const lb = (await last.boundingBox())!;
  await page.mouse.move(lb.x + lb.width - 3, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width - 60, lb.y + lb.height / 2, { steps: 6 });
  await page.mouse.up();
  s = await state(page);
  const vids = s.clips.filter((c) => c.type === 'video').sort((a, b) => a.start - b.start);
  expect(vids[1]!.duration).toBeLessThan(4 - 0.2);

  // salvamento automático
  await expect(page.locator('.save-state')).toHaveText('Salvo', { timeout: 10_000 });

  await page.screenshot({ path: 'test-results/editor-desktop.png' });

  // exportação real com FFmpeg
  await page.getByTestId('open-export').click();
  await page.getByTestId('start-export').click();
  await expect(page.getByTestId('export-done')).toBeVisible({ timeout: 150_000 });
  const exportsList = await page.evaluate(async () => (await fetch('/api/exports')).json());
  const done = (exportsList as { status: string; filePath: string }[]).find((e) => e.status === 'done')!;
  const info = probe(done.filePath);
  expect(info.streams).toContain('video');
  expect(info.streams).toContain('audio');
  expect(info.width).toBe(1080);
  expect(info.height).toBe(1920);
  const total = vids[0]!.duration + vids[1]!.duration;
  expect(Math.abs(info.duration - Math.max(total, s.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0)))).toBeLessThan(0.25);

  expect(errors).toEqual([]);
});

test('modelo de publicação aplica diagramação com logo da marca', async ({ page }) => {
  await newReelWithVideo(page);
  await page.getByTestId('rail-templates').click();
  const select = page.locator('select').first();
  const options = await select.locator('option').allTextContents();
  if (options.length > 1) await select.selectOption({ index: 1 });
  await page.getByTestId('template-reels-faixa').click();
  const s = await state(page);
  expect(s.clips.some((c) => c.type === 'text')).toBe(true);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/template-faixa.png' });
});
