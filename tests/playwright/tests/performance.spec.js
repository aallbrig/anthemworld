const { test, expect } = require('@playwright/test');

test.describe('Performance Tests', () => {
  test('homepage loads within performance budget', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    console.log(`Homepage load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(2000);
  });

  test('map page loads within performance budget', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/map/');
    const loadTime = Date.now() - startTime;

    console.log(`Map page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(2000);
  });

  test('countries page loads within performance budget', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/countries/');
    const loadTime = Date.now() - startTime;

    console.log(`Countries page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(2000);
  });

  test('no resource loading errors', async ({ page }) => {
    const failedResources = [];

    page.on('response', response => {
      if (!response.ok() && response.status() !== 304) {
        failedResources.push({
          url: response.url(),
          status: response.status()
        });
      }
    });

    await page.goto('/');
    await page.goto('/map/');
    await page.goto('/countries/');

    console.log('Failed resources:', failedResources);
    expect(failedResources).toHaveLength(0);
  });
});
