const { test, expect } = require('@playwright/test');

test.describe('Spanish locale smoke tests', () => {
  test('homepage renders Spanish content and language switcher', async ({ page }) => {
    await page.goto('/es/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { level: 1, name: /Anthem World/i })).toBeVisible();
    await expect(page.getByText('Descubre, explora y clasifica los himnos nacionales')).toBeVisible();
    await expect(page.locator('nav').getByText('Inicio', { exact: true }).first()).toBeVisible();
    await expect(page.locator('nav').getByText('Mapa', { exact: true }).first()).toBeVisible();
    await expect(page.locator('nav').getByText('Países', { exact: true }).first()).toBeVisible();
    await expect(page.locator('#languageMenu')).toHaveText(/Idioma: Español/);
  });

  test('countries page renders translated headings', async ({ page }) => {
    await page.goto('/es/countries/');

    await expect(page.getByRole('heading', { level: 1, name: 'Países e himnos nacionales' })).toBeVisible();
    await expect(page.locator('nav').getByText('Países', { exact: true }).first()).toBeVisible();
  });

  test('map page renders translated instructions', async ({ page }) => {
    await page.goto('/es/map/');

    await expect(page.getByRole('heading', { level: 1, name: 'Mapa interactivo del mundo' })).toBeVisible();
    await expect(page.getByText('Haz clic en cualquier país para ver la información de su himno nacional.')).toBeVisible();
    await expect(page.getByText('Cómo usarlo:')).toBeVisible();
  });

  test('language switcher keeps equivalent translated top-level page', async ({ page }) => {
    await page.goto('/es/game/');

    await page.locator('#languageMenu').click();
    const englishLink = page.locator('.dropdown-menu').getByText('English', { exact: true });
    await expect(englishLink).toHaveAttribute('href', '/game/');
  });

  test('language switcher falls back to localized section page for untranslated country detail', async ({ page }) => {
    await page.goto('/countries/usa/');

    await page.locator('#languageMenu').click();
    const spanishLink = page.locator('.dropdown-menu').getByText('Español', { exact: true });
    await expect(spanishLink).toHaveAttribute('href', '/es/countries/usa/');
  });

  test('spanish country detail page renders translated chrome', async ({ page }) => {
    await page.goto('/es/countries/usa/');
    await expect(page.locator('#country-content')).toBeVisible();

    await expect(page.locator('.breadcrumb').getByText('Inicio', { exact: true })).toBeVisible();
    await expect(page.locator('.breadcrumb').getByText('Países', { exact: true })).toBeVisible();
    await expect(page.locator('#cd-anthem-card').getByText('Himno nacional', { exact: true })).toBeVisible();
    await expect(page.locator('#cd-audio-card')).toBeVisible();
    await expect(page.locator('#cd-audio-card').getByText('Escuchar', { exact: true })).toBeVisible();
  });

  test('english country detail switcher keeps same country in spanish', async ({ page }) => {
    await page.goto('/countries/fra/');

    await page.locator('#languageMenu').click();
    const spanishLink = page.locator('.dropdown-menu').getByText('Español', { exact: true });
    await expect(spanishLink).toHaveAttribute('href', '/es/countries/fra/');
  });
});
