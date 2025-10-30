// modules/cameramarkers.js
// Gestion complète des camera markers (points avec images)

;(function(win) {
  'use strict';

  // ============================================================================
  // CRÉATION DES MARKERS
  // ============================================================================

  /**
   * Crée l'icône caméra (juste l'icône, sans fond)
   * @param {string} color - Couleur de l'icône (optionnel)
   * @returns {L.DivIcon} Icône Leaflet
   */
  function createCameraIcon(color) {
    const iconColor = color || '#666';
    return L.divIcon({
      html: `<i class="fa fa-camera fa-fw" aria-hidden="true" style="color:${iconColor}"></i>`,
      className: 'camera-marker',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  /**
   * Crée un marker caméra pour un point avec image
   * @param {L.LatLng} latlng - Coordonnées du marker
   * @param {string} paneName - Nom du pane Leaflet (optionnel)
   * @param {string} color - Couleur de l'icône (optionnel)
   * @returns {L.Marker} Marker Leaflet
   */
  function createCameraMarker(latlng, paneName, color) {
    const options = {
      riseOnHover: true,
      icon: createCameraIcon(color)
    };
    
    // Utiliser le pane camera si disponible (z-index élevé)
    if (paneName) {
      options.pane = paneName;
    }
    
    return L.marker(latlng, options);
  }

  // ============================================================================
  // ÉVÉNEMENTS ET INTERACTIONS
  // ============================================================================

  /**
   * Gère les événements pour les camera markers (points avec images)
   * - Affiche la photo au survol (popup)
   * - Ouvre la lightbox au clic
   * @param {Object} feature - Feature GeoJSON
   * @param {Object} layer - Layer Leaflet
   */
  function bindCameraMarkerEvents(feature, layer) {
    const props = feature?.properties || {};
    const imgUrl = (props.imgUrl || '').trim();
    const title = props.titre || props.title || props.name || props.nom || '';
    
    if (!imgUrl) return;
    
    // Popup au survol
    setupHoverPopup(layer, imgUrl);
    
    // Lightbox au clic
    setupClickLightbox(layer, imgUrl, title);
  }

  /**
   * Configure le popup qui s'affiche au survol
   */
  function setupHoverPopup(layer, imgUrl) {
    const popupHtml = `
      <div class="map-photo" style="max-width:260px">
        <img src="${imgUrl}" alt="photo" style="max-width:260px;max-height:180px;display:block;border-radius:8px;box-shadow:0 12px 32px var(--black-alpha-45)" />
      </div>`;
    
    layer.bindPopup(popupHtml, { 
      maxWidth: 300,
      autoClose: true,
      closeOnClick: false
    });
    
    layer.on('mouseover', () => layer.openPopup());
    layer.on('mouseout', () => layer.closePopup());
  }

  /**
   * Configure la lightbox qui s'ouvre au clic
   */
  function setupClickLightbox(layer, imgUrl, title) {
    layer.on('click', () => {
      try {
        ensureLightboxExists(title);
        win.__fpLightboxImg.src = imgUrl;
        document.body.appendChild(win.__fpLightbox);
      } catch (e) {
        try { win.open(imgUrl, '_blank'); } catch(_) {}
      }
    });
  }

  /**
   * Crée la lightbox si elle n'existe pas déjà
   */
  function ensureLightboxExists(title) {
    if (win.__fpLightbox) return;

    const overlay = document.createElement('div');
    overlay.id = 'fp-img-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:var(--black-alpha-55)', 'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)', 'padding:24px'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'position:relative', 'max-width:90vw', 'max-height:90vh',
      'box-shadow:0 8px 24px var(--black-alpha-45)', 'border-radius:10px',
      'overflow:hidden', 'background:#000'
    ].join(';');

    const img = document.createElement('img');
    img.alt = title || 'image';
    img.style.cssText = 'display:block;max-width:90vw;max-height:85vh;object-fit:contain;box-shadow:0 24px 72px var(--black-alpha-60)';

    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer');
    close.innerHTML = '&times;';
    close.style.cssText = [
      'position:absolute', 'top:8px', 'right:10px',
      'width:36px', 'height:36px', 'border:none', 'border-radius:18px',
      'background:var(--black-alpha-55)', 'color:#fff',
      'font-size:26px', 'line-height:36px', 'cursor:pointer'
    ].join(';');

    const closeHandler = () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
    };
    const keyHandler = (e) => { if (e.key === 'Escape') closeHandler(); };

    close.addEventListener('click', closeHandler);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHandler(); });
    document.addEventListener('keydown', keyHandler);

    box.appendChild(img);
    box.appendChild(close);
    overlay.appendChild(box);
    
    win.__fpLightbox = overlay;
    win.__fpLightboxImg = img;
  }

  // ============================================================================
  // GESTION DU ZOOM
  // ============================================================================

  const CAMERA_MIN_ZOOM = 14; // Zoom minimum pour afficher les camera markers
  
  // Stockage des camera markers avec leur couche parente
  const cameraMarkersRegistry = new Map(); // Map<marker, parentLayer>

  /**
   * Enregistre un camera marker pour la gestion du zoom
   * @param {L.Marker} marker - Le marker à enregistrer
   * @param {L.LayerGroup} parentLayer - La couche parente contenant le marker
   */
  function registerCameraMarker(marker, parentLayer) {
    if (marker && parentLayer) {
      cameraMarkersRegistry.set(marker, parentLayer);
    }
  }

  /**
   * Met à jour la visibilité des camera markers selon le niveau de zoom
   * @param {L.Map} map - Instance de la carte Leaflet
   */
  function updateCameraMarkersVisibility(map) {
    if (!map) return;
    
    const currentZoom = map.getZoom();
    const shouldShow = currentZoom >= CAMERA_MIN_ZOOM;
    
    cameraMarkersRegistry.forEach((parentLayer, marker) => {
      if (shouldShow) {
        // Ajouter le marker s'il n'est pas déjà présent
        if (!parentLayer.hasLayer(marker)) {
          parentLayer.addLayer(marker);
        }
      } else {
        // Retirer le marker s'il est présent
        if (parentLayer.hasLayer(marker)) {
          parentLayer.removeLayer(marker);
        }
      }
    });
  }

  /**
   * Initialise la gestion du zoom pour les camera markers
   * @param {L.Map} map - Instance de la carte Leaflet
   */
  function initZoomControl(map) {
    if (!map) return;
    
    // Mise à jour initiale
    updateCameraMarkersVisibility(map);
    
    // Écouter les changements de zoom
    map.on('zoomend', () => {
      updateCameraMarkersVisibility(map);
    });
  }

  /**
   * Nettoie le registre des camera markers
   */
  function clearCameraMarkersRegistry() {
    cameraMarkersRegistry.clear();
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.CameraMarkers = {
    createCameraIcon,
    createCameraMarker,
    bindCameraMarkerEvents,
    registerCameraMarker,
    updateCameraMarkersVisibility,
    initZoomControl,
    clearCameraMarkersRegistry,
    CAMERA_MIN_ZOOM
  };

})(window);
