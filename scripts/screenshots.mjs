// Captures the README / Devpost screenshots from a running dev server (npm run dev). Uses the installed Chrome.
import { chromium } from 'playwright-core'
const base = process.env.BASE_URL ?? 'http://localhost:5173'
const dir = 'docs/screenshots'
// addInitScript serializes the function, so the language must be passed as an argument (a closure would be lost)
const seed = (lang) => localStorage.setItem('bimoda.state.v1', JSON.stringify({ settings: { toured: true, lang, role: 'admin' } }))
const b = await chromium.launch({ channel: 'chrome' })
const shot = async (name, { w = 1440, h = 900, route, lang = 'en', act } = {}) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.addInitScript(seed, lang)
  await p.goto(base + route)
  await p.waitForSelector('h1', { state: 'attached' })
  await p.waitForTimeout(900)
  if (act) await act(p)
  await p.screenshot({ path: `${dir}/${name}.png` })
  await ctx.close()
  console.log('saved', name)
}
await shot('landing', { route: '/' })
await shot('mission-control', { route: '/app' })
await shot('workspace-policy-block', {
  route: '/app/workspace',
  act: async (p) => {
    await p
      .getByRole('button', { name: /ORD-1002/ })
      .first()
      .click()
    await p.getByLabel('Action to evaluate').selectOption('CHANGE_VARIANT')
    await p.getByRole('button', { name: 'Propose', exact: true }).click()
    await p.waitForTimeout(400)
  },
})
await shot('hybrid-lab', { route: '/app/lab' })
await shot('policy-studio', { route: '/app/policies' })
await shot('mobile-workspace', { w: 390, h: 844, route: '/app/workspace' })
await shot('arabic-rtl-dashboard', { route: '/app', lang: 'ar' })
await shot('trust-center-policy-suite', { route: '/app/trust', h: 700 })
await shot('decision-trace', {
  route: '/app/workspace',
  h: 1500,
  act: async (p) => {
    await p
      .getByRole('button', { name: /ORD-1002/ })
      .first()
      .click()
    await p.getByLabel('Action to evaluate').selectOption('CHANGE_VARIANT')
    await p.getByRole('button', { name: 'Propose', exact: true }).click()
  },
})
await shot('whatif-simulator', {
  route: '/app/policies',
  h: 1700,
  act: async (p) => {
    await p.getByLabel('Order edits lock from').last().selectOption('shipped')
  },
})
await shot('privacy-evidence', {
  route: '/app/lab',
  h: 1500,
  act: async (p) => {
    await p.getByRole('radio', { name: 'Local only' }).click()
    await p.getByRole('button', { name: 'Run B' }).click()
    await p.waitForTimeout(500)
  },
})
await b.close()
