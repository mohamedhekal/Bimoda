import { expect, test, type Page } from '@playwright/test'

const seed = (page: Page, settings: object = {}) =>
  page.addInitScript((st) => {
    if (!localStorage.getItem('bimoda.state.v1')) localStorage.setItem('bimoda.state.v1', JSON.stringify({ settings: { toured: true, ...st } }))
  }, settings)

test.describe('Trust Center', () => {
  test('policy conformance runs deterministically on all 40 scenarios', async ({ page }) => {
    await seed(page)
    await page.goto('/app/trust')
    await expect(page.getByRole('heading', { name: 'Trust Center', level: 1 })).toBeVisible()
    const card = page.locator('section', { has: page.getByRole('heading', { name: /Policy conformance \(deterministic/ }) })
    await expect(card.getByText('40/40').first()).toBeVisible()
    await card.getByRole('button', { name: 'Show scenario details' }).click()
    await expect(card.getByRole('row', { name: /L01 · ORD-1002/ })).toContainText('DENY (R-001) ✓')
  })

  test('a changed policy is reflected honestly in the conformance suite', async ({ page }) => {
    await seed(page, { role: 'admin' })
    await page.goto('/app/policies')
    await page.getByLabel('Order edits lock from').first().selectOption('shipped')
    await page.getByRole('button', { name: 'Validate and save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved as v2' })).toBeVisible()
    await page.getByRole('link', { name: 'Trust Center' }).first().click()
    await expect(page.getByText(/Some outcomes differ from the expected decisions/)).toBeVisible()
  })

  test('AI evaluation never fabricates results: offline cloud-only runs report failures, not accuracy', async ({ page, context }) => {
    await seed(page, { privacyMode: 'cloud' })
    await page.goto('/app/trust')
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Run evaluation' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Runs that produced no answer' })).toContainText('offline × 3')
    await expect(page.getByText('Valid answers').locator('..')).toContainText('0/3')
    await expect(page.getByText('Intent accuracy').locator('..')).toContainText('n/a')
    await expect(page.getByText(/The run stopped early after 3 consecutive runs without an answer/)).toBeVisible()
  })
})

test('decision trace separates model output from deterministic enforcement', async ({ page }) => {
  await seed(page)
  await page.goto('/app/workspace')
  await page
    .getByRole('button', { name: /ORD-1002/ })
    .first()
    .click()
  await expect(page.getByText('Not analyzed yet. Press "Analyze conversation".')).toBeVisible()
  await page.getByLabel('Action to evaluate').selectOption('CHANGE_VARIANT')
  await page.getByRole('button', { name: 'Propose', exact: true }).click()
  const trace = page.locator('section', { has: page.getByRole('heading', { name: 'Decision trace' }) })
  await expect(trace.getByRole('list', { name: 'Legend' }).getByText('Model-generated')).toBeVisible()
  await expect(trace.getByText('Deterministic rule').first()).toBeVisible()
  await expect(trace.getByText(/DENY: Order is "shipped"/)).toBeVisible()
  await expect(trace.getByText(/cannot be overridden by approving it/)).toBeVisible()
  const policyNode = trace.getByRole('button', { name: /Policy evaluation/ })
  await expect(policyNode).toHaveAttribute('aria-expanded', 'true')
  await expect(trace.getByText('R-001 / v1')).toBeVisible()
  await policyNode.click()
  await expect(policyNode).toHaveAttribute('aria-expanded', 'false')
})

test.describe('What-if policy simulator', () => {
  test('shows which scenarios change, applies only on request, and rejects unsafe drafts', async ({ page }) => {
    await seed(page, { role: 'admin' })
    await page.goto('/app/policies')
    const sim = page.locator('section', { has: page.getByRole('heading', { name: 'What-if policy simulator' }) })
    await expect(sim.getByText('No scenario is affected by this draft.')).toBeVisible()
    await sim.getByLabel('Order edits lock from').selectOption('shipped')
    await expect(sim.getByRole('status')).toContainText('scenarios would be decided differently')
    await expect(sim.getByRole('row', { name: /L02/ })).toContainText('ALLOW')
    // simulation alone did not change the live policy
    await expect(page.getByText('Current version v1')).toBeVisible()

    await sim.getByLabel('Require confirmed warehouse receipt').uncheck()
    await expect(sim.getByRole('alert')).toContainText('requireWarehouseReceipt cannot be disabled')
    await sim.getByLabel('Require confirmed warehouse receipt').check()

    await sim.getByRole('button', { name: 'Apply draft as a new policy version' }).click()
    await expect(sim.getByText('Applied as a new version.')).toBeVisible()
    await expect(page.getByText('Current version v2')).toBeVisible()
  })

  test('only admins can apply', async ({ page }) => {
    await seed(page)
    await page.goto('/app/policies')
    const sim = page.locator('section', { has: page.getByRole('heading', { name: 'What-if policy simulator' }) })
    await sim.getByLabel('Order edits lock from').selectOption('packed')
    await expect(sim.getByRole('button', { name: 'Apply draft as a new policy version' })).toBeDisabled()
    await expect(sim.getByText('Only admins can apply a policy.')).toBeVisible()
  })
})

test.describe('Privacy Evidence', () => {
  test('explains the routing plan with the engine rules and shows diagnostic observations', async ({ page }) => {
    await seed(page)
    await page.goto('/app/lab')
    const proof = page.locator('section', { has: page.getByRole('heading', { name: 'Privacy Evidence' }) })
    const row = (name: string) => proof.getByRole('row', { name: new RegExp(`^${name}`) })
    await expect(row('Local only')).toContainText('Blocked') // ONLY_IN_CLOUD column
    await expect(row('Local only')).toContainText('Stays on device')
    await expect(row('Hybrid')).toContainText('Cloud-capable, redacted')
    await expect(proof.getByText('[CUSTOMER_NAME]').first()).toBeVisible()
    await expect(proof.getByText('Run a test above to see observations.')).toBeVisible()

    await page.getByRole('radio', { name: 'Local only' }).click()
    await page.getByRole('button', { name: 'Run B' }).click()
    await expect(proof.getByText('AI endpoint requests observed (diagnostic)').locator('..')).toContainText('0')
    await expect(proof.getByText('Preference requested → used').locator('..')).toContainText('ONLY_IN_CLOUD → ONLY_IN_CLOUD')
    await expect(proof.getByText('Preference handed to the SDK').locator('..')).toContainText('ONLY_IN_CLOUD')
    await expect(proof.getByText(/diagnostic evidence only/)).toBeVisible()
    await expect(proof.getByText(/not proof of zero cloud requests/)).toBeVisible()
  })
})

test.describe('Arabic', () => {
  test('new pages are translated and have no horizontal overflow', async ({ page }) => {
    await seed(page, { lang: 'ar' })
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/app/trust')
    await expect(page.getByRole('heading', { name: 'مركز الثقة', level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.goto('/app/policies')
    await expect(page.getByRole('heading', { name: 'محاكي «ماذا لو» للسياسات' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  })
})

test('Trust Center enforcement test refuses every prohibited approval attempt, independent of the AI', async ({ page }) => {
  await seed(page)
  await page.goto('/app/trust')
  const card = page.locator('section', { has: page.getByRole('heading', { name: /Approval enforcement/ }) })
  const badge = card.getByText(/prohibited attempts refused/).first()
  const m = (await badge.textContent())!.match(/(\d+)\/(\d+)/)!
  expect(Number(m[2])).toBeGreaterThan(40)
  expect(m[1]).toBe(m[2])
  await expect(card.getByText('Failures').locator('..')).toContainText('0')
  await card.getByRole('button', { name: 'Show checks' }).click()
  await expect(card.getByText(/L01: a DENY proposal must not create an approval/)).toBeVisible()
  await expect(card.getByText(/forged "approved" record/).first()).toBeVisible()
})

test('Remote Config unavailable: the Lab reports it honestly and the app keeps working with defaults', async ({ page }) => {
  await seed(page)
  await page.route(/firebaseremoteconfig\.googleapis\.com/, (r) => r.abort())
  await page.goto('/app/lab')
  const rc = page.getByText('Remote Config', { exact: true }).locator('..')
  await expect(rc).toContainText(/error|default/)
  await expect(rc).toContainText('cloud on') // fail-open default
  await page.getByRole('radio', { name: 'Local only' }).click()
  await page.getByRole('button', { name: 'Run B' }).click()
  await expect(page.getByText('Local Only mode forbids cloud inference.')).toBeVisible()
})
