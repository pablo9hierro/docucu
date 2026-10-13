import { test } from '@playwright/test';

/** Capturas de referência para revisão visual (não fazem asserções de layout). */
test('tela de projetos', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screens/home.png' });
});

test('painel de manchetes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-reel').click();
  await page.getByTestId('rail-text').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screens/manchetes.png' });
});
