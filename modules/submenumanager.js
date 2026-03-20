// modules/SubmenuManager.js
// Gestionnaire central unifié pour tous les sous-menus
// Source de vérité unique pour : header HTML, close, restore layers
const SubmenuManager = (() => {

  // ─── Utilitaires DOM ───────────────────────────────────────────────

  /**
   * Masque tous les sous-menus et désactive tous les onglets
   */
  function cleanupAll() {
    document.querySelectorAll('.submenu').forEach(m => { m.style.display = 'none'; });
    document.querySelectorAll('.nav-category.active').forEach(t => t.classList.remove('active'));
  }

  /**
   * Active l'onglet de navigation pour la catégorie donnée
   */
  function activateTab(category) {
    const tab = document.getElementById(`nav-${category}`);
    if (tab) tab.classList.add('active');
  }

  /**
   * Affiche le sous-menu d'une catégorie
   */
  function showSubmenu(category) {
    const el = document.querySelector(`.submenu[data-category="${category}"]`);
    if (el) {
      el.style.removeProperty('bottom');
      // Match left-nav width so the submenu is at least as wide
      const nav = document.getElementById('left-nav');
      if (nav) el.style.setProperty('--nav-width', nav.offsetWidth + 'px');
      el.style.display = 'block';
    }
  }

  /**
   * Réinitialise un panneau en mode développé (supprime les contraintes inline)
   * @param {HTMLElement} panel - Conteneur (.submenu ou #project-detail)
   */
  function resetExpanded(panel) {
    if (!panel) return;
    panel.style.removeProperty('max-height');
    panel.style.removeProperty('overflow');
  }

  // ─── Header partagé ───────────────────────────────────────────────

  /**
   * Génère le HTML du sous-menu : header avec titre + bouton close + wrapper scrollable.
   * Le contenu (project-list, drawing panel, etc.) va dans .submenu__content.
   * @param {Object} [opts]
   * @param {boolean} [opts.showClose=true] - Afficher le bouton Fermer
   * @param {string}  [opts.title='']      - Titre affiché dans le header
   * @param {string}  [opts.innerHTML='']  - HTML injecté dans .submenu__content
   * @returns {string} HTML complet
   */
  function headerHTML(opts = {}) {
    const { showClose = true, title = '', innerHTML = '' } = opts;
    return `
      <div class="submenu__header">
        ${title ? `<h2 class="submenu__title">${title}</h2>` : ''}
        ${showClose ? `<button class="submenu__close" aria-label="Fermer">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>` : ''}
      </div>
      <div class="submenu__content">
        ${innerHTML}
      </div>`;
  }

  /**
   * Attache l'événement close sur un conteneur de sous-menu.
   * @param {HTMLElement} container - Le .submenu
   */
  function wireHeaderEvents(container) {
    if (!container) return;
    const closeBtn = container.querySelector('.submenu__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCurrentSubmenu();
      });
    }
  }

  // ─── Fermeture et restauration des layers par défaut ──────────────

  /**
   * Ferme le sous-menu courant et restaure la vue par défaut
   * (layers par défaut + contributions). Source unique de cette logique.
   */
  function closeCurrentSubmenu() {
    // 1. Animate out open submenus, then hide
    const openMenus = document.querySelectorAll('.submenu[style*="display: block"]');
    openMenus.forEach(m => {
      m.classList.add('submenu--closing');
      m.addEventListener('animationend', function handler() {
        m.removeEventListener('animationend', handler);
        m.classList.remove('submenu--closing');
        m.style.display = 'none';
      }, { once: true });
    });
    // Deactivate tabs immediately
    document.querySelectorAll('.nav-category.active').forEach(t => t.classList.remove('active'));

    // 2. Restaurer la visibilité de la nav
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      leftNav.style.removeProperty('opacity');
      leftNav.style.removeProperty('pointer-events');
      leftNav.style.removeProperty('transform');
    }

    // 3. Reset des filtres
    window.FilterModule?.resetAll();

    // 4. Vider la carte
    if (window.MapModule?.layers) {
      Object.keys(window.MapModule.layers).forEach(l => {
        try { window.MapModule.removeLayer(l); } catch (_) {}
      });
    }

    // 5. Réafficher les contributions depuis le cache
    const displayed = new Set();
    if (window.allContributions?.length) {
      const cats = [...new Set(window.allContributions.map(c => c.category))];
      cats.forEach(cat => {
        if (window.DataModule?.layerData?.[cat]) {
          window.DataModule.createGeoJsonLayer(cat, window.DataModule.layerData[cat]);
          displayed.add(cat);
        }
      });
    }

    // 6. Réafficher les layers par défaut
    window.defaultLayers?.forEach(layer => {
      if (!displayed.has(layer) && window.DataModule?.layerData?.[layer]) {
        window.DataModule.createGeoJsonLayer(layer, window.DataModule.layerData[layer]);
      }
    });
  }

  // ─── Rendu principal ──────────────────────────────────────────────

  /**
   * Rend le sous-menu pour la catégorie donnée
   * @param {string} category - Catégorie (velo, mobilite, urbanisme, travaux, etc.)
   */
  async function renderSubmenu(category) {
    console.log(`[SubmenuManager] Rendu du sous-menu: ${category}`);

    try {
      // 1. Nettoyage
      cleanupAll();

      // 2. Activation onglet + affichage conteneur
      activateTab(category);
      showSubmenu(category);

      // 3. Rendu spécialisé
      if (category === 'travaux') {
        if (window.TravauxModule?.renderTravauxProjects) {
          await window.TravauxModule.renderTravauxProjects();
        } else {
          console.error('[SubmenuManager] TravauxModule non disponible');
        }
      } else {
        if (window.SubmenuModule?.renderProjectsByCategory) {
          await window.SubmenuModule.renderProjectsByCategory(category);
        } else {
          console.error('[SubmenuManager] SubmenuModule non disponible');
        }
      }
    } catch (error) {
      console.error(`[SubmenuManager] Erreur rendu ${category}:`, error);
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────

  function isSubmenuOpen(category) {
    const el = document.querySelector(`.submenu[data-category="${category}"]`);
    return el && el.style.display !== 'none';
  }

  function getCurrentSubmenu() {
    const activeTab = document.querySelector('.nav-category.active');
    if (!activeTab) return null;
    const match = activeTab.id.match(/^nav-(.+)$/);
    return match ? match[1] : null;
  }

  // ─── API publique ─────────────────────────────────────────────────

  const publicAPI = {
    renderSubmenu,
    headerHTML,
    wireHeaderEvents,
    resetExpanded,
    cleanupAll,
    closeCurrentSubmenu,
    activateTab,
    showSubmenu,
    isSubmenuOpen,
    getCurrentSubmenu
  };

  window.SubmenuManager = publicAPI;
  return publicAPI;
})();
