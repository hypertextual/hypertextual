import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  testDir: '.',
  testMatch: ['htmd-editor.spec.ts'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/htmd-ts/playwright-report' }]],
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:1422',
    viewport: { width: 1120, height: 640 },
    trace: 'retain-on-failure',
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command:
      'bunx --no-install vite build --config e2e/htmd-ts/vite.config.ts && bunx --no-install vite preview --config e2e/htmd-ts/vite.config.ts',
    url: 'http://127.0.0.1:1422/e2e/htmd-ts/fixture.html',
    reuseExistingServer: false,
  },
})
