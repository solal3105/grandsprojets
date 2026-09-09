// @ts-check
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

/** Clean leftover E2E data from previous runs */
async function cleanupDiagnosticData() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  await sb.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  await sb.from('diagnostic_layers').delete().eq('ville', 'test-e2e');
  await sb.from('diagnostic_reports').delete().eq('ville', 'test-e2e');
  // Fichiers GeoJSON déposés par les tests précédents
  const { data: files } = await sb.storage.from('uploads').list('diagnostic/test-e2e');
  if (files?.length) {
    await sb.storage.from('uploads').remove(files.map(f => `diagnostic/test-e2e/${f.name}`));
  }
}

test.beforeAll(async () => { await cleanupDiagnosticData(); });

/**
 * Navigate and wait for boot + splash removal.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/**
 * Navigate to diagnostic and wait for the dock to render.
 * NB : le dock ne dépend pas de la carte (WebGL indisponible en headless) -
 * seuls le rendu MapLibre et le lasso ne sont pas testables ici.
 */
async function goToDiagnostic(page) {
  await waitForBoot(page, '/admin/diagnostic/');
  await page.waitForSelector('.dg-dock', { timeout: 10000 });
}

/** Ouvre « Ajouter des données » puis le wizard avancé (« Un autre fichier »). */
async function openAdvanced(page) {
  await page.click('#dg-add-first, #dg-add-layer');
  await page.waitForSelector('.dg-cat', { timeout: 10000 });
  await page.click('#dg-cat-advanced');
  await expect(page.locator('.dg-modal__title')).toContainText('Ajouter une couche');
}

const successToast = (page, text) =>
  page.locator('.adm-toast--success').filter({ hasText: text });

const clearToasts = (page) =>
  page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

const GEOJSON_FIXTURE = Buffer.from(JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.72, 45.18] }, properties: { nom: 'Point A', motif: 'chaussée dégradée devant la piste cyclable' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.73, 45.19] }, properties: { nom: 'Point B', motif: 'stationnement gênant récurrent' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.74, 45.2] }, properties: { nom: 'Point C', motif: 'éclairage défaillant la nuit' } },
  ],
}));

const SHAPEFILE_ZIP = 'tests/fixtures/diagnostic-troncons.zip';
const COMPTAGES_CSV = 'tests/fixtures/diagnostic-comptages.csv';

const CSV_FIXTURE = Buffer.from(
  'nom;latitude;longitude;motif\n' +
  'Capteur 1;45.18;5.72;flux élevé\n' +
  'Capteur 2;45.19;5.73;flux modéré\n'
);

// ─────────────────────────────────────────────────────────
// 12.1 - Boot & navigation
// ─────────────────────────────────────────────────────────
test.describe('12.1 - Boot & navigation', () => {

  test('12.1.1 - Entrée sidebar visible et section accessible', async ({ page }) => {
    await waitForBoot(page);
    const navItem = page.locator('.adm-nav-item[data-section="diagnostic"]');
    await expect(navItem).toBeVisible();
    await navItem.click();
    await expect(page.locator('.adm-page-title')).toContainText('Diagnostic terrain');
    await expect(page.locator('#dg-history-btn')).toBeVisible();
    await expect(navItem).toHaveClass(/active/);
  });

  test('12.1.3 - Plein écran : bascule aller-retour, Échap réduit', async ({ page }) => {
    await goToDiagnostic(page);
    const wrap = page.locator('#dg-mapwrap');
    const btn = page.locator('#dg-fs-btn');
    // WebGL absent en headless : la carte échoue et masque ses outils. La
    // bascule elle-même ne dépend pas de la carte - on la ré-expose pour la
    // tester (cf. lacunes connues, CLAUDE.md).
    await page.locator('#dg-maptools').evaluate((el) => el.removeAttribute('hidden'));
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');

    await btn.click();
    await expect(wrap).toHaveClass(/is-fullscreen/);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    // Occupe bien tout le viewport, et la page ne défile plus derrière
    const box = await wrap.boundingBox();
    const vp = page.viewportSize();
    expect(Math.round(box.width)).toBe(vp.width);
    expect(Math.round(box.height)).toBe(vp.height);
    await expect(page.locator('body')).toHaveClass(/dg-fs-lock/);

    await page.keyboard.press('Escape');
    await expect(wrap).not.toHaveClass(/is-fullscreen/);
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('body')).not.toHaveClass(/dg-fs-lock/);
  });

  test('12.1.4 - Plein écran : le dock reste utilisable au-dessus de la carte', async ({ page }) => {
    await goToDiagnostic(page);
    await page.locator('#dg-maptools').evaluate((el) => el.removeAttribute('hidden'));
    await page.click('#dg-fs-btn');
    await expect(page.locator('#dg-mapwrap')).toHaveClass(/is-fullscreen/);
    // Le dock est dans le conteneur passé en plein écran : il suit
    await expect(page.locator('.dg-dock')).toBeVisible();
    await page.click('.dg-tab[data-tab="analyse"]');
    await expect(page.locator('.dg-tab[data-tab="analyse"]')).toHaveClass(/is-active/);
    await page.click('#dg-fs-btn');
    await expect(page.locator('#dg-mapwrap')).not.toHaveClass(/is-fullscreen/);
  });

  test('12.1.2 - Dock : onglets Couches / Carte / Analyse', async ({ page }) => {
    await goToDiagnostic(page);
    await expect(page.locator('.dg-tab')).toHaveCount(3);
    await expect(page.locator('.dg-tab[data-tab="layers"]')).toHaveClass(/is-active/);
    // L'onglet Carte existe même sans couche : fond, relief, chaleur
    await page.click('.dg-tab[data-tab="map"]');
    await expect(page.locator('#dg-panel-map .dg-setting')).toHaveCount(4);
    await expect(page.locator('#dg-panel-layers')).toBeHidden();
    await page.click('.dg-tab[data-tab="analyse"]');
    await expect(page.locator('.dg-tab[data-tab="analyse"]')).toHaveClass(/is-active/);
    await expect(page.locator('#dg-panel-analyse .dg-empty__title')).toContainText('Aucune zone sélectionnée');
    await expect(page.locator('#dg-panel-layers')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 12.2 - État vide & wizard (sans persistance)
// ─────────────────────────────────────────────────────────
test.describe('12.2 - État vide & wizard', () => {

  test('12.2.1 - Aucune couche : état vide avec CTA', async ({ page }) => {
    await goToDiagnostic(page);
    await expect(page.locator('#dg-panel-layers .dg-empty__title')).toContainText('Aucune couche', { timeout: 10000 });
    await expect(page.locator('#dg-add-first')).toContainText('Ajouter des données');
  });

  test('12.2.2 - Wizard : ouverture, sources, validation, annulation', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    // Sauvegarde impossible sans source
    await expect(page.locator('#dg-wz-save')).toBeDisabled();
    // Bascule des panneaux de source
    await page.click('.dg-src-tab[data-src="url"]');
    await expect(page.locator('#dg-wz-url')).toBeVisible();
    await expect(page.locator('#dg-wz-drop')).toBeHidden();
    // Source interne Open Projets proposée
    await page.click('.dg-src-tab[data-src="internal"]');
    await expect(page.locator('[data-internal="contributions"]')).toBeVisible();
    // Annulation
    await page.click('.dg-modal__foot [data-close]');
    await expect(page.locator('.dg-modal')).toHaveCount(0);
  });

  test('12.2.3 - Wizard : détection CSV + colonnes lat/lng', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', { name: 'capteurs.csv', mimeType: 'text/csv', buffer: CSV_FIXTURE });
    await expect(page.locator('#dg-wz-detect')).toContainText('CSV');
    await expect(page.locator('#dg-wz-detect')).toContainText('2');
    await expect(page.locator('#dg-wz-latlng')).toBeVisible();
    await expect(page.locator('#dg-wz-lat')).toHaveValue('latitude');
    await expect(page.locator('#dg-wz-lng')).toHaveValue('longitude');
    // Nom pré-rempli depuis le fichier
    await expect(page.locator('#dg-wz-label')).toHaveValue('capteurs');
    await page.click('.dg-modal__foot [data-close]');
  });

  test('12.2.4 - Wizard : un shapefile zippé est lu, présumé « données de référence »', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', SHAPEFILE_ZIP);
    await expect(page.locator('#dg-wz-detect')).toContainText('Shapefile', { timeout: 20000 });
    await expect(page.locator('#dg-wz-detect')).toContainText('3');
    await expect(page.locator('#dg-wz-label')).toHaveValue('diagnostic-troncons');
    // Étape « compléter » proposée, champs conservés listés
    await expect(page.locator('#dg-wz-enrich')).toBeVisible();
    await expect(page.locator('#dg-wz-keep .dg-chk')).toHaveCount(2);
    // Deux attributs sans texte : nature présumée « référence », chiffres de zone proposés
    await expect(page.locator('#dg-wz-kind button.is-active')).toHaveAttribute('data-kind', 'reference');
    await expect(page.locator('#dg-wz-metrics-wrap')).toBeVisible();
    // Bascule vers témoignages : les chiffres de zone disparaissent
    await page.click('#dg-wz-kind button[data-kind="temoignages"]');
    await expect(page.locator('#dg-wz-metrics-wrap')).toBeHidden();
    // Mode « selon une valeur » : le seul champ numérique est un identifiant, donc rien à proposer
    await page.click('#dg-wz-colormode button[data-mode="graduated"]');
    await expect(page.locator('#dg-wz-grad-wrap')).toBeVisible();
    await expect(page.locator('#dg-wz-valuefield option')).toHaveCount(1);
    await expect(page.locator('#dg-wz-valuefield')).toContainText('aucun champ numérique');
    await page.click('.dg-modal__foot [data-close]');
  });

  test('12.2.5 - Wizard : un tableau se rattache par colonne commune, avec filtre', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', SHAPEFILE_ZIP);
    await expect(page.locator('#dg-wz-detect')).toContainText('Shapefile', { timeout: 20000 });
    await page.setInputFiles('#dg-wz-join-file', COMPTAGES_CSV);
    await expect(page.locator('#dg-wz-join-cfg')).toBeVisible();
    // Colonnes communes devinées au nom près
    await expect(page.locator('#dg-wz-join-lkey')).toHaveValue('edgeUID');
    await expect(page.locator('#dg-wz-join-tkey')).toHaveValue('edge_uid');
    // Filtre sur l'année : les valeurs sont lues dans le tableau
    await page.selectOption('#dg-wz-join-fcol', 'year');
    await expect(page.locator('#dg-wz-join-fval')).toBeEnabled({ timeout: 10000 });
    await expect(page.locator('#dg-wz-join-fval option', { hasText: '2025' })).toHaveCount(1);
    await page.selectOption('#dg-wz-join-fval', '2025');
    await page.click('#dg-wz-join-apply');
    // 101 et 102 ont une ligne 2025, 103 n'en a pas et est retiré
    await expect(page.locator('#dg-wz-join-status')).toContainText('2 entité(s) enrichie(s)', { timeout: 10000 });
    await expect(page.locator('#dg-wz-join-status')).toContainText('1 sans correspondance retirée');
    await expect(page.locator('#dg-wz-detect')).toContainText('2');
    // Les colonnes reprises deviennent des champs conservés et des chiffres de zone possibles
    await expect(page.locator('#dg-wz-keep .dg-chk', { hasText: 'total_trip_count' })).toBeVisible();
    await page.click('#dg-wz-colormode button[data-mode="graduated"]');
    await page.selectOption('#dg-wz-valuefield', 'total_trip_count');
    await expect(page.locator('[data-mfield="total_trip_count"]')).toBeChecked();
    // Retrait du tableau : retour aux 3 entités d'origine
    await page.click('#dg-wz-join-remove');
    await expect(page.locator('#dg-wz-detect')).toContainText('3');
    await expect(page.locator('#dg-wz-join-drop')).toBeVisible();
    await page.click('.dg-modal__foot [data-close]');
  });
});

// ─────────────────────────────────────────────────────────
// 12.6 - Un export connu déposé tel quel
// ─────────────────────────────────────────────────────────
test.describe('12.6 - Export reconnu', () => {

  test('12.6.1 - L\'archive Strava est reconnue et tout est configuré d\'office (wizard avancé)', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', 'tests/fixtures/diagnostic-export-strava.zip');
    await expect(page.locator('#dg-wz-detect')).toContainText('Strava Metro', { timeout: 30000 });
    await expect(page.locator('#dg-wz-detect')).toContainText('reconnu');
    // Dernière année retenue, seules les entités qui l'ont sont gardées (101 et 102)
    await expect(page.locator('#dg-wz-detect')).toContainText('2025');
    await expect(page.locator('#dg-wz-detect')).toContainText('2 entité');
    await expect(page.locator('#dg-wz-join-fval')).toHaveValue('2025');
    await expect(page.locator('#dg-wz-join-status')).toContainText('2 entité(s) enrichie(s)');
    // Couche prête : nom, nature, dégradé, chiffres de zone, contexte
    await expect(page.locator('#dg-wz-label')).toHaveValue('Flux Strava 2025');
    await expect(page.locator('#dg-wz-kind button.is-active')).toHaveAttribute('data-kind', 'reference');
    await expect(page.locator('#dg-wz-colormode button.is-active')).toHaveAttribute('data-mode', 'graduated');
    await expect(page.locator('#dg-wz-valuefield')).toHaveValue('total_trip_count');
    await expect(page.locator('[data-mfield="total_trip_count"]')).toBeChecked();
    await expect(page.locator('[data-mfield="ebike_ride_count"]')).toBeChecked();
    await expect(page.locator('[data-magg="forward_average_speed_meters_per_second"]')).toHaveValue('mean');
    // Les identifiants ne sont pas proposés comme grandeurs
    await expect(page.locator('[data-mfield="edgeUID"]')).toHaveCount(0);
    await expect(page.locator('#dg-wz-ai')).not.toHaveValue('');
    // Champs conservés : la clé et les colonnes reprises, pas osmId ni year
    await expect(page.locator('#dg-wz-keep .dg-chk.is-active', { hasText: 'edgeUID' })).toHaveCount(1);
    await expect(page.locator('#dg-wz-keep .dg-chk.is-active', { hasText: 'osmId' })).toHaveCount(0);
    await expect(page.locator('#dg-wz-keep .dg-chk.is-active', { hasText: /^year$/ })).toHaveCount(0);
    await expect(page.locator('#dg-wz-save')).toBeEnabled();
    await page.click('.dg-modal__foot [data-close]');
  });

  test('12.6.2 - Un tableau sans recette mais avec une colonne commune est rattaché de lui-même', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    // Un tableau quelconque, hors de tout format connu, dont une colonne porte le nom du champ de la couche
    await page.setInputFiles('#dg-wz-file', [
      { name: 'troncons.zip', mimeType: 'application/zip', buffer: readFileSync(SHAPEFILE_ZIP) },
      { name: 'mesures.csv', mimeType: 'text/csv', buffer: Buffer.from('edgeUID;bruit_db\n101;62\n102;71\n') },
    ]);
    await expect(page.locator('#dg-wz-detect')).toContainText('rattaché de lui-même', { timeout: 30000 });
    await expect(page.locator('#dg-wz-detect')).toContainText('edgeUID');
    // Sans filtre : 101 et 102 ont des lignes, 103 non
    await expect(page.locator('#dg-wz-join-status')).toContainText('2 entité(s) enrichie(s)');
    await expect(page.locator('#dg-wz-keep .dg-chk', { hasText: 'bruit_db' })).toBeVisible();
    await page.click('.dg-modal__foot [data-close]');
  });
});

// ─────────────────────────────────────────────────────────
// 12.7 - « Ajouter des données » : le catalogue de sources
// ─────────────────────────────────────────────────────────
test.describe('12.7 - Catalogue de sources', () => {

  test('12.7.1 - Le catalogue propose des sources par famille, avec leur état', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await expect(page.locator('#dg-cat-title')).toHaveText('Ajouter des données');
    await expect(page.locator('.dg-cat__family')).toHaveCount(4);
    await expect(page.locator('.dg-cat__family').first()).toContainText('Vos modules Open Projets');
    await expect(page.locator('.dg-src')).toHaveCount(9);
    await expect(page.locator('[data-source="fub"] .dg-src__state')).toContainText('Nous récupérons tout');
    await expect(page.locator('[data-source="strava"] .dg-src__state')).toContainText('Un fichier à déposer');
    await expect(page.locator('[data-source="accidents"] .dg-src__state')).toContainText('Nous récupérons tout');
    await expect(page.locator('[data-source="waze"] .dg-src__state')).toContainText('Un lien à coller');
    await expect(page.locator('[data-source="comptages"] .dg-src__state')).toContainText('Nous récupérons tout');
    await expect(page.locator('[data-source="population"]')).toHaveCount(0);
    // Une seule entrée pour un fichier : la zone de dépôt, avec le lien vers les réglages avancés
    await expect(page.locator('#dg-cat-drop')).toHaveCount(1);
    await expect(page.locator('#dg-cat-advanced')).toBeVisible();
    // Aucun mot technique sur les sources (seule la zone de dépôt nomme des formats)
    const text = (await page.locator('.dg-src').allInnerTexts()).join(' ').toLowerCase();
    for (const mot of ['geojson', 'jointure', 'popup', 'shapefile']) expect(text).not.toContain(mot);
    // Échap ferme
    await page.keyboard.press('Escape');
    await expect(page.locator('.dg-cat')).toHaveCount(0);
  });

  test('12.7.2 - Une source à fichier : tutoriel, dépôt reconnu, année retenue, réglages avancés', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="strava"]');
    await expect(page.locator('#dg-cat-title')).toHaveText('Flux cyclistes Strava Metro');
    await expect(page.locator('.dg-tuto li')).toHaveCount(3);
    await expect(page.locator('.dg-tuto a[href*="strava.com"]')).toBeVisible();
    await page.setInputFiles('#dg-src-file', 'tests/fixtures/diagnostic-export-strava.zip');
    await expect(page.locator('.dg-reco__head')).toContainText('reconnu', { timeout: 30000 });
    await expect(page.locator('.dg-reco')).toContainText('Années');
    await expect(page.locator('#dg-src-filter')).toHaveValue('2025');
    await expect(page.locator('#dg-src-add')).toBeEnabled();
    // Réglages avancés : le wizard s'ouvre déjà réglé, sans étape de source
    await page.click('#dg-src-adv');
    await expect(page.locator('.dg-modal__sub')).toContainText('Réglages avancés', { timeout: 30000 });
    await expect(page.locator('#dg-wz-drop')).toHaveCount(0);
    await expect(page.locator('#dg-wz-label')).toHaveValue('Flux Strava 2025');
    await expect(page.locator('#dg-wz-kind button.is-active')).toHaveAttribute('data-kind', 'reference');
    await expect(page.locator('#dg-wz-valuefield')).toHaveValue('total_trip_count');
    await expect(page.locator('#dg-wz-save')).toBeEnabled();
    await page.click('.dg-modal__foot [data-close]');
  });

  test('12.7.3 - Un fichier qui n\'est pas l\'export attendu est refusé avec une issue', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="strava"]');
    await page.setInputFiles('#dg-src-file', { name: 'signalements.geojson', mimeType: 'application/geo+json', buffer: GEOJSON_FIXTURE });
    await expect(page.locator('#dg-src-result .dg-cat__error')).toContainText('Nous ne reconnaissons pas', { timeout: 30000 });
    await page.click('#dg-src-adv');
    // Le wizard avancé reprend le fichier
    await expect(page.locator('#dg-wz-detect')).toContainText('GeoJSON', { timeout: 20000 });
    await page.click('.dg-modal__foot [data-close]');
  });

  test('12.7.4 - Le dépôt global reconnaît un export et ouvre sa source déjà remplie', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.setInputFiles('#dg-cat-file', 'tests/fixtures/diagnostic-export-strava.zip');
    await expect(page.locator('#dg-cat-title')).toHaveText('Flux cyclistes Strava Metro', { timeout: 30000 });
    await expect(page.locator('.dg-reco__head')).toContainText('reconnu');
    await page.keyboard.press('Escape');
  });

});

test.describe('12.8 - Catalogue : ajout de bout en bout', () => {
  test.describe.configure({ mode: 'serial' });

  test('12.8.1 - Strava depuis le catalogue : une couche prête, marquée par sa source', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="strava"]');
    await page.setInputFiles('#dg-src-file', 'tests/fixtures/diagnostic-export-strava.zip');
    await expect(page.locator('.dg-reco__head')).toContainText('reconnu', { timeout: 30000 });
    await page.click('#dg-src-add');
    await expect(successToast(page, 'ajoutée')).toBeVisible({ timeout: 30000 });
    const row = page.locator('.dg-row', { hasText: 'Flux Strava 2025' });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-count]')).toHaveText('2', { timeout: 15000 });
    await expect(row.locator('.dg-swatch--src i')).toBeVisible();
    // Rangée avec les sources connectées, à part des fichiers décrits à la main
    await expect(page.locator('.dg-sec[data-sec="sources"] .dg-row', { hasText: 'Flux Strava 2025' })).toBeVisible();
    await expect(page.locator('.dg-sec[data-sec="sources"] .dg-row__sub', { hasText: 'Flux cyclistes Strava Metro' })).toBeVisible();
    // Le catalogue sait qu'elle est là
    await page.click('#dg-add-layer');
    await expect(page.locator('[data-source="strava"] .dg-src__state')).toContainText('Déjà ajouté');
    await page.keyboard.press('Escape');
  });

  test('12.8.2 - Baromètre FUB : trois couches de témoignages depuis une archive relayée', async ({ page }) => {
    // La plateforme FUB est simulée : liste des jeux puis archive (fixture).
    const zip = readFileSync('tests/fixtures/diagnostic-fub.zip');
    await page.route('**/api/sources/fub?*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('mode') === 'list') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ datasets: [
          { uid: '11111111-1111-4111-8111-111111111111', id: 'barometre-2025-commune-69123', year: 2025, scope: 'commune', title: 'Test 2025' },
          { uid: '22222222-2222-4222-8222-222222222222', id: 'barometre-2021-commune-69123', year: 2021, scope: 'commune', title: 'Test 2021' },
        ] }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/zip', body: zip });
      }
    });
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="fub"]');
    await expect(page.locator('#dg-src-add')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#dg-src-year option')).toHaveCount(2);
    await page.click('#dg-src-add');
    await expect(successToast(page, '3 couches')).toBeVisible({ timeout: 60000 });
    const rouge = page.locator('.dg-row', { hasText: 'Points à améliorer' });
    await expect(rouge.locator('[data-count]')).toHaveText('2', { timeout: 15000 });
    await expect(page.locator('.dg-row', { hasText: 'Améliorations constatées' })).toBeVisible();
    await expect(page.locator('.dg-row', { hasText: 'Souhaits de stationnement' })).toBeVisible();
    // Regroupées sous l'édition
    await expect(page.locator('.dg-group-label', { hasText: 'Baromètre vélo 2025' })).toBeVisible();
    // Le catalogue refuse un doublon de la même édition
    await page.click('#dg-add-layer');
    await page.click('[data-source="fub"]');
    await expect(page.locator('#dg-src-add')).toBeDisabled({ timeout: 30000 });
    await expect(page.locator('#dg-src-add')).toContainText('Déjà');
    await page.keyboard.press('Escape');
  });

  test('12.8.2b - Accidents corporels : fichiers nationaux lus en flux, filtrés sur la commune', async ({ page }) => {
    // data.gouv.fr est simulé : catalogue puis les trois fichiers d'une année.
    const csv = (name) => readFileSync(`tests/fixtures/baac-${name}.csv`, 'utf8');
    await page.route('**/www.data.gouv.fr/api/1/datasets/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resources: [
      { title: 'caract-2024.csv', url: 'https://static.data.gouv.fr/mock/caract-2024.csv' },
      { title: 'usagers-2024.csv', url: 'https://static.data.gouv.fr/mock/usagers-2024.csv' },
      { title: 'vehicules-2024.csv', url: 'https://static.data.gouv.fr/mock/vehicules-2024.csv' },
      { title: 'caracteristiques-2019.csv', url: 'https://static.data.gouv.fr/mock/caract-2019.csv' },
    ] }) }));
    await page.route('**/static.data.gouv.fr/mock/*', (route) => {
      const name = route.request().url().split('/').pop().replace('-2024.csv', '');
      route.fulfill({ status: 200, contentType: 'text/csv', body: csv(name) });
    });
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="accidents"]');
    await expect(page.locator('#dg-src-add')).toBeVisible({ timeout: 30000 });
    // 2019 n'a pas ses trois fichiers : seule 2024 est proposée
    await expect(page.locator('#dg-src-period option')).toHaveCount(1);
    await expect(page.locator('#dg-src-period')).toContainText('2024');
    await page.click('#dg-src-scope button[data-scope="commune"]');
    await page.click('#dg-src-add');
    await expect(successToast(page, 'ajoutée')).toBeVisible({ timeout: 60000 });
    const row = page.locator('.dg-row', { hasText: 'Accidents corporels 2024' });
    await expect(row.locator('[data-count]')).toHaveText('2', { timeout: 15000 });
    await expect(page.locator('.dg-group-label', { hasText: 'Sécurité' })).toBeVisible();
  });

  test('12.8.2d - Compteurs vélo : pages publiques lues, compteurs hors territoire écartés', async ({ page }) => {
    // Eco-Visio est simulé : deux compteurs dans Lyon, un à Grenoble ; les contours viennent de geo.api.gouv.fr.
    const list = JSON.parse(readFileSync('tests/fixtures/eco-visio-list.json', 'utf8'));
    await page.route('**/www.eco-visio.net/api/aladdin/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }));
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="comptages"]');
    await expect(page.locator('#dg-src-add')).toBeVisible({ timeout: 30000 });
    await page.click('#dg-src-scope button[data-scope="commune"]');
    await page.click('#dg-src-add');
    await expect(successToast(page, 'ajoutée')).toBeVisible({ timeout: 60000 });
    const row = page.locator('.dg-row', { hasText: 'Compteurs vélo' });
    await expect(row.locator('[data-count]')).toHaveText('2', { timeout: 15000 });
  });

  test('12.8.2c - Waze : un lien vérifié donne deux couches synchronisées', async ({ page }) => {
    const feed = JSON.parse(readFileSync('tests/fixtures/waze-feed.json', 'utf8'));
    await page.route('**/api/sources/waze?*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('mode') === 'check') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: 2, jams: 1 }) });
      const part = url.searchParams.get('part');
      const fc = part === 'jams'
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: feed.jams[0].line.map((p) => [p.x, p.y]) }, properties: { rue: 'Quai Perrache', retard_s: 240 } }] }
        : { type: 'FeatureCollection', features: feed.alerts.filter((a) => a.location).map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.location.x, a.location.y] }, properties: { type: a.type } })) };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fc) });
    });
    await goToDiagnostic(page);
    await page.click('#dg-add-first, #dg-add-layer');
    await page.click('[data-source="waze"]');
    await expect(page.locator('.dg-tuto li')).toHaveCount(3);
    await page.fill('#dg-src-link', 'https://www.waze.com/partnerhub-api/partners/1/waze-feeds/t?format=JSON');
    await page.click('#dg-src-check');
    await expect(page.locator('.dg-reco__head')).toContainText('Flux Waze valide', { timeout: 20000 });
    await expect(page.locator('.dg-reco')).toContainText('2 alertes et 1 ralentissement');
    await page.click('#dg-src-add');
    await expect(successToast(page, '2 couches')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.dg-row', { hasText: 'Alertes Waze' }).locator('[data-count]')).toHaveText('2', { timeout: 15000 });
    await expect(page.locator('.dg-row', { hasText: 'Ralentissements Waze' }).locator('[data-count]')).toHaveText('1', { timeout: 15000 });
    await expect(page.locator('.dg-group-label', { hasText: 'Circulation' })).toBeVisible();
  });

  test('12.8.3 - Nettoyage des couches du catalogue', async ({ page }) => {
    await goToDiagnostic(page);
    for (const label of ['Flux Strava 2025', 'Points à améliorer', 'Améliorations constatées', 'Souhaits de stationnement', 'Accidents corporels 2024', 'Compteurs vélo', 'Alertes Waze', 'Ralentissements Waze']) {
      const row = page.locator('.dg-row', { hasText: label });
      await expect(row).toBeVisible({ timeout: 10000 });
      await clearToasts(page);
      await row.locator('[data-act="delete"]').click();
      await page.click('#adm-dialog-confirm');
      await expect(successToast(page, 'Couche supprimée')).toBeVisible({ timeout: 15000 });
    }
    await expect(page.locator('#dg-panel-layers .dg-empty__title')).toContainText('Aucune couche');
  });
});

// ─────────────────────────────────────────────────────────
// 12.5 - Couche de référence (shapefile + tableau → Storage)
// ─────────────────────────────────────────────────────────
test.describe('12.5 - Couche de référence', () => {
  test.describe.configure({ mode: 'serial' });

  test('12.5.1 - Ajout depuis un shapefile enrichi : nature, dégradé et chiffres persistés', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', SHAPEFILE_ZIP);
    await expect(page.locator('#dg-wz-detect')).toContainText('Shapefile', { timeout: 20000 });
    await page.setInputFiles('#dg-wz-join-file', COMPTAGES_CSV);
    await expect(page.locator('#dg-wz-join-cfg')).toBeVisible();
    await page.selectOption('#dg-wz-join-fcol', 'year');
    await expect(page.locator('#dg-wz-join-fval')).toBeEnabled({ timeout: 10000 });
    await page.selectOption('#dg-wz-join-fval', '2025');
    await page.click('#dg-wz-join-apply');
    await expect(page.locator('#dg-wz-join-status')).toContainText('2 entité(s) enrichie(s)', { timeout: 10000 });
    // Le champ « year » ne sert plus à rien une fois filtré
    await page.locator('#dg-wz-keep .dg-chk', { hasText: 'year' }).click();

    await page.fill('#dg-wz-label', 'E2E-Flux');
    await page.click('#dg-wz-kind button[data-kind="reference"]');
    await page.click('#dg-wz-colormode button[data-mode="graduated"]');
    await page.selectOption('#dg-wz-valuefield', 'total_trip_count');
    await page.locator('[data-mfield="avg_speed"]').check();
    await page.selectOption('[data-magg="avg_speed"]', 'mean');
    await page.fill('#dg-wz-ai', 'Passages de cyclistes par tronçon en 2025');
    await page.click('#dg-wz-save');

    await expect(successToast(page, 'Couche ajoutée')).toBeVisible({ timeout: 20000 });
    const row = page.locator('.dg-row', { hasText: 'E2E-Flux' });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-count]')).toHaveText('2', { timeout: 15000 });
    // Une couche de référence l'annonce dans sa ligne de détail
    await expect(row.locator('.dg-row__sub')).toContainText('référence');
  });

  test('12.5.2 - Édition : la nature et les chiffres de zone reviennent tels qu\'enregistrés', async ({ page }) => {
    await goToDiagnostic(page);
    const row = page.locator('.dg-row', { hasText: 'E2E-Flux' });
    await expect(row.locator('[data-count]')).toHaveText('2', { timeout: 15000 });
    await row.locator('[data-act="edit"]').click();
    await expect(page.locator('#dg-wz-kind button.is-active')).toHaveAttribute('data-kind', 'reference');
    await expect(page.locator('#dg-wz-colormode button.is-active')).toHaveAttribute('data-mode', 'graduated');
    await expect(page.locator('#dg-wz-valuefield')).toHaveValue('total_trip_count');
    await expect(page.locator('[data-mfield="total_trip_count"]')).toBeChecked();
    await expect(page.locator('[data-mfield="avg_speed"]')).toBeChecked();
    await expect(page.locator('[data-magg="avg_speed"]')).toHaveValue('mean');
    // Le champ retiré à l'import n'existe plus
    await expect(page.locator('[data-mfield="year"]')).toHaveCount(0);
    await page.click('.dg-modal__foot [data-close]');
  });

  test('12.5.2b - Réordonner : glisser une couche au-dessus d\'une autre, ordre enregistré', async ({ page }) => {
    // Une seconde couche, puis on la fait passer devant la première.
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', { name: 'e2e-ordre.geojson', mimeType: 'application/geo+json', buffer: GEOJSON_FIXTURE });
    await expect(page.locator('#dg-wz-detect')).toContainText('GeoJSON');
    await page.fill('#dg-wz-label', 'E2E-Ordre');
    await page.click('#dg-wz-save');
    await expect(successToast(page, 'Couche ajoutée')).toBeVisible({ timeout: 20000 });
    const labels = () => page.locator('.dg-row--layer .dg-row__label').allInnerTexts();
    expect((await labels()).map((t) => t.trim())).toEqual(['E2E-Flux', 'E2E-Ordre']);
    const from = page.locator('.dg-row--layer', { hasText: 'E2E-Ordre' });
    const to = page.locator('.dg-row--layer', { hasText: 'E2E-Flux' });
    await from.locator('.dg-row__grip').dragTo(to, { targetPosition: { x: 40, y: 4 } });
    await expect.poll(async () => (await labels()).map((t) => t.trim())).toEqual(['E2E-Ordre', 'E2E-Flux']);
    // Persisté : l'ordre survit au rechargement
    await goToDiagnostic(page);
    await expect(page.locator('.dg-row--layer').first()).toContainText('E2E-Ordre', { timeout: 15000 });
    await clearToasts(page);
    await from.locator('[data-act="delete"]').click();
    await page.click('#adm-dialog-confirm');
    await expect(successToast(page, 'Couche supprimée')).toBeVisible({ timeout: 15000 });
  });

  test('12.5.3 - Suppression', async ({ page }) => {
    await goToDiagnostic(page);
    const row = page.locator('.dg-row', { hasText: 'E2E-Flux' });
    await expect(row).toBeVisible({ timeout: 10000 });
    await clearToasts(page);
    await row.locator('[data-act="delete"]').click();
    await page.click('#adm-dialog-confirm');
    await expect(successToast(page, 'Couche supprimée')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.dg-row', { hasText: 'E2E-Flux' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────
// 12.3 - CRUD des couches (persistance Supabase)
// ─────────────────────────────────────────────────────────
test.describe('12.3 - CRUD des couches', () => {
  test.describe.configure({ mode: 'serial' });

  test('12.3.1 - Ajout d\'une couche GeoJSON (fichier → Storage)', async ({ page }) => {
    await goToDiagnostic(page);
    await openAdvanced(page);
    await page.setInputFiles('#dg-wz-file', { name: 'e2e-signalements.geojson', mimeType: 'application/geo+json', buffer: GEOJSON_FIXTURE });
    await expect(page.locator('#dg-wz-detect')).toContainText('GeoJSON');
    await expect(page.locator('#dg-wz-detect')).toContainText('3');

    await page.fill('#dg-wz-label', 'E2E-Signalements');
    await page.fill('#dg-wz-ai', 'Signalements E2E de test');
    await expect(page.locator('#dg-wz-save')).toBeEnabled();
    await page.click('#dg-wz-save');

    await expect(successToast(page, 'Couche ajoutée')).toBeVisible({ timeout: 15000 });
    const row = page.locator('.dg-row', { hasText: 'E2E-Signalements' });
    await expect(row).toBeVisible();
    // Les données remontent depuis Storage : compteur = 3, rangée dans « Mes fichiers »
    await expect(row.locator('[data-count]')).toHaveText('3', { timeout: 15000 });
    await expect(page.locator('.dg-sec[data-sec="files"] .dg-row', { hasText: 'E2E-Signalements' })).toBeVisible();
    await expect(page.locator('.dg-sec[data-sec="files"] .dg-sec__count')).toHaveText('1 / 1');
  });

  test('12.3.2 - Édition : label + contexte IA persistés', async ({ page }) => {
    await goToDiagnostic(page);
    const row = page.locator('.dg-row', { hasText: 'E2E-Signalements' });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('[data-act="edit"]').click();
    await expect(page.locator('.dg-modal__title')).toContainText('Éditer la couche');
    await expect(page.locator('#dg-wz-label')).toHaveValue('E2E-Signalements');
    await expect(page.locator('#dg-wz-ai')).toHaveValue('Signalements E2E de test');

    await page.fill('#dg-wz-label', 'E2E-Signalements-Edit');
    await page.click('#dg-wz-save');
    await expect(successToast(page, 'Couche mise à jour')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.dg-row', { hasText: 'E2E-Signalements-Edit' })).toBeVisible();
  });

  test('12.3.2b - Dock : le fond de carte se choisit entre plan et satellite', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('.dg-tab[data-tab="map"]');
    await expect(page.locator('#dg-panel-map')).toBeVisible();
    await expect(page.locator('#dg-basemap button[data-basemap="plan"]')).toHaveClass(/is-active/);
    await expect(page.locator('#dg-basemap-row .dg-row__sub')).toContainText('OpenStreetMap');
    await page.click('#dg-basemap button[data-basemap="satellite"]');
    await expect(page.locator('#dg-basemap button[data-basemap="satellite"]')).toHaveClass(/is-active/);
    await expect(page.locator('#dg-basemap-row .dg-row__sub')).toContainText('IGN');
    // Le fond sombre reste disponible avec le satellite
    await expect(page.locator('#dg-dark-toggle')).toBeVisible();
  });

  test('12.3.3 - Visibilité : le toggle ne supprime rien', async ({ page }) => {
    await goToDiagnostic(page);
    const row = page.locator('.dg-row', { hasText: 'E2E-Signalements-Edit' });
    await expect(row).toBeVisible({ timeout: 10000 });
    const toggle = row.locator('[data-act="toggle"]');
    await expect(toggle).toBeChecked();
    await row.locator('.adm-switch__track').click();
    await expect(toggle).not.toBeChecked();
    // Toujours listée après rechargement de la section
    await goToDiagnostic(page);
    await expect(page.locator('.dg-row', { hasText: 'E2E-Signalements-Edit' })).toBeVisible({ timeout: 10000 });
  });

  test('12.3.4 - Suppression avec confirmation', async ({ page }) => {
    await goToDiagnostic(page);
    const row = page.locator('.dg-row', { hasText: 'E2E-Signalements-Edit' });
    await expect(row).toBeVisible({ timeout: 10000 });
    await clearToasts(page);
    await row.locator('[data-act="delete"]').click();
    await expect(page.locator('#adm-dialog-body')).toContainText('E2E-Signalements-Edit');
    await page.click('#adm-dialog-confirm');
    await expect(successToast(page, 'Couche supprimée')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.dg-row', { hasText: 'E2E-Signalements-Edit' })).toHaveCount(0);
    // Retour à l'état vide
    await expect(page.locator('#dg-panel-layers .dg-empty__title')).toContainText('Aucune couche');
  });
});

// ─────────────────────────────────────────────────────────
// 12.4 - Historique des rapports
// ─────────────────────────────────────────────────────────
test.describe('12.4 - Historique des rapports', () => {

  test('12.4.1 - Panneau historique (état vide)', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-history-btn');
    await expect(page.locator('#adm-slide-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.adm-slide-panel__title')).toContainText('Historique des diagnostics');
    await expect(page.locator('#adm-slide-content .adm-empty__title')).toContainText('Aucun diagnostic', { timeout: 10000 });
  });
});

// NB : le rendu MapLibre, le lasso et le flux d'analyse IA (sélection → /api/ai-diagnostic)
// nécessitent WebGL, indisponible dans le projet Playwright « admin » - couverts
// manuellement (cf. lacunes connues CLAUDE.md). Le contrat SSE de /api/ai-diagnostic
// suit exactement celui de /api/ai-generate, mocké dans admin.copilot.spec.js.
