import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e-results.json' }]],
  use: { trace: 'retain-on-failure' },
});
