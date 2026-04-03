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
    _navToken: 0,           // bumped on every navigation action; lets in-flight renders detect staleness
    _sidebar: null,
    _resizeObserver: null,

    // INIT

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
        this._collapseBtn.addEventListener('click', () => {
          // At level 3 carte: collapse first (clears panel padding), then fit
          // bounds — order matters because collapse() resets the map's internal
          // padding via _updateMapPadding(false), which would cancel any
          // fitBounds animation launched before it.
          if (this._level === 3 && this._currentModule === 'carte' && this._currentCategory) {
            const cat = this._currentCategory;
            this.collapse();
            win.NavigationModule?.fitCategoryBounds?.(cat);
            return;
          }
          this.collapse();
        });
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

    // PUBLIC API

    /**
     * Open panel at Level 2 for a module
     * @param {'carte'|'travaux'} mod
     */
    openModule(mod) {
      if (!this._panel) return;

      this._navToken++;   // cancel any in-flight level 3 render
      this._collapsed = false;
      this._panel.classList.remove('collapsed');

      const prevModule = this._currentModule;
      this._currentModule = mod;
      this._currentCategory = null;
      this._panel.setAttribute('data-module', mod);
      this._setLevel(2);
      // Reset immediately so no stale category label/color bleeds into the new module
      this._updateCollapseButton(null, false);

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

      this._navToken++;                       // cancel any previous in-flight render
      const navToken = this._navToken;        // capture for this render's lifetime

      this._currentCategory = category;
      this._setLevel(3);

      const label = opts.label || category;
      this._headerTitle.textContent = label;
      this._updateBreadcrumb(label);
      // For travaux the collapse button always says "Travaux", not the sub-section name.
      // For carte it reflects the category (label + category color).
      if (this._currentModule === 'travaux') {
        const travauxColor = win._travauxConfig?.color || 'var(--color-warning)';
        this._updateCollapseButton('Travaux', true, travauxColor);
      } else {
        this._updateCollapseButton(label, true, opts.color || null);
      }

      // Show a contextual skeleton immediately (appropriate shape per module)
      if (this._currentModule === 'carte') {
        this._level3.innerHTML = this._skeletonL3Cards(5);
      } else {
        this._level3.innerHTML =
          `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>` +
          this._skeletonL2Items(2);
      }

      if (this._currentModule === 'carte') {
        await this._renderCarteLevel3(category, opts, navToken);
      } else if (this._currentModule === 'travaux') {
        await this._renderTravauxLevel3(category, opts, navToken);
      }
    },

    /**
     * Go back from Level 3 to Level 2
     */
    goBack() {
      if (this._level !== 3) return;

      this._navToken++;   // cancel any in-flight level 3 render
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

      this._navToken++;   // cancel any in-flight level 3 render
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
     * @param {string|null} categoryLabel - category label to show, or null to reset
     * @param {boolean} colored - whether to apply category color
     * @param {string|null} [color] - explicit CSS color for the button background
     */
    _updateCollapseButton(categoryLabel, colored, color = null) {
      if (!this._collapseBtn) return;
      const span = this._collapseBtn.querySelector('.nav-panel__collapse-text') ||
                   (() => {
                     const s = document.createElement('span');
                     s.className = 'nav-panel__collapse-text';
                     this._collapseBtn.appendChild(s);
                     return s;
                   })();

      span.textContent = categoryLabel ? `Voir la carte · ${categoryLabel}` : 'Voir la carte';

      if (colored) {
        this._collapseBtn.classList.add('nav-panel__collapse--city');
        // Propagate category color to the panel root so .nav-panel__back
        // at level 3 can inherit it via CSS var(--cat-color).
        this._panel?.style.setProperty('--cat-color', color || '');
        this._collapseBtn.style.setProperty('--cat-color', color || '');
      } else {
        this._collapseBtn.classList.remove('nav-panel__collapse--city');
        this._panel?.style.removeProperty('--cat-color');
        this._collapseBtn.style.removeProperty('--cat-color');
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
      const sync = () => this._syncTaller();
      this._resizeObserver = new ResizeObserver(sync);
      this._resizeObserver.observe(this._sidebar);
      this._resizeObserver.observe(this._panel);
      window.addEventListener('resize', sync, { passive: true });
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

    // LEVEL 2 RENDERERS

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
          } catch (e) { console.debug('[nav-panel] parse category_styles failed:', e); }
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

          // Load layers for this category (delegates to NavigationModule — single source of truth)
          win.NavigationModule?.showCategoryLayers?.(cat, { skipFitBounds: true, preserveTravaux: true });

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

      // Now that the color is resolved and we're confirmed in travaux, set the
      // collapse button to "Voir la carte · Travaux" (resets any stale state).
      this._updateCollapseButton('Travaux', true, color);

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

    },

    // LEVEL 3 RENDERERS

    async _renderCarteLevel3(category, opts, navToken) {
      // Reuse the skeleton project-list already rendered by openLevel3 if possible
      let projectList = this._level3.querySelector('.project-list');
      if (!projectList) {
        this._level3.innerHTML = '<ul class="project-list"></ul>';
        projectList = this._level3.querySelector('.project-list');
        if (!projectList) return;
      }

      try {
        const projects = await win.supabaseService?.fetchProjectsByCategory(category);

        // Guard: abort if user navigated away during the async fetch
        if (navToken !== this._navToken) return;

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

    async _renderTravauxLevel3(section, opts, navToken) {
      // Load travaux layers
      await this._loadTravauxLayers();

      // Guard: abort if user navigated away during the async load
      if (navToken !== this._navToken) return;

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
        try { await win.DataModule?.loadLayer(LAYER); } catch (e) { console.warn('[nav-panel] loadLayer failed:', e); }
        // Re-guard after second async
        if (navToken !== this._navToken) return;
      }

      const allFeatures = win.DataModule?.layerData?.[LAYER]?.features || [];
      if (!allFeatures.length) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-hard-hat"></i><span>Aucun chantier à afficher</span></div>';
        return;
      }

      TM.enrichTimestamps(allFeatures);

      const container = this._level3;

      if (section === 'travaux-timeline') {
        win.TravauxViews.buildTimeline(container, allFeatures, TM);
      } else if (section === 'travaux-filters') {
        win.TravauxViews.buildFilters(container, allFeatures, TM);
      }
    },

    // PROJECT CARD BUILDER

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
        } catch (e) { console.debug('[nav-panel] parse category_styles failed:', e); }
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

    // LAYER MANAGEMENT

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
            try { win.DataModule.createGeoJsonLayer(name, win.DataModule.layerData[name]); } catch (e) { console.warn('[nav-panel] createGeoJsonLayer failed:', e); }
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

    // Skeleton / loading helpers

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
      // Clear persisted MapLibre filter (e.g. timeline expression) so it doesn't
      // leak into newly created layers via _applyFilterToPool.
      const mlMap = win.MapModule?.map?._mlMap || win.MapModule?.map;
      if (mlMap && win.L?._sourcePool) win.L._sourcePool.clearFilter(mlMap);
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

    // UI HELPERS

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
      // Keeps MapLibre's persistent internal padding in sync with the nav panel
      // so the map's visual centre stays in the visible area during idle browsing.
      // Uses live DOM dimensions — no hardcoded widths/heights to maintain.
      try {
        const mlMap = win.MapModule?.map?._mlMap;
        if (!mlMap || typeof mlMap.easeTo !== 'function') return;
        const isMobile = window.innerWidth <= 720;
        if (isMobile) {
          const panelH = open ? (this._panel?.offsetHeight || 0) : 0;
          mlMap.easeTo({ padding: { top: 0, right: 0, bottom: panelH, left: 0 }, duration: 300 });
        } else {
          const sidebarW = 78 + 14; // matches _computeMapPadding constant
          const panelW   = open ? (this._panel?.offsetWidth || 0) : 0;
          mlMap.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: sidebarW + panelW }, duration: 300 });
        }
      } catch (e) { console.debug('[nav-panel] updateMapPadding failed:', e); }
    }
  };

  win.NavPanel = NavPanel;

})(window);
