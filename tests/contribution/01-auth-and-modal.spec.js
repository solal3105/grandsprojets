import { test, expect } from '@playwright/test';
import { login, logout, isLoggedIn, TEST_USERS } from '../helpers/auth.js';
import { openContributionModal, closeContributionModal } from '../helpers/contribution.js';

test.describe('Contribution - Authentification et ouverture modale', () => {
  
  test.beforeEach(async ({ page }) => {
    // Aller sur la page d'accueil
    await page.goto('/');
    
    // Attendre que la carte soit chargée
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
  });

  test('Le bouton "Contribuer" est caché pour les utilisateurs non connectés', async ({ page }) => {
    // Vérifier que le bouton contribuer n'est pas visible
    const contribBtn = page.locator('#contribute-toggle');
    await expect(contribBtn).toBeHidden();
  });

  test('Un utilisateur peut se connecter et voir le bouton "Contribuer"', async ({ page }) => {
    // Se connecter avec un utilisateur de test
    await login(page, TEST_USERS.invited);
    
    // Vérifier que l'utilisateur est connecté
    expect(await isLoggedIn(page)).toBe(true);
    
    // Attendre que le bouton contribuer soit visible
    const contribBtn = page.locator('#contribute-toggle');
    await expect(contribBtn).toBeVisible({ timeout: 10000 });
  });

  test('La modale de contribution s\'ouvre correctement', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Attendre que le bouton soit visible
    const contributeButton = page.locator('#contribute-toggle');
    await expect(contributeButton).toBeVisible({ timeout: 15000 });
    
    // Attendre un peu pour s'assurer que tout est stable
    await page.waitForTimeout(1000);
    
    // Ouvrir la modale de contribution
    await openContributionModal(page);
    
    // Vérifier que la modale est visible (ID spécifique)
    const modal = page.locator('#contrib-overlay');
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    
    // Vérifier que le titre est visible (ID spécifique pour éviter les doublons)
    const title = page.locator('#contrib-title');
    await expect(title).toBeVisible({ timeout: 5000 });
    await expect(title).toHaveText('Proposer une contribution');
    
    // Fermer la modale pour le nettoyage
    await closeContributionModal(page);
  });

  test('La modale se ferme correctement avec le bouton X', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale
    await openContributionModal(page);
    
    // Vérifier que la modale est ouverte
    const modal = page.locator('#contrib-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    
    // Fermer la modale
    await closeContributionModal(page);
    
    // Vérifier que la modale est bien fermée
    await expect(modal).toBeHidden({ timeout: 10000 });
    
    // Vérifier que l'attribut aria-hidden est bien à "true"
    await expect(modal).toHaveAttribute('aria-hidden', 'true', { timeout: 5000 });
  });

  test('La modale se ferme en cliquant sur l\'overlay (ESC)', async ({ page }) => {
    // Se connecter et ouvrir la modale
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    
    // Appuyer sur ESC
    await page.keyboard.press('Escape');
    
    // Vérifier que la modale est fermée (attendre que aria-hidden="true")
    await page.waitForFunction(() => {
      const modal = document.querySelector('#contrib-overlay');
      return modal && modal.getAttribute('aria-hidden') === 'true';
    }, { timeout: 5000 });
    
    // Vérifier que la modale n'est plus visible visuellement
    await expect(page.locator('#contrib-overlay')).not.toBeVisible();
  });

  test('La carte utilisateur affiche les bonnes informations', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale
    await openContributionModal(page);
    
    // Vérifier que la carte utilisateur est visible
    const userCard = page.locator('#user-info-card');
    await expect(userCard).toBeVisible();
    
    // Vérifier que l'email est affiché
    const email = page.locator('#user-info-email');
    await expect(email).toHaveText(TEST_USERS.invited.email);
    
    // Vérifier que le badge de rôle est affiché
    const roleBadge = page.locator('#user-role-badge');
    await expect(roleBadge).toBeVisible();
    
    // Vérifier que le badge des villes est affiché
    const citiesBadge = page.locator('#user-cities-badge');
    await expect(citiesBadge).toBeVisible();
  });

  test('Le bouton de déconnexion fonctionne', async ({ page }) => {
    // Se connecter
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale
    await openContributionModal(page);
    
    // Cliquer sur le bouton de déconnexion
    await page.click('#user-logout-btn');
    
    // Attendre la redirection vers /logout
    await page.waitForURL('/logout/', { timeout: 10000 });
    
    // Attendre que la redirection vers / se fasse
    await page.waitForURL('/', { timeout: 10000 });
    
    // Vérifier que l'utilisateur est déconnecté
    expect(await isLoggedIn(page)).toBe(false);
  });

  test('Un utilisateur admin global voit toutes les options du landing', async ({ page }) => {
    // Se connecter en tant qu'admin global (ville=['global'])
    await login(page, TEST_USERS.adminGlobal);
    
    // Ouvrir la modale
    await openContributionModal(page);
    
    // Sélectionner une ville
    await page.selectOption('#landing-city-select', 'lyon');
    
    // Attendre que les cartes apparaissent
    await page.waitForSelector('#landing-cards', { state: 'visible' });
    
    // Vérifier que toutes les cartes sont visibles pour un admin global
    await expect(page.locator('#landing-edit')).toBeVisible(); // Modifier mes contributions
    await expect(page.locator('#landing-categories')).toBeVisible(); // Gérer les catégories
    await expect(page.locator('#landing-users')).toBeVisible(); // Gérer les utilisateurs
    await expect(page.locator('#landing-edit-city')).toBeVisible(); // Gérer ma structure
    
    // Note: #landing-branding est masqué par défaut (hidden dans le HTML)
    // Il est activé uniquement pour les admin via JavaScript après chargement
  });

  test('Un utilisateur invité voit uniquement les options appropriées', async ({ page }) => {
    // Se connecter en tant qu'invité
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale
    await openContributionModal(page);
    
    // Sélectionner une ville
    await page.selectOption('#landing-city-select', 'lyon');
    
    // Attendre que les cartes apparaissent
    await page.waitForSelector('#landing-cards', { state: 'visible' });
    
    // Vérifier que la carte "Modifier mes contributions" est visible
    await expect(page.locator('#landing-edit')).toBeVisible();
    
    // Vérifier que les cartes admin sont MASQUÉES (display:none)
    await expect(page.locator('#landing-categories')).toBeHidden(); // Gérer les catégories
    await expect(page.locator('#landing-users')).toBeHidden(); // Gérer les utilisateurs
    await expect(page.locator('#landing-edit-city')).toBeHidden(); // Gérer ma structure
    await expect(page.locator('#landing-branding')).toBeHidden(); // Gérer le branding
  });
});
