// modules/travaux-views.js
// Travaux Level-3 views — extracted from nav-panel.js for maintainability.
// Each builder receives `container` (DOM element) and a `ctx` object.

;(function(win) {
  'use strict';

  function drawPanelHTML() {
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
  }

  function bindListActions(container, { onDelete, onRefresh }) {
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
          console.error('[TravauxViews] Delete error:', err);
          win.Toast?.show('Erreur lors de la suppression', 'error');
          btn.disabled = false;
        }
      });
    });
  }

  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function buildTimeline(container, allFeatures, TM) {
    let tlMin = null, tlMax = null;
    let minDebut = Infinity, maxFin = -Infinity;
    for (const f of allFeatures) {
      const d = TM.parseTs(f.properties.date_debut);
      const e = TM.parseTs(f.properties.date_fin);
      if (d !== null && d < minDebut) minDebut = d;
      if (e !== null && e > maxFin)  maxFin = e;
    }
    if (minDebut !== Infinity && maxFin !== -Infinity) { tlMin = minDebut; tlMax = maxFin; }
    else if (minDebut !== Infinity) { tlMin = minDebut; tlMax = minDebut + 180 * 86400000; }
    if (tlMin !== null && tlMax - tlMin < 30 * 86400000) tlMax = tlMin + 30 * 86400000;

    if (tlMin === null) {
      container.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-calendar-xmark"></i><span>Aucune date disponible</span></div>';
      return;
    }

    const totalDays = Math.round((tlMax - tlMin) / 86400000);
    const todayOff = Math.max(0, Math.min(totalDays, Math.round((Date.now() - tlMin) / 86400000)));

    container.innerHTML = `
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

    const slider   = container.querySelector('#np-tl-slider');
    const countEl  = container.querySelector('#np-tl-count');
    const dateEl   = container.querySelector('#np-tl-date');
    const histEl   = container.querySelector('#np-tl-histogram');
    const todayBtn = container.querySelector('#np-tl-today');

    TM.renderHistogramSVG(histEl, TM.computeHistogram(allFeatures, tlMin, tlMax));

    const update = () => {
      const time = tlMin + parseInt(slider.value, 10) * 86400000;
      TM.setMapTimelineFilter(time);
      countEl.textContent = TM.countAtTime(allFeatures, time);
      dateEl.textContent  = TM.fmtFull(new Date(time));
    };

    slider.addEventListener('input', update);
    todayBtn.addEventListener('click', () => {
      slider.value = Math.max(0, Math.min(totalDays, Math.round((Date.now() - tlMin) / 86400000)));
      update();
    });

    update();
  }

  function buildFilters(container, allFeatures, TM) {
    const { values: natures, counts: natureCounts } = TM.uniqueSorted(allFeatures, 'nature_travaux');
    const { values: communes, counts: communeCounts } = TM.uniqueSorted(allFeatures, 'commune');
    const { values: etats } = TM.uniqueSorted(allFeatures, 'etat');

    container.innerHTML = `
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
      nature:   container.querySelector('#np-f-nature'),
      commune:  container.querySelector('#np-f-commune'),
      etat:     container.querySelector('#np-f-etat'),
      resetBtn: container.querySelector('#np-f-reset'),
      badges:   container.querySelector('#np-f-badges'),
      countEl:  container.querySelector('#np-f-count'),
    };

    const LAYER = TM.LAYER_NAME || 'travaux';

    const getCriteria = () => {
      const c = {};
      if (els.nature.value)  c.nature_travaux = els.nature.value;
      if (els.commune.value) c.commune = els.commune.value;
      if (els.etat.value)    c.etat = els.etat.value;
      return c;
    };

    const applyFilters = () => {
      const criteria = getCriteria();
      const filtered = TM.applyStructuralFilter(allFeatures, criteria);

      FilterModule.set(LAYER, criteria);
      win.MapModule?.removeLayer(LAYER);
      win.DataModule?.createGeoJsonLayer(LAYER, win.DataModule.layerData[LAYER]);

      els.countEl.textContent = filtered.length;
      TM.renderBadges(els.badges, criteria, els, applyFilters);

      const hasActive = !!(els.nature.value || els.commune.value || els.etat.value);
      els.resetBtn.style.display = hasActive ? '' : 'none';
    };

    [els.nature, els.commune, els.etat].forEach(el =>
      el.addEventListener('change', applyFilters)
    );

    els.resetBtn.addEventListener('click', () => {
      els.nature.value  = '';
      els.commune.value = '';
      els.etat.value    = '';
      els.nature.innerHTML = '<option value="">Toutes les natures</option>' + TM.optionsHTML(natures, natureCounts);
      applyFilters();
    });

    applyFilters();
  }

  /**
   * @param {HTMLElement} container
   * @param {Object} ctx - { isStale, onSaved }
   *   isStale() → true if user navigated away (abort guard)
   *   onSaved(refreshFn) → bind travaux:saved listener
   */
  async function buildAdmin(container, ctx) {
    container.innerHTML =
      `<div class="nav-panel__progress"><div class="nav-panel__progress-bar"></div></div>`;

    const city = win.getActiveCity?.() ?? win.activeCity;
    if (!city) {
      container.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Ville non définie</span></div>';
      return;
    }

    let chantiers = [];
    try {
      chantiers = await win.supabaseService?.fetchCityTravaux(city, { adminMode: true }) || [];
    } catch (e) { console.warn('[travaux-views] fetchCityTravaux', e); }

    if (ctx.isStale()) return;

    const ETAT_DOT = { Prochain: 'np-dot--upcoming', Ouvert: 'np-dot--active', Terminé: 'np-dot--done' };
    const pending  = chantiers.filter(c => !c.approved);

    let html = '<div class="np-admin">';

    html += `
      <div class="np-admin-hero">
        <div class="np-admin-hero-count">${chantiers.length}</div>
        <div class="np-admin-hero-label">chantier${chantiers.length !== 1 ? 's' : ''} enregistré${chantiers.length !== 1 ? 's' : ''}</div>
        <button type="button" class="np-admin-add" id="np-admin-add">
          <i class="fa-solid fa-plus"></i> Ajouter un chantier
        </button>
      </div>`;

    html += drawPanelHTML();

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
    container.innerHTML = html;

    // Bind: Add
    container.querySelector('#np-admin-add')?.addEventListener('click', () => {
      win.TravauxEditorModule?.openEditor();
    });

    // Bind: Tabs
    const tabs  = container.querySelectorAll('.np-tab');
    const items = container.querySelectorAll('.np-admin-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.toggle('np-tab--active', t === tab));
        const filter = tab.dataset.tab;
        items.forEach(item => {
          item.style.display = (filter === 'all' || item.dataset.approved === 'false') ? '' : 'none';
        });
      });
    });

    // Bind: Quick approve
    const refresh = () => buildAdmin(container, ctx);
    container.querySelectorAll('.np-admin-action--approve').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Valider et publier ce chantier ?')) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
          await win.supabaseService?.updateCityTravaux(btn.dataset.id, { approved: true });
          await win.DataModule?.reloadLayer?.('travaux');
          win.Toast?.show('Chantier validé et publié', 'success', 2600);
          refresh();
        } catch (err) {
          console.error('[TravauxViews] Approve error:', err);
          win.Toast?.show('Erreur lors de la validation', 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        }
      });
    });

    // Bind: Edit + Delete
    bindListActions(container, {
      onDelete: { confirmMsg: 'Supprimer ce chantier ? Cette action est irréversible.', successMsg: 'Chantier supprimé' },
      onRefresh: refresh,
    });

    ctx.onSaved(refresh);
  }

  win.TravauxViews = { buildTimeline, buildFilters, buildAdmin };

})(window);
