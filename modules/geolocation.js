// modules/geolocation.js

window.GeolocationModule = (() => {
  'use strict';

  let _btn    = null;
  let _map    = null;
  let _marker = null;
  let _circle = null;
  let _active = false; // true while markers are on the map

  // ── Init ─────────────────────────────────────────────────────────────────

  function init(mapInstance) {
    if (!mapInstance) return;
    _map = mapInstance;

    _btn = document.getElementById('location-toggle');
    if (!_btn) return;

    if (!('geolocation' in navigator) || !window.isSecureContext) {
      _btn.disabled = true;
      _btn.classList.add('is-disabled');
      _btn.setAttribute('aria-disabled', 'true');
      _btn.setAttribute('title', 'La localisation n\'est pas disponible sur cet appareil ou dans ce contexte.');
      _btn.setAttribute('data-title', 'Localisation indisponible');
      return;
    }

    _btn.addEventListener('click', _handleClick);

    if (window.toggleManager) {
      window.toggleManager.markReady('location');
    }
  }

  // ── Click: toggle behaviour ───────────────────────────────────────────────

  function _handleClick(e) {
    e?.preventDefault();
    e?.stopPropagation();
    if (_active) {
      _clear();
    } else {
      _startLocating();
    }
  }

  // ── Start geolocation ─────────────────────────────────────────────────────

  function _startLocating() {
    _setState('loading');
    navigator.geolocation.getCurrentPosition(
      _onSuccess,
      _onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  function _onSuccess(position) {
    if (!_map) return;
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    const currentZoom = typeof _map.getZoom === 'function' ? _map.getZoom() : 0;

    // Remove any previous markers
    _removeMarkers();

    // Pulsing dot marker
    _marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: '<div class="gp-user-location"><div class="gp-user-location__pulse"></div><div class="gp-user-location__dot"></div></div>',
        className: '',
        iconSize:   [20, 20],
        iconAnchor: [10, 10]
      }),
      interactive: false,
      zIndexOffset: 1000
    }).addTo(_map);

    // Accuracy ring
    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary').trim() || '#14AE5C';
    _circle = L.circle([lat, lng], {
      radius:      accuracy,
      color:       primaryColor,
      fillColor:   primaryColor,
      fillOpacity: 0.08,
      weight:      1.5,
      opacity:     0.4,
      interactive: false
    }).addTo(_map);

    // Smooth fly-to (zoom depends on fix quality)
    const minTargetZoom = accuracy > 500 ? 15 : 17;
    const targetZoom = Math.max(currentZoom, minTargetZoom);
    _map.flyTo([lat, lng], targetZoom, { duration: 1.8 });

    _active = true;
    _setState('active');
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  function _onError(error) {
    const messages = {
      1: 'Accès à la localisation refusé. Vérifiez les paramètres de votre navigateur.',
      2: 'Position introuvable. Assurez-vous que le GPS est activé.',
      3: 'La recherche a pris trop de temps. Réessayez à l\'extérieur.'
    };
    const msg = messages[error?.code] || 'Impossible de déterminer votre position.';

    _setState('error');
    window.Toast?.show(msg, 'error', 6000);

    // Auto-reset after error display
    setTimeout(() => { if (!_active) _setState('idle'); }, 3500);
  }

  // ── Clear markers + reset ─────────────────────────────────────────────────

  function _removeMarkers() {
    if (_marker && _map) { _map.removeLayer(_marker); _marker = null; }
    if (_circle && _map) { _map.removeLayer(_circle); _circle = null; }
  }

  function _clear() {
    _removeMarkers();
    _active = false;
    _setState('idle');
  }

  // ── Button state machine ──────────────────────────────────────────────────
  // 'idle' | 'loading' | 'active' | 'error'

  function _setState(state) {
    if (!_btn) return;
    _btn.classList.remove('loading', 'error');
    _btn.removeAttribute('aria-pressed');
    _btn.disabled = false;

    let label = 'Centrer sur ma position';

    switch (state) {
      case 'loading':
        _btn.classList.add('loading');
        _btn.disabled = true;
        label = 'Recherche de votre position';
        break;
      case 'active':
        _btn.setAttribute('aria-pressed', 'true');
        label = 'Votre position';
        break;
      case 'error':
        _btn.classList.add('error');
        label = 'Erreur de localisation';
        break;
      default: // idle
        label = 'Centrer sur ma position';
    }

    _btn.setAttribute('title', label);
    _btn.setAttribute('data-title', label);
    _btn.setAttribute('aria-label', state === 'active' ? 'Votre position, cliquer pour effacer' : label);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return { init };
})();
