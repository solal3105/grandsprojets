// modules/contrib/contrib-cities-management.js
// Gestion complète des villes (CRUD) pour admin global avec carte interactive

;(function(win) {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const STORAGE_BUCKET = 'uploads';
  const BRANDING_PATH = 'branding/cities';
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const ALLOWED_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];

  // ============================================================================
  // UTILITIES
  // ============================================================================

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function slugify(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function showToast(message, type = 'info') {
    if (win.ContribUtils && typeof win.ContribUtils.showToast === 'function') {
      win.ContribUtils.showToast(message, type);
    } else {
      console.log(`[Toast ${type}]`, message);
    }
  }

  // ============================================================================
  // LOAD CITIES LIST
  // ============================================================================

  /**
   * Charge et affiche la liste des villes
   * @param {Object} elements - {citiesListEl, citiesStatusEl}
   */
  async function loadCitiesList(elements) {
    const { citiesListEl, citiesStatusEl } = elements;
    
    if (!citiesListEl) return;

    try {
      if (citiesStatusEl) citiesStatusEl.textContent = 'Chargement...';
      if (citiesListEl) citiesListEl.innerHTML = '';

      const cities = await win.supabaseService.getAllCitiesForManagement();

      if (citiesStatusEl) citiesStatusEl.textContent = '';

      // Filtrer selon les permissions de l'utilisateur
      const userVilles = win.__CONTRIB_VILLES || [];
      const isGlobalAdmin = Array.isArray(userVilles) && userVilles.includes('global');
      
      let filteredCities = cities;
      if (!isGlobalAdmin) {
        // Si pas admin global, ne montrer que les villes dont on est responsable
        filteredCities = cities.filter(city => userVilles.includes(city.ville));
      }

      if (!filteredCities || filteredCities.length === 0) {
        citiesListEl.innerHTML = `
          <div style="text-align:center;padding:40px;color:var(--gray-600);">
            <i class="fa-solid fa-city" style="font-size:48px;opacity:0.3;margin-bottom:16px;"></i>
            <p style="margin:0;font-size:15px;">Aucune ville accessible</p>
            <p style="margin:8px 0 0 0;font-size:13px;opacity:0.7;">${isGlobalAdmin ? 'Cliquez sur "Ajouter une ville" pour commencer' : 'Vous n\'avez accès à aucune ville'}</p>
          </div>
        `;
        return;
      }

      // Trier par ville (alphabétique)
      filteredCities.sort((a, b) => (a.ville || '').localeCompare(b.ville || ''));

      // Render cities (avec info si l'utilisateur peut les modifier)
      citiesListEl.innerHTML = filteredCities.map(city => {
        const canManage = isGlobalAdmin || userVilles.includes(city.ville);
        return renderCityCard(city, canManage);
      }).join('');

      // Bind actions
      citiesListEl.querySelectorAll('.city-card__view').forEach(btn => {
        btn.addEventListener('click', () => {
          const ville = btn.dataset.ville;
          // Close modal before redirect
          const overlay = document.getElementById('contrib-overlay');
          if (overlay) overlay.style.display = 'none';
          // Redirect to city view
          window.location.href = `/?city=${encodeURIComponent(ville)}`;
        });
      });

      citiesListEl.querySelectorAll('.city-card__edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const ville = btn.dataset.ville;
          console.log('[cities-list] EDIT button clicked for ville:', ville);
          const city = filteredCities.find(c => c.ville === ville);
          console.log('[cities-list] Found city object:', city);
          if (city) {
            showCityModal(city, elements);
          } else {
            console.error('[cities-list] City not found in filteredCities!');
          }
        });
      });

      citiesListEl.querySelectorAll('.city-card__delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const ville = btn.dataset.ville;
          const city = filteredCities.find(c => c.ville === ville);
          if (city) confirmDeleteCity(city, elements);
        });
      });

    } catch (error) {
      console.error('[contrib-cities-management] loadCitiesList error:', error);
      if (citiesStatusEl) citiesStatusEl.textContent = 'Erreur de chargement';
      showToast('Erreur lors du chargement des villes', 'error');
    }
  }

  /**
   * Render une card ville
   * @param {Object} city - Données de la ville
   * @param {boolean} canManage - Si l'utilisateur peut gérer cette ville
   */
  function renderCityCard(city, canManage = true) {
    const logoUrl = city.logo_url || '/img/logos/default.svg';
    const brandName = escapeHtml(city.brand_name || city.ville);
    const ville = escapeHtml(city.ville);
    const hasCoords = city.center_lat && city.center_lng;
    const adminCount = city.admin_count || 0;
    const hasNoAdmin = adminCount === 0;

    return `
      <div class="city-card ${hasNoAdmin ? 'city-card--warning' : ''} ${!canManage ? 'city-card--readonly' : ''}" data-ville="${ville}">
        <div class="city-card__logo">
          <img src="${escapeHtml(logoUrl)}" alt="${brandName}" onerror="this.src='/img/logos/default.svg'">
        </div>
        <div class="city-card__content">
          <div class="city-card__header">
            <h4 class="city-card__name">${brandName}</h4>
            <span class="city-card__code">${ville}</span>
            ${!canManage ? '<span class="city-card__readonly-badge"><i class="fa-solid fa-lock"></i> Lecture seule</span>' : ''}
          </div>
          <div class="city-card__meta">
            ${hasCoords ? `
              <span class="city-card__coord">
                <i class="fa-solid fa-location-dot"></i>
                ${city.center_lat.toFixed(4)}, ${city.center_lng.toFixed(4)}
              </span>
              <span class="city-card__zoom">
                <i class="fa-solid fa-magnifying-glass"></i>
                Zoom ${city.zoom || 12}
              </span>
            ` : '<span style="color:var(--gray-500);">Pas de coordonnées</span>'}
          </div>
          <div class="city-card__admins">
            ${hasNoAdmin ? `
              <span class="city-card__admin-warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Aucun administrateur assigné
              </span>
            ` : `
              <span class="city-card__admin-count">
                <i class="fa-solid fa-user-shield"></i>
                ${adminCount} admin${adminCount > 1 ? 's' : ''}
              </span>
            `}
          </div>
        </div>
        <div class="city-card__actions">
          <button class="city-card__view gp-btn gp-btn--secondary" data-ville="${ville}" title="Voir la ville">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="city-card__edit gp-btn gp-btn--secondary" data-ville="${ville}" title="Modifier" ${!canManage ? 'disabled' : ''}>
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="city-card__delete gp-btn gp-btn--danger" data-ville="${ville}" title="Supprimer" ${!canManage ? 'disabled' : ''}>
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // CITY MODAL (CREATE/EDIT)
  // ============================================================================

  /**
   * Affiche la modale de création/édition d'une ville
   * @param {Object|null} city - Ville à éditer (null pour création)
   * @param {Object} elements - {citiesListEl, citiesStatusEl}
   */
  async function showCityModal(city = null, elements) {
    console.log('[city-modal] Opening modal');
    console.log('[city-modal] Mode:', city ? 'EDIT' : 'CREATE');
    console.log('[city-modal] City data:', JSON.stringify(city, null, 2));
    console.log('[city-modal] Elements:', elements);
    
    const isEdit = !!city;
    const title = isEdit ? 'Modifier une ville' : 'Ajouter une ville';

    // Supprimer toute modale existante avant d'en créer une nouvelle
    const existingOverlay = document.getElementById('city-management-overlay');
    if (existingOverlay) {
      console.log('[city-modal] Removing existing modal');
      existingOverlay.remove();
    }

    // Create overlay avec le système unifié
    const overlay = document.createElement('div');
    overlay.id = 'city-management-overlay';
    overlay.className = 'gp-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'city-management-title');

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'gp-modal';
    modal.setAttribute('role', 'document');

    modal.innerHTML = `
      <div class="gp-modal-header">
        <h2 id="city-management-title" class="gp-modal-title">
          <i class="fa-solid ${isEdit ? 'fa-pen-to-square' : 'fa-city'}" style="color:var(--info);margin-right:8px;"></i>
          ${escapeHtml(title)}
          ${isEdit ? `<span style="margin-left:8px;padding:4px 8px;background:var(--info-lighter);color:var(--info);border-radius:6px;font-size:12px;font-weight:600;">ÉDITION</span>` : ''}
        </h2>
        <button type="button" class="gp-modal-close" aria-label="Fermer">&times;</button>
      </div>
      
      <div class="gp-modal-body" style="max-height:70vh;overflow-y:auto;">
      
      <form id="city-form" style="padding:24px;">
        ${isEdit ? `
        <!-- Info ville en édition -->
        <div style="margin-bottom:20px;padding:16px;background:var(--info-lighter);border:1px solid var(--info-light);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <i class="fa-solid fa-info-circle" style="color:var(--info);font-size:20px;"></i>
            <div>
              <div style="font-weight:600;color:var(--info);margin-bottom:4px;">Édition de la ville</div>
              <div style="font-size:13px;color:var(--gray-700);">
                Code : <strong>${escapeHtml(city?.ville || '')}</strong>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <!-- Code ville (masqué en édition) -->
        <div class="form-group" style="margin-bottom:20px;${isEdit ? 'display:none;' : ''}">
          <label style="display:block;margin-bottom:6px;font-weight:600;font-size:14px;">
            Code ville <span style="color:var(--danger);">*</span>
          </label>
          <input 
            type="text" 
            id="city-code" 
            ${isEdit ? '' : 'required'}
            placeholder="lyon"
            value="${escapeHtml(city?.ville || '')}"
            style="width:100%;padding:12px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;"
          />
          <p style="margin:4px 0 0 0;font-size:12px;color:var(--gray-500);">
            Minuscules, sans espaces ni accents (ex: lyon, besancon)
          </p>
        </div>

        <!-- Nom affiché -->
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:6px;font-weight:600;font-size:14px;">
            Nom affiché <span style="color:var(--danger);">*</span>
          </label>
          <input 
            type="text" 
            id="city-name" 
            required 
            placeholder="Grand Lyon"
            value="${escapeHtml(city?.brand_name || '')}"
            style="width:100%;padding:12px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;"
          />
        </div>

        <!-- Carte interactive -->
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:8px;font-weight:600;font-size:14px;">
            📍 Position et zoom de la carte <span style="color:var(--danger);">*</span>
          </label>
          
          <!-- Barre de recherche -->
          <div style="margin-bottom:12px;">
            <input 
              type="text" 
              id="city-search" 
              placeholder="🔍 Rechercher une adresse..."
              style="width:100%;padding:12px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;"
            />
          </div>

          <!-- Carte -->
          <div id="city-map" style="width:100%;height:400px;border-radius:12px;border:2px solid var(--gray-200);margin-bottom:12px;"></div>

          <!-- Info position -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--gray-100);border-radius:8px;margin-bottom:12px;">
            <i class="fa-solid fa-location-dot" style="color:var(--info);"></i>
            <span id="city-coords" style="font-size:14px;font-family:monospace;">
              Lat: ${city?.center_lat || 45.7578}, Lng: ${city?.center_lng || 4.8320}, Zoom: ${city?.zoom || 12}
            </span>
          </div>

          <!-- Actions carte -->
          <div style="display:flex;gap:8px;">
            <button type="button" id="city-geolocate" class="gp-btn gp-btn--secondary" style="flex:1;">
              <i class="fa-solid fa-location-crosshairs"></i>
              Centrer sur ma position
            </button>
            <button type="button" id="city-reset-map" class="gp-btn gp-btn--secondary" style="flex:1;">
              <i class="fa-solid fa-rotate-left"></i>
              Réinitialiser
            </button>
          </div>
        </div>

        <!-- Logo principal -->
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:8px;font-weight:600;font-size:14px;">
            🖼️ Logo principal <span style="color:var(--danger);">*</span>
          </label>
          <div class="image-upload-zone" data-type="logo">
            <input type="file" id="city-logo" accept="image/svg+xml,image/png,image/jpeg,image/webp" style="display:none;">
            <div class="upload-dropzone" style="border:2px dashed var(--gray-300);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:32px;color:var(--info);margin-bottom:8px;"></i>
              <p style="margin:0;font-size:14px;color:var(--gray-600);">Cliquez ou glissez une image</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:var(--gray-500);">SVG, PNG, JPG, WEBP - Max 2MB</p>
            </div>
            <div class="upload-preview" style="display:${city?.logo_url ? 'block' : 'none'};margin-top:12px;text-align:center;">
              <img src="${escapeHtml(city?.logo_url || '')}" style="max-width:200px;max-height:100px;border:1px solid var(--gray-300);border-radius:8px;padding:8px;">
              <button type="button" class="remove-image" style="display:block;margin:8px auto 0;padding:6px 12px;background:var(--danger);color:var(--on-danger);border:none;border-radius:6px;cursor:pointer;font-size:12px;">
                <i class="fa-solid fa-trash"></i> Supprimer
              </button>
            </div>
          </div>
        </div>

        <!-- Logo mode sombre (optionnel) -->
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:8px;font-weight:600;font-size:14px;">
            🌙 Logo mode sombre (optionnel)
          </label>
          <div class="image-upload-zone" data-type="logo-dark">
            <input type="file" id="city-logo-dark" accept="image/svg+xml,image/png,image/jpeg,image/webp" style="display:none;">
            <div class="upload-dropzone" style="border:2px dashed var(--gray-300);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:32px;color:var(--info);margin-bottom:8px;"></i>
              <p style="margin:0;font-size:14px;color:var(--gray-500);">Cliquez ou glissez une image</p>
            </div>
            <div class="upload-preview" style="display:${city?.dark_logo_url ? 'block' : 'none'};margin-top:12px;text-align:center;background:var(--gray-900);padding:12px;border-radius:8px;">
              <img src="${escapeHtml(city?.dark_logo_url || '')}" style="max-width:200px;max-height:100px;border:1px solid var(--gray-600);border-radius:8px;padding:8px;">
              <button type="button" class="remove-image" style="display:block;margin:8px auto 0;padding:6px 12px;background:var(--danger);color:var(--on-danger);border:none;border-radius:6px;cursor:pointer;font-size:12px;">
                <i class="fa-solid fa-trash"></i> Supprimer
              </button>
            </div>
          </div>
        </div>

        <!-- Favicon (optionnel) -->
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:8px;font-weight:600;font-size:14px;">
            🔖 Favicon (optionnel)
          </label>
          <div class="image-upload-zone" data-type="favicon">
            <input type="file" id="city-favicon" accept="image/png,image/jpeg,image/webp" style="display:none;">
            <div class="upload-dropzone" style="border:2px dashed var(--gray-300);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:32px;color:var(--info);margin-bottom:8px;"></i>
              <p style="margin:0;font-size:14px;color:var(--gray-500);">Cliquez ou glissez une image</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:var(--gray-500);">PNG, JPG, WEBP - 32x32 ou 64x64px recommandé</p>
            </div>
            <div class="upload-preview" style="display:${city?.favicon_url ? 'block' : 'none'};margin-top:12px;text-align:center;">
              <img src="${escapeHtml(city?.favicon_url || '')}" style="width:32px;height:32px;border:1px solid var(--gray-300);border-radius:4px;">
              <button type="button" class="remove-image" style="display:block;margin:8px auto 0;padding:6px 12px;background:var(--danger);color:var(--on-danger);border:none;border-radius:6px;cursor:pointer;font-size:12px;">
                <i class="fa-solid fa-trash"></i> Supprimer
              </button>
            </div>
          </div>
        </div>

        <!-- Actions -->
      </form>
      </div>
      
      <div class="gp-modal-footer">
        <button type="button" class="cancel-btn gp-btn gp-btn--secondary">
          Annuler
        </button>
        <button type="submit" form="city-form" class="submit-btn gp-btn gp-btn--primary">
          <i class="fa-solid fa-check" style="margin-right:6px;"></i>
          ${isEdit ? 'Enregistrer' : 'Créer la ville'}
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Auto-normalize city code on input
    const cityCodeInput = modal.querySelector('#city-code');
    if (cityCodeInput && !isEdit) {
      cityCodeInput.addEventListener('input', (e) => {
        const normalized = slugify(e.target.value);
        if (normalized !== e.target.value) {
          const cursorPos = e.target.selectionStart;
          e.target.value = normalized;
          e.target.setSelectionRange(cursorPos, cursorPos);
        }
      });
    }

    // Add CSS for dropzone hover
    const style = document.createElement('style');
    style.textContent = `
      .upload-dropzone:hover { border-color: var(--info); background: var(--info-lighter); }
    `;
    document.head.appendChild(style);

    // Initialize map
    const mapState = initializeCityMap(modal, city);
    console.log('[city-modal] Map state:', mapState);

    if (!mapState) {
      console.error('[city-modal] Failed to initialize map!');
      showToast('Erreur : impossible d\'initialiser la carte', 'error');
      overlay.remove();
      return;
    }

    // Setup image uploads
    setupImageUploads(modal);

    // Close handlers
    const close = () => {
      if (mapState && mapState.map) mapState.map.remove();
      win.ModalHelper?.close('city-management-overlay');
      style.remove();
    };

    // Bind cancel and close buttons
    const closeBtn = modal.querySelector('.gp-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    
    modal.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', close);
    });

    // Form submit
    const form = modal.querySelector('#city-form');
    console.log('[city-modal] Form element:', form);
    if (form) {
      form.addEventListener('submit', async (e) => {
        console.log('[city-modal] Form submit event triggered');
        e.preventDefault();
        await handleCityFormSubmit(modal, mapState, city, elements, close);
      });
    } else {
      console.error('[city-modal] Form element not found!');
    }

    // Ouvrir avec ModalHelper
    win.ModalHelper?.open('city-management-overlay', {
      focusTrap: true,
      dismissible: true,
      onClose: close
    });
  }

  // ============================================================================
  // MAP INITIALIZATION
  // ============================================================================

  /**
   * Initialise la carte Leaflet interactive
   */
  function initializeCityMap(modal, city) {
    const mapEl = modal.querySelector('#city-map');
    const coordsEl = modal.querySelector('#city-coords');
    const searchInput = modal.querySelector('#city-search');
    const geolocateBtn = modal.querySelector('#city-geolocate');
    const resetBtn = modal.querySelector('#city-reset-map');

    console.log('[city-map] Elements found:', { mapEl, coordsEl, searchInput, geolocateBtn, resetBtn });

    // Check DOM elements
    if (!mapEl) {
      console.error('[city-map] Map element #city-map not found');
      showToast('Erreur : élément carte introuvable', 'error');
      return null;
    }

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('[city-map] Leaflet not loaded');
      showToast('Erreur : Leaflet non chargé', 'error');
      return null;
    }

    // Fix Leaflet icon paths
    try {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
      });
    } catch (e) {
      console.error('[city-map] Icon config error:', e);
    }

    // Initial position
    const initialLat = city?.center_lat || 45.7578;
    const initialLng = city?.center_lng || 4.8320;
    const initialZoom = city?.zoom || 12;

    // Create map
    const map = L.map(mapEl).setView([initialLat, initialLng], initialZoom);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // State
    const state = {
      map,
      marker: null,
      lat: initialLat,
      lng: initialLng,
      zoom: initialZoom
    };

    // Add draggable marker (with timeout to ensure map is ready)
    setTimeout(() => {
      try {
        const marker = L.marker([initialLat, initialLng], {
          draggable: true
        }).addTo(map);
        
        state.marker = marker;
        
        // Marker drag event
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLatLng();
          state.lat = lat;
          state.lng = lng;
          updateCoords();
        });
      } catch (e) {
        console.error('[city-map] Marker creation error:', e);
      }
    }, 100);

    // Update coords display
    const updateCoords = () => {
      coordsEl.textContent = `Lat: ${state.lat.toFixed(4)}, Lng: ${state.lng.toFixed(4)}, Zoom: ${state.zoom}`;
    };

    // Zoom change
    map.on('zoomend', () => {
      state.zoom = map.getZoom();
      updateCoords();
    });

    // Search (simple implementation with Nominatim)
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();
      if (query.length < 3) return;

      searchTimeout = setTimeout(async () => {
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
          const results = await response.json();
          
          if (results && results.length > 0) {
            const { lat, lon } = results[0];
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lon);
            
            map.setView([latNum, lngNum], 13);
            if (state.marker) state.marker.setLatLng([latNum, lngNum]);
            state.lat = latNum;
            state.lng = lngNum;
            state.zoom = 13;
            updateCoords();
          }
        } catch (error) {
          console.error('[city-map] Search error:', error);
        }
      }, 500);
    });

    // Geolocation
    geolocateBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Géolocalisation non disponible', 'error');
        return;
      }

      geolocateBtn.disabled = true;
      geolocateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Localisation...';

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.setView([latitude, longitude], 13);
          if (state.marker) state.marker.setLatLng([latitude, longitude]);
          state.lat = latitude;
          state.lng = longitude;
          state.zoom = 13;
          updateCoords();
          
          geolocateBtn.disabled = false;
          geolocateBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Centrer sur ma position';
        },
        (error) => {
          console.error('[city-map] Geolocation error:', error);
          showToast('Impossible d\'obtenir votre position', 'error');
          geolocateBtn.disabled = false;
          geolocateBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Centrer sur ma position';
        }
      );
    });

    // Reset
    resetBtn.addEventListener('click', () => {
      const defaultLat = 46.5;
      const defaultLng = 2.5;
      const defaultZoom = 6;
      
      map.setView([defaultLat, defaultLng], defaultZoom);
      if (state.marker) state.marker.setLatLng([defaultLat, defaultLng]);
      state.lat = defaultLat;
      state.lng = defaultLng;
      state.zoom = defaultZoom;
      updateCoords();
    });

    return state;
  }

  // ============================================================================
  // IMAGE UPLOADS
  // ============================================================================

  /**
   * Configure les zones d'upload d'images
   */
  function setupImageUploads(modal) {
    const zones = modal.querySelectorAll('.image-upload-zone');

    zones.forEach(zone => {
      const type = zone.dataset.type;
      const input = zone.querySelector('input[type="file"]');
      const dropzone = zone.querySelector('.upload-dropzone');
      const preview = zone.querySelector('.upload-preview');
      const removeBtn = preview?.querySelector('.remove-image');

      // Click to upload
      dropzone.addEventListener('click', () => input.click());

      // Drag & drop
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--info)';
        dropzone.style.background = 'var(--info-lighter)';
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--gray-300)';
        dropzone.style.background = '';
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--gray-300)';
        dropzone.style.background = '';
        
        const file = e.dataTransfer.files[0];
        if (file) handleImageFile(file, zone, type);
      });

      // File input change
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleImageFile(file, zone, type);
      });

      // Remove image
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          input.value = '';
          preview.style.display = 'none';
          zone.dataset.file = '';
        });
      }
    });
  }

  /**
   * Gère un fichier image sélectionné
   */
  function handleImageFile(file, zone, type) {
    // Validation
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('Type de fichier non autorisé. Utilisez SVG, PNG, JPG ou WEBP.', 'error');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showToast('Fichier trop volumineux. Maximum 2MB.', 'error');
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = zone.querySelector('.upload-preview');
      const img = preview.querySelector('img');
      
      img.src = e.target.result;
      preview.style.display = 'block';
      
      // Store file in zone dataset
      zone.dataset.file = 'pending';
      zone.fileObject = file;
    };
    reader.readAsDataURL(file);
  }

  // ============================================================================
  // FORM SUBMIT
  // ============================================================================

  /**
   * Gère la soumission du formulaire
   */
  async function handleCityFormSubmit(modal, mapState, existingCity, elements, close) {
    const submitBtn = modal.querySelector('.submit-btn');
    const originalBtnText = submitBtn.innerHTML;

    console.log('[city-form] Submit started');

    try {
      // Disable button
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';

      // Get form data
      const name = modal.querySelector('#city-name').value.trim();
      
      // En mode édition, utiliser le code existant. En création, lire le champ.
      let code;
      if (existingCity) {
        // Mode édition : utiliser le code de la ville existante (non modifiable)
        code = existingCity.ville;
        console.log('[city-form] EDIT mode - using existing code:', code);
      } else {
        // Mode création : lire et normaliser le champ code
        const codeRaw = modal.querySelector('#city-code').value.trim();
        code = slugify(codeRaw);
        console.log('[city-form] CREATE mode - Code raw:', codeRaw, '→ normalized:', code);
      }

      console.log('[city-form] Final - Code:', code, 'Name:', name);

      // Validation
      if (!code || !name) {
        showToast('Code ville et nom sont requis', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        return;
      }

      // Validate code format (should always pass after slugify, but double-check)
      if (!/^[a-z0-9-]+$/.test(code)) {
        console.log('[city-form] Invalid code format after normalization:', code);
        showToast('Code ville invalide après normalisation. Contactez le support.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        return;
      }

      console.log('[city-form] Code format valid');

      // Check logo
      const logoZone = modal.querySelector('.image-upload-zone[data-type="logo"]');
      const hasNewLogo = logoZone.dataset.file === 'pending';
      const hasExistingLogo = existingCity?.logo_url;

      console.log('[city-form] Logo check - hasNewLogo:', hasNewLogo, 'hasExistingLogo:', hasExistingLogo);
      console.log('[city-form] logoZone:', logoZone, 'dataset.file:', logoZone?.dataset?.file);

      if (!hasNewLogo && !hasExistingLogo) {
        console.log('[city-form] No logo provided');
        showToast('Logo principal requis', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        return;
      }

      console.log('[city-form] Logo validation passed');

      // Upload images
      let logoUrl = existingCity?.logo_url || null;
      let darkLogoUrl = existingCity?.dark_logo_url || null;
      let faviconUrl = existingCity?.favicon_url || null;

      console.log('[city-form] Starting image uploads...');

      if (hasNewLogo) {
        console.log('[city-form] Uploading main logo...');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload logo...';
        logoUrl = await uploadCityImage(logoZone.fileObject, code, 'logo');
        console.log('[city-form] Logo uploaded:', logoUrl);
      }

      const darkLogoZone = modal.querySelector('.image-upload-zone[data-type="logo-dark"]');
      if (darkLogoZone.dataset.file === 'pending') {
        console.log('[city-form] Uploading dark logo...');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload logo dark...';
        darkLogoUrl = await uploadCityImage(darkLogoZone.fileObject, code, 'logo-dark');
        console.log('[city-form] Dark logo uploaded:', darkLogoUrl);
      }

      const faviconZone = modal.querySelector('.image-upload-zone[data-type="favicon"]');
      if (faviconZone.dataset.file === 'pending') {
        console.log('[city-form] Uploading favicon...');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload favicon...';
        faviconUrl = await uploadCityImage(faviconZone.fileObject, code, 'favicon');
        console.log('[city-form] Favicon uploaded:', faviconUrl);
      }

      // Prepare city data
      const cityData = {
        ville: code,
        brand_name: name,
        logo_url: logoUrl,
        dark_logo_url: darkLogoUrl,
        favicon_url: faviconUrl,
        center_lat: mapState.lat,
        center_lng: mapState.lng,
        zoom: mapState.zoom
      };

      console.log('[city-form] City data prepared:', cityData);

      // Save to database
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
      
      if (existingCity) {
        console.log('[city-form] Updating city...');
        await win.supabaseService.updateCity(code, cityData);
        showToast(`Ville "${name}" mise à jour avec succès !`, 'success');
      } else {
        console.log('[city-form] Creating city...');
        const result = await win.supabaseService.createCity(cityData);
        console.log('[city-form] City created:', result);
        showToast(`Ville "${name}" créée avec succès !`, 'success');
      }

      // Reload list
      await loadCitiesList(elements);

      // Close modal
      close();

    } catch (error) {
      console.error('[contrib-cities-management] handleCityFormSubmit error:', error);
      showToast(error.message || 'Erreur lors de l\'enregistrement', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }

  /**
   * Upload une image vers Supabase Storage
   */
  async function uploadCityImage(file, ville, type) {
    try {
      const ext = file.name.split('.').pop();
      const filename = `${slugify(ville)}-${type}.${ext}`;
      const path = `${BRANDING_PATH}/${filename}`;

      const { data, error } = await win.AuthModule.getClient()
        .storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type
        });

      if (error) throw error;

      const { data: urlData } = win.AuthModule.getClient()
        .storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('[contrib-cities-management] uploadCityImage error:', error);
      throw new Error(`Erreur lors de l'upload de l'image: ${error.message}`);
    }
  }

  // ============================================================================
  // DELETE CITY
  // ============================================================================

  /**
   * Confirme et supprime une ville
   */
  async function confirmDeleteCity(city, elements) {
    const confirmed = confirm(
      `Supprimer la ville "${city.brand_name}" (${city.ville}) ?\n\n` +
      `⚠️ Attention : Les utilisateurs et contributions liés à cette ville seront affectés.\n\n` +
      `Cette action est irréversible.`
    );

    if (!confirmed) return;

    try {
      await win.supabaseService.deleteCity(city.ville);
      showToast(`Ville "${city.brand_name}" supprimée avec succès`, 'success');
      await loadCitiesList(elements);
    } catch (error) {
      console.error('[contrib-cities-management] confirmDeleteCity error:', error);
      showToast(error.message || 'Erreur lors de la suppression', 'error');
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCitiesManagement = {
    loadCitiesList,
    showCityModal,
    showAddCityModal: (elements) => showCityModal(null, elements) // Alias pour ajouter une ville
  };

})(window);
