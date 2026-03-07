/**
 * Playwright tests for the homepage (/).
 * Verifies the refreshed content, feature cards, and live top-3 stats widget.
 */

const { test, expect } = require('@playwright/test');

const HOME_URL = 'http://localhost:1313/';

test.describe('Homepage', () => {
  test('loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(HOME_URL);
    const critical = errors.filter(e => !e.includes('audio') && !e.includes('media'));
    expect(critical).toHaveLength(0);
  });

  test('shows all four feature cards', async ({ page }) => {
    await page.goto(HOME_URL);
    // Use .first() since text may appear in both nav and feature card
    await expect(page.getByText('Interactive Map').first()).toBeVisible();
    await expect(page.getByText('Anthem Battle').first()).toBeVisible();
    await expect(page.getByText('Countries Table').first()).toBeVisible();
    // "Leaderboard" appears in nav too; check the card specifically
    await expect(page.locator('.card-title', { hasText: 'Leaderboard' }).first()).toBeVisible();
  });

  test('feature cards link to correct pages', async ({ page }) => {
    await page.goto(HOME_URL);
    await expect(page.locator('a[href="/map/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/game/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/leaderboard/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/countries/"]').first()).toBeVisible();
  });

  test('does not say "coming soon"', async ({ page }) => {
    await page.goto(HOME_URL);
    const body = await page.locator('body').textContent();
    expect(body).not.toMatch(/coming soon/i);
  });

  test('live top-3 widget loads or hides gracefully', async ({ page }) => {
    await page.goto(HOME_URL);
    // Widget either shows ranked rows or hides the section (if API down)
    const container = page.locator('#home-top3');
    await expect(container).toBeVisible({ timeout: 15_000 });
    // Could be rankings or "no votes yet" message — just not a loading spinner
    const text = await container.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('about section mentions ELO', async ({ page }) => {
    await page.goto(HOME_URL);
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/ELO/i);
  });
});
