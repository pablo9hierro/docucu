import { expect, test } from '@playwright/test';
import { probe, uniqueTestVideo } from './fixtures';

/**
 * Recursos novos no modo local (o mesmo do app Android): inserir sem duplicar,
 * velocidade, corte com alças, disfarce de voz, encerramento, cancelar e
 * exportar com a área segura ligada (ela nunca entra no vídeo).
 */
test('velocidade, corte, voz, encerramento, cancelar e exportar', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?local=1');
  await page.getByTestId('new-reel').click();
  await expect(page.getByTestId('stage')).toBeVisible();

  const { file, name } = uniqueTestVideo();
  await page.getByTestId('file-input').setInputFiles(file);
  const item = page.getByTestId('media-item').filter({ hasText: name });
  await expect(item).toHaveClass(/ready/, { timeout: 60_000 });

  // toque duplo rápido não duplica o item
  await item.click();
  await item.click();
  await expect(page.getByTestId('clip-video')).toHaveCount(1);

  // velocidade (Ajustes)
  await page.getByTestId('clip-video').click();
  await page.getByTestId('speed-2').click();
  await expect(page.getByTestId('speed-2')).toHaveClass(/primary/);
  await page.getByTestId('speed-1').click();

  // corte: alça esquerda puxada para dentro
  await page.getByTestId('crop-toggle').click();
  const box = page.locator('.gizmo-crop');
  await expect(box).toBeVisible();
  const before = (await box.boundingBox())!;
  const h = (await page.locator('[data-handle="crop-l"]').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  const after = (await box.boundingBox())!;
  expect(after.width).toBeLessThan(before.width - 20);
  await expect(page.locator('.crop-full')).toBeVisible();
  await page.getByTestId('crop-toggle').click();
  await expect(box).toHaveCount(0);

  // disfarce de voz na aba Desfoque
  await page.getByTestId('rail-blur').click();
  await page.getByTestId('voice-high').click();
  await expect(page.getByTestId('voice-high')).toHaveClass(/primary/);

  // encerramento com som
  await page.getByTestId('rail-text').click();
  await page.getByTestId('add-outro').click();
  await expect(page.getByTestId('clip-text')).toHaveCount(1);
  await expect(page.getByTestId('clip-audio')).toHaveCount(1, { timeout: 45_000 });

  // área segura ligada no editor
  await page.getByRole('button', { name: 'Área segura' }).click();
  await expect(page.locator('.safe-zones')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/features-editor.png' });

  // cancelar volta a tela na hora
  await page.getByTestId('open-export').click();
  await page.getByTestId('start-export').click();
  await page.getByTestId('cancel-export').click();
  await expect(page.getByTestId('start-export')).toBeVisible({ timeout: 1500 });

  // e exportar de novo funciona
  const dl = page.waitForEvent('download', { timeout: 240_000 });
  await page.getByTestId('start-export').click();
  const download = await dl;
  await expect(page.getByTestId('export-done')).toBeVisible({ timeout: 30_000 });
  const saved = `test-results/features-${download.suggestedFilename()}`;
  await download.saveAs(saved);
  const info = probe(saved);
  expect(info.streams).toContain('video');
  expect(info.streams).toContain('audio');
  expect(info.duration).toBeGreaterThan(9); // 6 s de vídeo + 3,5 s de encerramento
  expect(errors).toEqual([]);
});
