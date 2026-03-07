/**
 * Country detail page tests.
 * Spot-checks /countries/[iso]/ pages for structure, content, and graceful
 * no-audio fallback.
 */
const { test, expect } = require('@playwright/test');

test.describe('Country detail pages', () => {
  test.setTimeout(30_000);

  test('France page has anthem name, composer, and audio player', async ({ page }) => {
    await page.goto('/countries/fra/');
    await expect(page.locator('h3').first()).toHaveText(/La Marseillaise/i);
    await expect(page.locator('dd').first()).toContainText('Claude Joseph Rouget de Lisle');
    await expect(page.locator('audio')).toBeVisible();
  });

  test('France page has breadcrumb navigation', async ({ page }) => {
    await page.goto('/countries/fra/');
    await expect(page.locator('.breadcrumb')).toBeVisible();
    await expect(page.locator('.breadcrumb')).toContainText('Countries');
    await expect(page.locator('.breadcrumb')).toContainText('France');
  });

  test('Japan page has anthem name and flag', async ({ page }) => {
    await page.goto('/countries/jpn/');
    await expect(page.locator('h3').first()).toContainText(/Kimigayo/i);
    await expect(page.locator('img[alt*="flag"]')).toBeVisible();
  });

  test('country without audio shows fallback message', async ({ page }) => {
    // Switzerland (CHE) has no Wikimedia audio in our dataset
    await page.goto('/countries/che/');
    await expect(page.locator('text=Audio recording not yet available')).toBeVisible();
    await expect(page.locator('audio')).not.toBeVisible();
  });

  test('country page links back to /countries/', async ({ page }) => {
    await page.goto('/countries/bra/');
    const countriesLink = page.locator('a[href*="/countries/"]').first();
    await expect(countriesLink).toBeVisible();
  });

  test('country page title contains country name', async ({ page }) => {
    await page.goto('/countries/deu/');
    const title = await page.title();
    expect(title).toMatch(/Germany/i);
  });
});
