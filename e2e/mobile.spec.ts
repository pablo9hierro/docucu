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
  // barra de rolagem da timeline grande o bastante para o dedo
  const sb = (await page.getByTestId('tl-scrollbar').boundingBox())!;
  expect(sb.height).toBeGreaterThanOrEqual(28);
  // segurar o dedo num botão mostra o nome dele, sem acionar
  const btn = page.getByTestId('fullscreen');
  const bb = (await btn.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await page.waitForTimeout(700);
  await expect(page.getByTestId('tooltip')).toHaveText(/tela cheia/i);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  await expect(page.locator('.stage-area.full')).toHaveCount(0);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
});
