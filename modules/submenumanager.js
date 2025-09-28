// modules/SubmenuManager.js
// Gestionnaire central unifié pour tous les sous-menus
const SubmenuManager = (() => {

  /**
   * Nettoie tous les sous-menus précédemment ouverts
   */
  function cleanupPreviousSubmenu() {
    // Fermer tous les sous-menus
    document.querySelectorAll('.submenu').forEach(menu => {
      menu.style.display = 'none';
    });
    
    // Désactiver tous les onglets
    document.querySelectorAll('.nav-category.active').forEach(tab => {
      tab.classList.remove('active');
    });
  }

  /**
   * Active l'onglet correspondant à la catégorie
   * @param {string} category - Catégorie du sous-menu
   */
  function activateTab(category) {
    const tab = document.getElementById(`nav-${category}`);
    if (tab) {
      tab.classList.add('active');
    }
  }

  /**
   * Affiche le sous-menu correspondant à la catégorie
   * @param {string} category - Catégorie du sous-menu
   */
  function showSubmenu(category) {
    const submenu = document.getElementById(`${category}-submenu`);
    if (submenu) {
      submenu.style.display = 'block';
    }
  }

  /**
   * Rend le sous-menu pour la catégorie donnée
   * @param {string} category - Catégorie (velo, mobilite, urbanisme, travaux)
   */
  async function renderSubmenu(category) {
    console.log(`[SubmenuManager] Rendu du sous-menu: ${category}`);
    
    try {
      // 1. Nettoyage commun
      cleanupPreviousSubmenu();
      
      // 2. Activation de l'onglet
      activateTab(category);
      
      // 3. Affichage du conteneur
      showSubmenu(category);
      
      // 4. Rendu spécialisé selon le type
      if (category === 'travaux') {
        // Système spécialisé pour Travaux (filtres complexes)
        if (window.TravauxModule?.renderTravauxProjects) {
          await window.TravauxModule.renderTravauxProjects();
          console.log(`[SubmenuManager] Travaux rendu via TravauxModule`);
        } else {
          console.error('[SubmenuManager] TravauxModule non disponible');
        }
      } else {
        // Système unifié pour les projets (velo, mobilite, urbanisme)
        if (window.SubmenuModule?.renderProjectsByCategory) {
          await window.SubmenuModule.renderProjectsByCategory(category);
          console.log(`[SubmenuManager] ${category} rendu via SubmenuModule`);
        } else {
          console.error('[SubmenuManager] SubmenuModule non disponible');
        }
      }
      
    } catch (error) {
      console.error(`[SubmenuManager] Erreur lors du rendu de ${category}:`, error);
    }
  }

  /**
   * Ferme tous les sous-menus et revient à la vue par défaut
   */
  function closeAllSubmenus() {
    cleanupPreviousSubmenu();
    
    // Réinitialiser la vue par défaut si disponible
    if (window.NavigationModule?.resetToDefaultView) {
      window.NavigationModule.resetToDefaultView();
    }
  }

  /**
   * Vérifie si un sous-menu est actuellement ouvert
   * @param {string} category - Catégorie à vérifier
   * @returns {boolean}
   */
  function isSubmenuOpen(category) {
    const submenu = document.getElementById(`${category}-submenu`);
    return submenu && submenu.style.display !== 'none';
  }

  /**
   * Obtient la catégorie du sous-menu actuellement ouvert
   * @returns {string|null}
   */
  function getCurrentSubmenu() {
    const activeTab = document.querySelector('.nav-category.active');
    if (activeTab) {
      const match = activeTab.id.match(/^nav-(.+)$/);
      return match ? match[1] : null;
    }
    return null;
  }

  // API publique du module
  const publicAPI = {
    renderSubmenu,
    closeAllSubmenus,
    isSubmenuOpen,
    getCurrentSubmenu
  };

  // Exposer le module globalement
  window.SubmenuManager = publicAPI;

  return publicAPI;
})();
