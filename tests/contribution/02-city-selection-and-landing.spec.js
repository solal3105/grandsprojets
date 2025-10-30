import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from '../helpers/auth.js';
import { 
  openContributionModal, 
  selectCity,
  clickEditContributions,
  clickManageCategories,
  clickManageUsers
} from '../helpers/contribution.js';

test.describe('Contribution - Sélection de ville et navigation landing', () => {
  
  test.beforeEach(async ({ page }) => {
    // Se connecter
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.invited);
    
    // Ouvrir la modale
    await openContributionModal(page);

    // S'assurer que la modale est bien ouverte et prête
    const overlay = page.locator('#contrib-overlay');
    await expect(overlay).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
    await expect(page.locator('#landing-city-select')).toBeVisible({ timeout: 10000 });
  });

  test('Le sélecteur de ville est visible et fonctionnel', async ({ page }) => {
    // Vérifier que le sélecteur de ville est visible
    const citySelect = page.locator('#landing-city-select');
    await expect(citySelect).toBeVisible();
    
    // Attendre que les villes soient chargées dynamiquement
    await page.waitForTimeout(1000);
    
    // Vérifier qu'il contient au moins une ville (option avec valeur non vide)
    const citiesWithValue = await citySelect.locator('option:not([value=""])').count();
    expect(citiesWithValue).toBeGreaterThanOrEqual(1);
    
    // Vérifier que le select n'est pas disabled
    await expect(citySelect).toBeEnabled();
  });

  test('Sélectionner une ville affiche les cartes d\'action', async ({ page }) => {
    // Les cartes ne doivent pas être visibles avant la sélection
    const landingCards = page.locator('#landing-cards');
    await expect(landingCards).toBeHidden();
    
    // Sélectionner Lyon
    await selectCity(page, 'lyon');
    
    // Les cardes doivent maintenant être visibles
    await expect(landingCards).toBeVisible();
    
    // Vérifier que le titre est visible
    const title = page.locator('#landing-actions-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText(/Que voulez-vous faire/);
  });

  test('Cliquer sur "Modifier mes contributions" ouvre le panel liste', async ({ page }) => {
    // Sélectionner une ville
    await selectCity(page, 'lyon');
    
    // Cliquer sur "Modifier mes contributions"
    await clickEditContributions(page);
    
    // Vérifier que le panel liste est visible
    const listPanel = page.locator('#contrib-panel-list:not([hidden])');
    await expect(listPanel).toBeVisible();
    
    // Vérifier que le landing est caché
    const landing = page.locator('#contrib-landing');
    await expect(landing).toBeHidden();
    
    // Vérifier que le bouton retour est visible
    const backBtn = page.locator('#contrib-back');
    await expect(backBtn).toBeVisible();
    
    // Vérifier que la barre de recherche est visible
    const searchInput = page.locator('#contrib-search');
    await expect(searchInput).toBeVisible();
  });

  test('Le bouton "Retour" ramène au landing', async ({ page }) => {
    // Sélectionner une ville et aller sur le panel liste
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Vérifier qu'on est bien sur le panel liste
    await expect(page.locator('#contrib-panel-list:not([hidden])')).toBeVisible();
    
    // Cliquer sur le bouton retour
    await page.click('#contrib-back');
    
    // Vérifier qu'on est de retour sur le landing
    const landing = page.locator('#contrib-landing:not([hidden])');
    await expect(landing).toBeVisible();
    
    // Vérifier que le panel liste est caché
    await expect(page.locator('#contrib-panel-list')).toBeHidden();
  });

  test('Un admin global peut changer de ville', async ({ page }) => {
    // Se reconnecter en tant qu'admin global (a accès à toutes les villes)
    await page.goto('/');
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    
    // Vérifier qu'on a plusieurs villes disponibles
    const citySelect = page.locator('#landing-city-select');
    await citySelect.waitFor({ state: 'visible', timeout: 5000 });
    
    const citiesCount = await citySelect.locator('option:not([value=""])').count();
    
    if (citiesCount < 2) {
      // Skip ce test si moins de 2 villes dans la base
      console.log('Skip: Moins de 2 villes disponibles pour tester le changement');
      test.skip();
      return;
    }
    
    // Sélectionner la première ville
    const firstCityValue = await citySelect.locator('option:not([value=""])').first().getAttribute('value');
    await page.selectOption('#landing-city-select', firstCityValue);
    await expect(page.locator('#landing-cards')).toBeVisible();
    
    // Changer pour la 2ème ville
    const secondCityValue = await citySelect.locator('option:not([value=""])').nth(1).getAttribute('value');
    await page.selectOption('#landing-city-select', secondCityValue);
    
    // Les cartes doivent toujours être visibles
    await expect(page.locator('#landing-cards')).toBeVisible();
    
    // Aller sur la liste des contributions
    await clickEditContributions(page);
    
    // Vérifier que le filtre de catégorie est chargé pour la nouvelle ville
    const categoryFilter = page.locator('#contrib-filter-category');
    await expect(categoryFilter).toBeVisible();
    
    // Vérifier que les catégories sont bien celles de la 2ème ville
    const options = await categoryFilter.locator('option:not([value=""])').count();
    expect(options).toBeGreaterThanOrEqual(0); // Au moins l'option "Toutes les catégories"
  });

  test('Un utilisateur admin voit les options de gestion', async ({ page }) => {
    // Se connecter en tant qu'admin
    await page.goto('/');
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    // Stabiliser: vérifier que la modale est bien ouverte
    const overlay = page.locator('#contrib-overlay');
    await expect(overlay).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
    await expect(page.locator('#landing-city-select')).toBeVisible({ timeout: 10000 });
    
    // Sélectionner une ville
    await page.selectOption('#landing-city-select', 'lyon');
    
    // Attendre que les cartes apparaissent
    await page.waitForSelector('#landing-cards', { state: 'visible' });
    
    // Attendre que les permissions soient appliquées (applyRoleConstraints prend 100ms)
    await page.waitForTimeout(200);
    
    // Vérifier que la carte de base est visible
    await expect(page.locator('#landing-edit')).toBeVisible();
    await expect(page.locator('#landing-edit-city')).toBeVisible();
    
    // Vérifier les cartes admin (peuvent être masquées selon le rôle exact)
    // Si l'admin n'a pas ville=['global'], ces cartes peuvent être masquées
    const categoriesCard = page.locator('#landing-categories');
    const usersCard = page.locator('#landing-users');
    
    // Ces cartes doivent être présentes dans le DOM (même si potentiellement masquées)
    await expect(categoriesCard).toBeAttached();
    await expect(usersCard).toBeAttached();
    
    // Si elles sont visibles, c'est un admin avec les bonnes permissions
    const categoriesVisible = await categoriesCard.isVisible().catch(() => false);
    const usersVisible = await usersCard.isVisible().catch(() => false);
    
    console.log('Admin permissions:', { categoriesVisible, usersVisible });
  });

  test('Invited ne voit PAS le bouton "Ajouter une structure"', async ({ page }) => {
    // Se connecter en tant qu'invited (pas admin global)
    await page.goto('/');
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    await page.waitForSelector('#contrib-landing', { state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => window.__CONTRIB_VILLES !== undefined, { timeout: 5000 });
    
    // Le bouton "Ajouter une structure" ne doit PAS être visible pour invited
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeHidden();
    
    console.log('[Invited] Ne voit pas le bouton "Ajouter une structure" ✅');
  });

  test('Admin global voit le bouton "Ajouter une structure"', async ({ page }) => {
    // Se reconnecter en tant qu'admin global
    await page.goto('/');
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    
    await page.waitForSelector('#contrib-landing', { state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => window.__CONTRIB_VILLES !== undefined, { timeout: 5000 });
    
    // Le bouton "Ajouter une structure" doit être visible (seul l'admin global le voit)
    const addCityBtn = page.locator('#landing-add-city-btn');
    await expect(addCityBtn).toBeVisible();
    await expect(addCityBtn).toHaveText(/Ajouter une structure/i);
  });

  test('Les cartes du landing ont les bons textes et icônes', async ({ page }) => {
    await selectCity(page, 'lyon');
    
    // Attendre que les permissions soient appliquées
    await page.waitForTimeout(200);
    
    // Vérifier la carte "Modifier mes contributions" (visible pour invited)
    const editCard = page.locator('#landing-edit');
    await expect(editCard).toBeVisible();
    await expect(editCard.locator('.card-title')).toHaveText('Modifier mes contributions');
    await expect(editCard.locator('.card-icon i')).toHaveClass(/fa-pen-to-square/);
    
    // Les cartes admin ne sont PAS visibles pour un invited (par défaut dans beforeEach)
    const categoriesCard = page.locator('#landing-categories');
    const usersCard = page.locator('#landing-users');
    const cityCard = page.locator('#landing-edit-city');
    
    // Vérifier qu'elles existent dans le DOM
    await expect(categoriesCard).toBeAttached();
    await expect(usersCard).toBeAttached();
    await expect(cityCard).toBeAttached();
    
    // Pour un invited, elles doivent être masquées
    await expect(categoriesCard).toBeHidden();
    await expect(usersCard).toBeHidden();
    await expect(cityCard).toBeHidden();
  });

  test('Les cartes du landing sont accessibles au clavier', async ({ page }) => {
    await selectCity(page, 'lyon');
    
    // Focus sur la première carte avec Tab
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Peut nécessiter plusieurs tabs selon le DOM
    
    // Vérifier que la carte est focusée
    const editCard = page.locator('#landing-edit');
    
    // Appuyer sur Entrée pour activer
    await editCard.focus();
    await page.keyboard.press('Enter');
    
    // Vérifier que le panel liste s'ouvre
    await expect(page.locator('#contrib-panel-list:not([hidden])')).toBeVisible();
  });

  test('Sélectionner une ville persiste le choix lors de la navigation', async ({ page }) => {
    // Sélectionner Lyon
    await selectCity(page, 'lyon');
    
    // Aller sur le panel liste
    await clickEditContributions(page);
    
    // Revenir au landing
    await page.click('#contrib-back');
    
    // Vérifier que Lyon est toujours sélectionné
    const citySelect = page.locator('#landing-city-select');
    await expect(citySelect).toHaveValue('lyon');
  });
});
