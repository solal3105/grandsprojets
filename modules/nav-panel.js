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
      this._breadcrumb = this._panel.querySelector('.nav-panel__breadcrumb');
      this._level2 = this._panel.querySelector('.nav-panel__level2');
      this._level3 = this._panel.querySelector('.nav-panel__level3');

      this._bindEvents();
    },

    _bindEvents() {
      if (this._closeBtn) {
        this._closeBtn.addEventListener('click', () => this.close());
      }
      if (this._backBtn) {
        this._backBtn.addEventListener('click', () => this.goBack());
      }
      if (this._scrim) {
        this._scrim.addEventListener('click', () => this.close());
      }

      // Escape to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._level > 0) {
          if (this._level === 3) this.goBack();
          else this.close();
        }
      });
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

      // If same module and already open at level 2, close instead (toggle)
      if (this._currentModule === mod && this._level === 2) {
        this.close();
        return;
      }

      this._currentModule = mod;
      this._currentCategory = null;
      this._setLevel(2);

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

      // Clear level 3
      this._level3.innerHTML = '<div class="nav-panel__loading"><i class="fas fa-circle-notch"></i> Chargement…</div>';

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

      const modLabel = this._currentModule === 'carte' ? 'Carte' : 'Travaux';
      this._headerTitle.textContent = modLabel;

      // Re-render level 2 (items already built, just show)
      if (this._currentModule === 'carte') {
        this._renderCarteLevel2();
        // Restore default layers when going back
        this._restoreDefaultLayers();
      } else {
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

      this._panel.classList.remove('open');
      if (this._scrim) this._scrim.classList.remove('visible');

      this._level = 0;
      this._currentModule = null;
      this._currentCategory = null;

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
     * Get current state
     */
    getState() {
      return {
        level: this._level,
        module: this._currentModule,
        category: this._currentCategory
      };
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

      // Load travaux layers immediately when opening the module
      await this._loadTravauxLayers();

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

    /* ──────────────────────────────────────────────────────────────────── */
    /*  LEVEL 3 RENDERERS                                                  */
    /* ──────────────────────────────────────────────────────────────────── */

    async _renderCarteLevel3(category, opts) {
      // Create submenu-like container for project rendering
      this._level3.innerHTML = '<ul class="project-list"></ul>';

      const projectList = this._level3.querySelector('.project-list');
      if (!projectList) return;

      try {
        const projects = await win.supabaseService?.fetchProjectsByCategory(category);

        if (!projects?.length) {
          this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-folder-open"></i><span>Aucun projet disponible</span></div>';
          return;
        }

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

      // Load data
      const TM = win.TravauxModule;
      if (!TM) {
        this._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Module Travaux indisponible</span></div>';
        return;
      }

      const LAYER = TM.LAYER_NAME || 'travaux';
      const hasData = win.DataModule?.layerData?.[LAYER]?.features?.length > 0;
      if (!hasData) {
        this._level3.innerHTML = '<div class="nav-panel__loading"><i class="fas fa-circle-notch"></i> Chargement…</div>';
        try { await win.DataModule?.loadLayer(LAYER); } catch (_) {}
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

    /* ──────────────────────────────────────────────────────────────────── */
    /*  PROJECT CARD BUILDER                                                */
    /* ──────────────────────────────────────────────────────────────────── */

    _createProjectCard(project, category, color) {
      const FOCUS_DELAY = 800;

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
      li.addEventListener('click', () => {
        win.NavigationModule?.showProjectDetail(project.project_name, category);
      });

      // Hover → highlight on map
      let focusTimer = null;
      li.addEventListener('mouseenter', () => {
        win.NavigationModule?.highlightProjectOnMap(project.project_name, category, { panTo: false, fadeOthers: true });
        focusTimer = setTimeout(() => {
          li.classList.add('focusing');
          win.NavigationModule?.highlightProjectOnMap(project.project_name, category, { panTo: true, fadeOthers: true });
        }, FOCUS_DELAY);
      });

      li.addEventListener('mouseleave', () => {
        if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
        li.classList.remove('focusing');
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

    async _loadCategoryLayers(category) {
      const layersMap = win.categoryLayersMap || {};
      const layersToDisplay = layersMap[category] || [category];

      // handleNavigation skips submenu rendering when NavPanel.isOpen()
      if (win.EventBindings?.handleNavigation) {
        await win.EventBindings.handleNavigation(category, layersToDisplay);
      }
    },

    async _loadTravauxLayers() {
      const layersMap = win.categoryLayersMap || {};
      const travauxLayers = layersMap['travaux'] || ['travaux'];

      if (win.EventBindings?.handleNavigation) {
        await win.EventBindings.handleNavigation('travaux', travauxLayers);
      }
    },

    _restoreDefaultLayers() {
      // Vider la carte
      if (win.MapModule?.layers) {
        Object.keys(win.MapModule.layers).forEach(l => {
          try { win.MapModule.removeLayer(l); } catch (_) {}
        });
      }

      FilterModule.resetAll();

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
