/**
 * FEATURE INTERACTIONS — MapLibre GL natif
 *
 * Système de cards unifié (zéro MapLibre Popup) :
 *   single → 1 card + tip, suit le curseur
 *   peek   → 2-3 cards empilées (offset Y + scale), badge +N
 *   picker → liste verticale scrollable de TOUS les projets (au clic)
 *
 * Transitions fluides :
 *   - DOM diff par project_name : cards existantes restent, nouvelles glissent
 *   - Pas de innerHTML global : ajout/suppression individuelle
 *
 * Dimming : feature-state selected + layer paint dim
 */
;(function(win) {
  'use strict';

  const THROTTLE_MS = 14;
  const DIM_LINE_OPACITY = 0.12;
  const DIM_FILL_OPACITY = 0.04;
  const HIT_TOLERANCE = 5;
  const PEEK_MAX = 3;

  /* ── helpers ── */
  const esc = window.SecurityUtils.escapeHtml;
  function travauxTitleOf(p) {
    return window.TravauxModule?.getChantierDisplayName?.(p)
      || p.project_name || p.name || p.nature_travaux || p.nature || p.nature_chantier || '';
  }
  function isTravauxProps(p) {
    return !!(p.chantier_key || p.chantier_id != null || p.nature_travaux || p.nature || p.nature_chantier);
  }
  // Display title (human-readable, used in cards/popups)
  function projectNameOf(p) { return p.project_name || p.name || p.nature_travaux || p.nature || p.nature_chantier || ''; }
  // Selection key: unique per item.
  //   travaux → always chantier_id (PK, always present and unique)
  //              fallback to a stable human label for legacy/url-based travaux sources
  //   contrib → project_name (groups multi-feature projects)
  function keyOf(f) {
    const p = f.properties || {};
    if (p.chantier_key != null && p.chantier_key !== '') return String(p.chantier_key);
    if (p.chantier_id != null) return String(p.chantier_id);
    if (isTravauxProps(p)) return travauxTitleOf(p);
    return p.project_name || p.name || '';
  }
  function isInteractive(f) { const p = f.properties||{}; return !!(p.project_name && p.category) || isTravauxProps(p); }
  function isContrib(f) { const p = f.properties||{}; return !!(p.project_name && p.category); }
  function isTravaux(f) { const p = f.properties||{}; return isTravauxProps(p); }

  function cardHTML(props, opts) {
    const title = esc(projectNameOf(props));
    if (!title) return '';
    const img = props.cover_url || '';
    const cat = props.category || '';
    const tw = !!(props.nature_travaux || props.chantier_id);
    const imgH = img ? `<div class="gp-hp-img"><img src="${esc(img)}" alt="" loading="lazy"/></div>` : '';
    const tagH = cat ? `<span class="gp-hp-tag">${esc(cat)}</span>`
      : tw ? '<span class="gp-hp-tag gp-hp-tag--travaux"><i class="fa-solid fa-helmet-safety"></i> Travaux</span>' : '';
    const ctaH = opts?.cta ? '<span class="gp-hp-cta"><i class="fa-solid fa-hand-pointer"></i> Cliquez pour en savoir plus</span>' : '';
    return `<div class="gp-hp">${imgH}<div class="gp-hp-body">${tagH}<div class="gp-hp-title">${title}</div>${ctaH}</div></div>`;
  }

  // ─────────────────────────────────────────────────────────────
  const FI = {
    _mlMap: null,
    _hovered: null,     // { key, source, ids:Set }
    _selected: null,
    _savedPaint: null,
    _timer: null,
    _domMarkers: [],

    // Glow pulse animation
    _glowLayerId: null,
    _glowRaf: null,
    _glowStart: 0,

    // Overlay
    _el: null,           // root fixed div on body
    _cardsEl: null,      // .gp-fan-cards container
    _tipEl: null,        // .gp-fan-tip arrow
    _pickerEl: null,     // .gp-pk (picker list)
    _backdropEl: null,   // .gp-fan-backdrop
    _state: null,        // 'single' | 'peek' | 'picker' | null
    _features: [],       // all overlapping features (full list)
    _displayKeys: [],    // keys of cards currently in _cardsEl DOM
    _lngLat: null,
    _currentKey: null,   // dedup key
    _boundUpdatePos: null,

    // ═══════════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════════
    init(mlMap) {
      if (!mlMap) return;
      this._mlMap = mlMap;
      this._boundUpdatePos = () => this._updatePosition();
      mlMap.on('mousemove', (e) => this._onMove(e));
      mlMap.on('mouseout',  ()  => this._endHover());
      mlMap.on('click',     (e) => this._onClick(e));
      console.log('[FI] ✅ init (unified cards)');
    },

    // ═══════════════════════════════════════════════════════════
    //  DOM MARKER REGISTRY
    // ═══════════════════════════════════════════════════════════
    registerMarker(marker, feature) {
      if (!marker || !feature?.properties) return;
      this._domMarkers.push({ marker, feature, latlng: marker.getLatLng() });
    },

    // ═══════════════════════════════════════════════════════════
    //  SOURCE GUARD
    // ═══════════════════════════════════════════════════════════
    _sourceExists(src) {
      if (!src || src === '__multi__') return false;
      try { return !!this._mlMap.getSource(src); } catch(_) { return false; }
    },

    invalidateSource(sourceId) {
      if (this._hovered?.source === sourceId) this._hovered = null;
      if (this._selected?.source === sourceId) this._selected = null;
      if (this._savedPaint) {
        for (const lid of this._savedPaint.keys()) {
          try { if (!this._mlMap.getLayer(lid)) this._savedPaint.delete(lid); } catch(_) {}
        }
      }
      if (this._state) this._close();
    },

    // ═══════════════════════════════════════════════════════════
    //  HIT TEST
    // ═══════════════════════════════════════════════════════════
    _hitTestAll(point) {
      const bbox = [[point.x - HIT_TOLERANCE, point.y - HIT_TOLERANCE],
                     [point.x + HIT_TOLERANCE, point.y + HIT_TOLERANCE]];
      const gl = (this._mlMap.queryRenderedFeatures(bbox) || []).filter(isInteractive);
      const dom = this._findNearbyDOMMarkers(point);
      const seen = new Set(); const out = [];
      for (const f of [...gl, ...dom]) {
        const k = keyOf(f);
        if (k && !seen.has(k)) { seen.add(k); out.push(f); }
      }
      return out;
    },

    _findNearbyDOMMarkers(point) {
      const r = [];
      for (const { feature, latlng } of this._domMarkers) {
        const px = this._mlMap.project([latlng.lng, latlng.lat]);
        if (Math.hypot(px.x - point.x, px.y - point.y) < HIT_TOLERANCE * 4) r.push(feature);
      }
      return r;
    },

    // ═══════════════════════════════════════════════════════════
    //  HOVER
    // ═══════════════════════════════════════════════════════════
    _onMove(e) {
      // Always update position for single card (no throttle, keeps it glued to cursor)
      if (this._state === 'single') {
        this._lngLat = e.lngLat;
        this._updatePosition();
      }

      // Throttle expensive hit-test work
      if (this._timer) return;
      this._timer = setTimeout(() => { this._timer = null; }, THROTTLE_MS);
      if (this._state === 'picker') return;

      const hits = this._hitTestAll(e.point);

      if (hits.length === 0) {
        this._endHover();
        this._mlMap.getCanvas().style.cursor = '';
        return;
      }

      this._mlMap.getCanvas().style.cursor = 'pointer';
      const key = hits.map(f => keyOf(f)).sort().join('|');

      // Same content → nothing to update (position already handled above)
      if (key === this._currentKey && this._state) return;

      // Content changed
      this._clearHoverState();

      if (hits.length === 1) {
        const src = hits[0].source;
        const name = keyOf(hits[0]);
        if (this._sourceExists(src)) {
          this._hovered = { key, source: src, ids: this._setStateOnProject(src, name, { hover: true }) };
        } else {
          this._hovered = { key, source: null, ids: new Set() };
        }
      } else {
        this._hovered = { key, source: '__multi__', ids: new Set() };
      }

      this._showHover(hits, e.lngLat, key);
    },

    _showHover(features, lngLat, key) {
      const unique = this._dedup(features);
      const nextState = unique.length === 1 ? 'single' : 'peek';
      this._features = unique;
      this._lngLat = lngLat;
      this._currentKey = key;

      this._ensureOverlay();

      // Sync card DOM (diff, don't nuke)
      const showKeys = features.slice(0, nextState === 'single' ? 1 : PEEK_MAX).map(f => keyOf(f));
      this._syncCards(features, showKeys, nextState);

      // Update chrome (tip, cta)
      this._updateChrome(nextState);

      this._state = nextState;
      this._el.className = 'gp-fan-overlay ' + nextState;
      this._updatePosition();
    },

    // ── Smart card syncing (no full innerHTML nuke) ──
    _syncCards(allFeatures, showKeys, nextState) {
      const container = this._cardsEl;
      const oldKeys = this._displayKeys;
      const featureMap = new Map();
      for (const f of allFeatures) featureMap.set(keyOf(f), f);

      // Remove cards no longer needed
      const toRemove = oldKeys.filter(k => !showKeys.includes(k));
      for (const k of toRemove) {
        const el = container.querySelector(`[data-key="${CSS.escape(k)}"]`);
        if (el) {
          el.classList.add('leaving');
          setTimeout(() => el.remove(), 200);
        }
      }

      // Add or reposition cards
      const n = showKeys.length;
      const mid = (n - 1) / 2;
      showKeys.forEach((k, i) => {
        let el = container.querySelector(`[data-key="${CSS.escape(k)}"]`);
        if (el) {
          // Card exists → just update CSS vars for new position
          el.style.setProperty('--i', i);
          el.style.setProperty('--n', n);
          el.style.setProperty('--mid', mid);
          el.classList.remove('entering', 'leaving');
        } else {
          // New card → create and animate in
          const f = featureMap.get(k);
          if (!f) return;
          el = document.createElement('div');
          el.className = 'gp-fan-card entering';
          el.dataset.key = k;
          el.style.setProperty('--i', i);
          el.style.setProperty('--n', n);
          el.style.setProperty('--mid', mid);
          el.innerHTML = cardHTML(f.properties, { cta: nextState === 'single' });
          container.appendChild(el);
          // Trigger transition after paint
          requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
        }
      });

      this._displayKeys = [...showKeys];
    },

    _updateChrome(nextState) {
      // Tip arrow (single card only)
      if (nextState === 'single') {
        if (!this._tipEl) {
          this._tipEl = document.createElement('div');
          this._tipEl.className = 'gp-fan-tip';
          this._el.appendChild(this._tipEl);
        }
      } else if (this._tipEl) {
        this._tipEl.remove();
        this._tipEl = null;
      }

      // Remove picker elements if switching back to hover
      if (nextState !== 'picker') {
        if (this._pickerEl) { this._pickerEl.remove(); this._pickerEl = null; }
        if (this._backdropEl) { this._backdropEl.remove(); this._backdropEl = null; }
      }
    },

    _clearHoverState() {
      if (this._hovered && this._sourceExists(this._hovered.source)) {
        for (const id of this._hovered.ids) this._fs(this._hovered.source, id, 'hover', false);
      }
      this._hovered = null;
    },

    _endHover() {
      this._clearHoverState();
      if (this._state === 'single' || this._state === 'peek') this._close();
    },

    // ═══════════════════════════════════════════════════════════
    //  OVERLAY LIFECYCLE
    // ═══════════════════════════════════════════════════════════
    _ensureOverlay() {
      if (this._el) return;
      this._el = document.createElement('div');
      this._el.className = 'gp-fan-overlay';
      this._cardsEl = document.createElement('div');
      this._cardsEl.className = 'gp-fan-cards';
      this._el.appendChild(this._cardsEl);
      document.body.appendChild(this._el);
      this._mlMap.on('move', this._boundUpdatePos);
      this._displayKeys = [];
    },

    _updatePosition() {
      if (!this._el || !this._lngLat || !this._mlMap) return;
      const pt = this._mlMap.project(this._lngLat);
      const r = this._mlMap.getContainer().getBoundingClientRect();
      this._el.style.left = (r.left + pt.x) + 'px';
      this._el.style.top  = (r.top  + pt.y) + 'px';
    },

    _close() {
      if (!this._el) return;
      const el = this._el;
      el.classList.add('closing');
      this._el = null;
      this._cardsEl = null;
      this._tipEl = null;
      this._pickerEl = null;
      this._backdropEl = null;
      this._closeBtn = null;
      this._state = null;
      this._features = [];
      this._displayKeys = [];
      this._lngLat = null;
      this._currentKey = null;
      if (this._mlMap) this._mlMap.off('move', this._boundUpdatePos);
      setTimeout(() => el.remove(), 200);
    },

    // ═══════════════════════════════════════════════════════════
    //  CLICK → PICKER
    // ═══════════════════════════════════════════════════════════
    _onClick(e) {
      if (this._state === 'picker') return;

      // Peek → open picker with ALL features (deduplicated by key first)
      if (this._state === 'peek') {
        // Guard: if all peek features share the same key, open directly
        const unique = this._dedup(this._features);
        if (unique.length === 1) {
          this._endHover();
          this._openFeature(unique[0]);
          return;
        }
        this._features = unique;
        this._openPicker();
        return;
      }

      const hits = this._dedup(this._hitTestAll(e.point));
      if (hits.length === 0) { this.clearSelection(); return; }
      if (hits.length === 1) { this._endHover(); this._openFeature(hits[0]); return; }

      // Multiple features, no hover → open picker directly
      this._clearHoverState();
      this._features = hits;
      this._lngLat = e.lngLat;
      this._currentKey = hits.map(f => keyOf(f)).sort().join('|');
      this._openPicker();
    },

    _openPicker() {
      this._ensureOverlay();
      
      // Remove tip arrow
      if (this._tipEl) { this._tipEl.remove(); this._tipEl = null; }

      // Backdrop
      if (!this._backdropEl) {
        this._backdropEl = document.createElement('div');
        this._backdropEl.className = 'gp-fan-backdrop';
        this._backdropEl.addEventListener('click', (ev) => { ev.stopPropagation(); this._close(); });
        this._el.appendChild(this._backdropEl);
      }

      // Close button
      if (!this._closeBtn) {
        this._closeBtn = document.createElement('button');
        this._closeBtn.className = 'gp-fan-close';
        this._closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        this._closeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._close(); });
        this._el.appendChild(this._closeBtn);
      }

      const container = this._cardsEl;
      const n = this._features.length;
      const mid = (n - 1) / 2;
      
      // Check if cards already exist (from peek mode)
      const existingCards = container.querySelectorAll('.gp-fan-card');
      const hadCards = existingCards.length > 0;
      
      if (!hadCards) {
        // Build cards if they don't exist
        this._features.forEach((f, i) => {
          const el = document.createElement('div');
          el.className = 'gp-fan-card';
          el.dataset.key = keyOf(f);
          el.dataset.idx = i;
          el.style.setProperty('--i', i);
          el.style.setProperty('--n', n);
          el.style.setProperty('--mid', mid);
          el.innerHTML = cardHTML(f.properties, { cta: false });
          container.appendChild(el);
        });
      }

      // Switch to picker mode
      this._state = 'picker';
      this._el.className = 'gp-fan-overlay picker';
      
      // Bind click events to all cards
      container.querySelectorAll('.gp-fan-card').forEach((el, i) => {
        const f = this._features[i];
        if (!f) return;
        el.style.cursor = 'pointer';
        el.onclick = (ev) => {
          ev.stopPropagation();
          el.style.transform = 'scale(1.08)';
          el.style.zIndex = '200';
          el.style.boxShadow = '0 0 0 4px var(--primary, #2563eb)';
          setTimeout(() => {
            this._close();
            this._openFeature(f);
          }, 200);
        };
      });

      this._displayKeys = this._features.map(f => keyOf(f));
    },

    _selectPickerRow(row, idx) {
      const feature = this._features[idx];
      if (!feature) return;
      row.classList.add('selected');
      setTimeout(() => {
        this._close();
        this._openFeature(feature);
      }, 250);
    },

    // ═══════════════════════════════════════════════════════════
    //  OPEN FEATURE
    // ═══════════════════════════════════════════════════════════
    _openFeature(feature) {
      const p = feature.properties;
      
      if (isTravaux(feature)) {
        this._spotlight(feature);
        win.DataModule?.openTravauxModal?.(p);
        return;
      }
      
      // Projets normaux et contributions
      if (p.project_name && p.category) {
        this._spotlight(feature);
        if (win.UIModule?.showDetailPanel) {
          win.UIModule.showDetailPanel(p.category, { properties: p, geometry: feature.geometry });
        } else if (win.NavigationModule?.showProjectDetail) {
          win.NavigationModule.showProjectDetail(p, p.category);
        }
      }
    },

    // ═══════════════════════════════════════════════════════════
    //  DOM MARKER HANDLERS (called by datamodule.js)
    // ═══════════════════════════════════════════════════════════
    _onDOMMarkerHover(marker, feature, lngLat) {
      if (this._state === 'picker') return;
      const point = this._mlMap.project([lngLat.lng, lngLat.lat]);
      const hits = this._hitTestAll(point);
      const name = keyOf(feature);
      if (!hits.some(f => keyOf(f) === name)) hits.push(feature);

      const key = hits.length === 1 ? name : hits.map(f => keyOf(f)).sort().join('|');
      this._mlMap.getCanvas().style.cursor = 'pointer';

      if (key === this._currentKey && this._state) {
        if (this._state === 'single') { this._lngLat = lngLat; this._updatePosition(); }
        return;
      }

      this._clearHoverState();
      if (hits.length <= 1) {
        this._hovered = { key, source: null, ids: new Set() };
      } else {
        this._hovered = { key, source: '__multi__', ids: new Set() };
      }
      this._showHover(hits, lngLat, key);
    },

    _onDOMMarkerClick(marker, feature, lngLat) {
      if (this._state === 'picker') return;
      if (this._state === 'peek') { 
        const unique = this._dedup(this._features);
        if (unique.length === 1) { this._endHover(); this._openFeature(unique[0]); return; }
        this._features = unique;
        this._openPicker();
        return;
      }
      const point = this._mlMap.project([lngLat.lng, lngLat.lat]);
      const hits = this._dedup(this._hitTestAll(point));
      const name = keyOf(feature);
      if (!hits.some(f => keyOf(f) === name)) hits.push(feature);
      if (hits.length <= 1) { this._endHover(); this._openFeature(feature); return; }
      this._clearHoverState();
      this._features = hits;
      this._lngLat = lngLat;
      this._currentKey = hits.map(f => keyOf(f)).sort().join('|');
      this._openPicker();
    },

    // ═══════════════════════════════════════════════════════════
    //  SPOTLIGHT + DIM
    // ═══════════════════════════════════════════════════════════
    _spotlight(feature) {
      this.clearSelection();
      const name = keyOf(feature);
      const src = feature.source;
      const ids = this._setStateOnProject(src, name, { selected: true });
      this._selected = { name, source: src, ids };
      this._savedPaint = new Map();
      this._dimmedIds = new Map();
      // Travaux features are never dimmed — only highlight the selected one
      if (!isTravaux(feature)) {
        const pools = this._getPools();
        for (const pool of pools) {
          if (pool.sourceId === src) {
            this._dimPoolExcept(pool, ids);
            continue;
          }
          this._dimLayer(pool.layerId, 'line-opacity', DIM_LINE_OPACITY);
          if (pool.fillLayerId) this._dimLayer(pool.fillLayerId, 'fill-opacity', DIM_FILL_OPACITY);
        }
      }
      const matchPool = this._getPools().find(p => p.sourceId === src);
      if (matchPool) {
        const matchFeatures = (matchPool.features || []).filter(f => keyOf(f) === name);
        this._startGlow(src, matchPool, matchFeatures);
      }
    },

    _dimLayer(layerId, prop, val) {
      if (!this._mlMap.getLayer(layerId)) return;
      try {
        const cur = this._mlMap.getPaintProperty(layerId, prop);
        if (!this._savedPaint.has(layerId)) this._savedPaint.set(layerId, []);
        this._savedPaint.get(layerId).push({ prop, value: cur });
        this._mlMap.setPaintProperty(layerId, prop, val);
      } catch(_) {}
    },

    _dimPoolExcept(pool, excludeIds) {
      if (!pool.features || !this._sourceExists(pool.sourceId)) return;
      const dimmed = new Set();
      for (const f of pool.features) {
        if (f.id === undefined || excludeIds.has(f.id)) continue;
        try { this._mlMap.setFeatureState({ source: pool.sourceId, id: f.id }, { dimmed: true }); } catch(_) {}
        dimmed.add(f.id);
      }
      if (dimmed.size) this._dimmedIds.set(pool.sourceId, dimmed);
    },

    clearSelection(skipMapOps) {
      this._stopGlow();
      if (!this._selected && !this._savedPaint && !this._dimmedIds) return;
      if (!skipMapOps && this._mlMap) {
        if (this._dimmedIds) {
          for (const [source, ids] of this._dimmedIds) {
            if (!this._sourceExists(source)) continue;
            for (const id of ids) {
              try { this._mlMap.removeFeatureState({ source, id }, 'dimmed'); } catch(_) {}
            }
          }
        }
        if (this._savedPaint) {
          for (const [lid, props] of this._savedPaint) {
            if (!this._mlMap.getLayer(lid)) continue;
            for (const { prop, value } of props) {
              try { this._mlMap.setPaintProperty(lid, prop, value); } catch(_) {}
            }
          }
        }
        if (this._selected && this._sourceExists(this._selected.source)) {
          for (const id of this._selected.ids) this._fs(this._selected.source, id, 'selected', false);
        }
      }
      this._savedPaint = null;
      this._selected = null;
      this._dimmedIds = null;
    },

    // ═══════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════
    _getPools() {
      const sp = win.L?._sourcePool;
      return sp ? Array.from(sp._pools.values()) : [];
    },

    _setStateOnProject(source, name, state) {
      const ids = new Set();
      if (!name || !this._sourceExists(source)) return ids;
      try {
        for (const f of this._mlMap.querySourceFeatures(source)) {
          if (f.id === undefined || keyOf(f) !== name) continue;
          ids.add(f.id);
          this._mlMap.setFeatureState({ source, id: f.id }, state);
        }
      } catch(_) {}
      return ids;
    },

    _fs(source, id, key, value) {
      if (id === undefined || !this._sourceExists(source)) return;
      try {
        if (value) this._mlMap.setFeatureState({ source, id }, { [key]: true });
        else this._mlMap.removeFeatureState({ source, id }, key);
      } catch(_) {}
    },

    /**
     * Returns the geographic bounding box of a project from pool features.
     * Pure read — no visual or camera side effects.
     * @param {string} projectName
     * @returns {{ minLng, maxLng, minLat, maxLat } | null}
     */
    getProjectBounds(projectName) {
      if (!projectName) return null;
      const pools = this._getPools();
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      let found = false;
      for (const pool of pools) {
        if (!this._sourceExists(pool.sourceId) || !pool.features) continue;
        for (const f of pool.features) {
          if (f.id === undefined || keyOf(f) !== projectName) continue;
          for (const [lng, lat] of this._flatCoords(f.geometry?.coordinates || [])) {
            if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
            found = true;
          }
        }
      }
      return found ? { minLng, maxLng, minLat, maxLat } : null;
    },

    spotlightByName(projectName, opts) {
      if (!this._mlMap || !projectName) return false;
      const { dimOthers = true } = opts || {};
      this.clearSelection();
      const pools = this._getPools();
      let matchSrc = null, matchIds = new Set(), matchFeatures = [];
      for (const pool of pools) {
        if (!this._sourceExists(pool.sourceId) || !pool.features) continue;
        for (const f of pool.features) {
          if (f.id === undefined || keyOf(f) !== projectName) continue;
          matchSrc = pool.sourceId;
          matchIds.add(f.id);
          matchFeatures.push(f);
        }
        if (matchSrc) break;
      }
      if (!matchSrc || !matchIds.size) return false;
      for (const id of matchIds) this._fs(matchSrc, id, 'selected', true);
      this._selected = { name: projectName, source: matchSrc, ids: matchIds };

      // Pulsing glow overlay on the highlighted trace
      const matchPool = pools.find(p => p.sourceId === matchSrc);
      if (matchPool) this._startGlow(matchSrc, matchPool, matchFeatures);

      if (dimOthers) {
        // Detect if the spotlit project is a travaux project — never dim travaux
        const isTrav = matchFeatures.length > 0 && isTravaux(matchFeatures[0]);
        if (!isTrav) {
          this._savedPaint = new Map();
          this._dimmedIds = new Map();
          for (const pool of pools) {
            if (pool.sourceId === matchSrc) {
              this._dimPoolExcept(pool, matchIds);
              continue;
            }
            this._dimLayer(pool.layerId, 'line-opacity', DIM_LINE_OPACITY);
            if (pool.fillLayerId) this._dimLayer(pool.fillLayerId, 'fill-opacity', DIM_FILL_OPACITY);
          }
        }
      }
      return true;
    },

    _flatCoords(c) {
      const r = [];
      (function w(x) { if (typeof x[0]==='number') { r.push(x); return; } for (const i of x) w(i); })(c);
      return r;
    },

    // ═══════════════════════════════════════════════════════════
    //  GLOW PULSE — dedicated source + animated wide blurred line
    // ═══════════════════════════════════════════════════════════
    _glowSourceId: null,

    _startGlow(sourceId, pool, matchFeatures) {
      this._stopGlow();
      if (!this._mlMap || !pool) return;

      // Build a dedicated GeoJSON source with ONLY the matched features
      // This avoids the TypeError from setFeatureState updating shared source
      const glowSrcId = '__glow_src__';
      const glowLayerId = '__glow_layer__';

      try {
        // Get the line color: prefer per-feature _color (travaux direct path),
        // then fall back to the layer's paint property (SourcePool path)
        let color = '#3388ff';
        const featureColor = matchFeatures?.[0]?.properties?._color;
        if (featureColor) {
          color = featureColor;
        } else {
          try {
            const raw = this._mlMap.getPaintProperty(pool.layerId, 'line-color');
            if (typeof raw === 'string') color = raw;
          } catch(_) {}
        }

        // Collect features for the glow source
        const features = (matchFeatures || []).map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: {}
        }));

        if (!features.length) return;

        this._mlMap.addSource(glowSrcId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features }
        });

        this._mlMap.addLayer({
          id: glowLayerId,
          type: 'line',
          source: glowSrcId,
          paint: {
            'line-color': color,
            'line-width': 16,
            'line-opacity': 0.4,
            'line-blur': 10
          }
        }, pool.layerId); // Insert BELOW the main line

        this._glowLayerId = glowLayerId;
        this._glowSourceId = glowSrcId;
        this._glowStart = performance.now();

        const animate = () => {
          if (!this._glowLayerId) return;
          const t = (performance.now() - this._glowStart) / 1000;
          // Breathing: opacity 0.25 → 0.55, width 12 → 22
          const op = 0.40 + 0.15 * Math.sin(t * 2.2);
          const w = 17 + 5 * Math.sin(t * 2.2);
          try {
            if (this._mlMap.getLayer(glowLayerId)) {
              this._mlMap.setPaintProperty(glowLayerId, 'line-opacity', op);
              this._mlMap.setPaintProperty(glowLayerId, 'line-width', w);
            }
          } catch(_) {}
          this._glowRaf = requestAnimationFrame(animate);
        };
        this._glowRaf = requestAnimationFrame(animate);
      } catch(e) {
        console.warn('[FI] Glow layer failed:', e);
        this._stopGlow(); // Clean up on failure
      }
    },

    _stopGlow() {
      if (this._glowRaf) {
        cancelAnimationFrame(this._glowRaf);
        this._glowRaf = null;
      }
      if (this._mlMap) {
        try {
          if (this._glowLayerId && this._mlMap.getLayer(this._glowLayerId)) {
            this._mlMap.removeLayer(this._glowLayerId);
          }
        } catch(_) {}
        try {
          if (this._glowSourceId && this._mlMap.getSource(this._glowSourceId)) {
            this._mlMap.removeSource(this._glowSourceId);
          }
        } catch(_) {}
      }
      this._glowLayerId = null;
      this._glowSourceId = null;
    },

    destroy() {
      this.clearSelection();
      this._endHover();
      this._close();
      this._domMarkers = [];
      this._mlMap = null;
    }
  };

  win.FeatureInteractions = FI;
})(window);
