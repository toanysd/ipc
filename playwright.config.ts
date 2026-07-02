import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

try {
  const pidFile = path.join(__dirname, '.next', 'dev', 'next-dev.pid');
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    if (pid) {
      require('child_process').execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    }
    fs.unlinkSync(pidFile);
  }
} catch(e) {}

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3006',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e/mock-onvif-server.js',
      port: 8085,
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
    {
      command: 'npm run start -- -p 3006',
      url: 'http://127.0.0.1:3006',
      reuseExistingServer: true,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        STATIC_ONVIF_CAMERAS: 'http://127.0.0.1:8085/onvif/device_service',
        MOCK_STREAM_URL: 'http://127.0.0.1:8085/stream.mjpg'
      }
    }
  ],
});
