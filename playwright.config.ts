import { defineConfig } from '@playwright/test'

// Uses the Chrome already installed on the machine (channel "chrome"), so no browser download is needed.
// Tests never call the AI backends: they only exercise deterministic UI, policy and privacy-gate behavior.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', viewport: { width: 1440, height: 900 } },
})
