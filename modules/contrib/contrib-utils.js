// modules/contrib/contrib-utils.js
// Fonctions utilitaires pour le système de contribution

;(function(win) {
  'use strict';

  // STRING UTILITIES

  /**
   * Convertit une chaîne en slug (URL-friendly)
   * @param {string} str - Chaîne à convertir
   * @returns {string} Slug généré
   */
  function slugify(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'geom';
  }

  const escapeHtml = window.SecurityUtils.escapeHtml;

  // URL & PATH UTILITIES

  /**
   * Extrait le chemin relatif de stockage depuis une URL publique Supabase
   * @param {string} url - URL publique Supabase
   * @returns {string|null} Chemin relatif ou null
   */
  function toStorageRelPathFromPublicUrl(url) {
    try {
      if (!url) return null;
      const marker = '/object/public/';
      const i = url.indexOf(marker);
      if (i === -1) {
        // fallback to basename
        try { 
          return new URL(url, win.location.href).pathname.split('/').slice(-1)[0] || url; 
        } catch { 
          return String(url); 
        }
      }
      const after = url.slice(i + marker.length); // e.g., 'uploads/geojson/...'
      const prefix = 'uploads/';
      return after.startsWith(prefix) ? after.slice(prefix.length) : after;
    } catch {
      return null;
    }
  }

  // FILE UTILITIES

  /**
   * Formate une taille de fichier en octets en format lisible
   * @param {number} bytes - Taille en octets
   * @returns {string} Taille formatée (ex: "1.5 MB")
   */
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // TOAST NOTIFICATIONS

  /**
   * Affiche une notification toast accessible
   * Délègue au système unifié Toast (modules/toast.js)
   * @param {string} message - Message à afficher
   * @param {string} kind - Type de toast ('info', 'success', 'error')
   */
  function showToast(message, kind = 'info') {
    if (win.Toast) {
      win.Toast.show(message, kind);
    } else {
      console.warn('[showToast] Toast module not loaded');
    }
  }


  // VALIDATION UTILITIES

  /**
   * Valide une URL
   * @param {string} str - URL à valider
   * @returns {boolean} True si l'URL est valide
   */
  function isValidUrl(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Valide un fichier GeoJSON
   * @param {Object} geojson - Objet GeoJSON à valider
   * @returns {boolean} True si le GeoJSON est valide
   */
  function isValidGeoJSON(geojson) {
    if (!geojson || typeof geojson !== 'object') return false;
    if (!geojson.type) return false;
    
    const validTypes = ['Feature', 'FeatureCollection', 'Point', 'LineString', 'Polygon', 
                        'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
    
    return validTypes.includes(geojson.type);
  }

  /**
   * Normalise un GeoJSON en FeatureCollection
   * Gère: Feature, FeatureCollection, géométries brutes, MultiPoint
   * @param {Object} geojson - GeoJSON d'entrée
   * @returns {Object} FeatureCollection normalisée
   */
  function normalizeToFeatureCollection(geojson) {
    if (!geojson) return { type: 'FeatureCollection', features: [] };
    
    // Déjà une FeatureCollection
    if (geojson.type === 'FeatureCollection') {
      const features = (geojson.features || []).map(f => ({
        type: 'Feature',
        properties: f.properties || {},
        geometry: f.geometry
      }));
      return { type: 'FeatureCollection', features };
    }
    
    // Une Feature simple
    if (geojson.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: geojson.properties || {},
          geometry: geojson.geometry
        }]
      };
    }
    
    // Géométrie brute (Point, LineString, Polygon, Multi*, GeometryCollection)
    const geomTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
    if (geomTypes.includes(geojson.type)) {
      // Cas spécial: MultiPoint -> convertir en plusieurs Features Point
      if (geojson.type === 'MultiPoint' && Array.isArray(geojson.coordinates)) {
        const features = geojson.coordinates.map(coords => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: coords }
        }));
        return { type: 'FeatureCollection', features };
      }
      
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: geojson
        }]
      };
    }
    
    return { type: 'FeatureCollection', features: [] };
  }

  // PERMISSIONS UTILITIES

  /**
   * Filtre les villes selon les permissions de l'utilisateur
   * @param {Array<string>} cities - Liste des villes disponibles
   * @returns {Array<string>} Villes filtrées selon les permissions
   */
  function filterCitiesByPermissions(cities) {
    const userVilles = win.__CONTRIB_VILLES;
    const hasGlobalAccess = Array.isArray(userVilles) && userVilles.includes('global');
    
    if (hasGlobalAccess) {
      return cities;
    }
    
    if (Array.isArray(userVilles) && userVilles.length > 0) {
      return cities.filter(c => userVilles.includes(c));
    }
    
    return [];
  }

  // AUTH UTILITIES

  /**
   * Vérifie la session avec refresh + timeout.
   * Redirige vers /login/ si la session est invalide.
   * @param {number} [timeoutMs=8000] - Délai max en ms
   * @returns {Promise<Object|null>} session ou null (redirigé)
   */
  async function getSessionOrRedirect(timeoutMs = 8000) {
    try {
      if (!win.AuthModule || typeof win.AuthModule.getSessionWithRefresh !== 'function') {
        win.location.href = '/login/';
        return null;
      }
      const result = await Promise.race([
        win.AuthModule.getSessionWithRefresh(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
      ]);
      const session = result?.session;
      if (!session || !session.user) {
        win.location.href = '/login/';
        return null;
      }
      return session;
    } catch {
      win.location.href = '/login/';
      return null;
    }
  }

  // CITY SELECT UTILITIES

  /**
   * Remplit un <select> avec les villes autorisées pour l'utilisateur.
   * @param {HTMLSelectElement} selectEl  - L'élément <select> à peupler
   * @param {Object} [opts]
   * @param {string} [opts.placeholder='Aucun'] - Texte de l'option vide
   * @param {string} [opts.preselectCity]        - Pré-sélectionner cette ville
   * @param {Function} [opts.onChange]           - Callback appelé après pré-sélection
   */
  async function populateCitySelect(selectEl, opts) {
    const { placeholder = 'Aucun', preselectCity, onChange } = opts || {};
    try {
      if (!selectEl || !win.supabaseService) return;

      let cities = [];
      try {
        if (typeof win.supabaseService.getValidCities === 'function') {
          cities = await win.supabaseService.getValidCities();
        }
      } catch (e) { console.warn('[contrib-utils] getValidCities:', e); }

      if ((!Array.isArray(cities) || !cities.length) && typeof win.supabaseService.listCities === 'function') {
        try { cities = await win.supabaseService.listCities(); } catch (e) { console.warn('[contrib-utils] listCities:', e); }
      }

      const filtered = filterCitiesByPermissions(cities);

      selectEl.innerHTML = `<option value="">${placeholder}</option>`;
      const html = (Array.isArray(filtered) ? filtered : [])
        .map(c => `<option value="${c}">${c}</option>`)
        .join('');

      if (html) {
        selectEl.insertAdjacentHTML('beforeend', html);
      } else {
        selectEl.innerHTML = `<option value="" selected>Aucune structure autorisée</option>`;
      }

      if (preselectCity && filtered.includes(preselectCity)) {
        selectEl.value = preselectCity;
        if (onChange) onChange();
      }
    } catch (err) {
      console.warn('[contrib-utils] populateCitySelect error:', err);
      if (selectEl && !selectEl.options.length) {
        selectEl.innerHTML = `<option value="" selected>${placeholder}</option>`;
      }
    }
  }

  // CONFIRM MODAL UTILITY

  /**
   * Crée et ouvre une modale de confirmation générique.
   * Retourne une Promise<boolean> (true = confirmé).
   *
   * @param {Object} opts
   * @param {string} opts.id          - ID de l'overlay (doit être unique)
   * @param {string} opts.title       - Titre de la modale (peut contenir du HTML)
   * @param {string} opts.bodyHTML    - Contenu HTML du body
   * @param {string} [opts.confirmLabel='Confirmer']
   * @param {string} [opts.confirmClass='btn-primary']
   * @param {string} [opts.cancelLabel='Annuler']
   * @returns {Promise<boolean>}
   */
  function buildConfirmModal(opts) {
    const {
      id, title, bodyHTML,
      confirmLabel = 'Confirmer',
      confirmClass = 'btn-primary',
      cancelLabel = 'Annuler'
    } = opts;

    return new Promise((resolve) => {
      let resolved = false;
      const close = (result) => {
        if (resolved) return;
        resolved = true;
        win.ModalHelper?.close(id);
        setTimeout(() => { try { overlay.remove(); } catch (e) { console.debug('[contrib-utils] DOM cleanup:', e); } }, 250);
        resolve(!!result);
      };

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = id;
      overlay.className = 'gp-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', id + '-title');

      // Modal
      const modal = document.createElement('div');
      modal.className = 'gp-modal gp-modal--compact';
      modal.setAttribute('role', 'document');

      // Header
      const header = document.createElement('div');
      header.className = 'gp-modal-header';
      const h2 = document.createElement('h2');
      h2.id = id + '-title';
      h2.className = 'gp-modal-title';
      h2.innerHTML = title;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'gp-modal-close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.innerHTML = '&times;';
      header.append(h2, closeBtn);

      // Body
      const body = document.createElement('div');
      body.className = 'gp-modal-body';
      body.innerHTML = bodyHTML;

      // Footer
      const footer = document.createElement('div');
      footer.className = 'gp-modal-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = cancelLabel;
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = confirmClass;
      confirmBtn.textContent = confirmLabel;
      footer.append(cancelBtn, confirmBtn);

      // Assemble
      modal.append(header, body, footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Listeners
      closeBtn.addEventListener('click', () => close(false));
      cancelBtn.addEventListener('click', () => close(false));
      confirmBtn.addEventListener('click', () => close(true));

      // Open with ModalHelper
      win.ModalHelper?.open(id, {
        focusTrap: true,
        dismissible: true,
        onClose: () => close(false)
      });

      setTimeout(() => { try { cancelBtn.focus(); } catch (e) { console.debug('[contrib-utils] focus management:', e); } }, 100);
    });
  }

  // EXPORTS

  win.ContribUtils = {
    // String utilities
    slugify,
    escapeHtml,
    
    // URL & Path utilities
    toStorageRelPathFromPublicUrl,
    
    // File utilities
    formatFileSize,
    
    // Toast notifications
    showToast,
    
    // Validation
    isValidUrl,
    isValidGeoJSON,
    
    // GeoJSON processing
    normalizeToFeatureCollection,
    
    // Permissions
    filterCitiesByPermissions,

    // Auth
    getSessionOrRedirect,

    // City select
    populateCitySelect,

    // Confirm modal
    buildConfirmModal
  };

})(window);
