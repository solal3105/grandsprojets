// modules/maplibre-compat.js
// Leaflet-compatible API backed by MapLibre GL JS
// Provides window.L namespace so existing modules work with minimal changes

;(function(win) {
  'use strict';

  if (!win.maplibregl) {
    console.error('[MapLibreCompat] maplibregl not loaded');
    return;
  }

  const mlgl = win.maplibregl;
  let _stampCounter = 0;
  const _stampMap = new WeakMap();

  const L = {};

  // ============================================================
  // UTILITIES
  // ============================================================

  L.stamp = function(obj) {
    if (!obj) return 0;
    if (_stampMap.has(obj)) return _stampMap.get(obj);
    const id = ++_stampCounter;
    _stampMap.set(obj, id);
    return id;
  };

  // Walk nested GeoJSON coordinates, call fn(lng, lat) on each leaf
  function _walkCoords(coords, fn) {
    if (typeof coords[0] === 'number') { fn(coords[0], coords[1]); return; }
    for (let i = 0; i < coords.length; i++) _walkCoords(coords[i], fn);
  }

  function toLatLng(a, b) {
    if (a == null) return { lat: 0, lng: 0 };
    if (typeof a === 'number' && typeof b === 'number') return { lat: a, lng: b };
    if (Array.isArray(a)) return { lat: a[0], lng: a[1] };
    if (a.lat !== undefined) return { lat: a.lat, lng: a.lng };
    return { lat: 0, lng: 0 };
  }

  L.latLng = function(a, b) {
    const ll = toLatLng(a, b);
    ll.distanceTo = function(other) {
      const o = toLatLng(other);
      const R = 6371000;
      const dLat = (o.lat - ll.lat) * Math.PI / 180;
      const dLng = (o.lng - ll.lng) * Math.PI / 180;
      const aVal = Math.sin(dLat/2)**2 + Math.cos(ll.lat*Math.PI/180)*Math.cos(o.lat*Math.PI/180)*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    };
    ll.equals = function(other) {
      if (!other) return false;
      const o = toLatLng(other);
      return Math.abs(ll.lat - o.lat) < 1e-9 && Math.abs(ll.lng - o.lng) < 1e-9;
    };
    return ll;
  };

  // Invalid bounds returned when a layer has no geometry (Leaflet compat)
  const _invalidBounds = {
    _southWest: null, _northEast: null,
    getSouthWest: () => null, getNorthEast: () => null,
    getCenter: () => L.latLng(0, 0),
    contains: () => false, extend: () => _invalidBounds,
    isValid: () => false, toBBoxArray: () => [0, 0, 0, 0]
  };

  L.latLngBounds = function(sw, ne) {
    const _sw = toLatLng(sw);
    const _ne = toLatLng(ne);
    return {
      _southWest: _sw,
      _northEast: _ne,
      getSouthWest: () => _sw,
      getNorthEast: () => _ne,
      getCenter: () => L.latLng((_sw.lat + _ne.lat) / 2, (_sw.lng + _ne.lng) / 2),
      contains: (ll) => {
        const p = toLatLng(ll);
        return p.lat >= _sw.lat && p.lat <= _ne.lat && p.lng >= _sw.lng && p.lng <= _ne.lng;
      },
      extend: (ll) => {
        const p = toLatLng(ll);
        _sw.lat = Math.min(_sw.lat, p.lat);
        _sw.lng = Math.min(_sw.lng, p.lng);
        _ne.lat = Math.max(_ne.lat, p.lat);
        _ne.lng = Math.max(_ne.lng, p.lng);
        return { _southWest: _sw, _northEast: _ne, getSouthWest: () => _sw, getNorthEast: () => _ne };
      },
      isValid: () => true,
      toBBoxArray: () => [_sw.lng, _sw.lat, _ne.lng, _ne.lat]
    };
  };

  // ============================================================
  // COLOR UTILITIES
  // ============================================================

  // Convert CSS color (including var(), color-mix(), etc.) to a value MapLibre GL accepts — cached
  const _colorCache = new Map();
  // Reusable hidden element for forcing browser color resolution
  let _colorProbe = null;
  function _getColorProbe() {
    if (!_colorProbe) {
      _colorProbe = document.createElement('div');
      _colorProbe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
      document.body.appendChild(_colorProbe);
    }
    return _colorProbe;
  }
  // Convert a browser-serialized color string (rgb(...) or color(srgb ...)) to #rrggbb.
  // Returns null if the format is not recognised.
  function _parseBrowserColor(str) {
    // rgb(r, g, b) — standard serialization on all browsers
    const rgbM = str.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (rgbM) return '#' + [rgbM[1], rgbM[2], rgbM[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
    // color(srgb r g b) — CSS Color Level 4 format returned by modern browsers (Safari ≥15, Chrome ≥111)
    //   values are floats in [0, 1], multiply × 255 to get 8-bit channels
    const srgbM = str.match(/^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)$/);
    if (srgbM) return '#' + [srgbM[1], srgbM[2], srgbM[3]].map(n => Math.round(Math.min(1, Math.max(0, parseFloat(n))) * 255).toString(16).padStart(2, '0')).join('');
    return null;
  }

  function resolveColor(color) {
    if (!color || typeof color !== 'string') return color;
    // Plain hex/rgb/named color — MapLibre handles these natively
    if (!color.startsWith('var(') && !color.startsWith('color-mix(')) return color;

    const cached = _colorCache.get(color);
    if (cached !== undefined) return cached;

    // Step 1: resolve var() → get the raw CSS value (may itself be color-mix or another function)
    let raw = color;
    if (color.startsWith('var(')) {
      const varName = color.match(/var\((--[^,)]+)/)?.[1];
      if (varName) {
        raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || color;
      }
    }

    // Step 2: if still a CSS function (color-mix, color(srgb…), oklch, etc.), resolve via a probe element
    if (raw.startsWith('color-mix(') || raw.startsWith('oklch(') || raw.startsWith('hsl(') || raw.startsWith('rgb(') || raw.startsWith('color(')) {
      try {
        const probe = _getColorProbe();
        probe.style.color = raw;
        const computed = getComputedStyle(probe).color; // usually rgb(r, g, b); may be color(srgb ...) on P3 displays
        probe.style.color = '';
        if (computed && computed !== raw) {
          const result = _parseBrowserColor(computed) ?? computed;
          _colorCache.set(color, result);
          return result;
        }
      } catch {}
      // Fallback: probe returned same string (P3 display) — parse color(srgb …) directly
      const direct = _parseBrowserColor(raw);
      if (direct) {
        _colorCache.set(color, direct);
        return direct;
      }
    }

    // Don't cache failed resolutions: CSS vars may not be loaded yet
    if (!raw.startsWith('var(')) _colorCache.set(color, raw);
    return raw;
  }
  // Clear cache on theme change
  function clearColorCache() { _colorCache.clear(); }

  // ============================================================
  // SOURCE POOL - Reduce MapLibre GL sources
  // ============================================================

  class SourcePool {
    constructor() {
      this._pools = new Map(); // key: styleHash, value: { sourceId, features: [], layers: [] }
      this._stampToPool = new Map(); // stamp → styleHash for O(1) pool lookup in removeFeature
      this._nextId = 0;
      this._batching = false;
      this._dirtyPools = new Set();
      this._activeFilter = null; // persisted filter expression
      this._activeMlMap = null;  // map reference for deferred filter application
    }

    beginBatch() {
      this._batching = true;
      this._dirtyPools.clear();
    }

    endBatch(mlMap) {
      this._batching = false;
      for (const styleHash of this._dirtyPools) {
        const pool = this._pools.get(styleHash);
        if (pool) {
          const source = mlMap.getSource(pool.sourceId);
          if (source) {
            source.setData({ type: 'FeatureCollection', features: pool.features });
          }
        }
      }
      this._dirtyPools.clear();
    }

    _getStyleHash(geomType, style) {
      // Create a hash based on geometry type and ALL style properties
      const parts = [
        geomType,
        resolveColor(style.color) || 'default',
        style.weight || 3,
        style.opacity !== undefined ? style.opacity : 1
      ];
      
      // For polygons, include fill properties
      if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
        parts.push(resolveColor(style.fillColor || style.color) || 'default');
        parts.push(style.fillOpacity !== undefined ? style.fillOpacity : 0.2);
      }
      
      return parts.join('-');
    }

    addFeature(mlMap, geomType, geojson, style, pathLayer) {
      const styleHash = this._getStyleHash(geomType, style);

      if (!this._pools.has(styleHash)) {
        // Create new pooled source
        const sourceId = `pool-${this._nextId++}`;
        const layerId = `${sourceId}-layer`;

        // Add feature ID for event mapping and feature-state support
        geojson.properties = geojson.properties || {};
        geojson.properties._pool_layer_id = L.stamp(pathLayer);
        geojson.id = L.stamp(pathLayer); // MapLibre GL feature ID for feature-state

        mlMap.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [geojson] },
          generateId: false // Use our own IDs
        });

        const w = style.weight || 3;
        const baseOp = style.opacity !== undefined ? style.opacity : 0.8;
        const baseFillOp = style.fillOpacity !== undefined ? style.fillOpacity : 0.2;
        const lineColor = resolveColor(style.color) || '#3388ff';
        const linePaint = {
          'line-color': lineColor,
          'line-width': ['case',
            ['boolean', ['feature-state', 'selected'], false], w + 4,
            ['boolean', ['feature-state', 'hover'], false], w + 2,
            w
          ],
          'line-opacity': ['case',
            ['boolean', ['feature-state', 'selected'], false], 1,
            ['boolean', ['feature-state', 'hover'], false], 1,
            ['boolean', ['feature-state', 'dimmed'], false], 0.15,
            baseOp
          ]
        };

        if (geomType === 'LineString' || geomType === 'MultiLineString') {
          mlMap.addLayer({ id: layerId, type: 'line', source: sourceId, paint: linePaint });
        } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
          const fillLayerId = `${sourceId}-fill`;
          mlMap.addLayer({
            id: fillLayerId, type: 'fill', source: sourceId,
            paint: {
              'fill-color': resolveColor(style.fillColor || style.color) || '#3388ff',
              'fill-opacity': ['case',
                ['boolean', ['feature-state', 'selected'], false], Math.min(baseFillOp + 0.35, 0.7),
                ['boolean', ['feature-state', 'hover'], false], Math.min(baseFillOp + 0.2, 0.6),
                ['boolean', ['feature-state', 'dimmed'], false], 0.05,
                baseFillOp
              ]
            }
          });
          mlMap.addLayer({ id: layerId, type: 'line', source: sourceId, paint: linePaint });
        }

        const newPool = {
          sourceId,
          layerId,
          fillLayerId: geomType === 'Polygon' || geomType === 'MultiPolygon' ? `${sourceId}-fill` : null,
          features: [geojson],
          layers: [pathLayer],
          geomType
        };
        this._pools.set(styleHash, newPool);
        this._stampToPool.set(L.stamp(pathLayer), styleHash);
        this._applyFilterToPool(newPool);

        // Events (hover/click/cursor) handled by FeatureInteractions at map level
      } else {
        // Add to existing pool
        const pool = this._pools.get(styleHash);
        geojson.properties = geojson.properties || {};
        geojson.properties._pool_layer_id = L.stamp(pathLayer);
        geojson.id = L.stamp(pathLayer); // MapLibre GL feature ID

        pool.features.push(geojson);
        pool.layers.push(pathLayer);
        this._stampToPool.set(L.stamp(pathLayer), styleHash);

        // Update source (deferred if batching)
        if (this._batching) {
          this._dirtyPools.add(styleHash);
        } else {
          const source = mlMap.getSource(pool.sourceId);
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features: pool.features
            });
          }
        }

        // Events handled by FeatureInteractions at map level
      }
    }


    // Set a MapLibre filter expression on all pool layers (and persist for future pools)
    setFilter(mlMap, filterExpr) {
      this._activeFilter = filterExpr;
      this._activeMlMap = mlMap;
      for (const pool of this._pools.values()) {
        try {
          if (mlMap.getLayer(pool.layerId)) mlMap.setFilter(pool.layerId, filterExpr);
          if (pool.fillLayerId && mlMap.getLayer(pool.fillLayerId)) mlMap.setFilter(pool.fillLayerId, filterExpr);
        } catch {}
      }
    }

    // Apply the stored filter to a single newly-registered pool (called from _createDirectSource)
    _applyFilterToPool(pool) {
      if (!this._activeFilter || !this._activeMlMap) return;
      const mlMap = this._activeMlMap;
      try {
        if (mlMap.getLayer(pool.layerId)) mlMap.setFilter(pool.layerId, this._activeFilter);
        if (pool.fillLayerId && mlMap.getLayer(pool.fillLayerId)) mlMap.setFilter(pool.fillLayerId, this._activeFilter);
      } catch {}
    }

    // Clear filters on all pool layers
    clearFilter(mlMap) {
      this.setFilter(mlMap, null);
    }

    // Update line-width paint property on all pool layers (O(pools) instead of per-feature setStyle)
    setLineWidth(mlMap, width) {
      for (const pool of this._pools.values()) {
        try {
          if (mlMap.getLayer(pool.layerId)) {
            mlMap.setPaintProperty(pool.layerId, 'line-width', [
              'case',
              ['boolean', ['feature-state', 'selected'], false], width + 4,
              ['boolean', ['feature-state', 'hover'], false], width + 2,
              width
            ]);
          }
        } catch {}
      }
    }

    removeFeature(mlMap, pathLayer) {
      const layerId = L.stamp(pathLayer);

      // O(1) pool lookup via stamp map (instead of iterating all pools)
      const styleHash = this._stampToPool.get(layerId);
      if (styleHash === undefined) return;
      this._stampToPool.delete(layerId);

      const pool = this._pools.get(styleHash);
      if (!pool) return;

      const idx = pool.layers.findIndex(l => L.stamp(l) === layerId);
      if (idx >= 0) {
          pool.layers.splice(idx, 1);
          pool.features.splice(idx, 1);

          if (pool.features.length === 0) {
            // Notify FeatureInteractions before removing the source
            if (win.FeatureInteractions) {
              win.FeatureInteractions.invalidateSource(pool.sourceId);
            }
            // Remove empty pool - clean up all layers
            try {
              if (pool.fillLayerId && mlMap.getLayer(pool.fillLayerId)) {
                mlMap.removeLayer(pool.fillLayerId);
              }
              if (mlMap.getLayer(pool.layerId)) {
                mlMap.removeLayer(pool.layerId);
              }
              if (mlMap.getSource(pool.sourceId)) {
                mlMap.removeSource(pool.sourceId);
              }
            } catch {
              console.warn('[SourcePool] Error removing empty pool:', e);
            }
            this._pools.delete(styleHash);
          } else {
            // Update source with remaining features (deferred if batching)
            if (this._batching) {
              this._dirtyPools.add(styleHash);
            } else {
              const source = mlMap.getSource(pool.sourceId);
              if (source) {
                source.setData({
                  type: 'FeatureCollection',
                  features: pool.features
                });
              }
            }
          }
      }
    }
  }

  // Global source pool
  L._sourcePool = new SourcePool();

  // ============================================================
  // EVENT MIXIN
  // ============================================================

  class EventEmitter {
    constructor() { this._events = {}; }
    on(type, fn) {
      if (!this._events[type]) this._events[type] = [];
      this._events[type].push(fn);
      return this;
    }
    off(type, fn) {
      if (!this._events[type]) return this;
      if (fn) this._events[type] = this._events[type].filter(f => f !== fn);
      else delete this._events[type];
      return this;
    }
    once(type, fn) {
      const wrapped = (...args) => { this.off(type, wrapped); fn.apply(this, args); };
      return this.on(type, wrapped);
    }
    fire(type, data) {
      if (!this._events[type]) return this;
      const evt = Object.assign({ type, target: this }, data || {});
      this._events[type].slice().forEach(fn => { try { fn(evt); } catch { console.warn(e); } });
      return this;
    }
    listens(type) { return !!(this._events[type] && this._events[type].length); }
    addEventListener(t, fn) { return this.on(t, fn); }
    removeEventListener(t, fn) { return this.off(t, fn); }
  }

  // ============================================================
  // ICON CLASSES
  // ============================================================

  class DivIcon {
    constructor(options) {
      this.options = Object.assign({
        html: '',
        className: 'leaflet-div-icon',
        iconSize: [12, 12],
        iconAnchor: null,
        popupAnchor: [0, -30]
      }, options);
    }
    createIcon() {
      const el = document.createElement('div');
      el.className = this.options.className || '';
      if (typeof this.options.html === 'string') el.innerHTML = this.options.html;
      else if (this.options.html instanceof HTMLElement) el.appendChild(this.options.html);
      if (this.options.iconSize) {
        const s = Array.isArray(this.options.iconSize) ? this.options.iconSize : [this.options.iconSize, this.options.iconSize];
        el.style.width = s[0] + 'px';
        el.style.height = s[1] + 'px';
      }
      return el;
    }
  }

  class Icon {
    constructor(options) {
      this.options = Object.assign({
        iconUrl: '',
        iconRetinaUrl: '',
        shadowUrl: '',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      }, options);
    }
    createIcon() {
      const el = document.createElement('div');
      const img = document.createElement('img');
      img.src = this.options.iconUrl;
      if (this.options.iconSize) {
        img.style.width = this.options.iconSize[0] + 'px';
        img.style.height = this.options.iconSize[1] + 'px';
      }
      el.appendChild(img);
      return el;
    }
  }

  // Icon.Default setup - use a wrapper object instead of modifying class prototype
  Icon.Default = function(options) { return new Icon(options); };
  Icon.Default._getIconUrl = true; // Stub so delete L.Icon.Default._getIconUrl works
  Icon.Default.prototype = { _getIconUrl: true }; // For delete L.Icon.Default.prototype._getIconUrl
  Icon.Default.mergeOptions = function(opts) {
    // Merge into Icon's default options
    if (!Icon._defaultOptions) Icon._defaultOptions = {};
    Object.assign(Icon._defaultOptions, opts);
  };

  L.divIcon = function(options) { return new DivIcon(options); };
  L.icon = function(options) { return new Icon(options); };
  L.Icon = Icon;
  L.DivIcon = DivIcon;

  // ============================================================
  // POPUP
  // ============================================================

  class Popup extends EventEmitter {
    constructor(options) {
      super();
      this.options = Object.assign({ offset: [0, -30], className: '', maxWidth: 300, closeButton: true, autoPan: true }, options);
      this._mlPopup = null;
      this._content = '';
      this._latlng = null;
    }
    setContent(content) { this._content = content; return this; }
    setLatLng(latlng) { this._latlng = toLatLng(latlng); return this; }
    getLatLng() { return this._latlng; }
    getContent() { return this._content; }
    openOn(map) {
      if (!this._latlng) return this;
      if (this._mlPopup) this._mlPopup.remove();
      const offset = this.options.offset || [0, -30];
      this._mlPopup = new mlgl.Popup({
        offset: Array.isArray(offset) ? offset : [0, typeof offset === 'number' ? offset : -30],
        className: this.options.className || '',
        maxWidth: this.options.maxWidth || 300,
        closeButton: this.options.closeButton !== false
      })
      .setLngLat([this._latlng.lng, this._latlng.lat])
      .setHTML(typeof this._content === 'string' ? this._content : '')
      .addTo(map._mlMap || map);
      return this;
    }
    remove() { if (this._mlPopup) { this._mlPopup.remove(); this._mlPopup = null; } return this; }
    isOpen() { return !!this._mlPopup; }
  }

  L.popup = function(options) { return new Popup(options); };
  L.Popup = Popup;

  // ============================================================
  // TOOLTIP (implemented as small popup)
  // ============================================================

  class Tooltip extends EventEmitter {
    constructor(options) {
      super();
      this.options = Object.assign({
        permanent: false, direction: 'top', className: '', offset: [0, 0], opacity: 0.9, interactive: false, sticky: false
      }, options);
      this._content = '';
      this._mlPopup = null;
      this._latlng = null;
    }
    setContent(content) { this._content = content; return this; }
    setLatLng(latlng) {
      this._latlng = toLatLng(latlng);
      if (this._mlPopup) this._mlPopup.setLngLat([this._latlng.lng, this._latlng.lat]);
      return this;
    }
    addTo(map) {
      if (!this._latlng) return this;
      const anchor = this.options.direction === 'bottom' ? 'top' : 'bottom';
      this._mlPopup = new mlgl.Popup({
        closeButton: false,
        closeOnClick: !this.options.permanent,
        className: 'maplibre-tooltip ' + (this.options.className || ''),
        anchor: anchor,
        offset: this.options.offset || [0, 0]
      })
      .setLngLat([this._latlng.lng, this._latlng.lat])
      .setHTML(typeof this._content === 'string' ? this._content : '')
      .addTo(map._mlMap || map);
      return this;
    }
    remove() { if (this._mlPopup) { this._mlPopup.remove(); this._mlPopup = null; } return this; }
  }

  L.tooltip = function(options) { return new Tooltip(options); };
  L.Tooltip = Tooltip;

  // ============================================================
  // MARKER
  // ============================================================

  class LMarker extends EventEmitter {
    constructor(latlng, options) {
      super();
      this._latlng = toLatLng(latlng);
      this.options = Object.assign({ icon: null, riseOnHover: false, draggable: false, pane: 'markerPane' }, options);
      this._mlMarker = null;
      this._map = null;
      this._tooltip = null;
      this._popup = null;
      this._popupContent = null;
      this._visible = true;
      this.feature = null;
    }
    addTo(map) {
      this._map = map;
      const el = this._createEl();
      const anchor = this._getAnchor();
      this._mlMarker = new mlgl.Marker({ element: el, anchor: 'center', offset: anchor, draggable: this.options.draggable })
        .setLngLat([this._latlng.lng, this._latlng.lat]);
      if (map._mlMap) this._mlMarker.addTo(map._mlMap);
      else this._mlMarker.addTo(map);

      // Wire DOM events on the marker element to our EventEmitter
      const self = this;
      el.addEventListener('click', function(ev) {
        ev.stopPropagation();
        self.fire('click', { latlng: self._latlng, originalEvent: ev, target: self });
      });
      el.addEventListener('mouseenter', function(ev) {
        self.fire('mouseover', { latlng: self._latlng, originalEvent: ev, target: self });
      });
      el.addEventListener('mouseleave', function(ev) {
        self.fire('mouseout', { latlng: self._latlng, originalEvent: ev, target: self });
      });
      el.addEventListener('contextmenu', function(ev) {
        self.fire('contextmenu', { latlng: self._latlng, originalEvent: ev, target: self });
      });

      if (this.options.draggable) {
        this._mlMarker.on('dragend', () => {
          const ll = this._mlMarker.getLngLat();
          this._latlng = { lat: ll.lat, lng: ll.lng };
          this.fire('dragend', { target: this });
          this.fire('drag', { target: this });
        });
      }
      this.fire('add', { target: this });
      return this;
    }
    remove() {
      if (this._mlMarker) { this._mlMarker.remove(); this._mlMarker = null; }
      if (this._tooltip) this._tooltip.remove();
      if (this._popup && this._popup._mlPopup) this._popup._mlPopup.remove();
      this.fire('remove', { target: this });
      return this;
    }
    setLatLng(latlng) {
      this._latlng = toLatLng(latlng);
      if (this._mlMarker) this._mlMarker.setLngLat([this._latlng.lng, this._latlng.lat]);
      return this;
    }
    getLatLng() { return this._latlng; }
    setIcon(icon) {
      this.options.icon = icon;
      if (this._mlMarker) {
        const el = this._createEl();
        this._mlMarker.getElement().replaceWith(el);
      }
      return this;
    }
    setOpacity(val) {
      if (this._mlMarker) this._mlMarker.getElement().style.opacity = val;
      return this;
    }
    getElement() {
      return this._mlMarker ? this._mlMarker.getElement() : null;
    }
    bindTooltip(content, options) {
      this._tooltipContent = content;
      this._tooltipOptions = options || {};
      return this;
    }
    openTooltip() {
      if (!this._tooltipContent || !this._map) return this;
      if (this._tooltip) this._tooltip.remove();
      this._tooltip = new Tooltip(this._tooltipOptions);
      this._tooltip.setContent(typeof this._tooltipContent === 'function' ? this._tooltipContent(this) : this._tooltipContent);
      this._tooltip.setLatLng(this._latlng);
      this._tooltip.addTo(this._map);
      return this;
    }
    closeTooltip() {
      if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
      return this;
    }
    bindPopup(content, options) {
      this._popupContent = content;
      this._popupOptions = options || {};
      return this;
    }
    openPopup() {
      if (!this._popupContent || !this._map) return this;
      if (this._popup) this._popup.remove();
      this._popup = new Popup(this._popupOptions);
      this._popup.setContent(typeof this._popupContent === 'function' ? this._popupContent(this) : this._popupContent);
      this._popup.setLatLng(this._latlng);
      this._popup.openOn(this._map);
      return this;
    }
    closePopup() {
      if (this._popup) { this._popup.remove(); this._popup = null; }
      return this;
    }
    togglePopup() {
      if (this._popup && this._popup.isOpen()) this.closePopup();
      else this.openPopup();
      return this;
    }
    setZIndexOffset(offset) {
      if (this._mlMarker) this._mlMarker.getElement().style.zIndex = offset;
      return this;
    }
    toGeoJSON() {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [this._latlng.lng, this._latlng.lat] }, properties: this.feature ? this.feature.properties : {} };
    }
    getBounds() {
      return L.latLngBounds([this._latlng.lat, this._latlng.lng], [this._latlng.lat, this._latlng.lng]);
    }
    _createEl() {
      const icon = this.options.icon;
      if (icon && typeof icon.createIcon === 'function') return icon.createIcon();
      const el = document.createElement('div');
      el.className = 'maplibre-default-marker';
      el.innerHTML = '<svg width="25" height="41" viewBox="0 0 25 41"><path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 2.5.7 4.8 2 6.8L12.5 41l10.5-21.7c1.3-2 2-4.3 2-6.8C25 5.6 19.4 0 12.5 0z" fill="#3388ff"/><circle cx="12.5" cy="12.5" r="5" fill="white"/></svg>';
      return el;
    }
    _getAnchor() {
      const icon = this.options.icon;
      if (icon && icon.options && icon.options.iconAnchor) {
        const a = icon.options.iconAnchor;
        const s = icon.options.iconSize || [0, 0];
        return [a[0] - s[0]/2, a[1] - s[1]/2];
      }
      return [0, 0];
    }
  }

  L.Marker = LMarker;
  L.marker = function(latlng, options) { return new LMarker(latlng, options); };

  // ============================================================
  // TILE LAYER
  // ============================================================

  class TileLayer extends EventEmitter {
    constructor(urlTemplate, options) {
      super();
      this.options = Object.assign({ attribution: '', tileSize: 256 }, options);
      this._urlTemplate = urlTemplate;
      this._map = null;
      this._sourceId = 'basemap-' + (++_stampCounter);
      this._layerId = this._sourceId + '-layer';
    }
    addTo(map) {
      this._map = map;
      const doAdd = () => {
        const mlMap = map._mlMap || map;
        // Handle {s} subdomain pattern by creating multiple tile URLs
        const urls = [];
        if (this._urlTemplate.includes('{s}')) {
          ['a', 'b', 'c'].forEach(s => {
            urls.push(this._urlTemplate.replace('{s}', s));
          });
        } else {
          urls.push(this._urlTemplate);
        }

        try {
          if (mlMap.getLayer(this._layerId)) mlMap.removeLayer(this._layerId);
          if (mlMap.getSource(this._sourceId)) mlMap.removeSource(this._sourceId);
        } catch {}

        mlMap.addSource(this._sourceId, {
          type: 'raster',
          tiles: urls,
          tileSize: this.options.tileSize || 256,
          attribution: this.options.attribution || ''
        });

        // Add layer at the bottom (before any existing non-raster layers)
        const layers = mlMap.getStyle().layers || [];
        const firstNonRaster = layers.find(l => l.type !== 'raster');
        mlMap.addLayer({
          id: this._layerId,
          type: 'raster',
          source: this._sourceId
        }, firstNonRaster ? firstNonRaster.id : undefined);

        this.fire('add');
      };

      if (map._styleLoaded === false) {
        map._queue.push(doAdd);
      } else {
        doAdd();
      }
      return this;
    }
    remove() {
      if (this._map) {
        const mlMap = this._map._mlMap || this._map;
        try {
          if (mlMap.getLayer(this._layerId)) mlMap.removeLayer(this._layerId);
          if (mlMap.getSource(this._sourceId)) mlMap.removeSource(this._sourceId);
        } catch {}
      }
      this.fire('remove');
      return this;
    }
    setUrl(url) {
      this._urlTemplate = url;
      if (this._map) { this.remove(); this.addTo(this._map); }
      return this;
    }
    getAttribution() { return this.options.attribution; }
  }

  L.TileLayer = TileLayer;
  L.tileLayer = function(url, options) { return new TileLayer(url, options); };

  // ============================================================
  // VECTOR BASEMAP (MapLibre GL style — no setStyle(), no data loss)
  // ============================================================
  //
  // Strategy: never call mlMap.setStyle() — it wipes all user data layers.
  // Instead, fetch the style JSON and inject its sources/layers directly using
  // prefixed IDs (__vbm__<id>), inserted before user data layers.
  // _cleanupOwned() scans the live style by prefix — never misses anything.

  class VectorBasemap extends EventEmitter {
    constructor(styleUrl, options) {
      super();
      this._styleUrl = styleUrl;
      this.options = Object.assign({ attribution: '' }, options);
      this._map = null;
    }

    addTo(map) {
      this._map = map;
      const mlMap = map._mlMap || map;
      // Remove any __vbm__ layers/sources from a previous apply before re-injecting
      this._cleanupOwned(mlMap);
      this._applyStyle(mlMap);
      return this;
    }

    async _applyStyle(mlMap) {
      try {
        const resp = await fetch(this._styleUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const styleJson = await resp.json();

        // Update glyphs so road labels render with correct fonts.
        // setGlyphs() only updates the glyph URL — does NOT touch sources or layers.
        if (styleJson.glyphs && typeof mlMap.setGlyphs === 'function') {
          try { mlMap.setGlyphs(styleJson.glyphs); } catch {}
        }

        // Do NOT call setSprite() — the basemap sprite references images (e.g. fill-pattern
        // textures) that may not exist in every environment. We inject individual layers
        // so the sprite is unnecessary; pattern layers are stripped below.

        // Insertion anchor: first app-data layer — vbm layers go BELOW it
        const anchor = this._findAnchorLayer(mlMap);

        // Map original source IDs → prefixed IDs to avoid collisions
        const sourceIdMap = {};
        for (const [origId, srcDef] of Object.entries(styleJson.sources || {})) {
          const prefixed = `__vbm__${origId}`;
          sourceIdMap[origId] = prefixed;
          if (mlMap.getSource(prefixed)) continue;
          try {
            mlMap.addSource(prefixed, srcDef);
          } catch {
            console.warn('[VectorBasemap] addSource failed:', prefixed, e.message);
          }
        }

        // Add layers in style order, each prefixed and wired to the prefixed source.
        // Skip layers that use fill-pattern or icon-image — they depend on the external
        // sprite and would produce "image could not be loaded" warnings.
        for (const layer of (styleJson.layers || [])) {
          if (layer.source && !sourceIdMap[layer.source]) continue;
          if (layer.paint?.['fill-pattern'] || layer.layout?.['icon-image']) continue;
          const ml = JSON.parse(JSON.stringify(layer));
          ml.id = `__vbm__${layer.id}`;
          if (ml.source) ml.source = sourceIdMap[ml.source];
          if (mlMap.getLayer(ml.id)) continue;
          try {
            mlMap.addLayer(ml, anchor);
          } catch {
            console.warn('[VectorBasemap] addLayer failed:', ml.id, e.message);
          }
        }

        this.fire('add');
      } catch {
        console.error('[VectorBasemap] Failed to load/apply style:', this._styleUrl, e);
      }
    }

    /**
     * First layer that belongs to user/app data (projects, 3D buildings…).
     * All vbm layers are inserted BEFORE this so they render underneath.
     */
    _findAnchorLayer(mlMap) {
      const style = mlMap.getStyle();
      if (!style) return undefined;
      return (style.layers || []).find(l =>
        !l.id.startsWith('__vbm__') &&
        !l.id.startsWith('basemap-') &&
        l.type !== 'background' &&
        l.type !== 'sky'
      )?.id;
    }

    /**
     * Remove ALL __vbm__ layers then ALL __vbm__ sources by scanning the live
     * style — no tracking list needed, never misses layers added by a prior run.
     * Layers MUST be removed before their sources (MapLibre requirement).
     */
    _cleanupOwned(mlMap) {
      const style = mlMap.getStyle();
      if (!style) return;
      // 1) Layers first
      for (const layer of (style.layers || [])) {
        if (!layer.id.startsWith('__vbm__')) continue;
        try { mlMap.removeLayer(layer.id); } catch {}
      }
      // 2) Sources after all layers referencing them are gone
      for (const id of Object.keys(style.sources || {})) {
        if (!id.startsWith('__vbm__')) continue;
        try { mlMap.removeSource(id); } catch {}
      }
    }

    remove() {
      if (this._map) {
        const mlMap = this._map._mlMap || this._map;
        this._cleanupOwned(mlMap);
      }
      this.fire('remove');
      return this;
    }

    getAttribution() { return this.options.attribution; }
  }

  L.VectorBasemap = VectorBasemap;
  L.vectorBasemap = function(styleUrl, options) { return new VectorBasemap(styleUrl, options); };

  /**
   * Factory: create the right layer type for a basemap record.
   * kind === 'vector' → VectorBasemap (fetches MapLibre style JSON, no setStyle)
   * kind === 'raster' → TileLayer (classic raster tiles)
   * @param {Object} bm - Basemap record from basemaps_v2
   * @returns {TileLayer|VectorBasemap}
   */
  L.createBasemapLayer = function(bm) {
    if (bm.kind === 'vector' && bm.style_url) {
      return new VectorBasemap(bm.style_url, { attribution: bm.attribution });
    }
    return new TileLayer(bm.url, { attribution: bm.attribution });
  };

  // ============================================================
  // SHAPES: Polyline, Polygon, Circle
  // ============================================================

  class PathLayer extends EventEmitter {
    constructor() {
      super();
      this._map = null;
      this._sourceId = 'path-' + (++_stampCounter);
      this._layerId = this._sourceId + '-layer';
      this._fillLayerId = this._sourceId + '-fill';
      this._style = {};
      this.feature = null;
      this._visible = true;
    }
    // Expose _style as options for compat (navigationmodule reads layer.options)
    get options() { return this._style; }
    set options(v) { this._style = v; }
    setStyle(style) {
      this._style = Object.assign(this._style, style);
      if (this._map) this._applyStyle();
      return this;
    }
    setOpacity(val) {
      return this.setStyle({ opacity: val, fillOpacity: val * 0.5 });
    }
    addTo(map) {
      this._map = map;
      const doAdd = () => {
        const mlMap = map._mlMap || map;
        // Only add to MapLibre if not using shared source
        if (!this._skipMapLibreAdd) {
          this._addToMap(mlMap);
          // Only bind events if not using pool (pool handles events itself)
          if (!this._usingPool) {
            this._bindMapEvents(mlMap);
          }
        }
        this.fire('add');
      };
      if (map._styleLoaded === false) {
        map._queue.push(doAdd);
      } else {
        doAdd();
      }
      return this;
    }
    remove() {
      if (this._map) {
        const mlMap = this._map._mlMap || this._map;
        this._unbindMapEvents(mlMap);
        
        // If using pool, remove from pool
        if (this._usingPool && L._sourcePool) {
          L._sourcePool.removeFeature(mlMap, this);
        } else {
          // Remove individual source
          try {
            if (mlMap.getLayer(this._layerId)) mlMap.removeLayer(this._layerId);
            if (mlMap.getLayer(this._fillLayerId)) mlMap.removeLayer(this._fillLayerId);
            if (mlMap.getSource(this._sourceId)) mlMap.removeSource(this._sourceId);
          } catch {}
        }
      }
      this.fire('remove');
      return this;
    }
    _bindMapEvents(mlMap) {
      // Proxy MapLibre layer events to Leaflet-style layer events
      const targetLayerId = mlMap.getLayer(this._fillLayerId) ? this._fillLayerId : this._layerId;
      this._mlEventHandlers = {};
      ['click', 'mouseenter', 'mouseleave'].forEach(mlEvent => {
        const lEvent = mlEvent === 'mouseenter' ? 'mouseover' : mlEvent === 'mouseleave' ? 'mouseout' : mlEvent;
        const handler = (e) => {
          const latlng = e.lngLat ? { lat: e.lngLat.lat, lng: e.lngLat.lng } : null;
          this.fire(lEvent, { latlng, originalEvent: e.originalEvent, target: this, containerPoint: e.point });
        };
        this._mlEventHandlers[mlEvent] = handler;
        try { mlMap.on(mlEvent, targetLayerId, handler); } catch {}
      });
      // Change cursor on hover
      this._cursorEnter = () => { mlMap.getCanvas().style.cursor = 'pointer'; };
      this._cursorLeave = () => { mlMap.getCanvas().style.cursor = ''; };
      try {
        mlMap.on('mouseenter', targetLayerId, this._cursorEnter);
        mlMap.on('mouseleave', targetLayerId, this._cursorLeave);
      } catch {}
    }
    _unbindMapEvents(mlMap) {
      if (!this._mlEventHandlers) return;
      const targetLayerId = mlMap.getLayer(this._fillLayerId) ? this._fillLayerId : this._layerId;
      Object.entries(this._mlEventHandlers).forEach(([ev, handler]) => {
        try { mlMap.off(ev, targetLayerId, handler); } catch {}
      });
      try {
        if (this._cursorEnter) mlMap.off('mouseenter', targetLayerId, this._cursorEnter);
        if (this._cursorLeave) mlMap.off('mouseleave', targetLayerId, this._cursorLeave);
      } catch {}
    }
    getBounds() {
      const coords = this._getAllCoords();
      if (!coords.length) return _invalidBounds;
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      coords.forEach(c => { minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]); minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]); });
      return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
    }
    getElement() { return null; }
    toGeoJSON() { return this._geojson || null; }
    bindTooltip(content, options) {
      this._tooltipContent = content;
      this._tooltipOptions = options || {};
      // Auto-show on hover unless permanent
      if (!this._tooltipOptions.permanent) {
        this.on('mouseover', (e) => {
          if (!this._map) return;
          const latlng = e.latlng || (this._latlngs && this._latlngs[0]);
          if (!latlng) return;
          this.openTooltip(latlng);
        });
        this.on('mouseout', () => { this.closeTooltip(); });
      }
      return this;
    }
    openTooltip(latlng) {
      if (!this._tooltipContent || !this._map) return this;
      if (this._activeTooltip) this._activeTooltip.remove();
      this._activeTooltip = new Tooltip(this._tooltipOptions);
      const text = typeof this._tooltipContent === 'function' ? this._tooltipContent(this) : this._tooltipContent;
      this._activeTooltip.setContent(text);
      this._activeTooltip.setLatLng(latlng);
      this._activeTooltip.addTo(this._map);
      return this;
    }
    closeTooltip() {
      if (this._activeTooltip) { this._activeTooltip.remove(); this._activeTooltip = null; }
      return this;
    }
    bindPopup(content, options) { this._popupContent = content; this._popupOptions = options; return this; }
    openPopup() { return this; }
    closePopup() { return this; }
    _getAllCoords() { return []; }
    _addToMap(_mlMap) {}
    _applyStyle() {}
  }

  class LPolyline extends PathLayer {
    constructor(latlngs, style) {
      super();
      this._latlngs = (latlngs || []).map(ll => toLatLng(ll));
      this._style = Object.assign({ color: '#3388ff', weight: 3, opacity: 1, dashArray: null }, style);
      this._geojson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: this._latlngs.map(ll => [ll.lng, ll.lat]) },
        properties: { _leaflet_id: L.stamp(this) }
      };
    }
    // Fast-path: accept original GeoJSON feature, skip coordinate conversions
    static _fromGeoJSON(feature, style) {
      const instance = new LPolyline([], style);
      instance._latlngs = null; // Lazy — computed on demand
      instance._geojson = feature;
      instance.feature = feature;
      return instance;
    }
    setLatLngs(latlngs) {
      this._latlngs = latlngs.map(ll => toLatLng(ll));
      this._geojson.geometry.coordinates = this._latlngs.map(ll => [ll.lng, ll.lat]);
      if (this._map) {
        const mlMap = this._map._mlMap || this._map;
        
        // If using pool, update via pool
        if (this._usingPool && L._sourcePool) {
          L._sourcePool.removeFeature(mlMap, this);
          L._sourcePool.addFeature(mlMap, 'LineString', this._geojson, this._style, this);
        } else {
          // Update individual source
          const src = mlMap.getSource(this._sourceId);
          if (src) src.setData(this._geojson);
        }
      }
      return this;
    }
    getLatLngs() {
      if (!this._latlngs) {
        this._latlngs = (this._geojson.geometry.coordinates || []).map(c => L.latLng(c[1], c[0]));
      }
      return this._latlngs;
    }
    _getAllCoords() { return this._geojson.geometry.coordinates; }
    _addToMap(mlMap) {
      // Skip if using shared source (GeoJSONLayer optimization)
      if (this._skipMapLibreAdd) return;
      
      // Use SourcePool to reduce number of MapLibre GL sources
      if (L._sourcePool && !this._style.dashArray) {
        L._sourcePool.addFeature(mlMap, 'LineString', this._geojson, this._style, this);
        this._usingPool = true;
        return;
      }
      
      // Fallback to individual source for dashArray or if pool not available
      mlMap.addSource(this._sourceId, { type: 'geojson', data: this._geojson });
      const paint = {
        'line-color': resolveColor(this._style.color) || '#3388ff',
        'line-width': this._style.weight || 3,
        'line-opacity': this._style.opacity !== undefined ? this._style.opacity : 1
      };
      if (this._style.dashArray) {
        const da = typeof this._style.dashArray === 'string'
          ? this._style.dashArray.split(/[, ]+/).map(Number)
          : this._style.dashArray;
        paint['line-dasharray'] = da;
      }
      mlMap.addLayer({ id: this._layerId, type: 'line', source: this._sourceId, paint });
    }
    _applyStyle() {
      if (!this._map) return;
      const mlMap = this._map._mlMap || this._map;
      
      // If using pool, style changes require re-adding to pool with new style
      if (this._usingPool && L._sourcePool) {
        L._sourcePool.removeFeature(mlMap, this);
        L._sourcePool.addFeature(mlMap, 'LineString', this._geojson, this._style, this);
        return;
      }
      
      // Individual layer styling - check layer exists first
      if (!mlMap.getLayer(this._layerId)) return;
      
      if (this._style.color) mlMap.setPaintProperty(this._layerId, 'line-color', resolveColor(this._style.color));
      if (this._style.weight !== undefined) mlMap.setPaintProperty(this._layerId, 'line-width', this._style.weight);
      if (this._style.opacity !== undefined) mlMap.setPaintProperty(this._layerId, 'line-opacity', this._style.opacity);
      if (this._style.dashArray) {
        const da = typeof this._style.dashArray === 'string'
          ? this._style.dashArray.split(/[, ]+/).map(Number)
          : this._style.dashArray;
        mlMap.setPaintProperty(this._layerId, 'line-dasharray', da);
      }
    }
  }

  class LPolygon extends PathLayer {
    constructor(latlngs, style) {
      super();
      this._latlngs = (latlngs || []).map(ll => toLatLng(ll));
      const s = style || {};
      this._style = Object.assign({ color: '#3388ff', weight: 3, opacity: 1, fillOpacity: 0.2 }, s);
      // Derive fillColor from color when not explicitly provided
      if (!s.fillColor) this._style.fillColor = this._style.color;
      const coords = this._latlngs.map(ll => [ll.lng, ll.lat]);
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
        coords.push(coords[0]);
      }
      this._geojson = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: {}
      };
    }
    // Fast-path: accept original GeoJSON feature, skip coordinate conversions
    static _fromGeoJSON(feature, style) {
      const instance = new LPolygon([], style);
      instance._latlngs = null; // Lazy — computed on demand
      instance._geojson = feature;
      instance.feature = feature;
      return instance;
    }
    _getAllCoords() { return this._geojson.geometry.coordinates[0] || []; }
    _addToMap(mlMap) {
      // Skip if using shared source (GeoJSONLayer optimization)
      if (this._skipMapLibreAdd) return;
      
      // Use SourcePool to reduce number of MapLibre GL sources
      if (L._sourcePool) {
        L._sourcePool.addFeature(mlMap, 'Polygon', this._geojson, this._style, this);
        this._usingPool = true;
        return;
      }
      
      // Fallback to individual source
      mlMap.addSource(this._sourceId, { type: 'geojson', data: this._geojson });
      mlMap.addLayer({
        id: this._fillLayerId, type: 'fill', source: this._sourceId,
        paint: {
          'fill-color': resolveColor(this._style.fillColor || this._style.color) || '#3388ff',
          'fill-opacity': this._style.fillOpacity !== undefined ? this._style.fillOpacity : 0.2
        }
      });
      mlMap.addLayer({
        id: this._layerId, type: 'line', source: this._sourceId,
        paint: {
          'line-color': resolveColor(this._style.color) || '#3388ff',
          'line-width': this._style.weight || 3,
          'line-opacity': this._style.opacity !== undefined ? this._style.opacity : 1
        }
      });
    }
    _applyStyle() {
      if (!this._map) return;
      const mlMap = this._map._mlMap || this._map;
      
      // If using pool, style changes require re-adding to pool with new style
      if (this._usingPool && L._sourcePool) {
        L._sourcePool.removeFeature(mlMap, this);
        L._sourcePool.addFeature(mlMap, 'Polygon', this._geojson, this._style, this);
        return;
      }
      
      // Individual layer styling - check layers exist first
      if (!mlMap.getLayer(this._layerId)) return;
      
      if (this._style.fillColor && mlMap.getLayer(this._fillLayerId)) {
        mlMap.setPaintProperty(this._fillLayerId, 'fill-color', resolveColor(this._style.fillColor));
      }
      if (this._style.fillOpacity !== undefined && mlMap.getLayer(this._fillLayerId)) {
        mlMap.setPaintProperty(this._fillLayerId, 'fill-opacity', this._style.fillOpacity);
      }
      if (this._style.color) mlMap.setPaintProperty(this._layerId, 'line-color', resolveColor(this._style.color));
      if (this._style.weight !== undefined) mlMap.setPaintProperty(this._layerId, 'line-width', this._style.weight);
      if (this._style.opacity !== undefined) mlMap.setPaintProperty(this._layerId, 'line-opacity', this._style.opacity);
      if (this._style.dashArray) {
        const da = typeof this._style.dashArray === 'string'
          ? this._style.dashArray.split(/[, ]+/).map(Number)
          : this._style.dashArray;
        mlMap.setPaintProperty(this._layerId, 'line-dasharray', da);
      }
    }
  }

  class LCircle extends PathLayer {
    constructor(latlng, options) {
      super();
      this._center = toLatLng(latlng);
      const opts = typeof options === 'number' ? { radius: options } : (options || {});
      this._radius = opts.radius || 10;
      this._style = Object.assign({ color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2, opacity: 1 }, opts);
      this._geojson = this._createCircleGeoJSON();
    }
    setRadius(r) {
      this._radius = r;
      this._geojson = this._createCircleGeoJSON();
      if (this._map) {
        const mlMap = this._map._mlMap || this._map;
        const src = mlMap.getSource(this._sourceId);
        if (src) src.setData(this._geojson);
      }
      return this;
    }
    setLatLng(latlng) {
      this._center = toLatLng(latlng);
      this._geojson = this._createCircleGeoJSON();
      if (this._map) {
        const mlMap = this._map._mlMap || this._map;
        const src = mlMap.getSource(this._sourceId);
        if (src) src.setData(this._geojson);
      }
      return this;
    }
    getLatLng() { return this._center; }
    getRadius() { return this._radius; }
    _createCircleGeoJSON() {
      const steps = 64;
      const coords = [];
      const km = this._radius / 1000;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const dx = km * Math.cos(angle);
        const dy = km * Math.sin(angle);
        const lat = this._center.lat + (dy / 111.32);
        const lng = this._center.lng + (dx / (111.32 * Math.cos(this._center.lat * Math.PI / 180)));
        coords.push([lng, lat]);
      }
      return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
    }
    _getAllCoords() { return this._geojson.geometry.coordinates[0] || []; }
    _addToMap(mlMap) {
      mlMap.addSource(this._sourceId, { type: 'geojson', data: this._geojson });
      mlMap.addLayer({
        id: this._fillLayerId, type: 'fill', source: this._sourceId,
        paint: {
          'fill-color': resolveColor(this._style.fillColor || this._style.color) || '#3388ff',
          'fill-opacity': this._style.fillOpacity !== undefined ? this._style.fillOpacity : 0.2
        }
      });
      mlMap.addLayer({
        id: this._layerId, type: 'line', source: this._sourceId,
        paint: {
          'line-color': resolveColor(this._style.color) || '#3388ff',
          'line-width': 2,
          'line-opacity': this._style.opacity !== undefined ? this._style.opacity : 1
        }
      });
    }
    _applyStyle() {
      const mlMap = this._map._mlMap || this._map;
      try {
        if (this._style.fillColor) mlMap.setPaintProperty(this._fillLayerId, 'fill-color', resolveColor(this._style.fillColor));
        if (this._style.fillOpacity !== undefined) mlMap.setPaintProperty(this._fillLayerId, 'fill-opacity', this._style.fillOpacity);
        if (this._style.color) mlMap.setPaintProperty(this._layerId, 'line-color', resolveColor(this._style.color));
      } catch {}
    }
  }

  L.polyline = function(latlngs, style) { return new LPolyline(latlngs, style); };
  L.polygon = function(latlngs, style) { return new LPolygon(latlngs, style); };
  L.circle = function(latlng, options) { return new LCircle(latlng, options); };
  L.Polyline = LPolyline;
  L.Polygon = LPolygon;
  L.Circle = LCircle;

  // ============================================================
  // FEATURE GROUP / LAYER GROUP
  // ============================================================

  class FeatureGroup extends EventEmitter {
    constructor(layers) {
      super();
      this._layers = [];
      this._map = null;
      if (layers) layers.forEach(l => this.addLayer(l));
    }
    addLayer(layer) {
      this._layers.push(layer);
      if (this._map) layer.addTo(this._map);
      return this;
    }
    removeLayer(layer) {
      const idx = this._layers.indexOf(layer);
      if (idx >= 0) {
        this._layers.splice(idx, 1);
        if (layer.remove) layer.remove();
      }
      return this;
    }
    hasLayer(layer) { return this._layers.indexOf(layer) >= 0; }
    clearLayers() {
      this._layers.forEach(l => { if (l.remove) l.remove(); });
      this._layers = [];
      return this;
    }
    getLayers() { return this._layers.slice(); }
    eachLayer(fn) { this._layers.forEach(fn); return this; }
    addTo(map) {
      this._map = map;
      this._layers.forEach(l => l.addTo(map));
      return this;
    }
    remove() {
      this._layers.forEach(l => { if (l.remove) l.remove(); });
      return this;
    }
    getBounds() {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      this._layers.forEach(l => {
        const b = l.getBounds ? l.getBounds() : (l.getLatLng ? l.getBounds() : null);
        if (b) {
          const sw = b.getSouthWest ? b.getSouthWest() : b._southWest;
          const ne = b.getNorthEast ? b.getNorthEast() : b._northEast;
          if (sw && ne) {
            minLat = Math.min(minLat, sw.lat); maxLat = Math.max(maxLat, ne.lat);
            minLng = Math.min(minLng, sw.lng); maxLng = Math.max(maxLng, ne.lng);
          }
        }
      });
      if (minLat === Infinity) return _invalidBounds;
      return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
    }
    toGeoJSON() {
      return {
        type: 'FeatureCollection',
        features: this._layers.map(l => l.toGeoJSON ? l.toGeoJSON() : null).filter(Boolean)
      };
    }
  }

  L.FeatureGroup = FeatureGroup;
  L.featureGroup = function(layers) { return new FeatureGroup(layers); };
  L.LayerGroup = FeatureGroup;
  L.layerGroup = function(layers) { return new FeatureGroup(layers); };

  // ============================================================
  // GEOJSON LAYER
  // ============================================================

  class GeoJSONLayer extends EventEmitter {
    constructor(data, options) {
      super();
      this.options = options || {};
      this._layers = [];            // Point markers + PathLayers (SourcePool path)
      this._pathFeatures = [];      // Raw GeoJSON for non-Points (direct path)
      this._directSourceIds = [];   // { sourceId, layerIds } for cleanup
      this._map = null;
      this._sourceId = 'geojson-' + L.stamp(this);
      this._featureCount = 0;
      if (data) this.addData(data);
    }
    addData(data) {
      if (!data) return this;
      const features = data.type === 'FeatureCollection' ? data.features :
                       data.type === 'Feature' ? [data] :
                       data.features ? data.features : [data];

      // Batch SourcePool updates when on map with non-direct-path PathLayers
      const shouldBatch = !this.options._directPath && this._map && L._sourcePool && !L._sourcePool._batching;
      const mlMap = this._map ? (this._map._mlMap || this._map) : null;
      if (shouldBatch) L._sourcePool.beginBatch();

      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        if (this.options.filter && !this.options.filter(feature)) continue;
        this._featureCount++;
        this._addFeature(feature);
      }

      if (shouldBatch) L._sourcePool.endBatch(mlMap);

      // If direct-path features added while already on map, update sources
      if (this.options._directPath && this._map && this._directSourceIds.length > 0) {
        this._updateDirectSources();
      }
      return this;
    }
    _addFeature(feature) {
      if (!feature || !feature.geometry) return;
      const geomType = feature.geometry.type;

      if (geomType === 'Point' || geomType === 'MultiPoint') {
        const coords = geomType === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        coords.forEach(coord => {
          const latlng = L.latLng(coord[1], coord[0]);
          let layer;
          if (this.options.pointToLayer) {
            layer = this.options.pointToLayer(feature, latlng);
          } else {
            layer = L.marker(latlng);
          }
          if (layer) {
            layer.feature = feature;
            if (this.options.onEachFeature) this.options.onEachFeature(feature, layer);
            this._layers.push(layer);
            if (this._map) layer.addTo(this._map);
          }
        });
      } else if (this.options._directPath) {
        // DIRECT PATH: store raw GeoJSON, skip PathLayer creation entirely
        this._pathFeatures.push(feature);
      } else {
        // SOURCEPOOL PATH: create PathLayer objects (needed for per-feature styling)
        const style = this.options.style
          ? (typeof this.options.style === 'function' ? this.options.style(feature) : this.options.style)
          : {};
        const layer = (geomType === 'LineString' || geomType === 'MultiLineString')
          ? LPolyline._fromGeoJSON(feature, style)
          : LPolygon._fromGeoJSON(feature, style);
        if (layer) {
          if (this.options.onEachFeature) this.options.onEachFeature(feature, layer);
          this._layers.push(layer);
          if (this._map) layer.addTo(this._map);
        }
      }
    }

    // ── Direct path: create MapLibre sources directly from raw GeoJSON ──
    _addDirectPaths(map) {
      const mlMap = map._mlMap || map;
      const lines = [];
      const polygons = [];
      for (let i = 0; i < this._pathFeatures.length; i++) {
        const t = this._pathFeatures[i].geometry.type;
        if (t === 'LineString' || t === 'MultiLineString') lines.push(this._pathFeatures[i]);
        else if (t === 'Polygon' || t === 'MultiPolygon') polygons.push(this._pathFeatures[i]);
      }

      const styleFn = this.options.style;
      const sample = this._pathFeatures[0];
      const s = typeof styleFn === 'function' ? styleFn(sample) : (styleFn || {});
      const w = s.weight || 3;
      const op = s.opacity !== undefined ? s.opacity : 0.8;
      const color = resolveColor(s.color) || '#3388ff';

      // For polygon style, use a polygon sample if available (avoids wrong fillOpacity=0 from line sample)
      const polyStyle = polygons.length > 0 && styleFn
        ? (() => { const ps = typeof styleFn === 'function' ? styleFn(polygons[0]) : s; return { ...s, fillOpacity: ps.fillOpacity ?? s.fillOpacity }; })()
        : s;

      const doAdd = () => {
        let nextId = 0;
        if (lines.length > 0) this._createDirectSource(mlMap, lines, 'dlines', 'LineString', color, w, op, s, nextId);
        nextId += lines.length;
        if (polygons.length > 0) this._createDirectSource(mlMap, polygons, 'dpolygons', 'Polygon', color, w, op, polyStyle, nextId);
      };

      if (map._styleLoaded === false) { map._queue.push(doAdd); }
      else { doAdd(); }
    }
    _createDirectSource(mlMap, features, suffix, geomType, color, w, op, style, startId) {
      for (let i = 0; i < features.length; i++) features[i].id = startId + i;

      const sourceId = this._sourceId + '-' + suffix;
      const lineLayerId = sourceId + '-layer';
      mlMap.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        generateId: false
      });

      // Data-driven color: use per-feature _color property when available
      // Check several features: first feature may have no dates (total<=0) and thus no _color
      const hasPerFeatureColor = features.some(f => { const c = f.properties?._color; return c && !c.startsWith('var('); });
      const lineColorExpr = hasPerFeatureColor
        ? ['coalesce', ['get', '_color'], color]
        : color;

      const linePaint = {
        'line-color': lineColorExpr,
        'line-width': ['case',
          ['boolean', ['feature-state', 'selected'], false], w + 4,
          ['boolean', ['feature-state', 'hover'], false], w + 2,
          w
        ],
        'line-opacity': ['case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'hover'], false], 1,
          ['boolean', ['feature-state', 'dimmed'], false], 0.15,
          op
        ]
      };
      if (style.dashArray) {
        linePaint['line-dasharray'] = typeof style.dashArray === 'string'
          ? style.dashArray.split(/[, ]+/).map(Number) : style.dashArray;
      }

      const layerIds = [lineLayerId];
      let fillLayerId = null;

      if (geomType === 'Polygon') {
        fillLayerId = sourceId + '-fill';
        const baseFillColor = resolveColor(style.fillColor || style.color) || '#3388ff';
        const fillColorExpr = hasPerFeatureColor
          ? ['coalesce', ['get', '_color'], baseFillColor]
          : baseFillColor;
        const fillOp = style.fillOpacity !== undefined ? style.fillOpacity : 0.2;
        mlMap.addLayer({
          id: fillLayerId, type: 'fill', source: sourceId,
          paint: {
            'fill-color': fillColorExpr,
            'fill-opacity': ['case',
              ['boolean', ['feature-state', 'selected'], false], Math.min(fillOp + 0.35, 0.7),
              ['boolean', ['feature-state', 'hover'], false], Math.min(fillOp + 0.2, 0.6),
              ['boolean', ['feature-state', 'dimmed'], false], 0.05,
              fillOp
            ]
          }
        });
        layerIds.push(fillLayerId);
      }

      mlMap.addLayer({ id: lineLayerId, type: 'line', source: sourceId, paint: linePaint });
      this._directSourceIds.push({ sourceId, layerIds });

      // Register with SourcePool for FeatureInteractions compatibility
      if (L._sourcePool) {
        const pool = {
          sourceId, layerId: lineLayerId, fillLayerId,
          features, layers: [], geomType,
          layerName: this.options._layerName || null
        };
        L._sourcePool._pools.set(sourceId, pool);
        L._sourcePool._applyFilterToPool(pool);
      }
    }
    _updateDirectSources() {
      if (!this._map) return;
      const mlMap = this._map._mlMap || this._map;
      for (const { sourceId } of this._directSourceIds) {
        const src = mlMap.getSource(sourceId);
        if (!src) continue;
        const isLines = sourceId.endsWith('-dlines');
        const filtered = this._pathFeatures.filter(f => {
          const t = f.geometry.type;
          return isLines ? (t === 'LineString' || t === 'MultiLineString') : (t === 'Polygon' || t === 'MultiPolygon');
        });
        src.setData({ type: 'FeatureCollection', features: filtered });
        if (L._sourcePool) {
          const pool = L._sourcePool._pools.get(sourceId);
          if (pool) pool.features = filtered;
        }
      }
    }
    _removeDirectSources() {
      if (!this._map || this._directSourceIds.length === 0) return;
      const mlMap = this._map._mlMap || this._map;
      for (const { sourceId, layerIds } of this._directSourceIds) {
        for (const lid of layerIds) {
          try { if (mlMap.getLayer(lid)) mlMap.removeLayer(lid); } catch {}
        }
        try { if (mlMap.getSource(sourceId)) mlMap.removeSource(sourceId); } catch {}
        if (L._sourcePool) {
          if (win.FeatureInteractions) win.FeatureInteractions.invalidateSource(sourceId);
          L._sourcePool._pools.delete(sourceId);
        }
      }
      this._directSourceIds = [];
    }

    // ── Lifecycle ──
    addTo(map) {
      this._map = map;
      const mlMap = map._mlMap || map;
      // Add markers + PathLayers via SourcePool batch
      if (this._layers.length > 0) {
        if (L._sourcePool) L._sourcePool.beginBatch();
        this._layers.forEach(l => l.addTo(map));
        if (L._sourcePool) L._sourcePool.endBatch(mlMap);
      }
      // Add direct-path features (zero PathLayer overhead)
      if (this._pathFeatures.length > 0) {
        this._addDirectPaths(map);
      }
      this.fire('add');
      return this;
    }
    remove() {
      this._removeDirectSources();
      const mlMap = this._map ? (this._map._mlMap || this._map) : null;
      if (this._layers.length > 0) {
        const shouldBatch = mlMap && L._sourcePool && !L._sourcePool._batching;
        if (shouldBatch) L._sourcePool.beginBatch();
        this._layers.forEach(l => { if (l.remove) l.remove(); });
        if (shouldBatch) L._sourcePool.endBatch(mlMap);
      }
      this._pathFeatures = [];
      this.fire('remove');
      return this;
    }
    removeFrom(_map) { return this.remove(); }
    clearLayers() {
      this._removeDirectSources();
      const mlMap = this._map ? (this._map._mlMap || this._map) : null;
      if (this._layers.length > 0) {
        const shouldBatch = mlMap && L._sourcePool && !L._sourcePool._batching;
        if (shouldBatch) L._sourcePool.beginBatch();
        this._layers.forEach(l => { if (l.remove) l.remove(); });
        if (shouldBatch) L._sourcePool.endBatch(mlMap);
      }
      this._layers = [];
      this._pathFeatures = [];
      this._featureCount = 0;
      return this;
    }

    // ── Query ──
    eachLayer(fn) { this._layers.forEach(fn); return this; }
    getLayers() { return this._layers.slice(); }
    getFeatureCount() { return this._featureCount; }
    hasLayer(layer) { return this._layers.indexOf(layer) >= 0; }

    // ── Mutation ──
    addLayer(layer) {
      this._layers.push(layer);
      if (this._map) layer.addTo(this._map);
      return this;
    }
    removeLayer(layer) {
      const idx = this._layers.indexOf(layer);
      if (idx >= 0) {
        this._layers.splice(idx, 1);
        if (layer.remove) layer.remove();
      }
      return this;
    }
    setStyle(style) {
      this._layers.forEach(l => { if (l.setStyle) l.setStyle(typeof style === 'function' ? style(l.feature) : style); });
      // Update direct source paint properties
      if (this._directSourceIds.length > 0 && this._map) {
        const mlMap = this._map._mlMap || this._map;
        const s = typeof style === 'function' && this._pathFeatures.length > 0
          ? style(this._pathFeatures[0]) : (typeof style === 'object' ? style : {});
        for (const { layerIds } of this._directSourceIds) {
          for (const lid of layerIds) {
            try {
              if (lid.endsWith('-fill')) {
                if (s.fillColor || s.color) mlMap.setPaintProperty(lid, 'fill-color', resolveColor(s.fillColor || s.color));
                if (s.fillOpacity !== undefined) mlMap.setPaintProperty(lid, 'fill-opacity', s.fillOpacity);
              } else {
                if (s.color) mlMap.setPaintProperty(lid, 'line-color', resolveColor(s.color));
                if (s.weight !== undefined) mlMap.setPaintProperty(lid, 'line-width', s.weight);
                if (s.opacity !== undefined) mlMap.setPaintProperty(lid, 'line-opacity', s.opacity);
              }
            } catch {}
          }
        }
      }
      return this;
    }
    resetStyle(layer) {
      if (layer && this.options.style) {
        const s = typeof this.options.style === 'function' ? this.options.style(layer.feature) : this.options.style;
        if (layer.setStyle) layer.setStyle(s);
      }
      return this;
    }
    getBounds() {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      this._layers.forEach(l => {
        if (l.getLatLng) {
          const ll = l.getLatLng();
          minLat = Math.min(minLat, ll.lat); maxLat = Math.max(maxLat, ll.lat);
          minLng = Math.min(minLng, ll.lng); maxLng = Math.max(maxLng, ll.lng);
        } else if (l.getBounds) {
          const b = l.getBounds();
          if (b) {
            const sw = b._southWest || b.getSouthWest();
            const ne = b._northEast || b.getNorthEast();
            minLat = Math.min(minLat, sw.lat); maxLat = Math.max(maxLat, ne.lat);
            minLng = Math.min(minLng, sw.lng); maxLng = Math.max(maxLng, ne.lng);
          }
        }
      });
      // Include direct-path features in bounds
      for (let i = 0; i < this._pathFeatures.length; i++) {
        const coords = this._pathFeatures[i].geometry?.coordinates;
        if (coords) _walkCoords(coords, (lng, lat) => {
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        });
      }
      if (minLat === Infinity) return _invalidBounds;
      return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
    }
    toGeoJSON() {
      const markerFeatures = this._layers.map(l => l.toGeoJSON ? l.toGeoJSON() : l.feature).filter(Boolean);
      return {
        type: 'FeatureCollection',
        features: markerFeatures.concat(this._pathFeatures)
      };
    }
  }

  L.geoJSON = function(data, options) { return new GeoJSONLayer(data, options); };
  L.GeoJSON = GeoJSONLayer;

  // ============================================================
  // MAP WRAPPER
  // ============================================================

  class LMap extends EventEmitter {
    constructor(containerId, options) {
      super();
      const opts = options || {};
      const _container = typeof containerId === 'string' ? containerId : containerId;
      const center = opts.center || [0, 0];
      const centerLL = toLatLng(center);
      const zoom = opts.zoom || 10;

      this._container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      this._layers = [];
      this._panes = {};

      // Create MapLibre map with minimal style (no 3D buildings by default for performance)
      this._mlMap = new mlgl.Map({
        container: containerId,
        style: {
          version: 8,
          sources: {},
          layers: [],
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
        },
        center: [centerLL.lng, centerLL.lat],
        zoom: zoom,
        pitch: opts.pitch || 0,
        bearing: opts.bearing || 0,
        attributionControl: opts.attributionControl !== false,
        maxPitch: 85
      });

      // Queue for operations before style loads
      this._styleLoaded = false;
      this._queue = [];
      const addZoomControl = opts.zoomControl !== false;

      this._mlMap.on('load', () => {
        this._styleLoaded = true;
        
        // Add unified navigation control (zoom + compass) after map is loaded
        if (addZoomControl) {
          try {
            this._mlMap.addControl(
              new mlgl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }),
              'bottom-right'
            );
          } catch (e) {
            console.warn('[MapLibreCompat] Could not add navigation control:', e);
          }
        }
        
        // Enable 3D buildings layer from OpenMapTiles
        this._enable3DBuildings();
        
        // Auto-pitch removed: it fired easeTo() on every zoom event,
        // creating cascading animations that broke mouse wheel zoom.
        // Users can manually tilt with Ctrl+drag; 3D buildings still render at zoom 15+.
        
        // Batch all queued operations so SourcePool coalesces setData calls
        if (L._sourcePool) L._sourcePool.beginBatch();
        this._queue.forEach(fn => fn());
        this._queue = [];
        if (L._sourcePool) L._sourcePool.endBatch(this._mlMap);
      });

      // Proxy MapLibre events to Leaflet-style events
      const eventMap = {
        'zoomend': 'zoomend', 'moveend': 'moveend', 'move': 'move',
        'click': 'click', 'dblclick': 'dblclick',
        'mousedown': 'mousedown', 'mouseup': 'mouseup',
        'mousemove': 'mousemove', 'mouseout': 'mouseout',
        'contextmenu': 'contextmenu', 'load': 'load',
        'resize': 'resize', 'zoom': 'zoom',
        'dragstart': 'dragstart', 'drag': 'drag', 'dragend': 'dragend'
      };

      Object.entries(eventMap).forEach(([mlEvent, lEvent]) => {
        this._mlMap.on(mlEvent, (e) => {
          const latlng = e.lngLat ? { lat: e.lngLat.lat, lng: e.lngLat.lng } : this.getCenter();
          this.fire(lEvent, {
            latlng: latlng,
            containerPoint: e.point || { x: 0, y: 0 },
            originalEvent: e.originalEvent || e
          });
        });
      });

      // Double click zoom control
      this.doubleClickZoom = {
        _map: this._mlMap,
        disable() { this._map.doubleClickZoom.disable(); },
        enable() { this._map.doubleClickZoom.enable(); }
      };

      // scrollWheelZoom
      this.scrollWheelZoom = {
        _map: this._mlMap,
        disable() { this._map.scrollZoom.disable(); },
        enable() { this._map.scrollZoom.enable(); }
      };
    }

    // ── 3D Buildings ──
    _buildings3DEnabled = true;

    /**
     * Active/désactive la couche 3D des bâtiments
     * Source : OpenFreeMap (OpenMapTiles schema, données OSM, gratuit, sans clé API)
     */
    setBuildings3D(enabled) {
      const mlMap = this._mlMap;
      
      if (enabled && !this._buildings3DEnabled) {
        this._addForest3DLayers();   // forests first — lower z-order than buildings
        this._addBuildings3DLayer();
        this._buildings3DEnabled = true;
      } else if (!enabled && this._buildings3DEnabled) {
        ['forest-fill', '3d-buildings'].forEach(id => {
          if (mlMap.getLayer(id)) mlMap.removeLayer(id);
        });
        this._buildings3DEnabled = false;
      }
      return this;
    }

    getBuildings3D() { return this._buildings3DEnabled; }

    // ── Building paint factory ──
    _BUILDING_COLORS = {
      light: [0, '#e8e4e0', 20, '#d5d0cc', 60, '#bfc5cc', 150, '#a0b0c0', 300, '#8fa8bd'],
      dark:  [0, '#3a3a3a', 20, '#454545', 60, '#505050', 150, '#5a5a5a', 300, '#656565'],
    };

    _getBuildingColorExpr(isDark) {
      const stops = isDark ? this._BUILDING_COLORS.dark : this._BUILDING_COLORS.light;
      return ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], ...stops];
    }

    // Full paint used for addLayer (static + theme-sensitive properties)
    _getBuildingPaint(isDark) {
      return {
        'fill-extrusion-color':   this._getBuildingColorExpr(isDark),
        'fill-extrusion-height':  ['coalesce', ['get', 'render_height'], 10],
        'fill-extrusion-base':    ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 1,
      };
    }

    // ─── Forest 3D — two-pass stratified canopy ────────────────────────────────
    _FOREST_COLORS = {
      light: {
        understory: '#071a0e',   // forest floor — near-black green
        wood:       '#1c5e36',   // mature forest canopy
        park:       '#3d8c4a',   // managed park trees
        scrub:      '#6b7c32',   // dry scrub / heath
        grass:      '#558c3c',   // meadow / grassland
      },
      dark: {
        understory: '#020708',   // moonlit floor — almost black
        wood:       '#0b2418',   // deep moonlit forest
        park:       '#112e1c',   // dark teal park
        scrub:      '#1c2610',   // very dark olive
        grass:      '#0e2012',   // night meadow
      },
    };

    _getForestColorExpr(type, isDark) {
      const c = isDark ? this._FOREST_COLORS.dark : this._FOREST_COLORS.light;
      if (type === 'understory') return c.understory;
      return ['match', ['get', 'subclass'],
        ['forest', 'wood'],                                             c.wood,
        ['park', 'garden', 'village_green', 'recreation_ground'],      c.park,
        ['scrub', 'heath', 'fell', 'shrubbery'],                       c.scrub,
        ['grassland', 'meadow', 'grass', 'flowerbed', 'wet_meadow'],   c.grass,
        c.wood,
      ];
    }

    _getForestHeightExpr() {
      return ['match', ['get', 'subclass'],
        ['forest', 'wood'],                                           22,
        ['park', 'garden', 'village_green', 'recreation_ground'],    14,
        ['scrub', 'heath', 'fell', 'shrubbery'],                     9,
        ['grassland', 'meadow', 'grass', 'flowerbed', 'wet_meadow'], 3,
        18,
      ];
    }

    // Height of understory = base of canopy
    _getForestBaseExpr() {
      return ['match', ['get', 'subclass'],
        ['forest', 'wood'],                                           7,
        ['park', 'garden', 'village_green', 'recreation_ground'],    5,
        ['scrub', 'heath', 'fell', 'shrubbery'],                     3,
        ['grassland', 'meadow', 'grass', 'flowerbed', 'wet_meadow'], 1,
        6,
      ];
    }

    _addForest3DLayers() {
      const mlMap = this._mlMap;
      // Source is shared with buildings — ensure it exists
      if (!mlMap.getSource('ofm-buildings')) {
        mlMap.addSource('ofm-buildings', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
      }
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      // Insert before the first basemap fill/line so forests sit below data overlays
      const anchor = mlMap.getStyle().layers.find(l => l.type === 'fill' || l.type === 'line')?.id;
      const filter = ['match', ['get', 'class'], ['wood', 'grass'], true, false];

      if (!mlMap.getLayer('forest-fill')) {
        mlMap.addLayer({
          id: 'forest-fill',
          source: 'ofm-buildings',
          'source-layer': 'landcover',
          type: 'fill',
          minzoom: 12,
          filter,
          paint: {
            'fill-color':   this._getForestColorExpr('canopy', isDark),
            // Fades in smoothly between zoom 12 and 15
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, 0.18],
          },
        }, anchor);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    _addBuildings3DLayer() {
      const mlMap = this._mlMap;
      
      if (!mlMap.getSource('ofm-buildings')) {
        mlMap.addSource('ofm-buildings', {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet'
        });
      }

      if (!mlMap.getLayer('3d-buildings')) {
        // Insert between basemap and data layers
        const firstDataLayer = mlMap.getStyle().layers.find(l =>
          l.type === 'line' || (l.type === 'fill' && l.id !== '3d-buildings')
        );
        
        // Check if dark mode is active
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        mlMap.addLayer({
          id: '3d-buildings',
          source: 'ofm-buildings',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 15,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: this._getBuildingPaint(isDark),
        }, firstDataLayer?.id);
      }
    }

    updateBuildings3DTheme() {
      const mlMap = this._mlMap;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const apply = () => {
        try {
          if (mlMap.getLayer('3d-buildings')) {
            mlMap.setPaintProperty('3d-buildings', 'fill-extrusion-color', this._getBuildingColorExpr(isDark));
            mlMap.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 1);
          }
          if (mlMap.getLayer('forest-fill')) {
            mlMap.setPaintProperty('forest-fill', 'fill-color', this._getForestColorExpr('canopy', isDark));
          }
        } catch {
          console.warn('[MapLibreCompat] updateBuildings3DTheme failed:', e);
        }
      };
      apply();
      // Fallback: retry after style settles (basemap swap may delay readiness)
      setTimeout(apply, 80);
    }

    updateSkyTheme() {
      if (!this._terrainEnabled) return;
      const preset = this._getSkyPreset();
      const apply = () => {
        try {
          this._mlMap.setSky(preset);
        } catch {
          console.warn('[MapLibreCompat] updateSkyTheme failed:', e);
        }
      };
      apply();
      setTimeout(apply, 80);
    }

    _enable3DBuildings() {
      this._addForest3DLayers();   // forests below buildings at init
      this._addBuildings3DLayer();
    }

    // ── 3D Terrain ──
    _terrainSourceId   = 'gp-terrain-dem';
    _hillshadeSourceId = 'gp-hillshade-dem';
    _terrainEnabled    = false;
    _DEM_TILES_URL     = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
    _DEM_MAX_ZOOM      = 15;
    // Sky presets (MapLibre requires valid SkySpecification — never null)
    // Light: soft blue midday sky
    _SKY_DAY     = { 'sky-color': '#89CFF0', 'sky-horizon-blend': 0.3, 'horizon-color': '#f0e8d8', 'horizon-fog-blend': 0.8, 'fog-color': '#dce6ef', 'fog-ground-blend': 0.9 };
    // Dark: warm amber-violet sunset
    _SKY_SUNSET  = { 'sky-color': '#1a0a2e', 'sky-horizon-blend': 0.5, 'horizon-color': '#c45c1a', 'horizon-fog-blend': 0.6, 'fog-color': '#7a2a0a', 'fog-ground-blend': 0.85 };
    _SKY_RESET   = { 'sky-color': 'transparent', 'horizon-color': 'transparent', 'fog-color': 'transparent', 'fog-ground-blend': 1, 'atmosphere-blend': 0 };

    _getSkyPreset() {
      return document.documentElement.getAttribute('data-theme') === 'dark' ? this._SKY_SUNSET : this._SKY_DAY;
    }

    _ensureDemSource(id) {
      if (!this._mlMap.getSource(id)) {
        this._mlMap.addSource(id, {
          type: 'raster-dem',
          tiles: [this._DEM_TILES_URL],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: this._DEM_MAX_ZOOM
        });
      }
    }

    setTerrain(enabled, exaggeration) {
      const mlMap = this._mlMap;
      const ex    = exaggeration || 1.2;

      if (enabled && !this._terrainEnabled) {
        this._ensureDemSource(this._terrainSourceId);
        this._ensureDemSource(this._hillshadeSourceId);
        if (!mlMap.getLayer('gp-hillshade')) {
          const anchorLayer = mlMap.getStyle().layers.find(l =>
            l.type === 'line' || (l.type === 'fill' && !l.id.startsWith('gp-'))
          );
          try {
            mlMap.addLayer({
              id: 'gp-hillshade', type: 'hillshade', source: this._hillshadeSourceId,
              paint: { 'hillshade-shadow-color': '#473B24', 'hillshade-illumination-anchor': 'map', 'hillshade-exaggeration': 0.5 }
            }, anchorLayer?.id || '3d-buildings');
          } catch (e) {
            console.warn('[MapLibreCompat] Could not add hillshade layer:', e);
          }
        }
        mlMap.setTerrain({ source: this._terrainSourceId, exaggeration: ex });
        mlMap.setSky(this._getSkyPreset());
        if (mlMap.getPitch() < 10) mlMap.easeTo({ pitch: 18, duration: 1000 });
        this._terrainEnabled = true;

      } else if (!enabled && this._terrainEnabled) {
        mlMap.setTerrain(null);
        mlMap.setSky(this._SKY_RESET);
        if (mlMap.getLayer('gp-hillshade')) mlMap.removeLayer('gp-hillshade');
        if (mlMap.getPitch() > 10) mlMap.easeTo({ pitch: 0, duration: 800 });
        this._terrainEnabled = false;
      }
      return this;
    }

    getTerrain() { return this._terrainEnabled; }

    // View methods
    setView(center, zoom) {
      const ll = toLatLng(center);
      if (zoom !== undefined) {
        this._mlMap.jumpTo({ center: [ll.lng, ll.lat], zoom: zoom });
      } else {
        this._mlMap.setCenter([ll.lng, ll.lat]);
      }
      return this;
    }
    getCenter() {
      const c = this._mlMap.getCenter();
      return { lat: c.lat, lng: c.lng };
    }
    getZoom() { return this._mlMap.getZoom(); }
    setZoom(zoom) { this._mlMap.setZoom(zoom); return this; }
    zoomIn(delta) { this._mlMap.zoomIn(delta || 1); return this; }
    zoomOut(delta) { this._mlMap.zoomOut(delta || 1); return this; }
    getMinZoom() { return this._mlMap.getMinZoom(); }
    getMaxZoom() { return this._mlMap.getMaxZoom(); }
    getBounds() {
      const b = this._mlMap.getBounds();
      return L.latLngBounds(
        [b.getSouthWest().lat, b.getSouthWest().lng],
        [b.getNorthEast().lat, b.getNorthEast().lng]
      );
    }
    fitBounds(bounds, options) {
      const b = bounds.toBBoxArray ? bounds.toBBoxArray() :
                (bounds._southWest ? [bounds._southWest.lng, bounds._southWest.lat, bounds._northEast.lng, bounds._northEast.lat] :
                 Array.isArray(bounds) ? [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]] : bounds);
      const mlBounds = Array.isArray(b) && b.length === 4
        ? [[b[0], b[1]], [b[2], b[3]]]
        : b;
      const fitOpts = {};
      if (options) {
        if (options.padding) fitOpts.padding = typeof options.padding === 'number' ? options.padding : options.padding;
        if (options.animate === false) fitOpts.duration = 0;
        if (options.duration !== undefined) fitOpts.duration = options.duration;
        if (options.bearing !== undefined) fitOpts.bearing = options.bearing;
      }
      // Always reset pitch: with tilt > 0 the perspective projection pushes features
      // outside the visually unobstructed viewport even when bbox maths says they fit.
      fitOpts.pitch = options?.pitch ?? 0;
      this._mlMap.fitBounds(mlBounds, fitOpts);
      return this;
    }
    panTo(latlng, options) {
      const ll = toLatLng(latlng);
      this._mlMap.panTo([ll.lng, ll.lat], options);
      return this;
    }
    flyTo(latlng, zoom, options) {
      const ll = toLatLng(latlng);
      const duration = options?.duration;
      const durationMs = typeof duration === 'number' && duration > 0 && duration <= 10
        ? duration * 1000
        : duration;
      // Reset pitch for the same reason as fitBounds: perspective tilt displaces features
      this._mlMap.flyTo({
        center: [ll.lng, ll.lat],
        zoom: zoom || this.getZoom(),
        pitch: options?.pitch ?? 0,
        ...(options?.bearing !== undefined ? { bearing: options.bearing } : {}),
        ...(durationMs !== undefined ? { duration: durationMs } : {})
      });
      return this;
    }

    // Layer methods
    addLayer(layer) {
      if (!layer) return this;
      this._layers.push(layer);
      if (layer.addTo) layer.addTo(this);
      return this;
    }
    removeLayer(layer) {
      if (!layer) return this;
      const idx = this._layers.indexOf(layer);
      if (idx >= 0) this._layers.splice(idx, 1);
      if (layer.remove) layer.remove();
      return this;
    }
    hasLayer(layer) {
      return this._layers.indexOf(layer) >= 0;
    }
    eachLayer(fn) {
      this._layers.forEach(fn);
      return this;
    }

    // Panes (compatibility - no real panes in MapLibre)
    createPane(name) {
      this._panes[name] = { style: { zIndex: 400 } };
      return this._panes[name];
    }
    getPane(name) { return this._panes[name] || null; }

    // Misc
    invalidateSize() { this._mlMap.resize(); return this; }
    whenReady(fn) {
      if (this._mlMap.loaded()) { fn({ target: this }); }
      else { this._mlMap.on('load', () => fn({ target: this })); }
      return this;
    }
    getContainer() { return this._mlMap.getContainer(); }
    getSize() {
      const c = this._mlMap.getContainer();
      return { x: c.clientWidth, y: c.clientHeight };
    }
    latLngToContainerPoint(latlng) {
      const ll = toLatLng(latlng);
      return this._mlMap.project([ll.lng, ll.lat]);
    }
    containerPointToLatLng(point) {
      const ll = this._mlMap.unproject(point);
      return { lat: ll.lat, lng: ll.lng };
    }
    project(latlng) {
      const ll = toLatLng(latlng);
      return this._mlMap.project([ll.lng, ll.lat]);
    }
    unproject(point) {
      const ll = this._mlMap.unproject(point);
      return L.latLng(ll.lat, ll.lng);
    }
    remove() {
      this._mlMap.remove();
    }
    getPixelBounds() {
      const size = this.getSize();
      return { min: { x: 0, y: 0 }, max: { x: size.x, y: size.y } };
    }
  }

  L.map = function(containerId, options) { return new LMap(containerId, options); };
  L.Map = LMap;

  // ============================================================
  // SVG RENDERER (no-op for MapLibre)
  // ============================================================
  L.svg = function(options) {
    return { options: options || {} };
  };
  L.SVG = function() {};

  // ============================================================
  // CONTROL (stubs)
  // ============================================================
  L.Control = L.Control || {};
  L.Control.Draw = true; // Truthy stub so modules don't bail out
  L.control = L.control || {};

  // ============================================================
  // DRAW SYSTEM (replaces Leaflet.Draw)
  // ============================================================

  let _activeDrawHandler = null;

  class DrawPolyline {
    constructor(map, options) {
      this._map = map;
      this._options = options || {};
      this._points = [];
      this._tempLine = null;
      this._clickHandler = null;
      this._dblClickHandler = null;
      this._mouseMoveHandler = null;
    }
    enable() {
      if (_activeDrawHandler) _activeDrawHandler.disable();
      _activeDrawHandler = this;
      this._points = [];
      const mlMap = this._map._mlMap || this._map;
      mlMap.getCanvas().style.cursor = 'crosshair';

      this._clickHandler = (e) => {
        this._points.push([e.lngLat.lng, e.lngLat.lat]);
        this._updatePreview(mlMap);
      };
      this._dblClickHandler = (e) => {
        e.preventDefault();
        if (this._points.length >= 2) this._finish();
        else this.disable();
      };
      this._mouseMoveHandler = (e) => {
        if (this._points.length > 0) {
          const preview = [...this._points, [e.lngLat.lng, e.lngLat.lat]];
          this._drawPreview(mlMap, preview);
        }
      };
      mlMap.on('click', this._clickHandler);
      mlMap.on('dblclick', this._dblClickHandler);
      mlMap.on('mousemove', this._mouseMoveHandler);
      mlMap.doubleClickZoom.disable();
    }
    disable() {
      const mlMap = this._map._mlMap || this._map;
      if (this._clickHandler) mlMap.off('click', this._clickHandler);
      if (this._dblClickHandler) mlMap.off('dblclick', this._dblClickHandler);
      if (this._mouseMoveHandler) mlMap.off('mousemove', this._mouseMoveHandler);
      this._removePreview(mlMap);
      mlMap.getCanvas().style.cursor = '';
      mlMap.doubleClickZoom.enable();
      if (_activeDrawHandler === this) _activeDrawHandler = null;
    }
    _updatePreview(mlMap) {
      this._drawPreview(mlMap, this._points);
    }
    _drawPreview(mlMap, coords) {
      const srcId = '_draw_preview_src';
      const layId = '_draw_preview_layer';
      const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
      try {
        const src = mlMap.getSource(srcId);
        if (src) { src.setData(data); return; }
      } catch {}
      try {
        mlMap.addSource(srcId, { type: 'geojson', data: data });
        mlMap.addLayer({ id: layId, type: 'line', source: srcId, paint: { 'line-color': '#3388ff', 'line-width': 3, 'line-dasharray': [3, 3] }});
      } catch {}
    }
    _removePreview(mlMap) {
      try { if (mlMap.getLayer('_draw_preview_layer')) mlMap.removeLayer('_draw_preview_layer'); } catch {}
      try { if (mlMap.getSource('_draw_preview_src')) mlMap.removeSource('_draw_preview_src'); } catch {}
    }
    _finish() {
      const latlngs = this._points.map(c => L.latLng(c[1], c[0]));
      const layer = L.polyline(latlngs, this._options?.shapeOptions || {});
      layer.feature = { type: 'Feature', geometry: { type: 'LineString', coordinates: this._points }, properties: {} };
      this.disable();
      const map = this._map;
      if (map.fire) map.fire('draw:created', { layerType: 'polyline', layer: layer });
    }
  }

  class DrawPolygon {
    constructor(map, options) {
      this._map = map;
      this._options = options || {};
      this._points = [];
      this._clickHandler = null;
      this._dblClickHandler = null;
      this._mouseMoveHandler = null;
    }
    enable() {
      if (_activeDrawHandler) _activeDrawHandler.disable();
      _activeDrawHandler = this;
      this._points = [];
      const mlMap = this._map._mlMap || this._map;
      mlMap.getCanvas().style.cursor = 'crosshair';

      this._clickHandler = (e) => {
        this._points.push([e.lngLat.lng, e.lngLat.lat]);
        this._updatePreview(mlMap);
      };
      this._dblClickHandler = (e) => {
        e.preventDefault();
        if (this._points.length >= 3) this._finish();
        else this.disable();
      };
      this._mouseMoveHandler = (e) => {
        if (this._points.length > 0) {
          const preview = [...this._points, [e.lngLat.lng, e.lngLat.lat]];
          if (preview.length > 2) preview.push(preview[0]);
          this._drawPreview(mlMap, preview);
        }
      };
      mlMap.on('click', this._clickHandler);
      mlMap.on('dblclick', this._dblClickHandler);
      mlMap.on('mousemove', this._mouseMoveHandler);
      mlMap.doubleClickZoom.disable();
    }
    disable() {
      const mlMap = this._map._mlMap || this._map;
      if (this._clickHandler) mlMap.off('click', this._clickHandler);
      if (this._dblClickHandler) mlMap.off('dblclick', this._dblClickHandler);
      if (this._mouseMoveHandler) mlMap.off('mousemove', this._mouseMoveHandler);
      this._removePreview(mlMap);
      mlMap.getCanvas().style.cursor = '';
      mlMap.doubleClickZoom.enable();
      if (_activeDrawHandler === this) _activeDrawHandler = null;
    }
    _updatePreview(mlMap) {
      const coords = this._points.length > 2 ? [...this._points, this._points[0]] : this._points;
      this._drawPreview(mlMap, coords);
    }
    _drawPreview(mlMap, coords) {
      const srcId = '_draw_preview_src';
      const layId = '_draw_preview_layer';
      const fillId = '_draw_preview_fill';
      const geomType = coords.length > 2 ? 'Polygon' : 'LineString';
      const geomCoords = geomType === 'Polygon' ? [coords] : coords;
      const data = { type: 'Feature', geometry: { type: geomType, coordinates: geomCoords }, properties: {} };
      try {
        const src = mlMap.getSource(srcId);
        if (src) { src.setData(data); return; }
      } catch {}
      try {
        mlMap.addSource(srcId, { type: 'geojson', data: data });
        if (geomType === 'Polygon') {
          mlMap.addLayer({ id: fillId, type: 'fill', source: srcId, paint: { 'fill-color': '#3388ff', 'fill-opacity': 0.15 }});
        }
        mlMap.addLayer({ id: layId, type: 'line', source: srcId, paint: { 'line-color': '#3388ff', 'line-width': 3, 'line-dasharray': [3, 3] }});
      } catch {}
    }
    _removePreview(mlMap) {
      try { if (mlMap.getLayer('_draw_preview_layer')) mlMap.removeLayer('_draw_preview_layer'); } catch {}
      try { if (mlMap.getLayer('_draw_preview_fill')) mlMap.removeLayer('_draw_preview_fill'); } catch {}
      try { if (mlMap.getSource('_draw_preview_src')) mlMap.removeSource('_draw_preview_src'); } catch {}
    }
    _finish() {
      const closed = [...this._points, this._points[0]];
      const latlngs = this._points.map(c => L.latLng(c[1], c[0]));
      const layer = L.polygon(latlngs, this._options?.shapeOptions || {});
      layer.feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [closed] }, properties: {} };
      this.disable();
      const map = this._map;
      if (map.fire) map.fire('draw:created', { layerType: 'polygon', layer: layer });
    }
  }

  class DrawMarker {
    constructor(map, options) {
      this._map = map;
      this._options = options || {};
      this._clickHandler = null;
    }
    enable() {
      if (_activeDrawHandler) _activeDrawHandler.disable();
      _activeDrawHandler = this;
      const mlMap = this._map._mlMap || this._map;
      mlMap.getCanvas().style.cursor = 'crosshair';

      this._clickHandler = (e) => {
        const latlng = L.latLng(e.lngLat.lat, e.lngLat.lng);
        const icon = this._options?.icon || null;
        const layer = L.marker(latlng, { icon: icon });
        layer.feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] }, properties: {} };
        this.disable();
        const map = this._map;
        if (map.fire) map.fire('draw:created', { layerType: 'marker', layer: layer });
      };
      mlMap.on('click', this._clickHandler);
    }
    disable() {
      const mlMap = this._map._mlMap || this._map;
      if (this._clickHandler) mlMap.off('click', this._clickHandler);
      mlMap.getCanvas().style.cursor = '';
      if (_activeDrawHandler === this) _activeDrawHandler = null;
    }
  }

  L.Draw = {
    Event: {
      CREATED: 'draw:created',
      EDITED: 'draw:edited',
      DELETED: 'draw:deleted'
    },
    Polyline: DrawPolyline,
    Polygon: DrawPolygon,
    Marker: DrawMarker
  };

  // ============================================================
  // EXPOSE
  // ============================================================
  // Expose color cache clear for theme changes
  L.clearColorCache = clearColorCache;
  L._resolveColor = resolveColor;

  win.L = L;

  console.log('[MapLibreCompat] Leaflet compatibility layer loaded (backed by MapLibre GL JS)');

})(window);
