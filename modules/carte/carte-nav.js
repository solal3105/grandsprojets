// modules/carte/carte-nav.js
// Carte module — Level 2/3 renderers for NavPanel
// Registers itself with NavPanel.registerModule('carte', ...)

;(function(win) {
  'use strict';

  const HOVER_PAN_DELAY = 400;

  let _loadCategoryGeneration = 0;

  /* ── Level 2: catégories ──────────────────────────────────────── */

  function renderL2(panel) {
    const categoryIcons = win.categoryIcons || [];
    if (!categoryIcons.length) {
      panel._level2.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-map"></i><span>Aucune catégorie disponible</span></div>';
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

    panel._level2.innerHTML = html;

    panel._level2.querySelectorAll('.nav-panel__item[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        const color = btn.style.getPropertyValue('--item-color');
        const label = btn.querySelector('.nav-panel__item-label')?.textContent || cat;

        panel._level2.querySelectorAll('.nav-panel__item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        _loadCategoryLayers(cat);
        panel.openLevel3(cat, { label, color });
      });
    });
  }

  /* ── Level 3: projets d'une catégorie ─────────────────────────── */

  async function renderL3(panel, category, opts) {
    let projectList = panel._level3.querySelector('.project-list');
    if (!projectList) {
      panel._level3.innerHTML = '<ul class="project-list"></ul>';
      projectList = panel._level3.querySelector('.project-list');
      if (!projectList) return;
    }

    try {
      const projects = await win.supabaseService?.fetchProjectsByCategory(category);

      if (panel._currentModule !== 'carte') return;

      if (!projects?.length) {
        panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-folder-open"></i><span>Aucun projet disponible</span></div>';
        return;
      }

      projectList.innerHTML = '';

      projects.sort((a, b) => {
        const nameA = (a.project_name || '').toString();
        const nameB = (b.project_name || '').toString();
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
      });

      projects.forEach(project => {
        const card = _createProjectCard(project, category, opts.color);
        projectList.appendChild(card);
      });

    } catch (error) {
      console.error('[CarteNav] Error rendering projects:', error);
      panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Erreur de chargement</span></div>';
    }
  }

  /* ── goBack ────────────────────────────────────────────────────── */

  function onBack(panel) {
    renderL2(panel);
    panel._restoreDefaultLayers(panel._travauxLayersLoaded);
  }

  /* ── Carte projet ──────────────────────────────────────────────── */

  function _createProjectCard(project, category, color) {
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
    li.dataset.project = project.id;
    if (categoryColor) li.style.setProperty('--card-accent', categoryColor);

    const hasCover = !!(project.cover_url);
    const colorBg = categoryColor || 'var(--primary)';

    const _esc = win.SecurityUtils ? win.SecurityUtils.escapeHtml : (s => String(s || ''));
    const heroHTML = hasCover
      ? `<div class="card-hero"><img src="${_esc(project.cover_url)}" alt="" loading="lazy"/><div class="card-hero-grad"></div></div>`
      : `<div class="card-hero card-hero--icon" style="background:linear-gradient(135deg, ${colorBg}22 0%, ${colorBg}08 100%)"><i class="${iconClass}" style="color:${colorBg}"></i><div class="card-hero-grad"></div></div>`;

    const name = _esc(project.project_name || 'Projet sans nom');

    li.innerHTML = `
      ${heroHTML}
      <div class="card-body">
        <span class="card-title">${name}</span>
        <span class="card-arrow"><i class="fa-solid fa-arrow-right"></i></span>
      </div>
    `;

    let focusTimer = null;
    li.addEventListener('click', () => {
      if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
      win.NavigationModule?.showProjectDetailById(project.id);
    });

    li.addEventListener('mouseenter', () => {
      win.NavigationModule?.highlightProjectOnMap?.(project.project_name, category, { fadeOthers: true });
      focusTimer = setTimeout(() => {
        win.NavigationModule?.panToProject?.(project.project_name, category);
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
  }

  /* ── Layer management ──────────────────────────────────────────── */

  async function _loadCategoryLayers(category) {
    const generation = ++_loadCategoryGeneration;
    const layersMap = win.categoryLayersMap || {};
    const layersToDisplay = layersMap[category] || [category];
    const travauxLayerSet = new Set(layersMap['travaux'] || ['travaux']);

    const detailPanel = document.getElementById('project-detail');
    if (detailPanel) detailPanel.style.display = 'none';
    win.NavigationModule?._resetProjectGuard?.();

    win.FilterModule?.resetAll?.();

    const keep = new Set([...travauxLayerSet, ...layersToDisplay]);
    win.MapModule?.removeAllLayers?.(keep);

    const uncached = layersToDisplay.filter(n => !win.DataModule?.layerData?.[n]);
    if (uncached.length > 0) {
      await Promise.all(uncached.map(n => win.DataModule?.preloadLayer?.(n)?.catch(() => {})));
    }

    if (win.NavPanel?._currentModule !== 'carte' || generation !== _loadCategoryGeneration) return;

    for (const name of layersToDisplay) {
      if (win.DataModule?.layerData?.[name]) {
        try { win.DataModule.createGeoJsonLayer(name, win.DataModule.layerData[name]); } catch (_) {}
      }
    }
  }

  /* ── Registration ──────────────────────────────────────────────── */

  function register() {
    if (!win.NavPanel?.registerModule) return;
    win.NavPanel.registerModule('carte', {
      label: 'Carte',
      clearLayers: false,
      renderL2: renderL2,
      renderL3: renderL3,
      onBack: onBack,
      onClose: null,
      skeletonL3: () => win.NavPanel._skeletonL3Cards(5),
    });
  }

  // Auto-register si NavPanel est déjà chargé, sinon sera appelé par main.js
  win.CarteNav = { register };

})(window);
