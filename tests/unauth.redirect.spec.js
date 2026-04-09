// @ts-check
import { test, expect } from '@playwright/test';

test.describe('0.1 — Redirection non-authentifié', () => {

  test('0.1.1 — /admin/ sans session → redirect /login/', async ({ page }) => {
    await page.goto('/admin/', { waitUntil: 'commit' });
    await page.waitForURL('**/login/**', { timeout: 15000 });
    const url = page.url();
    expect(url).toContain('/login/');
    expect(url).toContain('redirect=');
  });

  test('0.1.2 — /admin/categories/ sans session → redirect /login/', async ({ page }) => {
    await page.goto('/admin/categories/', { waitUntil: 'commit' });
    await page.waitForURL('**/login/**', { timeout: 30000 });
    const url = page.url();
    expect(url).toContain('/login/');
    // Le store redirige toujours vers /login/?redirect=/admin/ (hardcodé)
    expect(url).toContain('redirect=');
  });

  test('0.1.3 — Session invalide → redirect /login/', async ({ page }) => {
    // Écrire un token invalide dans localStorage
    await page.goto('/login/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('grandsprojets-auth', 'corrupted-token');
    });
    // Naviguer vers /admin/ avec ce token corrompu
    await page.goto('/admin/', { waitUntil: 'commit' });
    await page.waitForURL('**/login/**', { timeout: 15000 });
    expect(page.url()).toContain('/login/');
  });

});
