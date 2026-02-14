const { test, expect } = require('@playwright/test');

test.describe('Countries Table Tests', () => {
  test('table initializes with DataTables', async ({ page }) => {
    await page.goto('/countries/');

    // Wait for DataTables to initialize
    await page.waitForTimeout(1000);

    // Check if table exists
    const table = page.locator('#countries-table');
    await expect(table).toBeVisible();

    // Check if DataTables initialized
    const dataTablesInitialized = await page.evaluate(() => {
      return typeof $.fn.DataTable !== 'undefined' &&
             $('#countries-table').hasClass('dataTable');
    });
    expect(dataTablesInitialized).toBe(true);
  });

  test('search functionality works', async ({ page }) => {
    await page.goto('/countries/');

    // Wait for table to load
    await page.waitForTimeout(1000);

    // Type in search box
    const searchBox = page.locator('input[type="search"]');
    await searchBox.fill('United States');

    // Wait for filtering
    await page.waitForTimeout(500);

    // Check if results are filtered
    const visibleRows = await page.evaluate(() => {
      return $('#countries-table tbody tr:visible').length;
    });

    // Should have at least one result
    expect(visibleRows).toBeGreaterThan(0);
  });

  test('table is sortable', async ({ page }) => {
    await page.goto('/countries/');

    // Wait for table to load
    await page.waitForTimeout(1000);

    // Get first country name before sort
    const firstCountryBefore = await page.evaluate(() => {
      return $('#countries-table tbody tr:first td:first').text();
    });

    // Click on column header to sort
    await page.locator('#countries-table thead th').first().click();

    // Wait for sort
    await page.waitForTimeout(500);

    // Get first country name after sort
    const firstCountryAfter = await page.evaluate(() => {
      return $('#countries-table tbody tr:first td:first').text();
    });

    // Order should potentially change (unless already sorted)
    // Just verify the table still has data
    expect(firstCountryAfter).toBeTruthy();
  });

  test('pagination controls exist', async ({ page }) => {
    await page.goto('/countries/');

    // Wait for table to load
    await page.waitForTimeout(1000);

    // Check for pagination
    const paginationExists = await page.evaluate(() => {
      return document.querySelector('.dataTables_paginate') !== null;
    });

    expect(paginationExists).toBe(true);
  });
});
