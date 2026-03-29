import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './claude/global-setup.ts',
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'node server.js',
    port: 3000,
    reuseExistingServer: true,
  },
});
