// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Écran démo salon (/demo/) : boot, autocomplétion, validation de l'API.
 * La génération complète (IA + écritures Supabase) n'est pas testée ici :
 * elle dépend de clés absentes du contexte local et crée des données réelles.
 */

test.describe('Démo salon - /demo/', () => {
  test('0.32.1 - la page se charge avec le champ commune', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('votre commune');
    await expect(page.locator('#commune-input')).toBeVisible();
    await expect(page.locator('#commune-input')).toBeFocused();
  });

  test('0.32.2 - l\'autocomplétion propose des communes réelles', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await page.locator('#commune-input').fill('Bourg-en-Br');
    const suggestions = page.locator('#suggestions li');
    await expect(suggestions.first()).toBeVisible({ timeout: 10000 });
    await expect(suggestions.first()).toContainText('Bourg-en-Bresse');
  });

  test('0.32.3 - l\'API refuse un code commune invalide', async ({ request }) => {
    const resp = await request.get('/api/demo-generate?commune=abc');
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('invalide');
  });
});
