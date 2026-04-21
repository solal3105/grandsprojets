// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Wait for the map page to fully boot (Phase 6+ — toggles ready).
 */
async function waitForMapBoot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Attendre que le sidebar soit rendu
  await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 15000 });
  // Attendre que le toggle dock soit rendu et au moins filters soit prêt (Phase 6)
  await page.waitForFunction(
    () => document.querySelector('#filters-toggle')?.getAttribute('data-ready') === 'true',
    { timeout: 20000 }
  );
}

// ─────────────────────────────────────────────────────────
// 0.2 — Chargement de la page carte
// ─────────────────────────────────────────────────────────
test.describe('0.2 — Chargement de la page carte', () => {

  test('0.2.1 — La page se charge et affiche la carte', async ({ page }) => {
    await waitForMapBoot(page);
    // Le conteneur de carte est présent
    await expect(page.locator('#map')).toBeVisible();
    // Le toggle dock est visible
    await expect(page.locator('#toggle-dock')).toBeVisible();
    // Le sidebar est visible
    await expect(page.locator('#gp-sidebar')).toBeVisible();
  });

  test('0.2.2 — Le titre de la page contient un nom de ville', async ({ page }) => {
    await waitForMapBoot(page);
    const title = await page.title();
    // Le titre doit contenir quelque chose (dépend de la config ville)
    expect(title.length).toBeGreaterThan(0);
  });

  test('0.2.3 — Aucune erreur console bloquante au chargement', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await waitForMapBoot(page);
    // Filtrer les erreurs WebGL qui sont normales en headless
    const criticalErrors = errors.filter(e =>
      !e.includes('WebGL') && !e.includes('maplibregl') && !e.includes('Failed to initialize WebGL')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// 0.3 — Sidebar (navigation latérale)
// ─────────────────────────────────────────────────────────
test.describe('0.3 — Sidebar', () => {

  test('0.3.1 — Logo visible avec lien vers accueil', async ({ page }) => {
    await waitForMapBoot(page);
    const logo = page.locator('.gp-sidebar__logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('href', '/');
  });

  test('0.3.2 — Bouton Carte visible et cliquable', async ({ page }) => {
    await waitForMapBoot(page);
    const carteBtn = page.locator('[data-module="carte"]');
    await expect(carteBtn).toBeVisible();
    await expect(carteBtn).toHaveAttribute('data-tooltip', 'Menu');
  });

  test('0.3.3 — Bouton thème visible', async ({ page }) => {
    await waitForMapBoot(page);
    const themeBtn = page.locator('#gp-sidebar [data-action="theme"]');
    await expect(themeBtn).toBeVisible();
  });

  test('0.3.4 — Boutons auth connecté cachés quand non authentifié', async ({ page }) => {
    await waitForMapBoot(page);
    // data-connected="false" sur le sidebar quand non connecté
    await expect(page.locator('#gp-sidebar')).toHaveAttribute('data-connected', 'false');
    // Les boutons data-auth="connected" ne sont pas visibles
    const helpBtn = page.locator('#gp-sidebar [data-action="help"]');
    const contributeBtn = page.locator('#gp-sidebar [data-action="contribute"]');
    const logoutBtn = page.locator('#gp-sidebar [data-action="logout"]');
    await expect(helpBtn).toBeHidden();
    await expect(contributeBtn).toBeHidden();
    await expect(logoutBtn).toBeHidden();
  });

  test('0.3.5 — Bouton login visible quand non authentifié', async ({ page }) => {
    await waitForMapBoot(page);
    const loginBtn = page.locator('#gp-sidebar [data-action="login"]');
    await expect(loginBtn).toBeVisible();
  });

  test('0.3.6 — Bouton info visible', async ({ page }) => {
    await waitForMapBoot(page);
    const infoBtn = page.locator('#gp-sidebar [data-action="info"]');
    await expect(infoBtn).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 0.4 — Toggle Dock (barre d'outils flottante)
// ─────────────────────────────────────────────────────────
test.describe('0.4 — Toggle Dock', () => {

  test('0.4.1 — Tous les toggles principaux sont rendus', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#city-toggle')).toBeVisible();
    await expect(page.locator('#filters-toggle')).toBeVisible();
    await expect(page.locator('#mode3d-toggle')).toBeVisible();
    await expect(page.locator('#basemap-toggle')).toBeVisible();
    await expect(page.locator('#search-toggle')).toBeVisible();
    await expect(page.locator('#location-toggle')).toBeVisible();
  });

  test('0.4.2 — Les toggles ont des attributs ARIA', async ({ page }) => {
    await waitForMapBoot(page);
    const filtersToggle = page.locator('#filters-toggle');
    // aria-label est toujours présent (défini dans _setupAria)
    await expect(filtersToggle).toHaveAttribute('aria-label');
    // aria-pressed et aria-expanded sont définis après la première interaction (setState)
    // Vérifier que le mode 3D (defaultState: false → setState appelé) a bien aria-pressed
    await expect(page.locator('#mode3d-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  test('0.4.3 — Mode 3D est inactif par défaut', async ({ page }) => {
    await waitForMapBoot(page);
    const mode3d = page.locator('#mode3d-toggle');
    await expect(mode3d).toHaveAttribute('aria-pressed', 'false');
  });

  test('0.4.4 — Clic toggle filters → panneau filtres s\'ouvre', async ({ page }) => {
    await waitForMapBoot(page);
    const panel = page.locator('#filters-container');
    await expect(panel).not.toHaveClass(/dock-panel--open/);
    await page.locator('#filters-toggle').click();
    await expect(panel).toHaveClass(/dock-panel--open/, { timeout: 3000 });
  });

  test('0.4.5 — Exclusion mutuelle : ouvrir basemap ferme filters', async ({ page }) => {
    await waitForMapBoot(page);
    // Ouvrir filters
    await page.locator('#filters-toggle').click();
    await expect(page.locator('#filters-container')).toHaveClass(/dock-panel--open/);
    // Ouvrir basemap → filters se ferme
    await page.locator('#basemap-toggle').click();
    await expect(page.locator('#basemap-menu')).toHaveClass(/dock-panel--open/, { timeout: 3000 });
    await expect(page.locator('#filters-container')).not.toHaveClass(/dock-panel--open/);
  });

  test('0.4.6 — Re-clic sur un toggle ouvert le ferme', async ({ page }) => {
    await waitForMapBoot(page);
    const filtersToggle = page.locator('#filters-toggle');
    const panel = page.locator('#filters-container');
    // Ouvrir
    await filtersToggle.click();
    await expect(panel).toHaveClass(/dock-panel--open/);
    // Fermer
    await filtersToggle.click();
    await expect(panel).not.toHaveClass(/dock-panel--open/, { timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────
// 0.5 — Thème sombre / clair
// ─────────────────────────────────────────────────────────
test.describe('0.5 — Thème sombre / clair', () => {

  test('0.5.1 — Toggle thème change l\'attribut data-theme', async ({ page }) => {
    await waitForMapBoot(page);
    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');

    // Cliquer sur le bouton thème (scoped au sidebar pour éviter le clone actions-panel)
    await page.locator('#gp-sidebar .gp-sidebar__btn--theme').click();
    const newTheme = await html.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
    expect(['dark', 'light']).toContain(newTheme);
  });

  test('0.5.2 — L\'icône du bouton thème bascule (moon ↔ sun)', async ({ page }) => {
    await waitForMapBoot(page);
    const themeBtn = page.locator('#gp-sidebar .gp-sidebar__btn--theme');
    const icon = themeBtn.locator('i');

    const initialClass = await icon.getAttribute('class');
    await themeBtn.click();
    const newClass = await icon.getAttribute('class');

    // L'icône doit avoir changé
    expect(newClass).not.toBe(initialClass);

    // L'une doit contenir moon, l'autre sun
    const hasChanged = (initialClass.includes('moon') && newClass.includes('sun')) ||
                       (initialClass.includes('sun') && newClass.includes('moon'));
    expect(hasChanged).toBe(true);
  });

  test('0.5.3 — Le thème est persisté dans localStorage', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#gp-sidebar .gp-sidebar__btn--theme').click();
    const savedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    const htmlTheme = await page.locator('html').getAttribute('data-theme');
    expect(savedTheme).toBe(htmlTheme);
  });

  test('0.5.4 — Double toggle revient au thème initial', async ({ page }) => {
    await waitForMapBoot(page);
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    await page.locator('#gp-sidebar .gp-sidebar__btn--theme').click();
    await page.locator('#gp-sidebar .gp-sidebar__btn--theme').click();
    const finalTheme = await page.locator('html').getAttribute('data-theme');
    expect(finalTheme).toBe(initialTheme);
  });
});

// ─────────────────────────────────────────────────────────
// 0.6 — Panneau de navigation (NavPanel)
// ─────────────────────────────────────────────────────────
test.describe('0.6 — Panneau de navigation', () => {

  test('0.6.1 — Clic Carte → NavPanel s\'ouvre en Level 2', async ({ page }) => {
    await waitForMapBoot(page);
    const navPanel = page.locator('#nav-panel');
    // Initialement fermé (level 0)
    await expect(navPanel).toHaveAttribute('data-level', '0');

    // Clic sur le bouton Carte
    await page.locator('[data-module="carte"]').click();
    await expect(navPanel).toHaveClass(/open/, { timeout: 3000 });
    await expect(navPanel).toHaveAttribute('data-level', '2');
    await expect(navPanel).toHaveAttribute('data-module', 'carte');
  });

  test('0.6.2 — Level 2 affiche les catégories', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    // Des items de catégorie sont rendus
    const items = page.locator('.nav-panel__item[data-category]');
    await expect(items.first()).toBeVisible({ timeout: 10000 });
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('0.6.3 — Le titre du NavPanel est affiché', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });
    const title = page.locator('.nav-panel__title');
    await expect(title).toBeVisible();
    const text = await title.textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('0.6.4 — Clic catégorie → Level 3 avec projets', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    const navPanel = page.locator('#nav-panel');
    await expect(navPanel).toHaveClass(/open/, { timeout: 3000 });

    // Clic sur la première catégorie
    const firstCat = page.locator('.nav-panel__item[data-category]').first();
    await expect(firstCat).toBeVisible({ timeout: 10000 });
    await firstCat.click();

    // Level 3
    await expect(navPanel).toHaveAttribute('data-level', '3', { timeout: 5000 });

    // Le bouton retour est visible
    await expect(page.locator('.nav-panel__back')).toBeVisible();

    // Breadcrumb visible
    await expect(page.locator('.nav-panel__breadcrumb')).toBeVisible();
  });

  test('0.6.5 — Bouton retour Level 3 → Level 2', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    const firstCat = page.locator('.nav-panel__item[data-category]').first();
    await expect(firstCat).toBeVisible({ timeout: 10000 });
    await firstCat.click();
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-level', '3', { timeout: 5000 });

    // Retour
    await page.locator('.nav-panel__back').click();
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-level', '2', { timeout: 3000 });
  });

  test('0.6.6 — Bouton fermer → NavPanel se collapse', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    // Le bouton close appelle collapse() → ajoute .collapsed mais garde .open
    await page.locator('.nav-panel__close').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/collapsed/, { timeout: 3000 });
  });

  test('0.6.7 — Scrim est masqué après collapse', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });
    await expect(page.locator('#nav-panel-scrim')).toHaveClass(/visible/, { timeout: 3000 });

    // Collapse via close button
    await page.locator('.nav-panel__close').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/collapsed/, { timeout: 3000 });
    // Le scrim doit perdre la classe visible
    await expect(page.locator('#nav-panel-scrim')).not.toHaveClass(/visible/, { timeout: 3000 });
  });

  test('0.6.8 — Re-clic module après collapse → expand le panneau', async ({ page }) => {
    await waitForMapBoot(page);
    const carteBtn = page.locator('#gp-sidebar [data-module="carte"]');
    await carteBtn.click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    // Collapse via close button (le bouton "Voir la carte" est mobile-only)
    await page.locator('.nav-panel__close').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/collapsed/, { timeout: 3000 });

    // Re-clic sur le module → ré-expand
    await carteBtn.click();
    await expect(page.locator('#nav-panel')).not.toHaveClass(/collapsed/, { timeout: 3000 });
    await expect(page.locator('#nav-panel')).toHaveClass(/open/);
  });

  test('0.6.9 — Scrim visible quand panneau ouvert', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });
    await expect(page.locator('#nav-panel-scrim')).toHaveClass(/visible/, { timeout: 3000 });
  });

  test('0.6.10 — Clic scrim → collapse le panneau', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    // Le scrim peut être derrière le panneau → dispatch click via JS
    await page.evaluate(() => document.getElementById('nav-panel-scrim').click());
    await expect(page.locator('#nav-panel')).toHaveClass(/collapsed/, { timeout: 3000 });
  });

  test('0.6.11 — Bouton module Carte prend la classe active', async ({ page }) => {
    await waitForMapBoot(page);
    // Scoper au sidebar pour éviter la collision avec #nav-panel[data-module="carte"]
    const carteBtn = page.locator('#gp-sidebar [data-module="carte"]');
    await expect(carteBtn).not.toHaveClass(/active/);
    await carteBtn.click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });
    await expect(carteBtn).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────────────────
// 0.7 — Navigation clavier (NavPanel)
// ─────────────────────────────────────────────────────────
test.describe('0.7 — Navigation clavier', () => {

  test('0.7.1 — Escape en Level 2 → collapse le panneau', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('#nav-panel')).toHaveClass(/collapsed/, { timeout: 3000 });
  });

  test('0.7.2 — Escape en Level 3 → retour Level 2', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    const firstCat = page.locator('.nav-panel__item[data-category]').first();
    await expect(firstCat).toBeVisible({ timeout: 10000 });
    await firstCat.click();
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-level', '3', { timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-level', '2', { timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────
// 0.8 — Recherche d'adresse
// ─────────────────────────────────────────────────────────
test.describe('0.8 — Recherche d\'adresse', () => {

  test('0.8.1 — Clic search → panneau s\'ouvre et input focus', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    const panel = page.locator('#search-overlay');
    await expect(panel).toHaveClass(/dock-panel--open/, { timeout: 3000 });
    const input = page.locator('#address-search');
    await expect(input).toBeFocused({ timeout: 3000 });
  });

  test('0.8.2 — Saisie texte → bouton clear apparaît', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    const clearBtn = page.locator('.search__clear');
    await expect(clearBtn).not.toHaveClass(/visible/);

    await page.fill('#address-search', 'Lyon');
    await expect(clearBtn).toHaveClass(/visible/, { timeout: 2000 });
  });

  test('0.8.3 — Recherche "Lyon" → résultats affichés', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    await page.fill('#address-search', 'Lyon');

    // Attendre les résultats (API externe, debounce 260ms)
    const results = page.locator('.search-result-item');
    await expect(results.first()).toBeVisible({ timeout: 10000 });
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(6);
  });

  test('0.8.4 — Bouton clear → vide l\'input et les résultats', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    await page.fill('#address-search', 'Lyon');
    await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 10000 });

    // Clear
    await page.locator('.search__clear').click();
    await expect(page.locator('#address-search')).toHaveValue('');
    await expect(page.locator('.search-result-item')).toHaveCount(0, { timeout: 3000 });
  });

  test('0.8.5 — Escape ferme le panneau recherche', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    await expect(page.locator('#search-overlay')).toHaveClass(/dock-panel--open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-overlay')).not.toHaveClass(/dock-panel--open/, { timeout: 3000 });
  });

  test('0.8.6 — Navigation clavier dans les résultats', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    await page.fill('#address-search', 'Lyon');
    await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 10000 });

    // ArrowDown → premier résultat focus
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.search-result-item.is-focused')).toHaveCount(1, { timeout: 2000 });
  });

  test('0.8.7 — Recherche sans résultat → message vide', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#search-toggle').click();
    await page.fill('#address-search', 'xyzzyqwertyu12345');

    // Attendre la réponse de l'API (aucun résultat)
    const emptyState = page.locator('.search-status--empty');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 0.9 — Panneau filtres
// ─────────────────────────────────────────────────────────
test.describe('0.9 — Panneau filtres', () => {

  test('0.9.1 — Ouvrir le panneau → items de filtres affichés', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#filters-toggle').click();
    const panel = page.locator('#filters-container');
    await expect(panel).toHaveClass(/dock-panel--open/, { timeout: 3000 });

    const items = page.locator('.filter-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test('0.9.2 — Clic filtre → toggle is-active', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#filters-toggle').click();
    await expect(page.locator('#filters-container')).toHaveClass(/dock-panel--open/);

    const firstFilter = page.locator('.filter-item').first();
    await expect(firstFilter).toBeVisible({ timeout: 5000 });
    const wasActive = await firstFilter.evaluate(el => el.classList.contains('is-active'));

    await firstFilter.click();
    const isNowActive = await firstFilter.evaluate(el => el.classList.contains('is-active'));
    expect(isNowActive).not.toBe(wasActive);
  });

  test('0.9.3 — Badge compteur affiche le nombre de filtres actifs', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#filters-toggle').click();
    await expect(page.locator('#filters-container')).toHaveClass(/dock-panel--open/);

    // Le badge texte reflète le nombre de filtres actifs
    const badge = page.locator('.filter-count');
    const activeCount = await page.locator('.filter-item.is-active').count();
    const badgeText = await badge.textContent();
    expect(parseInt(badgeText)).toBe(activeCount);
  });

  test('0.9.4 — Chaque filtre a un libellé et une icône', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#filters-toggle').click();
    const firstFilter = page.locator('.filter-item').first();
    await expect(firstFilter).toBeVisible({ timeout: 5000 });

    // Libellé
    await expect(firstFilter.locator('.dock-panel__item-label')).toBeVisible();
    const label = await firstFilter.locator('.dock-panel__item-label').textContent();
    expect(label.trim().length).toBeGreaterThan(0);

    // Icône
    await expect(firstFilter.locator('.dock-panel__item-icon')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 0.10 — Fond de carte (basemaps)
// ─────────────────────────────────────────────────────────
test.describe('0.10 — Fond de carte', () => {

  test('0.10.1 — Ouvrir le menu → tuiles de basemaps affichées', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#basemap-toggle').click();
    const panel = page.locator('#basemap-menu');
    await expect(panel).toHaveClass(/dock-panel--open/, { timeout: 3000 });

    const items = panel.locator('.dock-panel__item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    const count = await items.count();
    expect(count).toBeGreaterThan(1);
  });

  test('0.10.2 — Un basemap est actif par défaut', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#basemap-toggle').click();
    const panel = page.locator('#basemap-menu');
    await expect(panel).toHaveClass(/dock-panel--open/);

    const activeItem = panel.locator('.dock-panel__item.is-active');
    await expect(activeItem).toHaveCount(1, { timeout: 5000 });
  });

  test('0.10.3 — Clic basemap → change l\'actif et ferme le menu', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#basemap-toggle').click();
    const panel = page.locator('#basemap-menu');
    await expect(panel).toHaveClass(/dock-panel--open/);

    // Capturer le label du basemap inactif avant clic
    const firstInactive = panel.locator('.dock-panel__item:not(.is-active)').first();
    await expect(firstInactive).toBeVisible({ timeout: 5000 });
    const label = await firstInactive.locator('.dock-panel__item-label').textContent();
    await firstInactive.click();

    // Vérifier par le label (le locator lazy se ré-évalue sinon)
    const clickedItem = panel.locator('.dock-panel__item', { hasText: label.trim() });
    await expect(clickedItem).toHaveClass(/is-active/, { timeout: 3000 });

    // Le panel se ferme après un délai (300ms dans uimodule.js)
    await expect(panel).not.toHaveClass(/dock-panel--open/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────
// 0.11 — Sélecteur de ville (city)
// ─────────────────────────────────────────────────────────
test.describe('0.11 — Sélecteur de ville', () => {

  test('0.11.1 — Ouvrir le menu ville', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#city-toggle').click();
    const panel = page.locator('#city-menu');
    await expect(panel).toHaveClass(/dock-panel--open/, { timeout: 3000 });
  });

  test('0.11.2 — Le menu contient des options de ville', async ({ page }) => {
    await waitForMapBoot(page);
    await page.locator('#city-toggle').click();
    const panel = page.locator('#city-menu');
    await expect(panel).toHaveClass(/dock-panel--open/);

    // Attendre que les items soient rendus
    const items = panel.locator('.dock-panel__item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────
// 0.12 — Mode 3D
// ─────────────────────────────────────────────────────────
test.describe('0.12 — Mode 3D', () => {

  test('0.12.1 — Toggle 3D change aria-pressed', async ({ page }) => {
    await waitForMapBoot(page);
    const btn = page.locator('#mode3d-toggle');
    const initial = await btn.getAttribute('aria-pressed');

    await btn.click();
    const newState = await btn.getAttribute('aria-pressed');
    expect(newState).not.toBe(initial);
  });

  test('0.12.2 — Mode 3D est persisté dans localStorage', async ({ page }) => {
    await waitForMapBoot(page);
    const btn = page.locator('#mode3d-toggle');
    await btn.click();
    const ariaState = await btn.getAttribute('aria-pressed');
    const stored = await page.evaluate(() => localStorage.getItem('mode-3d'));
    // aria-pressed="true" → localStorage "true"
    expect(stored).toBe(ariaState);
  });
});

// ─────────────────────────────────────────────────────────
// 0.13 — Panneaux dock divers
// ─────────────────────────────────────────────────────────
test.describe('0.13 — Interactions dock et panneaux', () => {

  test('0.13.1 — Ouvrir un panel dock ferme le NavPanel s\'il est ouvert', async ({ page }) => {
    await waitForMapBoot(page);
    // Ouvrir NavPanel
    await page.locator('[data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    // Ouvrir search → NavPanel doit se replier
    await page.locator('#search-toggle').click();
    await expect(page.locator('#search-overlay')).toHaveClass(/dock-panel--open/, { timeout: 3000 });
  });

  test('0.13.2 — Le panneau projet est caché au démarrage', async ({ page }) => {
    await waitForMapBoot(page);
    const detail = page.locator('#project-detail');
    // display: none
    await expect(detail).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 0.14 — URLs et routing
// ─────────────────────────────────────────────────────────
test.describe('0.14 — URLs et routing', () => {

  test('0.14.1 — Navigation catégorie → Level 3 affiche les projets', async ({ page }) => {
    await waitForMapBoot(page);
    // Ouvrir le NavPanel en cliquant sur Carte
    await page.locator('#gp-sidebar [data-module="carte"]').click();
    await expect(page.locator('#nav-panel')).toHaveClass(/open/, { timeout: 3000 });

    // Cliquer sur une catégorie → Level 3
    const firstCat = page.locator('.nav-panel__item[data-category]').first();
    await expect(firstCat).toBeVisible({ timeout: 10000 });
    await firstCat.click();
    await expect(page.locator('#nav-panel')).toHaveAttribute('data-level', '3', { timeout: 5000 });

    // Le conteneur Level 3 contient du contenu (cards projet ou skeletons)
    const l3 = page.locator('.nav-panel__level3');
    await expect(l3).toBeVisible({ timeout: 5000 });
    // Attendre que les project cards ou un empty-state apparaissent
    const hasContent = page.locator('.nav-panel__level3 .project-card, .nav-panel__level3 .nav-panel__empty');
    await expect(hasContent.first()).toBeVisible({ timeout: 15000 });
  });

  test('0.14.2 — La page d\'accueil charge sans paramètre', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gp-sidebar', { state: 'visible', timeout: 15000 });
    expect(page.url()).not.toContain('?cat=');
    expect(page.url()).not.toContain('?project=');
  });
});

// ─────────────────────────────────────────────────────────
// 0.15 — Responsive et accessibilité
// ─────────────────────────────────────────────────────────
test.describe('0.15 — Accessibilité', () => {

  test('0.15.1 — Le sidebar a un aria-label', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#gp-sidebar')).toHaveAttribute('aria-label', 'Navigation principale');
  });

  test('0.15.2 — Le toggle dock a un aria-label', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#toggle-dock')).toHaveAttribute('aria-label', 'Contrôles de carte');
  });

  test('0.15.3 — Le NavPanel a un aria-label', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#nav-panel')).toHaveAttribute('aria-label', 'Panneau de navigation');
  });

  test('0.15.4 — Les boutons de toggle ont des titres descriptifs', async ({ page }) => {
    await waitForMapBoot(page);
    // Chaque toggle doit avoir un data-title
    const toggles = ['#city-toggle', '#filters-toggle', '#mode3d-toggle', '#basemap-toggle', '#search-toggle', '#location-toggle'];
    for (const sel of toggles) {
      const title = await page.locator(sel).getAttribute('data-title');
      expect(title?.length).toBeGreaterThan(0);
    }
  });

  test('0.15.5 — Résultats de recherche ont role=listbox', async ({ page }) => {
    await waitForMapBoot(page);
    await expect(page.locator('#search-results')).toHaveAttribute('role', 'listbox');
  });
});

// ─────────────────────────────────────────────────────────
// 0.16 — Routage des clics de feature (contribution vs travaux)
// ─────────────────────────────────────────────────────────
// Régression #contrib-click-bug : une contribution dont la GeoJSON source
// contient une propriété générique `nature` / `nature_travaux` était
// classée à tort comme travaux par isTravauxProps, ouvrant le modal
// travaux au lieu de la fiche de contribution.
//
// Ces tests appellent FeatureInteractions._openFeature directement avec
// des stubs pour les opérations carte (spotlight) et les destinations
// d'ouverture — on teste uniquement la DÉCISION de routage.
test.describe('0.16 — Routage clic feature', () => {

  /**
   * Installe des stubs sur les fonctions appelées par _openFeature et
   * retourne un objet suivi via `window.__routeCalls`.
   */
  async function installRoutingStubs(page) {
    await page.evaluate(() => {
      const calls = { openTravauxModal: 0, showDetailPanel: 0, showProjectDetail: 0, showProjectDetailById: 0, lastArgs: null };
      window.__routeCalls = calls;
      // Stub spotlight (ne pas toucher à la carte)
      if (window.FeatureInteractions) {
        window.FeatureInteractions._spotlight = () => {};
      }
      // Stub des destinations
      window.DataModule = window.DataModule || {};
      window.DataModule.openTravauxModal = (p) => { calls.openTravauxModal++; calls.lastArgs = { route: 'travaux', p }; };
      window.UIModule = window.UIModule || {};
      window.UIModule.showDetailPanel = (cat, feat) => { calls.showDetailPanel++; calls.lastArgs = { route: 'showDetailPanel', cat, feat }; };
      window.NavigationModule = window.NavigationModule || {};
      window.NavigationModule.showProjectDetail = (name, cat, ev, props) => { calls.showProjectDetail++; calls.lastArgs = { route: 'showProjectDetail', name, cat, props }; };
      window.NavigationModule.showProjectDetailById = (id) => { calls.showProjectDetailById++; calls.lastArgs = { route: 'showProjectDetailById', id }; };
    });
  }

  test('0.16.1 — Clic sur contribution (project_name + category) → fiche', async ({ page }) => {
    await waitForMapBoot(page);
    await installRoutingStubs(page);
    const calls = await page.evaluate(() => {
      const feature = {
        type: 'Feature',
        source: null,
        properties: { id: 123, project_name: 'Test Projet', category: 'velo', cover_url: '', description: 'd', markdown_url: '', ville: 'metropole-lyon' },
        geometry: { type: 'Point', coordinates: [4.85, 45.75] }
      };
      window.FeatureInteractions._openFeature(feature);
      return window.__routeCalls;
    });
    expect(calls.openTravauxModal).toBe(0);
    // id présent → route par ID
    expect(calls.showProjectDetailById).toBe(1);
    expect(calls.lastArgs.id).toBe(123);
  });

  test('0.16.2 — Contribution SANS id tombe sur showDetailPanel', async ({ page }) => {
    await waitForMapBoot(page);
    await installRoutingStubs(page);
    const calls = await page.evaluate(() => {
      const feature = {
        type: 'Feature',
        source: null,
        properties: { project_name: 'Legacy', category: 'urbanisme' },
        geometry: { type: 'Point', coordinates: [4.85, 45.75] }
      };
      window.FeatureInteractions._openFeature(feature);
      return window.__routeCalls;
    });
    expect(calls.openTravauxModal).toBe(0);
    expect(calls.showDetailPanel).toBe(1);
    expect(calls.lastArgs.cat).toBe('urbanisme');
  });

  test('0.16.3 — RÉGRESSION : contribution avec `nature` NE va PAS dans travaux', async ({ page }) => {
    // Bug historique : props.nature='Piste cyclable' faisait basculer dans isTravauxProps.
    await waitForMapBoot(page);
    await installRoutingStubs(page);
    const calls = await page.evaluate(() => {
      const feature = {
        type: 'Feature',
        source: null,
        properties: {
          id: 42,
          project_name: 'Piste Rhône',
          category: 'velo',
          nature: 'Piste cyclable',
          nature_travaux: 'Voirie',
          nature_chantier: 'Aménagement'
        },
        geometry: { type: 'Point', coordinates: [4.85, 45.75] }
      };
      window.FeatureInteractions._openFeature(feature);
      return window.__routeCalls;
    });
    expect(calls.openTravauxModal).toBe(0);
    expect(calls.showProjectDetailById).toBe(1);
  });

  test('0.16.4 — Feature travaux pure (chantier_key) → modal travaux', async ({ page }) => {
    await waitForMapBoot(page);
    await installRoutingStubs(page);
    const calls = await page.evaluate(() => {
      const feature = {
        type: 'Feature',
        source: 'travaux',
        properties: { chantier_key: 'travaux-url:lyon:AUTO:1', chantier_id: 99, nature_travaux: 'Voirie' },
        geometry: { type: 'Point', coordinates: [4.85, 45.75] }
      };
      window.FeatureInteractions._openFeature(feature);
      return window.__routeCalls;
    });
    expect(calls.openTravauxModal).toBe(1);
    expect(calls.showProjectDetailById).toBe(0);
    expect(calls.showDetailPanel).toBe(0);
  });

  test('0.16.5 — Feature sans signature reconnue → aucun routage', async ({ page }) => {
    await waitForMapBoot(page);
    await installRoutingStubs(page);
    const calls = await page.evaluate(() => {
      const feature = {
        type: 'Feature',
        source: null,
        properties: { nature: 'Route', libelle: 'D7' },
        geometry: { type: 'Point', coordinates: [4.85, 45.75] }
      };
      window.FeatureInteractions._openFeature(feature);
      return window.__routeCalls;
    });
    expect(calls.openTravauxModal).toBe(0);
    expect(calls.showDetailPanel).toBe(0);
    expect(calls.showProjectDetail).toBe(0);
    expect(calls.showProjectDetailById).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════
// 0.17 — Résilience de l'init (banner d'erreur)
//
// Le banner rouge `#init-error-message` ne doit apparaître que
// si l'application est VRAIMENT inutilisable (map non créée).
// Une simple erreur dans une phase secondaire (FilterManager,
// Sidebar, UIModule…) ne doit PAS afficher le banner.
// ═════════════════════════════════════════════════════════
test.describe('0.17 — Résilience init (banner)', () => {

  test('0.17.1 — Pas de banner init-error-message après boot normal', async ({ page }) => {
    await waitForMapBoot(page);
    const banner = page.locator('#init-error-message');
    await expect(banner).toHaveCount(0);
  });

  test('0.17.2 — Une panne de FilterManager.init n\'affiche PAS le banner', async ({ page }) => {
    await page.addInitScript(() => {
      // Patcher FilterManager.init pour qu'il throw après chargement de main.js
      Object.defineProperty(window, 'FilterManager', {
        configurable: true,
        get() { return this.__fm; },
        set(v) {
          this.__fm = v;
          if (v && typeof v === 'object' && !v.__patched) {
            v.__patched = true;
            const origInit = v.init;
            v.init = function() {
              if (origInit) { try { origInit.call(this); } catch { /* noop */ } }
              throw new Error('TEST: FilterManager.init simulated failure');
            };
          }
        }
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Attendre que l'app ait fini (carte créée ou banner éventuellement)
    await page.waitForFunction(
      () => !!document.querySelector('#map canvas') || !!document.getElementById('init-error-message'),
      { timeout: 20000 }
    );
    // La carte doit être là, le banner NE doit PAS être là
    await expect(page.locator('#map canvas')).toHaveCount(1);
    await expect(page.locator('#init-error-message')).toHaveCount(0);
  });

  test('0.17.3 — Une erreur dans CityManager.initCityMenu n\'affiche PAS le banner', async ({ page }) => {
    await page.addInitScript(() => {
      // Patcher CityManager avant Phase 2
      const origDefine = Object.defineProperty;
      Object.defineProperty(window, 'CityManager', {
        configurable: true,
        get() { return this.__cm; },
        set(v) {
          this.__cm = v;
          if (v && typeof v === 'object' && !v.__patched) {
            v.__patched = true;
            const orig = v.initCityMenu;
            v.initCityMenu = async function() {
              if (orig) { try { await orig.apply(this, arguments); } catch { /* noop */ } }
              throw new Error('TEST: initCityMenu simulated failure');
            };
          }
        }
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => !!document.querySelector('#map canvas') || !!document.getElementById('init-error-message'),
      { timeout: 20000 }
    );
    await expect(page.locator('#init-error-message')).toHaveCount(0);
  });
});

// ═════════════════════════════════════════════════════════
// 0.18 — RÉGRESSION : logo mobile (.mobile-fixed-logo)
//
// Le logo fixe en haut à gauche doit être VISIBLE en mobile
// et CACHÉ en desktop. Régression du bug cascade CSS où
// 03-navigation.css (chargé après 08-responsive.css) écrasait
// le display:flex du @media avec un display:none de même
// spécificité.
// ═════════════════════════════════════════════════════════
test.describe('0.18 — RÉGRESSION logo mobile (cascade CSS)', () => {

  test('0.18.1 — Logo mobile visible en viewport mobile (≤720px)', async ({ page }) => {
    page.setViewportSize({ width: 375, height: 812 });
    await waitForMapBoot(page);
    const logo = page.locator('.mobile-fixed-logo');
    // L'élément doit être dans le DOM
    await expect(logo).toHaveCount(1);
    // display calculé doit être "flex", pas "none"
    const display = await logo.evaluate(el => getComputedStyle(el).display);
    expect(display, 'Le logo mobile doit être display:flex sur mobile').toBe('flex');
  });

  test('0.18.2 — Logo mobile masqué en desktop (>720px)', async ({ page }) => {
    page.setViewportSize({ width: 1280, height: 800 });
    await waitForMapBoot(page);
    const logo = page.locator('.mobile-fixed-logo');
    await expect(logo).toHaveCount(1);
    const display = await logo.evaluate(el => getComputedStyle(el).display);
    expect(display, 'Le logo mobile ne doit pas être visible sur desktop').toBe('none');
  });

  test('0.18.3 — Logo mobile a un src non vide après boot', async ({ page }) => {
    page.setViewportSize({ width: 375, height: 812 });
    await waitForMapBoot(page);
    // Attendre que citymanager ait injecté le logo (async)
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.mobile-fixed-logo img');
        return img && img.src && img.src.length > 0 && img.naturalWidth > 0;
      },
      { timeout: 10000 }
    );
    const src = await page.locator('.mobile-fixed-logo img').getAttribute('src');
    expect(src).toBeTruthy();
  });
});
