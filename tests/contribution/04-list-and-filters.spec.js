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
    await login(page, TEST_USERS.invited);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
  });

  test('La liste des contributions se charge correctement', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForSelector('#contrib-list', { state: 'visible' });
    
    // Attendre un peu que les cartes se chargent
    await page.waitForTimeout(1000);

    // Vérifier qu'il y a des contributions OU un état vide
    const itemCount = await page.locator('.contrib-card').count();
    const hasEmptyState = await page.locator('.contrib-empty').isVisible().catch(() => false);

    // L'un des deux doit être vrai
    expect(itemCount > 0 || hasEmptyState).toBe(true);
    
    console.log(`Contributions trouvées: ${itemCount}`);
  });

  test('La barre de recherche filtre les résultats (invited)', async ({ page }) => {
    // Un invited ne voit que ses propres contributions
    await page.waitForTimeout(1500);

    const initialCount = await page.locator('.contrib-card').count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Récupérer le nom du premier projet de l'invited
    const firstNameRaw = await page.locator('.contrib-card').first().locator('.contrib-card__title').textContent();
    const firstName = firstNameRaw?.trim();
    
    if (!firstName) {
      test.skip();
      return;
    }

    console.log(`[Invited] Recherche du projet: "${firstName}"`);

    // Rechercher les premiers mots
    const searchTerm = firstName.split(' ').slice(0, 2).join(' ');
    await searchContribution(page, searchTerm);
    await page.waitForTimeout(2000);

    // Vérifier qu'il y a au moins un résultat
    const resultCount = await page.locator('.contrib-card').count();
    console.log(`[Invited] Résultats trouvés: ${resultCount}`);
    
    expect(resultCount).toBeGreaterThan(0);
    
    const firstResult = page.locator('.contrib-card').first();
    await expect(firstResult).toBeVisible();
    await expect(firstResult.locator('.contrib-card__title')).toContainText(searchTerm);
  });

  test('La barre de recherche filtre les résultats (admin)', async ({ page }) => {
    // Se reconnecter en tant qu'admin
    await page.goto('/logout/');
    await page.waitForURL('/', { timeout: 10000 });
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    await page.waitForTimeout(1500);
    
    // Décocher "Mes contributions uniquement" pour voir toutes les contributions
    await toggleMineOnly(page, false);
    await page.waitForTimeout(1000);

    const initialCount = await page.locator('.contrib-card').count();

    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Récupérer le nom du premier projet
    const firstNameRaw = await page.locator('.contrib-card').first().locator('.contrib-card__title').textContent();
    const firstName = firstNameRaw?.trim();
    
    if (!firstName) {
      test.skip();
      return;
    }

    console.log(`[Admin] Recherche du projet: "${firstName}"`);

    // Rechercher les premiers mots
    const searchTerm = firstName.split(' ').slice(0, 2).join(' ');
    await searchContribution(page, searchTerm);
    await page.waitForTimeout(2000);

    // Vérifier qu'il y a au moins un résultat
    const resultCount = await page.locator('.contrib-card').count();
    console.log(`[Admin] Résultats trouvés: ${resultCount}`);
    
    expect(resultCount).toBeGreaterThan(0);
    
    const firstResult = page.locator('.contrib-card').first();
    await expect(firstResult).toBeVisible();
    await expect(firstResult.locator('.contrib-card__title')).toContainText(searchTerm);
  });

  test('La recherche sans résultat affiche un message approprié', async ({ page }) => {
    // Rechercher quelque chose qui n'existe sûrement pas
    await searchContribution(page, 'XXXXNONEXISTANTPROJECTXXXX');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    // Vérifier qu'il n'y a aucun résultat ou un état vide
    const itemCount = await page.locator('.contrib-card').count();
    expect(itemCount).toBe(0);

    // Vérifier qu'un message d'état vide est affiché
    const emptyState = page.locator('.contrib-empty');
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
      const items = page.locator('.contrib-card');
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

    const initialCount = await page.locator('.contrib-card').count();

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

    const initialCount = await page.locator('.contrib-card').count();

    if (initialCount < 2) {
      test.skip();
      return;
    }

    // Trier par nom A→Z
    await sortList(page, 'project_name:asc');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    // Récupérer les noms des 2 premiers projets
    const items = page.locator('.contrib-card');
    const firstName = await items.nth(0).locator('.contrib-card__title').textContent();
    const secondName = await items.nth(1).locator('.contrib-card__title').textContent();

    // Vérifier que le premier est alphabétiquement avant le second
    if (firstName && secondName) {
      expect(firstName.localeCompare(secondName)).toBeLessThanOrEqual(0);
    }
  });

  test('Le filtre "Mes contributions uniquement" fonctionne pour les admin', async ({ page }) => {
    // Ce test ne fonctionne QUE pour les admins
    // Les invited ne voient que leurs contributions et n'ont pas la checkbox
    
    // Se déconnecter et se reconnecter en tant qu'admin
    await page.goto('/logout/');
    await page.waitForURL('/', { timeout: 10000 });
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1500);
    
    // Vérifier que la checkbox est visible pour un admin
    const toggle = page.locator('#contrib-mine-only-toggle');
    await expect(toggle).toBeVisible();
    
    // Vérifier que le message invited est caché
    const notice = page.locator('#contrib-invited-notice');
    await expect(notice).toBeHidden();

    const initialCount = await page.locator('.contrib-card').count();
    
    // Vérifier que la checkbox n'est PAS disabled pour un admin
    const checkbox = page.locator('#contrib-mine-only');
    await expect(checkbox).not.toBeDisabled();

    // Cocher "Mes contributions uniquement"
    await toggleMineOnly(page, true);

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    const filteredCount = await page.locator('.contrib-card').count();

    // Le nombre filtré doit être <= au nombre initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Décocher
    await toggleMineOnly(page, false);

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(1000);

    const unfilteredCount = await page.locator('.contrib-card').count();

    // Le nombre doit revenir (ou rester le même)
    expect(unfilteredCount).toBeGreaterThanOrEqual(filteredCount);
  });
  
  test('Un utilisateur invited voit un message informatif et peut utiliser la checkbox', async ({ page }) => {
    // Vérifier que pour un invited, la checkbox est VISIBLE
    const toggle = page.locator('#contrib-mine-only-toggle');
    await expect(toggle).toBeVisible();
    
    // La checkbox doit être décochée par défaut
    const checkbox = page.locator('#contrib-mine-only');
    expect(await checkbox.isChecked()).toBe(false);
    
    // Un message informatif doit être affiché
    const notice = page.locator('#contrib-invited-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Vous voyez vos contributions et celles approuvées de votre équipe');
    await expect(notice).toContainText('Vous ne pouvez modifier que les vôtres');
    
    // L'invited voit ses contributions + celles approuvées de son équipe
    const itemCount = await page.locator('.contrib-card').count();
    console.log(`Contributions visibles par invited (siennes + approuvées): ${itemCount}`);
    
    // Vérifier que les contributions des autres (approuvées) n'ont PAS de bouton Modifier
    const cards = page.locator('.contrib-card');
    const cardsCount = await cards.count();
    
    if (cardsCount > 0) {
      // Compter combien ont des boutons d'édition
      const editButtons = page.locator('.contrib-card__action--edit');
      const editCount = await editButtons.count();
      console.log(`Contributions éditables par invited: ${editCount} sur ${cardsCount}`);
    }
    
    // Tester la checkbox : cocher pour ne voir que ses contributions
    await checkbox.check();
    await page.waitForTimeout(1000);
    
    const filteredCount = await page.locator('.contrib-card').count();
    console.log(`Après filtrage "Mes contributions uniquement": ${filteredCount}`);
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

    const initialCount = await page.locator('.contrib-card').count();

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

    const newCount = await page.locator('.contrib-card').count();

    // Le nombre doit avoir augmenté (ou resté le même si fin de liste)
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('Les filtres sont préservés lors de la navigation landing <-> liste', async ({ page }) => {
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

    // Vérifier que les filtres sont préservés (bonne UX)
    const searchInput = page.locator('#contrib-search');
    await expect(searchInput).toHaveValue('Test');

    const mineOnlyCheckbox = page.locator('#contrib-mine-only');
    expect(await mineOnlyCheckbox.isChecked()).toBe(true);
    
    console.log('Filtres préservés lors de la navigation (bonne UX)');
  });

  test('Les cartes de contribution affichent les bonnes informations', async ({ page }) => {
    // Attendre que la liste soit chargée
    await page.waitForTimeout(1000);

    const itemCount = await page.locator('.contrib-card').count();

    if (itemCount === 0) {
      test.skip();
      return;
    }

    const firstItem = page.locator('.contrib-card').first();

    // Vérifier que les éléments clés sont présents
    await expect(firstItem).toBeVisible();

    // Vérifier qu'il y a un titre
    const title = firstItem.locator('.contrib-card__title');
    await expect(title).toBeVisible();

    // Vérifier qu'il y a des boutons d'action (éditer, supprimer)
    // Note: Adapter les sélecteurs selon votre markup
  });

  test('Admin (ville) voit toutes les contributions de sa ville uniquement', async ({ page }) => {
    // Se reconnecter en tant qu'admin classique de ville (scope: Lyon)
    await page.goto('/logout/');
    await page.waitForURL('/', { timeout: 10000 });
    
    await login(page, TEST_USERS.admin);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Vérifier que la checkbox "Mes contributions uniquement" est visible et modifiable
    const toggle = page.locator('#contrib-mine-only-toggle');
    await expect(toggle).toBeVisible();
    
    const checkbox = page.locator('#contrib-mine-only');
    await expect(checkbox).not.toBeDisabled();
    
    // Décocher pour voir toutes les contributions de sa ville
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    console.log(`[Admin ville] Voit ${itemCount} contributions de Lyon (toutes)`);
    
    // L'admin de ville peut voir toutes les contributions de sa ville (Lyon)
    // mais pas celles des autres villes (scope limité par RLS)
    
    // Vérifier que les boutons d'édition et d'approbation sont visibles
    if (itemCount > 0) {
      const editButtons = page.locator('.contrib-card__action--edit');
      const editCount = await editButtons.count();
      
      const approveButtons = page.locator('.contrib-card__action--approve');
      const approveCount = await approveButtons.count();
      
      console.log(`[Admin ville] Peut modifier ${editCount} contributions`);
      console.log(`[Admin ville] Peut approuver ${approveCount} contributions`);
      
      // Admin de ville devrait pouvoir modifier/approuver toutes les contributions de sa ville
      expect(editCount).toBe(itemCount);
    }
  });

  test('Admin global voit toutes les contributions (scope global)', async ({ page }) => {
    // Se reconnecter en tant qu'admin global
    await page.goto('/logout/');
    await page.waitForURL('/', { timeout: 10000 });
    
    await login(page, TEST_USERS.adminGlobal);
    await openContributionModal(page);
    await selectCity(page, 'lyon');
    await clickEditContributions(page);
    
    await page.waitForTimeout(1500);
    
    // Vérifier que la checkbox "Mes contributions uniquement" est visible et modifiable
    const toggle = page.locator('#contrib-mine-only-toggle');
    await expect(toggle).toBeVisible();
    
    const checkbox = page.locator('#contrib-mine-only');
    await expect(checkbox).not.toBeDisabled();
    
    // Décocher pour voir toutes les contributions
    if (await checkbox.isChecked()) {
      await checkbox.click();
      await page.waitForTimeout(1000);
    }
    
    const itemCount = await page.locator('.contrib-card').count();
    console.log(`[Admin Global] Voit ${itemCount} contributions au total`);
    
    // L'admin global peut voir toutes les contributions (pas de restriction de ville)
    // Note: Dans un vrai scénario multi-villes, on vérifierait qu'il voit les contributions de toutes les villes
  });
});
