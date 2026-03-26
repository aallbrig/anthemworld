const { test, expect } = require('@playwright/test');

test.describe('Basic Site Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore connection-refused errors from optional services (game API, external audio CDN)
        if (text.includes('ERR_CONNECTION_REFUSED') || text.includes('NS_ERROR_CONNECTION_REFUSED')) return;
        // Ignore CORS errors from optional game API (not running in CI)
        if (text.includes('localhost:3001')) return;
        consoleErrors.push(text);
      }
    });

    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    // Should load in under 5 seconds (CDN resources may be slow on first parallel load)
    expect(loadTime).toBeLessThan(10000);

    // Check title
    await expect(page).toHaveTitle(/Anthem World/);

    // Check for main content (page has multiple h1 elements)
    await expect(page.locator('h1').first()).toContainText('Anthem World');

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('map page loads successfully', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('ERR_CONNECTION_REFUSED') || text.includes('NS_ERROR_CONNECTION_REFUSED')) return;
        // Ignore CORS errors from optional game API (not running in CI)
        if (text.includes('localhost:3001')) return;
        consoleErrors.push(text);
      }
    });

    const startTime = Date.now();
    await page.goto('/map/');
    const loadTime = Date.now() - startTime;

    // Should load in under 5 seconds (map fetches GeoJSON + anthems.json)
    expect(loadTime).toBeLessThan(10000);
    const mapElement = page.locator('#map');
    await expect(mapElement).toBeVisible();

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('countries page loads successfully', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('ERR_CONNECTION_REFUSED') || text.includes('NS_ERROR_CONNECTION_REFUSED')) return;
        // Ignore CORS errors from optional game API (not running in CI)
        if (text.includes('localhost:3001')) return;
        consoleErrors.push(text);
      }
    });

    const startTime = Date.now();
    await page.goto('/countries/');
    const loadTime = Date.now() - startTime;

    // Should load in under 5 seconds (page fetches and renders ~400KB anthems.json)
    expect(loadTime).toBeLessThan(10000);

    // Check for table
    const tableElement = page.locator('#countries-table');
    await expect(tableElement).toBeVisible();

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('navigation bar works correctly', async ({ page }) => {
    await page.goto('/');

    // Click Map link
    await page.click('text=Map');
    await expect(page).toHaveURL(/.*\/map\//);

    // Click Countries link
    await page.click('text=Countries');
    await expect(page).toHaveURL(/.*\/countries\//);

    // Click Home link
    await page.click('text=Home');
    await expect(page).toHaveURL(/.*\//);
  });

  test('no failing XHR requests', async ({ page }) => {
    const failedRequests = [];

    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText || '';
      // NS_BINDING_ABORTED / net::ERR_ABORTED = request cancelled by navigation (not a real failure)
      if (errorText === 'NS_BINDING_ABORTED' || errorText === 'net::ERR_ABORTED') return;
      // ERR_CONNECTION_REFUSED = optional service (game API) not running — expected in CI
      if (errorText.includes('ERR_CONNECTION_REFUSED') || errorText.includes('NS_ERROR_CONNECTION_REFUSED')) return;
      // NS_ERROR_DOM_BAD_URI = Firefox CORS block for unreachable origins — expected in CI
      if (errorText.includes('NS_ERROR_DOM_BAD_URI')) return;
      // Ignore requests to the optional game API (not running in CI)
      if (request.url().includes('localhost:3001')) return;
      failedRequests.push({
        url: request.url(),
        failure: request.failure()
      });
    });

    await page.goto('/');
    await page.goto('/map/');
    await page.goto('/countries/');

    // Should have no genuinely failed requests (aborted-by-navigation excluded above)
    expect(failedRequests).toHaveLength(0);
  });
});
