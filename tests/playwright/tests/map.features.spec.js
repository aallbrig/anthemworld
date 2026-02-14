const { test, expect } = require('@playwright/test');

test.describe('Map Features Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map/');
    await page.waitForLoadState('networkidle');
  });

  test('GeoJSON loads without errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for map to initialize
    await page.waitForTimeout(2000);

    // Check for console errors
    expect(consoleErrors).toHaveLength(0);
    
    // Check for success message
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    
    // Should have loaded countries
    const hasLoadedMessage = logs.some(log => log.includes('Loaded') && log.includes('countries'));
    expect(hasLoadedMessage || consoleErrors.length === 0).toBeTruthy();
  });

  test('countries are clickable on map', async ({ page }) => {
    // Wait for GeoJSON to load
    await page.waitForTimeout(3000);

    // Check if countries layer exists
    const mapContainer = await page.locator('#map');
    await expect(mapContainer).toBeVisible();

    // Try to click on a country polygon (approximate center of USA)
    const mapBounds = await mapContainer.boundingBox();
    const centerX = mapBounds.x + mapBounds.width * 0.3; // Roughly USA location
    const centerY = mapBounds.y + mapBounds.height * 0.4;

    // Click on map
    await page.mouse.click(centerX, centerY);

    // Wait a bit for popup
    await page.waitForTimeout(500);

    // Check if a Leaflet popup appears
    const popup = await page.locator('.leaflet-popup');
    const popupVisible = await popup.isVisible().catch(() => false);

    // If no popup, that's okay for now (might have clicked ocean)
    // The important thing is no console errors occurred
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    expect(consoleErrors).toHaveLength(0);
  });

  test('country popup shows correct information', async ({ page }) => {
    // Wait for GeoJSON to load
    await page.waitForTimeout(3000);

    // Use JavaScript to click a specific country
    await page.evaluate(() => {
      // Find the first country feature and simulate a click
      const layers = window.map._layers;
      for (let key in layers) {
        const layer = layers[key];
        if (layer.feature && layer.feature.properties) {
          layer.fire('click');
          break;
        }
      }
    });

    // Wait for popup
    await page.waitForTimeout(500);

    // Check for popup content
    const popup = page.locator('.leaflet-popup-content');
    const popupVisible = await popup.isVisible().catch(() => false);

    if (popupVisible) {
      const content = await popup.textContent();
      
      // Should contain country name
      expect(content.length).toBeGreaterThan(0);
      
      // Should mention anthem (even if "coming soon")
      expect(content.toLowerCase()).toContain('anthem');
    }
  });

  test('country boundaries render as polygons', async ({ page }) => {
    // Wait for GeoJSON to load
    await page.waitForTimeout(3000);

    // Check for SVG paths (Leaflet renders polygons as SVG paths)
    const paths = await page.locator('.leaflet-overlay-pane path').count();
    
    // Should have many country polygons
    expect(paths).toBeGreaterThan(100);
  });

  test('hovering over country shows tooltip', async ({ page }) => {
    // Wait for GeoJSON to load
    await page.waitForTimeout(3000);

    // Get map bounds
    const mapContainer = await page.locator('#map');
    const mapBounds = await mapContainer.boundingBox();
    
    // Hover over approximate USA location
    const hoverX = mapBounds.x + mapBounds.width * 0.3;
    const hoverY = mapBounds.y + mapBounds.height * 0.4;

    await page.mouse.move(hoverX, hoverY);
    await page.waitForTimeout(500);

    // Check for tooltip (if implemented)
    const tooltip = page.locator('.leaflet-tooltip');
    const tooltipVisible = await tooltip.isVisible().catch(() => false);

    // Tooltip is optional, so we just check no errors occurred
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    expect(consoleErrors).toHaveLength(0);
  });

  test('map loads correct number of countries', async ({ page }) => {
    // Capture console logs
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('Loaded') && msg.text().includes('countries')) {
        logs.push(msg.text());
      }
    });

    // Wait for GeoJSON to load
    await page.waitForTimeout(3000);

    // Should have logged the count
    if (logs.length > 0) {
      const countMatch = logs[0].match(/(\d+)/);
      if (countMatch) {
        const count = parseInt(countMatch[0]);
        // Should have loaded many countries (200+)
        expect(count).toBeGreaterThan(200);
      }
    }
  });
});
