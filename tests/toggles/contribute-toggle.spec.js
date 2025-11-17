import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';

test.describe('Contribute Toggle', () => {
  
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('CACHÉ si non connecté', async ({ page }) => {
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeHidden({ timeout: 10000 });
  });

  test('VISIBLE si connecté', async ({ page }) => {
    const toggle = page.locator('#contribute-toggle');
    
    // Vérifier caché avant
    await expect(toggle).toBeHidden({ timeout: 5000 });
    
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Visible après connexion
    await expect(toggle).toBeVisible({ timeout: 15000 });
    
    const icon = toggle.locator('i.fa-plus');
    await expect(icon).toBeVisible();
  });

  test('Apparition immédiate sans refresh', async ({ page }) => {
    const toggle = page.locator('#contribute-toggle');
    
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Toggle visible sans refresh
    await expect(toggle).toBeVisible({ timeout: 15000 });
    
    // URL reste sur localhost:3001
    expect(page.url()).toContain('localhost:3001');
    expect(page.url()).not.toContain('/login');
  });

  test('Click déclenche action', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    
    // Click
    await toggle.click();
    await page.waitForTimeout(1000);
    
    // Vérifier qu'une action s'est produite (modale ou navigation)
    const hasModal = await page.locator('.gp-modal-overlay[style*="display"][style*="flex"], .gp-modal-overlay[style*="block"]').count();
    const urlChanged = !page.url().endsWith('/') && !page.url().endsWith('/index.html');
    
    expect(hasModal > 0 || urlChanged).toBe(true);
  });

  test('Responsive: visible après connexion', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('Clavier Enter: fonctionne', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Vérifier action
    const hasModal = await page.locator('.gp-modal-overlay[style*="display"][style*="flex"], .gp-modal-overlay[style*="block"]').count();
    const urlChanged = !page.url().endsWith('/') && !page.url().endsWith('/index.html');
    
    expect(hasModal > 0 || urlChanged).toBe(true);
  });

  test('Reste visible après action', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#contribute-toggle');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    
    // Click
    await toggle.click();
    await page.waitForTimeout(1000);
    
    // Si modale ouverte, la fermer
    const closeBtn = page.locator('.gp-modal-close').first();
    const isVisible = await closeBtn.isVisible().catch(() => false);
    if (isVisible) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Toggle reste visible
    await expect(toggle).toBeVisible();
  });
});
