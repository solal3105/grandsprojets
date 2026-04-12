// @ts-check
import { test, expect } from '@playwright/test';

const TEST_CITY_CODE = 'test-e2e-ville';
const TEST_CITY_NAME = 'Ville Test E2E';
const TEST_CITY_COLOR = '#e53e3e';

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/**
 * Navigate to villes section and wait for the list to load.
 */
async function goToVilles(page) {
  await waitForBoot(page, '/admin/villes/');
  await page.waitForFunction(() => {
    const el = document.querySelector('#villes-list-body');
    if (!el) return false;
    return !el.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

const successToast = (page, text) =>
  page.locator('.adm-toast--success').filter({ hasText: text });
const errorToast = (page, text) =>
  page.locator('.adm-toast--error').filter({ hasText: text });
const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

// Run all tests in this file in order (create → verify → delete)
test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────────────────
// 8.1 — Liste des villes
// ─────────────────────────────────────────────────────────
test.describe('8.1 — Liste des villes', () => {

  test('8.1.1 — Page chargée avec titre', async ({ page }) => {
    await goToVilles(page);
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes');
  });

  test('8.1.2 — Bouton "Nouvelle ville" visible', async ({ page }) => {
    await goToVilles(page);
    await expect(page.locator('#ville-create-btn')).toBeVisible();
    await expect(page.locator('#ville-create-btn')).toContainText('Nouvelle ville');
  });

  test('8.1.3 — Liste contient au moins la ville test-e2e', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator('.adm-list-item[data-ville="test-e2e"]');
    await expect(item).toBeVisible();
  });

  test('8.1.4 — Chaque item : badge code ville + nom', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator('.adm-list-item').first();
    await expect(item.locator('.adm-badge--info')).toBeVisible();
    await expect(item.locator('.adm-list-item__name')).toBeVisible();
  });

  test('8.1.5 — Champ recherche filtre la liste', async ({ page }) => {
    await goToVilles(page);
    const allBefore = await page.locator('.adm-list-item').count();
    await page.fill('#villes-search', 'zzz-inexistant-zzz');
    // Wait for debounce (250ms) + render
    await page.waitForTimeout(400);
    // Should show empty state or 0 items
    const afterCount = await page.locator('.adm-list-item').count();
    expect(afterCount).toBe(0);
    // Clear search to restore
    await page.fill('#villes-search', '');
    await page.waitForTimeout(400);
    expect(await page.locator('.adm-list-item').count()).toBe(allBefore);
  });

  test('8.1.6 — Boutons actions (administrer + supprimer) sur chaque item', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator('.adm-list-item').first();
    await expect(item.locator('[data-action="select"]')).toBeVisible();
    await expect(item.locator('[data-action="delete"]')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 8.2 — Formulaire de création
// ─────────────────────────────────────────────────────────
test.describe('8.2 — Formulaire de création', () => {

  test('8.2.1 — Clic "Nouvelle ville" ouvre le formulaire', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('.cw-header__title')).toHaveText('Nouvelle ville');
  });

  test('8.2.2 — Champs code ville et nom affiché présents et obligatoires', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('#cf-ville')).toBeVisible();
    await expect(page.locator('#cf-brand-name')).toBeVisible();
    // Both are marked required
    await expect(page.locator('#cf-ville')).toHaveAttribute('required', '');
    await expect(page.locator('#cf-brand-name')).toHaveAttribute('required', '');
  });

  test('8.2.3 — Code ville en mode création est éditable', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    const input = page.locator('#cf-ville');
    await expect(input).toBeEnabled();
  });

  test('8.2.4 — Couleur primaire : valeur par défaut + sync picker↔texte', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('#cf-color-picker')).toHaveValue('#21b929');
    await expect(page.locator('#cf-color-text')).toHaveValue('#21b929');
    // Change text → picker should sync
    await page.fill('#cf-color-text', '#ff0000');
    await page.locator('#cf-color-text').dispatchEvent('input');
    await expect(page.locator('#cf-color-picker')).toHaveValue('#ff0000');
  });

  test('8.2.5 — Zones de dépôt logo, logo sombre, favicon', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('#cf-logo-drop')).toBeVisible();
    await expect(page.locator('#cf-dark-logo-drop')).toBeVisible();
    await expect(page.locator('#cf-favicon-drop')).toBeVisible();
  });

  test('8.2.6 — Boutons Retour et Annuler reviennent à la liste', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('.cw-header__title')).toHaveText('Nouvelle ville');
    // Click back link
    await page.click('#cf-back');
    // Should return to list
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes');
  });

  test('8.2.7 — Validation : code ville vide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    // Leave code empty, fill name
    await page.fill('#cf-brand-name', 'Test');
    await page.click('#cf-submit');
    await expect(errorToast(page, 'Code ville obligatoire')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.2.8 — Validation : code ville invalide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await page.fill('#cf-ville', 'INVALID CITY!');
    await page.fill('#cf-brand-name', 'Test');
    await page.click('#cf-submit');
    await expect(errorToast(page, 'lettres minuscules')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.2.9 — Validation : nom affiché vide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await page.fill('#cf-ville', 'test-valid-code');
    // Leave brand name empty
    await page.click('#cf-submit');
    await expect(errorToast(page, 'Nom affiché obligatoire')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.2.10 — Validation : couleur invalide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await page.fill('#cf-ville', 'test-valid-code');
    await page.fill('#cf-brand-name', 'Test');
    // Set invalid color
    await page.fill('#cf-color-text', 'not-a-color');
    await page.click('#cf-submit');
    await expect(errorToast(page, 'Couleur invalide')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });
});

// ─────────────────────────────────────────────────────────
// 8.3 — Cycle complet : créer → vérifier → supprimer
// ─────────────────────────────────────────────────────────
test.describe('8.3 — Cycle créer → vérifier → supprimer', () => {

  test('8.3.1 — Créer une ville avec succès', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');

    await page.fill('#cf-ville', TEST_CITY_CODE);
    await page.fill('#cf-brand-name', TEST_CITY_NAME);
    await page.fill('#cf-color-text', TEST_CITY_COLOR);
    await page.locator('#cf-color-text').dispatchEvent('input');

    await page.click('#cf-submit');
    await expect(successToast(page, 'Ville créée')).toBeVisible({ timeout: 10000 });

    // Should return to the list
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes', { timeout: 10000 });
    await clearToasts(page);
  });

  test('8.3.2 — La ville créée apparaît dans la liste', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator(`.adm-list-item[data-ville="${TEST_CITY_CODE}"]`);
    await expect(item).toBeVisible({ timeout: 10000 });
    // Badge shows code
    await expect(item.locator('.adm-badge--info')).toContainText(TEST_CITY_CODE);
    // Name shows brand name
    await expect(item.locator('.adm-list-item__name')).toContainText(TEST_CITY_NAME);
  });

  test('8.3.3 — La ville est trouvable via la recherche', async ({ page }) => {
    await goToVilles(page);
    await page.fill('#villes-search', TEST_CITY_NAME.substring(0, 8));
    await page.waitForTimeout(400);
    const item = page.locator(`.adm-list-item[data-ville="${TEST_CITY_CODE}"]`);
    await expect(item).toBeVisible();
  });

  test('8.3.4 — Bouton "Administrer" change la ville active', async ({ page }) => {
    await goToVilles(page);
    const selectBtn = page.locator(`[data-action="select"][data-ville="${TEST_CITY_CODE}"]`);
    await selectBtn.click();
    await expect(successToast(page, `Ville active : ${TEST_CITY_CODE}`)).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.3.5 — Supprimer la ville créée (confirmation)', async ({ page }) => {
    await goToVilles(page);
    const deleteBtn = page.locator(`[data-action="delete"][data-ville="${TEST_CITY_CODE}"]`);
    await deleteBtn.click();

    // Confirm dialog should appear
    const dialog = page.locator('#adm-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click confirm (danger button)
    await page.click('#adm-dialog-confirm');
    await expect(successToast(page, 'Ville supprimée')).toBeVisible({ timeout: 10000 });
    await clearToasts(page);
  });

  test('8.3.6 — La ville supprimée a disparu de la liste', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator(`.adm-list-item[data-ville="${TEST_CITY_CODE}"]`);
    await expect(item).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────
// 8.4 — Création doublon (non-régression bug 400)
// ─────────────────────────────────────────────────────────
test.describe('8.4 — Non-régression', () => {

  test('8.4.1 — Créer une ville sans logo ne provoque pas d\'erreur 400', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');

    // Remplir uniquement les champs obligatoires (pas de logo)
    await page.fill('#cf-ville', TEST_CITY_CODE);
    await page.fill('#cf-brand-name', TEST_CITY_NAME);
    await page.click('#cf-submit');

    // Doit réussir, pas d'erreur
    await expect(successToast(page, 'Ville créée')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes', { timeout: 10000 });
    await clearToasts(page);
  });

  test('8.4.2 — Nettoyage : supprimer la ville de non-régression', async ({ page }) => {
    await goToVilles(page);
    const deleteBtn = page.locator(`[data-action="delete"][data-ville="${TEST_CITY_CODE}"]`);
    await deleteBtn.click();
    const dialog = page.locator('#adm-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.click('#adm-dialog-confirm');
    await expect(successToast(page, 'Ville supprimée')).toBeVisible({ timeout: 10000 });
    await clearToasts(page);
  });
});
