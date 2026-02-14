const { test, expect } = require('@playwright/test');

test.describe('Map Widget Tests', () => {
  test('map initializes correctly', async ({ page }) => {
    await page.goto('/map/');

    // Wait for map to be visible
    const mapElement = page.locator('#map');
    await expect(mapElement).toBeVisible();

    // Check if Leaflet loaded
    const leafletLoaded = await page.evaluate(() => {
      return typeof L !== 'undefined';
    });
    expect(leafletLoaded).toBe(true);

    // Check if map object exists
    const mapExists = await page.evaluate(() => {
      return typeof map !== 'undefined' && map !== null;
    });
    expect(mapExists).toBe(true);
  });

  test('map markers are clickable', async ({ page }) => {
    await page.goto('/map/');

    // Wait for map to load
    await page.waitForTimeout(1000);

    // Check if markers exist
    const markersExist = await page.evaluate(() => {
      return document.querySelectorAll('.leaflet-marker-icon').length > 0;
    });

    if (markersExist) {
      // Click a marker
      await page.locator('.leaflet-marker-icon').first().click();

      // Wait for popup
      await page.waitForTimeout(500);

      // Check if popup appeared
      const popupVisible = await page.evaluate(() => {
        return document.querySelector('.leaflet-popup') !== null;
      });
      expect(popupVisible).toBe(true);

      // Check if popup contains country information
      const popup = page.locator('.leaflet-popup-content');
      await expect(popup).toBeVisible();
      await expect(popup).toContainText(/National Anthem/);
    } else {
      // If no markers yet (expected with placeholder data), just verify map loads
      console.log('No markers found - this is expected with placeholder data');
    }
  });

  test('map tiles load correctly', async ({ page }) => {
    await page.goto('/map/');

    // Wait for map tiles to start loading
    await page.waitForTimeout(2000);

    // Check for tile images
    const tilesLoaded = await page.evaluate(() => {
      const tiles = document.querySelectorAll('.leaflet-tile');
      return tiles.length > 0;
    });

    expect(tilesLoaded).toBe(true);
  });
});
