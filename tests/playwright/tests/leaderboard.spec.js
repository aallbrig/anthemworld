/**
 * Playwright tests for the /leaderboard/ page.
 * Requires: Hugo dev server on :1313, SAM local API on :3001
 */

const { test, expect } = require('@playwright/test');

// Skip in CI unless testing against a deployed site (BASE_URL set).
test.skip(!!process.env.CI && !process.env.BASE_URL, 'requires game API (not available in CI without BASE_URL)');

test.describe('Leaderboard page', () => {
  test.setTimeout(60_000);

  test('page loads and shows rankings table', async ({ page }) => {
    await page.goto('/leaderboard/');

    // Table should become visible after API responds
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });

    // Should have at least a few rows
    const rowCount = await page.locator('#leaderboard-tbody tr').count();
    expect(rowCount).toBeGreaterThan(10);
  });

  test('renders rank, country name, and ELO badge for each row', async ({ page }) => {
    await page.goto('/leaderboard/');
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });

    // First row should have a rank cell and an ELO badge
    const firstRow = page.locator('#leaderboard-tbody tr').first();
    const rankCell = firstRow.locator('td').first();
    await expect(rankCell).toBeVisible();

    const eloBadge = firstRow.locator('.badge');
    const eloText  = await eloBadge.textContent();
    expect(parseInt(eloText, 10)).toBeGreaterThan(0);
  });

  test('shows stats bar with total count and timestamp', async ({ page }) => {
    await page.goto('/leaderboard/');
    await expect(page.locator('#leaderboard-stats')).toBeVisible({ timeout: 30_000 });

    const total = await page.locator('#leaderboard-total').textContent();
    expect(parseInt(total, 10)).toBeGreaterThan(0);

    const generated = await page.locator('#leaderboard-generated').textContent();
    expect(generated.trim().length).toBeGreaterThan(0);
  });

  test('shows all countries without a limit selector', async ({ page }) => {
    await page.goto('/leaderboard/');
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });

    // No limit selector should exist
    await expect(page.locator('#leaderboard-limit')).toHaveCount(0);

    // Should show all ranked countries (more than 50)
    const rowCount = await page.locator('#leaderboard-tbody tr').count();
    expect(rowCount).toBeGreaterThan(50);
  });

  test('shows error panel when API is unreachable', async ({ page }) => {
    await page.addInitScript(() => { window.GAME_API_URL = 'http://localhost:19999'; });
    await page.goto('/leaderboard/');

    await expect(page.locator('#leaderboard-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#leaderboard-retry-btn')).toBeVisible();
  });

  test('has a link back to the game', async ({ page }) => {
    await page.goto('/leaderboard/');
    await expect(page.locator('a[href="/game/"]').first()).toBeVisible();
  });

  test('loading spinner is hidden after data loads', async ({ page }) => {
    await page.goto('/leaderboard/');
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#leaderboard-loading')).toBeHidden();
  });
});
