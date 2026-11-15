// Walks the whole viewer flow in WebKit at iPhone 17 Pro size and saves screenshots.
// Usage: npm run build && npx vite preview --port 4173 &  then  node --experimental-strip-types e2e/shots.mjs [outDir]
import { webkit } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { decryptContent, unlock } from '../src/lib/crypto.ts'

const out = process.argv[2] ?? 'test-results/shots'
mkdirSync(out, { recursive: true })
const URL = process.env.MISSME_URL ?? 'http://localhost:4173/missme/'
const VIEWER = process.env.MISSME_VIEWER_PIN ?? '111111'
const ADMIN = process.env.MISSME_ADMIN_PIN ?? '222222'
const problems = []
let inShot = false

const browser = await webkit.launch()
async function ctx(width = 402, height = 874, extra = {}) {
  const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ...extra })
  const page = await c.newPage()
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // Playwright injects a stylesheet while screenshotting; the CSP rightly refuses it.
    if (inShot && m.text().startsWith('Refused to apply a stylesheet')) return
    problems.push(`console: ${m.text()}`)
  })
  return page
}
async function shot(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 0) problems.push(`${name}: horizontal overflow ${over}px`)
  const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  console.log(`${name}: vertical overflow ${tall}px`)
  inShot = true
  await page.screenshot({ path: `${out}/${name}.png` })
  await page.waitForTimeout(50)
  inShot = false
}
async function enter(page, pin) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

// --- viewer flow ---
let page = await ctx()
await page.goto(URL)
await page.getByRole('heading', { name: 'Who goes there?' }).waitFor()
await enter(page, '12')
await shot(page, '01-lock')
await enter(page, '3456')
await page.getByText("Tofu doesn't know that one.").waitFor({ timeout: 20000 })
await shot(page, '02-lock-wrong')
await enter(page, VIEWER)
await page.getByRole('heading', { name: 'Miss me?' }).waitFor({ timeout: 20000 })
if (await page.getByRole('button', { name: 'Admin' }).count()) problems.push('viewer sees the gear')
await shot(page, '03-home')
await page.getByRole('button', { name: 'At work' }).click()
await page.getByRole('button', { name: 'Open a box' }).click()
await page.waitForTimeout(700)
await shot(page, '04-opening')
const box = page.getByRole('button', { name: /Tap the box/ })
await box.click()
await page.waitForTimeout(350)
if (await page.getByRole('button', { name: 'Back' }).count()) problems.push('Back still shown after first tap')
await shot(page, '05-opening-tap1')
await box.click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /Tap the box/ }).click()
await page.waitForTimeout(1050)
await shot(page, '06-opening-pop')
await page.getByRole('button', { name: 'Keep it on my shelf' }).waitFor({ timeout: 5000 })
await page.waitForTimeout(400)
await shot(page, '07-reveal')
await page.getByRole('button', { name: 'Favourite this message' }).click()
await page.getByRole('button', { name: 'Keep it on my shelf' }).click()
await page.getByRole('heading', { name: 'My shelf' }).waitFor()
await page.getByRole('button', { name: 'Back', exact: true }).click()
await page.getByRole('heading', { name: 'Miss me already?' }).waitFor()
await shot(page, '08-cooldown')
// reload: progress and favourite must survive, still in cooldown, no PIN asked
await page.reload()
await page.getByRole('heading', { name: 'Miss me already?' }).waitFor({ timeout: 10000 })
await page.getByRole('button', { name: /My shelf · 1/ }).click()
await page.getByText('Favourites · 1').waitFor()
await shot(page, '09-shelf')
await page.locator('.shelf-card').first().click()
await page.getByRole('button', { name: 'Back to my shelf' }).waitFor()
await shot(page, '10-shelf-detail')

// --- seeded states ---
const state = await page.evaluate(() => JSON.parse(localStorage.getItem('missme:v1')))
const ids = Array.from({ length: 10 }, (_, i) => `8f1c2a50-3b7e-4c1d-9a61-0d2e5f7a1b${String(i + 1).padStart(2, '0')}`)
const seed = async (opened, lastOpenAt) => {
  await page.evaluate((s) => localStorage.setItem('missme:v1', JSON.stringify(s)), { ...state, opened, favourites: opened.slice(0, 2).map((o) => o.id), lastOpenAt })
  await page.reload()
}
const today = new Date()
const at = (minsAgo) => new Date(today.getTime() - minsAgo * 60000).toISOString()
// daily cap: three opened in the last few minutes
await seed([0, 1, 2].map((i) => ({ id: ids[i], at: at(3 - i) })), at(1))
await page.getByText("That's all three for today. More tomorrow.").waitFor({ timeout: 10000 })
await shot(page, '11-daily-cap')
// one category sold out, cooldown over (opened yesterday)
await seed([0, 1, 2].map((i) => ({ id: ids[i], at: at(60 * 26) })), at(60 * 26))
await page.getByRole('button', { name: 'At work · sold out' }).waitFor({ timeout: 10000 })
await shot(page, '12-home-category-sold-out')
// long secret message detail via shelf
await seed([{ id: ids[6], at: at(60 * 30) }], at(60 * 30))
await page.getByRole('button', { name: /My shelf/ }).click()
await page.locator('.shelf-card').first().click()
await page.getByRole('button', { name: 'Back to my shelf' }).waitFor()
await shot(page, '13-long-message')
// everything opened
await seed(ids.map((id, i) => ({ id, at: at(60 * 24 * (i + 2)) })), at(60 * 48))
await page.getByRole('heading', { name: 'Sold out!' }).waitFor({ timeout: 10000 })
await shot(page, '14-sold-out')
await page.getByRole('button', { name: 'Re-read my shelf' }).click()
await shot(page, '15-shelf-full')

// --- narrow phone ---
await page.setViewportSize({ width: 360, height: 740 })
await seed([], undefined)
await page.getByRole('heading', { name: 'Miss me?' }).waitFor({ timeout: 10000 })
await shot(page, '16-home-360')
await page.getByRole('button', { name: 'Open a box' }).click()
await page.waitForTimeout(700)
await shot(page, '17-opening-360')
await page.context().close()

// --- admin: drafts, settings, PIN change, publish (GitHub API mocked) ---
page = await ctx()
const puts = []
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, PUT' }
await page.route('https://api.github.com/**', async (route) => {
  const req = route.request()
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  if (req.method() === 'PUT') {
    puts.push(JSON.parse(req.postData()))
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' })
  }
  const live = await (await fetch(`${URL}data/content.enc.json`)).text()
  const body = JSON.stringify({ sha: 'sha-1', encoding: 'base64', content: Buffer.from(live).toString('base64') })
  return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body })
})
await page.goto(URL)
await enter(page, ADMIN)
await page.getByRole('button', { name: 'Admin' }).waitFor({ timeout: 20000 })
await shot(page, '18-home-admin')
await page.getByRole('button', { name: 'Admin' }).click()
await page.getByRole('heading', { name: 'Messages' }).waitFor()
await shot(page, '19-admin-list')
await page.getByRole('button', { name: 'New message' }).click()
await page.getByLabel('Message', { exact: true }).fill('E2E test message from the phone')
await page.getByRole('button', { name: 'Thinking of you', exact: true }).click()
await page.getByRole('button', { name: /^Rare/ }).click()
await shot(page, '19b-admin-edit')
await page.getByRole('button', { name: 'Save to drafts' }).click()
await page.getByText('E2E test message from the phone').waitFor()
await page.getByRole('button', { name: 'Publish 1 change' }).waitFor()
await page.getByRole('button', { name: 'Delete message' }).nth(1).click()
await page.getByRole('heading', { name: 'Delete this message?' }).waitFor()
await page.waitForTimeout(400)
await shot(page, '19c-admin-delete-sheet')
await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
await page.getByRole('button', { name: 'Publish 2 changes' }).waitFor()
await page.getByRole('button', { name: 'Publish 2 changes' }).click()
await page.getByText('Add your GitHub token in Settings first.').waitFor()
await shot(page, '19d-admin-list-drafts')
await page.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('heading', { name: 'Settings' }).waitFor()
await page.getByLabel('GitHub token').fill('test-token')
await page.getByLabel('Boxes per day').fill('4')
await page.getByLabel('Boxes per day').blur()
await page.getByRole('button', { name: 'Change her PIN' }).click()
await page.getByLabel('New PIN').fill(ADMIN)
await page.getByLabel('Type it again').fill(ADMIN)
await page.getByRole('button', { name: 'Save new PIN' }).click()
await page.getByText('That is your PIN. Pick a different one for her.').waitFor({ timeout: 20000 })
await page.getByLabel('New PIN').fill('333333')
await page.getByLabel('Type it again').fill('333333')
await page.getByRole('button', { name: 'Save new PIN' }).click()
await page.getByText('Her new PIN takes effect when you publish.').waitFor({ timeout: 20000 })
await shot(page, '19e-admin-settings')
// drafts survive a reload (stored encrypted)
await page.reload()
await page.getByRole('button', { name: 'Admin' }).click({ timeout: 20000 })
await page.getByRole('button', { name: 'Publish 4 changes' }).click({ timeout: 5000 })
await page.getByText('Published. Live in about a minute.').waitFor({ timeout: 20000 })
await page.getByText(/everything published/).waitFor()
await shot(page, '19f-admin-published')
if (puts.length !== 1) problems.push(`expected 1 PUT, got ${puts.length}`)
else {
  const env = JSON.parse(Buffer.from(puts[0].content, 'base64').toString('utf8'))
  if (puts[0].sha !== 'sha-1') problems.push('PUT without the fetched sha')
  if (env.data.includes('E2E')) problems.push('published file has readable text')
  const asAdmin = await unlock(env, ADMIN)
  const asHerNew = await unlock(env, '333333')
  const asHerOld = await unlock(env, VIEWER)
  if (asAdmin?.role !== 'admin') problems.push('admin PIN no longer opens the published file')
  if (asHerNew?.role !== 'viewer') problems.push('new viewer PIN does not open the published file')
  if (asHerOld) problems.push('old viewer PIN still opens the published file')
  const c = await decryptContent(env, asAdmin.ck)
  if (!c.messages.some((m) => m.text === 'E2E test message from the phone' && m.rarity === 'rare' && m.categoryId === 'thinking')) problems.push('new message missing')
  if (c.settings.dailyLimit !== 4) problems.push('daily limit not published')
  if (c.messages.length !== 10) problems.push(`expected 10 messages after one add and one delete, got ${c.messages.length}`)
}
// locking removes the token
await page.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: 'Lock this device' }).click()
await page.getByRole('heading', { name: 'Who goes there?' }).waitFor()
if (await page.evaluate(() => localStorage.getItem('missme:gh-token'))) problems.push('token survived Lock')
await page.context().close()

// --- offline after a first visit: the cached file still opens ---
page = await ctx()
await page.goto(URL)
await enter(page, VIEWER)
await page.getByRole('heading', { name: 'Miss me?' }).waitFor({ timeout: 20000 })
await page.route('**/content.enc.json*', (r) => r.abort())
await page.reload()
await page.getByRole('heading', { name: 'Miss me?' }).waitFor({ timeout: 10000 })
await page.context().close()

// --- reduced motion: one tap straight to the reveal ---
page = await ctx(402, 874, { reducedMotion: 'reduce' })
await page.goto(URL)
await enter(page, VIEWER)
await page.getByRole('button', { name: 'Open a box' }).click({ timeout: 20000 })
await page.getByRole('button', { name: /Tap the box, 1 of 1/ }).click()
await page.getByRole('button', { name: 'Keep it on my shelf' }).waitFor({ timeout: 1500 })
await shot(page, '20-reduced-motion-reveal')
await page.context().close()

// --- offline ---
page = await ctx()
await page.route('**/content.enc.json*', (r) => r.abort())
await page.goto(URL)
await page.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 10000 })
await shot(page, '21-offline')
await page.context().close()

// --- laptop ---
page = await ctx(1280, 800, { isMobile: false, hasTouch: false })
await page.goto(URL)
await page.getByRole('heading', { name: 'Who goes there?' }).waitFor()
await page.keyboard.type(VIEWER)
await page.getByRole('heading', { name: 'Miss me?' }).waitFor({ timeout: 20000 })
await shot(page, '22-laptop-home')
await page.context().close()

await browser.close()
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'OK: no problems')
process.exit(problems.length ? 1 : 0)
