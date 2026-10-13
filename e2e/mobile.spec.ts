import { expect, test } from '@playwright/test';
import { uniqueTestVideo } from './fixtures';

test('layout mobile: palco, timeline, barra inferior e toque', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-reel').click();
  await expect(page.getByTestId('stage')).toBeVisible();
  // a barra de ferramentas fica embaixo e abre painéis como folha
  await page.getByTestId('rail-media').tap();
  await expect(page.getByTestId('panel-media')).toBeVisible();
  const { file, name } = uniqueTestVideo();
  await page.getByTestId('file-input').setInputFiles(file);
  const item = page.getByTestId('media-item').filter({ hasText: name });
  await expect(item).toHaveClass(/ready/, { timeout: 60_000 });
  await item.tap();
  await expect(page.getByTestId('clip-video')).toHaveCount(1);
  await page.getByTestId('rail-text').tap();
  await page.getByTestId('preset-pn-urgente').tap();
  await page.getByTestId('rail-text').tap(); // fecha a folha
  await expect(page.getByTestId('clip-text')).toHaveCount(1);
  const stage = (await page.getByTestId('stage').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(stage.width).toBeLessThanOrEqual(vp.width);
  expect(stage.height).toBeGreaterThan(200);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
});
