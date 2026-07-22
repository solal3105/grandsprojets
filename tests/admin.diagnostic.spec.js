// @ts-check
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

/** Clean leftover E2E data from previous runs */
async function cleanupDiagnosticData() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  await sb.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  await sb.from('diagnostic_layers').delete().eq('ville', 'test-e2e').like('label', 'E2E-%');
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
 * NB : le dock ne dépend pas de la carte (WebGL indisponible en headless) —
 * seuls le rendu MapLibre et le lasso ne sont pas testables ici.
 */
async function goToDiagnostic(page) {
  await waitForBoot(page, '/admin/diagnostic/');
  await page.waitForSelector('.dg-dock', { timeout: 10000 });
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

const CSV_FIXTURE = Buffer.from(
  'nom;latitude;longitude;motif\n' +
  'Capteur 1;45.18;5.72;flux élevé\n' +
  'Capteur 2;45.19;5.73;flux modéré\n'
);

// ─────────────────────────────────────────────────────────
// 12.1 — Boot & navigation
// ─────────────────────────────────────────────────────────
test.describe('12.1 — Boot & navigation', () => {

  test('12.1.1 — Entrée sidebar visible et section accessible', async ({ page }) => {
    await waitForBoot(page);
    const navItem = page.locator('.adm-nav-item[data-section="diagnostic"]');
    await expect(navItem).toBeVisible();
    await navItem.click();
    await expect(page.locator('.adm-page-title')).toContainText('Diagnostic terrain');
    await expect(page.locator('#dg-history-btn')).toBeVisible();
    await expect(navItem).toHaveClass(/active/);
  });

  test('12.1.2 — Dock : onglets Couches / Analyse', async ({ page }) => {
    await goToDiagnostic(page);
    await expect(page.locator('.dg-tab[data-tab="layers"]')).toHaveClass(/is-active/);
    await page.click('.dg-tab[data-tab="analyse"]');
    await expect(page.locator('.dg-tab[data-tab="analyse"]')).toHaveClass(/is-active/);
    await expect(page.locator('#dg-panel-analyse .dg-empty__title')).toContainText('Aucune zone sélectionnée');
    await expect(page.locator('#dg-panel-layers')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────
// 12.2 — État vide & wizard (sans persistance)
// ─────────────────────────────────────────────────────────
test.describe('12.2 — État vide & wizard', () => {

  test('12.2.1 — Aucune couche : état vide avec CTA', async ({ page }) => {
    await goToDiagnostic(page);
    await expect(page.locator('#dg-panel-layers .dg-empty__title')).toContainText('Aucune couche', { timeout: 10000 });
    await expect(page.locator('#dg-add-first')).toBeVisible();
  });

  test('12.2.2 — Wizard : ouverture, sources, validation, annulation', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first');
    await expect(page.locator('.dg-modal__title')).toContainText('Ajouter une couche');
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

  test('12.2.3 — Wizard : détection CSV + colonnes lat/lng', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first');
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
});

// ─────────────────────────────────────────────────────────
// 12.3 — CRUD des couches (persistance Supabase)
// ─────────────────────────────────────────────────────────
test.describe('12.3 — CRUD des couches', () => {
  test.describe.configure({ mode: 'serial' });

  test('12.3.1 — Ajout d\'une couche GeoJSON (fichier → Storage)', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-add-first');
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
    // Les données remontent depuis Storage : compteur = 3
    await expect(row.locator('[data-count]')).toHaveText('3', { timeout: 15000 });
  });

  test('12.3.2 — Édition : label + contexte IA persistés', async ({ page }) => {
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

  test('12.3.3 — Visibilité : le toggle ne supprime rien', async ({ page }) => {
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

  test('12.3.4 — Suppression avec confirmation', async ({ page }) => {
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
// 12.4 — Historique des rapports
// ─────────────────────────────────────────────────────────
test.describe('12.4 — Historique des rapports', () => {

  test('12.4.1 — Panneau historique (état vide)', async ({ page }) => {
    await goToDiagnostic(page);
    await page.click('#dg-history-btn');
    await expect(page.locator('#adm-slide-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.adm-slide-panel__title')).toContainText('Historique des diagnostics');
    await expect(page.locator('#adm-slide-content .adm-empty__title')).toContainText('Aucun diagnostic', { timeout: 10000 });
  });
});

// NB : le rendu MapLibre, le lasso et le flux d'analyse IA (sélection → /api/ai-diagnostic)
// nécessitent WebGL, indisponible dans le projet Playwright « admin » — couverts
// manuellement (cf. lacunes connues CLAUDE.md). Le contrat SSE de /api/ai-diagnostic
// suit exactement celui de /api/ai-generate, mocké dans admin.copilot.spec.js.
