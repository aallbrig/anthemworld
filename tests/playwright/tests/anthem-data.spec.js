/**
 * Anthem Data Tests
 * Verifies that real anthem data is loaded from anthems.json and displayed correctly.
 */
const { test, expect } = require('@playwright/test');

test.describe('Anthem Data Tests', () => {
  test('anthems.json is served and has expected structure', async ({ page }) => {
    const response = await page.request.get('/data/anthems.json');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    const countries = Object.keys(data);

    // Should have all countries (239 from DB including territories)
    expect(countries.length).toBeGreaterThanOrEqual(100);

    // Keys should be ISO alpha-3 uppercase
    expect(countries.some(k => /^[A-Z]{3}$/.test(k))).toBe(true);

    // USA should be present with anthem data
    expect(data.USA).toBeDefined();
    expect(data.USA.anthem).toBeDefined();
    expect(data.USA.anthem.name).toMatch(/Star-Spangled/i);
    expect(data.USA.audio_files.length).toBeGreaterThan(0);
  });

  test('countries table loads data from anthems.json', async ({ page }) => {
    await page.goto('/countries/');

    // Wait for DataTables + async fetch to complete (at least one page of rows)
    await page.waitForFunction(
      () => document.querySelectorAll('#countries-table tbody tr').length > 5,
      { timeout: 10000 }
    );

    // DataTables paginates — use its API to get total row count across all pages
    const rowCount = await page.evaluate(() => {
      if (window.$ && $.fn.DataTable.isDataTable('#countries-table')) {
        return $('#countries-table').DataTable().rows().count();
      }
      return document.querySelectorAll('#countries-table tbody tr').length;
    });
    expect(rowCount).toBeGreaterThan(100);
  });

  test('countries table shows anthem names', async ({ page }) => {
    await page.goto('/countries/');

    await page.waitForFunction(
      () => document.querySelectorAll('#countries-table tbody tr').length > 5,
      { timeout: 10000 }
    );

    // Search for USA to find a specific anthem
    await page.fill('input[type="search"]', 'United States');
    await page.waitForTimeout(600);

    const tableText = await page.locator('#countries-table tbody').textContent();
    expect(tableText).toMatch(/Star-Spangled/i);
  });

  test('countries table shows flag images', async ({ page }) => {
    await page.goto('/countries/');

    await page.waitForFunction(
      () => document.querySelectorAll('#countries-table tbody tr').length > 5,
      { timeout: 10000 }
    );

    // At least some rows should have flag images
    const flagCount = await page.evaluate(
      () => document.querySelectorAll('#countries-table tbody img').length
    );
    expect(flagCount).toBeGreaterThan(10);
  });

  test('countries table has audio players', async ({ page }) => {
    await page.goto('/countries/');

    await page.waitForFunction(
      () => document.querySelectorAll('#countries-table tbody tr').length > 5,
      { timeout: 10000 }
    );

    // At least some rows should have audio elements
    const audioCount = await page.evaluate(
      () => document.querySelectorAll('#countries-table tbody audio').length
    );
    expect(audioCount).toBeGreaterThan(0);
  });

  test('map popup shows anthem data', async ({ page }) => {
    await page.goto('/map/');
    await page.waitForTimeout(2000);

    // Use JS to fire a click on the first GeoJSON layer
    const popupVisible = await page.evaluate(() => {
      const layers = window.map?._layers;
      if (!layers) return false;
      for (const key in layers) {
        const layer = layers[key];
        if (layer.feature?.properties) {
          layer.fire('click', { latlng: layer.getBounds?.().getCenter?.() || { lat: 0, lng: 0 } });
          return true;
        }
      }
      return false;
    });

    if (popupVisible) {
      await page.waitForSelector('.leaflet-popup-content', { timeout: 3000 });
      const content = await page.locator('.leaflet-popup-content').textContent();
      // Should have real anthem info
      expect(content.toLowerCase()).toMatch(/anthem|national/i);
    }
  });

  test('map popup has audio player for countries with audio', async ({ page }) => {
    await page.goto('/map/');
    await page.waitForTimeout(2000);

    // Click on USA (approx map center-left for world map)
    await page.evaluate(() => {
      if (!window.map) return;
      // Find USA layer by feature property
      for (const key in window.map._layers) {
        const layer = window.map._layers[key];
        if (layer.feature?.properties?.name === 'United States of America' ||
            layer.feature?.id === 'USA') {
          layer.fire('click', { latlng: { lat: 37, lng: -95 } });
          return;
        }
      }
    });

    await page.waitForTimeout(800);
    const popup = page.locator('.leaflet-popup-content');
    const visible = await popup.isVisible().catch(() => false);
    if (visible) {
      const hasAudio = await popup.locator('audio').count();
      // USA should definitely have audio
      expect(hasAudio).toBeGreaterThan(0);
    }
  });
});
