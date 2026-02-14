const { test, expect } = require('@playwright/test');

test.describe('QR Code Widget Tests', () => {
  test('QR code widget generates on page load', async ({ page }) => {
    await page.goto('/');

    // Wait for QR code to generate
    await page.waitForTimeout(1000);

    // Check if QR code container exists
    const qrContainer = page.locator('#qrcode-container');
    await expect(qrContainer).toBeVisible();

    // Check if QR code has been generated (canvas or img element)
    const qrCodeGenerated = await page.evaluate(() => {
      const container = document.getElementById('qrcode-container');
      return container && (
        container.querySelector('canvas') !== null ||
        container.querySelector('img') !== null
      );
    });

    expect(qrCodeGenerated).toBe(true);
  });

  test('QR code contains current page URL', async ({ page }) => {
    await page.goto('/map/');

    // Wait for QR code to generate
    await page.waitForTimeout(1000);

    // Check if URL display shows current page
    const urlDisplay = page.locator('#current-url');
    const urlText = await urlDisplay.textContent();

    expect(urlText).toContain('/map/');
  });

  test('QR code updates on different pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const homeUrl = await page.locator('#current-url').textContent();

    await page.goto('/countries/');
    await page.waitForTimeout(1000);

    const countriesUrl = await page.locator('#current-url').textContent();

    // URLs should be different
    expect(homeUrl).not.toEqual(countriesUrl);
  });
});
