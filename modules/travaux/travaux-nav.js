// modules/travaux/travaux-nav.js
// Travaux module — Level 2/3 renderers for NavPanel
// Registers itself with NavPanel.registerModule('travaux', ...)

;(function(win) {
  'use strict';

  let _travauxLoadPromise = null;
  let _onTravauxSaved = null;

  /** Derive travaux config from city_modules (single source of truth) */
  function _getTravauxConfig() {
    const mod = (win._cityModules || []).find(m => m.module_key === 'travaux');
    if (!mod) return {};
    const cfg = mod.config || {};
    return {
      enabled: mod.enabled,
      icon_class: mod.icon_class,
      source_type: cfg.source_type || 'city_travaux',
      url: cfg.url || null,
      color: cfg.color || '#FF6B35',
    };
  }

  /* ── Level 2: sections travaux ────────────────────────────────── */

  async function renderL2(panel) {
    const travauxConfig = _getTravauxConfig();
    const color = travauxConfig.color || 'var(--color-warning)';

    panel._level2.innerHTML =
      `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>` +
      panel._skeletonL2Items(2);

    await _loadTravauxLayers(panel);

    if (panel._currentModule !== 'travaux') return;

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

    if (win.__CONTRIB_IS_ADMIN && travauxConfig.source_type === 'city_travaux') {
      sections.push({
        id: 'travaux-admin',
        icon: 'fa-solid fa-screwdriver-wrench',
        label: 'Administrer',
        desc: 'Ajouter, modifier, supprimer'
      });
    }

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

    panel._level2.innerHTML = html;

    panel._level2.querySelectorAll('.nav-panel__item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        const label = btn.querySelector('.nav-panel__item-label')?.textContent || section;

        panel._level2.querySelectorAll('.nav-panel__item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        panel.openLevel3(section, { label, color });
      });
    });

    // Inject async pending badge on admin button (non-blocking)
    if (win.__CONTRIB_IS_ADMIN && travauxConfig.source_type === 'city_travaux') {
      _injectPendingBadge(panel, city);
    }
  }

  /* ── Level 3: section-specific renderer ──────────────────────── */

  async function renderL3(panel, section, opts) {
    await _loadTravauxLayers(panel);

    if (panel._currentModule !== 'travaux') return;

    const TM = win.TravauxModule;
    if (!TM) {
      panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Module Travaux indisponible</span></div>';
      return;
    }

    const LAYER = TM.LAYER_NAME || 'travaux';
    const hasData = win.DataModule?.layerData?.[LAYER]?.features?.length > 0;
    if (!hasData) {
      try { await win.DataModule?.loadLayer(LAYER); } catch (_) {}
      if (panel._currentModule !== 'travaux') return;
    }

    const allFeatures = win.DataModule?.layerData?.[LAYER]?.features || [];
    if (!allFeatures.length) {
      panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-hard-hat"></i><span>Aucun chantier à afficher</span></div>';
      return;
    }

    TM.enrichTimestamps(allFeatures);

    if (section === 'travaux-timeline') {
      _buildTimelineUI(panel, allFeatures, TM);
    } else if (section === 'travaux-filters') {
      _buildFiltersUI(panel, allFeatures, TM);
    } else if (section === 'travaux-admin') {
      _buildAdminUI(panel);
    } else if (section === 'travaux-propose') {
      _buildContributorUI(panel);
    }
  }

  /* ── goBack ────────────────────────────────────────────────────── */

  function onBack(panel) {
    // Stop active drawing session if any
    if (win.TravauxEditorModule?.isDrawing?.()) {
      win.TravauxEditorModule.stopDrawing();
    }
    // Clean up admin save listener
    if (_onTravauxSaved) {
      win.removeEventListener('travaux:saved', _onTravauxSaved);
      _onTravauxSaved = null;
    }
    renderL2(panel);
    // Reset travaux filters and timeline when going back to L2
    win.FilterModule?.resetAll?.();
    if (win.TravauxModule?.setMapTimelineFilter) {
      win.TravauxModule.setMapTimelineFilter(Date.now());
    }
  }

  /* ── onClose ───────────────────────────────────────────────────── */

  function onClose() {
    if (win.TravauxEditorModule?.isDrawing?.()) {
      win.TravauxEditorModule.stopDrawing();
    }
    if (_onTravauxSaved) {
      win.removeEventListener('travaux:saved', _onTravauxSaved);
      _onTravauxSaved = null;
    }
  }

  /* ── Timeline ──────────────────────────────────────────────────── */

  function _buildTimelineUI(panel, allFeatures, TM) {
    if (win.TravauxViews?.buildTimeline) {
      win.TravauxViews.buildTimeline(panel._level3, allFeatures, TM);
    }
  }

  /* ── Filtres ───────────────────────────────────────────────────── */

  function _buildFiltersUI(panel, allFeatures, TM) {
    if (win.TravauxViews?.buildFilters) {
      win.TravauxViews.buildFilters(panel._level3, allFeatures, TM);
    }
  }

  /* ── Admin ─────────────────────────────────────────────────────── */

  function _buildAdminUI(panel) {
    if (!win.TravauxViews?.buildAdmin) {
      panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Module Admin indisponible</span></div>';
      return;
    }
    win.TravauxViews.buildAdmin(panel._level3, {
      isStale: () => panel._currentModule !== 'travaux' || panel._currentCategory !== 'travaux-admin',
      onSaved: (refreshFn) => _bindTravauxSaved('travaux-admin', refreshFn, panel),
    });
  }

  /* ── Contributeur ──────────────────────────────────────────────── */

  function _buildContributorUI(panel) {
    if (!win.TravauxViews?.buildContributor) {
      panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Module Contributeur indisponible</span></div>';
      return;
    }
    win.TravauxViews.buildContributor(panel._level3, {
      isStale: () => panel._currentModule !== 'travaux' || panel._currentCategory !== 'travaux-propose',
      onSaved: (refreshFn) => _bindTravauxSaved('travaux-propose', refreshFn, panel),
    });
  }

  /* ── Helpers ─────────────────────────────────────────────────────── */

  function _bindTravauxSaved(expectedCategory, refreshFn, panel) {
    if (_onTravauxSaved) win.removeEventListener('travaux:saved', _onTravauxSaved);
    _onTravauxSaved = () => {
      if (panel._currentCategory === expectedCategory) refreshFn();
    };
    win.addEventListener('travaux:saved', _onTravauxSaved);
  }

  async function _injectPendingBadge(panel, city) {
    try {
      const all = await win.supabaseService?.fetchCityTravaux(city, { adminMode: true }) || [];
      const pending = all.filter(c => !c.approved);
      if (!pending.length) return;
      const btn = panel._level2.querySelector('[data-section="travaux-admin"]');
      if (!btn) return;
      const arrow = btn.querySelector('.nav-panel__item-arrow');
      if (arrow && !btn.querySelector('.np-l2-badge')) {
        arrow.insertAdjacentHTML('beforebegin', `<span class="np-l2-badge">${pending.length}</span>`);
      }
    } catch (_) {}
  }

  /* ── Layer management ──────────────────────────────────────────── */

  async function _loadTravauxLayers(panel) {
    const layersMap = win.categoryLayersMap || {};
    const travauxLayers = layersMap['travaux'] || ['travaux'];

    if (panel._travauxLayersLoaded && !_travauxLoadPromise) {
      const hasLayerOnMap = travauxLayers.some(name => !!win.MapModule?.layers?.[name]);
      if (hasLayerOnMap) return;
      panel._travauxLayersLoaded = false;
    }

    if (_travauxLoadPromise) {
      await _travauxLoadPromise;
      const hasLayerOnMap = travauxLayers.some(name => !!win.MapModule?.layers?.[name]);
      if (hasLayerOnMap) return;
    }

    const doLoad = async () => {
      const uncached = travauxLayers.filter(n => !win.DataModule?.layerData?.[n]);
      if (uncached.length > 0) {
        await Promise.all(uncached.map(n => win.DataModule?.preloadLayer?.(n)?.catch(() => {})));
      }

      if (panel._currentModule !== 'travaux') return;

      for (const name of travauxLayers) {
        if (win.DataModule?.layerData?.[name]) {
          try { win.DataModule.createGeoJsonLayer(name, win.DataModule.layerData[name]); } catch (_) {}
        }
      }
    };

    _travauxLoadPromise = doLoad();
    try {
      await _travauxLoadPromise;
      if (panel._currentModule === 'travaux') {
        panel._travauxLayersLoaded = true;
      }
    } finally {
      _travauxLoadPromise = null;
    }
  }

  /* ── Registration ──────────────────────────────────────────────── */

  function register() {
    if (!win.NavPanel?.registerModule) return;
    win.NavPanel.registerModule('travaux', {
      label: 'Travaux',
      clearLayers: true,
      renderL2: renderL2,
      renderL3: renderL3,
      onBack: onBack,
      onClose: onClose,
      skeletonL3: () =>
        `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>` +
        win.NavPanel._skeletonL2Items(2),
    });
  }

  // Expose for explicit registration from main.js
  win.TravauxNav = { register };

})(window);
