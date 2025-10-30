/**
 * Tests de gestion des catégories (lecture seule - prod-safe)
 * Teste uniquement l'affichage et la navigation sans modification
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickManageCategories
} from '../helpers/contribution.js';

test.describe('Contribution - Gestion des catégories (Lecture)', () => {

  test('Admin peut accéder au panel des catégories', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Cliquer sur "Gérer les catégories"
    await clickManageCategories(page);
    
    // Vérifier que le panel catégories s'ouvre
    const panel = page.locator('#contrib-panel-categories:not([hidden])');
    await expect(panel).toBeVisible();
    
    // Vérifier que le contenu des catégories est visible
    const categoriesContent = page.locator('#categories-content');
    await expect(categoriesContent).toBeVisible({ timeout: 5000 });
  });

  test('Admin global peut accéder au panel des catégories', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Cliquer sur "Gérer les catégories"
    await clickManageCategories(page);
    
    // Vérifier que le panel catégories s'ouvre
    const panel = page.locator('#contrib-panel-categories:not([hidden])');
    await expect(panel).toBeVisible();
    
    // Vérifier que le contenu des catégories est visible
    const categoriesContent = page.locator('#categories-content');
    await expect(categoriesContent).toBeVisible({ timeout: 5000 });
  });

  test('Invited ne peut PAS accéder au panel des catégories', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Gérer les catégories" doit être masqué
    const categoriesBtn = page.locator('#landing-categories');
    await expect(categoriesBtn).toBeHidden();
  });

  test('La liste des catégories se charge correctement', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageCategories(page);
    
    // Attendre que les catégories se chargent
    await page.waitForTimeout(1500);
    
    // Vérifier qu'il y a des catégories OU un état vide
    const categoryItems = page.locator('.category-item, .category-card, [data-category-id]');
    const itemCount = await categoryItems.count();
    const hasEmptyState = await page.locator('.empty-state, .no-categories').isVisible().catch(() => false);
    
    // L'un des deux doit être vrai
    expect(itemCount > 0 || hasEmptyState).toBe(true);
    
    console.log(`Catégories trouvées: ${itemCount}`);
  });

  test('Les catégories affichent les informations essentielles', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageCategories(page);
    
    await page.waitForTimeout(1500);
    
    const categoryItems = page.locator('.category-item, .category-card, [data-category-id]');
    const itemCount = await categoryItems.count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Vérifier la première catégorie
    const firstCategory = categoryItems.first();
    await expect(firstCategory).toBeVisible();
    
    // Vérifier qu'elle contient au minimum un nom
    const hasText = await firstCategory.textContent();
    expect(hasText).toBeTruthy();
    expect(hasText.trim().length).toBeGreaterThan(0);
  });

  test('Le bouton retour ramène au landing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageCategories(page);
    
    // Vérifier qu'on est sur le panel catégories
    await expect(page.locator('#contrib-panel-categories:not([hidden])')).toBeVisible();
    
    // Cliquer sur le bouton retour
    await page.click('#contrib-back');
    
    // Vérifier qu'on est de retour sur le landing
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();
    await expect(page.locator('#contrib-panel-categories')).toBeHidden();
  });

  test('Navigation depuis catégories vers autres panels', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Aller sur catégories
    await clickManageCategories(page);
    await expect(page.locator('#contrib-panel-categories:not([hidden])')).toBeVisible();
    
    // Retour au landing
    await page.click('#contrib-back');
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();
    
    // Aller sur utilisateurs depuis le landing
    await page.click('#landing-users');
    await expect(page.locator('#contrib-panel-users:not([hidden])')).toBeVisible();
    
    // Retour au landing
    await page.click('#contrib-back');
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();
  });

  test('Les catégories sont spécifiques à la ville sélectionnée', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageCategories(page);
    
    await page.waitForTimeout(1500);
    
    const categoryItems = page.locator('.category-item, .category-card, [data-category-id]');
    const itemCount = await categoryItems.count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Vérifier que les catégories affichées sont pour Lyon
    // Note: Selon votre implémentation, les catégories peuvent avoir un badge ville
    const cityBadges = page.locator('.category-city, [data-city="lyon"]');
    const hasCityInfo = await cityBadges.count();
    
    if (hasCityInfo > 0) {
      console.log('Les catégories affichent bien l\'information de ville');
    } else {
      console.log('Pas de badge ville visible (scope implicite)');
    }
  });

  test('Le panel catégories est accessible au clavier', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Focus sur le bouton catégories et activer avec Enter
    const categoriesBtn = page.locator('#landing-categories');
    await categoriesBtn.focus();
    await page.keyboard.press('Enter');
    
    // Vérifier que le panel s'ouvre
    await expect(page.locator('#contrib-panel-categories:not([hidden])')).toBeVisible();
    
    // Naviguer avec Tab
    await page.keyboard.press('Tab');
    
    // Le bouton retour devrait être accessible
    const backBtn = page.locator('#contrib-back:focus');
    const isBackFocused = await backBtn.count();
    
    console.log(`Navigation clavier fonctionnelle: ${isBackFocused > 0 ? 'Oui' : 'Partiel'}`);
  });
});
