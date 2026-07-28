// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Écran démo salon (/demo/) : boot, autocomplétion, validation de l'API,
 * récupération de l'adresse en fin de parcours.
 *
 * La génération complète (IA + écritures Supabase) n'est pas testée ici :
 * elle dépend de clés absentes du contexte local et crée des données réelles.
 * Sont donc testés le contrat d'entrée de l'API, le contrat d'entrée de
 * /api/demo-lead, et les états d'écran qui ne demandent aucune génération.
 *
 * Section : 0.32 - Démo salon
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

  /**
   * Non-régression : la lettre des codes corses est en DEUXIÈME position
   * (2A004), pas en troisième. L'ancien motif \d{2}[0-9AB]\d{2} renvoyait 400
   * pour les 360 communes de Corse, et l'écran enchaînait quatre reprises
   * identiques avant d'abandonner.
   *
   * Les codes utilisés ici ont la BONNE FORME mais ne désignent aucune commune :
   * la validation les laisse passer, puis l'annuaire officiel ne les reconnaît
   * pas et le flux se referme aussitôt. On teste ainsi le contrat d'entrée sans
   * déclencher de vraie génération.
   */
  test('0.32.4 - l\'API accepte la forme des codes commune de Corse', async ({ request }) => {
    for (const insee of ['2A999', '2B999']) {
      const resp = await request.get(`/api/demo-generate?commune=${insee}`);
      expect(resp.status(), `code ${insee} refusé par l'API`).toBe(200);
      expect(await resp.text(), `code ${insee} non transmis à l'annuaire`).toContain('introuvable');
    }
  });

  test('0.32.5 - l\'API accepte la forme métropole et outre-mer', async ({ request }) => {
    for (const insee of ['69999', '97499']) {
      const resp = await request.get(`/api/demo-generate?commune=${insee}`);
      expect(resp.status(), `code ${insee} refusé par l'API`).toBe(200);
      expect(await resp.text(), `code ${insee} non transmis à l'annuaire`).toContain('introuvable');
    }
  });

  test('0.32.6 - l\'écran reconnaît un code commune corse passé en lien', async ({ page }) => {
    await page.goto('/demo/?commune=2A004', { waitUntil: 'domcontentloaded' });
    // Sans `auto=1`, le code est seulement résolu et le nom pré-rempli : c'est
    // la preuve que le motif client accepte la forme corse.
    await expect(page.locator('#commune-input')).toHaveValue('Ajaccio', { timeout: 10000 });
  });

  test('0.32.11 - l\'API refuse un paramètre ville hors préfixe essai-', async ({ request }) => {
    const resp = await request.get('/api/demo-generate?phase=create&ville=metropole-lyon');
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('invalide');
  });
});

test.describe('Démo salon - récupération de l\'adresse', () => {
  test('0.32.7 - le formulaire d\'adresse est présent avec son échappatoire', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    // L'écran de fin est masqué tant qu'aucune génération n'a abouti, mais son
    // contenu doit exister dans le document.
    await expect(page.locator('#lead-form')).toHaveCount(1);
    await expect(page.locator('#lead-email')).toHaveCount(1);
    await expect(page.locator('#lead-skip')).toHaveCount(1);
    await expect(page.locator('#lead-skip')).toContainText('sans laisser');
    // Le bouton de relance n'apparaît que sur une commune déjà générée
    await expect(page.locator('#btn-regen')).toBeHidden();
  });

  test('0.32.8 - /api/demo-lead refuse une adresse invalide', async ({ request }) => {
    const resp = await request.post('/api/demo-lead', {
      data: { email: 'pas-une-adresse', ville: 'essai-vannes' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('mail');
  });

  test('0.32.9 - /api/demo-lead refuse une ville hors préfixe essai-', async ({ request }) => {
    const resp = await request.post('/api/demo-lead', {
      data: { email: 'maire@ville.fr', ville: 'metropole-lyon' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('invalide');
  });

  test('0.32.10 - /api/demo-lead refuse une autre méthode que POST', async ({ request }) => {
    const resp = await request.get('/api/demo-lead');
    expect(resp.status()).toBe(405);
  });
});
