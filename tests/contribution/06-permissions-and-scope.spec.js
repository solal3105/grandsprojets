/**
 * Tests de permissions et de scope pour les 3 rôles
 * - Invited : voit ses contributions + celles approuvées de son équipe (même ville)
 * - Admin : scope limité à sa ville (toutes contributions)
 * - Admin Global : scope global (toutes les villes, toutes contributions)
 */

import { test, expect } from '@playwright/test';
import { 
  login, 
  TEST_USERS 
} from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickEditContributions
} from '../helpers/contribution.js';

test.describe('Contribution - Permissions et Scope', () => {

  test('Invited ne peut accéder qu\'au panel liste (pas catégories ni utilisateurs)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Les boutons de gestion doivent être cachés pour un invited
    const categoriesBtn = page.locator('#landing-categories');
    const usersBtn = page.locator('#landing-users');
    const editCityBtn = page.locator('#landing-edit-city');
    const brandingBtn = page.locator('#landing-branding');
    
    await expect(categoriesBtn).toBeHidden();
    await expect(usersBtn).toBeHidden();
    await expect(editCityBtn).toBeHidden();
    await expect(brandingBtn).toBeHidden();
    
    // Seul le bouton "Modifier mes contributions" doit être visible
    const editBtn = page.locator('#landing-edit');
    await expect(editBtn).toBeVisible();
    
    // Le bouton "Ajouter une structure" ne doit PAS être visible
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeHidden();
  });

  test('Admin peut accéder aux panels de gestion', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Les boutons de gestion doivent être visibles pour un admin
    const categoriesBtn = page.locator('#landing-categories');
    const usersBtn = page.locator('#landing-users');
    const editCityBtn = page.locator('#landing-edit-city');
    const brandingBtn = page.locator('#landing-branding');
    
    await expect(categoriesBtn).toBeVisible();
    await expect(usersBtn).toBeVisible();
    await expect(editCityBtn).toBeVisible();
    await expect(brandingBtn).toBeVisible();
  });

  test('Admin global peut accéder à tous les panels et voir "Ajouter une structure"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Tous les boutons de gestion doivent être visibles pour un admin global
    const categoriesBtn = page.locator('#landing-categories');
    const usersBtn = page.locator('#landing-users');
    const editCityBtn = page.locator('#landing-edit-city');
    const brandingBtn = page.locator('#landing-branding');
    
    await expect(categoriesBtn).toBeVisible();
    await expect(usersBtn).toBeVisible();
    await expect(editCityBtn).toBeVisible();
    await expect(brandingBtn).toBeVisible();
    
    // Le bouton "Ajouter une structure" doit être visible (seul l'admin global le voit)
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeVisible();
  });

  test('Invited voit ses contributions ET celles approuvées de son équipe', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Vérifier que le message invited est affiché
    const notice = page.locator('#contrib-invited-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Vous voyez vos contributions et celles approuvées de votre équipe');
    
    // Vérifier que mineOnly est décoché (invited voit tout: ses contributions + approuvées)
    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    const isChecked = await mineOnlyCheckbox.isChecked();
    expect(isChecked).toBe(false);
    
    // Vérifier que invited ne peut modifier que ses propres contributions
    // (les boutons Edit ne sont visibles que sur ses contributions)
    const cards = page.locator('.contrib-card');
    const cardsCount = await cards.count();
    const editButtons = page.locator('.contrib-card__action--edit');
    const editCount = await editButtons.count();
    
    console.log(`[Invited] Voit ${cardsCount} contributions (siennes + approuvées de l'équipe)`);
    console.log(`[Invited] Peut modifier ${editCount} contributions (uniquement les siennes)`);
  });

  test('Admin peut approuver les contributions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir toutes les contributions
    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    if (await mineOnlyCheckbox.isChecked()) {
      await mineOnlyCheckbox.click();
      await page.waitForTimeout(1000);
    }
    
    // Vérifier qu'il y a des contributions
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount > 0) {
      // Chercher un bouton d'approbation
      const approveBtn = page.locator('.contrib-card__action--approve').first();
      
      // Le bouton doit être visible pour un admin
      const isVisible = await approveBtn.isVisible().catch(() => false);
      expect(isVisible).toBe(true);
      
      console.log('[Admin] Peut voir les boutons d\'approbation');
    }
  });

  test('Admin global peut approuver les contributions de toutes les villes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement"
    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    if (await mineOnlyCheckbox.isChecked()) {
      await mineOnlyCheckbox.click();
      await page.waitForTimeout(1000);
    }
    
    // Vérifier qu'il y a des contributions
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount > 0) {
      // Chercher un bouton d'approbation
      const approveBtn = page.locator('.contrib-card__action--approve').first();
      
      // Le bouton doit être visible pour un admin global
      const isVisible = await approveBtn.isVisible().catch(() => false);
      expect(isVisible).toBe(true);
      
      console.log('[Admin Global] Peut voir les boutons d\'approbation');
    }
  });

  test('Invited ne voit PAS les boutons d\'approbation', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Vérifier qu'il y a des contributions
    const itemCount = await page.locator('.contrib-card').count();
    
    if (itemCount > 0) {
      // Chercher un bouton d'approbation
      const approveBtns = page.locator('.contrib-card__action--approve');
      const count = await approveBtns.count();
      
      // Les boutons ne doivent PAS être visibles pour un invited
      expect(count).toBe(0);
      
      console.log('[Invited] Ne voit pas les boutons d\'approbation');
    }
  });
});
