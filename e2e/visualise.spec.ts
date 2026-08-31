import { expect, test } from '@playwright/test'

test.describe('visualise campaign', () => {
  test('hero, catalog and quote CTA render', async ({ page }, testInfo) => {
    await page.goto('/visualise')
    await expect(page.getByRole('heading', { name: /see it on your wall/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /book a free quote/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /65"/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /3d room/i })).toBeVisible()
    await page.screenshot({
      path: `e2e/screenshots/visualise-${testInfo.project.name}.png`,
      fullPage: true,
    })
  })

  test('quote form shows a success state', async ({ page }) => {
    await page.route('**/api/campaign-quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, lead_id: 'e2e-lead' }),
      })
    })
    await page.goto('/visualise')
    await page.getByRole('textbox', { name: /name/i }).fill('Alex Test')
    await page.getByRole('textbox', { name: /phone/i }).fill('0400000000')
    await page.getByRole('combobox', { name: /address/i }).fill('12 Example St Brisbane')
    await page.locator('#quote').getByRole('button', { name: /book a free quote/i }).click()
    await expect(page.getByRole('heading', { name: /we’ll call you/i })).toBeVisible()
  })
})
