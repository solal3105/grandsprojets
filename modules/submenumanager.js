// modules/SubmenuManager.js
// Gestionnaire central unifié pour tous les sous-menus
// Source de vérité unique pour : header HTML, toggle, close, restore layers
const SubmenuManager = (() => {

  // ─── Utilitaires DOM ───────────────────────────────────────────────

  /**
   * Synchronise la largeur de #dynamic-submenus avec #left-nav
   * pour que .submenu { left: 100% } colle parfaitement à la nav.
   */
  function syncSubmenuContainerWidth() {
    const nav = document.getElementById('left-nav');
    const submenus = document.getElementById('dynamic-submenus');
    if (!nav || !submenus) return;
    // On mobile, #dynamic-submenus is position:static → no sync needed
    if (window.innerWidth <= 720) return;
    submenus.style.width = nav.offsetWidth + 'px';
  }

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
      syncSubmenuContainerWidth();
      el.style.display = 'block';
      // Signal nav to adjust border-radius
      const leftNav = document.getElementById('left-nav');
      if (leftNav) leftNav.classList.add('has-panel-open');
      // On mobile, position submenu flush above the nav
      if (window.innerWidth <= 720 && leftNav) {
        const navRect = leftNav.getBoundingClientRect();
        const bottomFromViewport = window.innerHeight - navRect.top;
        el.style.bottom = bottomFromViewport + 'px';
      }
    }
  }

  // ─── Toggle expand / collapse (source unique) ─────────────────────

  /**
   * Bascule un panneau entre réduit (10vh) et développé.
   * Fonctionne pour les submenus ET le panneau de détail.
   * @param {HTMLElement} toggleBtn - Bouton déclencheur (.submenu-toggle-btn)
   * @param {HTMLElement} panel     - Conteneur à réduire/développer
   */
  function togglePanel(toggleBtn, panel) {
    if (!toggleBtn || !panel) return;
    const isCollapsed = toggleBtn.getAttribute('aria-expanded') === 'false';
    const icon  = toggleBtn.querySelector('i');
    const label = toggleBtn.querySelector('span');

    if (isCollapsed) {
      // → Développer
      panel.style.removeProperty('max-height');
      panel.style.removeProperty('overflow');
      if (icon) { icon.classList.remove('fa-expand'); icon.classList.add('fa-compress'); }
      if (label) label.textContent = 'Réduire';
      toggleBtn.classList.remove('is-collapsed');
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.setAttribute('aria-label', 'Réduire');
    } else {
      // → Réduire
      panel.style.setProperty('max-height', '10vh', 'important');
      panel.style.setProperty('overflow', 'hidden', 'important');
      if (icon) { icon.classList.remove('fa-compress'); icon.classList.add('fa-expand'); }
      if (label) label.textContent = 'Développer';
      toggleBtn.classList.add('is-collapsed');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-label', 'Développer');
    }
  }

  /**
   * Réinitialise un panneau en mode développé
   * @param {HTMLElement} panel - Conteneur (.submenu ou #project-detail)
   */
  function resetExpanded(panel) {
    if (!panel) return;
    panel.style.removeProperty('max-height');
    panel.style.removeProperty('overflow');
    const btn = panel.querySelector('.submenu-toggle-btn');
    if (btn) {
      const icon  = btn.querySelector('i');
      const label = btn.querySelector('span');
      if (icon) { icon.classList.remove('fa-expand'); icon.classList.add('fa-compress'); }
      if (label) label.textContent = 'Réduire';
      btn.classList.remove('is-collapsed');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Réduire');
    }
  }

  // ─── Header partagé ───────────────────────────────────────────────

  /**
   * Génère le HTML du header standard d'un sous-menu (close + toggle).
   * @param {Object} [opts]
   * @param {boolean} [opts.showClose=true]  - Afficher le bouton Fermer
   * @param {boolean} [opts.showToggle=true] - Afficher le bouton Réduire
   * @param {string}  [opts.extraHTML='']    - HTML supplémentaire (ex: header-center)
   * @returns {string} HTML du header
   */
  function headerHTML(opts = {}) {
    const { showClose = true, showToggle = true, extraHTML = '' } = opts;
    return `
      <div class="detail-header-submenu">
        <div class="header-left">
          ${showClose ? `<button class="btn-secondary close-btn" aria-label="Fermer">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            <span>Fermer</span>
          </button>` : ''}
        </div>
        ${extraHTML}
        <div class="header-right">
          ${showToggle ? `<button class="btn-secondary submenu-toggle-btn" aria-label="Réduire" aria-expanded="true">
            <i class="fa-solid fa-compress" aria-hidden="true"></i>
            <span>Réduire</span>
          </button>` : ''}
        </div>
      </div>`;
  }

  /**
   * Attache les événements close + toggle sur un conteneur de sous-menu.
   * @param {HTMLElement} container - Le .submenu ou #project-detail
   */
  function wireHeaderEvents(container) {
    if (!container) return;

    // Toggle
    const toggleBtn = container.querySelector('.submenu-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(toggleBtn, container);
      });
    }

    // Close
    const closeBtn = container.querySelector('.close-btn');
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
    // 1. Masquer tous les submenus + désactiver onglets
    cleanupAll();

    // 2. Retirer la classe panel-open de la nav
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      leftNav.classList.remove('has-panel-open');
      leftNav.style.removeProperty('border-radius');
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
    // Rendu
    renderSubmenu,
    // Header partagé
    headerHTML,
    wireHeaderEvents,
    // Toggle partagé
    togglePanel,
    resetExpanded,
    // Fermeture
    cleanupAll,
    closeCurrentSubmenu,
    activateTab,
    showSubmenu,
    // Queries
    isSubmenuOpen,
    getCurrentSubmenu
  };

  window.SubmenuManager = publicAPI;
  return publicAPI;
})();
