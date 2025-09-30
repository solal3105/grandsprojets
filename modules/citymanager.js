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
        // ?city=default force l'absence de ville
        if (raw === 'default') return '';
        return this.isValidCity(raw) ? raw : '';
      } catch (_) {
        return '';
      }
    },

    getRawCityFromQueryParam() {
      try {
        const sp = new URLSearchParams(location.search);
        const raw = String(sp.get('city') || '').toLowerCase().trim();
        if (raw === 'default') return '';
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
      // Pas de ville par défaut
      return '';
    },

    resolveActiveCity() {
      const routeCity = this.parseCityFromPath(location.pathname);
      if (routeCity) return routeCity;
      const queryCity = this.getCityFromQuery('');
      if (queryCity) return queryCity;
      const saved = this.restoreCity();
      return saved;
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

        // Cache des valeurs par défaut
        targets.forEach((img) => {
          if (!img) return;
          if (!img.dataset.defaultSrc) {
            const attrSrc = img.getAttribute('src');
            img.dataset.defaultSrc = attrSrc || img.src || 'img/logo.svg';
          }
          if (!img.dataset.defaultAlt) {
            img.dataset.defaultAlt = img.getAttribute('alt') || 'Grands Projets';
          }
          if (!img.dataset.defaultClass) {
            img.dataset.defaultClass = img.className || '';
          }
        });

        // Fetch branding
        let branding = null;
        if (win.supabaseService && typeof win.supabaseService.getCityBranding === 'function' && city) {
          branding = await win.supabaseService.getCityBranding(city);
        }
        win._cityBranding = branding || null;

        const theme = (document.documentElement.getAttribute('data-theme') || 'light').toLowerCase();
        const picked = this.selectLogoForTheme(branding, theme);
        const altText = (branding && branding.brand_name) ? branding.brand_name : (city ? city.charAt(0).toUpperCase() + city.slice(1) : (targets[0]?.dataset?.defaultAlt || ''));

        targets.forEach((img) => {
          if (!img) return;
          if (img.dataset.defaultClass) img.className = img.dataset.defaultClass;

          if (picked) {
            img.style.display = '';
            img.onerror = function() {
              try {
                img.onerror = null;
                img.src = img.dataset.defaultSrc;
                img.alt = img.dataset.defaultAlt || '';
                img.style.display = '';
              } catch (_) {}
            };
            img.src = picked;
            img.alt = altText;
          } else {
            img.onerror = null;
            img.src = img.dataset.defaultSrc;
            img.alt = img.dataset.defaultAlt || '';
            img.style.display = '';
          }
        });

        // Favicon
        if (branding && branding.favicon_url) this.applyFavicon(branding.favicon_url);
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

    async renderCityMenu(activeCity) {
      try {
        const menu = document.getElementById('city-menu');
        if (!menu) return;
        const items = Array.from(this.VALID_CITIES.values()).sort();
        if (!items.length) { menu.innerHTML = ''; return; }

        // Fetch branding pour toutes les villes
        const brandings = await Promise.all(items.map(c => this.getCityBrandingSafe(c)));
        const btns = items.map((c, idx) => {
          const isActive = String(c) === String(activeCity);
          const b = brandings[idx] || {};
          const displayName = (b.brand_name && b.brand_name.trim()) ? b.brand_name : (c.charAt(0).toUpperCase() + c.slice(1));
          const logo = (document.documentElement.getAttribute('data-theme') === 'dark' && b.dark_logo_url) ? b.dark_logo_url : (b.logo_url || '');
          const logoImg = logo ? `<img src="${logo}" alt="${displayName} logo" loading="lazy" />` : `<i class="fas fa-city" aria-hidden="true"></i>`;
          
          return (
            `<button class="city-item${isActive ? ' active' : ''} is-disabled" data-city="${c}" role="menuitem" aria-label="${displayName}" aria-disabled="true" disabled tabindex="-1" style="pointer-events:none; cursor:not-allowed;">`+
              `<div class="city-card">`+
                `<div class="city-logo">${logoImg}</div>`+
                `<div class="city-text">`+
                  `<div class="city-name">${displayName}</div>`+
                  `<div class="city-soon">Bientôt disponible</div>`+
                `</div>`+
              `</div>`+
            `</button>`
          );
        }).join('');

        const propose = `
          <div id="propose-city-card" class="propose-city-card" role="button" tabindex="0" aria-label="Proposer ma structure">
            <div class="city-logo"><i class="fas fa-plus" aria-hidden="true"></i></div>
            <div class="city-text">
              <div class="city-name">Proposer ma structure</div>
              <div class="city-subline">Utilisez grandsprojets pour donner de la visibilité à vos actions locales.</div>
            </div>
          </div>`;

        const grid = `<div class="city-grid" role="menu" aria-label="Villes disponibles (bientôt)">${btns}</div>`;
        menu.innerHTML = propose + grid;

        // Handler pour la carte "Proposer"
        const proposeCard = document.getElementById('propose-city-card');
        if (proposeCard && !proposeCard._bound) {
          const open = (e) => { e.stopPropagation(); this.openProposeCityModal(); };
          proposeCard.addEventListener('click', open);
          proposeCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
          });
          proposeCard._bound = true;
        }
      } catch (_) { /* noop */ }
    },

    openProposeCityModal() {
      const overlay = document.getElementById('propose-city-overlay');
      if (!overlay) return;
      
      if (win.ModalManager?.isOpen('city-overlay')) {
        win.ModalManager.switch('city-overlay', 'propose-city-overlay');
      } else {
        win.ModalManager?.open('propose-city-overlay');
      }
      
      const closeBtn = document.getElementById('propose-city-close');
      if (closeBtn && !closeBtn._bound) { 
        closeBtn.addEventListener('click', () => win.ModalManager?.close('propose-city-overlay')); 
        closeBtn._bound = true; 
      }
    },

    closeProposeCityModal() {
      win.ModalManager?.close('propose-city-overlay');
    },

    ensureCityOverlayExists() {
      let overlay = document.getElementById('city-overlay');
      if (overlay) return overlay;
      
      try {
        overlay = document.createElement('div');
        overlay.id = 'city-overlay';
        overlay.className = 'gp-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'city-title');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
        overlay.innerHTML = [
          '<div class="gp-modal" role="document">',
          '  <div class="gp-modal-header">',
          '    <div class="gp-modal-title" id="city-title">Changer de ville<\/div>',
          '    <button class="gp-modal-close" id="city-close" aria-label="Fermer">&times;<\/button>',
          '  <\/div>',
          '  <div class="gp-modal-body">',
          '    <div id="city-menu" role="menu" aria-label="Villes disponibles"><\/div>',
          '  <\/div>',
          '<\/div>'
        ].join('');
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeCityMenu(); });
        
        const closeBtn = overlay.querySelector('#city-close');
        if (closeBtn && !closeBtn._bound) { 
          closeBtn.addEventListener('click', () => this.closeCityMenu()); 
          closeBtn._bound = true; 
        }
        return overlay;
      } catch (e) {
        return null;
      }
    },

    openCityMenu() {
      let overlay = document.getElementById('city-overlay');
      if (!overlay) {
        overlay = this.ensureCityOverlayExists();
      }
      if (!overlay) return;

      try {
        const menu = document.getElementById('city-menu');
        if (menu && !menu.hasChildNodes()) {
          this.renderCityMenu(win.activeCity || '');
        }
      } catch (_) {}

      win.ModalManager?.open('city-overlay');
      this._cityMenuOpen = true;

      const closeBtn = document.getElementById('city-close');
      if (closeBtn && !closeBtn._bound) { 
        closeBtn.addEventListener('click', () => this.closeCityMenu()); 
        closeBtn._bound = true; 
      }

      const modal = overlay.querySelector('.gp-modal');
      requestAnimationFrame(() => { if (modal) modal.classList.add('is-open'); });

      try { document.getElementById('city-close')?.focus(); } catch (_) {}
    },

    closeCityMenu() {
      const overlay = document.getElementById('city-overlay');
      if (!overlay) return;
      
      const modal = overlay.querySelector('.gp-modal');
      if (modal) modal.classList.remove('is-open');
      
      win.ModalManager?.close('city-overlay');
      this._cityMenuOpen = false;
    },

    toggleCityMenu() { 
      this._cityMenuOpen ? this.closeCityMenu() : this.openCityMenu(); 
    },

    selectCity(next) {
      try {
        const city = String(next || '').toLowerCase();
        if (!this.isValidCity(city)) return;
        
        this.persistCity(city);
        if (city === win.activeCity) { this.closeCityMenu(); return; }
        
        win.activeCity = city;
        try { this.updateLogoForCity(city); } catch (_) {}
        this.closeCityMenu();
        
        // Navigation
        const path = String(location.pathname || '/');
        const segments = path.split('/');
        let lastIdx = -1;
        for (let i = segments.length - 1; i >= 0; i--) { 
          if (segments[i]) { lastIdx = i; break; } 
        }
        
        let baseDir;
        if (lastIdx >= 0 && this.isValidCity(String(segments[lastIdx]).toLowerCase())) {
          baseDir = segments.slice(0, lastIdx).join('/') + '/';
        } else {
          baseDir = path.endsWith('/') ? path : (path + '/');
        }
        
        const sp = new URLSearchParams(location.search);
        sp.set('city', city);
        const target = baseDir + (sp.toString() ? `?${sp.toString()}` : '');
        location.href = target;
      } catch (_) { /* noop */ }
    },

    async initCityToggleUI(activeCity) {
      try {
        const toggle = document.getElementById('city-toggle');
        if (!toggle) return;
        
        toggle.addEventListener('click', (e) => { 
          e.preventDefault(); 
          e.stopPropagation(); 
          this.openCityMenu(); 
        });
        
        toggle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { 
            e.preventDefault(); 
            this.openCityMenu(); 
          }
        });
        
        await this.renderCityMenu(activeCity);
      } catch (_) { /* noop */ }
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
     * @returns {string} Ville active résolue
     */
    initializeActiveCity() {
      const rawQueryCity = this.getRawCityFromQueryParam();
      const rawPathCity = this.getRawCityFromPath();
      
      // Nettoyer si ville invalide
      if ((rawQueryCity && !this.isValidCity(rawQueryCity)) || 
          (rawPathCity && !this.isValidCity(rawPathCity))) {
        this.clearPersistedCity();
      }

      // Cas spécial : ?city=default ou ?city= force l'absence de ville
      const sp = new URLSearchParams(location.search);
      if (sp.has('city') && (!sp.get('city') || sp.get('city').toLowerCase() === 'default')) {
        this.clearPersistedCity();
        return win.activeCity = '';
      }

      // Résolution normale
      const city = this.resolveActiveCity();
      win.activeCity = city;
      
      // Gérer la persistance
      if (city && this.isValidCity(city)) {
        if (this.restoreCity() !== city) this.persistCity(city);
      } else {
        this.clearPersistedCity();
      }
      
      return city;
    }
  };

  // Exposer le module globalement
  win.CityManager = CityManager;

})(window);
