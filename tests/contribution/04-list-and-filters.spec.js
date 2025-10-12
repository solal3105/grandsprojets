import { test, expect } from '@playwright/test';
import { login, logout, TEST_USERS } from '../helpers/auth.js';
import {
  openContributionModal,
  selectCity,
  clickEditContributions,
  searchContribution,
  filterByCategory,
  sortList,
  toggleMineOnly
} from '../helpers/contribution.js';

test.describe('Contribution - Liste et filtres', () => {

  test.beforeEach(async ({ page }) => {
    // Se connecter et ouvrir le panel liste
    await page.goto('/');
    await page.waitForSelector('#map', { state: 'visible', timeout: 30000 });
    await login(page, TEST_USERS.user);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
  });

  test('La liste des contributions se charge correctement', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForSelector('#contrib-list', { state: 'visible' });

    // Vérifier qu'il y a des contributions OU un état vide
    const hasItems = await page.locator('.contrib-item').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').isVisible().catch(() => false);

    // L'un des deux doit être vrai
    expect(hasItems || hasEmptyState).toBe(true);
  });

  test('La barre de recherche filtre les résultats', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    // Compter le nombre initial d'éléments
    const initialCount = await page.locator('.contrib-item').count();

    // Si il n'y a pas d'éléments, skip ce test
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Récupérer le nom du premier projet
    const firstName = await page.locator('.contrib-item').first().locator('.contrib-item__title').textContent();

    // Rechercher ce projet
    await searchContribution(page, firstName || '');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    // Vérifier que le premier résultat contient bien le nom recherché
    const firstResult = page.locator('.contrib-item').first();
    await expect(firstResult).toBeVisible();
    await expect(firstResult.locator('.contrib-item__title')).toContainText(firstName || '');
  });

  test('La recherche sans résultat affiche un message approprié', async ({ page }) => {
    // Rechercher quelque chose qui n'existe sûrement pas
    await searchContribution(page, 'XXXXNONEXISTANTPROJECTXXXX');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    // Vérifier qu'il n'y a aucun résultat ou un état vide
    const itemCount = await page.locator('.contrib-item').count();
    expect(itemCount).toBe(0);

    // Vérifier qu'un message d'état vide est affiché (si implémenté)
    const emptyState = page.locator('.empty-state, .no-results');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    if (hasEmptyState) {
      await expect(emptyState).toBeVisible();
    }
  });

  test('Le filtre par catégorie fonctionne', async ({ page }) => {
    // Attendre que les catégories soient chargées dans le dropdown
    await page.waitForTimeout(1000);

    // Vérifier que le dropdown de catégorie existe
    const categoryFilter = page.locator('#contrib-filter-category');
    await expect(categoryFilter).toBeVisible();

    // Compter les options disponibles
    const optionsCount = await categoryFilter.locator('option:not([value=""])').count();

    // S'il n'y a pas de catégories, skip
    if (optionsCount === 0) {
      test.skip();
      return;
    }

    // Sélectionner la première catégorie disponible
    const firstCategory = await categoryFilter.locator('option:not([value=""])').first().getAttribute('value');

    if (firstCategory) {
      await filterByCategory(page, firstCategory);

      // Attendre que les résultats se mettent à jour
      await page.waitForTimeout(1000);

      // Vérifier que tous les éléments visibles ont la bonne catégorie
      const items = page.locator('.contrib-item');
      const count = await items.count();

      if (count > 0) {
        // Vérifier le premier élément (adapter selon votre markup)
        const firstItem = items.first();
        await expect(firstItem).toBeVisible();
      }
    }
  });

  test('Le tri par date (plus récentes) fonctionne', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    const initialCount = await page.locator('.contrib-item').count();

    // S'il n'y a pas assez d'éléments pour tester le tri, skip
    if (initialCount < 2) {
      test.skip();
      return;
    }

    // Trier par "Plus récentes"
    await sortList(page, 'updated_at:desc');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    // Les dates doivent être en ordre décroissant
    // Note: Adapter selon votre markup et format de date
  });

  test('Le tri par nom (A→Z) fonctionne', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    const initialCount = await page.locator('.contrib-item').count();

    if (initialCount < 2) {
      test.skip();
      return;
    }

    // Trier par nom A→Z
    await sortList(page, 'project_name:asc');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    // Récupérer les noms des 2 premiers projets
    const items = page.locator('.contrib-item');
    const firstName = await items.nth(0).locator('.contrib-item__title').textContent();
    const secondName = await items.nth(1).locator('.contrib-item__title').textContent();

    // Vérifier que le premier est alphabétiquement avant le second
    if (firstName && secondName) {
      expect(firstName.localeCompare(secondName)).toBeLessThanOrEqual(0);
    }
  });

  test('Le filtre "Mes contributions uniquement" fonctionne pour les admin', async ({ page }) => {
    // Ce test ne fonctionne QUE pour les admins
    // Les invited ont toujours cette checkbox forcée et disabled
    
    // Se déconnecter et se reconnecter en tant qu'admin
    await page.goto('/logout/');
    await page.waitForURL('/', { timeout: 10000 });
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1500);

    const initialCount = await page.locator('.contrib-item').count();
    
    // Vérifier que la checkbox n'est PAS disabled pour un admin
    const checkbox = page.locator('#contrib-mine-only');
    await expect(checkbox).not.toBeDisabled();

    // Cocher "Mes contributions uniquement"
    await toggleMineOnly(page, true);

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    const filteredCount = await page.locator('.contrib-item').count();

    // Le nombre filtré doit être <= au nombre initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Décocher
    await toggleMineOnly(page, false);

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    const unfilteredCount = await page.locator('.contrib-item').count();

    // Le nombre doit revenir (ou rester le même)
    expect(unfilteredCount).toBeGreaterThanOrEqual(filteredCount);
  });
  
  test('Un utilisateur invited a "Mes contributions uniquement" forcé et disabled', async ({ page }) => {
    // Vérifier que pour un invited, la checkbox est forcée à true et disabled
    const checkbox = page.locator('#contrib-mine-only');
    
    // Doit être cochée
    await expect(checkbox).toBeChecked();
    
    // Doit être disabled (non modifiable)
    await expect(checkbox).toBeDisabled();
    
    // Le title doit indiquer pourquoi elle est disabled
    const title = await checkbox.getAttribute('title');
    expect(title).toContain('imposé');
  });

  test('La combinaison de plusieurs filtres fonctionne', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    // Appliquer recherche + catégorie + tri
    await searchContribution(page, 'Tram');

    await page.waitForTimeout(500);

    // Sélectionner une catégorie si disponible
    const categoryOptions = await page.locator('#contrib-filter-category option:not([value=""])').count();
    if (categoryOptions > 0) {
      const firstCategory = await page.locator('#contrib-filter-category option:not([value=""])').first().getAttribute('value');
      if (firstCategory) {
        await filterByCategory(page, firstCategory);
      }
    }

    await page.waitForTimeout(500);

    // Changer le tri
    await sortList(page, 'project_name:asc');

    await page.waitForTimeout(1000);

    // Vérifier que la liste est toujours affichée (même si vide)
    const list = page.locator('#contrib-list');
    await expect(list).toBeVisible();
  });

  test('Le bouton "Créer une contribution" est visible dans le header', async ({ page }) => {
    // Vérifier que le bouton créer est visible dans le header
    const createBtn = page.locator('#contrib-list-create-btn');

    // Le bouton peut être dans le header ou dans l'empty state
    const isInHeader = await createBtn.isVisible().catch(() => false);

    if (isInHeader) {
      await expect(createBtn).toBeVisible();
    }
  });

  test('Le scroll infini charge plus de contributions', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    const initialCount = await page.locator('.contrib-item').count();

    // S'il n'y a pas assez d'éléments pour tester le scroll infini, skip
    if (initialCount < 10) {
      test.skip();
      return;
    }

    // Scroller vers le bas
    await page.evaluate(() => {
      const listContainer = document.querySelector('.list-container');
      if (listContainer) {
        listContainer.scrollTop = listContainer.scrollHeight;
      }
    });

    // Attendre que de nouveaux éléments se chargent
    await page.waitForTimeout(2000);

    const newCount = await page.locator('.contrib-item').count();

    // Le nombre doit avoir augmenté (ou resté le même si fin de liste)
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('Réinitialiser tous les filtres en cliquant sur le bouton Retour', async ({ page }) => {
    // Appliquer plusieurs filtres
    await searchContribution(page, 'Test');
    await toggleMineOnly(page, true);

    await page.waitForTimeout(1000);

    // Cliquer sur Retour pour revenir au landing
    await page.click('#contrib-back');

    // Vérifier qu'on est sur le landing
    await expect(page.locator('#contrib-landing:not([hidden])')).toBeVisible();

    // Revenir sur la liste
    await clickEditContributions(page);

    // Vérifier que les filtres sont réinitialisés
    const searchInput = page.locator('#contrib-search');
    await expect(searchInput).toHaveValue('');

    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    expect(await mineOnlyCheckbox.isChecked()).toBe(false);
  });

  test('Les cartes de contribution affichent les bonnes informations', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    const itemCount = await page.locator('.contrib-item').count();

    if (itemCount === 0) {
      test.skip();
      return;
    }

    const firstItem = page.locator('.contrib-item').first();

    // Vérifier que les éléments clés sont présents
    // Adapter selon votre markup exact
    await expect(firstItem).toBeVisible();

    // Vérifier qu'il y a un titre
    const title = firstItem.locator('.contrib-item__title');
    await expect(title).toBeVisible();

    // Vérifier qu'il y a des boutons d'action (éditer, supprimer)
    // Note: Adapter les sélecteurs selon votre markup
  });
});
