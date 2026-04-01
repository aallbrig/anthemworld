const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.BASE_URL || 'http://localhost:1313';
const isRemote = !baseURL.includes('localhost');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: isRemote ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  ...(!isRemote && {
    webServer: {
      command: 'cd ../../hugo/site && hugo server',
      url: 'http://localhost:1313',
      reuseExistingServer: !process.env.CI,
    },
  }),
});
