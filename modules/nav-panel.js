// modules/nav-panel.js
// 3-Level Navigation Panel Controller
// Level 1: Module selection (Carte / Travaux) — handled by sidebar.js
// Level 2: Categories (Carte) or Sections (Travaux)
// Level 3: Projects list / Travaux filters & timeline

;(function(win) {
  'use strict';

  const NavPanel = {

    _panel: null,
    _scrim: null,
    _headerTitle: null,
    _backBtn: null,
    _closeBtn: null,
    _breadcrumb: null,
    _level2: null,
    _level3: null,

    _currentModule: null,   // 'carte' | 'travaux'
    _currentCategory: null, // category slug at level 3
    _level: 0,              // 0 = closed, 2 = level 2, 3 = level 3
    _collapsed: false,      // true = panel hidden but state preserved
    _travauxLayersLoaded: false,
    _travauxLoadPromise: null,
    _sidebar: null,
    _resizeObserver: null,

    /* ──────────────────────────────────────────────────────────────────── */
    /*  INIT                                                               */
    /* ──────────────────────────────────────────────────────────────────── */

    init() {
      this._panel = document.getElementById('nav-panel');
      this._scrim = document.getElementById('nav-panel-scrim');
      if (!this._panel) return;

      this._headerTitle = this._panel.querySelector('.nav-panel__title');
      this._backBtn = this._panel.querySelector('.nav-panel__back');
      this._closeBtn = this._panel.querySelector('.nav-panel__close');
      this._collapseBtn = this._panel.querySelector('.nav-panel__collapse');
      this._breadcrumb = this._panel.querySelector('.nav-panel__breadcrumb');
      this._level2 = this._panel.querySelector('.nav-panel__level2');
      this._level3 = this._panel.querySelector('.nav-panel__level3');
      this._sidebar = document.querySelector('.gp-sidebar');

      this._bindEvents();
      this._initDragHandle();
      this._initSyncTaller();
    },

    _bindEvents() {
      if (this._closeBtn) {
        this._closeBtn.addEventListener('click', () => this.collapse());
      }
      if (this._collapseBtn) {
        this._collapseBtn.addEventListener('click', () => this.collapse());
      }
      if (this._backBtn) {
        this._backBtn.addEventListener('click', () => this.goBack());
      }
      if (this._scrim) {
        this._scrim.addEventListener('click', () => this.collapse());
      }

      // Escape: L3 → back, L2 → collapse (not full close)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._level > 0 && !this._collapsed) {
          if (this._level === 3) this.goBack();
          else this.collapse();
        }
      });
    },

    /**
     * Drag-to-collapse on mobile: tracks pointer on the handle pill
     */
    _initDragHandle() {
      const handle = this._panel?.querySelector('.nav-panel__handle');
      if (!handle) return;

      let startY = 0;
      let startTime = 0;
      let currentY = 0;
      let dragging = false;

      handle.addEventListener('pointerdown', (e) => {
        if (window.innerWidth > 720) return;
        if (!this.isOpen() || this._collapsed) return;

        dragging = true;
        startY = e.clientY;
        startTime = Date.now();
        currentY = 0;

        handle.setPointerCapture(e.pointerId);
        this._panel.style.transition = 'none';
        this._panel.classList.add('dragging');
      });

      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        currentY = Math.max(0, e.clientY - startY);
        this._panel.style.transform = `translateY(${currentY}px)`;
      });

      const onRelease = () => {
        if (!dragging) return;
        dragging = false;
        this._panel.classList.remove('dragging');

        const deltaY = currentY;
        const elapsed = Math.max(Date.now() - startTime, 1);
        const velocity = deltaY / elapsed; // px/ms

        if (deltaY > 80 || velocity > 0.45) {
          // fast enough or far enough — collapse
          this._panel.style.removeProperty('transform');
          this._panel.style.removeProperty('transition');
          this.collapse();
        } else {
          // snap back with spring
          this._panel.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
          this._panel.style.transform = 'translateY(0)';
          const cleanup = () => {
            this._panel.style.removeProperty('transform');
            this._panel.style.removeProperty('transition');
            this._panel.removeEventListener('transitionend', cleanup);
          };
          this._panel.addEventListener('transitionend', cleanup);
        }
      };

      handle.addEventListener('pointerup', onRelease);
      handle.addEventListener('pointercancel', onRelease);
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  PUBLIC API                                                         */
    /* ──────────────────────────────────────────────────────────────────── */

    /* ── Module renderers registry ── */
    _moduleRenderers: {},

    /**
     * Enregistre un renderer pour un module
     * @param {string} key - module_key ('carte', 'travaux', etc.)
     * @param {Object} renderer - { label, renderL2(panel), renderL3(panel, section, opts), onBack(panel), onClose(panel), clearLayers }
     */
    registerModule(key, renderer) {
      this._moduleRenderers[key] = renderer;
    },

    /**
     * Open panel at Level 2 for a module
     * @param {string} mod - module_key
     */
    openModule(mod) {
      if (!this._panel) return;

      this._collapsed = false;
      this._panel.classList.remove('collapsed');

      const prevModule = this._currentModule;
      this._currentModule = mod;
      this._currentCategory = null;
      this._panel.setAttribute('data-module', mod);
      this._setLevel(2);

      // Clear any active selection/glow before switching module context
      win.FeatureInteractions?.clearSelection?.();

      const renderer = this._moduleRenderers[mod];

      // Keep map content deterministic on every module entry
      if (renderer?.clearLayers) {
        this._clearAllMapLayers();
      } else if (prevModule && prevModule !== mod) {
        this._restoreDefaultLayers();
      }

      if (renderer) {
        this._headerTitle.textContent = renderer.label || mod;
        renderer.renderL2(this);
      }

      this._panel.classList.add('open');
      if (this._scrim) this._scrim.classList.add('visible');

      // Map padding
      this._updateMapPadding(true);
    },

    /**
     * Navigate to Level 3 for a specific category/section
     * @param {string} category - Category slug or travaux section
     * @param {Object} [opts] - Options like { label, color }
     */
    async openLevel3(category, opts = {}) {
      if (!this._panel) return;

      this._currentCategory = category;
      this._setLevel(3);

      const label = opts.label || category;
      this._headerTitle.textContent = label;
      this._updateBreadcrumb(label);
      this._updateCollapseButton(label, true);

      // Show a contextual skeleton immediately
      const renderer = this._moduleRenderers[this._currentModule];
      if (renderer?.skeletonL3) {
        this._level3.innerHTML = renderer.skeletonL3();
      } else {
        this._level3.innerHTML = this._skeletonL3Cards(5);
      }

      if (renderer?.renderL3) {
        await renderer.renderL3(this, category, opts);
      }
    },

    /**
     * Go back from Level 3 to Level 2
     */
    goBack() {
      if (this._level !== 3) return;

      this._currentCategory = null;
      this._setLevel(2);
      this._updateCollapseButton(null, false);

      const renderer = this._moduleRenderers[this._currentModule];
      this._headerTitle.textContent = renderer?.label || this._currentModule || 'Navigation';

      if (renderer?.onBack) {
        renderer.onBack(this);
      }
    },

    /**
     * Close the panel entirely
     */
    close() {
      if (!this._panel) return;

      // Notify current module renderer
      const renderer = this._moduleRenderers[this._currentModule];
      if (renderer?.onClose) renderer.onClose(this);

      this._panel.classList.remove('open', 'collapsed');
      if (this._scrim) this._scrim.classList.remove('visible');

      this._level = 0;
      this._collapsed = false;
      this._currentModule = null;
      this._currentCategory = null;
      this._updateCollapseButton(null, false);

      this._updateMapPadding(false);

      // Notify sidebar to deactivate module buttons
      if (win.SidebarModule?._deactivateModules) {
        win.SidebarModule._deactivateModules();
      }

      // Restore default layers
      this._restoreDefaultLayers();
    },

    /**
     * Check if panel is open
     */
    isOpen() {
      return this._level > 0;
    },

    /**
     * Update the collapse button text and style.
     * @param {string|null} categoryLabel - category label to append, or null to reset
     * @param {boolean} colored - whether to apply city primary color
     */
    _updateCollapseButton(categoryLabel, colored) {
      if (!this._collapseBtn) return;
      const span = this._collapseBtn.querySelector('.nav-panel__collapse-text') ||
                   (() => {
                     // Wrap existing text in a span if not already done
                     const s = document.createElement('span');
                     s.className = 'nav-panel__collapse-text';
                     this._collapseBtn.appendChild(s);
                     return s;
                   })();

      if (categoryLabel) {
        span.textContent = `Voir la carte (${categoryLabel})`;
      } else {
        span.textContent = 'Voir la carte';
      }

      if (colored) {
        this._collapseBtn.classList.add('nav-panel__collapse--city');
      } else {
        this._collapseBtn.classList.remove('nav-panel__collapse--city');
      }
    },

    /**
     * Collapse — hide panel but preserve all state
     */
    collapse() {
      if (!this._panel || !this.isOpen() || this._collapsed) return;
      this._collapsed = true;
      this._panel.classList.add('collapsed');
      if (this._scrim) this._scrim.classList.remove('visible');
      this._updateMapPadding(false);
    },

    /**
     * Expand — restore collapsed panel
     */
    expand() {
      if (!this._panel || !this._collapsed) return;
      this._collapsed = false;
      this._panel.classList.remove('collapsed');
      if (this._scrim) this._scrim.classList.add('visible');
      this._updateMapPadding(true);
    },

    /**
     * Check if panel is collapsed
     */
    isCollapsed() {
      return this._collapsed === true;
    },

    /**
     * Get current state
     */
    getState() {
      return {
        level: this._level,
        module: this._currentModule,
        category: this._currentCategory
      };
    },

    /**
     * Set up ResizeObserver to keep .taller class in sync
     */
    _initSyncTaller() {
      if (!this._sidebar || !this._panel) return;
      // Retirer le précédent listener s'il existe
      if (this._resizeSyncHandler) {
        window.removeEventListener('resize', this._resizeSyncHandler);
      }
      this._resizeSyncHandler = () => this._syncTaller();
      this._resizeObserver = new ResizeObserver(this._resizeSyncHandler);
      this._resizeObserver.observe(this._sidebar);
      this._resizeObserver.observe(this._panel);
      window.addEventListener('resize', this._resizeSyncHandler, { passive: true });
    },

    /**
     * Toggle .taller class: panel exceeds sidebar height ↔ border-bottom-left-radius
     */
    _syncTaller() {
      if (!this._panel || !this._sidebar) return;
      if (window.innerWidth <= 720) {
        this._panel.classList.remove('taller');
        document.documentElement.style.removeProperty('--sidebar-h');
        return;
      }
      const sidebarH = this._sidebar.offsetHeight;
      // Always add 20px so the panel is always taller → border-bottom-left-radius always visible
      document.documentElement.style.setProperty('--sidebar-h', (sidebarH + 20) + 'px');
      this._panel.classList.add('taller');
    },

    /* ── Skeleton / loading helpers ─────────────────────────────────── */

    /** HTML for n skeleton rows (mimics .nav-panel__item) */
    _skeletonL2Items(count = 3) {
      const label = '<div class="nav-panel__skel-label"></div>';
      const items = Array.from({ length: count }, (_, i) => `
        <div class="nav-panel__skel-item" style="animation-delay:${(0.04 + i * 0.06).toFixed(2)}s">
          <div class="nav-panel__skel-icon"></div>
          <div class="nav-panel__skel-text">
            <div class="nav-panel__skel-line nav-panel__skel-line--wide"></div>
            <div class="nav-panel__skel-line nav-panel__skel-line--short"></div>
          </div>
          <div class="nav-panel__skel-arrow"></div>
        </div>`).join('');
      return label + items;
    },

    /** HTML for n skeleton project cards (mimics L3 .project-card) */
    _skeletonL3Cards(count = 5) {
      return `<ul class="project-list">` +
        Array.from({ length: count }, (_, i) => `
          <li class="nav-panel__skel-card" style="animation-delay:${(0.04 + i * 0.07).toFixed(2)}s">
            <div class="nav-panel__skel-card-hero"></div>
            <div class="nav-panel__skel-card-body">
              <div class="nav-panel__skel-card-title nav-panel__skel-card-title--short"></div>
            </div>
          </li>`).join('') +
        `</ul>`;
    },

    /**
     * Remove map layers (except an optional exclusion set) and reset filters.
     * @param {Set<string>} [exclude] — layer names to keep on the map
     */
    _removeLayersExcept(exclude = new Set()) {
      win.MapModule?.removeAllLayers?.(exclude);
      FilterModule.resetAll();
    },

    /** Remove all map layers, reset filters and travaux state. */
    _clearAllMapLayers() {
      this._removeLayersExcept();
      this._travauxLayersLoaded = false;
    },

    /**
     * Clear the map and restore contributions + default layers.
     * @param {boolean} [keepTravaux=false] — preserve travaux layers on the map (goBack use-case)
     */
    _restoreDefaultLayers(keepTravaux = false) {
      const layersMap = win.categoryLayersMap || {};
      const preserve = keepTravaux ? new Set(layersMap['travaux'] || ['travaux']) : new Set();

      this._removeLayersExcept(preserve);

      if (!keepTravaux) {
        this._travauxLayersLoaded = false;
        // Don't null _travauxLoadPromise here — let the running promise finish naturally
        // and its guard will prevent layer creation. Nulling causes _travauxLayersLoaded
        // desync when the abandoned promise's finally block runs after the flag is reset.
      }

      // Réafficher les contributions depuis le cache
      const displayed = new Set();
      if (win.allContributions?.length) {
        const cats = [...new Set(win.allContributions.map(c => c.category))];
        cats.forEach(cat => {
          if (win.DataModule?.layerData?.[cat]) {
            win.DataModule.createGeoJsonLayer(cat, win.DataModule.layerData[cat]);
            displayed.add(cat);
          }
        });
      }

      // Réafficher les layers par défaut
      win.defaultLayers?.forEach(layer => {
        if (!displayed.has(layer) && win.DataModule?.layerData?.[layer]) {
          win.DataModule.createGeoJsonLayer(layer, win.DataModule.layerData[layer]);
        }
      });
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  UI HELPERS                                                         */
    /* ──────────────────────────────────────────────────────────────────── */

    _setLevel(level) {
      this._level = level;
      if (this._panel) {
        this._panel.setAttribute('data-level', String(level));
      }
    },

    _updateBreadcrumb(label) {
      if (!this._breadcrumb) return;
      const renderer = this._moduleRenderers[this._currentModule];
      const modLabel = renderer?.label || this._currentModule || 'Menu';
      this._breadcrumb.innerHTML = `
        <span class="nav-panel__breadcrumb-item" data-action="back">${modLabel}</span>
        <span class="nav-panel__breadcrumb-sep"><i class="fas fa-chevron-right"></i></span>
        <span class="nav-panel__breadcrumb-current">${label}</span>
      `;

      // Bind breadcrumb back
      const backItem = this._breadcrumb.querySelector('[data-action="back"]');
      if (backItem) {
        backItem.addEventListener('click', () => this.goBack());
      }
    },

    _updateMapPadding(open) {
      try {
        const mlMap = win.MapModule?.map?._mlMap;
        if (mlMap && typeof mlMap.easeTo === 'function') {
          const isMobile = window.innerWidth <= 720;
          if (isMobile) {
            mlMap.easeTo({
              padding: { top: 0, right: 0, bottom: open ? 280 : 0, left: 0 },
              duration: 300
            });
          } else {
            const sidebarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 80;
            const panelW = open ? 320 : 0;
            mlMap.easeTo({
              padding: { top: 0, right: 0, bottom: 0, left: open ? sidebarW + panelW : sidebarW },
              duration: 300
            });
          }
        }
      } catch (_) {}
    }
  };

  win.NavPanel = NavPanel;

})(window);
