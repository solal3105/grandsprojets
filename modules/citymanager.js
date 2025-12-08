// modules/citymanager.js
// Gestion des villes : détection, branding, logos, UI du sélecteur

;(function(win) {
  'use strict';

  const CityManager = {
    VALID_CITIES: new Set(),
    CITY_BRANDING_CACHE: new Map(),
    _cityMenuOpen: false,
    _cityMenuDocHandler: null,

    // ==================== Helpers de validation ====================

    isValidCity(city) {
      try { 
        return this.VALID_CITIES.has(String(city || '').toLowerCase()); 
      } catch (_) { 
        return false; 
      }
    },

    // ==================== Détection de ville ====================

    getRawCityFromPath(pathname) {
      try {
        const path = String(pathname || location.pathname || '').toLowerCase();
        return path.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] || '';
      } catch (_) { 
        return ''; 
      }
    },

    parseCityFromPath(pathname) {
      const raw = this.getRawCityFromPath(pathname);
      return this.isValidCity(raw) ? raw : '';
    },

    getCityFromQuery(defaultCity = '') {
      try {
        const sp = new URLSearchParams(location.search);
        const raw = String(sp.get('city') || '').toLowerCase().trim();
        return this.isValidCity(raw) ? raw : '';
      } catch (_) {
        return '';
      }
    },

    getRawCityFromQueryParam() {
      try {
        const sp = new URLSearchParams(location.search);
        const raw = String(sp.get('city') || '').toLowerCase().trim();
        return raw;
      } catch (_) { 
        return ''; 
      }
    },

    // ==================== Persistance ====================

    persistCity(city) {
      try { 
        if (this.isValidCity(city)) localStorage.setItem('activeCity', city); 
      } catch (_) {}
    },

    restoreCity() {
      try {
        const v = localStorage.getItem('activeCity');
        return this.isValidCity(v) ? v : '';
      } catch (_) { 
        return ''; 
      }
    },

    clearPersistedCity() {
      try { 
        localStorage.removeItem('activeCity'); 
      } catch (_) {}
    },

    // ==================== Chargement des villes valides ====================

    async loadValidCities() {
      try {
        if (!win.supabaseService || typeof win.supabaseService.getValidCities !== 'function') return;
        const list = await win.supabaseService.getValidCities();
        if (Array.isArray(list) && list.length) {
          this.VALID_CITIES = new Set(list.map(v => String(v || '').toLowerCase().trim()).filter(Boolean));
        }
      } catch (_) { /* keep fallback */ }
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

    // ==================== Branding (logos, favicon) ====================

    selectLogoForTheme(branding, theme) {
      if (!branding) return null;
      if (theme === 'dark' && branding.dark_logo_url) return branding.dark_logo_url;
      return branding.logo_url || null;
    },

    applyFavicon(href) {
      try {
        if (!href) return;
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = href;
      } catch (_) {}
    },

    async updateLogoForCity(city) {
      try {
        const targets = [
          document.querySelector('#left-nav .logo img'),
          document.querySelector('.mobile-fixed-logo img')
        ].filter(Boolean);

        // Fetch branding (toujours présent car ville par défaut = metropole-lyon)
        let branding = null;
        if (win.supabaseService && typeof win.supabaseService.getCityBranding === 'function' && city) {
          branding = await win.supabaseService.getCityBranding(city);
        }
        win._cityBranding = branding || null;

        // Si pas de branding, ne rien faire (ne devrait jamais arriver)
        if (!branding) {
          console.warn('[CityManager] Pas de branding trouvé pour la ville:', city);
          return;
        }

        const theme = (document.documentElement.getAttribute('data-theme') || 'light').toLowerCase();
        const picked = this.selectLogoForTheme(branding, theme);
        const altText = branding.brand_name || city.charAt(0).toUpperCase() + city.slice(1);

        // Appliquer le logo du branding
        targets.forEach((img) => {
          if (!img || !picked) return;
          img.src = picked;
          img.alt = altText;
          img.style.display = '';
          img.style.opacity = '1'; // Rendre visible
          img.onerror = null; // Pas de fallback
        });

        // Favicon
        if (branding.favicon_url) this.applyFavicon(branding.favicon_url);
      } catch (_) { /* noop */ }
    },

    applyCityInitialView(city) {
      try {
        const branding = win._cityBranding || null;
        const hasCoords = branding && typeof branding.center_lat === 'number' && typeof branding.center_lng === 'number';
        const hasZoom   = branding && typeof branding.zoom === 'number';
        if (!hasCoords || !hasZoom) return;
        
        const center = [branding.center_lat, branding.center_lng];
        const zoom   = branding.zoom;
        if (window.MapModule?.map?.setView) {
          window.MapModule.map.setView(center, zoom);
        }
      } catch (_) { /* noop */ }
    },

    // ==================== UI du sélecteur de ville ====================

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
      } catch(e) {
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
      } catch(e) {
        return null;
      }
    },

    // ==================== Menu de sélection d'espace ====================

    /**
     * Positionne le menu à droite, sous les toggles
     */
    positionCityMenu() {
      const menu = document.getElementById('city-menu');
      if (!menu) return;

      // Toujours à droite, à 12px du bord
      menu.style.top = '68px';
      menu.style.right = '12px';
      menu.style.left = 'auto';
    },

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
          menu.innerHTML = '<div class="city-menu-empty">Aucun espace configuré</div>';
          return;
        }

        // Récupérer les brandings de toutes les villes
        const brandings = await Promise.all(
          enabledCities.map(c => this.getCityBrandingSafe(c))
        );

        const html = enabledCities.map((cityCode, idx) => {
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
            <button class="city-menu-item${isActive ? ' is-active' : ''}" data-city="${cityCode}" role="menuitem">
              <span class="city-menu-icon">${logoHtml}</span>
              <span class="city-menu-name">${displayName}</span>
              ${isActive ? '<i class="fas fa-check city-menu-check"></i>' : ''}
            </button>
          `;
        }).join('');

        menu.innerHTML = html;

        // Bind click events
        menu.querySelectorAll('.city-menu-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const city = item.dataset.city;
            if (city) this.selectCity(city);
          });
        });

        // Positionner le menu sous le toggle
        this.positionCityMenu();
      } catch (err) {
        console.warn('[CityManager] Error rendering city menu:', err);
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
        if (cityCode === String(win.activeCity).toLowerCase()) return;

        // Persister et naviguer
        this.persistCity(cityCode);
        
        // Construire l'URL avec le paramètre city
        const sp = new URLSearchParams(location.search);
        sp.set('city', cityCode);
        const target = location.pathname + '?' + sp.toString();
        location.href = target;
      } catch (err) {
        console.warn('[CityManager] Error selecting city:', err);
      }
    },

    /**
     * Initialise le menu d'espace
     * @param {string} activeCity - Ville active
     */
    async initCityMenu(activeCity) {
      await this.renderCityMenu(activeCity);
      
      // Repositionner le menu à chaque ouverture du toggle
      const toggle = document.getElementById('city-toggle');
      if (toggle && !toggle._cityMenuBound) {
        toggle.addEventListener('click', () => {
          // Repositionner après un court délai pour laisser le menu s'afficher
          requestAnimationFrame(() => this.positionCityMenu());
        });
        toggle._cityMenuBound = true;
      }

      // Repositionner aussi au resize
      if (!win._cityMenuResizeBound) {
        window.addEventListener('resize', () => this.positionCityMenu());
        win._cityMenuResizeBound = true;
      }
    },

    /**
     * Retourne la ville active en utilisant toutes les sources disponibles
     * @returns {string} Ville active ou chaîne vide
     */
    getActiveCity() {
      return this.parseCityFromPath(location.pathname) || 
             this.getCityFromQuery('') || 
             this.restoreCity() || 
             win.activeCity || 
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
        console.warn('[CityManager] Aucune ville valide chargée → Utilisation de metropole-lyon');
        return win.activeCity = 'metropole-lyon';
      }

      // Si ville invalide dans l'URL, utiliser metropole-lyon
      if (rawQueryCity && !this.isValidCity(rawQueryCity)) {
        console.warn('[CityManager] Ville invalide détectée:', rawQueryCity, '→ Utilisation de metropole-lyon');
        this.clearPersistedCity();
        return win.activeCity = 'metropole-lyon';
      }
      
      if (rawPathCity && !this.isValidCity(rawPathCity)) {
        console.warn('[CityManager] Ville invalide dans le path:', rawPathCity, '→ Utilisation de metropole-lyon');
        this.clearPersistedCity();
        return win.activeCity = 'metropole-lyon';
      }

      // Résolution normale
      const city = this.resolveActiveCity();
      
      // Si ville résolue mais invalide, utiliser metropole-lyon
      if (city && !this.isValidCity(city)) {
        console.warn('[CityManager] Ville résolue invalide:', city, '→ Utilisation de metropole-lyon');
        this.clearPersistedCity();
        return win.activeCity = 'metropole-lyon';
      }
      
      win.activeCity = city;
      
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
