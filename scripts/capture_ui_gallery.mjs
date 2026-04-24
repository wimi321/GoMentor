#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const url = process.env.KATASENSEI_UI_GALLERY_URL ?? 'http://localhost:5173/#/ui-gallery'
const outDir = resolve(process.env.KATASENSEI_UI_GALLERY_OUT ?? 'release-evidence/ui-gallery')

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error('Playwright is not installed in this environment. Run pnpm dev, then install/use Playwright locally or capture this route manually: ' + url)
  }
}

async function capture() {
  const { chromium } = await loadPlaywright()
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(outDir, 'ui-gallery-overview.png'), fullPage: true })

  const targets = [
    ['board', '.ui-gallery__panel--board'],
    ['teacher-card', '.ui-gallery__panel--teacher'],
    ['timeline', '.ks-timeline-v2'],
    ['diagnostics', '.diagnostics-page'],
    ['settings-readiness', '.beta-acceptance-panel']
  ]

  for (const [name, selector] of targets) {
    const locator = page.locator(selector).first()
    if (await locator.count()) {
      await locator.screenshot({ path: join(outDir, `${name}.png`) })
    }
  }

  const bindButton = page.getByRole('button', { name: '打开 SGF 绑定弹窗' })
  if (await bindButton.count()) {
    await bindButton.click()
    await page.locator('.student-dialog').screenshot({ path: join(outDir, 'student-bind-dialog.png') })
  }

  await browser.close()
  console.log(`Captured UI Gallery screenshots in ${outDir}`)
}

capture().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
