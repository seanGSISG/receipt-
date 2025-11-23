import { test, expect } from '@playwright/test'

test.describe('Recipe Suggestions Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173')
    await page.getByPlaceholder('Email').fill('test@example.com')
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/inventory')
  })

  test('user can get recipe suggestions and cook a recipe', async ({ page }) => {
    // Navigate to recipes page
    await page.goto('http://localhost:5173/recipes')

    // Verify page loaded
    await expect(page.getByText('Recipe Suggestions')).toBeVisible()

    // Set optimization mode
    await page.getByRole('button', { name: 'Make it last' }).click()

    // Set household size
    await page.getByLabel(/household size/i).fill('4')

    // Select LLM provider
    await page.getByLabel(/llm provider/i).selectOption('claude')

    // Click get suggestions
    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    // Wait for recipes to load (this might take a while due to API calls)
    await expect(page.getByText('Recommended Recipes')).toBeVisible({ timeout: 30000 })

    // Verify at least one recipe card is displayed
    const recipeCards = page.locator('[class*="RecipeCard"]').first()
    await expect(recipeCards).toBeVisible()

    // Verify expiring ingredients are highlighted
    await expect(page.locator('.text-red-700').first()).toBeVisible()

    // Click "Cook this" on first recipe
    await page.getByRole('button', { name: 'Cook this' }).first().click()

    // Confirm the dialog
    page.on('dialog', dialog => dialog.accept())

    // Wait for success message
    await expect(page.getByText(/ingredients marked as consumed/i)).toBeVisible()
  })

  test('handles empty inventory gracefully', async ({ page }) => {
    // Clear all inventory first (would need API call or manual setup)

    await page.goto('http://localhost:5173/recipes')

    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    // Should show message about adding ingredients
    await expect(
      page.getByText(/add ingredients to your inventory/i)
    ).toBeVisible({ timeout: 15000 })
  })

  test('user can switch optimization modes', async ({ page }) => {
    await page.goto('http://localhost:5173/recipes')

    // Click "Feed the family" mode
    await page.getByRole('button', { name: 'Feed the family' }).click()

    // Verify button is selected
    await expect(
      page.getByRole('button', { name: 'Feed the family' })
    ).toHaveClass(/bg-blue-600/)

    // Get suggestions with serve_count optimization
    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    await expect(page.getByText('Recommended Recipes')).toBeVisible({ timeout: 30000 })
  })

  test('displays error message when API fails', async ({ page }) => {
    // Mock API failure (would need to set up mock interceptor)
    await page.route('**/functions/v1/suggest-recipes', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await page.goto('http://localhost:5173/recipes')

    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    await expect(page.getByText(/error/i)).toBeVisible()
  })
})
