import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';

/**
 * Tests du toggle "Connexion" (login)
 * 
 * Comportement attendu:
 * - Visible pour les utilisateurs non connectés
 * - Caché pour les utilisateurs connectés
 * - Click → Redirige vers /login
 * - Accessibilité ARIA
 */

test.describe('Toggle Login - Connexion', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle login est visible pour les utilisateurs non connectés', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Le toggle devrait être visible
    await expect(toggle).toBeVisible();
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /connexion|connecter/i);
    
    // Icône
    const icon = toggle.locator('i.fa-user');
    await expect(icon).toBeVisible();
  });

  test('Le toggle login est caché après connexion', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#login-toggle');
    
    // Le toggle devrait être caché
    await expect(toggle).toBeHidden({ timeout: 10000 });
  });

  test('Click sur le toggle redirige vers /login', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    await expect(toggle).toBeVisible();
    
    // Click sur le toggle
    await toggle.click();
    
    // Attendre la redirection
    await page.waitForURL('**/login/**', { timeout: 10000 });
    
    // Vérifier qu'on est sur la page de login
    expect(page.url()).toContain('/login');
  });

  test('La page de login contient un formulaire de connexion', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    await toggle.click();
    
    await page.waitForURL('**/login/**', { timeout: 10000 });
    
    // Vérifier la présence d'un champ email
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
  });

  test('Accessibilité clavier: Enter redirige vers /login', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    
    // Attendre la redirection
    await page.waitForURL('**/login/**', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('Accessibilité clavier: Space redirige vers /login', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    
    // Attendre la redirection
    await page.waitForURL('**/login/**', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('Toggle visible sur mobile et desktop (si non connecté)', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('Le toggle réapparaît après déconnexion', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    const toggle = page.locator('#login-toggle');
    await expect(toggle).toBeHidden({ timeout: 10000 });
    
    // Se déconnecter
    await page.goto('/logout/');
    await page.waitForTimeout(1000);
    
    // Retourner à l'accueil
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    
    // Le toggle devrait être visible
    await expect(toggle).toBeVisible({ timeout: 10000 });
  });

  test('Le toggle login et contribute sont mutuellement exclusifs', async ({ page }) => {
    const loginToggle = page.locator('#login-toggle');
    const contributeToggle = page.locator('#contribute-toggle');
    
    // État initial: login visible, contribute caché
    await expect(loginToggle).toBeVisible();
    await expect(contributeToggle).toBeHidden();
    
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // État après connexion: login caché, contribute visible
    await expect(loginToggle).toBeHidden({ timeout: 10000 });
    await expect(contributeToggle).toBeVisible({ timeout: 10000 });
  });

  test('Retour depuis /login vers / fonctionne', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    await toggle.click();
    
    await page.waitForURL('**/login/**', { timeout: 10000 });
    
    // Retour arrière
    await page.goBack();
    
    // On devrait être de retour sur l'accueil
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
    
    // Le toggle devrait toujours être visible
    await expect(toggle).toBeVisible();
  });

  test('Click multiple ne crée pas de comportement inattendu', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Cliquer plusieurs fois rapidement
    await toggle.click();
    await page.waitForTimeout(100);
    await toggle.click();
    await page.waitForTimeout(100);
    
    // On devrait être redirigé vers /login une seule fois
    await page.waitForURL('**/login/**', { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('Le toggle a les attributs ARIA corrects', async ({ page }) => {
    const toggle = page.locator('#login-toggle');
    
    // Vérifier les attributs ARIA
    await expect(toggle).toHaveAttribute('aria-label');
    
    // Le toggle devrait avoir un rôle button
    const role = await toggle.getAttribute('role');
    const tagName = await toggle.evaluate(el => el.tagName.toLowerCase());
    
    expect(tagName === 'button' || role === 'button').toBe(true);
  });
});
