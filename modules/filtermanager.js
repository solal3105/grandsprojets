// modules/filtermanager.js
// Gestion dynamique des filtres basés sur contribution_uploads

;(function(win) {
  'use strict';

  const FilterManager = {
    /**
     * Génère dynamiquement le DOM des filtres basé sur contribution_uploads
     */
    async populateFilters() {
      const container = document.getElementById('dynamic-filters');
      if (!container) return;
      container.innerHTML = '';

      // Récupérer les catégories dynamiquement depuis contribution_uploads
      let contributionCategories = [];
      try {
        if (window.supabaseService?.fetchAllProjects) {
          const allContributions = await window.supabaseService.fetchAllProjects();
          contributionCategories = [...new Set(allContributions.map(c => c.category).filter(Boolean))];
        }
      } catch (error) {
        contributionCategories = [];
      }

      // Config catégories: alimentée uniquement par la base (icônes)
      const categoryConfig = {};
      window.categoryConfig = categoryConfig;

      // Hydrater les icônes de catégories depuis la base
      try {
        if (typeof win.supabaseService?.fetchCategoryIcons === 'function') {
          const rows = await win.supabaseService.fetchCategoryIcons();
          if (Array.isArray(rows)) {
            rows.forEach(r => {
              if (!r || !r.category) return;
              const cat = String(r.category).trim();
              if (!cat) return;
              const iconClass = String(r.icon_class || '').trim();
              if (!window.categoryConfig[cat]) window.categoryConfig[cat] = {};
              window.categoryConfig[cat].icon = iconClass;
            });
          }
        }
      } catch (_) { /* no-op */ }

      // Créer le groupe "Projets" avec les catégories dynamiques
      if (contributionCategories.length > 0) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'filter-group';

        const title = document.createElement('h4');
        title.textContent = 'Projets';
        groupDiv.appendChild(title);

        contributionCategories.forEach(category => {
          const cfg = (window.categoryConfig && window.categoryConfig[category]) || {};
          let iconClass = cfg.icon || '';
          
          // Ajouter fa-solid si manquant
          if (iconClass && !iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) {
            iconClass = `fa-solid ${iconClass}`;
          }
          
          const labelText = String(category || '');
          
          const filterItem = document.createElement('div');
          filterItem.className = 'filter-item';
          filterItem.dataset.layer = category;
          filterItem.innerHTML = `
            <span class="filter-icon"><i class="${iconClass}"></i></span>
            <span class="filter-label">${labelText}</span>
          `;
          groupDiv.appendChild(filterItem);

          const tags = document.createElement('div');
          tags.className = 'active-filter-tags';
          tags.dataset.layer = category;
          groupDiv.appendChild(tags);

          const sub = document.createElement('div');
          sub.className = 'subfilters-container';
          sub.dataset.layer = category;
          groupDiv.appendChild(sub);
        });

        container.appendChild(groupDiv);
      }

      // Ajouter les autres filtres depuis filtersConfig (travaux, métro, etc.)
      // SAUF les 3 anciens projets
      if (win.filtersConfig) {
        const city = String(win.activeCity || '').toLowerCase();
        const layers = Array.isArray(win.layersConfig) ? win.layersConfig : [];
        const layerByName = Object.create(null);
        layers.forEach(l => { if (l && l.name) layerByName[l.name] = l; });

        win.filtersConfig.forEach(group => {
          const groupDiv = document.createElement('div');
          groupDiv.className = 'filter-group';

          const title = document.createElement('h4');
          title.textContent = group.category;
          groupDiv.appendChild(title);

          // Exclure les 3 anciens noms de projets
          const excludedLayers = ['voielyonnaise', 'reseauProjeteSitePropre', 'urbanisme'];
          const items = (group.items || []).filter(it => {
            if (!it || !it.layer) return false;
            if (excludedLayers.includes(it.layer)) return false;
            
            const layer = layerByName[it.layer];
            const layerCity = layer && 'ville' in layer ? layer.ville : null;
            return !layerCity || String(layerCity).toLowerCase() === city;
          });

          if (!items.length) return;

          items.forEach(item => {
            // Ajouter fa-solid si manquant
          let iconClass = item.icon || '';
          if (iconClass && !iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) {
            iconClass = `fa-solid ${iconClass}`;
          }
          
          const filterItem = document.createElement('div');
            filterItem.className = 'filter-item';
            filterItem.dataset.layer = item.layer;
            filterItem.innerHTML = `
              <span class="filter-icon"><i class="${iconClass}"></i></span>
              <span class="filter-label">${item.label}</span>
            `;
            groupDiv.appendChild(filterItem);

            const tags = document.createElement('div');
            tags.className = 'active-filter-tags';
            tags.dataset.layer = item.layer;
            groupDiv.appendChild(tags);

            const sub = document.createElement('div');
            sub.className = 'subfilters-container';
            sub.dataset.layer = item.layer;
            groupDiv.appendChild(sub);
          });

          container.appendChild(groupDiv);
        });
      }
    },

    /**
     * Met à jour l'UI des filtres selon l'état des layers
     */
    updateFilterUI() {
      document.querySelectorAll('.filter-item').forEach(item => {
        const layerName = item.dataset.layer;
        const active    = !!(window.MapModule?.layers?.[layerName]);
        item.classList.toggle('active-filter', active);
      });
    },

    /**
     * Met à jour le comptage des filtres actifs
     */
    updateFilterCount() {
      const countEl = document.querySelector('.filter-count');
      if (countEl) {
        const activeCount = document.querySelectorAll('.filter-item.active-filter').length;
        countEl.textContent = activeCount;
      }
    },

    /**
     * Initialise le système de filtres
     */
    async init() {
      await this.populateFilters();
      this.updateFilterUI();
      this.updateFilterCount();

      // Exposer les fonctions globalement pour compatibilité
      window.updateFilterUI    = () => this.updateFilterUI();
      window.updateFilterCount = () => this.updateFilterCount();

      // Observer les changements dans le container de filtres
      const filterContainer = document.getElementById('dynamic-filters');
      if (filterContainer) {
        new MutationObserver(() => {
          this.updateFilterUI();
          this.updateFilterCount();
        }).observe(filterContainer, {
          attributes: true,
          subtree: true,
          attributeFilter: ['class']
        });
      }
    }
  };

  // Exposer le module globalement
  win.FilterManager = FilterManager;

})(window);
