import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de interface. Sobem backend e front-end automaticamente se ainda
 * não estiverem rodando (reutiliza `npm run dev` aberto).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npx tsx server/index.ts', url: 'http://127.0.0.1:5174/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx vite', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
