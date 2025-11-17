import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    
    // Désactiver la synchronisation OS pour les tests
    await page.evaluate(() => {
      if (window.ThemeManager) {
        window.ThemeManager.stopOSThemeSync();
      }
    });
    
    // Forcer le thème light initial
    await page.evaluate(() => {
      if (window.ThemeManager) {
        window.ThemeManager.applyTheme('light');
        localStorage.removeItem('theme');
      }
    });
    
    await page.waitForTimeout(300);
  });

  test('Le toggle est visible avec icône fa-moon', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-moon');
    await expect(icon).toBeVisible();
  });

  test('Click active: data-theme="dark" sur html, icône fa-sun', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    await toggle.click();
    await page.waitForTimeout(300);
    
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    
    const sunIcon = toggle.locator('i.fa-sun');
    await expect(sunIcon).toBeVisible();
  });

  test('Classe dark ajoutée sur html en mode sombre', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    await toggle.click();
    await page.waitForTimeout(300);
    
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(hasDarkClass).toBe(true);
  });

  test('Click désactive: data-theme="light", icône fa-moon, classe dark retirée', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Activer
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Désactiver
    await toggle.click();
    await page.waitForTimeout(300);
    
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');
    
    const moonIcon = toggle.locator('i.fa-moon');
    await expect(moonIcon).toBeVisible();
    
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(hasDarkClass).toBe(false);
  });

  test('Persistance: localStorage.getItem("theme") === "dark" puis "light"', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Activer
    await toggle.click();
    await page.waitForTimeout(300);
    
    let stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('dark');
    
    // Désactiver
    await toggle.click();
    await page.waitForTimeout(300);
    
    stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('light');
  });

  test('Restauration au reload: thème persiste', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Activer le thème dark
    await toggle.click();
    await page.waitForTimeout(300);
    
    // Vérifier que localStorage est set à dark
    let stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('dark');
    
    // Recharger la page
    await page.reload();
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    
    // Désactiver la sync OS après reload
    await page.evaluate(() => {
      if (window.ThemeManager) {
        window.ThemeManager.stopOSThemeSync();
      }
    });
    
    await page.waitForTimeout(500);
    
    // Vérifier que le thème est toujours dark
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    
    const sunIcon = toggle.locator('i.fa-sun');
    await expect(sunIcon).toBeVisible();
  });

  test('Clavier Enter: active le mode sombre', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  test('Clavier Space: active le mode sombre', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  test('Responsive mobile et desktop: visible', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });
});
