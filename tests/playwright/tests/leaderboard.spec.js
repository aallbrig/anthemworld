/**
 * Playwright tests for the /leaderboard/ page.
 * Requires: Hugo dev server on :1313, SAM local API on :3001
 */

const { test, expect } = require('@playwright/test');

// These tests require the SAM game API running at localhost:3001.
// In CI there is no LocalStack/SAM stack, so skip the entire suite.
test.skip(!!process.env.CI, 'requires SAM game API at localhost:3001 (not available in CI)');

const LB_URL = 'http://localhost:1313/leaderboard/';

test.describe('Leaderboard page', () => {
  test.setTimeout(60_000);

  test('page loads and shows rankings table', async ({ page }) => {
    await page.goto(LB_URL);

    // Table should become visible after API responds
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });

    // Should have at least a few rows
    const rowCount = await page.locator('#leaderboard-tbody tr').count();
    expect(rowCount).toBeGreaterThan(10);
  });

  test('renders rank, country name, and ELO badge for each row', async ({ page }) => {
    await page.goto(LB_URL);
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
    await page.goto(LB_URL);
    await expect(page.locator('#leaderboard-stats')).toBeVisible({ timeout: 30_000 });

    const total = await page.locator('#leaderboard-total').textContent();
    expect(parseInt(total, 10)).toBeGreaterThan(0);

    const generated = await page.locator('#leaderboard-generated').textContent();
    expect(generated.trim().length).toBeGreaterThan(0);
  });

  test('limit selector re-fetches and changes row count', async ({ page }) => {
    await page.goto(LB_URL);
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });

    // Switch to 25 and wait for the table to re-render (≤25 rows)
    await page.locator('#leaderboard-limit').selectOption('25');
    await expect(page.locator('#leaderboard-tbody tr').nth(0)).toBeVisible({ timeout: 15_000 });
    const rowsAfter = await page.locator('#leaderboard-tbody tr').count();
    expect(rowsAfter).toBeLessThanOrEqual(25);
    expect(rowsAfter).toBeGreaterThan(0);
  });

  test('shows error panel when API is unreachable', async ({ page }) => {
    await page.addInitScript(() => { window.GAME_API_URL = 'http://localhost:19999'; });
    await page.goto(LB_URL);

    await expect(page.locator('#leaderboard-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#leaderboard-retry-btn')).toBeVisible();
  });

  test('has a link back to the game', async ({ page }) => {
    await page.goto(LB_URL);
    await expect(page.locator('a[href="/game/"]').first()).toBeVisible();
  });

  test('loading spinner is hidden after data loads', async ({ page }) => {
    await page.goto(LB_URL);
    await expect(page.locator('#leaderboard-table-wrap')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#leaderboard-loading')).toBeHidden();
  });
});
