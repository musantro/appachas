import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  preserveOutput: 'never',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ...devices['Pixel 7'],
    browserName: 'chromium',
    locale: 'es-ES',
    timezoneId: 'UTC',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : [
    {
      command: 'uv run --project backend uvicorn appachas.main:app --host 127.0.0.1 --port 8000 --no-access-log',
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
