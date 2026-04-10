// modules/citymanager.js
// Gestion des villes : détection, branding, logos, UI du sélecteur

;(function(win) {
  'use strict';

  const CityManager = {
    VALID_CITIES: new Set(),
    CITY_BRANDING_CACHE: new Map(),
    _branding: null,
    _activeCity: '',
    _cityMenuOpen: false,
    _cityMenuDocHandler: null,

    // Helpers de validation

    isValidCity(city) {
      try { 
        return this.VALID_CITIES.has(String(city || '').toLowerCase()); 
      } catch (e) { 
        console.debug('[citymanager] isValidCity failed:', e);
        return false; 
      }
    },

    // Détection de ville

    getRawCityFromPath(pathname) {
      try {
        const path = String(pathname || location.pathname || '').toLowerCase();
        return path.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] || '';
      } catch (e) { 
        console.debug('[citymanager] getRawCityFromPath failed:', e);
        return ''; 
      }
    },

    parseCityFromPath(pathname) {
      const raw = this.getRawCityFromPath(pathname);
      return this.isValidCity(raw) ? raw : '';
    },

    getCityFromQuery(_defaultCity = '') {
      try {
        const sp = new URLSearchParams(location.search);
        const raw = String(sp.get('city') || '').toLowerCase().trim();
        return this.isValidCity(raw) ? raw : '';
      } catch (e) {
        console.debug('[citymanager] getCityFromQuery failed:', e);
        return '';
      }
    },

    getRawCityFromQueryParam() {
      try {
        const sp = new URLSearchParams(location.search);
        const raw = String(sp.get('city') || '').toLowerCase().trim();
        return raw;
      } catch (e) { 
        console.debug('[citymanager] getRawCityFromQueryParam failed:', e);
        return ''; 
      }
    },

    // Persistance

    persistCity(city) {
      try { 
        if (this.isValidCity(city)) localStorage.setItem('activeCity', city); 
      } catch (e) { console.debug('[citymanager] persistCity failed:', e); }
    },

    restoreCity() {
      try {
        const v = localStorage.getItem('activeCity');
        return this.isValidCity(v) ? v : '';
      } catch (e) { 
        console.debug('[citymanager] restoreCity failed:', e);
        return ''; 
      }
    },

    clearPersistedCity() {
      try { 
        localStorage.removeItem('activeCity'); 
      } catch (e) { console.debug('[citymanager] clearPersistedCity failed:', e); }
    },

    // Chargement des villes valides

    async loadValidCities() {
      try {
        if (!win.supabaseService || typeof win.supabaseService.getValidCities !== 'function') return;
        const list = await win.supabaseService.getValidCities();
        if (Array.isArray(list) && list.length) {
          this.VALID_CITIES = new Set(list.map(v => String(v || '').toLowerCase().trim()).filter(Boolean));
        }
      } catch (e) { console.debug('[citymanager] loadValidCities failed:', e); }
    },

    getDefaultCity() {
      // Ville par défaut : metropole-lyon
      return 'metropole-lyon';
    },

    resolveActiveCity() {
      const routeCity = this.parseCityFromPath(location.pathname);
      if (routeCity) return routeCity;
      const queryCity = this.getCityFromQuery('');
      if (queryCity) return queryCity;
      const saved = this.restoreCity();
      if (saved) return saved;
      // Aucune ville trouvée : retourner metropole-lyon par défaut
      return 'metropole-lyon';
    },

    // Branding (logos, favicon)

    /**
     * Retourne le branding complet stocké (chargé en Phase 2)
     * @returns {Object|null}
     */
    getBranding() {
      return this._branding;
    },

    /**
     * Stocke le branding (appelé par main.js Phase 2)
     * @param {Object|null} branding
     */
    setBranding(branding) {
      this._branding = branding || null;
    },

    selectLogoForTheme(branding, theme) {
      if (!branding) return null;
      if (theme === 'dark' && branding.dark_logo_url) return branding.dark_logo_url;
      return branding.logo_url || null;
    },

    /**
     * Charge le branding depuis Supabase et met à jour les logos dans le DOM.
     * Le favicon est délégué à CityBrandingModule.
     * @param {string} city - Code de la ville
     */
    async updateLogoForCity(city) {
      try {
        const targets = [
          document.querySelector('#nav-panel .logo img'),
          document.querySelector('.mobile-fixed-logo img'),
          document.querySelector('#dock-logo img'),
          document.querySelector('.gp-sidebar__logo img')
        ].filter(Boolean);

        // Fetch branding une seule fois (stocké pour toute l'app)
        let branding = null;
        if (win.supabaseService && typeof win.supabaseService.getCityBranding === 'function' && city) {
          branding = await win.supabaseService.getCityBranding(city);
        }
        this._branding = branding || null;

        if (!branding) {
          console.debug('[CityManager] Pas de branding trouvé pour la ville:', city);
          return;
        }

        const theme = (document.documentElement.getAttribute('data-theme') || 'light').toLowerCase();
        const picked = this.selectLogoForTheme(branding, theme);
        const altText = branding.brand_name || city.charAt(0).toUpperCase() + city.slice(1);

        // Appliquer le logo du branding
        targets.forEach((img) => {
          if (!img || !picked) return;
          img.style.opacity = '0';
          img.src = picked;
          img.alt = altText;
          img.style.display = '';
          img.onerror = null;
          img.onload = () => { img.style.transition = 'opacity 0.2s ease'; img.style.opacity = '1'; };
          if (img.complete && img.naturalWidth > 0) {
            img.style.transition = 'opacity 0.2s ease';
            img.style.opacity = '1';
          }
        });
      } catch (e) { console.debug('[citymanager] updateLogoForCity failed:', e); }
    },

    applyCityInitialView(_city) {
      try {
        const branding = this._branding || null;
        const hasCoords = branding && typeof branding.center_lat === 'number' && typeof branding.center_lng === 'number';
        const hasZoom   = branding && typeof branding.zoom === 'number';
        if (!hasCoords || !hasZoom) return;
        
        const center = [branding.center_lat, branding.center_lng];
        const zoom   = branding.zoom;
        if (window.MapModule?.map?.setView) {
          window.MapModule.map.setView(center, zoom);
        }
      } catch (e) { console.debug('[citymanager] applyCityInitialView failed:', e); }
    },

    // UI du sélecteur de ville

    async getCityBrandingSafe(ville) {
      const key = String(ville || '').toLowerCase();
      if (!key) return null;
      if (this.CITY_BRANDING_CACHE.has(key)) return this.CITY_BRANDING_CACHE.get(key);
      
      try {
        const data = await (win.supabaseService?.getCityBranding ? win.supabaseService.getCityBranding(key) : null);
        const minimal = data ? {
          ville: data.ville || key,
          brand_name: data.brand_name || '',
          logo_url: data.logo_url || '',
          dark_logo_url: data.dark_logo_url || ''
        } : null;
        this.CITY_BRANDING_CACHE.set(key, minimal);
        return minimal;
      } catch (e) {
        console.debug('[citymanager] getCityBrandingSafe failed:', e);
        this.CITY_BRANDING_CACHE.set(key, null);
        return null;
      }
    },

    /**
     * Récupère le branding complet d'une ville (avec enabled_cities, enabled_toggles, etc.)
     * @param {string} ville - Code de la ville
     * @returns {Promise<Object|null>} Branding complet ou null
     */
    async getFullBrandingSafe(ville) {
      const key = String(ville || '').toLowerCase();
      if (!key) return null;
      
      try {
        const data = await (win.supabaseService?.getCityBranding ? win.supabaseService.getCityBranding(key) : null);
        return data || null;
      } catch (e) {
        console.debug('[citymanager] getFullBrandingSafe failed:', e);
        return null;
      }
    },

    // Menu de sélection d'espace

    /**
     * Peuple le menu de sélection d'espace avec les villes de enabled_cities
     * @param {string} activeCity - Ville actuellement active
     */
    async renderCityMenu(activeCity) {
      try {
        const menu = document.getElementById('city-menu');
        if (!menu) return;

        // Récupérer le branding de la ville active pour avoir enabled_cities
        const branding = await this.getFullBrandingSafe(activeCity);
        const enabledCities = branding?.enabled_cities;

        // Si pas d'espaces configurés, menu vide
        if (!Array.isArray(enabledCities) || enabledCities.length === 0) {
          menu.innerHTML = '<div class="dock-panel__header"><span class="dock-panel__title">Espace</span></div><div class="dock-panel__body" style="padding:12px;color:var(--text-tertiary);font-size:0.78rem;">Aucun espace configuré</div>';
          return;
        }

        // Récupérer les brandings de toutes les villes
        const brandings = await Promise.all(
          enabledCities.map(c => this.getCityBrandingSafe(c))
        );

        const itemsHtml = enabledCities.map((cityCode, idx) => {
          const isActive = String(cityCode).toLowerCase() === String(activeCity).toLowerCase();
          const b = brandings[idx] || {};
          const displayName = b.brand_name?.trim() || cityCode.charAt(0).toUpperCase() + cityCode.slice(1);
          const logo = (document.documentElement.getAttribute('data-theme') === 'dark' && b.dark_logo_url) 
            ? b.dark_logo_url 
            : (b.logo_url || '');
          const logoHtml = logo 
            ? `<img src="${logo}" alt="${displayName}" class="city-menu-logo" />`
            : `<i class="fas fa-building"></i>`;

          return `
            <button class="dock-panel__item city-menu-item${isActive ? ' is-active' : ''}" data-city="${cityCode}" role="menuitem">
              <span class="dock-panel__item-icon">${logoHtml}</span>
              <span class="dock-panel__item-label">${displayName}</span>
            </button>
          `;
        }).join('');

        menu.innerHTML = `
          <div class="dock-panel__header">
            <span class="dock-panel__title">Espace</span>
            <button class="dock-panel__close" aria-label="Fermer le menu espace"><i class="fas fa-times"></i></button>
          </div>
          <div class="dock-panel__body">${itemsHtml}</div>
        `;

        // Bind close button
        menu.querySelector('.dock-panel__close')?.addEventListener('click', (e) => {
          e.stopPropagation();
          win.toggleManager?.setState('city', false);
        });

        // Bind click events
        menu.querySelectorAll('.city-menu-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const city = item.dataset.city;
            if (city) this.selectCity(city);
          });
        });
      } catch (err) {
        console.debug('[CityManager] Error rendering city menu:', err);
      }
    },

    /**
     * Sélectionne une ville et navigue vers elle
     * @param {string} city - Code de la ville
     */
    selectCity(city) {
      try {
        const cityCode = String(city || '').toLowerCase();
        if (!cityCode) return;

        // Fermer le menu
        if (win.toggleManager) {
          win.toggleManager.setState('city', false);
        }

        // Si c'est déjà la ville active, ne rien faire
        if (cityCode === String(this._activeCity).toLowerCase()) return;

        // Persister et naviguer
        this.persistCity(cityCode);
        
        // Construire l'URL avec le paramètre city
        const sp = new URLSearchParams(location.search);
        sp.set('city', cityCode);
        const target = location.pathname + '?' + sp.toString();
        location.href = target;
      } catch (err) {
        console.debug('[CityManager] Error selecting city:', err);
      }
    },

    /**
     * Initialise le menu d'espace
     * @param {string} activeCity - Ville active
     */
    async initCityMenu(activeCity) {
      await this.renderCityMenu(activeCity);
    },

    /**
     * Retourne la ville active en utilisant toutes les sources disponibles
     * @returns {string} Ville active ou chaîne vide
     */
    getActiveCity() {
      return this.parseCityFromPath(location.pathname) || 
             this.getCityFromQuery('') || 
             this.restoreCity() || 
             this._activeCity || 
             this.getDefaultCity();
    },

    /**
     * Initialise et résout la ville active avec gestion de la persistance
     * Utilise metropole-lyon par défaut si aucune ville valide
     * @returns {string} Ville active résolue (toujours une ville, jamais null)
     */
    initializeActiveCity() {
      const rawQueryCity = this.getRawCityFromQueryParam();
      const rawPathCity = this.getRawCityFromPath();
      
      // Si pas de villes valides chargées, utiliser metropole-lyon par défaut
      if (!this.VALID_CITIES || this.VALID_CITIES.size === 0) {
        console.debug('[CityManager] Aucune ville valide chargée → Utilisation de metropole-lyon');
        this._activeCity = 'metropole-lyon';
        return this._activeCity;
      }

      // Si ville invalide dans l'URL, utiliser metropole-lyon
      if (rawQueryCity && !this.isValidCity(rawQueryCity)) {
        console.debug('[CityManager] Ville invalide détectée:', rawQueryCity, '→ Utilisation de metropole-lyon');
        this.clearPersistedCity();
        this._activeCity = 'metropole-lyon';
        return this._activeCity;
      }
      
      if (rawPathCity && !this.isValidCity(rawPathCity)) {
        console.debug('[CityManager] Ville invalide dans le path:', rawPathCity, '→ Utilisation de metropole-lyon');
        this.clearPersistedCity();
        this._activeCity = 'metropole-lyon';
        return this._activeCity;
      }

      // Résolution normale
      const city = this.resolveActiveCity();
      
      // Si ville résolue mais invalide, utiliser metropole-lyon
      if (city && !this.isValidCity(city)) {
        console.debug('[CityManager] Ville résolue invalide:', city, '→ Utilisation de metropole-lyon');
        this.clearPersistedCity();
        this._activeCity = 'metropole-lyon';
        return this._activeCity;
      }
      
      this._activeCity = city;
      
      // Gérer la persistance
      if (city && this.isValidCity(city)) {
        if (this.restoreCity() !== city) this.persistCity(city);
      } else {
        this.clearPersistedCity();
      }
      
      return city;
    },

    /**
     * Récupère les informations d'une ville (version synchrone depuis le cache)
     * @param {string} cityCode - Code de la ville
     * @returns {Object|null} - Informations de la ville ou null
     */
    getCityInfo(cityCode) {
      if (!cityCode) return null;
      if (!this.isValidCity(cityCode)) return null;
      
      const key = String(cityCode).toLowerCase();
      // Retourner depuis le cache si disponible
      if (this.CITY_BRANDING_CACHE.has(key)) {
        return this.CITY_BRANDING_CACHE.get(key);
      }
      
      // Sinon retourner un objet minimal
      return {
        ville: key,
        brand_name: key.charAt(0).toUpperCase() + key.slice(1),
        logo_url: '/img/logos/default.svg',
        dark_logo_url: null
      };
    },

    /**
     * Récupère les informations d'une ville (version async avec fetch)
     * @param {string} cityCode - Code de la ville
     * @returns {Promise<Object|null>} - Informations de la ville ou null
     */
    async getCityInfoAsync(cityCode) {
      if (!cityCode) return null;
      if (!this.isValidCity(cityCode)) return null;
      
      // Utiliser getCityBrandingSafe qui gère le cache et fetch si nécessaire
      return await this.getCityBrandingSafe(cityCode);
    }
  };

  // Exposer le module globalement
  win.CityManager = CityManager;

})(window);
