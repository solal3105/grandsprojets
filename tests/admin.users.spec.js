// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigate to users section and wait for the list to load.
 */
async function goToUsers(page) {
  await page.goto('/admin/utilisateurs/');
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('#users-list-body');
    return el && !el.querySelector('.adm-skeleton');
  }, { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 4.1 — Liste
// ─────────────────────────────────────────────────────────
test.describe('4.1 — Liste des utilisateurs', () => {

  test('4.1.1 — Titre, bouton Inviter, tabs rôles', async ({ page }) => {
    await goToUsers(page);
    await expect(page.locator('.adm-page-title')).toContainText('Utilisateurs');
    await expect(page.locator('#users-invite-btn')).toBeVisible();
    await expect(page.locator('#users-role-filter .adm-tab[data-role="all"]')).toBeVisible();
    await expect(page.locator('#users-role-filter .adm-tab[data-role="admin"]')).toBeVisible();
    await expect(page.locator('#users-role-filter .adm-tab[data-role="invited"]')).toBeVisible();
  });

  test('4.1.2 — Liste chargée avec des user rows', async ({ page }) => {
    await goToUsers(page);
    const rows = page.locator('.adm-user-row');
    await expect(rows.first()).toBeVisible();
    // The current admin user is excluded from the list
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('4.1.3 — Chaque user row : avatar, email, badge rôle', async ({ page }) => {
    await goToUsers(page);
    const row = page.locator('.adm-user-row').first();
    await expect(row.locator('.adm-user-row__avatar')).toBeVisible();
    await expect(row.locator('.adm-user-row__email')).toBeVisible();
    await expect(row.locator('.adm-badge').first()).toBeVisible();
  });

  test('4.1.4 — Bouton Promouvoir/Rétrograder présent', async ({ page }) => {
    await goToUsers(page);
    const toggleBtn = page.locator('[data-action="toggle-role"]').first();
    await expect(toggleBtn).toBeVisible();
  });

  test('4.1.5 — Admin courant exclu de sa propre liste', async ({ page }) => {
    await goToUsers(page);
    // The current admin email should NOT appear in the user list
    const adminRow = page.locator('.adm-user-row', { hasText: 'teste2e+admin' });
    await expect(adminRow).toHaveCount(0);
    // But invited user should be visible
    await expect(page.locator('.adm-user-row', { hasText: 'teste2e+invited' })).toBeVisible({ timeout: 5000 });
  });

  test('4.1.6 — Badge rôle coloré : Admin=info, Contributeur=neutral', async ({ page }) => {
    await goToUsers(page);
    const rows = page.locator('.adm-user-row');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const hasAdmin = await row.locator('.adm-badge--info').count();
      const hasNeutral = await row.locator('.adm-badge--neutral').count();
      expect(hasAdmin + hasNeutral).toBeGreaterThan(0);
    }
  });

  test('4.1.7 — Avatar icône utilisateur visible par ligne', async ({ page }) => {
    await goToUsers(page);
    const rows = page.locator('.adm-user-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const avatar = row.locator('.adm-user-row__avatar, .adm-avatar');
      await expect(avatar).toBeVisible();
    }
  });

  test('4.1.8 — Email affiché par ligne', async ({ page }) => {
    await goToUsers(page);
    const rows = page.locator('.adm-user-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const email = await rows.nth(i).locator('.adm-user-row__email, .adm-user-row__name').textContent();
      expect(email.length).toBeGreaterThan(0);
      expect(email).toContain('@');
    }
  });

});

// ─────────────────────────────────────────────────────────
// 4.2 — Filtres
// ─────────────────────────────────────────────────────────
test.describe('4.2 — Filtres utilisateurs', () => {

  test('4.2.1 — Tab "Tous" actif par défaut', async ({ page }) => {
    await goToUsers(page);
    await expect(page.locator('#users-role-filter .adm-tab[data-role="all"]')).toHaveClass(/active/);
  });

  test('4.2.2–4.2.3 — Tabs Admins et Contributeurs filtrent', async ({ page }) => {
    await goToUsers(page);

    // Count all users first (current admin excluded from list)
    const allCount = await page.locator('.adm-user-row').count();
    expect(allCount).toBeGreaterThanOrEqual(1);

    // Filter admins (may show 0 since current admin is excluded)
    await page.click('#users-role-filter .adm-tab[data-role="admin"]');
    await expect(page.locator('#users-role-filter .adm-tab[data-role="admin"]')).toHaveClass(/active/);
    // Admins may be 0 (only 1 admin = current user, excluded)

    // Filter contributors
    await page.click('#users-role-filter .adm-tab[data-role="invited"]');
    await expect(page.locator('#users-role-filter .adm-tab[data-role="invited"]')).toHaveClass(/active/);
    const invitedRows = page.locator('.adm-user-row');
    const invitedCount = await invitedRows.count();
    expect(invitedCount).toBeGreaterThanOrEqual(1);
    await expect(invitedRows.first().locator('.adm-badge').first()).toContainText('Contributeur');

    // Return to all
    await page.click('#users-role-filter .adm-tab[data-role="all"]');
    await expect(page.locator('.adm-user-row')).toHaveCount(allCount);
  });

  test('4.2.4 — Recherche par email', async ({ page }) => {
    await goToUsers(page);
    const allCount = await page.locator('.adm-user-row').count();

    // Search for the invited test email (admin user = current user, excluded from list)
    await page.fill('#users-search', 'teste2e+invited');
    // 250ms debounce
    await page.waitForTimeout(400);
    const filteredCount = await page.locator('.adm-user-row').count();
    expect(filteredCount).toBeLessThanOrEqual(allCount);
    expect(filteredCount).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.adm-user-row').first().locator('.adm-user-row__email')).toContainText('teste2e+invited');
  });

  test('4.2.5 — Recherche sans résultat → empty state', async ({ page }) => {
    await goToUsers(page);
    await page.fill('#users-search', 'nonexistent-email-xyz-12345');
    await page.waitForTimeout(400);
    await expect(page.locator('.adm-empty')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.adm-empty__title')).toContainText('Aucun utilisateur');
  });

});

// ─────────────────────────────────────────────────────────
// 4.3 — Invitation
// ─────────────────────────────────────────────────────────
test.describe('4.3 — Invitation', () => {

  test('4.3.1 — Clic Inviter ouvre le formulaire', async ({ page }) => {
    await goToUsers(page);
    await page.click('#users-invite-btn');
    await expect(page.locator('#users-invite-card')).toBeVisible();
    await expect(page.locator('#invite-email')).toBeVisible();
  });

  test('4.3.2 — Champ email requis, type email', async ({ page }) => {
    await goToUsers(page);
    await page.click('#users-invite-btn');
    const emailInput = page.locator('#invite-email');
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('4.3.3 — Rôle Contributeur actif par défaut', async ({ page }) => {
    await goToUsers(page);
    await page.click('#users-invite-btn');
    await expect(page.locator('[data-invite-role="invited"]')).toHaveClass(/active/);
    await expect(page.locator('#invite-role-value')).toHaveValue('invited');
  });

  test('4.3.4 — Switcher vers rôle Admin', async ({ page }) => {
    await goToUsers(page);
    await page.click('#users-invite-btn');
    await page.click('[data-invite-role="admin"]');
    await expect(page.locator('[data-invite-role="admin"]')).toHaveClass(/active/);
    await expect(page.locator('#invite-role-value')).toHaveValue('admin');
  });

  test('4.3.6 — Inviter un email déjà membre → toast info', async ({ page }) => {
    await goToUsers(page);
    await page.click('#users-invite-btn');
    await page.fill('#invite-email', 'teste2e+admin@openprojets.com');
    await page.click('#invite-submit');
    // Already member → info toast
    await expect(page.locator('.adm-toast--info').filter({ hasText: 'a déjà accès' })).toBeVisible({ timeout: 10000 });
  });

  test('4.3.8 — Annuler le formulaire', async ({ page }) => {
    await goToUsers(page);
    await page.click('#users-invite-btn');
    await expect(page.locator('#users-invite-card')).toBeVisible();
    await page.fill('#invite-email', 'test@test.com');
    await page.click('[data-invite-role="admin"]');

    // Cancel
    await page.click('#invite-cancel');
    await expect(page.locator('#users-invite-card')).toBeHidden();

    // Re-open and check reset
    await page.click('#users-invite-btn');
    await expect(page.locator('#invite-email')).toHaveValue('');
    await expect(page.locator('[data-invite-role="invited"]')).toHaveClass(/active/);
  });

});

// ─────────────────────────────────────────────────────────
// 4.4 — Changement de rôle
// ─────────────────────────────────────────────────────────
test.describe('4.4 — Changement de rôle', () => {

  test('Cycle : promouvoir invited → annuler, puis promouvoir → confirmer → rétrograder', async ({ page }) => {
    await goToUsers(page);
    const successToast = (text) => page.locator('.adm-toast--success').filter({ hasText: text });
    const clearToasts = () => page.evaluate(() => document.querySelectorAll('.adm-toast').forEach(t => t.remove()));

    // Find the invited test account row
    const invitedRow = page.locator('.adm-user-row', { hasText: 'teste2e+invited' });
    await expect(invitedRow).toBeVisible({ timeout: 5000 });

    // Verify it says "Promouvoir"
    const toggleBtn = invitedRow.locator('[data-action="toggle-role"]');
    await expect(toggleBtn).toContainText('Promouvoir');

    // 4.4.5 — Cancel promotion dialog
    await toggleBtn.click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#adm-dialog-body')).toContainText('Promouvoir en Admin');
    await expect(page.locator('#adm-dialog-body')).toContainText('teste2e+invited');
    await page.click('#adm-dialog-cancel');
    // Row unchanged
    await expect(toggleBtn).toContainText('Promouvoir');

    // 4.4.1–4.4.2 — Confirm promotion
    await toggleBtn.click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await page.click('#adm-dialog-confirm');
    await expect(successToast('Rôle mis à jour : admin')).toBeVisible({ timeout: 10000 });
    await clearToasts();

    // Wait for list reload — the row should now show "Rétrograder"
    await page.waitForFunction(() => {
      const el = document.querySelector('#users-list-body');
      return el && !el.querySelector('.adm-skeleton');
    }, { timeout: 10000 });
    const promotedRow = page.locator('.adm-user-row', { hasText: 'teste2e+invited' });
    await expect(promotedRow).toBeVisible({ timeout: 5000 });
    const demoteBtn = promotedRow.locator('[data-action="toggle-role"]');
    await expect(demoteBtn).toContainText('Rétrograder');

    // 4.4.3–4.4.4 — Demote back to invited
    await demoteBtn.click();
    await expect(page.locator('#adm-dialog[open]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#adm-dialog-body')).toContainText('Rétrograder en Contributeur');
    await page.click('#adm-dialog-confirm');
    await expect(successToast('Rôle mis à jour : invited')).toBeVisible({ timeout: 10000 });

    // Wait for list reload — back to "Promouvoir"
    await clearToasts();
    await page.waitForFunction(() => {
      const el = document.querySelector('#users-list-body');
      return el && !el.querySelector('.adm-skeleton');
    }, { timeout: 10000 });
    const restoredRow = page.locator('.adm-user-row', { hasText: 'teste2e+invited' });
    await expect(restoredRow.locator('[data-action="toggle-role"]')).toContainText('Promouvoir');
  });

});
