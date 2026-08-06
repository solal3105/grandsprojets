// modules/participer/participer-nav.js
// Module Participer - renderers de niveaux 2/3 pour NavPanel.
// S'enregistre via NavPanel.registerModule('participer', ...) depuis main.js
// Phase 5. Les vues elles-mêmes vivent dans participer-views.js.

;(function(win) {
  'use strict';

  function _getModuleRow() {
    return (win._cityModules || []).find((m) => m.module_key === 'participer') || {};
  }

  const _city = () => win.getActiveCity?.() ?? win.activeCity;

  /** L'utilisateur fait-il partie de l'équipe de la ville (admin ou contributeur) ? */
  function _isTeamMember() {
    if (!win.__CONTRIB_ROLE) return false;
    const villes = win.__CONTRIB_VILLES || [];
    return villes.includes('global') || villes.includes(_city());
  }

  /* ── Level 2 : sections du module ─────────────────────────────── */

  async function renderL2(panel) {
    const city = _city();
    panel._level2.innerHTML =
      `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>` +
      panel._skeletonL2Items(2);

    // La couche et la config se chargent ensemble : le panneau n'affiche ses
    // sections qu'une fois la configuration de la ville connue
    let config = null;
    try {
      const [cfg] = await Promise.all([
        win.ParticiperViews?.loadConfig(city),
        win.ParticiperViews?.ensureLayer(city),
      ]);
      config = cfg;
    } catch { /* panneau vide ci-dessous */ }

    if (panel._currentModule !== 'participer') return;

    if (!config?.enabled) {
      panel._level2.innerHTML = '<div class="nav-panel__empty"><i class="fa-solid fa-circle-info"></i><span>Module indisponible pour cette ville</span></div>';
      return;
    }

    const color = 'var(--color-primary)';
    const sections = [
      {
        id: 'participer-signaler',
        icon: 'fa-solid fa-bullhorn',
        label: 'Signaler',
        desc: 'Un problème, une idée : dites-le'
      },
      {
        id: 'participer-explorer',
        icon: 'fa-solid fa-map-location-dot',
        label: 'Explorer',
        desc: 'Les signalements et leur avancement'
      }
    ];

    let html = '<div class="nav-panel__section-label">Sections</div>';
    sections.forEach((s) => {
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

    // L'équipe traite dans l'espace d'administration : ici, juste la porte
    // d'entrée avec le compteur de signalements à traiter
    if (_isTeamMember()) {
      html += `
        <button class="nav-panel__item" data-admin-link style="--item-color: ${color}">
          <div class="nav-panel__item-icon"><i class="fa-solid fa-inbox"></i></div>
          <div class="nav-panel__item-text">
            <div class="nav-panel__item-label">Traitement</div>
            <div class="nav-panel__item-desc">File des signalements reçus</div>
          </div>
          <div class="nav-panel__item-arrow"><i class="fas fa-arrow-up-right-from-square"></i></div>
        </button>`;
    }

    panel._level2.innerHTML = html;

    panel._level2.querySelectorAll('.nav-panel__item[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        const label = btn.querySelector('.nav-panel__item-label')?.textContent || section;
        panel._level2.querySelectorAll('.nav-panel__item').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        panel.openLevel3(section, { label, color });
      });
    });

    panel._level2.querySelector('[data-admin-link]')?.addEventListener('click', () => {
      win.location.href = '/admin/participer/';
    });

    if (_isTeamMember()) _injectPendingBadge(panel, city);
  }

  /* ── Level 3 : contenu d'une section ──────────────────────────── */

  async function renderL3(panel, section, _opts) {
    const city = _city();
    let config;
    try {
      config = await win.ParticiperViews?.loadConfig(city);
    } catch {
      panel._level3.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Module indisponible</span></div>';
      return;
    }
    if (panel._currentModule !== 'participer') return;

    if (section === 'participer-signaler') {
      win.ParticiperViews?.buildSignaler(panel._level3, config);
    } else if (section === 'participer-explorer') {
      win.ParticiperViews?.stopSignaler();
      win.ParticiperViews?.buildExplorer(panel._level3, config, city);
    }
  }

  function onBack(panel) {
    win.ParticiperViews?.stopSignaler();
    renderL2(panel);
  }

  function onClose() {
    win.ParticiperViews?.stopSignaler();
    win.ParticiperViews?.removeLayer();
  }

  /* ── Badge « à traiter » (non bloquant) ───────────────────────── */

  async function _injectPendingBadge(panel, city) {
    try {
      const count = await win.supabaseService?.fetchParticiperPendingCount?.(city);
      if (!count) return;
      const btn = panel._level2.querySelector('[data-admin-link]');
      const arrow = btn?.querySelector('.nav-panel__item-arrow');
      if (arrow && !btn.querySelector('.np-l2-badge')) {
        arrow.insertAdjacentHTML('beforebegin', `<span class="np-l2-badge">${count}</span>`);
      }
    } catch { /* badge facultatif */ }
  }

  /* ── Registration ─────────────────────────────────────────────── */

  function register() {
    if (!win.NavPanel?.registerModule) return;
    const row = _getModuleRow();
    win.NavPanel.registerModule('participer', {
      label: row.label || 'Participer',
      // Les signalements se superposent aux projets affichés : c'est le
      // positionnement du module (signalement contextualisé au territoire)
      clearLayers: false,
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
  win.ParticiperNav = { register };

})(window);
