import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';

test.describe('Login Toggle', () => {
  
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

  test('VISIBLE si NON connecté', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    await expect(toggle).toBeVisible();
    
    const icon = toggle.locator('i.fa-user');
    await expect(icon).toBeVisible();
  });

  test('CACHÉ si connecté', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Attendre propagation auth state
    await page.waitForTimeout(1000);
    
    const toggle = page.locator('#login-toggle');
    await expect(toggle).toBeHidden({ timeout: 10000 });
  });

  test('Click redirige vers /login', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    await expect(toggle).toBeVisible();
    
    // Click et attendre navigation
    const [response] = await Promise.all([
      page.waitForNavigation({ timeout: 15000 }),
      toggle.click()
    ]);
    
    // Vérifier URL finale (peut être /login ou /login/)
    const url = page.url();
    const hasLoginPath = url.includes('/login');
    expect(hasLoginPath).toBe(true);
  });

  test('Page /login contient input[type="email"]', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Click et attendre navigation
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }),
      toggle.click()
    ]);
    
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
  });

  test('Responsive: visible si non connecté', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });
});
