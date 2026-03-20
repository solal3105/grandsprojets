// modules/cameramarkers.js
// Gestion complète des camera markers (points avec images)

;(function(win) {
  'use strict';

  // ============================================================================
  // CRÉATION DES MARKERS
  // ============================================================================

  /**
   * Crée l'icône caméra avec le système unifié gp-custom-marker
   * @param {string} color - Couleur de l'icône (optionnel)
   * @returns {L.DivIcon} Icône Leaflet
   */
  function createCameraIcon(color) {
    const iconColor = color || 'var(--color-info)'; // Bleu par défaut pour les caméras
    return L.divIcon({
      html: `
        <div class="gp-custom-marker" style="--marker-color: ${iconColor};">
          <i class="fa-solid fa-camera"></i>
        </div>
      `,
      className: 'gp-marker-container',
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -40]
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
        if (win.Lightbox) {
          win.Lightbox.open(imgUrl, title || 'image');
        } else {
          win.open(imgUrl, '_blank');
        }
      } catch (e) {
        try { win.open(imgUrl, '_blank'); } catch(_) {}
      }
    });
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
