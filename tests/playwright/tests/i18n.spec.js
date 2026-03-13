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
});
