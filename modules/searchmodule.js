// modules/searchmodule.js
window.SearchModule = (() => {
  'use strict';

  const API = 'https://api-adresse.data.gouv.fr/search/';
  const DEBOUNCE = 260;           // ms before firing a request
  const RESULT_LIMIT = 6;
  const FLY_DURATION = 1.6;       // seconds (converted in compat layer)
  const TYPE_ICONS = {
    housenumber: 'fa-location-dot',
    street:      'fa-road',
    locality:    'fa-map-pin',
    municipality:'fa-city',
    default:     'fa-location-dot'
  };

  let _map     = null;
  let _panel   = null;  // #search-overlay
  let _input   = null;  // #address-search
  let _clear   = null;  // .search__clear
  let _list    = null;  // #search-results
  let _marker  = null;
  let _timer   = 0;
  let _focusIdx = -1;   // keyboard-highlighted index (–1 = none)
  let _abortCtrl = null;

  // ── Init ──────────────────────────────────────────────────────────────────

  function init(mapInstance) {
    if (!mapInstance) return;
    _map   = mapInstance;
    _panel = document.getElementById('search-overlay');
    _input = document.getElementById('address-search');
    _clear = _panel?.querySelector('.search__clear');
    _list  = document.getElementById('search-results');
    if (!_panel || !_input || !_list) return;

    _input.addEventListener('input', _onInput);
    _input.addEventListener('keydown', _onKeydown);
    _list.addEventListener('click', _onResultClick);
    _clear?.addEventListener('click', _resetInput);

    const closeBtn = _panel.querySelector('.dock-panel__close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.toggleManager?.setState('search', false);
    });
    _panel.addEventListener('click', (e) => e.stopPropagation());

    window.toggleManager?.on('search', (open) => open ? _open() : _close());
    window.toggleManager?.markReady('search');
  }

  // ── Open / Close ──────────────────────────────────────────────────────────

  function _open() {
    requestAnimationFrame(() => _input?.focus());
  }

  function _close() {
    _resetInput();
  }

  // ── Input handling ────────────────────────────────────────────────────────

  function _onInput() {
    const q = _input.value.trim();
    _toggleClear(q.length > 0);
    clearTimeout(_timer);
    if (!q) { _clearResults(); return; }
    _timer = setTimeout(() => _search(q), DEBOUNCE);
  }

  function _resetInput() {
    if (_input) _input.value = '';
    _toggleClear(false);
    _clearResults();
    _input?.focus();
  }

  function _toggleClear(show) {
    _clear?.classList.toggle('visible', show);
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────

  function _onKeydown(e) {
    const items = _list.querySelectorAll('.search-result-item');
    const count = items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _focusIdx = Math.min(_focusIdx + 1, count - 1);
      _highlightItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _focusIdx = Math.max(_focusIdx - 1, 0);
      _highlightItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = _focusIdx >= 0 ? items[_focusIdx] : items[0];
      target?.click();
    } else if (e.key === 'Escape') {
      window.toggleManager?.setState('search', false);
    }
  }

  function _highlightItem(items) {
    items.forEach((el, i) => el.classList.toggle('is-focused', i === _focusIdx));
    items[_focusIdx]?.scrollIntoView({ block: 'nearest' });
  }

  // ── API call ──────────────────────────────────────────────────────────────

  async function _search(query) {
    _abortCtrl?.abort();
    _abortCtrl = new AbortController();

    _setStatus('loading');

    const params = new URLSearchParams({
      q: query, limit: String(RESULT_LIMIT), autocomplete: '1'
    });
    const center = _map?.getCenter?.();
    if (center) {
      params.set('lat', String(center.lat));
      params.set('lon', String(center.lng));
    }

    try {
      const res = await fetch(`${API}?${params}`, { signal: _abortCtrl.signal });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const features = data.features || [];
      features.length ? _renderResults(features) : _setStatus('empty');
    } catch (err) {
      if (err.name === 'AbortError') return;
      _setStatus('error');
    }
  }

  // ── Render results ────────────────────────────────────────────────────────

  function _renderResults(features) {
    _list.innerHTML = '';
    _focusIdx = -1;

    features.forEach(({ properties: p, geometry: g }) => {
      const [lon, lat] = g.coordinates;
      const icon = TYPE_ICONS[p.type] || TYPE_ICONS.default;
      const street = p.name || '';
      const city = [p.postcode, p.city].filter(Boolean).join(' ');

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'search-result-item';
      el.dataset.lat = lat;
      el.dataset.lon = lon;
      el.dataset.label = p.label || street;
      el.dataset.city = city;
      el.innerHTML =
        `<span class="search-result-item__icon"><i class="fas ${icon}" aria-hidden="true"></i></span>` +
        `<span class="search-result-item__text">` +
          `<span class="search-result-item__title">${_esc(street)}</span>` +
          (city ? `<span class="search-result-item__sub">${_esc(city)}</span>` : '') +
        `</span>`;
      _list.appendChild(el);
    });

    _list.classList.add('visible');
  }

  function _setStatus(type) {
    _focusIdx = -1;
    const icons  = { loading: 'fa-spinner fa-spin', empty: 'fa-magnifying-glass', error: 'fa-triangle-exclamation' };
    const labels = {
      loading: 'Recherche…',
      empty:   'Aucun résultat',
      error:   'Erreur de recherche'
    };
    _list.innerHTML =
      `<div class="search-status search-status--${type}">` +
        `<i class="fas ${icons[type]}" aria-hidden="true"></i>` +
        `<span>${labels[type]}</span>` +
      `</div>`;
    _list.classList.add('visible');
  }

  // ── Result click ──────────────────────────────────────────────────────────

  function _onResultClick(e) {
    const item = e.target.closest('.search-result-item');
    if (!item) return;

    const lat   = parseFloat(item.dataset.lat);
    const lon   = parseFloat(item.dataset.lon);
    const label = item.dataset.label;
    const city  = item.dataset.city;
    const currentZoom = typeof _map.getZoom === 'function' ? _map.getZoom() : 0;
    const targetZoom = Math.max(currentZoom, 17);

    _placeMarker(lat, lon, label, city);
    _map.flyTo([lat, lon], targetZoom, { duration: FLY_DURATION });
    window.toggleManager?.setState('search', false);
  }

  // ── Map marker ────────────────────────────────────────────────────────────

  function _placeMarker(lat, lng, title, subtitle) {
    _removeMarker();

    _marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html:
          '<div class="gp-custom-marker" style="--marker-color: var(--primary, #14AE5C);">' +
            '<i class="fas fa-magnifying-glass" aria-hidden="true"></i>' +
          '</div>',
        className: 'gp-marker-container gp-search-marker-wrap',
        iconSize:   [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -40]
      }),
      zIndexOffset: 900
    }).addTo(_map);

    const popupContent =
      `<div class="gp-search-card">` +
        `<div class="gp-search-card__body">` +
          `<div class="gp-search-card__icon"><i class="fas fa-location-dot"></i></div>` +
          `<div class="gp-search-card__text">` +
            `<div class="gp-search-card__title">${_esc(title)}</div>` +
            (subtitle ? `<div class="gp-search-card__sub">${_esc(subtitle)}</div>` : '') +
          `</div>` +
        `</div>` +
        `<div class="gp-search-card__footer">` +
          `<span class="gp-search-card__coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>` +
          `<button type="button" class="gp-search-card__close" aria-label="Fermer"><i class="fas fa-xmark"></i></button>` +
        `</div>` +
      `</div>`;

    _marker.bindPopup(popupContent, { maxWidth: 300, className: 'gp-search-popup-wrap', closeButton: false });

    // Open popup after flyTo settles, wire close button
    _map._mlMap?.once('moveend', () => {
      _marker?.openPopup();
      // Delegate close to marker removal
      document.querySelector('.gp-search-card__close')?.addEventListener('click', () => _removeMarker());
    });
  }

  function _removeMarker() {
    if (_marker && _map) { _map.removeLayer(_marker); _marker = null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _clearResults() {
    _list.innerHTML = '';
    _list.classList.remove('visible');
    _focusIdx = -1;
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init,
    removeMarker: _removeMarker,
    openSearchOverlay:  _open,
    closeSearchOverlay: _close
  };
})();
