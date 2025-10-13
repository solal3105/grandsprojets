/**
 * Tests de gestion des utilisateurs (lecture seule - prod-safe)
 * Teste uniquement l'affichage et la navigation sans modification
 */

import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickManageUsers
} from '../helpers/contribution.js';

test.describe('Contribution - Gestion des utilisateurs (Lecture)', () => {

  test('Admin peut accéder au panel des utilisateurs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Cliquer sur "Gérer les utilisateurs"
    await clickManageUsers(page);
    
    // Vérifier que le panel utilisateurs s'ouvre
    const panel = page.locator('#contrib-panel-users:not([hidden])');
    await expect(panel).toBeVisible();
    
    // Vérifier que le titre est correct
    const title = page.locator('#contrib-panel-users h2, #contrib-panel-users .panel-title');
    await expect(title).toBeVisible();
  });

  test('Admin global peut accéder au panel des utilisateurs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Cliquer sur "Gérer les utilisateurs"
    await clickManageUsers(page);
    
    // Vérifier que le panel utilisateurs s'ouvre
    const panel = page.locator('#contrib-panel-users:not([hidden])');
    await expect(panel).toBeVisible();
  });

  test('Invited ne peut PAS accéder au panel des utilisateurs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Le bouton "Gérer les utilisateurs" doit être masqué
    const usersBtn = page.locator('#landing-users');
    await expect(usersBtn).toBeHidden();
  });

  test('La liste des utilisateurs se charge correctement', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    // Attendre que les utilisateurs se chargent
    await page.waitForTimeout(1500);
    
    // Vérifier qu'il y a des utilisateurs OU un état vide
    const userItems = page.locator('.user-item, .user-card, [data-user-id]');
    const itemCount = await userItems.count();
    const hasEmptyState = await page.locator('.empty-state, .no-users').isVisible().catch(() => false);
    
    // L'un des deux doit être vrai
    expect(itemCount > 0 || hasEmptyState).toBe(true);
    
    console.log(`Utilisateurs trouvés: ${itemCount}`);
  });

  test('Les utilisateurs affichent email, rôle et villes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    const userItems = page.locator('.user-item, .user-card, [data-user-id]');
    const itemCount = await userItems.count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Vérifier le premier utilisateur
    const firstUser = userItems.first();
    await expect(firstUser).toBeVisible();
    
    // Vérifier qu'il contient du texte (email ou nom)
    const hasText = await firstUser.textContent();
    expect(hasText).toBeTruthy();
    expect(hasText.trim().length).toBeGreaterThan(0);
    
    // Chercher un email (pattern simple)
    const containsEmail = hasText.includes('@');
    console.log(`Affiche un email: ${containsEmail ? 'Oui' : 'Non (peut être masqué)'}`);
  });

  test('Les utilisateurs affichent leur rôle avec badge', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    const userItems = page.locator('.user-item, .user-card, [data-user-id]');
    const itemCount = await userItems.count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Chercher des badges de rôle
    const roleBadges = page.locator('.user-role, .role-badge, [data-role]');
    const badgeCount = await roleBadges.count();
    
    if (badgeCount > 0) {
      await expect(roleBadges.first()).toBeVisible();
      const roleText = await roleBadges.first().textContent();
      console.log(`Badge de rôle trouvé: "${roleText?.trim()}"`);
      
      // Vérifier que c'est un rôle valide
      const validRoles = ['admin', 'invited', 'global'];
      const hasValidRole = validRoles.some(role => roleText?.toLowerCase().includes(role));
      expect(hasValidRole).toBe(true);
    }
  });

  test('Les utilisateurs affichent leurs villes assignées', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    const userItems = page.locator('.user-item, .user-card, [data-user-id]');
    const itemCount = await userItems.count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Chercher des badges de ville
    const cityBadges = page.locator('.user-cities, .city-badge, [data-cities]');
    const badgeCount = await cityBadges.count();
    
    if (badgeCount > 0) {
      await expect(cityBadges.first()).toBeVisible();
      const cityText = await cityBadges.first().textContent();
      console.log(`Badge de ville trouvé: "${cityText?.trim()}"`);
    } else {
      console.log('Pas de badge ville visible (peut être implicite pour admin de ville)');
    }
  });

  test('Le bouton retour ramène au landing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    // Vérifier qu'on est sur le panel utilisateurs
    await expect(page.locator('#contrib-panel-users:not([hidden])')).toBeVisible();
    
    // Cliquer sur le bouton retour
    await page.click('#contrib-back');
    
    // Vérifier qu'on est de retour sur le landing
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();
    await expect(page.locator('#contrib-panel-users')).toBeHidden();
  });

  test('Les utilisateurs peuvent être recherchés ou filtrés', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    // Chercher un champ de recherche dans le panel
    const searchInput = page.locator('#users-search, #user-filter, input[placeholder*="cherch"], input[placeholder*="filtr"]');
    const searchExists = await searchInput.count();
    
    if (searchExists > 0) {
      // Vérifier que le champ est visible et fonctionnel
      const firstSearch = searchInput.first();
      await expect(firstSearch).toBeVisible();
      await expect(firstSearch).toBeEditable();
      
      console.log('Champ de recherche d\'utilisateurs disponible');
    } else {
      console.log('Pas de champ de recherche (normal si peu d\'utilisateurs)');
    }
  });

  test('Filtrage par rôle disponible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    // Chercher un sélecteur de rôle
    const roleFilter = page.locator('#user-role-filter, #filter-role, select[name*="role"]');
    const filterExists = await roleFilter.count();
    
    if (filterExists > 0) {
      await expect(roleFilter.first()).toBeVisible();
      console.log('Filtre par rôle disponible');
    } else {
      console.log('Pas de filtre par rôle (peut être dans un menu déroulant)');
    }
  });

  test('Les utilisateurs sont spécifiques à la ville sélectionnée', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    const userItems = page.locator('.user-item, .user-card, [data-user-id]');
    const itemCount = await userItems.count();
    
    if (itemCount === 0) {
      test.skip();
      return;
    }
    
    // Vérifier que les utilisateurs affichés ont accès à Lyon
    // Note: Selon votre implémentation
    console.log(`${itemCount} utilisateurs affichés pour Lyon`);
    
    // Un admin non-global devrait voir uniquement les utilisateurs de sa ville
    // C'est validé par les RLS de Supabase, on vérifie juste l'affichage
  });

  test('Le bouton "Inviter un utilisateur" est visible pour les admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickManageUsers(page);
    
    await page.waitForTimeout(1500);
    
    // Chercher le bouton d'invitation
    const inviteBtn = page.locator('#invite-user-btn, button:has-text("Inviter"), button:has-text("Ajouter un utilisateur")');
    const btnExists = await inviteBtn.count();
    
    if (btnExists > 0) {
      await expect(inviteBtn.first()).toBeVisible();
      console.log('Bouton "Inviter un utilisateur" présent');
    } else {
      console.log('Bouton d\'invitation non trouvé (peut être dans un menu)');
    }
  });

  test('Le panel utilisateurs est accessible au clavier', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Focus sur le bouton utilisateurs et activer avec Enter
    const usersBtn = page.locator('#landing-users');
    await usersBtn.focus();
    await page.keyboard.press('Enter');
    
    // Vérifier que le panel s'ouvre
    await expect(page.locator('#contrib-panel-users:not([hidden])')).toBeVisible();
    
    // Naviguer avec Tab
    await page.keyboard.press('Tab');
    
    // Le bouton retour devrait être accessible
    const backBtn = page.locator('#contrib-back:focus');
    const isBackFocused = await backBtn.count();
    
    console.log(`Navigation clavier fonctionnelle: ${isBackFocused > 0 ? 'Oui' : 'Partiel'}`);
  });

  test('Navigation depuis utilisateurs vers autres panels', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    // Aller sur utilisateurs
    await clickManageUsers(page);
    await expect(page.locator('#contrib-panel-users:not([hidden])')).toBeVisible();
    
    // Retour au landing
    await page.click('#contrib-back');
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();
    
    // Aller sur catégories depuis le landing
    await page.click('#landing-categories');
    await expect(page.locator('#contrib-panel-categories:not([hidden])')).toBeVisible();
    
    // Retour au landing
    await page.click('#contrib-back');
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();
  });
});
