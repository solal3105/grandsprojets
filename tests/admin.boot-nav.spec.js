// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Navigates to admin and waits for the boot sequence to complete.
 * The boot is done when the splash screen is removed from the DOM.
 */
async function waitForBoot(page, path = '/admin/') {
  await page.goto(path);
  await page.waitForSelector('#adm-splash', { state: 'detached', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────
// 0.2 — Login et initialisation (admin)
// ─────────────────────────────────────────────────────────
test.describe('0.2 — Login et initialisation (admin)', () => {

  test('0.2.1 — Splash disparaît, sidebar affichée, contributions chargées', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-sidebar')).toBeVisible();
    await expect(page.locator('.adm-page-title')).toContainText('Contributions');
  });

  test('0.2.3 — Email affiché dans #adm-user-email', async ({ page }) => {
    await waitForBoot(page);
    const email = await page.textContent('#adm-user-email');
    expect(email?.toLowerCase()).toBe(process.env.TEST_ADMIN_EMAIL?.toLowerCase());
  });

  test('0.2.4 — Badge rôle = "Admin"', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-user-role')).toHaveText('Admin');
  });

});

// ─────────────────────────────────────────────────────────
// 1.1 — Visibilité des liens sidebar (admin)
// ─────────────────────────────────────────────────────────
test.describe('1.1 — Visibilité des liens sidebar (admin)', () => {

  test('1.1.1–1.1.5 — Liens admin visibles', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="contributions"]')).toBeVisible();
    await expect(page.locator('.adm-nav-item[data-section="travaux"]')).toBeVisible();
    await expect(page.locator('.adm-nav-item[data-section="categories"]')).toBeVisible();
    await expect(page.locator('.adm-nav-item[data-section="utilisateurs"]')).toBeVisible();
    await expect(page.locator('.adm-nav-item[data-section="structure"]')).toBeVisible();
  });

  test('1.1.6 — Lien Villes masqué (admin non-global)', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('.adm-nav-item[data-section="villes"]')).toBeHidden();
  });

});

// ─────────────────────────────────────────────────────────
// 1.2 — Navigation entre sections (admin)
// ─────────────────────────────────────────────────────────
test.describe('1.2 — Navigation entre sections (admin)', () => {

  test('1.2.1 — Clic Contributions → URL, active, titre', async ({ page }) => {
    await waitForBoot(page);
    await page.click('.adm-nav-item[data-section="contributions"]');
    await expect(page).toHaveURL(/\/admin\/contributions\//);
    await expect(page.locator('.adm-nav-item[data-section="contributions"]')).toHaveClass(/active/);
    await expect(page.locator('.adm-page-title')).toContainText('Contributions');
  });

  test('1.2.2 — Clic Travaux', async ({ page }) => {
    await waitForBoot(page);
    await page.click('.adm-nav-item[data-section="travaux"]');
    await expect(page).toHaveURL(/\/admin\/travaux\//);
    await expect(page.locator('.adm-nav-item[data-section="travaux"]')).toHaveClass(/active/);
    await expect(page.locator('.adm-page-title')).toContainText('Travaux');
  });

  test('1.2.3 — Clic Catégories', async ({ page }) => {
    await waitForBoot(page);
    await page.click('.adm-nav-item[data-section="categories"]');
    await expect(page).toHaveURL(/\/admin\/categories\//);
    await expect(page.locator('.adm-nav-item[data-section="categories"]')).toHaveClass(/active/);
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
  });

  test('1.2.4 — Clic Utilisateurs', async ({ page }) => {
    await waitForBoot(page);
    await page.click('.adm-nav-item[data-section="utilisateurs"]');
    await expect(page).toHaveURL(/\/admin\/utilisateurs\//);
    await expect(page.locator('.adm-nav-item[data-section="utilisateurs"]')).toHaveClass(/active/);
    await expect(page.locator('.adm-page-title')).toContainText('Utilisateurs');
  });

  test('1.2.5 — Clic Structure', async ({ page }) => {
    await waitForBoot(page);
    await page.click('.adm-nav-item[data-section="structure"]');
    await expect(page).toHaveURL(/\/admin\/structure\//);
    await expect(page.locator('.adm-nav-item[data-section="structure"]')).toHaveClass(/active/);
    // Structure utilise .cw-header__title au lieu de .adm-page-title
    await expect(page.locator('#adm-content')).toContainText('Ma structure');
  });

  test('1.2.6 — Back/forward du navigateur', async ({ page }) => {
    await waitForBoot(page);
    // Naviguer vers catégories
    await page.click('.adm-nav-item[data-section="categories"]');
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
    // Naviguer vers travaux
    await page.click('.adm-nav-item[data-section="travaux"]');
    await expect(page.locator('.adm-page-title')).toContainText('Travaux');
    // Retour → catégories
    await page.goBack();
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
    await expect(page.locator('.adm-nav-item[data-section="categories"]')).toHaveClass(/active/);
    // Avancer → travaux
    await page.goForward();
    await expect(page.locator('.adm-page-title')).toContainText('Travaux');
    await expect(page.locator('.adm-nav-item[data-section="travaux"]')).toHaveClass(/active/);
  });

  test('1.2.7 — URL directe /admin/categories/ au boot', async ({ page }) => {
    await waitForBoot(page, '/admin/categories/');
    await expect(page.locator('.adm-nav-item[data-section="categories"]')).toHaveClass(/active/);
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
  });

});

// ─────────────────────────────────────────────────────────
// 1.4 — Sélecteur de ville
// ─────────────────────────────────────────────────────────
test.describe('1.4 — Sélecteur de ville', () => {

  test('1.4.1 — Le select contient la ville test-e2e sélectionnée', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-city-select')).toHaveValue('test-e2e');
  });

  test('1.4.2 — Carte "Voir la carte" pointe vers /?city=test-e2e', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-map-card')).toHaveAttribute('href', '/?city=test-e2e');
  });

  test('1.4.3 — Nom de la ville dans #adm-map-card-city', async ({ page }) => {
    await waitForBoot(page);
    // Le brand_name vient de city_branding ("Test E2E") ou fallback sur le code
    const text = await page.textContent('#adm-map-card-city');
    expect(text?.trim()).toBeTruthy();
  });

});

// ─────────────────────────────────────────────────────────
// 1.5 — Mobile
// ─────────────────────────────────────────────────────────
test.describe('1.5 — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('1.5.1 — Sidebar masquée (pas de class open)', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-sidebar')).not.toHaveClass(/\bopen\b/);
  });

  test('1.5.2 — Burger ouvre la sidebar + overlay', async ({ page }) => {
    await waitForBoot(page);
    await page.click('#adm-menu-toggle');
    await expect(page.locator('#adm-sidebar')).toHaveClass(/open/);
    await expect(page.locator('#adm-overlay')).toBeVisible();
  });

  test('1.5.3 — Clic nav en mobile → sidebar se ferme, section change', async ({ page }) => {
    await waitForBoot(page);
    await page.click('#adm-menu-toggle');
    await expect(page.locator('#adm-sidebar')).toHaveClass(/open/);
    await page.click('.adm-nav-item[data-section="categories"]');
    await expect(page.locator('#adm-sidebar')).not.toHaveClass(/\bopen\b/);
    await expect(page.locator('.adm-page-title')).toContainText('Catégories');
  });

  test('1.5.4 — Clic overlay ferme la sidebar', async ({ page }) => {
    await waitForBoot(page);
    await page.click('#adm-menu-toggle');
    await expect(page.locator('#adm-sidebar')).toHaveClass(/open/);
    await expect(page.locator('#adm-overlay')).toBeVisible();
    await page.click('#adm-overlay');
    await expect(page.locator('#adm-sidebar')).not.toHaveClass(/\bopen\b/);
    await expect(page.locator('#adm-overlay')).toBeHidden();
  });

});

// ─────────────────────────────────────────────────────────
// 1.6 — Branding et personnalisation
// ─────────────────────────────────────────────────────────
test.describe('1.6 — Branding et personnalisation', () => {

  test('1.6.1 — Logo sidebar chargé (src non vide)', async ({ page }) => {
    await waitForBoot(page);
    const logo = page.locator('#adm-sidebar-logo');
    await expect(logo).toBeVisible();
    const src = await logo.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src.length).toBeGreaterThan(1);
  });

  test('1.6.2 — Couleur primaire appliquée (--adm-primary-rgb)', async ({ page }) => {
    await waitForBoot(page);
    // Wait for branding to load asynchronously (polls for the CSS variable)
    await page.waitForFunction(
      () => getComputedStyle(document.documentElement).getPropertyValue('--adm-primary-rgb').trim() !== '',
      { timeout: 10000 }
    );
    const rgb = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--adm-primary-rgb').trim()
    );
    // Should be a comma-separated RGB string like "20, 174, 92"
    if (rgb) {
      expect(rgb).toMatch(/^\d+,\s*\d+,\s*\d+$/);
    }
  });

  test('1.6.3 — User email affiché dans la sidebar', async ({ page }) => {
    await waitForBoot(page);
    const email = page.locator('#adm-user-email');
    await expect(email).toBeVisible();
    await expect(email).toContainText('teste2e+admin');
  });

  test('1.6.4 — Rôle affiché dans la sidebar', async ({ page }) => {
    await waitForBoot(page);
    const role = page.locator('#adm-user-role');
    await expect(role).toBeVisible();
    await expect(role).toContainText('Admin');
  });

  test('1.6.5 — Bouton déconnexion visible', async ({ page }) => {
    await waitForBoot(page);
    await expect(page.locator('#adm-logout')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 1.7 — Changement de ville
// ─────────────────────────────────────────────────────────
test.describe('1.7 — Changement de ville', () => {

  test('1.7.1 — Sélecteur de ville contient au moins 1 option', async ({ page }) => {
    await waitForBoot(page);
    const select = page.locator('#adm-city-select');
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(1);
  });

  test('1.7.2 — Changer de ville recharge la section courante', async ({ page }) => {
    await waitForBoot(page);
    const select = page.locator('#adm-city-select');
    const options = select.locator('option');
    const count = await options.count();
    if (count < 2) {
      test.skip();
      return;
    }
    // Get initial city
    const initialCity = await select.inputValue();
    // Select a different city
    const secondVal = await options.nth(initialCity === await options.nth(0).getAttribute('value') ? 1 : 0).getAttribute('value');
    await select.selectOption(secondVal);
    // Wait for section to re-render (splash doesn't re-appear, content just reloads)
    await page.waitForTimeout(1500);
    // Verify city changed in the selector
    expect(await select.inputValue()).toBe(secondVal);
    // Restore original city
    await select.selectOption(initialCity);
    await page.waitForTimeout(1000);
    expect(await select.inputValue()).toBe(initialCity);
  });
});

// ─────────────────────────────────────────────────────────
// 0.3 — Déconnexion
// ⚠ Déplacé dans admin.z-logout.spec.js pour éviter de révoquer le token
//   avant les autres fichiers de tests admin.
