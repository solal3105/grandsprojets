// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigates to admin and waits for the boot sequence to complete.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

/**
 * Navigate to contributions and wait for the list to load (skeleton disappears).
 */
async function goToContributions(page) {
  await waitForBoot(page, '/admin/contributions/');
  await page.waitForFunction(() => {
    const body = document.querySelector('#contrib-list-body');
    if (!body) return false;
    return !body.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 2.1 — Liste (admin)
// ─────────────────────────────────────────────────────────
test.describe('2.1 — Liste des contributions (admin)', () => {

  test('2.1.1 — Titre, sous-titre, bouton nouvelle contribution', async ({ page }) => {
    await goToContributions(page);
    await expect(page.locator('.adm-page-title')).toContainText('Contributions');
    await expect(page.locator('.adm-page-subtitle')).toBeVisible();
    await expect(page.locator('a[href="/admin/contributions/nouveau/"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/contributions/nouveau/"]')).toContainText('Nouvelle contribution');
  });

  test('2.1.2 — Liste chargée (skeleton disparaît)', async ({ page }) => {
    await goToContributions(page);
    await expect(page.locator('#contrib-list-body .adm-skeleton')).toHaveCount(0);
  });

  test('2.1.6 — Boutons actions visibles (admin)', async ({ page }) => {
    await goToContributions(page);
    const items = page.locator('.adm-list-item');
    const count = await items.count();
    if (count === 0) return; // Empty state, skip
    const first = items.first();
    await expect(first.locator('[data-action="detail"]')).toBeVisible();
    await expect(first.locator('[data-action="delete"]')).toBeVisible();
    const hasApprove = await first.locator('[data-action="approve"]').count();
    const hasUnapprove = await first.locator('[data-action="unapprove"]').count();
    expect(hasApprove + hasUnapprove).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────────────────
// 2.2 — Filtres et recherche
// ─────────────────────────────────────────────────────────
test.describe('2.2 — Filtres et recherche', () => {

  test('2.2.1 — Onglet "Toutes" actif par défaut', async ({ page }) => {
    await goToContributions(page);
    const allTab = page.locator('#contrib-tabs .adm-tab[data-status=""]');
    await expect(allTab).toHaveClass(/active/);
  });

  test('2.2.2–2.2.4 — Onglets status filtrent', async ({ page }) => {
    await goToContributions(page);
    await page.click('#contrib-tabs .adm-tab[data-status="pending"]');
    await expect(page.locator('#contrib-tabs .adm-tab[data-status="pending"]')).toHaveClass(/active/);
    await page.waitForTimeout(500);
    await page.click('#contrib-tabs .adm-tab[data-status="approved"]');
    await expect(page.locator('#contrib-tabs .adm-tab[data-status="approved"]')).toHaveClass(/active/);
    await page.waitForTimeout(500);
    await page.click('#contrib-tabs .adm-tab[data-status=""]');
    await expect(page.locator('#contrib-tabs .adm-tab[data-status=""]')).toHaveClass(/active/);
  });

  test('2.2.5 — Recherche avec debounce', async ({ page }) => {
    await goToContributions(page);
    const searchInput = page.locator('#contrib-search');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('xxxxxxxxxzzzzzzzzzz');
    await page.waitForTimeout(1000);
    const items = page.locator('#contrib-list-body .adm-list-item');
    await expect(items).toHaveCount(0);
  });

  test('2.2.5b — Recherche sans résultat → empty state', async ({ page }) => {
    await goToContributions(page);
    await page.locator('#contrib-search').fill('aucunresultatpossible999');
    await page.waitForTimeout(1000);
    await expect(page.locator('#contrib-list-body .adm-empty')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#contrib-list-body .adm-empty__title')).toContainText('Aucun');
  });

  test('2.2.6 — Filtre catégorie existe', async ({ page }) => {
    await goToContributions(page);
    const catSelect = page.locator('#contrib-filter-cat');
    await expect(catSelect).toBeVisible();
    expect(await catSelect.locator('option').count()).toBeGreaterThanOrEqual(1);
  });

  test('2.2.7 — Tri fonctionne', async ({ page }) => {
    await goToContributions(page);
    const sortSelect = page.locator('#contrib-sort');
    await expect(sortSelect).toBeVisible();
    await sortSelect.selectOption('created_at:asc');
    await page.waitForTimeout(500);
    await sortSelect.selectOption('project_name:asc');
    await page.waitForTimeout(500);
    await expect(sortSelect).toHaveValue('project_name:asc');
  });

});

// ─────────────────────────────────────────────────────────
// 2.6 — Wizard de création (admin)
// ─────────────────────────────────────────────────────────
test.describe('2.6 — Wizard de création (admin)', () => {

  test('2.6.1 — Clic "Nouvelle contribution" → URL wizard', async ({ page }) => {
    await goToContributions(page);
    await page.click('a[href="/admin/contributions/nouveau/"]');
    await expect(page).toHaveURL(/\/admin\/contributions\/nouveau\//);
    await expect(page.locator('.cw-header__title')).toContainText('Nouvelle contribution');
  });

  test('2.6.2 — Section identité : champ nom obligatoire', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });
    await expect(page.locator('#cw-name')).toBeVisible();
    await expect(page.locator('label[for="cw-name"]')).toContainText('*');
  });

  test('2.6.3–2.6.4 — Pills catégorie chargées et sélectionnables', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });

    const pillCount = await page.locator('.cw-cat-pill').count();
    const hasTextInput = await page.locator('#cw-cat-text').count() > 0;
    expect(pillCount > 0 || hasTextInput).toBeTruthy();

    if (pillCount > 0) {
      const firstPill = page.locator('.cw-cat-pill').first();
      await firstPill.click();
      await expect(firstPill).toHaveClass(/cw-cat-pill--selected/);
      const category = await page.locator('#cw-category').inputValue();
      expect(category.length).toBeGreaterThan(0);
    }
  });

  test('2.6.5 — Compteur de caractères description', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-description', { state: 'visible', timeout: 10000 });
    await page.locator('#cw-description').fill('Test description');
    await expect(page.locator('#cw-desc-count')).toContainText('16');
  });

  test('2.6.6 — Section image : dropzone visible', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-cover-drop', { state: 'visible', timeout: 10000 });
    await expect(page.locator('#cw-cover-drop')).toBeVisible();
  });

  test('2.6.8 — Toggle Dessiner / Importer', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    const drawBtn = page.locator('.cw-loc-toggle__btn[data-mode="draw"]');
    await drawBtn.scrollIntoViewIfNeeded();
    await expect(drawBtn).toHaveClass(/active/);
    await page.click('.cw-loc-toggle__btn[data-mode="file"]');
    await expect(page.locator('.cw-loc-toggle__btn[data-mode="file"]')).toHaveClass(/active/);
    await expect(page.locator('#cw-loc-file')).toBeVisible();
  });

  test.fixme('2.6.10 — Outils de dessin disponibles — requires WebGL', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    // The draw toolbar buttons render only AFTER MapLibre map fires 'load' (WebGL required)
    const toolbar = page.locator('#cw-draw-toolbar');
    await toolbar.scrollIntoViewIfNeeded();
    // Wait for MapLibre init + toolbar render (WebGL can be slow in headless)
    await expect(page.locator('.cw-dtb__tool[data-tool="marker"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.cw-dtb__tool[data-tool="line"]')).toBeVisible();
    await expect(page.locator('.cw-dtb__tool[data-tool="polygon"]')).toBeVisible();
  });

  test('2.6.12–2.6.13 — Import GeoJSON valide', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    const fileBtn = page.locator('.cw-loc-toggle__btn[data-mode="file"]');
    await fileBtn.scrollIntoViewIfNeeded();
    await fileBtn.click();
    await expect(page.locator('#cw-loc-file')).toBeVisible({ timeout: 5000 });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [4.835, 45.764] },
        properties: {}
      }]
    });

    await page.locator('#cw-geojson-file').setInputFiles({
      name: 'test.geojson',
      mimeType: 'application/json',
      buffer: Buffer.from(geojson),
    });

    await expect(page.locator('#cw-geojson-result')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#cw-geojson-name')).toContainText('test.geojson');
    await expect(page.locator('#cw-geojson-meta')).toContainText('1 feature');
  });

  test('2.6.15 — Champ URL officielle', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    const urlInput = page.locator('#cw-official-url');
    await urlInput.scrollIntoViewIfNeeded();
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveAttribute('type', 'url');
  });

  test('2.6.17 — Bouton Ajouter un PDF visible', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    const btn = page.locator('#cw-add-doc');
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Ajouter un PDF');
  });

  test('2.6.18 — Section publication (admin) : toggle publier', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    const section = page.locator('#cw-sect-publish');
    await section.scrollIntoViewIfNeeded();
    await expect(page.locator('#cw-publish')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('#cw-publish')).toBeChecked();
  });

  test('2.6.20 — Validation : soumettre sans nom → toast erreur', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-submit', { state: 'visible', timeout: 10000 });
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) await pill.click();
    const btn = page.locator('#cw-submit');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.locator('.adm-toast--error')).toContainText('Le nom du projet est obligatoire', { timeout: 5000 });
  });

  test('2.6.21 — Validation : soumettre sans catégorie → toast erreur', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-submit', { state: 'visible', timeout: 10000 });
    await page.fill('#cw-name', 'Test sans catégorie');
    const btn = page.locator('#cw-submit');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.locator('.adm-toast--error')).toContainText('Veuillez choisir une catégorie', { timeout: 5000 });
  });

  test('2.6.22 — Validation : soumettre sans tracé → toast erreur', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-submit', { state: 'visible', timeout: 10000 });
    await page.fill('#cw-name', 'Test sans tracé');
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) {
      await pill.click();
    } else {
      await page.fill('#cw-cat-text', 'Test');
    }
    const btn = page.locator('#cw-submit');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.locator('.adm-toast--error')).toContainText('tracé géographique est obligatoire', { timeout: 5000 });
  });

  test('2.6.24 — Bouton retour vers la liste', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('.cw-back-link', { state: 'visible', timeout: 10000 });
    await expect(page.locator('.cw-back-link')).toHaveAttribute('href', '/admin/contributions/');
  });

});

// ─────────────────────────────────────────────────────────
// 2.5 — Panneau de détail (contenu riche)
// ─────────────────────────────────────────────────────────
test.describe('2.5 — Panneau de détail (contenu riche)', () => {

  /**
   * Open the detail panel for the first visible contribution.
   * Returns the list item locator.
   */
  async function openFirstDetail(page) {
    await goToContributions(page);
    const items = page.locator('.adm-list-item');
    const count = await items.count();
    if (count === 0) throw new Error('No contributions to open');
    await items.first().locator('[data-action="detail"]').click();
    await expect(page.locator('#adm-slide-panel[aria-hidden="false"]')).toBeVisible({ timeout: 5000 });
    return items.first();
  }

  test('2.5.1 — Cover image ou placeholder affiché', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    // Either an actual cover image or the placeholder icon
    const cover = panel.locator('.sp-cover');
    await expect(cover).toBeVisible({ timeout: 5000 });
  });

  test('2.5.2 — Badge statut (Approuvée ou En attente) visible', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    const badges = panel.locator('.sp-badges .adm-badge');
    await expect(badges.first()).toBeVisible();
    // Status badge is either success or warning
    const statusBadge = panel.locator('.sp-badges .adm-badge--success, .sp-badges .adm-badge--warning').first();
    await expect(statusBadge).toBeVisible();
  });

  test('2.5.3 — Badge catégorie visible', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    await expect(panel.locator('.sp-badges .adm-badge--info')).toBeVisible();
  });

  test('2.5.4 — Date de création affichée', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    const dateMeta = panel.locator('.sp-meta-item').filter({ has: page.locator('i.fa-calendar') });
    await expect(dateMeta).toBeVisible();
  });

  test('2.5.5 — Ville affichée', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    const villeMeta = panel.locator('.sp-meta-item').filter({ has: page.locator('i.fa-building') });
    await expect(villeMeta).toBeVisible();
  });

  test('2.5.6 — Boutons Edit et Supprimer dans le footer', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    await expect(panel.locator('#sp-edit')).toBeVisible();
    await expect(panel.locator('#sp-delete')).toBeVisible();
    // Edit link points to modifier route
    expect(await panel.locator('#sp-edit').getAttribute('href')).toContain('/admin/contributions/modifier/');
  });

  test('2.5.7 — Description affichée si présente', async ({ page }) => {
    await openFirstDetail(page);
    const panel = page.locator('#adm-slide-content');
    // Description may or may not be present, just verify section renders
    const descSection = panel.locator('.sp-description');
    const hasDesc = await descSection.count();
    if (hasDesc > 0) {
      await expect(descSection).toBeVisible();
      const text = await descSection.textContent();
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────
// 2.7 — Wizard : sections supplémentaires
// ─────────────────────────────────────────────────────────
test.describe('2.7 — Wizard sections supplémentaires', () => {

  test('2.7.1 — Section couverture visible avec dropzone', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });
    const coverSection = page.locator('#cw-sect-visual');
    await expect(coverSection).toBeVisible();
    await expect(page.locator('#cw-cover-drop')).toBeVisible();
    await expect(page.locator('#cw-cover-file')).toHaveCount(1); // hidden input exists
  });

  test('2.7.2 — Upload image couverture → preview affichée', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    // Upload a 1x1 pixel PNG via hidden file input
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const fileInput = page.locator('#cw-cover-file');
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles({
      name: 'test-cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngBase64, 'base64'),
    });

    // Preview should appear (client-side ObjectURL)
    await expect(page.locator('#cw-cover-preview')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#cw-cover-img')).toBeVisible({ timeout: 3000 });
  });

  test('2.7.3 — Toggle dessiner/importer bascule les panneaux', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    const drawBtn = page.locator('.cw-loc-toggle__btn[data-mode="draw"]');
    const fileBtn = page.locator('.cw-loc-toggle__btn[data-mode="file"]');
    const drawPane = page.locator('#cw-loc-draw');
    const filePane = page.locator('#cw-loc-file');

    // Default: draw mode active
    await expect(drawBtn).toHaveClass(/active/);
    await expect(drawPane).toBeVisible();
    await expect(filePane).toBeHidden();

    // Switch to file mode
    await fileBtn.scrollIntoViewIfNeeded();
    await fileBtn.click();
    await expect(fileBtn).toHaveClass(/active/);
    await expect(filePane).toBeVisible({ timeout: 5000 });
    await expect(drawPane).toBeHidden();

    // Switch back to draw
    await drawBtn.click();
    await expect(drawBtn).toHaveClass(/active/);
    await expect(drawPane).toBeVisible({ timeout: 5000 });
  });

  test('2.7.4 — Section documents : bouton "Ajouter un PDF" visible', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    const addDocBtn = page.locator('#cw-add-doc');
    await addDocBtn.scrollIntoViewIfNeeded();
    await expect(addDocBtn).toBeVisible();
    await expect(addDocBtn).toContainText('Ajouter un PDF');
    await expect(page.locator('#cw-doc-file')).toHaveCount(1); // hidden input
  });

  test('2.7.5 — Toggle markdown article : cocher → éditeur visible', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    const toggle = page.locator('#cw-md-toggle');
    const body = page.locator('#cw-md-body');
    await toggle.scrollIntoViewIfNeeded();

    // Default: unchecked, body hidden
    await expect(body).toBeHidden();

    // Check → body visible
    await toggle.check({ force: true });
    await expect(body).toBeVisible({ timeout: 5000 });

    // Editor area inside (Toast UI or textarea fallback)
    const editorArea = page.locator('#cw-editor');
    await expect(editorArea).toBeVisible();
  });

  test('2.7.6 — Section documents : zone documents vide par défaut', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    const docsList = page.locator('#cw-docs-list');
    await expect(docsList).toBeVisible();
    // Empty state: no docs uploaded yet
    await expect(docsList).toContainText('Aucun document');
  });

  test('2.7.7 — Section publication : admin voit le toggle publier', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    const publishSection = page.locator('#cw-sect-publish');
    await publishSection.scrollIntoViewIfNeeded();
    await expect(publishSection).toBeVisible();
    // Admin sees toggle (not notice)
    await expect(page.locator('#cw-publish')).toHaveCount(1);
  });

  test('2.7.8 — URL officielle : champ visible avec placeholder', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    const urlField = page.locator('#cw-official-url');
    await urlField.scrollIntoViewIfNeeded();
    await expect(urlField).toBeVisible();
    await expect(urlField).toHaveAttribute('type', 'url');
    await expect(urlField).toHaveAttribute('placeholder', /https?:\/\//);
  });

  test('2.7.9 — Upload PDF → item rendu dans la liste documents', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    // Create a minimal PDF buffer (PDF header + minimal content)
    const pdfBytes = '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF';
    await page.locator('#cw-doc-file').setInputFiles({
      name: 'rapport-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes),
    });

    // Document item should appear in the list
    const docItem = page.locator('.cw-doc-item');
    await expect(docItem).toBeVisible({ timeout: 5000 });
    // Title input pre-filled with filename (minus .pdf)
    await expect(docItem.locator('.cw-doc-title')).toHaveValue('rapport-test');
    // Remove button visible
    await expect(docItem.locator('[data-remove-doc]')).toBeVisible();
  });

  test('2.7.10 — Suppression document de la liste', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    // Upload a PDF first
    const pdfBytes = '%PDF-1.0\n%%EOF';
    await page.locator('#cw-doc-file').setInputFiles({
      name: 'a-supprimer.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes),
    });
    await expect(page.locator('.cw-doc-item')).toBeVisible({ timeout: 5000 });

    // Remove it
    await page.locator('[data-remove-doc="0"]').click();
    // List should show empty state again
    await expect(page.locator('.cw-docs-empty')).toBeVisible({ timeout: 3000 });
  });

  test('2.7.11 — Markdown editor : saisie dans le textarea/editor', async ({ page }) => {
    await waitForBoot(page, '/admin/contributions/nouveau/');
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });

    // Enable markdown
    const toggle = page.locator('#cw-md-toggle');
    await toggle.check({ force: true });
    const body = page.locator('#cw-md-body');
    await expect(body).toBeVisible({ timeout: 5000 });

    // The editor area should exist
    const editor = page.locator('#cw-editor');
    await expect(editor).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 2.x — CRUD complet en un seul test (même page context)
// ─────────────────────────────────────────────────────────
test.describe('2.x — CRUD complet contributions', () => {

  test('Cycle complet : création → liste → détail → approve → edit → suppression', async ({ page }) => {
    const TEST_NAME = `E2E-Test-${Date.now()}`;
    const UPDATED_NAME = `${TEST_NAME}-Mod`;
    // Helper: clear stale toasts (slide panel map can trigger error toasts)
    const clearToasts = () => page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));
    const successToast = (text) => page.locator('.adm-toast--success').filter({ hasText: text });

    // ── Créer ──
    await goToContributions(page);
    await page.click('a[href="/admin/contributions/nouveau/"]');
    await expect(page).toHaveURL(/\/admin\/contributions\/nouveau\//);
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });

    await page.fill('#cw-name', TEST_NAME);
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) {
      await pill.click();
    } else {
      await page.fill('#cw-cat-text', 'Test Category');
    }

    const fileToggle = page.locator('.cw-loc-toggle__btn[data-mode="file"]');
    await fileToggle.scrollIntoViewIfNeeded();
    await fileToggle.click();
    await expect(page.locator('#cw-loc-file')).toBeVisible({ timeout: 5000 });

    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [4.835, 45.764] }, properties: {} }]
    });
    await page.locator('#cw-geojson-file').setInputFiles({
      name: 'test.geojson', mimeType: 'application/json', buffer: Buffer.from(geojson),
    });
    await expect(page.locator('#cw-geojson-result')).toBeVisible({ timeout: 5000 });

    const submitBtn = page.locator('#cw-submit');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();
    await expect(successToast('Contribution créée')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/contributions\//, { timeout: 10000 });

    // ── Vérifier dans la liste — reload pour forcer un fetch frais ──
    await page.reload();
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => {
      const b = document.querySelector('#contrib-list-body');
      return b && !b.querySelector('.adm-skeleton');
    }, { timeout: 15000 });
    const item = page.locator('.adm-list-item', { hasText: TEST_NAME });
    await expect(item).toBeVisible({ timeout: 15000 });
    await expect(item.locator('.adm-list-item__name')).toContainText(TEST_NAME);
    await expect(item.locator('.adm-badge').first()).toBeVisible();

    // ── Détail slide panel ──
    await clearToasts();
    await item.locator('[data-action="detail"]').click();
    await expect(page.locator('#adm-slide-panel[aria-hidden="false"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.adm-slide-panel__title')).toContainText(TEST_NAME);
    await expect(page.locator('#sp-delete')).toBeVisible();
    await expect(page.locator('#sp-edit')).toBeVisible();
    await expect(page.locator('#sp-toggle-approve')).toBeVisible();

    // Fermer via ×
    await page.click('#adm-slide-close');
    await expect(page.locator('#adm-slide-panel')).toHaveAttribute('aria-hidden', 'true');

    // Ouvrir + fermer via backdrop
    await item.locator('[data-action="detail"]').click();
    await expect(page.locator('#adm-slide-panel[aria-hidden="false"]')).toBeVisible({ timeout: 5000 });
    await page.click('#adm-slide-backdrop');
    await expect(page.locator('#adm-slide-panel')).toHaveAttribute('aria-hidden', 'true');

    // ── Approuver / Désapprouver ──
    await clearToasts();
    // Re-query item fresh after panel operations
    const freshItem = page.locator('.adm-list-item', { hasText: TEST_NAME });
    await expect(freshItem).toBeVisible({ timeout: 5000 });

    // Normalize to approved state first
    const hasApproveBtn = await freshItem.locator('[data-action="approve"]').count() > 0;
    if (hasApproveBtn) {
      await freshItem.locator('[data-action="approve"]').click();
      await expect(successToast('Contribution approuvée')).toBeVisible({ timeout: 10000 });
      await clearToasts();
    }

    // Now unapprove (toast type is 'warning')
    await expect(freshItem.locator('[data-action="unapprove"]')).toBeVisible({ timeout: 10000 });
    await freshItem.locator('[data-action="unapprove"]').click();
    await expect(page.locator('.adm-toast--warning').filter({ hasText: 'Approbation retirée' })).toBeVisible({ timeout: 10000 });
    await clearToasts();

    // ── Modifier via wizard ──
    await clearToasts();
    const itemForDetail = page.locator('.adm-list-item', { hasText: TEST_NAME });
    await expect(itemForDetail).toBeVisible({ timeout: 5000 });
    await itemForDetail.locator('[data-action="detail"]').click();
    await expect(page.locator('#adm-slide-panel[aria-hidden="false"]')).toBeVisible({ timeout: 5000 });
    const editLink = page.locator('#sp-edit');
    expect(await editLink.getAttribute('href')).toContain('/admin/contributions/modifier/');
    await editLink.click();
    await expect(page).toHaveURL(/\/admin\/contributions\/modifier\/\d+\//);
    // Close slide panel if still open (SPA navigation doesn't auto-close it)
    if (await page.locator('#adm-slide-panel[aria-hidden="false"]').count() > 0) {
      await page.click('#adm-slide-close');
    }
    await page.waitForSelector('#cw-name', { state: 'visible', timeout: 10000 });
    await expect(page.locator('.cw-header__title')).toContainText('Modifier la contribution');
    await expect(page.locator('#cw-name')).toHaveValue(TEST_NAME);

    // GeoJSON existant notice
    const geoNotice = page.locator('.cw-notice--success');
    await geoNotice.scrollIntoViewIfNeeded();
    await expect(geoNotice).toContainText('GeoJSON existant');

    await page.fill('#cw-name', UPDATED_NAME);
    const saveBtn = page.locator('#cw-submit');
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    await expect(successToast('Contribution mise à jour')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/contributions\//, { timeout: 10000 });

    // ── Supprimer ── reload pour fetch frais
    await page.reload();
    await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => {
      const b = document.querySelector('#contrib-list-body');
      return b && !b.querySelector('.adm-skeleton');
    }, { timeout: 15000 });
    const updatedItem = page.locator('.adm-list-item', { hasText: UPDATED_NAME });
    await expect(updatedItem).toBeVisible({ timeout: 15000 });

    // Cancel first
    await clearToasts();
    await updatedItem.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#adm-dialog-body')).toContainText('Supprimer cette contribution');
    await page.click('#adm-dialog-cancel');
    await expect(updatedItem).toBeVisible();

    // Confirm
    await updatedItem.locator('[data-action="delete"]').click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await page.click('#adm-dialog-confirm');
    await expect(successToast('Contribution supprimée')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.adm-list-item', { hasText: UPDATED_NAME })).toHaveCount(0, { timeout: 5000 });
  });

});
