// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigates to admin and waits for the boot sequence to complete.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 0.2 — Login et initialisation (invited)
// ─────────────────────────────────────────────────────────
test.describe('0.2 — Login et initialisation (invited)', () => {

  test('0.2.2 — Splash disparaît, contributions chargées', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-page-title')).toContainText('Contributions');
  });

  test('0.2.3 — Email affiché', async ({ page }) => {
    await waitForBoot(page);
    const email = await page.textContent('#adm-user-email');
    expect(email?.toLowerCase()).toBe(process.env.TEST_INVITED_EMAIL?.toLowerCase());
  });

  test('0.2.4 — Badge rôle = "Contributeur"', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-user-role')).toHaveText('Contributeur');
  });

});

// ─────────────────────────────────────────────────────────
// 1.1 — Visibilité des liens sidebar (invited)
// ─────────────────────────────────────────────────────────
test.describe('1.1 — Visibilité des liens sidebar (invited)', () => {

  test('1.1.7 — Contributions visible', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="contributions"]')).toBeVisible();
  });

  test('1.1.8–1.1.12 — Liens admin et global masqués', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="travaux"]')).toBeHidden();
    await expect(page.locator('.adm-nav-item[data-section="categories"]')).toBeHidden();
    await expect(page.locator('.adm-nav-item[data-section="utilisateurs"]')).toBeHidden();
    await expect(page.locator('.adm-nav-item[data-section="structure"]')).toBeHidden();
    await expect(page.locator('.adm-nav-item[data-section="villes"]')).toBeHidden();
  });

});

// ─────────────────────────────────────────────────────────
// 1.3 — Accès direct URL par rôle invited
// Le routeur n'a pas de guard — la section se rend normalement.
// On vérifie que la page s'affiche sans crash.
// ─────────────────────────────────────────────────────────
test.describe('1.3 — Accès direct URL (invited)', () => {

  test('1.3.1 — /admin/categories/ se rend sans crash', async ({ page }) => {
    await waitForBoot(page, '/admin/categories/');
    await expect(page.locator('#adm-content')).toContainText('Catégories');
  });

  test('1.3.2 — /admin/utilisateurs/ se rend sans crash', async ({ page }) => {
    await waitForBoot(page, '/admin/utilisateurs/');
    await expect(page.locator('#adm-content')).toContainText('Utilisateurs');
  });

  test('1.3.3 — /admin/travaux/ se rend sans crash', async ({ page }) => {
    await waitForBoot(page, '/admin/travaux/');
    await expect(page.locator('#adm-content')).toContainText('Travaux');
  });

  test('1.3.4 — /admin/structure/ se rend sans crash', async ({ page }) => {
    await waitForBoot(page, '/admin/structure/');
    await expect(page.locator('#adm-content')).toContainText('Ma structure');
  });

});

// ─────────────────────────────────────────────────────────
// 1.6 — Branding pour invited
// ─────────────────────────────────────────────────────────
test.describe('1.6 — Branding invited', () => {

  test('1.6.1 — Logo sidebar chargé pour invited', async ({ page }) => {
    await waitForBoot(page);
    const logo = page.locator('#adm-sidebar-logo');
    await expect(logo).toBeVisible();
    const src = await logo.getAttribute('src');
    expect(src).toBeTruthy();
  });

  test('1.6.2 — Rôle "Contributeur" affiché dans la sidebar', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-user-role')).toContainText('Contributeur');
  });

  test('1.6.3 — Sélecteur de ville fonctionnel', async ({ page }) => {
    await waitForBoot(page);
    const select = page.locator('#adm-city-select');
    await expect(select).toBeVisible();
    // Wait for options to be populated
    await expect(select.locator('option')).not.toHaveCount(0, { timeout: 5000 });
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(1);
  });
});
