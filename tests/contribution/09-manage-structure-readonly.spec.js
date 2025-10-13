/**
 * Tests de gestion de structure/ville
 * 
 * NOTE: Il n'existe PAS de panel dédié de gestion de structure implémenté.
 * Ces tests vérifient uniquement la VISIBILITÉ des boutons selon les rôles.
 * 
 * Fonctionnalités testées :
 * - Bouton "Gérer ma structure" (admin/admin global)
 * - Bouton "Ajouter une structure" (admin global uniquement)
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity
} from '../helpers/contribution.js';

test.describe('Contribution - Boutons de Gestion de Structure', () => {

  test('Admin voit le bouton "Gérer ma structure"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Gérer ma structure" doit être visible pour admin
    const editCityBtn = page.locator('#landing-edit-city');
    await expect(editCityBtn).toBeVisible();
    await expect(editCityBtn).toBeEnabled();
    
    // Vérifier le texte du bouton
    const cardTitle = editCityBtn.locator('.card-title');
    const titleText = await cardTitle.textContent();
    expect(titleText).toContain('Gérer ma structure');
    
    console.log('[Admin] Bouton "Gérer ma structure" visible et activé ✅');
  });

  test('Admin global voit le bouton "Gérer ma structure"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Gérer ma structure" doit être visible pour admin global
    const editCityBtn = page.locator('#landing-edit-city');
    await expect(editCityBtn).toBeVisible();
    await expect(editCityBtn).toBeEnabled();
    
    // Vérifier le texte du bouton
    const cardTitle = editCityBtn.locator('.card-title');
    const titleText = await cardTitle.textContent();
    expect(titleText).toContain('Gérer ma structure');
    
    console.log('[Admin Global] Bouton "Gérer ma structure" visible et activé ✅');
  });

  test('Invited ne voit PAS le bouton "Gérer ma structure"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Gérer ma structure" doit être masqué pour invited
    const editCityBtn = page.locator('#landing-edit-city');
    await expect(editCityBtn).toBeHidden();
    
    console.log('[Invited] Ne voit PAS le bouton "Gérer ma structure" ✅');
  });


  test('Admin global voit le bouton "Ajouter une structure" (exclusif)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Ajouter une structure" doit être visible UNIQUEMENT pour admin global
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeVisible();
    await expect(addCityBtn).toBeEnabled();
    
    // Vérifier le texte du bouton
    const buttonText = await addCityBtn.textContent();
    expect(buttonText).toMatch(/Ajouter.*structure/i);
    
    console.log('[Admin Global] Bouton "Ajouter une structure" visible (exclusif) ✅');
  });

  test('Admin classique ne voit PAS le bouton "Ajouter une structure"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Ajouter une structure" ne doit PAS être visible pour admin classique
    // (réservé à admin global uniquement)
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeHidden();
    
    console.log('[Admin classique] Ne voit PAS "Ajouter une structure" (réservé à admin global) ✅');
  });

  test('Invited ne voit PAS le bouton "Ajouter une structure"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Ajouter une structure" ne doit PAS être visible pour invited
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeHidden();
    
    console.log('[Invited] Ne voit PAS "Ajouter une structure" ✅');
  });

});
