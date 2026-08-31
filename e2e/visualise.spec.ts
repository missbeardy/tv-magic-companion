import { expect, test } from '@playwright/test'

test.describe('visualise campaign', () => {
  test('hero, catalog and quote CTA render', async ({ page }, testInfo) => {
    await page.goto('/visualise')
    await expect(page.getByRole('heading', { name: /see it on your wall/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /book a free quote/i }).first()).toBeVisible()
    // Scoped to the catalogue: the in-stage size chips expose the same
    // accessible names, so an unscoped lookup is ambiguous on mobile.
    await expect(page.locator('#catalog').getByRole('button', { name: '65" TV' })).toBeVisible()
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

test.describe('visualise on mobile', () => {
  test('sells above the stage and hides measurements until there is a wall', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout only')
    await page.goto('/visualise')

    // The headline and trust numbers used to sit ~660px and ~1,500px down,
    // leaving the first screen with nothing that sells.
    const headingBox = await page.getByRole('heading', { name: /see it on your wall/i }).boundingBox()
    const stageBox = await page.locator('#visualise').boundingBox()
    expect(headingBox!.y).toBeLessThan(stageBox!.y)
    // Also appears in the guarantee card far below; the first is the strip.
    await expect(page.getByText('460,000+').first()).toBeInViewport()

    // Millimetre readings for a wall that does not exist yet are noise.
    await expect(page.getByText('Ceiling', { exact: true })).toBeHidden()
    await page.getByRole('button', { name: /try a sample wall/i }).click()
    await expect(page.getByText('Ceiling', { exact: true })).toBeVisible()
  })

  test('tells you the TV can be dragged', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout only')
    await page.goto('/visualise')
    await page.getByRole('button', { name: /try a sample wall/i }).click()
    // This hint carried `hidden … sm:block`, so the core gesture had no
    // instruction on the platform that needs it most.
    await expect(page.getByText(/drag the tv to set height/i)).toBeVisible()
  })

  test('size chips sit with the wall, not 700px below it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout only')
    await page.goto('/visualise')
    await page.getByRole('button', { name: /try a sample wall/i }).click()
    const chips = page.getByRole('group', { name: /size/i })
    await expect(chips).toBeInViewport()
    await chips.getByRole('button', { name: '75" TV' }).click()
    await expect(page.locator('#catalog').getByText('Selected:')).toContainText('75"')
  })

  test('the sticky bar stands down once the form is on screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout only')
    await page.goto('/visualise')
    const stickyBar = page.locator('.fixed.bottom-0').getByRole('link', { name: /book a free quote/i })
    await expect(stickyBar).toBeVisible()
    await page.locator('#quote').scrollIntoViewIfNeeded()
    await expect(stickyBar).toBeHidden()
  })
})
