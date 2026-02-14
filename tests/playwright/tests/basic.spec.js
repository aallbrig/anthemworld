const { test, expect } = require('@playwright/test');

test.describe('Basic Site Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    // Should load in under 2 seconds
    expect(loadTime).toBeLessThan(2000);

    // Check title
    await expect(page).toHaveTitle(/Anthem World/);

    // Check for main content
    await expect(page.locator('h1')).toContainText('Anthem World');

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('map page loads successfully', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const startTime = Date.now();
    await page.goto('/map/');
    const loadTime = Date.now() - startTime;

    // Should load in under 2 seconds
    expect(loadTime).toBeLessThan(2000);

    // Check for map container
    const mapElement = page.locator('#map');
    await expect(mapElement).toBeVisible();

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('countries page loads successfully', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const startTime = Date.now();
    await page.goto('/countries/');
    const loadTime = Date.now() - startTime;

    // Should load in under 2 seconds
    expect(loadTime).toBeLessThan(2000);

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
      failedRequests.push({
        url: request.url(),
        failure: request.failure()
      });
    });

    await page.goto('/');
    await page.goto('/map/');
    await page.goto('/countries/');

    // Should have no failed requests
    expect(failedRequests).toHaveLength(0);
  });
});
