// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigate to the contribution wizard and wait for it to load.
 */
async function goToWizard(page) {
  await page.goto('/admin/contributions/nouveau/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
  await page.waitForSelector('#cw-name', { state: 'visible', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 10 — Assistant de rédaction (Copilot)
// ─────────────────────────────────────────────────────────
test.describe('10.1 — Présence et ouverture du panneau', () => {

  test('10.1.1 — Bouton trigger visible dans le footer du wizard', async ({ page }) => {
    await goToWizard(page);
    const trigger = page.locator('.cp-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await expect(trigger.locator('.cp-trigger__label')).toContainText('Assistant');
    await expect(trigger.locator('i.fa-wand-magic-sparkles')).toBeVisible();
  });

  test('10.1.2 — Clic trigger → panneau s\'ouvre', async ({ page }) => {
    await goToWizard(page);
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeHidden();
    await page.locator('.cp-trigger').click();
    await expect(panel).toBeVisible({ timeout: 3000 });
    // Header elements
    await expect(panel.locator('.cp-panel__title')).toContainText('Assistant de rédaction');
    await expect(panel.locator('.cp-panel__close')).toBeVisible();
    await expect(panel.locator('.cp-panel__expand')).toBeVisible();
  });

  test('10.1.3 — Panneau fermé via bouton ×', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });
    await panel.locator('.cp-panel__close').click();
    await expect(panel).toBeHidden({ timeout: 3000 });
  });

  test('10.1.4 — Panneau fermé via Escape', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden({ timeout: 3000 });
  });

  test('10.1.5 — Toggle : ouvrir → fermer → rouvrir', async ({ page }) => {
    await goToWizard(page);
    const trigger = page.locator('.cp-trigger');
    const panel = page.locator('#cp-panel');
    // Open
    await trigger.click();
    await expect(panel).toBeVisible({ timeout: 3000 });
    // Close
    await trigger.click();
    await expect(panel).toBeHidden({ timeout: 3000 });
    // Reopen
    await trigger.click();
    await expect(panel).toBeVisible({ timeout: 3000 });
  });
});

test.describe('10.2 — Carte de complétion et signaux', () => {

  test('10.2.1 — Carte de complétion visible à 0% quand formulaire vide', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Completion card visible with 0%
    const card = panel.locator('.cp-completion-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.cp-completion-card__pct')).toContainText('0%');
  });

  test('10.2.2 — 7 signaux affichés (nom, catégorie, url, description, pdf, cover, article)', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const signals = panel.locator('.cp-signal');
    await expect(signals).toHaveCount(7);
    // All off initially (no fields filled)
    const offSignals = panel.locator('.cp-signal--off');
    await expect(offSignals).toHaveCount(7);
  });

  test('10.2.3 — Complétion augmente quand nom rempli', async ({ page }) => {
    await goToWizard(page);
    await page.fill('#cw-name', 'Test Project');
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Completion should be 20% (name weight = 20)
    await expect(panel.locator('.cp-completion-card__pct')).toContainText('20%');
    // Name signal should be ON
    const onSignals = panel.locator('.cp-signal--on');
    await expect(onSignals).toHaveCount(1);
  });

  test('10.2.4 — Complétion augmente quand nom + catégorie remplis → suggestions apparaissent', async ({ page }) => {
    await goToWizard(page);
    await page.fill('#cw-name', 'Test Project');
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) await pill.click();
    else await page.fill('#cw-cat-text', 'Test Category');

    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Completion ≥ 40% (name 20 + category 20)
    const pctText = await panel.locator('.cp-completion-card__pct').textContent();
    const pct = parseInt(pctText);
    expect(pct).toBeGreaterThanOrEqual(40);

    // Suggestions buttons should appear
    const suggestions = panel.locator('.cp-suggest-btn');
    await expect(suggestions.first()).toBeVisible({ timeout: 3000 });
    const count = await suggestions.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('10.2.5 — Message contextuel quand nom/catégorie absents', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Bot message about completing fields
    const botMsg = panel.locator('.cp-msg--bot');
    await expect(botMsg.first()).toContainText('nom');
    await expect(botMsg.first()).toContainText('catégorie');
  });
});

test.describe('10.3 — Recherche web et mode étendu', () => {

  test('10.3.1 — Toggle recherche web visible et fonctionnel', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const toggle = panel.locator('.cp-web-toggle');
    await expect(toggle).toBeVisible();
    // Default: ON
    await expect(toggle).toHaveClass(/cp-web-toggle--on/);
    await expect(toggle).toContainText('activée');

    // Click to disable
    await toggle.click();
    await expect(panel.locator('.cp-web-toggle')).toHaveClass(/cp-web-toggle--off/);
    await expect(panel.locator('.cp-web-toggle')).toContainText('désactivée');

    // Click again to re-enable
    await panel.locator('.cp-web-toggle').click();
    await expect(panel.locator('.cp-web-toggle')).toHaveClass(/cp-web-toggle--on/);
  });

  test('10.3.2 — Mode étendu (expand) : panneau plein écran + backdrop', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Expand
    await panel.locator('.cp-panel__expand').click();
    await expect(panel).toHaveClass(/cp-panel--expanded/, { timeout: 3000 });
    await expect(page.locator('.cp-backdrop')).toBeVisible();

    // Collapse via expand button
    await panel.locator('.cp-panel__expand').click();
    await expect(panel).not.toHaveClass(/cp-panel--expanded/, { timeout: 3000 });
  });

  test('10.3.3 — Escape ferme le mode étendu sans fermer le panneau', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Expand
    await panel.locator('.cp-panel__expand').click();
    await expect(panel).toHaveClass(/cp-panel--expanded/, { timeout: 3000 });

    // Escape collapses but keeps panel open
    await page.keyboard.press('Escape');
    await expect(panel).not.toHaveClass(/cp-panel--expanded/, { timeout: 3000 });
    await expect(panel).toBeVisible(); // still open!

    // Second Escape closes panel
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden({ timeout: 3000 });
  });

  test('10.3.4 — Backdrop click ferme le mode étendu', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Expand panel
    const expandBtn = panel.locator('.cp-panel__expand');
    await expect(expandBtn).toBeVisible({ timeout: 3000 });
    await expandBtn.click();
    await expect(panel).toHaveClass(/cp-panel--expanded/, { timeout: 3000 });

    // Backdrop is dynamically created on document.body (z-index: 10000, panel at 10001)
    const backdrop = page.locator('.cp-backdrop');
    await expect(backdrop).toBeVisible({ timeout: 3000 });

    // Click the backdrop at the top-left corner (outside the centered panel)
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(panel).not.toHaveClass(/cp-panel--expanded/, { timeout: 5000 });
  });
});

test.describe('10.4 — Badge et polling', () => {

  test('10.4.1 — Badge caché initialement (formulaire vide)', async ({ page }) => {
    await goToWizard(page);
    // Trigger button should be visible — copilot is mounted
    await expect(page.locator('.cp-trigger')).toBeVisible({ timeout: 5000 });
    const badge = page.locator('#cp-badge');
    // Wait one polling cycle (2s) to confirm badge stays hidden
    await page.waitForTimeout(2500);
    await expect(badge).toBeHidden();
  });

  test('10.4.2 — Badge apparaît quand formulaire suffisamment rempli (polling)', async ({ page }) => {
    await goToWizard(page);
    await expect(page.locator('.cp-trigger')).toBeVisible({ timeout: 5000 });
    // Fill name and category to trigger suggestions
    await page.fill('#cw-name', 'Parc Central Renovation');
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) await pill.click();
    else await page.fill('#cw-cat-text', 'Aménagement');

    // Wait for badge to appear via polling (interval = 2s, need at least 1 cycle)
    const badge = page.locator('#cp-badge:not([hidden])');
    await expect(badge).toBeVisible({ timeout: 8000 });
    const badgeText = await badge.textContent();
    expect(parseInt(badgeText)).toBeGreaterThanOrEqual(1);
  });

  test('10.4.3 — Badge caché quand panneau ouvert', async ({ page }) => {
    await goToWizard(page);
    await expect(page.locator('.cp-trigger')).toBeVisible({ timeout: 5000 });
    await page.fill('#cw-name', 'Parc Central');
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) await pill.click();
    else await page.fill('#cw-cat-text', 'Test');

    // Wait for badge to appear
    const badge = page.locator('#cp-badge');
    await expect(badge).toBeVisible({ timeout: 8000 });

    // Open panel → badge hidden
    await page.locator('.cp-trigger').click();
    await expect(page.locator('#cp-panel')).toBeVisible({ timeout: 3000 });
    await expect(badge).toBeHidden({ timeout: 3000 });
  });
});

test.describe('10.5 — Suggestions de génération', () => {

  test('10.5.1 — Bouton "Générer la description" visible quand nom+catégorie remplis', async ({ page }) => {
    await goToWizard(page);
    await page.fill('#cw-name', 'Test');
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) await pill.click();
    else await page.fill('#cw-cat-text', 'Test');

    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const descBtn = panel.locator('.cp-suggest-btn[data-target="description"]');
    await expect(descBtn).toBeVisible({ timeout: 3000 });
    await expect(descBtn).toContainText('description');
  });

  test('10.5.2 — Bouton "Générer l\'article" visible', async ({ page }) => {
    await goToWizard(page);
    await page.fill('#cw-name', 'Test');
    const pill = page.locator('.cw-cat-pill').first();
    if (await pill.count() > 0) await pill.click();
    else await page.fill('#cw-cat-text', 'Test');

    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const articleBtn = panel.locator('.cp-suggest-btn[data-target="article"]');
    await expect(articleBtn).toBeVisible({ timeout: 3000 });
    await expect(articleBtn).toContainText('article');
  });

  test('10.5.3 — Aucune suggestion si nom vide', async ({ page }) => {
    await goToWizard(page);
    await page.locator('.cp-trigger').click();
    const panel = page.locator('#cp-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const suggestions = panel.locator('.cp-suggest-btn');
    await expect(suggestions).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────
// 10.6 — Génération IA (appel réel à /api/ai-generate)
// ─────────────────────────────────────────────────────────

/**
 * Fill name + category, open copilot panel, ready for generation.
 */
async function openCopilotWithContext(page) {
  await goToWizard(page);
  await page.fill('#cw-name', 'Parc Blandan Lyon');
  const pill = page.locator('.cw-cat-pill').first();
  if (await pill.count() > 0) await pill.click();
  else await page.fill('#cw-cat-text', 'Aménagement');
  await page.locator('.cp-trigger').click();
  const panel = page.locator('#cp-panel');
  await expect(panel).toBeVisible({ timeout: 3000 });
  return panel;
}

test.describe('10.6 — Génération IA (description)', () => {

  test('10.6.1 — Indicateur de génération visible après clic', async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await openCopilotWithContext(page);

    // Clic sur "Générer la description"
    const descBtn = panel.locator('.cp-suggest-btn[data-target="description"]');
    await expect(descBtn).toBeVisible({ timeout: 3000 });
    await descBtn.click();

    // L'indicateur de génération apparaît
    const generating = panel.locator('.cp-generating');
    await expect(generating).toBeVisible({ timeout: 5000 });
    await expect(generating.locator('.cp-generating__dots')).toBeVisible();
    await expect(generating.locator('.cp-gen-status')).toBeVisible();
    await expect(generating.locator('.cp-generating__stop')).toBeVisible();

    // Le message bot "Je recherche…" est affiché
    const botMsg = panel.locator('.cp-msg--bot');
    await expect(botMsg.first()).toContainText('description');

    // Attendre la fin de la génération : boutons Copier + Insérer visibles
    const result = panel.locator('.cp-msg--result');
    const copyBtn = result.locator('.cp-action-btn[data-action="copy"]');
    await expect(copyBtn).toBeVisible({ timeout: 90_000 });
    await expect(result.locator('.cp-action-btn[data-action="insert"]')).toBeVisible();

    // L'indicateur de génération a disparu
    await expect(generating).toBeHidden();

    // Texte non vide (la génération est terminée)
    const resultText = await result.locator('.cp-msg__content').textContent();
    expect(resultText.trim().length).toBeGreaterThan(10);
  });

  test('10.6.2 — Insérer la description dans le champ', async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await openCopilotWithContext(page);

    // Générer et attendre la fin du streaming
    await panel.locator('.cp-suggest-btn[data-target="description"]').click();
    const result = panel.locator('.cp-msg--result');
    const insertBtn = result.locator('.cp-action-btn[data-action="insert"]');
    await expect(insertBtn).toBeVisible({ timeout: 90_000 });

    // Clic Insérer
    await insertBtn.click();

    // Le champ description est rempli
    const descField = page.locator('#cw-description');
    await expect(descField).not.toHaveValue('', { timeout: 3000 });

    // Toast de confirmation
    const toastEl = page.locator('.adm-toast--success');
    await expect(toastEl).toContainText('Description insérée', { timeout: 5000 });
  });

  test('10.6.3 — Bouton stop interrompt la génération', async ({ page }) => {
    test.setTimeout(60_000);
    const panel = await openCopilotWithContext(page);

    await panel.locator('.cp-suggest-btn[data-target="description"]').click();
    const generating = panel.locator('.cp-generating');
    await expect(generating).toBeVisible({ timeout: 5000 });

    // Cliquer stop immédiatement
    await generating.locator('.cp-generating__stop').click();

    // L'indicateur disparaît
    await expect(generating).toBeHidden({ timeout: 10_000 });

    // Soit "Génération interrompue." affiché, soit un résultat partiel
    const body = panel.locator('#cp-body');
    const text = await body.textContent();
    const interrupted = text.includes('interrompue') || text.includes('Erreur');
    const hasPartialResult = await panel.locator('.cp-msg--result').count() > 0;
    expect(interrupted || hasPartialResult).toBe(true);
  });

  test('10.6.4 — Double clic ne lance pas deux générations', async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await openCopilotWithContext(page);

    const descBtn = panel.locator('.cp-suggest-btn[data-target="description"]');
    await expect(descBtn).toBeVisible({ timeout: 3000 });

    // Double clic rapide
    await descBtn.dblclick();

    // L'indicateur apparaît une seule fois
    await expect(panel.locator('.cp-generating')).toBeVisible({ timeout: 5000 });

    // Attendre la fin de la génération
    const result = panel.locator('.cp-msg--result');
    await expect(result.locator('.cp-action-btn[data-action="copy"]')).toBeVisible({ timeout: 90_000 });

    // Un seul message résultat
    await expect(result).toHaveCount(1);
  });
});

test.describe('10.7 — Génération IA (article)', () => {

  test('10.7.1 — Génération article : résultat plus long', async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await openCopilotWithContext(page);

    const articleBtn = panel.locator('.cp-suggest-btn[data-target="article"]');
    await expect(articleBtn).toBeVisible({ timeout: 3000 });
    await articleBtn.click();

    // L'indicateur apparaît
    await expect(panel.locator('.cp-generating')).toBeVisible({ timeout: 5000 });

    // Message bot mentionne "article"
    await expect(panel.locator('.cp-msg--bot').first()).toContainText('article');

    // Attendre la fin du streaming : boutons d'action visibles
    const result = panel.locator('.cp-msg--result');
    await expect(result.locator('.cp-action-btn[data-action="copy"]')).toBeVisible({ timeout: 120_000 });
    await expect(result.locator('.cp-action-btn[data-action="insert"]')).toBeVisible();

    // Texte substantiel (la génération est terminée)
    const resultText = await result.locator('.cp-msg__content').textContent();
    expect(resultText.trim().length).toBeGreaterThan(100);
  });

  test('10.7.2 — Insérer article active l\'éditeur markdown', async ({ page }) => {
    test.setTimeout(180_000);
    const panel = await openCopilotWithContext(page);

    await panel.locator('.cp-suggest-btn[data-target="article"]').click();
    const result = panel.locator('.cp-msg--result');
    const insertBtn = result.locator('.cp-action-btn[data-action="insert"]');
    await expect(insertBtn).toBeVisible({ timeout: 120_000 });

    // Clic Insérer
    await insertBtn.click();

    // Le toggle markdown est activé et la section visible
    const mdToggle = page.locator('#cw-md-toggle');
    await expect(mdToggle).toBeChecked({ timeout: 5000 });
    const mdBody = page.locator('#cw-md-body');
    await expect(mdBody).toBeVisible({ timeout: 5000 });
  });
});
