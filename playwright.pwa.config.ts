import { defineConfig } from '@playwright/test'

// Runs against the production build (`vite preview`), because the service worker is registered in production builds only.
export default defineConfig({
  testDir: 'e2e-pwa',
  timeout: 40_000,
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: false },
  use: { baseURL: 'http://localhost:4173', channel: 'chrome' },
})
