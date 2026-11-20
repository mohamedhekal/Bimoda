import { expect, test } from '@playwright/test'

test('app shell and demo data keep working offline after the first visit', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bimoda.state.v1')) localStorage.setItem('bimoda.state.v1', JSON.stringify({ settings: { toured: true } }))
  })
  await page.goto('/app/workspace')
  await expect(page.getByRole('list', { name: 'Operations queue' })).toBeVisible()

  // wait for the worker to control the page and for the hashed assets to be cached
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('bimoda-shell-v2')).keys()).filter((r) => r.url.includes('/assets/')).length), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('list', { name: 'Operations queue' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible()
  await page.getByRole('button', { name: /ORD-1002/ }).click()
  await expect(page.getByText('SwiftPost')).toBeVisible()

  // cloud AI must refuse honestly while offline (never fabricate output)
  await page.getByRole('link', { name: 'Hybrid AI Lab' }).first().click()
  await page.getByRole('button', { name: 'Run B' }).click()
  await expect(page.getByText('Device is offline and this request is cloud-only.')).toBeVisible()
})

test('manifest is served and the worker never intercepts cross-origin Firebase calls', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  expect((await res.json()).short_name).toBe('Bimoda')
  const sw = await (await request.get('/sw.js')).text()
  expect(sw).toContain('url.origin !== self.location.origin) return')
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
})
