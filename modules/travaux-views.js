// modules/travaux-views.js
// Travaux Level-3 views — extracted from nav-panel.js for maintainability.
// Each builder receives `container` (DOM element) and a `ctx` object.

;(function(win) {
  'use strict';

  function bindListActions(container, { onDelete, onRefresh }) {
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

    function searchableListHTML(id, allLabel, items, counts) {
      const opts = items.map(v =>
        `<button type="button" class="np-filter-option" data-value="${esc(v)}">
          <span class="np-filter-option-label">${esc(v)}</span>
          <span class="np-filter-option-count">${counts[v]}</span>
        </button>`
      ).join('');
      return `<div class="np-filter-searchable" id="${id}-wrap">
          <div class="np-filter-search-row">
            <i class="fa-solid fa-magnifying-glass np-filter-search-icon"></i>
            <input type="text" class="np-filter-search-input" id="${id}-search"
              placeholder="Rechercher…" autocomplete="off" spellcheck="false" />
          </div>
          <div class="np-filter-option-list" id="${id}-list" role="listbox">
            <button type="button" class="np-filter-option np-filter-option--all active" data-value="" role="option" aria-selected="true">
              <span class="np-filter-option-label">${esc(allLabel)}</span>
            </button>
            ${opts}
          </div>
        </div>`;
    }

    container.innerHTML = `
      <div class="np-travaux-filters">
        <div class="np-filters-group">
          <label class="np-filter-label">Nature des travaux</label>
          ${searchableListHTML('np-f-nature', 'Toutes les natures', natures, natureCounts)}
        </div>
        <div class="np-filters-group">
          <label class="np-filter-label">Commune</label>
          ${searchableListHTML('np-f-commune', 'Toutes les communes', communes, communeCounts)}
        </div>
        <div class="np-filters-group">
          <label class="np-filter-label">État</label>
          <select id="np-f-etat" class="np-filter-select">
            <option value="">Tous les états</option>
            ${etats.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}
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

    // ── Searchable list controller ──────────────────────────────
    function bindSearchable(id, onChange) {
      const searchInput = container.querySelector(`#${id}-search`);
      const listEl      = container.querySelector(`#${id}-list`);
      let selectedValue = '';

      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        listEl.querySelectorAll('.np-filter-option:not(.np-filter-option--all)').forEach(btn => {
          const match = !q || btn.querySelector('.np-filter-option-label').textContent.toLowerCase().includes(q);
          btn.style.display = match ? '' : 'none';
        });
      });

      listEl.addEventListener('click', e => {
        const btn = e.target.closest('.np-filter-option');
        if (!btn) return;
        selectedValue = btn.dataset.value;
        listEl.querySelectorAll('.np-filter-option').forEach(b => {
          b.classList.toggle('active', b.dataset.value === selectedValue);
          b.setAttribute('aria-selected', b.dataset.value === selectedValue ? 'true' : 'false');
        });
        onChange();
      });

      return {
        getValue: () => selectedValue,
        setValue: v => {
          selectedValue = v;
          listEl.querySelectorAll('.np-filter-option').forEach(b => {
            b.classList.toggle('active', b.dataset.value === v);
            b.setAttribute('aria-selected', b.dataset.value === v ? 'true' : 'false');
          });
          searchInput.value = '';
          listEl.querySelectorAll('.np-filter-option:not(.np-filter-option--all)').forEach(b => { b.style.display = ''; });
        },
      };
    }

    const LAYER = TM.LAYER_NAME || 'travaux';

    function applyFilters() {
      const c = {};
      if (natureCtrl.getValue())  c.nature_travaux = natureCtrl.getValue();
      if (communeCtrl.getValue()) c.commune = communeCtrl.getValue();
      if (els.etat.value)         c.etat = els.etat.value;
      const filtered = TM.applyStructuralFilter(allFeatures, c);

      FilterModule.set(LAYER, c);
      win.MapModule?.removeLayer(LAYER);
      win.DataModule?.createGeoJsonLayer(LAYER, win.DataModule.layerData[LAYER]);

      els.countEl.textContent = filtered.length;
      TM.renderBadges(els.badges, c, els, applyFilters);

      const hasActive = !!(natureCtrl.getValue() || communeCtrl.getValue() || els.etat.value);
      els.resetBtn.style.display = hasActive ? '' : 'none';
    }

    const natureCtrl  = bindSearchable('np-f-nature', applyFilters);
    const communeCtrl = bindSearchable('np-f-commune', applyFilters);

    const els = {
      natureCtrl,
      communeCtrl,
      etat:     container.querySelector('#np-f-etat'),
      resetBtn: container.querySelector('#np-f-reset'),
      badges:   container.querySelector('#np-f-badges'),
      countEl:  container.querySelector('#np-f-count'),
    };

    els.etat.addEventListener('change', applyFilters);

    els.resetBtn.addEventListener('click', () => {
      natureCtrl.setValue('');
      communeCtrl.setValue('');
      els.etat.value = '';
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

    const city = win.CityManager?.getActiveCity();
    if (!city) {
      container.innerHTML = '<div class="nav-panel__empty"><i class="fas fa-exclamation-triangle"></i><span>Ville non définie</span></div>';
      return;
    }

    let chantiers = [];
    try {
      chantiers = await win.supabaseService?.fetchCityTravaux(city, { adminMode: true }) || [];
    } catch (e) { console.debug('[travaux-views] fetchCityTravaux', e); }

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
      win.Toast?.show('Utilisez le panneau d\'administration pour ajouter des chantiers', 'info', 3000);
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
