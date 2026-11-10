// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Villes : la page, réservée aux super administrateurs, qui crée et supprime
 * les villes (city_branding).
 *
 * Le compte de la suite est un administrateur de ville (test-e2e), pas un
 * super administrateur : la page lui est fermée (8.0) et la base refuse qu'il
 * crée une ville, quoi qu'il arrive (8.0.3). Pour parcourir la liste et le
 * formulaire, 8.1 à 8.4 font croire au client qu'il est super administrateur en
 * interceptant la lecture du profil : la liste se charge (lecture publique), le
 * formulaire contrôle la saisie, et la création est refusée par la base. C'est
 * ce qu'on veut prouver : l'interface ne suffit pas à créer une ville.
 *
 * 8.5 vérifie la même chose pour ce qui appartient à une ville (catégories,
 * modules, projets, dossiers de concertation) et pour le catalogue commun.
 * Chaque refus est un essai sans effet : rien n'est écrit tant que la base
 * tient, et la ligne est retirée aussitôt si elle ne tenait plus.
 *
 * Le cycle réel « créer puis supprimer une ville » demande un vrai super
 * administrateur : il n'est pas dans la suite. Les règles elles-mêmes sont
 * rejouées sur une base locale par supabase/tests/ecritures-par-ville.sql.
 */

const TEST_CITY_CODE = 'test-e2e-ville';
const TEST_CITY_NAME = 'Ville Test E2E';
const TEST_CITY_COLOR = '#e53e3e';
// Une ville qui n'existe pas et qui n'est pas celle du compte : une ligne qui
// passerait malgré tout n'apparaîtrait sur aucune carte.
const OTHER_CITY = 'test-e2e-autre';
const RLS_REFUSAL = 'row-level security';

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/** Le client se croit super administrateur : la lecture de SON profil est interceptée. */
async function pretendGlobalAdmin(page) {
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/profiles') && (url.searchParams.get('id') || '').startsWith('eq.'),
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'admin', ville: ['global', 'test-e2e'] }),
    }),
  );
}

/**
 * Navigate to villes section, as a pretended super admin, and wait for the list to load.
 */
async function goToVilles(page) {
  await pretendGlobalAdmin(page);
  await waitForBoot(page, '/admin/villes/');
  await page.waitForFunction(() => {
    const el = document.querySelector('#villes-list-body');
    if (!el) return false;
    return !el.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

/**
 * Tente une insertion en appel direct, avec la session du navigateur. Rend le
 * message d'erreur de la base. Si la base laissait passer la ligne, elle est
 * retirée aussitôt (et le test échoue sur le message attendu).
 */
async function tryInsert(page, table, row, match) {
  return page.evaluate(async ({ table, row, match }) => {
    const client = window.AuthModule.getClient();
    const { error } = await client.from(table).insert(row);
    if (!error) await client.from(table).delete().match(match);
    return error?.message || 'insertion acceptée';
  }, { table, row, match });
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
// 8.0 - Accès : administrateur de ville
// ─────────────────────────────────────────────────────────
test.describe('8.0 - Villes : fermé à un administrateur de ville', () => {

  test('8.0.1 - Le lien Villes est masqué dans la navigation', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="villes"]')).toBeHidden();
  });

  test('8.0.2 - L\'adresse directe affiche la page réservée, sans liste ni création', async ({ page }) => {
    await waitForBoot(page, '/admin/villes/');
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes');
    await expect(page.locator('#villes-reserved')).toContainText('réservée aux super administrateurs');
    await expect(page.locator('#villes-reserved')).toContainText('Structure');
    await expect(page.locator('#ville-create-btn')).toHaveCount(0);
    await expect(page.locator('#villes-list-body')).toHaveCount(0);
    await expect(page.locator('.adm-list-item')).toHaveCount(0);
  });

  test('8.0.3 - La base refuse la création d\'une ville même en appel direct', async ({ page }) => {
    await waitForBoot(page);
    const message = await tryInsert(page, 'city_branding',
      { ville: OTHER_CITY, brand_name: 'Refus attendu', logo_url: '', dark_logo_url: '', favicon_url: '' },
      { ville: OTHER_CITY });
    expect(message).toContain(RLS_REFUSAL);
    const present = await page.evaluate(async (ville) => {
      const { data } = await window.AuthModule.getClient().from('city_branding').select('ville').eq('ville', ville);
      return (data || []).length;
    }, OTHER_CITY);
    expect(present).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// 8.1 - Liste des villes
// ─────────────────────────────────────────────────────────
test.describe('8.1 - Liste des villes', () => {

  test('8.1.1 - Page chargée avec titre', async ({ page }) => {
    await goToVilles(page);
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes');
  });

  test('8.1.2 - Bouton "Nouvelle ville" visible', async ({ page }) => {
    await goToVilles(page);
    await expect(page.locator('#ville-create-btn')).toBeVisible();
    await expect(page.locator('#ville-create-btn')).toContainText('Nouvelle ville');
  });

  test('8.1.3 - Liste contient au moins la ville test-e2e', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator('.adm-list-item[data-ville="test-e2e"]');
    await expect(item).toBeVisible();
  });

  test('8.1.4 - Chaque item : badge code ville + nom', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator('.adm-list-item').first();
    await expect(item.locator('.adm-badge--info')).toBeVisible();
    await expect(item.locator('.adm-list-item__name')).toBeVisible();
  });

  test('8.1.5 - Champ recherche filtre la liste', async ({ page }) => {
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

  test('8.1.6 - Boutons actions (administrer + supprimer) sur chaque item', async ({ page }) => {
    await goToVilles(page);
    const item = page.locator('.adm-list-item').first();
    await expect(item.locator('[data-action="select"]')).toBeVisible();
    await expect(item.locator('[data-action="delete"]')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 8.2 - Formulaire de création
// ─────────────────────────────────────────────────────────
test.describe('8.2 - Formulaire de création', () => {

  test('8.2.1 - Clic "Nouvelle ville" ouvre le formulaire', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('.cw-header__title')).toHaveText('Nouvelle ville');
  });

  test('8.2.2 - Champs code ville et nom affiché présents et obligatoires', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('#cf-ville')).toBeVisible();
    await expect(page.locator('#cf-brand-name')).toBeVisible();
    // Both are marked required
    await expect(page.locator('#cf-ville')).toHaveAttribute('required', '');
    await expect(page.locator('#cf-brand-name')).toHaveAttribute('required', '');
  });

  test('8.2.3 - Code ville en mode création est éditable', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    const input = page.locator('#cf-ville');
    await expect(input).toBeEnabled();
  });

  test('8.2.4 - Couleur primaire : valeur par défaut + sync picker↔texte', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('#cf-color-picker')).toHaveValue('#14ae5c');
    await expect(page.locator('#cf-color-text')).toHaveValue('#14AE5C');
    // Change text → picker should sync
    await page.fill('#cf-color-text', '#ff0000');
    await page.locator('#cf-color-text').dispatchEvent('input');
    await expect(page.locator('#cf-color-picker')).toHaveValue('#ff0000');
  });

  test('8.2.5 - Zones de dépôt logo, logo sombre, favicon', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('#cf-logo-drop')).toBeVisible();
    await expect(page.locator('#cf-dark-logo-drop')).toBeVisible();
    await expect(page.locator('#cf-favicon-drop')).toBeVisible();
  });

  test('8.2.6 - Boutons Retour et Annuler reviennent à la liste', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await expect(page.locator('.cw-header__title')).toHaveText('Nouvelle ville');
    // Click back link
    await page.click('#cf-back');
    // Should return to list
    await expect(page.locator('.adm-page-title')).toContainText('Gestion des villes');
  });

  test('8.2.7 - Validation : code ville vide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    // Leave code empty, fill name
    await page.fill('#cf-brand-name', 'Test');
    await page.click('#cf-submit');
    await expect(errorToast(page, 'Code ville obligatoire')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.2.8 - Validation : code ville invalide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await page.fill('#cf-ville', 'INVALID CITY!');
    await page.fill('#cf-brand-name', 'Test');
    await page.click('#cf-submit');
    await expect(errorToast(page, 'lettres minuscules')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.2.9 - Validation : nom affiché vide → toast erreur', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');
    await page.fill('#cf-ville', 'test-valid-code');
    // Leave brand name empty
    await page.click('#cf-submit');
    await expect(errorToast(page, 'Nom affiché obligatoire')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });

  test('8.2.10 - Validation : couleur invalide → toast erreur', async ({ page }) => {
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
// 8.3 - La création proposée par l'interface
// ─────────────────────────────────────────────────────────
test.describe('8.3 - L\'interface ne suffit pas à créer une ville', () => {

  test('8.3.1 - La création est refusée par la base, le formulaire reste ouvert', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');

    await page.fill('#cf-ville', TEST_CITY_CODE);
    await page.fill('#cf-brand-name', TEST_CITY_NAME);
    await page.fill('#cf-color-text', TEST_CITY_COLOR);
    await page.locator('#cf-color-text').dispatchEvent('input');

    const answered = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/rest/v1/city_branding'));
    await page.click('#cf-submit');
    expect((await answered).status()).toBe(403);

    await expect(errorToast(page, RLS_REFUSAL)).toBeVisible({ timeout: 10000 });
    await expect(successToast(page, 'Ville créée')).toHaveCount(0);
    // Le formulaire reste ouvert et le bouton redevient utilisable
    await expect(page.locator('.cw-header__title')).toHaveText('Nouvelle ville');
    await expect(page.locator('#cf-submit')).toBeEnabled();
    await clearToasts(page);
  });

  test('8.3.2 - Aucune ville n\'a été créée', async ({ page }) => {
    await goToVilles(page);
    await expect(page.locator(`.adm-list-item[data-ville="${TEST_CITY_CODE}"]`)).toHaveCount(0);
  });

  test('8.3.3 - Bouton "Administrer" change la ville active', async ({ page }) => {
    await goToVilles(page);
    await page.locator('[data-action="select"][data-ville="test-e2e"]').click();
    await expect(successToast(page, 'Ville active : test-e2e')).toBeVisible({ timeout: 5000 });
    await clearToasts(page);
  });
});

// ─────────────────────────────────────────────────────────
// 8.4 - Non-régression (ancienne erreur 400 à la création sans logo)
// ─────────────────────────────────────────────────────────
test.describe('8.4 - Non-régression', () => {

  test('8.4.1 - Créer une ville sans logo envoie des images vides, jamais nulles', async ({ page }) => {
    await goToVilles(page);
    await page.click('#ville-create-btn');

    // Remplir uniquement les champs obligatoires (pas de logo)
    await page.fill('#cf-ville', TEST_CITY_CODE);
    await page.fill('#cf-brand-name', TEST_CITY_NAME);

    const sent = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/rest/v1/city_branding'));
    await page.click('#cf-submit');
    const [row] = [(await sent).postDataJSON()].flat();

    // Les colonnes d'image de city_branding refusent le nul : c'était l'erreur 400.
    expect(row.ville).toBe(TEST_CITY_CODE);
    expect(row.brand_name).toBe(TEST_CITY_NAME);
    expect(row.logo_url).toBe('');
    expect(row.dark_logo_url).toBe('');
    expect(row.favicon_url).toBe('');
    await expect(errorToast(page, RLS_REFUSAL)).toBeVisible({ timeout: 10000 });
    await clearToasts(page);
  });
});

// ─────────────────────────────────────────────────────────
// 8.5 - Chaque écriture est limitée aux villes du compte
// ─────────────────────────────────────────────────────────
test.describe('8.5 - La base refuse d\'écrire hors de sa ville', () => {

  test('8.5.1 - Catégories, modules et projets d\'une autre ville', async ({ page }) => {
    await waitForBoot(page);
    expect(await tryInsert(page, 'category_icons',
      { ville: OTHER_CITY, category: 'refus-attendu', icon_class: 'fa-solid fa-ban' },
      { ville: OTHER_CITY, category: 'refus-attendu' })).toContain(RLS_REFUSAL);
    expect(await tryInsert(page, 'city_modules',
      { ville: OTHER_CITY, module_key: 'refus-attendu', label: 'Refus attendu', enabled: false },
      { ville: OTHER_CITY, module_key: 'refus-attendu' })).toContain(RLS_REFUSAL);
    expect(await tryInsert(page, 'contribution_uploads',
      { ville: OTHER_CITY, project_name: 'Refus attendu (essai)', category: 'refus-attendu' },
      { ville: OTHER_CITY, project_name: 'Refus attendu (essai)' })).toContain(RLS_REFUSAL);
  });

  test('8.5.2 - Dossier de concertation sans projet rattaché', async ({ page }) => {
    await waitForBoot(page);
    expect(await tryInsert(page, 'consultation_dossiers',
      { project_name: 'Refus attendu (essai)', category: 'refus-attendu', title: 'Refus attendu', pdf_url: 'https://example.invalid/refus-attendu.pdf' },
      { project_name: 'Refus attendu (essai)' })).toContain(RLS_REFUSAL);
  });

  test('8.5.3 - Catalogue des boutons de la carte, commun à toutes les villes', async ({ page }) => {
    await waitForBoot(page);
    expect(await tryInsert(page, 'ui_toggles',
      { key: 'refus-attendu', icon: 'fa-solid fa-ban', label: 'Refus attendu' },
      { key: 'refus-attendu' })).toContain(RLS_REFUSAL);
  });
});
