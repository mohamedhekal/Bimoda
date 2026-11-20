import { expect, test, type Page } from '@playwright/test'

// Seeds "tour already seen" only when nothing is stored yet, so reloads keep the state the test created.
const skipTour = (page: Page) =>
  page.addInitScript(() => {
    if (!localStorage.getItem('bimoda.state.v1')) localStorage.setItem('bimoda.state.v1', JSON.stringify({ settings: { toured: true } }))
  })
// Scope assertions to one card: the same facts now also appear in the decision trace.
const card = (page: Page, title: string) => page.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) })
const openCase = (page: Page, order: string) =>
  page
    .getByRole('button', { name: new RegExp(order) })
    .first()
    .click()
const propose = async (page: Page, action: string) => {
  await page.getByLabel('Action to evaluate').selectOption(action)
  await page.getByRole('button', { name: 'Propose', exact: true }).click()
}

test.describe('demo flows', () => {
  test.beforeEach(({ page }) => skipTour(page))

  test('landing page leads into the demo without any sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your commerce operations')
    await page
      .getByRole('link', { name: /Try Bimoda/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible()
  })

  test('sidebar navigation reaches every page', async ({ page }) => {
    await page.goto('/app')
    const nav = page.getByRole('navigation', { name: 'Primary', exact: true })
    for (const [link, heading] of [
      ['Workspace', null],
      ['Hybrid AI Lab', 'Hybrid AI Lab'],
      ['Policy Studio', 'Policy Studio'],
      ['Audit & Runs', 'Audit & AI runs'],
      ['Mission Control', 'Mission Control'],
    ] as const) {
      await nav.getByRole('link', { name: link }).click()
      if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      else await expect(page.getByRole('list', { name: 'Operations queue' })).toBeVisible()
    }
  })

  test('selecting a case shows order details and the pricing inconsistency (scenario A)', async ({ page }) => {
    await page.goto('/app/workspace')
    await openCase(page, 'ORD-1001')
    await expect(card(page, 'Order').getByText('free shipping applied')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Confirmation message stated $148.00' })).toContainText('$162.00')
  })

  test('policy engine blocks an edit on a shipped order and logs it (scenario B)', async ({ page }) => {
    await page.goto('/app/workspace')
    await openCase(page, 'ORD-1002')
    await propose(page, 'CHANGE_VARIANT')
    await expect(card(page, 'Policy check').getByText('DENY', { exact: true })).toBeVisible()
    await expect(page.getByText(/R-001 · policy v1/)).toBeVisible()
    await expect(page.getByText(/request_after_lock|Customer change request after fulfillment started/)).toBeVisible()
    await page.getByRole('link', { name: 'Audit & Runs' }).click()
    await expect(page.getByText('policy_blocked:R-001:CHANGE_VARIANT')).toBeVisible()
  })

  test('return without warehouse receipt cannot restock (scenario D)', async ({ page }) => {
    await page.goto('/app/workspace')
    await openCase(page, 'ORD-1004')
    await expect(page.getByText(/do not restock or settle automatically/)).toBeVisible()
    await propose(page, 'RESTORE_INVENTORY')
    await expect(card(page, 'Policy check').getByText('DENY', { exact: true })).toBeVisible()
  })

  test('incomplete address needs more information (scenario C)', async ({ page }) => {
    await page.goto('/app/workspace')
    await openCase(page, 'ORD-1003')
    await propose(page, 'CHANGE_ADDRESS')
    await expect(card(page, 'Policy check').getByText('NEED MORE INFORMATION')).toBeVisible()
  })

  test('approval workflow respects roles and ends in a simulated execution', async ({ page }) => {
    await page.goto('/app/workspace')
    await openCase(page, 'ORD-1001')
    await propose(page, 'REFUND')
    const approve = page.getByRole('button', { name: 'Approve', exact: true })
    await expect(approve).toBeDisabled()
    await expect(page.getByText('Needs manager or admin')).toBeVisible()
    await page.getByLabel('Role').selectOption('manager')
    await expect(approve).toBeEnabled()
    await approve.click()
    await page.getByRole('button', { name: 'Execute (simulated)' }).click()
    await expect(page.getByText('Simulated in demo: no payment')).toBeVisible()
    await page.getByRole('link', { name: 'Audit & Runs' }).click()
    await expect(page.getByRole('cell', { name: 'executed' })).toBeVisible()
    await expect(page.getByText('executed(simulated):REFUND')).toBeVisible()
  })

  test('queue filters narrow the list and show an empty state', async ({ page }) => {
    await page.goto('/app/workspace')
    await expect(page.getByRole('status').filter({ hasText: 'of 15 cases' })).toContainText('15 of 15')
    await page.getByLabel('Risk / priority').selectOption('critical')
    await expect(page.getByRole('status').filter({ hasText: 'of 15 cases' })).toContainText('2 of 15')
    await page.getByLabel('Type').selectOption('return')
    await expect(page.getByText('No cases match these filters.')).toBeVisible()
  })

  test('Policy Studio rejects unsafe configurations and only admins can edit', async ({ page }) => {
    await page.goto('/app/policies')
    await expect(page.getByRole('button', { name: 'Validate and save' })).toBeDisabled()
    await page.getByLabel('Role').selectOption('admin')
    await card(page, 'Order and refund rules').getByLabel('Require confirmed warehouse receipt').uncheck()
    await page.getByRole('button', { name: 'Validate and save' }).click()
    await expect(page.getByRole('alert')).toContainText('requireWarehouseReceipt cannot be disabled')
    await page.getByRole('button', { name: 'Load defaults' }).click()
    await page.getByRole('button', { name: 'Validate and save' }).click()
    await expect(card(page, 'Order and refund rules').getByRole('status')).toContainText('Saved as v2')
  })

  test('Local Only mode blocks the cloud test and shows an honest state', async ({ page }) => {
    const aiRequests: string[] = []
    page.on('request', (r) => /firebasevertexai|generativelanguage/.test(r.url()) && aiRequests.push(r.url()))
    await page.goto('/app/lab')
    await page.getByRole('radio', { name: 'Local only' }).click()
    await page.getByRole('button', { name: 'Run B' }).click()
    await expect(page.getByText('blocked_privacy')).toBeVisible()
    await expect(page.getByText('Local Only mode forbids cloud inference.')).toBeVisible()
    await expect(page.getByText('Processed in cloud')).toHaveCount(0)
    expect(aiRequests).toHaveLength(0)
  })

  test('offline banner explains what still works', async ({ page, context }) => {
    await page.goto('/app')
    await context.setOffline(true)
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toContainText('Cached demo data stays available')
    await context.setOffline(false)
    await expect(page.getByText('You are offline')).toHaveCount(0)
  })

  test('theme and privacy settings persist across reloads', async ({ page }) => {
    await page.goto('/app')
    await page.getByRole('radio', { name: 'Cloud' }).click()
    await page.getByRole('button', { name: /Switch to light theme/ }).click()
    await page.reload()
    await expect(page.getByRole('radio', { name: 'Cloud' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})

test.describe('keyboard and onboarding', () => {
  test('command palette opens with Ctrl+K, filters, navigates and closes with Escape', async ({ page }) => {
    await skipTour(page)
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible()
    await page.keyboard.press('Control+k')
    const box = page.getByRole('combobox', { name: 'Type a command' })
    await expect(box).toBeFocused()
    await box.fill('policy')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/policies$/)
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  })

  test('first visit offers the demo tour, which can be walked through and is not shown again', async ({ page }) => {
    await page.goto('/app')
    const tour = page.getByRole('dialog', { name: 'Demo tour' })
    await expect(tour).toContainText('1 of 6')
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/\/app\/workspace$/)
    await expect(tour).toContainText('2 of 6')
    await tour.getByRole('button', { name: 'Skip' }).click()
    await expect(tour).toHaveCount(0)
    await page.reload()
    await page.waitForTimeout(1200)
    await expect(page.getByRole('dialog', { name: 'Demo tour' })).toHaveCount(0)
  })
})

const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920]
for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px on any page`, async ({ page }) => {
    await skipTour(page)
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/app', '/app/workspace', '/app/lab', '/app/trust', '/app/policies', '/app/audit']) {
      await page.goto(route)
      await expect(page.locator('h1').first()).toBeAttached()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${route} @${width}`).toBeLessThanOrEqual(1)
    }
  })
}

test('mobile layout uses bottom navigation instead of the sidebar', async ({ page }) => {
  await skipTour(page)
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/app')
  await expect(page.getByRole('navigation', { name: 'Mobile primary' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeHidden()
})

test.describe('Arabic (beta) and RTL', () => {
  test('the language button switches the interface to Arabic with RTL and back', async ({ page }) => {
    await skipTour(page)
    await page.goto('/app')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await page.getByRole('button', { name: 'Language' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.getByRole('heading', { name: 'مركز التحكم', level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'مساحة العمل' })).toBeVisible()
    await page.reload() // persisted
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await page.getByRole('button', { name: 'اللغة' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  })

  for (const width of [320, 390, 1440]) {
    test(`RTL has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('bimoda.state.v1', JSON.stringify({ settings: { toured: true, lang: 'ar' } })))
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['/', '/app', '/app/workspace', '/app/lab', '/app/trust', '/app/policies', '/app/audit']) {
        await page.goto(route)
        await expect(page.locator('h1').first()).toBeAttached()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${route} @${width}`).toBeLessThanOrEqual(1)
      }
    })
  }

  test('AI/policy explanations stay in English and the policy decision still works in Arabic', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bimoda.state.v1', JSON.stringify({ settings: { toured: true, lang: 'ar' } })))
    await page.goto('/app/workspace')
    await page.getByRole('button', { name: /ORD-1002/ }).click()
    await page.getByLabel('Action to evaluate').selectOption('CHANGE_VARIANT')
    await page.getByRole('button', { name: 'اقترح' }).click()
    await expect(card(page, 'فحص السياسة').getByText('DENY', { exact: true })).toBeVisible()
  })
})

test('sign-in dialog is a centered modal covering the viewport (not trapped inside the header)', async ({ page }) => {
  await skipTour(page)
  await page.goto('/app')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign in' })
  await expect(dialog).toBeVisible()
  const vp = page.viewportSize()!
  const box = (await dialog.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(20) // horizontally centered
  expect(box.y + box.height / 2).toBeGreaterThan(vp.height * 0.25) // vertically centered, not stuck at the top
  const overlay = await dialog.evaluate((el) => el.parentElement!.getBoundingClientRect().toJSON())
  expect(overlay.width).toBeGreaterThanOrEqual(vp.width - 1)
  expect(overlay.height).toBeGreaterThanOrEqual(vp.height - 1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
