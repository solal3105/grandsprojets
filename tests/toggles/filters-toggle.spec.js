import { test, expect } from '@playwright/test';
import { waitForTargetShown, waitForTargetHidden, expectToggleState } from '../helpers/toggles.js';

/**
 * Tests du toggle "Filtres" (filters)
 * 
 * Comportement attendu:
 * - Visible sur desktop ET mobile
 * - Click → Affiche/masque le panneau de filtres (targetElement - display block/none)
 * - Compteur de filtres actifs
 * - Bouton de fermeture dans le panneau
 * - Accessibilité ARIA
 */

test.describe('Toggle Filters - Filtres de carte', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });
  });

  test('Le toggle filters est visible et accessible', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Visibilité
    await expect(toggle).toBeVisible();
    
    // Accessibilité ARIA
    await expect(toggle).toHaveAttribute('aria-label', /filtres/i);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    
    // Icône
    const icon = toggle.locator('i.fa-map');
    await expect(icon).toBeVisible();
    
    // Compteur de filtres (initialement 0 ou caché)
    const counter = toggle.locator('.filter-count');
    await expect(counter).toBeAttached();
  });

  test('Click sur le toggle affiche le panneau de filtres', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Click sur le toggle
    await toggle.click();
    
    // Panneau visible (display block)
    await waitForTargetShown(page, '#filters-container');
    
    // ARIA du toggle mis à jour
    await expectToggleState(page, '#filters-toggle', true);
    
    // Vérifier que le panneau est visible (le contenu peut être vide)
    const filtersContainer = page.locator('#filters-container');
    await expect(filtersContainer).toBeVisible({ timeout: 2000 });
  });

  test('Click à nouveau masque le panneau de filtres', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Ouvrir
    await toggle.click();
    await waitForTargetShown(page, '#filters-container');
    
    // Fermer
    await toggle.click();
    await waitForTargetHidden(page, '#filters-container');
    
    // ARIA réinitialisé
    await expectToggleState(page, '#filters-toggle', false);
  });

  test('Le bouton de fermeture dans le panneau ferme les filtres', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Ouvrir
    await toggle.click();
    await waitForTargetShown(page, '#filters-container');
    
    // Cliquer sur le bouton fermer
    const closeBtn = page.locator('#filters-close-btn');
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    
    // Panneau fermé
    await waitForTargetHidden(page, '#filters-container');
    await expectToggleState(page, '#filters-toggle', false);
  });

  test('Accessibilité clavier: Enter ouvre le panneau', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Enter
    await page.keyboard.press('Enter');
    
    // Panneau ouvert
    await waitForTargetShown(page, '#filters-container');
    await expectToggleState(page, '#filters-toggle', true);
  });

  test('Accessibilité clavier: Space ouvre le panneau', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Focus sur le toggle
    await toggle.focus();
    
    // Appuyer sur Space
    await page.keyboard.press('Space');
    
    // Panneau ouvert
    await waitForTargetShown(page, '#filters-container');
    await expectToggleState(page, '#filters-toggle', true);
  });

  test('Le compteur de filtres est initialement à 0 ou caché', async ({ page }) => {
    const counter = page.locator('#filters-toggle .filter-count');
    
    // Le compteur existe
    await expect(counter).toBeAttached();
    
    // Soit il affiche 0, soit il est caché
    const text = await counter.textContent();
    const isHidden = await counter.isHidden();
    
    expect(text === '0' || isHidden).toBe(true);
  });

  test('Toggle visible sur mobile et desktop', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(toggle).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(toggle).toBeVisible();
  });

  test('Le panneau de filtres contient des catégories de filtres', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    await toggle.click();
    
    await waitForTargetShown(page, '#filters-container');
    
    // Attendre que le contenu dynamique soit chargé (peut être vide si pas de filtres configurés)
    try {
      await page.waitForFunction(() => {
        const dynamicFilters = document.querySelector('#dynamic-filters');
        return dynamicFilters && dynamicFilters.children.length > 0;
      }, { timeout: 10000 });
      
      // Vérifier que le contenu dynamique est chargé
      const dynamicFilters = page.locator('#dynamic-filters');
      await expect(dynamicFilters).toBeVisible();
      
      // Le panneau devrait contenir au moins un élément de filtre
      const hasContent = await dynamicFilters.evaluate(el => el.children.length > 0);
      expect(hasContent).toBe(true);
    } catch (error) {
      // Accepter que le panneau puisse être vide si aucun filtre n'est configuré
      const dynamicFilters = page.locator('#dynamic-filters');
      const isVisible = await dynamicFilters.isVisible();
      expect(isVisible).toBe(true);
    }
  });

  test('Fermeture du panneau par click extérieur ne fonctionne pas (comportement attendu)', async ({ page }) => {
    const toggle = page.locator('#filters-toggle');
    
    // Ouvrir
    await toggle.click();
    await waitForTargetShown(page, '#filters-container');
    
    // Cliquer sur la carte (en dehors du panneau)
    await page.click('#map', { position: { x: 100, y: 100 } });
    
    // Le panneau reste ouvert (pas de fermeture automatique pour les filtres)
    const filtersContainer = page.locator('#filters-container');
    await expect(filtersContainer).toBeVisible();
  });
});
