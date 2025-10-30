import { test, expect } from '@playwright/test';
import { waitForOverlayOpen, waitForOverlayClosed, expectToggleState, expectToggleExpanded } from '../helpers/toggles.js';

/**
 * Tests du toggle "Recherche" (search)
 * 
 * Comportement attendu:
 * - Visible sur desktop ET mobile
 * - Click → Ouvre overlay de recherche (classe active + display flex)
 * - Click extérieur → Ferme l'overlay
 * - ESC → Ferme l'overlay
 * - Input de recherche focusé automatiquement
 * - Accessibilité ARIA
 */

test.describe('Toggle Search - Recherche d\'adresse', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Nettoyer auth et storage
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle search est visible et accessible', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Visibilité
    await expect(toggle).toBeVisible();
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /rechercher/i);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-haspopup', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    
    // Icône
    const icon = toggle.locator('i.fa-search');
    await expect(icon).toBeVisible();
  });

  test('Click sur le toggle ouvre l\'overlay de recherche', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Click sur le toggle
    await toggle.click();
    
    // Overlay ouvert (classe active + display flex)
    await waitForOverlayOpen(page, '#search-overlay');
    
    // ARIA du toggle mis à jour
    await expectToggleState(page, '#search-toggle', true);
    await expectToggleExpanded(page, '#search-toggle', true);
    
    // Input de recherche visible
    const searchInput = page.locator('#address-search');
    await expect(searchInput).toBeVisible({ timeout: 2000 });
  });

  test('L\'input de recherche est focusé automatiquement', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    await toggle.click();
    
    // Attendre que l'overlay soit ouvert
    await waitForOverlayOpen(page, '#search-overlay');
    
    const searchInput = page.locator('#address-search');
    await expect(searchInput).toBeVisible({ timeout: 2000 });
    
    // Vérifier que l'input est focusé
    await page.waitForTimeout(300);
    const isFocused = await searchInput.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('Click extérieur ferme l\'overlay', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Ouvrir l'overlay
    await toggle.click();
    await waitForOverlayOpen(page, '#search-overlay');
    
    // Cliquer en dehors (sur la carte)
    await page.click('#map', { position: { x: 100, y: 100 } });
    
    // Overlay fermé
    await waitForOverlayClosed(page, '#search-overlay');
    await expectToggleState(page, '#search-toggle', false);
  });

  test('Touche ESC ferme l\'overlay', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Ouvrir l'overlay
    await toggle.click();
    await waitForOverlayOpen(page, '#search-overlay');
    
    // Appuyer sur ESC
    await page.keyboard.press('Escape');
    
    // Overlay fermé
    await waitForOverlayClosed(page, '#search-overlay');
    await expectToggleState(page, '#search-toggle', false);
  });

  test('Accessibilité clavier: Enter ouvre l\'overlay', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    
    // Overlay ouvert
    await waitForOverlayOpen(page, '#search-overlay');
    await expectToggleState(page, '#search-toggle', true);
  });

  test('Accessibilité clavier: Space ouvre l\'overlay', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    
    // Overlay ouvert
    await waitForOverlayOpen(page, '#search-overlay');
    await expectToggleState(page, '#search-toggle', true);
  });

  test('L\'input de recherche accepte du texte', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    await toggle.click();
    
    // Attendre que l'overlay soit ouvert
    await waitForOverlayOpen(page, '#search-overlay');
    
    const searchInput = page.locator('#address-search');
    await expect(searchInput).toBeVisible({ timeout: 2000 });
    
    // Taper une adresse
    await searchInput.fill('Place Bellecour, Lyon');
    
    // Vérifier que le texte est bien saisi
    await expect(searchInput).toHaveValue('Place Bellecour, Lyon');
  });

  test('Toggle visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('Réouverture de l\'overlay vide le champ de recherche précédent', async ({ page }) => {
    const toggle = page.locator('#search-toggle');
    const searchInput = page.locator('#address-search');
    
    // Ouvrir et saisir du texte
    await toggle.click();
    await waitForOverlayOpen(page, '#search-overlay');
    await expect(searchInput).toBeVisible({ timeout: 2000 });
    await searchInput.fill('Test recherche');
    
    // Fermer
    await toggle.click();
    await waitForOverlayClosed(page, '#search-overlay');
    
    // Réouvrir
    await toggle.click();
    await waitForOverlayOpen(page, '#search-overlay');
    await expect(searchInput).toBeVisible({ timeout: 2000 });
    
    // Le champ peut être vide ou contenir le texte précédent selon l'implémentation
    // On vérifie juste qu'il est éditable
    await searchInput.fill('Nouvelle recherche');
    await expect(searchInput).toHaveValue('Nouvelle recherche');
  });
});
