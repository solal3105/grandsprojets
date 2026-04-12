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

    /**
     * Open panel at Level 2 for a module
     * @param {'carte'|'travaux'} mod
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

      // Keep map content deterministic on every module entry.
      // First travaux open previously skipped cleanup because prevModule was null,
      // leaving default layers visible underneath the travaux module.
      if (mod === 'travaux') {
        this._clearAllMapLayers();
      } else if (prevModule && prevModule !== mod) {
        this._restoreDefaultLayers();
      }

      if (mod === 'carte') {
        this._headerTitle.textContent = 'Carte';
        this._renderCarteLevel2();
      } else if (mod === 'travaux') {
        this._headerTitle.textContent = 'Travaux';
        this._renderTravauxLevel2();
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

      // Show a contextual skeleton immediately (appropriate shape per module)
      if (this._currentModule === 'carte') {
        this._level3.innerHTML = this._skeletonL3Cards(5);
      } else {
        this._level3.innerHTML =
          `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>` +
          this._skeletonL2Items(2);
      }

      if (this._currentModule === 'carte') {
        await this._renderCarteLevel3(category, opts);
      } else if (this._currentModule === 'travaux') {
        await this._renderTravauxLevel3(category, opts);
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

      const modLabel = this._currentModule === 'carte' ? 'Carte' : 'Travaux';
      this._headerTitle.textContent = modLabel;

      // Re-render level 2 (items already built, just show)
      if (this._currentModule === 'carte') {
        this._renderCarteLevel2();
        // Restore default layers — preserve travaux if they were already on the map
        this._restoreDefaultLayers(this._travauxLayersLoaded);
      } else {
        // Stop active drawing session if any
        if (win.TravauxEditorModule?.isDrawing?.()) {
          win.TravauxEditorModule.stopDrawing();
        }
        // Clean up admin save listener
        if (this._onTravauxSaved) {
          win.removeEventListener('travaux:saved', this._onTravauxSaved);
          this._onTravauxSaved = null;
        }
        this._renderTravauxLevel2();
        // Reset travaux filters and timeline when going back to L2
        FilterModule.resetAll();
        // Clear timeline filter (show all)
        if (win.TravauxModule?.setMapTimelineFilter) {
          win.TravauxModule.setMapTimelineFilter(Date.now());
        }
      }
    },

    /**
     * Close the panel entirely
     */
    close() {
      if (!this._panel) return;

      // Stop active drawing session if any
      if (win.TravauxEditorModule?.isDrawing?.()) {
        win.TravauxEditorModule.stopDrawing();
      }
      // Clean up admin save listener
      if (this._onTravauxSaved) {
        win.removeEventListener('travaux:saved', this._onTravauxSaved);
        this._onTravauxSaved = null;
      }

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

    /* ──────────────────────────────────────────────────────────────────── */
    /*  LEVEL 2 RENDERERS                                                  */
    /* ──────────────────────────────────────────────────────────────────── */

    _renderCarteLevel2() {
      const categoryIcons = win.categoryIcons || [];
      if (!categoryIcons.length) {
        this._level2.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-map"></i><span>Aucune catégorie disponible</span></div>';
        return;
      }

      let html = '<div class="nav-panel__section-label">Catégories</div>';

      categoryIcons.forEach(({ category, icon_class, label, category_styles }) => {
        if (category === 'contribute') return;

        let fullIcon = icon_class || 'fa-layer-group';
        if (fullIcon && !/^fa-(solid|regular|brands)/.test(fullIcon)) {
          fullIcon = `fa-solid ${fullIcon}`;
        }

        let color = null;
        if (category_styles) {
          try {
            const styles = typeof category_styles === 'string'
              ? JSON.parse(category_styles) : category_styles;
            color = styles.color;
          } catch (_) {}
        }
        const colorStyle = color ? `style="--item-color: ${color}"` : '';
        const displayLabel = label || category;

        // Count projects (if available)
        const layersMap = win.categoryLayersMap || {};
        const layers = layersMap[category] || [category];
        const desc = layers.length > 1 ? `${layers.length} couches` : '';

        html += `
          <button class="nav-panel__item" data-category="${category}" ${colorStyle}
                  aria-label="${displayLabel}">
            <div class="nav-panel__item-icon"><i class="${fullIcon}"></i></div>
            <div class="nav-panel__item-text">
              <div class="nav-panel__item-label">${displayLabel}</div>
              ${desc ? `<div class="nav-panel__item-desc">${desc}</div>` : ''}
            </div>
            <div class="nav-panel__item-arrow"><i class="fas fa-chevron-right"></i></div>
          </button>`;
      });

      this._level2.innerHTML = html;

      // Bind clicks
      this._level2.querySelectorAll('.nav-panel__item[data-category]').forEach(btn => {
        btn.addEventListener('click', () => {
          const cat = btn.dataset.category;
          const color = btn.style.getPropertyValue('--item-color');
          const label = btn.querySelector('.nav-panel__item-label')?.textContent || cat;

          // Mark active
          this._level2.querySelectorAll('.nav-panel__item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          // Load layers for this category
          this._loadCategoryLayers(cat);

          // Navigate to level 3
          this.openLevel3(cat, { label, color });
        });
      });
    },

    async _renderTravauxLevel2() {
      const travauxConfig = win._travauxConfig || {};
      const color = travauxConfig.color || 'var(--color-warning)';

      // Show skeleton immediately so the user sees activity right away
      this._level2.innerHTML =
        `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>` +
        this._skeletonL2Items(2);

      // Load travaux layers (may be near-instant if already preloaded/cached)
      await this._loadTravauxLayers();

      // Guard: user may have switched modules during the await
      if (this._currentModule !== 'travaux') return;

      let html = '<div class="nav-panel__section-label">Sections</div>';

      const sections = [
        {
          id: 'travaux-timeline',
          icon: 'fa-solid fa-clock',
          label: 'Chronologie',
          desc: 'Suivi temporel des chantiers'
        },
        {
          id: 'travaux-filters',
          icon: 'fa-solid fa-filter',
          label: 'Filtres',
          desc: 'Nature, commune, état'
        }
      ];

      // Section admin : admins uniquement
      if (win.__CONTRIB_IS_ADMIN && travauxConfig.source_type === 'city_travaux') {
        sections.push({
          id: 'travaux-admin',
          icon: 'fa-solid fa-screwdriver-wrench',
          label: 'Administrer',
          desc: 'Ajouter, modifier, supprimer'
        });
      }

      // Section contributeur : tout utilisateur connecté avec accès à la ville
      const city = win.getActiveCity?.() ?? win.activeCity;
      const villes = win.__CONTRIB_VILLES || [];
      const hasAccess = villes.includes('global') || villes.includes(city);
      if (!win.__CONTRIB_IS_ADMIN && win.__CONTRIB_ROLE && hasAccess && travauxConfig.source_type === 'city_travaux') {
        sections.push({
          id: 'travaux-propose',
          icon: 'fa-solid fa-paper-plane',
          label: 'Mes propositions',
          desc: 'Proposer et suivre mes chantiers'
        });
      }

      sections.forEach(s => {
        html += `
          <button class="nav-panel__item" data-section="${s.id}" style="--item-color: ${color}">
            <div class="nav-panel__item-icon"><i class="${s.icon}"></i></div>
            <div class="nav-panel__item-text">
              <div class="nav-panel__item-label">${s.label}</div>
              <div class="nav-panel__item-desc">${s.desc}</div>
            </div>
            <div class="nav-panel__item-arrow"><i class="fas fa-chevron-right"></i></div>
          </button>`;
      });

      this._level2.innerHTML = html;

      // Bind clicks
      this._level2.querySelectorAll('.nav-panel__item[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
          const section = btn.dataset.section;
          const label = btn.querySelector('.nav-panel__item-label')?.textContent || section;

          this._level2.querySelectorAll('.nav-panel__item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          this.openLevel3(section, { label, color });
        });
      });

      // Inject async pending badge on admin button (non-blocking)
      if (win.__CONTRIB_IS_ADMIN && travauxConfig.source_type === 'city_travaux') {
        this._injectPendingBadge(city);
      }
    },

    /**
     * Injects a pending-proposals count badge on the "Administrer" L2 button.
     * Runs async so it doesn't block initial rendering.
     */
    async _injectPendingBadge(city) {
      try {
        const all = await win.supabaseService?.fetchCityTravaux(city, { adminMode: true }) || [];
        const pending = all.filter(c => !c.approved);
        if (!pending.length) return;
        const btn = this._level2.querySelector('[data-section="travaux-admin"]');
        if (!btn) return;
        const arrow = btn.querySelector('.nav-panel__item-arrow');
        if (arrow && !btn.querySelector('.np-l2-badge')) {
          arrow.insertAdjacentHTML('beforebegin', `<span class="np-l2-badge">${pending.length}</span>`);
        }
      } catch (_) {}
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  SHARED HELPERS                                                     */
    /* ──────────────────────────────────────────────────────────────────── */

    /** HTML du panneau de dessin — réutilisé par admin et contributeur */
    _drawPanelHTML() {
      return `
        <div id="travaux-drawing-panel" class="np-admin-draw" style="display:none">
          <div class="np-admin-draw-header">
            <div class="np-admin-draw-icon"><i class="fa-solid fa-draw-polygon"></i></div>
            <div>
              <div class="np-admin-draw-title">Mode dessin</div>
              <div class="np-admin-draw-hint">Sélectionnez un outil puis dessinez sur la carte</div>
            </div>
          </div>
          <div class="np-admin-draw-tools">
            <button type="button" class="travaux-draw-tool" data-tool="polyline">
              <div class="tool-icon"><i class="fa-solid fa-route"></i></div>
              <div class="tool-content"><span class="tool-name">Ligne</span></div>
            </button>
            <button type="button" class="travaux-draw-tool" data-tool="polygon">
              <div class="tool-icon"><i class="fa-solid fa-draw-polygon"></i></div>
              <div class="tool-content"><span class="tool-name">Zone</span></div>
            </button>
            <button type="button" class="travaux-draw-tool" data-tool="marker">
              <div class="tool-icon"><i class="fa-solid fa-map-pin"></i></div>
              <div class="tool-content"><span class="tool-name">Point</span></div>
            </button>
          </div>
          <div class="travaux-drawing-help"><i class="fa-solid fa-circle-info"></i> <span>Dessinez sur la carte puis cliquez sur « Continuer ».</span></div>
          <div class="np-admin-draw-actions">
            <button type="button" class="np-admin-btn-cancel" id="travaux-cancel-drawing"><i class="fa-solid fa-xmark"></i> Annuler</button>
            <button type="button" class="np-admin-btn-confirm" id="travaux-finish-drawing" disabled><i class="fa-solid fa-check"></i> Continuer</button>
          </div>
        </div>`;
    },

    /** Bind edit + delete actions on a chantier list. Shared by admin & contributor. */
    _bindTravauxListActions(container, { onDelete, onRefresh }) {
      container.querySelectorAll('.np-admin-action--edit').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          win.TravauxEditorModule?.openEditorForEdit(btn.dataset.id);
        });
      });
      container.querySelectorAll('.np-admin-action--delete').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const msg = onDelete?.confirmMsg || 'Supprimer ce chantier ? Cette action est irréversible.';
          if (!confirm(msg)) return;
          btn.disabled = true;
          try {
            await win.supabaseService?.deleteCityTravaux(btn.dataset.id);
            await win.DataModule?.reloadLayer?.('travaux');
            win.Toast?.show(onDelete?.successMsg || 'Chantier supprimé', 'success', 2600);
            onRefresh?.();
          } catch (err) {
            console.error('[NavPanel] Delete error:', err);
            win.Toast?.show('Erreur lors de la suppression', 'error');
            btn.disabled = false;
          }
        });
      });
    },

    /** Auto-refresh binding for travaux:saved event */
    _bindTravauxSaved(expectedCategory, refreshFn) {
      if (this._onTravauxSaved) win.removeEventListener('travaux:saved', this._onTravauxSaved);
      this._onTravauxSaved = () => {
        if (this._currentCategory === expectedCategory) refreshFn();
      };
      win.addEventListener('travaux:saved', this._onTravauxSaved);
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  LEVEL 3 RENDERERS                                                  */
    /* ──────────────────────────────────────────────────────────────────── */

    async _renderCarteLevel3(category, opts) {
      // Reuse the skeleton project-list already rendered by openLevel3 if possible
      let projectList = this._level3.querySelector('.project-list');
      if (!projectList) {
        this._level3.innerHTML = '<ul class="project-list"></ul>';
        projectList = this._level3.querySelector('.project-list');
        if (!projectList) return;
      }

      try {
        const projects = await win.supabaseService?.fetchProjectsByCategory(category);

        // Guard: abort if user switched modules during the async fetch
        if (this._currentModule !== 'carte') return;

        if (!projects?.length) {
          this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-folder-open"></i><span>Aucun projet disponible</span></div>';
          return;
        }

        // Wipe skeleton bones and populate with real cards (navItemIn gives entrance anim)
        projectList.innerHTML = '';

        // Sort alphabetically
        projects.sort((a, b) => {
          const nameA = (a.project_name || '').toString();
          const nameB = (b.project_name || '').toString();
          return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
        });

        // Render cards (reuse createProjectCard logic)
        projects.forEach(project => {
          const card = this._createProjectCard(project, category, opts.color);
          projectList.appendChild(card);
        });

      } catch (error) {
        console.error('[NavPanel] Error rendering projects:', error);
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Erreur de chargement</span></div>';
      }
    },

    async _renderTravauxLevel3(section, opts) {
      // Load travaux layers
      await this._loadTravauxLayers();

      // Guard: abort if user switched modules during the async load
      if (this._currentModule !== 'travaux') return;

      // Load data
      const TM = win.TravauxModule;
      if (!TM) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Module Travaux indisponible</span></div>';
        return;
      }

      const LAYER = TM.LAYER_NAME || 'travaux';
      const hasData = win.DataModule?.layerData?.[LAYER]?.features?.length > 0;
      if (!hasData) {
        // Skeleton is already showing from openLevel3 — just silently wait for data
        try { await win.DataModule?.loadLayer(LAYER); } catch (_) {}
        // Re-guard after second async
        if (this._currentModule !== 'travaux') return;
      }

      const allFeatures = win.DataModule?.layerData?.[LAYER]?.features || [];
      if (!allFeatures.length) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-hard-hat"></i><span>Aucun chantier à afficher</span></div>';
        return;
      }

      TM.enrichTimestamps(allFeatures);

      if (section === 'travaux-timeline') {
        this._buildTimelineUI(allFeatures, TM);
      } else if (section === 'travaux-filters') {
        this._buildFiltersUI(allFeatures, TM);
      } else if (section === 'travaux-admin') {
        this._buildAdminUI();
      } else if (section === 'travaux-propose') {
        this._buildContributorUI();
      }
    },

    /* ── Chronologie (custom timeline UI) ────────────────────────────── */
    _buildTimelineUI(allFeatures, TM) {
      // Compute timeline range
      let tlMin = null, tlMax = null;
      let minDebut = Infinity, maxFin = -Infinity;
      for (const f of allFeatures) {
        const d = TM.parseTs(f.properties.date_debut);
        const e = TM.parseTs(f.properties.date_fin);
        if (d !== null && d < minDebut) minDebut = d;
        if (e !== null && e > maxFin) maxFin = e;
      }
      if (minDebut !== Infinity && maxFin !== -Infinity) { tlMin = minDebut; tlMax = maxFin; }
      else if (minDebut !== Infinity) { tlMin = minDebut; tlMax = minDebut + 180 * 86400000; }
      if (tlMin !== null && tlMax - tlMin < 30 * 86400000) tlMax = tlMin + 30 * 86400000;

      if (tlMin === null) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-calendar-xmark"></i><span>Aucune date disponible</span></div>';
        return;
      }

      const totalDays = Math.round((tlMax - tlMin) / 86400000);
      const todayOff = Math.max(0, Math.min(totalDays, Math.round((Date.now() - tlMin) / 86400000)));

      this._level3.innerHTML = `
        <div class="np-travaux-chrono">
          <div class="np-chrono-hero">
            <div class="np-chrono-count" id="np-tl-count">0</div>
            <div class="np-chrono-sublabel">chantier(s) en cours le</div>
            <div class="np-chrono-date" id="np-tl-date"></div>
          </div>
          <div class="np-chrono-slider-wrap">
            <div class="np-chrono-histogram" id="np-tl-histogram"></div>
            <input type="range" class="np-chrono-slider" id="np-tl-slider" min="0" max="${totalDays}" value="${todayOff}" />
          </div>
          <div class="np-chrono-range">
            <span class="np-chrono-label-min">${TM.fmtShort(new Date(tlMin))}</span>
            <button type="button" class="np-chrono-today" id="np-tl-today"><i class="fa-solid fa-calendar-day"></i> Aujourd'hui</button>
            <span class="np-chrono-label-max">${TM.fmtShort(new Date(tlMax))}</span>
          </div>
        </div>`;

      const slider = this._level3.querySelector('#np-tl-slider');
      const countEl = this._level3.querySelector('#np-tl-count');
      const dateEl = this._level3.querySelector('#np-tl-date');
      const histEl = this._level3.querySelector('#np-tl-histogram');
      const todayBtn = this._level3.querySelector('#np-tl-today');

      // Render histogram
      TM.renderHistogramSVG(histEl, TM.computeHistogram(allFeatures, tlMin, tlMax));

      const update = () => {
        const time = tlMin + parseInt(slider.value, 10) * 86400000;
        TM.setMapTimelineFilter(time);
        countEl.textContent = TM.countAtTime(allFeatures, time);
        dateEl.textContent = TM.fmtFull(new Date(time));
      };

      slider.addEventListener('input', update);
      todayBtn.addEventListener('click', () => {
        slider.value = Math.max(0, Math.min(totalDays, Math.round((Date.now() - tlMin) / 86400000)));
        update();
      });

      update();
    },

    /* ── Filtres (custom filters UI) ─────────────────────────────────── */
    _buildFiltersUI(allFeatures, TM) {
      const { values: natures, counts: natureCounts } = TM.uniqueSorted(allFeatures, 'nature_travaux');
      const { values: communes, counts: communeCounts } = TM.uniqueSorted(allFeatures, 'commune');
      const { values: etats } = TM.uniqueSorted(allFeatures, 'etat');

      this._level3.innerHTML = `
        <div class="np-travaux-filters">
          <div class="np-filters-group">
            <label class="np-filter-label">Nature des travaux</label>
            <select id="np-f-nature" class="np-filter-select">
              <option value="">Toutes les natures</option>
              ${TM.optionsHTML(natures, natureCounts, false)}
            </select>
          </div>
          <div class="np-filters-group">
            <label class="np-filter-label">Commune</label>
            <select id="np-f-commune" class="np-filter-select">
              <option value="">Toutes les communes</option>
              ${communes.map(c => `<option value="${c}">${c} (${communeCounts[c]})</option>`).join('')}
            </select>
          </div>
          <div class="np-filters-group">
            <label class="np-filter-label">État</label>
            <select id="np-f-etat" class="np-filter-select">
              <option value="">Tous les états</option>
              ${etats.map(e => `<option value="${e}">${e}</option>`).join('')}
            </select>
          </div>
          <div class="np-filters-options">
            <label class="np-filter-toggle">
              <input type="checkbox" id="np-f-hide-reseaux" />
              <span>Exclure réseaux</span>
            </label>
          </div>
          <div class="np-filters-actions">
            <button type="button" class="np-filter-reset" id="np-f-reset" style="display:none">
              <i class="fa-solid fa-rotate-left"></i> Réinitialiser
            </button>
          </div>
          <div class="np-filters-badges" id="np-f-badges"></div>
          <div class="np-filters-result">
            <span class="np-filters-result-count" id="np-f-count">${allFeatures.length}</span>
            <span class="np-filters-result-label">chantier(s) correspondant(s)</span>
          </div>
        </div>`;

      const els = {
        nature:  this._level3.querySelector('#np-f-nature'),
        commune: this._level3.querySelector('#np-f-commune'),
        etat:    this._level3.querySelector('#np-f-etat'),
        hideRes: this._level3.querySelector('#np-f-hide-reseaux'),
        resetBtn: this._level3.querySelector('#np-f-reset'),
        badges:  this._level3.querySelector('#np-f-badges'),
        countEl: this._level3.querySelector('#np-f-count'),
      };

      const LAYER = TM.LAYER_NAME || 'travaux';

      const getCriteria = () => {
        const c = {};
        if (els.nature.value)  c.nature_travaux = els.nature.value;
        if (els.commune.value) c.commune = els.commune.value;
        if (els.etat.value)    c.etat = els.etat.value;
        if (els.hideRes.checked) c._hideReseaux = true;
        return c;
      };

      const applyFilters = () => {
        const criteria = getCriteria();
        const filtered = TM.applyStructuralFilter(allFeatures, criteria);

        // Rebuild map layer
        FilterModule.set(LAYER, criteria);
        win.MapModule?.removeLayer(LAYER);
        win.DataModule?.createGeoJsonLayer(LAYER, win.DataModule.layerData[LAYER]);

        // Update count
        els.countEl.textContent = filtered.length;

        // Badges
        TM.renderBadges(els.badges, criteria, els, applyFilters);

        // Reset button visibility
        const hasActive = !!(els.nature.value || els.commune.value || els.etat.value || els.hideRes.checked);
        els.resetBtn.style.display = hasActive ? '' : 'none';
      };

      [els.nature, els.commune, els.etat].forEach(el =>
        el.addEventListener('change', applyFilters)
      );

      els.hideRes.addEventListener('change', () => {
        const saved = els.nature.value;
        els.nature.innerHTML = '<option value="">Toutes les natures</option>' +
          TM.optionsHTML(natures, natureCounts, els.hideRes.checked);
        if (saved && els.nature.querySelector(`option[value="${saved}"]`)) els.nature.value = saved;
        else els.nature.value = '';
        applyFilters();
      });

      els.resetBtn.addEventListener('click', () => {
        els.nature.value = '';
        els.commune.value = '';
        els.etat.value = '';
        els.hideRes.checked = false;
        els.nature.innerHTML = '<option value="">Toutes les natures</option>' + TM.optionsHTML(natures, natureCounts, false);
        applyFilters();
      });

      applyFilters();
    },

    /* ── Administration ──────────────────────────────────────────────── */

    async _buildAdminUI() {
      this._level3.innerHTML =
        `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>`;

      const city = win.getActiveCity?.() ?? win.activeCity;
      if (!city) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Ville non définie</span></div>';
        return;
      }

      let chantiers = [];
      try {
        chantiers = await win.supabaseService?.fetchCityTravaux(city, { adminMode: true }) || [];
      } catch (_) {}

      if (this._currentModule !== 'travaux' || this._currentCategory !== 'travaux-admin') return;

      const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const ETAT_DOT = { Prochain: 'np-dot--upcoming', Ouvert: 'np-dot--active', Terminé: 'np-dot--done' };
      const pending  = chantiers.filter(c => !c.approved);

      let html = '<div class="np-admin">';

      // ── Hero ──
      html += `
        <div class="np-admin-hero">
          <div class="np-admin-hero-count">${chantiers.length}</div>
          <div class="np-admin-hero-label">chantier${chantiers.length !== 1 ? 's' : ''} enregistré${chantiers.length !== 1 ? 's' : ''}</div>
          <button type="button" class="np-admin-add" id="np-admin-add">
            <i class="fa-solid fa-plus"></i> Ajouter un chantier
          </button>
        </div>`;

      // ── Draw panel (shared) ──
      html += this._drawPanelHTML();

      // ── Tabs ──
      if (chantiers.length) {
        html += `
          <div class="np-tabs" role="tablist">
            <button class="np-tab np-tab--active" data-tab="all" role="tab">
              Tous <span class="np-tab-count">${chantiers.length}</span>
            </button>
            <button class="np-tab" data-tab="pending" role="tab">
              En attente <span class="np-tab-count${pending.length ? ' np-tab-count--warn' : ''}">${pending.length}</span>
            </button>
          </div>`;
      }

      // ── List ──
      if (chantiers.length) {
        html += '<div class="np-admin-list" id="np-admin-list">';
        for (const c of chantiers) {
          const dotCls = !c.approved ? 'np-dot--pending' : (ETAT_DOT[c.etat] || '');
          const etatLabel = c.etat || 'Non défini';
          const dates = [c.date_debut, c.date_fin].filter(Boolean).map(d => String(d).slice(0, 10)).join(' → ');
          html += `
            <div class="np-admin-item${!c.approved ? ' np-admin-item--pending' : ''}" data-id="${esc(c.id)}" data-approved="${!!c.approved}">
              <div class="np-admin-item-info">
                <div class="np-admin-item-row">
                  <span class="np-dot ${dotCls}"></span>
                  <span class="np-admin-item-name">${esc(c.name)}</span>
                  ${!c.approved ? '<span class="np-pending-badge"><i class="fa-solid fa-clock"></i> En attente</span>' : ''}
                </div>
                <div class="np-admin-item-meta">
                  <span class="np-admin-item-etat">${esc(etatLabel)}</span>
                  ${dates ? `<span class="np-admin-item-sep">·</span><span>${dates}</span>` : ''}
                </div>
              </div>
              <div class="np-admin-item-actions">
                ${!c.approved ? `<button class="np-admin-action np-admin-action--approve" data-id="${esc(c.id)}" title="Valider"><i class="fa-solid fa-check"></i></button>` : ''}
                <button class="np-admin-action np-admin-action--edit" data-id="${esc(c.id)}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
                <button class="np-admin-action np-admin-action--delete" data-id="${esc(c.id)}" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </div>`;
        }
        html += '</div>';
      }

      html += '</div>';
      this._level3.innerHTML = html;

      // ── Bind: Add ──
      this._level3.querySelector('#np-admin-add')?.addEventListener('click', () => {
        win.TravauxEditorModule?.openEditor();
      });

      // ── Bind: Tabs ──
      const tabs  = this._level3.querySelectorAll('.np-tab');
      const items = this._level3.querySelectorAll('.np-admin-item');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.toggle('np-tab--active', t === tab));
          const filter = tab.dataset.tab;
          items.forEach(item => {
            item.style.display = (filter === 'all' || item.dataset.approved === 'false') ? '' : 'none';
          });
        });
      });

      // ── Bind: Quick approve (inline) ──
      this._level3.querySelectorAll('.np-admin-action--approve').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm('Valider et publier ce chantier ?')) return;
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          try {
            await win.supabaseService?.updateCityTravaux(btn.dataset.id, { approved: true });
            await win.DataModule?.reloadLayer?.('travaux');
            win.Toast?.show('Chantier validé et publié', 'success', 2600);
            this._buildAdminUI();
          } catch (err) {
            console.error('[NavPanel] Approve error:', err);
            win.Toast?.show('Erreur lors de la validation', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
          }
        });
      });

      // ── Bind: Edit + Delete (shared) ──
      this._bindTravauxListActions(this._level3, {
        onDelete: { confirmMsg: 'Supprimer ce chantier ? Cette action est irréversible.', successMsg: 'Chantier supprimé' },
        onRefresh: () => this._buildAdminUI(),
      });

      // ── Auto-refresh ──
      this._bindTravauxSaved('travaux-admin', () => this._buildAdminUI());
    },

    /* ── Vue contributeur : mes propositions ─────────────────────────── */

    async _buildContributorUI() {
      this._level3.innerHTML =
        `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>`;

      const city = win.getActiveCity?.() ?? win.activeCity;
      if (!city) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Ville non définie</span></div>';
        return;
      }

      let allProposals = [];
      try {
        allProposals = await win.supabaseService?.fetchMyTravaux(city) || [];
      } catch (_) {}

      if (this._currentModule !== 'travaux' || this._currentCategory !== 'travaux-propose') return;

      const esc     = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const pending  = allProposals.filter(c => !c.approved);
      const approved = allProposals.filter(c => c.approved);

      let html = '<div class="np-admin">';

      // ── Onboarding (first visit, 0 proposals) ──
      if (!allProposals.length) {
        html += this._drawPanelHTML();
        html += `
          <div class="np-onboarding">
            <div class="np-onboarding-icon"><i class="fa-solid fa-paper-plane"></i></div>
            <h3 class="np-onboarding-title">Proposez un chantier</h3>
            <p class="np-onboarding-desc">Partagez les travaux que vous observez dans votre ville</p>
            <ol class="np-onboarding-steps">
              <li class="np-step">
                <div class="np-step-num">1</div>
                <div class="np-step-text"><strong>Dessinez</strong> — tracez la zone sur la carte</div>
              </li>
              <li class="np-step">
                <div class="np-step-num">2</div>
                <div class="np-step-text"><strong>Décrivez</strong> — remplissez les informations</div>
              </li>
              <li class="np-step">
                <div class="np-step-num">3</div>
                <div class="np-step-text"><strong>Soumis !</strong> — un admin valide et publie</div>
              </li>
            </ol>
            <button type="button" class="np-admin-add" id="np-contrib-add">
              <i class="fa-solid fa-plus"></i> Proposer mon premier chantier
            </button>
          </div>`;
        html += '</div>';
        this._level3.innerHTML = html;
        this._level3.querySelector('#np-contrib-add')?.addEventListener('click', () => {
          win.TravauxEditorModule?.openEditor();
        });
        this._bindTravauxSaved('travaux-propose', () => this._buildContributorUI());
        return;
      }

      // ── Hero ──
      html += `
        <div class="np-admin-hero">
          <div class="np-admin-hero-count">${allProposals.length}</div>
          <div class="np-admin-hero-label">proposition${allProposals.length !== 1 ? 's' : ''}</div>
          <button type="button" class="np-admin-add" id="np-contrib-add">
            <i class="fa-solid fa-plus"></i> Proposer un chantier
          </button>
        </div>`;

      // ── Draw panel (shared) ──
      html += this._drawPanelHTML();

      // ── Tabs ──
      html += `
        <div class="np-tabs" role="tablist">
          <button class="np-tab np-tab--active" data-tab="pending" role="tab">
            En attente <span class="np-tab-count${pending.length ? ' np-tab-count--warn' : ''}">${pending.length}</span>
          </button>
          <button class="np-tab" data-tab="approved" role="tab">
            Publiées <span class="np-tab-count${approved.length ? ' np-tab-count--ok' : ''}">${approved.length}</span>
          </button>
        </div>`;

      // ── List ──
      if (allProposals.length) {
        html += '<div class="np-admin-list" id="np-contrib-list">';
        for (const c of allProposals) {
          const isPending = !c.approved;
          const dates = [c.date_debut, c.date_fin].filter(Boolean).map(d => String(d).slice(0, 10)).join(' → ');
          html += `
            <div class="np-admin-item${isPending ? ' np-admin-item--pending' : ''}" data-id="${esc(c.id)}" data-approved="${!!c.approved}">
              <div class="np-admin-item-info">
                <div class="np-admin-item-row">
                  <span class="np-dot ${isPending ? 'np-dot--pending' : 'np-dot--done'}"></span>
                  <span class="np-admin-item-name">${esc(c.name)}</span>
                </div>
                <div class="np-admin-item-meta">
                  ${isPending
                    ? '<span class="np-pending-badge"><i class="fa-solid fa-clock"></i> En attente</span>'
                    : '<span class="np-approved-badge"><i class="fa-solid fa-check"></i> Publié</span>'}
                  ${dates ? `<span class="np-admin-item-sep">·</span><span>${dates}</span>` : ''}
                </div>
              </div>
              ${isPending ? `
              <div class="np-admin-item-actions">
                <button class="np-admin-action np-admin-action--edit" data-id="${esc(c.id)}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
                <button class="np-admin-action np-admin-action--delete" data-id="${esc(c.id)}" title="Retirer"><i class="fa-solid fa-trash-can"></i></button>
              </div>` : ''}
            </div>`;
        }
        html += '</div>';
      }

      html += '</div>';
      this._level3.innerHTML = html;

      // ── Bind: Add ──
      this._level3.querySelector('#np-contrib-add')?.addEventListener('click', () => {
        win.TravauxEditorModule?.openEditor();
      });

      // ── Bind: Tabs ──
      const tabs  = this._level3.querySelectorAll('.np-tab');
      const items = this._level3.querySelectorAll('.np-admin-item');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.toggle('np-tab--active', t === tab));
          const filter = tab.dataset.tab;
          items.forEach(item => {
            const isApproved = item.dataset.approved === 'true';
            item.style.display = (filter === 'pending' ? !isApproved : isApproved) ? '' : 'none';
          });
        });
      });
      // Default: show pending only
      items.forEach(item => {
        if (item.dataset.approved === 'true') item.style.display = 'none';
      });

      // ── Bind: Edit + Delete (shared) ──
      this._bindTravauxListActions(this._level3, {
        onDelete: { confirmMsg: 'Retirer cette proposition ? Elle sera définitivement supprimée.', successMsg: 'Proposition retirée' },
        onRefresh: () => this._buildContributorUI(),
      });

      // ── Auto-refresh ──
      this._bindTravauxSaved('travaux-propose', () => this._buildContributorUI());
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  PROJECT CARD BUILDER                                                */
    /* ──────────────────────────────────────────────────────────────────── */

    _createProjectCard(project, category, color) {
      const HOVER_PAN_DELAY = 400; // ms d'intention avant de déplacer la caméra

      const categoryIcon = win.categoryIcons?.find(c => c.category === category);
      let iconClass = categoryIcon?.icon_class || 'fa-layer-group';
      if (iconClass && !/^fa-(solid|regular|brands)/.test(iconClass)) {
        iconClass = `fa-solid ${iconClass}`;
      }

      let categoryColor = color || null;
      if (!categoryColor && categoryIcon?.category_styles) {
        try {
          const styles = typeof categoryIcon.category_styles === 'string'
            ? JSON.parse(categoryIcon.category_styles) : categoryIcon.category_styles;
          categoryColor = styles.color || styles.fillColor;
        } catch (_) {}
      }

      const li = document.createElement('li');
      li.classList.add('project-card');
      li.dataset.project = project.project_name;
      if (categoryColor) li.style.setProperty('--card-accent', categoryColor);

      const hasCover = !!(project.cover_url);
      const colorBg = categoryColor || 'var(--primary)';

      const heroHTML = hasCover
        ? `<div class="card-hero"><img src="${project.cover_url}" alt="" loading="lazy"/><div class="card-hero-grad"></div></div>`
        : `<div class="card-hero card-hero--icon" style="background:linear-gradient(135deg, ${colorBg}22 0%, ${colorBg}08 100%)"><i class="${iconClass}" style="color:${colorBg}"></i><div class="card-hero-grad"></div></div>`;

      const name = project.project_name || 'Projet sans nom';

      li.innerHTML = `
        ${heroHTML}
        <div class="card-body">
          <span class="card-title">${name}</span>
          <span class="card-arrow"><i class="fa-solid fa-arrow-right"></i></span>
        </div>
      `;

      // Click → open detail
      let focusTimer = null;
      li.addEventListener('click', () => {
        // Cancel any pending hover-triggered pan to avoid racing with showProjectDetail's own fitBounds
        if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
        win.NavigationModule?.showProjectDetail(project.project_name, category);
      });

      // Hover → highlight visuel immédiat, caméra après délai d'intention
      li.addEventListener('mouseenter', () => {
        win.NavigationModule?.highlightProjectOnMap(project.project_name, category, { fadeOthers: true });
        focusTimer = setTimeout(() => {
          win.NavigationModule?.panToProject(project.project_name, category);
        }, HOVER_PAN_DELAY);
      });

      li.addEventListener('mouseleave', () => {
        if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
        const detailPanel = document.getElementById('project-detail');
        if (!detailPanel || detailPanel.style.display !== 'block') {
          win.NavigationModule?.clearProjectHighlight();
        }
      });

      return li;
    },

    /* ──────────────────────────────────────────────────────────────────── */
    /*  LAYER MANAGEMENT                                                   */
    /* ──────────────────────────────────────────────────────────────────── */

    _loadCategoryGeneration: 0,

    async _loadCategoryLayers(category) {
      const generation = ++this._loadCategoryGeneration;
      const layersMap = win.categoryLayersMap || {};
      const layersToDisplay = layersMap[category] || [category];
      const travauxLayerSet = new Set(layersMap['travaux'] || ['travaux']);

      // Close project detail if open
      const detailPanel = document.getElementById('project-detail');
      if (detailPanel) detailPanel.style.display = 'none';
      win.NavigationModule?._resetProjectGuard?.();

      win.FilterModule?.resetAll?.();

      // Remove all layers except travaux + target layers
      const keep = new Set([...travauxLayerSet, ...layersToDisplay]);
      win.MapModule?.removeAllLayers?.(keep);

      // Preload uncached data in parallel
      const uncached = layersToDisplay.filter(n => !win.DataModule?.layerData?.[n]);
      if (uncached.length > 0) {
        await Promise.all(uncached.map(n => win.DataModule?.preloadLayer?.(n)?.catch(() => {})));
      }

      // Guard: abort if the user switched module OR category during async fetch
      if (this._currentModule !== 'carte' || generation !== this._loadCategoryGeneration) return;

      // Create layers from cache
      for (const name of layersToDisplay) {
        if (win.DataModule?.layerData?.[name]) {
          try { win.DataModule.createGeoJsonLayer(name, win.DataModule.layerData[name]); } catch (_) {}
        }
      }
    },

    async _loadTravauxLayers() {
      const layersMap = win.categoryLayersMap || {};
      const travauxLayers = layersMap['travaux'] || ['travaux'];

      // Fast path: already loaded and still visible on map
      if (this._travauxLayersLoaded && !this._travauxLoadPromise) {
        const hasLayerOnMap = travauxLayers.some(name => !!win.MapModule?.layers?.[name]);
        if (hasLayerOnMap) return;
        // Layers were removed (e.g. goBack cleaned them) — need to recreate
        this._travauxLayersLoaded = false;
      }

      // De-duplicate concurrent calls
      if (this._travauxLoadPromise) {
        await this._travauxLoadPromise;
        // After awaiting, verify layers actually got created (first call may have been aborted)
        const hasLayerOnMap = travauxLayers.some(name => !!win.MapModule?.layers?.[name]);
        if (hasLayerOnMap) return;
        // Fall through to create layers again
      }

      const doLoad = async () => {
        const uncached = travauxLayers.filter(n => !win.DataModule?.layerData?.[n]);
        if (uncached.length > 0) {
          await Promise.all(uncached.map(n => win.DataModule?.preloadLayer?.(n)?.catch(() => {})));
        }

        if (this._currentModule !== 'travaux') return;

        for (const name of travauxLayers) {
          if (win.DataModule?.layerData?.[name]) {
            try { win.DataModule.createGeoJsonLayer(name, win.DataModule.layerData[name]); } catch (_) {}
          }
        }
      };

      this._travauxLoadPromise = doLoad();
      try {
        await this._travauxLoadPromise;
        if (this._currentModule === 'travaux') {
          this._travauxLayersLoaded = true;
        }
      } finally {
        this._travauxLoadPromise = null;
      }
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
      const modLabel = this._currentModule === 'carte' ? 'Carte' : 'Travaux';
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
