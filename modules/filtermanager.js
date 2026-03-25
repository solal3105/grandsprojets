// modules/filtermanager.js
;(function(win) {
  'use strict';

  // Legacy layer names excluded from the filter panel
  const EXCLUDED_LAYERS = new Set(['voielyonnaise', 'reseauProjeteSitePropre', 'urbanisme']);

  const FilterManager = {

    _createItem(layerName, iconClass, label) {
      const el = document.createElement('div');
      el.className = 'dock-panel__item filter-item';
      el.dataset.layer = layerName;

      // Inject per-category color as CSS custom property
      const catData = (win.categoryIcons || []).find(c => c.category === layerName);
      if (catData?.category_styles) {
        try {
          const styles = typeof catData.category_styles === 'string'
            ? JSON.parse(catData.category_styles)
            : catData.category_styles;
          if (styles.color) el.style.setProperty('--item-color', styles.color);
        } catch (_) {}
      }

      const icon = iconClass ? (win.normalizeIconClass?.(iconClass) || iconClass) : '';
      el.innerHTML = `
        <span class="dock-panel__item-icon"><i class="${icon}"></i></span>
        <span class="dock-panel__item-label">${label || layerName}</span>
      `;
      return el;
    },

    async populateFilters() {
      const container = document.getElementById('dynamic-filters');
      if (!container) return;
      container.innerHTML = '';

      // 1. Contribution categories — data already loaded by main.js Phase 5
      const addedLayers = new Set();
      (win.categoryIcons || []).forEach(({ category, icon_class, label }) => {
        if (!category) return;
        container.appendChild(this._createItem(category, icon_class, label || category));
        addedLayers.add(category);
      });

      // 2. Extra system layers from layersConfig not covered by contributions
      const city = String(win.activeCity || '').toLowerCase();
      const filterItemsMap = Object.fromEntries(
        (Array.isArray(win.filterItems) ? win.filterItems : [])
          .filter(item => item?.layer)
          .map(item => [item.layer, item])
      );

      (Array.isArray(win.layersConfig) ? win.layersConfig : []).forEach(layer => {
        if (!layer?.name) return;
        if (EXCLUDED_LAYERS.has(layer.name)) return;
        if (addedLayers.has(layer.name)) return;
        const layerCity = layer.ville ? String(layer.ville).toLowerCase() : null;
        if (layerCity && layerCity !== city) return;

        const info = filterItemsMap[layer.name];
        const iconClass = info?.icon || layer.icon_class || layer.icon || 'fa-layer-group';
        const label = info?.label || layer.label || layer.name;
        container.appendChild(this._createItem(layer.name, iconClass, label));
      });
    },

    syncUI() {
      document.querySelectorAll('.filter-item').forEach(item => {
        item.classList.toggle('is-active', !!(win.MapModule?.layers?.[item.dataset.layer]));
      });
      const countEl = document.querySelector('.filter-count');
      if (countEl) countEl.textContent = document.querySelectorAll('.filter-item.is-active').length;
    },

    async init() {
      await this.populateFilters();
      this.syncUI();

      const filterContainer = document.getElementById('dynamic-filters');
      if (!filterContainer) return;

      filterContainer.addEventListener('click', async (e) => {
        const item = e.target.closest('.filter-item');
        if (!item) return;
        const layerName = item.dataset.layer;
        if (!layerName) return;

        if (win.MapModule?.layers?.[layerName]) {
          win.MapModule.removeLayer(layerName);
        } else {
          await win.DataModule?.loadLayer?.(layerName);
        }
        this.syncUI();
      });
    }
  };

  win.FilterManager = FilterManager;

})(window);
