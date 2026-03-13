const { test, expect } = require('@playwright/test');

test.describe('Spanish locale smoke tests', () => {
  test('homepage renders Spanish content and language switcher', async ({ page }) => {
    await page.goto('/es/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { level: 1, name: /Anthem World/i })).toBeVisible();
    await expect(page.getByText('Descubre, explora y clasifica los himnos nacionales')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mapa' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Países' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Idioma: Español/ })).toBeVisible();
  });

  test('countries page renders translated headings', async ({ page }) => {
    await page.goto('/es/countries/');

    await expect(page.getByRole('heading', { level: 1, name: 'Países e himnos nacionales' })).toBeVisible();
    await expect(page.getByText('Explora y busca entre los 193 países reconocidos por la ONU')).toBeVisible();
  });

  test('map page renders translated instructions', async ({ page }) => {
    await page.goto('/es/map/');

    await expect(page.getByRole('heading', { level: 1, name: 'Mapa interactivo del mundo' })).toBeVisible();
    await expect(page.getByText('Haz clic en cualquier país para ver la información de su himno nacional.')).toBeVisible();
    await expect(page.getByText('Cómo usarlo:')).toBeVisible();
  });

  test('language switcher keeps equivalent translated top-level page', async ({ page }) => {
    await page.goto('/es/game/');

    await page.getByRole('link', { name: /Idioma: Español/ }).click();
    const englishLink = page.getByRole('link', { name: 'English' });
    await expect(englishLink).toHaveAttribute('href', '/game/');
  });

  test('language switcher falls back to localized section page for untranslated country detail', async ({ page }) => {
    await page.goto('/countries/usa/');

    await page.getByRole('link', { name: /Language: English/ }).click();
    const spanishLink = page.getByRole('link', { name: 'Español' });
    await expect(spanishLink).toHaveAttribute('href', '/es/countries/');
  });
});
