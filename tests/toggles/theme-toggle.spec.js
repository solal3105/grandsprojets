import { test, expect } from '@playwright/test';

/**
 * Tests du toggle "Mode sombre" (theme)
 * 
 * Comportement attendu:
 * - Visible sur desktop ET mobile
 * - Click → Bascule entre mode clair et mode sombre
 * - Icône change (fa-moon ↔ fa-sun)
 * - État persisté dans localStorage
 * - Attribut data-theme sur <html>
 * - Accessibilité ARIA
 */

test.describe('Toggle Theme - Mode sombre', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Nettoyer auth et storage avant chaque test
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle theme est visible et accessible', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Visibilité
    await expect(toggle).toBeVisible();
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /mode sombre/i);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    
    // Icône initiale (mode clair = lune)
    const icon = toggle.locator('i.fa-moon');
    await expect(icon).toBeVisible();
  });

  test('Click sur le toggle active le mode sombre', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // État initial: mode clair
    let theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');
    
    // Click pour activer mode sombre
    await toggle.click();
    
    // Attendre changement de thème
    await page.waitForTimeout(300);
    
    // Vérifier attribut data-theme
    theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    
    // ARIA mis à jour
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    
    // Icône change (soleil en mode sombre)
    const sunIcon = toggle.locator('i.fa-sun');
    await expect(sunIcon).toBeVisible();
  });

  test('Click à nouveau désactive le mode sombre', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Activer mode sombre
    await toggle.click();
    await page.waitForTimeout(300);
    
    let theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    
    // Désactiver mode sombre
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Retour au mode clair
    theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');
    
    // ARIA réinitialisé
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    
    // Icône lune
    const moonIcon = toggle.locator('i.fa-moon');
    await expect(moonIcon).toBeVisible();
  });

  test('L\'état du thème est persisté dans localStorage', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Activer mode sombre
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Vérifier localStorage
    const stored = await page.evaluate(() => localStorage.getItem('theme-dark-mode'));
    expect(stored).toBe('true');
    
    // Désactiver mode sombre
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Vérifier localStorage
    const storedAfter = await page.evaluate(() => localStorage.getItem('theme-dark-mode'));
    expect(storedAfter).toBe('false');
  });

  test('Le thème est restauré depuis localStorage au chargement', async ({ page }) => {
    // Activer mode sombre
    const toggle = page.locator('#theme-toggle');
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Recharger la page
    await page.reload();
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    
    // Vérifier que le mode sombre est toujours actif
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    
    // ARIA reflète l'état restauré
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    
    // Icône soleil
    const sunIcon = toggle.locator('i.fa-sun');
    await expect(sunIcon).toBeVisible();
  });

  test('Accessibilité clavier: Enter bascule le thème', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Mode sombre activé
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('Accessibilité clavier: Space bascule le thème', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    
    // Mode sombre activé
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('Toggle visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('Le changement de thème affecte visuellement la page', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Récupérer la couleur de fond initiale
    const bodyBgLight = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    
    // Activer mode sombre
    await toggle.click();
    await page.waitForTimeout(500);
    
    // Récupérer la couleur de fond en mode sombre
    const bodyBgDark = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    
    // Les couleurs doivent être différentes
    expect(bodyBgLight).not.toBe(bodyBgDark);
  });
});
