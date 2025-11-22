import { test, expect } from '@playwright/test'

test.describe('Scan and view inventory', () => {
  test('should navigate to scan page', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Scan')
    await expect(page).toHaveURL('/scan')
    await expect(page.getByText('Scan Barcode')).toBeVisible()
  })

  test('should show manual entry option', async ({ page }) => {
    await page.goto('/scan')
    await page.click('text=Or enter manually')
    await expect(page.getByText('Manual Entry')).toBeVisible()
  })

  test('should navigate to inventory page', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Inventory')
    await expect(page).toHaveURL('/inventory')
    await expect(page.getByText('My Inventory')).toBeVisible()
  })
})
