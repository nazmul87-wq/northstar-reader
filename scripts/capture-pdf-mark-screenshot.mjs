import { chromium } from 'playwright'

const APP_URL = 'http://127.0.0.1:1430/'
const PDF_PATH = 'C:/Users/nazmu/S_Drive/Fall_2025/system_Engineering_G/System_Engineering_Quiz_Answers.pdf'
const SCREENSHOT_PATH = 'output/pdf-marked-screenshot.png'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1560, height: 980 } })

  await page.goto(APP_URL, { waitUntil: 'networkidle' })

  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import files' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(PDF_PATH)

  await page.locator('.library-item').first().click()
  await page.waitForSelector('.pdf-canvas-wrap canvas', { state: 'visible', timeout: 20000 })

  const colorChips = page.locator('.editor-section .color-row .color-chip')
  await colorChips.nth(1).click()

  const canvas = page.locator('.pdf-canvas-wrap canvas').first()
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Canvas bounding box not available')
  }

  const startX = box.x + box.width * 0.22
  const startY = box.y + box.height * 0.32
  const endX = box.x + box.width * 0.62
  const endY = box.y + box.height * 0.36

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 12 })
  await page.mouse.up()

  await page.waitForTimeout(450)
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
  await browser.close()

  console.log(SCREENSHOT_PATH)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
