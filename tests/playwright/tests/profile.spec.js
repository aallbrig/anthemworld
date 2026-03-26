const { test, expect } = require('@playwright/test');

const PROFILE_URL = 'http://localhost:1313/profile/';

test.describe('Profile page', () => {
  test('loads and shows summary cards', async ({ page }) => {
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#profile-content')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#profile-total-count')).toBeVisible();
    await expect(page.locator('#profile-table')).toBeVisible();
    await expect(page.locator('#profile-full-anthem-count')).toBeVisible();
  });

  test('renders linked countries, statuses, and audio in one table', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aw_listen_progress_v1', JSON.stringify({
        FRA: {
          country_id: 'FRA',
          country_name: 'France',
          anthem_name: 'La Marseillaise',
          total_listen_ms: 25000,
          duration_ms: 70000,
          max_position_ms: 70000,
          heard_full_weight: true,
          heard_full_anthem: true,
        },
        HRV: {
          country_id: 'HRV',
          country_name: 'Croatia',
          anthem_name: 'Lijepa naša domovino',
          total_listen_ms: 4500,
          duration_ms: 59000,
          max_position_ms: 32000,
        },
      }));
      localStorage.setItem('aw_heard_full:FRA', '1');
      localStorage.setItem('aw_heard_anthem:FRA', '1');
    });

    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#profile-content')).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('#profile-table tbody tr').first()).toContainText('France');
    await expect(page.locator('#profile-table')).toContainText('Croatia');
    await expect(page.locator('#profile-table')).toContainText('Tunisia');
    await expect(page.locator('#profile-table a[href="/countries/fra/"]')).toBeVisible();
    await expect(page.locator('#profile-table audio').first()).toBeVisible();
    await expect(page.locator('#profile-table thead')).not.toContainText('Credit');
    await expect(page.locator('#profile-full-anthem-count')).toHaveText('1');
  });
});
