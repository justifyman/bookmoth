// Takes screenshots of the running dev server for visual checks.
// Usage: node scripts/shot.mjs <out.png> "<query string>" [width] [height] [waitMs] [keys,comma,separated]
import { chromium } from 'playwright'

const [out, query = '', w = '1440', h = '900', wait = '5000', keys = ''] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 })
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`[${m.type()}]`, m.text().slice(0, 600)))
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600)))
await page.goto(`http://localhost:5173/?${query}`)
await page.waitForTimeout(+wait)
for (const step of keys.split(',').filter(Boolean)) {
  if (step.startsWith('wait')) await page.waitForTimeout(+step.slice(4))
  else await page.keyboard.press(step)
}
await page.screenshot({ path: out })
await browser.close()
