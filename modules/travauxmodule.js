// modules/TravauxModule.js
const TravauxModule = (() => {

  // ─── Constants ────────────────────────────────────────────────
  const LAYER_NAME = 'travaux';
  const TS_MIN = 0;              // sentinel: started in the distant past
  const TS_MAX = 9999999999999;  // sentinel: never ends
  const HISTOGRAM_BUCKETS = 60;
  const RESEAU_KW = [
    'gaz', 'réseau', 'eau', 'branchement',
    'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'
  ];

  // ─── Utilities ────────────────────────────────────────────────
  const parseTs = v => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  };
  const fmtShort = d => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  const fmtFull  = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const isReseau = text => {
    if (!text) return false;
    const t = String(text).toLowerCase();
    return RESEAU_KW.some(k => t.includes(k));
  };

  // Add _ts_debut / _ts_fin to feature properties (idempotent)
  function enrichTimestamps(features) {
    for (const f of features) {
      const p = f.properties;
      if (p._ts_debut !== undefined) continue;
      p._ts_debut = parseTs(p.date_debut) ?? TS_MIN;
      p._ts_fin   = parseTs(p.date_fin)   ?? TS_MAX;
    }
  }

  // ─── Histogram ────────────────────────────────────────────────
  function computeHistogram(features, minTs, maxTs) {
    if (maxTs <= minTs) return new Array(HISTOGRAM_BUCKETS).fill(0);
    const step = (maxTs - minTs) / HISTOGRAM_BUCKETS;
    const counts = new Array(HISTOGRAM_BUCKETS).fill(0);
    for (const f of features) {
      const d = f.properties._ts_debut;
      const e = f.properties._ts_fin;
      const lo = Math.max(0, Math.floor((d - minTs) / step));
      const hi = Math.min(HISTOGRAM_BUCKETS - 1, Math.floor((e - minTs) / step));
      for (let i = lo; i <= hi; i++) counts[i]++;
    }
    return counts;
  }

  function renderHistogramSVG(container, counts) {
    if (!container) return;
    const peak = Math.max(...counts, 1);
    const bw = 100 / counts.length;
    const gap = bw * 0.15;
    const rects = counts.map((c, i) => {
      const h = (c / peak) * 100;
      return `<rect x="${i * bw + gap / 2}" y="${100 - h}" width="${bw - gap}" height="${h}" rx="0.5"/>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${rects}</svg>`;
  }

  // ─── Local counting (no map query) ────────────────────────────
  function applyStructuralFilter(features, criteria) {
    return features.filter(f => {
      const p = f.properties;
      for (const [k, v] of Object.entries(criteria)) {
        if (k.startsWith('_')) continue;
        if (String(p[k] || '').toLowerCase() !== String(v).toLowerCase()) return false;
      }
      if (criteria._hideReseaux && (isReseau(p.nature_travaux) || isReseau(p.nature_chantier))) return false;
      return true;
    });
  }

  function countAtTime(filtered, time) {
    let n = 0;
    for (const f of filtered) {
      const p = f.properties;
      if (p._ts_debut <= time && p._ts_fin >= time) n++;
    }
    return n;
  }

  // ─── MapLibre timeline filter (GPU-side, no layer rebuild) ────
  function buildTimelineExpr(ts) {
    return [
      'any',
      ['!', ['has', '_ts_debut']],
      ['all',
        ['<=', ['get', '_ts_debut'], ts],
        ['>=', ['get', '_ts_fin'], ts]
      ]
    ];
  }

  function setMapTimelineFilter(ts) {
    const mlMap = window.MapModule?.map?._mlMap || window.MapModule?.map;
    if (!mlMap || !L?._sourcePool) return;
    L._sourcePool.setFilter(mlMap, buildTimelineExpr(ts));
  }

  // ─── Unique sorted values with counts ─────────────────────────
  function uniqueSorted(features, key) {
    const counts = {};
    for (const f of features) {
      const v = f.properties[key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    const values = Object.keys(counts).sort((a, b) =>
      counts[b] - counts[a] || a.localeCompare(b, 'fr')
    );
    return { values, counts };
  }

  function optionsHTML(values, counts, hideReseaux) {
    return values
      .filter(v => !hideReseaux || !isReseau(v))
      .map(v => `<option value="${v}">${v} (${counts[v]})</option>`)
      .join('');
  }

  // ─── HTML builders ────────────────────────────────────────────
  function drawingPanelHTML() {
    return `
      <div id="travaux-drawing-panel" class="travaux-drawing-panel">
        <div class="travaux-drawing-header">
          <div class="travaux-drawing-status">
            <div class="status-icon"><i class="fa-solid fa-pen-to-square"></i></div>
            <div class="status-content">
              <h3 class="status-title">Mode dessin activé</h3>
              <p class="status-description">Dessinez la zone du chantier sur la carte puis renseignez les informations</p>
            </div>
          </div>
        </div>
        <div class="travaux-tools-section">
          <h4 class="tools-section-title"><i class="fa-solid fa-pencil"></i> Outils de dessin</h4>
          <div class="travaux-tools-grid">
            <button id="draw-polyline" class="travaux-draw-tool" data-tool="polyline">
              <div class="tool-icon"><i class="fa-solid fa-route"></i></div>
              <div class="tool-content"><span class="tool-name">Ligne</span><span class="tool-hint">Tracé linéaire</span></div>
            </button>
            <button id="draw-polygon" class="travaux-draw-tool" data-tool="polygon">
              <div class="tool-icon"><i class="fa-solid fa-draw-polygon"></i></div>
              <div class="tool-content"><span class="tool-name">Polygone</span><span class="tool-hint">Zone fermée</span></div>
            </button>
            <button id="draw-marker" class="travaux-draw-tool" data-tool="marker">
              <div class="tool-icon"><i class="fa-solid fa-location-dot"></i></div>
              <div class="tool-content"><span class="tool-name">Point</span><span class="tool-hint">Localisation</span></div>
            </button>
          </div>
        </div>
        <div class="travaux-drawing-help">
          <i class="fa-solid fa-lightbulb"></i>
          <span>Cliquez sur un outil puis dessinez sur la carte. Vous pouvez dessiner plusieurs formes.</span>
        </div>
        <div class="travaux-drawing-actions">
          <button id="travaux-cancel-drawing" class="btn-secondary btn-large"><i class="fa-solid fa-xmark"></i><span>Annuler</span></button>
          <button id="travaux-finish-drawing" class="btn-primary btn-large" disabled><i class="fa-solid fa-arrow-right"></i><span>Continuer</span></button>
        </div>
      </div>`;
  }

  function filterPanelHTML(hasFeatures, hasTimeline, natures, natureCounts, communes, communeCounts, etats) {
    const addCardHTML = `
      <div class="travaux-add-card" style="display:none;">
        <span class="add-card-label">Ajouter un chantier</span>
        <button class="add-card-btn travaux-add-btn btn-primary"><i class="fa-solid fa-plus"></i></button>
      </div>`;
    if (!hasFeatures) return addCardHTML;

    return `${addCardHTML}
      ${hasTimeline ? `
      <div class="travaux-timeline" id="travaux-timeline">
        <div class="timeline-hero">
          <span class="timeline-count" id="timeline-count">0</span>
          <span class="timeline-count-label">chantier(s) ouvert(s) le</span>
          <span class="timeline-date" id="timeline-date-label"></span>
        </div>
        <div class="timeline-slider-wrap">
          <div class="timeline-histogram" id="timeline-histogram"></div>
          <input type="range" id="travaux-date-slider" class="timeline-slider" />
        </div>
        <div class="timeline-range-labels">
          <span id="timeline-min-label"></span>
          <button type="button" id="timeline-today-btn" class="timeline-today-btn"><i class="fa-solid fa-calendar-day"></i> Aujourd'hui</button>
          <span id="timeline-max-label"></span>
        </div>
      </div>` : ''}
      <div class="travaux-filters-row">
        <select id="nature-select" class="travaux-select" aria-label="Nature">
          <option value="">Nature</option>
          ${natures.map(n => `<option value="${n}">${n} (${natureCounts[n]})</option>`).join('')}
        </select>
        <select id="commune-select" class="travaux-select" aria-label="Commune">
          <option value="">Commune</option>
          ${communes.map(c => `<option value="${c}">${c} (${communeCounts[c]})</option>`).join('')}
        </select>
        <select id="etat-select" class="travaux-select" aria-label="État">
          <option value="">État</option>
          ${etats.map(e => `<option value="${e}">${e}</option>`).join('')}
        </select>
      </div>
      <div class="travaux-options-row">
        <label class="travaux-switch-label">
          <input type="checkbox" id="hide-reseaux">
          <span>Exclure réseaux</span>
        </label>
        <button type="button" id="reset-filters" class="travaux-reset-btn" style="display:none;">
          <i class="fa-solid fa-rotate-left"></i> Réinitialiser
        </button>
      </div>
      <div id="filters-tags" class="travaux-tags"></div>`;
  }

  // ─── Badges ───────────────────────────────────────────────────
  function renderBadges(container, criteria, els, onChange) {
    container.innerHTML = '';
    const labels = { nature_travaux: 'Nature', commune: 'Commune', etat: 'État', _hideReseaux: 'Sans réseaux' };
    for (const [key, val] of Object.entries(criteria)) {
      if (!val || key.startsWith('_') && key !== '_hideReseaux') continue;
      const badge = document.createElement('span');
      badge.className = 'travaux-badge';
      badge.tabIndex = 0;
      badge.role = 'button';
      const text = key === '_hideReseaux' ? 'Sans réseaux' : `${labels[key] || key}: ${val}`;
      badge.setAttribute('aria-label', `Retirer filtre ${text}`);
      badge.innerHTML = `${text} <i class='fa-solid fa-xmark'></i>`;
      const remove = () => {
        if (key === '_hideReseaux') els.hideRes.checked = false;
        else if (key === 'nature_travaux') els.nature.value = '';
        else if (key === 'commune') els.commune.value = '';
        else if (key === 'etat') els.etat.value = '';
        onChange();
      };
      badge.addEventListener('click', remove);
      badge.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') remove(); });
      container.appendChild(badge);
    }
    const visible = Object.entries(criteria).some(([k, v]) => v && (!k.startsWith('_') || k === '_hideReseaux'));
    container.style.display = visible ? 'flex' : 'none';
  }

  // ─── Admin add card setup ─────────────────────────────────────
  async function setupAddCard(filterUX) {
    const addCard = filterUX.querySelector('.travaux-add-card');
    if (!addCard) return;
    const activeCity = (typeof window.getActiveCity === 'function')
      ? window.getActiveCity() : (window.activeCity || null);

    let editable = true;
    try {
      const config = await window.supabaseService?.getTravauxConfig(activeCity);
      if (config?.source_type === 'url') editable = false;
    } catch (_) {}

    if (!editable) { addCard.remove(); return; }

    addCard.addEventListener('click', e => {
      e.stopPropagation();
      if (window.TravauxEditorModule?.openEditor) {
        window.TravauxEditorModule.openEditor();
      }
    });

    try {
      const session = await window.supabaseService?.getClient()?.auth.getSession();
      const user = session?.data?.session?.user;
      if (user) {
        const role = window.__CONTRIB_ROLE || '';
        const villes = window.__CONTRIB_VILLES || [];
        if (role === 'admin' && (villes.includes('global') || villes.includes(activeCity))) {
          addCard.style.display = 'flex';
        }
      }
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════════════════════
  async function renderTravauxProjects() {
    const submenu = document.querySelector('.submenu[data-category="travaux"]');
    if (!submenu) return;

    // ── Build submenu DOM ──
    submenu.innerHTML = window.SubmenuManager.headerHTML({
      title: 'Travaux',
      innerHTML: `${drawingPanelHTML()}<ul class="project-list"></ul>`
    });
    window.SubmenuManager.resetExpanded(submenu);
    window.SubmenuManager.wireHeaderEvents(submenu);

    // Remove non-travaux layers
    const layersToDisplay = window.categoryLayersMap?.['travaux'] || [];
    if (window.MapModule?.layers) {
      Object.keys(window.MapModule.layers).forEach(name => {
        if (!layersToDisplay.includes(name)) {
          try { window.MapModule.removeLayer(name); } catch (_) {}
        }
      });
    }

    const projectListEl = submenu.querySelector('.project-list');

    // ── Load data ──
    const hasData = DataModule.layerData?.[LAYER_NAME]?.features?.length > 0;
    if (!hasData) {
      if (projectListEl) projectListEl.innerHTML = '<div class="gp-loading" aria-live="polite">Chargement des chantiers…</div>';
      try { await DataModule.loadLayer(LAYER_NAME); } catch (_) {}
    }

    const allFeatures = DataModule.layerData?.[LAYER_NAME]?.features || [];
    if (!allFeatures.length && projectListEl) {
      projectListEl.innerHTML = '<li>Aucun chantier travaux à afficher.</li>';
    }

    // Enrich timestamps (idempotent — adds _ts_debut/_ts_fin)
    enrichTimestamps(allFeatures);

    // Compute unique filter values
    const { values: natures, counts: natureCounts } = uniqueSorted(allFeatures, 'nature_travaux');
    const { values: communes, counts: communeCounts } = uniqueSorted(allFeatures, 'commune');
    const { values: etats } = uniqueSorted(allFeatures, 'etat');

    // ── Timeline range (only from features that actually have dates) ──
    let tlMin = null, tlMax = null;
    {
      let minDebut = Infinity, maxFin = -Infinity;
      for (const f of allFeatures) {
        const d = parseTs(f.properties.date_debut);
        const e = parseTs(f.properties.date_fin);
        if (d !== null && d < minDebut) minDebut = d;
        if (e !== null && e > maxFin) maxFin = e;
      }
      if (minDebut !== Infinity && maxFin !== -Infinity) {
        tlMin = minDebut;
        tlMax = maxFin;
      } else if (minDebut !== Infinity) {
        tlMin = minDebut;
        tlMax = minDebut + 180 * 86400000;
      }
      if (tlMin !== null && tlMax - tlMin < 30 * 86400000) tlMax = tlMin + 30 * 86400000;
    }
    const hasTimeline = tlMin !== null;

    // ── Build filter panel ──
    const filterUX = document.createElement('section');
    filterUX.id = 'travaux-filters-ux';
    filterUX.className = 'travaux-panel';
    filterUX.innerHTML = filterPanelHTML(
      allFeatures.length > 0, hasTimeline,
      natures, natureCounts, communes, communeCounts, etats
    );

    document.getElementById('travaux-filters-ux')?.remove();
    document.getElementById('travaux-filters-container')?.remove();
    const contentWrap = submenu.querySelector('.submenu__content');
    if (contentWrap) contentWrap.insertBefore(filterUX, projectListEl);

    await setupAddCard(filterUX);
    if (!allFeatures.length) return;

    // ── Wire filter elements ──
    const els = {
      nature:    filterUX.querySelector('#nature-select'),
      commune:   filterUX.querySelector('#commune-select'),
      etat:      filterUX.querySelector('#etat-select'),
      slider:    filterUX.querySelector('#travaux-date-slider'),
      dateLabel: filterUX.querySelector('#timeline-date-label'),
      countEl:   filterUX.querySelector('#timeline-count'),
      histogram: filterUX.querySelector('#timeline-histogram'),
      hideRes:   filterUX.querySelector('#hide-reseaux'),
      resetBtn:  filterUX.querySelector('#reset-filters'),
      badges:    filterUX.querySelector('#filters-tags'),
      todayBtn:  filterUX.querySelector('#timeline-today-btn'),
    };

    // ── Timeline slider init ──
    if (hasTimeline && els.slider) {
      const totalDays = Math.round((tlMax - tlMin) / 86400000);
      els.slider.min = 0;
      els.slider.max = totalDays;
      const todayOff = Math.round((Date.now() - tlMin) / 86400000);
      els.slider.value = Math.max(0, Math.min(totalDays, todayOff));
      filterUX.querySelector('#timeline-min-label').textContent = fmtShort(new Date(tlMin));
      filterUX.querySelector('#timeline-max-label').textContent = fmtShort(new Date(tlMax));
    } else {
      filterUX.querySelector('#travaux-timeline')?.style?.setProperty('display', 'none');
    }

    // ── State ──
    let filteredFeatures = allFeatures; // updated on structural change

    const getSliderTime = () => {
      if (!hasTimeline || !els.slider) return Date.now();
      return tlMin + parseInt(els.slider.value, 10) * 86400000;
    };

    const getStructuralCriteria = () => {
      const c = {};
      if (els.nature.value)  c.nature_travaux = els.nature.value;
      if (els.commune.value) c.commune = els.commune.value;
      if (els.etat.value)    c.etat = els.etat.value;
      if (els.hideRes.checked) c._hideReseaux = true;
      return c;
    };

    const updateUI = (time) => {
      const count = countAtTime(filteredFeatures, time);
      if (els.countEl) els.countEl.textContent = count;
      if (els.dateLabel) els.dateLabel.textContent = fmtFull(new Date(time));
      const criteria = getStructuralCriteria();
      renderBadges(els.badges, criteria, els, onStructuralChange);
      const hasActive = !!(els.nature.value || els.commune.value || els.etat.value || els.hideRes.checked);
      els.resetBtn.style.display = hasActive ? '' : 'none';
      projectListEl.innerHTML = '';
    };

    // ── Structural filter → rebuild layer + re-apply timeline ──
    const onStructuralChange = () => {
      const criteria = getStructuralCriteria();
      filteredFeatures = applyStructuralFilter(allFeatures, criteria);

      // Rebuild layer with structural criteria only
      FilterModule.set(LAYER_NAME, criteria);
      MapModule.removeLayer(LAYER_NAME);
      DataModule.createGeoJsonLayer(LAYER_NAME, DataModule.layerData[LAYER_NAME]);

      // Re-apply timeline filter on new pool layers (instant, no rebuild)
      const time = getSliderTime();
      setMapTimelineFilter(time);

      // Update histogram from filtered features
      if (hasTimeline && els.histogram) {
        renderHistogramSVG(els.histogram, computeHistogram(filteredFeatures, tlMin, tlMax));
      }
      updateUI(time);
    };

    // ── Timeline change → MapLibre filter only (instant) ──
    const onTimelineChange = () => {
      const time = getSliderTime();
      setMapTimelineFilter(time);
      updateUI(time);
    };

    // ── Event listeners ──
    [els.nature, els.commune, els.etat].forEach(el =>
      el.addEventListener('change', onStructuralChange)
    );
    if (hasTimeline && els.slider) {
      els.slider.addEventListener('input', onTimelineChange);
    }
    if (els.todayBtn && hasTimeline && els.slider) {
      els.todayBtn.addEventListener('click', () => {
        const todayOff = Math.round((Date.now() - tlMin) / 86400000);
        els.slider.value = Math.max(0, Math.min(parseInt(els.slider.max, 10), todayOff));
        onTimelineChange();
      });
    }
    els.hideRes.addEventListener('change', () => {
      const saved = els.nature.value;
      els.nature.innerHTML = '<option value="">Nature</option>' +
        optionsHTML(natures, natureCounts, els.hideRes.checked);
      if (saved && els.nature.querySelector(`option[value="${saved}"]`)) els.nature.value = saved;
      else els.nature.value = '';
      onStructuralChange();
    });
    els.resetBtn.addEventListener('click', () => {
      els.nature.value = '';
      els.commune.value = '';
      els.etat.value = '';
      els.hideRes.checked = false;
      if (hasTimeline && els.slider) {
        const todayOff = Math.round((Date.now() - tlMin) / 86400000);
        els.slider.value = Math.max(0, Math.min(parseInt(els.slider.max, 10), todayOff));
      }
      els.nature.innerHTML = '<option value="">Nature</option>' + optionsHTML(natures, natureCounts, false);
      onStructuralChange();
    });

    // ── Initial render ──
    onStructuralChange();
  }

  // API publique
  window.TravauxModule = { renderTravauxProjects };
  return { renderTravauxProjects };
})();
