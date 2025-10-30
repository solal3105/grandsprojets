// modules/gp-icon-picker.js
// Icon Picker moderne et intuitif - Système unifié

;(function(win) {
  'use strict';

  // Catégories d'icônes avec leurs icônes
  const ICON_CATEGORIES = {
    transport: {
      label: 'Transport',
      icon: 'fa-solid fa-bus',
      icons: [
        'fa-solid fa-bus', 'fa-solid fa-train', 'fa-solid fa-subway', 'fa-solid fa-train-tram',
        'fa-solid fa-car', 'fa-solid fa-taxi', 'fa-solid fa-shuttle-van', 'fa-solid fa-truck',
        'fa-solid fa-plane', 'fa-solid fa-ship', 'fa-solid fa-ferry', 'fa-solid fa-helicopter',
        'fa-solid fa-road', 'fa-solid fa-traffic-light', 'fa-solid fa-signs-post'
      ]
    },
    mobilite: {
      label: 'Mobilité douce',
      icon: 'fa-solid fa-bicycle',
      icons: [
        'fa-solid fa-bicycle', 'fa-solid fa-person-biking', 'fa-solid fa-person-walking',
        'fa-solid fa-wheelchair', 'fa-solid fa-motorcycle', 'fa-solid fa-charging-station',
        'fa-solid fa-square-parking', 'fa-solid fa-p', 'fa-solid fa-bolt', 'fa-solid fa-leaf'
      ]
    },
    urbanisme: {
      label: 'Urbanisme',
      icon: 'fa-solid fa-building',
      icons: [
        'fa-solid fa-building', 'fa-solid fa-city', 'fa-solid fa-house', 'fa-solid fa-hotel',
        'fa-solid fa-shop', 'fa-solid fa-industry', 'fa-solid fa-warehouse', 'fa-solid fa-landmark',
        'fa-solid fa-hospital', 'fa-solid fa-school', 'fa-solid fa-graduation-cap',
        'fa-solid fa-church', 'fa-solid fa-mosque', 'fa-solid fa-synagogue', 'fa-solid fa-gopuram'
      ]
    },
    infrastructure: {
      label: 'Infrastructure',
      icon: 'fa-solid fa-bridge',
      icons: [
        'fa-solid fa-bridge', 'fa-solid fa-tower-observation', 'fa-solid fa-water',
        'fa-solid fa-fire', 'fa-solid fa-shield-halved', 'fa-solid fa-recycle',
        'fa-solid fa-dumpster', 'fa-solid fa-lightbulb', 'fa-solid fa-plug', 'fa-solid fa-wifi'
      ]
    },
    travaux: {
      label: 'Travaux',
      icon: 'fa-solid fa-helmet-safety',
      icons: [
        'fa-solid fa-helmet-safety', 'fa-solid fa-hammer', 'fa-solid fa-wrench',
        'fa-solid fa-screwdriver', 'fa-solid fa-gears', 'fa-solid fa-trowel',
        'fa-solid fa-hard-hat', 'fa-solid fa-toolbox', 'fa-solid fa-truck-pickup',
        'fa-solid fa-road-barrier', 'fa-solid fa-cone-traffic', 'fa-solid fa-triangle-exclamation'
      ]
    }
  };

  /**
   * Ouvre le modal icon picker
   * @param {HTMLInputElement} targetInput - Input qui recevra l'icône sélectionnée
   * @param {Function} onSelect - Callback appelé après sélection (optionnel)
   */
  function openIconPicker(targetInput, onSelect) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('gp-icon-picker-modal');
    if (!modal) {
      modal = createIconPickerModal();
      document.body.appendChild(modal);
    }

    // Stocker la référence de l'input cible
    modal.dataset.targetInputId = targetInput.id;
    modal.dataset.onSelectCallback = onSelect ? onSelect.toString() : '';

    // Afficher le modal
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('gp-icon-picker--active');
    });

    // Focus sur la recherche
    const searchInput = modal.querySelector('.gp-icon-picker__search input');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }

    // Charger toutes les icônes par défaut
    renderIcons(modal, '');
  }

  /**
   * Crée le modal HTML
   */
  function createIconPickerModal() {
    const modal = document.createElement('div');
    modal.id = 'gp-icon-picker-modal';
    modal.className = 'gp-icon-picker-overlay';
    
    modal.innerHTML = `
      <div class="gp-icon-picker">
        <!-- Header -->
        <div class="gp-icon-picker__header">
          <h3 class="gp-icon-picker__title">
            <i class="fa-solid fa-icons"></i>
            Choisir une icône
          </h3>
          <button type="button" class="gp-icon-picker__close" aria-label="Fermer">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Search -->
        <div class="gp-icon-picker__search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="Rechercher une icône..." autocomplete="off" />
        </div>

        <!-- Categories -->
        <div class="gp-icon-picker__categories"></div>

        <!-- Icons Grid -->
        <div class="gp-icon-picker__content">
          <div class="gp-icon-picker__grid"></div>
        </div>

        <!-- Footer -->
        <div class="gp-icon-picker__footer">
          <a href="https://fontawesome.com/search?o=r&m=free" target="_blank" rel="noopener" class="gp-icon-picker__link">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
            Parcourir toutes les icônes FontAwesome
          </a>
        </div>
      </div>
    `;

    // Bind events
    bindModalEvents(modal);

    return modal;
  }

  /**
   * Bind les événements du modal
   */
  function bindModalEvents(modal) {
    // Close button
    const closeBtn = modal.querySelector('.gp-icon-picker__close');
    closeBtn.addEventListener('click', () => closeIconPicker(modal));

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeIconPicker(modal);
      }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('gp-icon-picker--active')) {
        closeIconPicker(modal);
      }
    });

    // Search input
    const searchInput = modal.querySelector('.gp-icon-picker__search input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        renderIcons(modal, e.target.value.toLowerCase());
      }, 200);
    });

    // Render categories
    renderCategories(modal);
  }

  /**
   * Render les catégories
   */
  function renderCategories(modal) {
    const container = modal.querySelector('.gp-icon-picker__categories');
    
    const categoriesHTML = Object.entries(ICON_CATEGORIES).map(([key, cat]) => `
      <button type="button" class="gp-icon-picker__category" data-category="${key}">
        <i class="${cat.icon}"></i>
        <span>${cat.label}</span>
      </button>
    `).join('');

    // Bouton "Toutes"
    container.innerHTML = `
      <button type="button" class="gp-icon-picker__category gp-icon-picker__category--active" data-category="all">
        <i class="fa-solid fa-grid"></i>
        <span>Toutes</span>
      </button>
      ${categoriesHTML}
    `;

    // Bind category clicks
    container.querySelectorAll('.gp-icon-picker__category').forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from all
        container.querySelectorAll('.gp-icon-picker__category').forEach(b => {
          b.classList.remove('gp-icon-picker__category--active');
        });
        
        // Add active class to clicked
        btn.classList.add('gp-icon-picker__category--active');

        // Render icons for this category
        const category = btn.dataset.category;
        const searchInput = modal.querySelector('.gp-icon-picker__search input');
        renderIcons(modal, searchInput.value.toLowerCase(), category);
      });
    });
  }

  /**
   * Render les icônes
   */
  function renderIcons(modal, searchTerm = '', category = 'all') {
    const grid = modal.querySelector('.gp-icon-picker__grid');
    
    // Get all icons based on category
    let iconsToShow = [];
    
    if (category === 'all') {
      // All icons
      Object.values(ICON_CATEGORIES).forEach(cat => {
        iconsToShow.push(...cat.icons);
      });
    } else {
      // Specific category
      iconsToShow = ICON_CATEGORIES[category]?.icons || [];
    }

    // Filter by search term
    if (searchTerm) {
      iconsToShow = iconsToShow.filter(icon => 
        icon.toLowerCase().includes(searchTerm)
      );
    }

    // Render
    if (iconsToShow.length === 0) {
      grid.innerHTML = `
        <div class="gp-icon-picker__empty">
          <i class="fa-solid fa-magnifying-glass"></i>
          <p>Aucune icône trouvée</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = iconsToShow.map(iconClass => `
      <button type="button" class="gp-icon-picker__icon" data-icon="${iconClass}" title="${iconClass}">
        <i class="${iconClass}"></i>
      </button>
    `).join('');

    // Bind icon clicks
    grid.querySelectorAll('.gp-icon-picker__icon').forEach(btn => {
      btn.addEventListener('click', () => {
        selectIcon(modal, btn.dataset.icon);
      });
    });
  }

  /**
   * Sélectionne une icône
   */
  function selectIcon(modal, iconClass) {
    const targetInputId = modal.dataset.targetInputId;
    const targetInput = document.getElementById(targetInputId);

    if (targetInput) {
      targetInput.value = iconClass;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Call callback if exists (sécurisé - pas d'eval)
    const callbackStr = modal.dataset.onSelectCallback;
    if (callbackStr) {
      try {
        // Chercher la fonction dans window (ex: "myCallback" ou "MyModule.callback")
        const parts = callbackStr.split('.');
        let callback = window;
        for (const part of parts) {
          callback = callback?.[part];
          if (!callback) break;
        }
        if (typeof callback === 'function') {
          callback(iconClass);
        }
      } catch (e) {
        console.warn('[IconPicker] Callback error:', e);
      }
    }

    // Close modal
    closeIconPicker(modal);
  }

  /**
   * Ferme le modal
   */
  function closeIconPicker(modal) {
    modal.classList.remove('gp-icon-picker--active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 200);
  }

  // Exposer l'API publique
  win.GPIconPicker = {
    open: openIconPicker
  };

})(window);
