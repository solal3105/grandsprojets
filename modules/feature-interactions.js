/**
 * FEATURE INTERACTIONS — MapLibre GL natif
 *
 * Hover  : highlight toutes les features du même projet + popup
 * Click  : spotlight la contribution cliquée
 * Cursor : pointer sur les features interactives
 *
 * Dimming strategy:
 *   - selected features → feature-state { selected: true }
 *   - dim others        → layer-level setPaintProperty (O(layers))
 *   - clear             → restore paint + clear selected state
 */
;(function(win) {
  'use strict';

  const THROTTLE_MS = 14;
  const POPUP_OFFSET = [0, -12];
  const DIM_LINE_OPACITY = 0.12;
  const DIM_FILL_OPACITY = 0.04;
  const HIT_TOLERANCE = 5; // px — bounding box half-size for line hit detection

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function projectNameOf(props) {
    return props.project_name || props.name || props.nature_travaux || '';
  }

  function isInteractive(f) {
    const p = f.properties || {};
    return !!(p.project_name && p.category) || !!(p.nature_travaux || p.chantier_id);
  }

  function isContrib(f) {
    const p = f.properties || {};
    return !!(p.project_name && p.category);
  }

  function isTravaux(f) {
    const p = f.properties || {};
    return !!(p.nature_travaux || p.chantier_id);
  }

  // ─────────────────────────────────────────────────────────────
  const FI = {
    _mlMap: null,
    _popup: null,
    _hovered: null,     // { name, source, ids:Set }
    _selected: null,    // { name, source, ids:Set }
    _savedPaint: null,  // Map<layerId, { prop, value }[]>
    _timer: null,

    // ═══════════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════════
    init(mlMap) {
      if (!mlMap) return;
      this._mlMap = mlMap;
      this._popup = new win.maplibregl.Popup({
        closeButton: false, closeOnClick: false,
        className: 'gp-hover-popup', maxWidth: '280px',
        offset: POPUP_OFFSET, anchor: 'bottom'
      });
      mlMap.on('mousemove', (e) => this._onMove(e));
      mlMap.on('mouseout',  ()  => this._endHover());
      mlMap.on('click',     (e) => this._onClick(e));
      console.log('[FI] ✅ init');
    },

    // ═══════════════════════════════════════════════════════════
    //  SOURCE GUARD — central check before any feature-state op
    // ═══════════════════════════════════════════════════════════
    _sourceExists(source) {
      try { return !!this._mlMap.getSource(source); } catch (_) { return false; }
    },

    // ═══════════════════════════════════════════════════════════
    //  Called by SourcePool when a source is removed from the map.
    //  Drops any tracked hover/selection referencing that source.
    // ═══════════════════════════════════════════════════════════
    invalidateSource(sourceId) {
      if (this._hovered && this._hovered.source === sourceId) {
        this._hovered = null;
        if (this._popup && this._popup.isOpen()) this._popup.remove();
      }
      if (this._selected && this._selected.source === sourceId) {
        // Paint restore is still valid (layerIds are different from sourceIds)
        this._selected = null;
      }
      // Clean saved paint entries whose layers no longer exist
      if (this._savedPaint) {
        for (const layerId of this._savedPaint.keys()) {
          try { if (!this._mlMap.getLayer(layerId)) this._savedPaint.delete(layerId); } catch (_) {}
        }
      }
    },

    // ═══════════════════════════════════════════════════════════
    //  HOVER
    // ═══════════════════════════════════════════════════════════
    _onMove(e) {
      if (this._timer) return;
      this._timer = setTimeout(() => { this._timer = null; }, THROTTLE_MS);

      const hit = this._hitTest(e.point);
      if (!hit) { this._endHover(); this._mlMap.getCanvas().style.cursor = ''; return; }

      const name = projectNameOf(hit.properties);
      const src  = hit.source;

      if (this._hovered?.name === name && this._hovered?.source === src) {
        if (this._popup.isOpen()) this._popup.setLngLat(e.lngLat);
        return;
      }

      this._endHover();
      const ids = this._setStateOnProject(src, name, { hover: true });
      if (!ids.size) return;

      this._hovered = { name, source: src, ids };
      this._mlMap.getCanvas().style.cursor = 'pointer';
      this._showPopup(hit.properties, e.lngLat);
    },

    _endHover() {
      if (!this._hovered) return;
      if (this._sourceExists(this._hovered.source)) {
        for (const id of this._hovered.ids) {
          this._fs(this._hovered.source, id, 'hover', false);
        }
      }
      this._hovered = null;
      if (this._popup && this._popup.isOpen()) this._popup.remove();
    },

    _showPopup(props, lngLat) {
      const title = esc(projectNameOf(props));
      if (!title) return;
      const img = props.cover_url || props.imgUrl || '';
      const cat = props.category || '';
      const tw  = !!(props.nature_travaux || props.chantier_id);
      const imgHtml = img ? `<div class="gp-hp-img"><img src="${esc(img)}" alt="" loading="lazy"/></div>` : '';
      const tagHtml = cat ? `<span class="gp-hp-tag">${esc(cat)}</span>`
        : tw ? '<span class="gp-hp-tag gp-hp-tag--travaux"><i class="fa-solid fa-helmet-safety"></i> Travaux</span>' : '';
      this._popup
        .setLngLat(lngLat)
        .setHTML(`<div class="gp-hp">${imgHtml}<div class="gp-hp-body">${tagHtml}<div class="gp-hp-title">${title}</div><span class="gp-hp-cta"><i class="fa-solid fa-hand-pointer"></i> Cliquez pour en savoir plus</span></div></div>`)
        .addTo(this._mlMap);
    },

    // ═══════════════════════════════════════════════════════════
    //  CLICK — spotlight the clicked contribution
    // ═══════════════════════════════════════════════════════════
    _onClick(e) {
      const hit = this._hitTest(e.point);
      if (!hit) { this.clearSelection(); return; }

      if (isContrib(hit)) {
        const p = hit.properties;
        console.log('[FI] 🖱️ Click:', p.project_name);
        // Spotlight is handled by showProjectDetail → highlightProjectOnMap → spotlightByName.
        // Only spotlight here if UIModule is not available (fallback).
        if (!win.UIModule?.showDetailPanel) {
          this._spotlight(hit);
        } else {
          win.UIModule.showDetailPanel(p.category, { properties: p, geometry: hit.geometry });
          win.UIModule.updateActiveFilterTagsForLayer?.(p.category);
        }
        return;
      }
      if (isTravaux(hit)) {
        const p = hit.properties;
        console.log('[FI] 🖱️ Click travaux:', p.name || p.nature_travaux);
        this._spotlight(hit);
        win.DataModule?.openTravauxModal?.(p);
        return;
      }
      this.clearSelection();
    },

    /**
     * Spotlight: select project features + dim all OTHER layers via paint.
     */
    _spotlight(feature) {
      this.clearSelection();
      const name = projectNameOf(feature.properties);
      const src  = feature.source;

      const selectedIds = this._setStateOnProject(src, name, { selected: true });
      this._selected = { name, source: src, ids: selectedIds };

      this._savedPaint = new Map();
      const pools = this._getPools();
      for (const pool of pools) {
        if (pool.sourceId === src) continue;
        this._dimLayer(pool.layerId, 'line-opacity', DIM_LINE_OPACITY);
        if (pool.fillLayerId) {
          this._dimLayer(pool.fillLayerId, 'fill-opacity', DIM_FILL_OPACITY);
        }
      }
    },

    _dimLayer(layerId, prop, dimValue) {
      if (!this._mlMap.getLayer(layerId)) return;
      try {
        const current = this._mlMap.getPaintProperty(layerId, prop);
        if (!this._savedPaint.has(layerId)) this._savedPaint.set(layerId, []);
        this._savedPaint.get(layerId).push({ prop, value: current });
        this._mlMap.setPaintProperty(layerId, prop, dimValue);
      } catch (_) {}
    },

    /**
     * Clear selection and restore map state.
     * @param {boolean} [skipMapOps] - If true, only reset internal state.
     */
    clearSelection(skipMapOps) {
      if (!this._selected && !this._savedPaint) return;

      if (!skipMapOps && this._mlMap) {
        if (this._savedPaint) {
          for (const [layerId, props] of this._savedPaint) {
            if (!this._mlMap.getLayer(layerId)) continue;
            for (const { prop, value } of props) {
              try { this._mlMap.setPaintProperty(layerId, prop, value); } catch (_) {}
            }
          }
        }
        if (this._selected && this._sourceExists(this._selected.source)) {
          for (const id of this._selected.ids) {
            this._fs(this._selected.source, id, 'selected', false);
          }
        }
      }

      this._savedPaint = null;
      this._selected = null;
    },

    // ═══════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════

    _hitTest(point) {
      // Use a bounding box for easier line/polygon hit detection
      const bbox = [
        [point.x - HIT_TOLERANCE, point.y - HIT_TOLERANCE],
        [point.x + HIT_TOLERANCE, point.y + HIT_TOLERANCE]
      ];
      const features = this._mlMap.queryRenderedFeatures(bbox);
      return features?.find(isInteractive) || null;
    },

    _getPools() {
      const sp = win.L?._sourcePool;
      return sp ? Array.from(sp._pools.values()) : [];
    },

    _setStateOnProject(source, name, state) {
      const ids = new Set();
      if (!name || !this._sourceExists(source)) return ids;
      try {
        const all = this._mlMap.querySourceFeatures(source);
        for (const f of all) {
          if (f.id === undefined) continue;
          if (projectNameOf(f.properties) !== name) continue;
          ids.add(f.id);
          this._mlMap.setFeatureState({ source, id: f.id }, state);
        }
      } catch (_) {}
      return ids;
    },

    _fs(source, id, key, value) {
      if (id === undefined || !this._sourceExists(source)) return;
      try {
        if (value) {
          this._mlMap.setFeatureState({ source, id }, { [key]: true });
        } else {
          this._mlMap.removeFeatureState({ source, id }, key);
        }
      } catch (_) {}
    },

    /**
     * Spotlight a project by name — called from NavigationModule / submenu.
     * Finds the project across all pool sources and applies feature-state highlight + dim.
     * @param {string} projectName
     * @param {Object} [opts]
     * @param {boolean} [opts.panTo=true] - Pan map to project bounds
     * @param {boolean} [opts.dimOthers=true] - Dim non-matching pools
     */
    spotlightByName(projectName, opts) {
      if (!this._mlMap || !projectName) return;
      const { panTo = true, dimOthers = true } = opts || {};

      this.clearSelection();

      // Find which pool source contains this project
      const pools = this._getPools();
      let matchSource = null;
      let matchIds = new Set();

      for (const pool of pools) {
        if (!this._sourceExists(pool.sourceId)) continue;
        try {
          const all = this._mlMap.querySourceFeatures(pool.sourceId);
          for (const f of all) {
            if (f.id === undefined) continue;
            if (projectNameOf(f.properties) !== projectName) continue;
            matchSource = pool.sourceId;
            matchIds.add(f.id);
          }
        } catch (_) {}
        if (matchSource) break;
      }

      if (!matchSource || !matchIds.size) return;

      // Set feature-state selected on matching features
      for (const id of matchIds) {
        this._fs(matchSource, id, 'selected', true);
      }
      this._selected = { name: projectName, source: matchSource, ids: matchIds };

      // Dim other pools
      if (dimOthers) {
        this._savedPaint = new Map();
        for (const pool of pools) {
          if (pool.sourceId === matchSource) continue;
          this._dimLayer(pool.layerId, 'line-opacity', DIM_LINE_OPACITY);
          if (pool.fillLayerId) {
            this._dimLayer(pool.fillLayerId, 'fill-opacity', DIM_FILL_OPACITY);
          }
        }
      }

      // Pan to project bounds
      if (panTo) {
        try {
          const all = this._mlMap.querySourceFeatures(matchSource);
          let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
          for (const f of all) {
            if (projectNameOf(f.properties) !== projectName) continue;
            const coords = f.geometry?.coordinates;
            if (!coords) continue;
            const flat = this._flattenCoords(coords);
            for (const [lng, lat] of flat) {
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
            }
          }
          if (minLng !== Infinity) {
            this._mlMap.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
              padding: 80, maxZoom: 16, duration: 600
            });
          }
        } catch (_) {}
      }
    },

    _flattenCoords(coords) {
      const result = [];
      (function walk(c) {
        if (typeof c[0] === 'number') { result.push(c); return; }
        for (const item of c) walk(item);
      })(coords);
      return result;
    },

    destroy() {
      this.clearSelection();
      this._endHover();
      if (this._popup) this._popup.remove();
      this._mlMap = null;
    }
  };

  win.FeatureInteractions = FI;
})(window);
