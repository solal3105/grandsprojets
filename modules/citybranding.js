/**
 * City Branding Module
 * Gère la personnalisation des couleurs par ville
 */

;(function(win) {
  'use strict';

  const CityBrandingModule = {
  /**
   * Récupère la configuration de branding pour une ville
   * Utilise supabaseService.getCityBranding comme source centralisée
   * @param {string} ville - Nom de la ville
   * @returns {Promise<Object|null>} Configuration de branding
   */
  async getBrandingForCity(ville) {
    if (!ville) return null;
    
    try {
      // Utiliser la source centralisée (supabaseService)
      if (win.supabaseService?.getCityBranding) {
        return await win.supabaseService.getCityBranding(ville.toLowerCase());
      }
      
      console.debug('[CityBranding] supabaseService not available');
      return null;
    } catch (err) {
      console.error('[CityBranding] Error fetching city branding:', err);
      return null;
    }
  },

  /**
   * Applique la couleur primaire au document
   * @param {string} primaryColor - Couleur au format hex (#RRGGBB)
   */
  applyPrimaryColor(primaryColor) {
    if (!primaryColor || !primaryColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      console.debug('[CityBranding] Invalid primary color format:', primaryColor);
      return;
    }
    
    // Vérifier que le document est disponible
    if (typeof document === 'undefined' || !document.documentElement) {
      console.debug('[CityBranding] Document not available for styling');
      return;
    }
    
    document.documentElement.style.setProperty('--color-primary', primaryColor);
  },

  /**
   * Applique le favicon dynamiquement.
   * @param {string|null} faviconUrl
   */
  applyFavicon(faviconUrl) {
    if (typeof document === 'undefined') return;
    const DEFAULT = '/img/logomin.png';
    const href = faviconUrl || DEFAULT;

    let icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      icon.href = href;
    } else {
      icon = document.createElement('link');
      icon.rel = 'icon';
      icon.href = href;
      document.head.appendChild(icon);
    }

    let apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple) {
      apple.href = href;
    } else {
      apple = document.createElement('link');
      apple.rel = 'apple-touch-icon';
      apple.href = href;
      document.head.appendChild(apple);
    }
  },

  /**
   * Charge et applique le branding pour la ville active
   * @param {string} ville - Nom de la ville
   * @param {boolean} skipToggles - Si true, ne pas appliquer la config des toggles (sera fait par onAuthStateChange)
   */
  async loadAndApplyBranding(ville, skipToggles = false) {
    if (!ville) {
      this.applyPrimaryColor('#21b929');
      this.applyFavicon(null);
      return;
    }
    
    const branding = await this.getBrandingForCity(ville);
    this.applyBranding(branding, skipToggles);
  },

  /**
   * Applique un objet branding déjà chargé (pas de fetch)
   * Utilisé par main.js Phase 2.5 pour éviter les fetches redondants
   * @param {Object|null} branding - Objet branding déjà récupéré
   * @param {boolean} skipToggles
   */
  applyBranding(branding, skipToggles = false) {
    if (branding) {
      if (branding.primary_color) {
        this.applyPrimaryColor(branding.primary_color);
      } else {
        this.applyPrimaryColor('#21b929');
      }

      this.applyFavicon(branding.favicon_url);
      
      // Appliquer les toggles seulement si demandé
      // À la première connexion, on skip pour éviter la race condition
      // Le listener onAuthStateChange s'en chargera
      if (branding.enabled_toggles && !skipToggles) {
        this.applyTogglesConfig(branding.enabled_toggles);
      }
    } else {
      this.applyPrimaryColor('#21b929');
      this.applyFavicon(null);
    }
  },

  /**
   * Met à jour la couleur primaire pour une ville (admin uniquement)
   * @param {string} ville - Nom de la ville
   * @param {string} primaryColor - Nouvelle couleur au format hex
   * @returns {Promise<boolean>} Succès de l'opération
   */
  async updateCityBranding(ville, primaryColor) {
    if (!ville || !primaryColor) {
      throw new Error('Ville et couleur primaire requis');
    }
    
    // Valider le format de la couleur
    if (!primaryColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      throw new Error('Format de couleur invalide. Utilisez #RRGGBB');
    }
    
    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) {
        throw new Error('Client Supabase non disponible');
      }
      
      // Récupérer l'utilisateur actuel
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Utilisateur non authentifié');
      }
      
      const { error } = await supabase
        .from('city_branding')
        .update({
          primary_color: primaryColor,
          updated_by: user.id
        })
        .eq('ville', ville.toLowerCase())
        .select()
        .single();
      
      if (error) throw error;
      
      // Appliquer immédiatement si c'est la ville active
      const activeCity = win.CityManager?.getActiveCity();
      if (activeCity === ville.toLowerCase()) {
        this.applyPrimaryColor(primaryColor);
      }
      
      return true;
    } catch (err) {
      console.error('Error updating city branding:', err);
      throw err;
    }
  },

  /**
   * Met à jour la configuration des toggles pour une ville
   * @param {string} ville - Nom de la ville
   * @param {Array<string>} enabledToggles - Liste des toggles activés
   * @returns {Promise<Object>} Configuration mise à jour
   */
  async updateTogglesConfig(ville, enabledToggles) {
    if (!ville || !Array.isArray(enabledToggles)) {
      throw new Error('Ville et liste de toggles requis');
    }

    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) {
        throw new Error('Client Supabase non disponible');
      }

      // Récupérer l'utilisateur actuel
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Utilisateur non authentifié');
      }

      const { data, error } = await supabase
        .from('city_branding')
        .update({
          enabled_toggles: enabledToggles,
          updated_by: user.id
        })
        .eq('ville', ville.toLowerCase())
        .select()
        .single();

      if (error) throw error;

      // Appliquer immédiatement si c'est la ville active
      const activeCity = win.CityManager?.getActiveCity();
      if (activeCity === ville.toLowerCase()) {
        this.applyTogglesConfig(enabledToggles);
      }

      return data;
    } catch (err) {
      console.error('Error updating toggles config:', err);
      throw err;
    }
  },

  /**
   * Met à jour le fond de carte par défaut pour une ville (admin uniquement)
   * @param {string} ville - Nom de la ville
   * @param {string|null} basemapName - Nom du basemap (doit correspondre à basemaps.name), ou null pour utiliser le défaut global
   * @returns {Promise<Object>} Configuration mise à jour
   */
  async updateCityBasemap(ville, basemapName) {
    if (!ville) {
      throw new Error('Ville requise');
    }

    // Valider que le basemap existe si un nom est fourni
    if (basemapName) {
      const availableBasemaps = win.basemaps || [];
      const basemapExists = availableBasemaps.some(b => b.name === basemapName);
      if (!basemapExists) {
        throw new Error(`Basemap "${basemapName}" non trouvé. Basemaps disponibles: ${availableBasemaps.map(b => b.name).join(', ')}`);
      }
    }

    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) {
        throw new Error('Client Supabase non disponible');
      }

      // Récupérer l'utilisateur actuel
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Utilisateur non authentifié');
      }

      const { data, error } = await supabase
        .from('city_branding')
        .update({
          default_basemap: basemapName,
          updated_by: user.id
        })
        .eq('ville', ville.toLowerCase())
        .select()
        .single();

      if (error) throw error;

      // Appliquer immédiatement si c'est la ville active
      const activeCity = win.CityManager?.getActiveCity();
      if (activeCity === ville.toLowerCase()) {
        // Recharger le basemap
        if (win.MapModule?.initBaseLayer) {
          win.MapModule.initBaseLayer(basemapName);
        }
      }

      return data;
    } catch (err) {
      console.error('Error updating city basemap:', err);
      throw err;
    }
  },

  /**
   * Récupère la liste des basemaps disponibles
   * @returns {Array<{name: string, label: string}>} Liste des basemaps
   */
  getAvailableBasemaps() {
    const basemaps = win.basemaps || [];
    return basemaps.map(b => ({
      name: b.name,
      label: b.label
    }));
  },

  /**
   * Met à jour la liste des villes activées pour le menu de sélection de ville
   * @param {string} ville - Nom de la ville
   * @param {Array<string>} enabledCities - Liste des codes de villes activées
   * @returns {Promise<Object>} Configuration mise à jour
   */
  async updateEnabledCities(ville, enabledCities) {
    if (!ville || !Array.isArray(enabledCities)) {
      throw new Error('Ville et liste de villes requis');
    }

    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) {
        throw new Error('Client Supabase non disponible');
      }

      // Récupérer l'utilisateur actuel
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Utilisateur non authentifié');
      }

      const { data, error } = await supabase
        .from('city_branding')
        .update({
          enabled_cities: enabledCities,
          updated_by: user.id
        })
        .eq('ville', ville.toLowerCase())
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (err) {
      console.error('Error updating enabled cities:', err);
      throw err;
    }
  },

  /**
   * Applique la configuration des toggles (masque/affiche les contrôles)
   * @param {Array<string>} enabledToggles - Liste des toggles activés
   * @param {Object|null} sessionOverride - Session à utiliser (optionnel, sinon vérifie AuthModule)
   */
  async applyTogglesConfig(enabledToggles, sessionOverride = null) {
    if (!Array.isArray(enabledToggles)) return;

    // Déterminer si l'utilisateur est connecté
    let isAuthenticated = false;
    
    // Priorité 1: Session passée en paramètre (ex: depuis onAuthStateChange)
    // Note: session peut être null (déconnexion) ou un objet (connexion)
    if (arguments.length > 1) {
      // Si un 2e argument a été passé, l'utiliser (même si null = déconnexion)
      isAuthenticated = !!(sessionOverride?.user);
    }
    // Priorité 2: Cache synchrone AuthModule
    else if (win.AuthModule?.isAuthenticated) {
      isAuthenticated = win.AuthModule.isAuthenticated();
    }
    // Priorité 3: Appel async getSession (fallback)
    else if (win.AuthModule?.getSession) {
      try {
        const { data: { session } } = await win.AuthModule.getSession();
        isAuthenticated = !!(session?.user);
      } catch (err) {
        console.debug('[CityBranding] Error checking auth status:', err);
      }
    }

    // Liste de tous les toggles possibles (dock + sidebar)
    const allToggles = ['filters', 'basemap', 'theme', 'search', 'location', 'city', 'info', 'contribute', 'login', 'mode3d'];

    // Sidebar-only toggles: these live in .gp-sidebar as [data-action="*"] buttons,
    // NOT as #*-toggle elements in the dock. ToggleManager doesn't know about them.
    const sidebarOnlyKeys = new Set(['theme', 'info', 'login', 'contribute']);

    // Compute effective visibility for each toggle
    const visibility = {};
    allToggles.forEach(toggleKey => {
      let isEnabled = enabledToggles.includes(toggleKey);

      // Règles spéciales selon l'état d'authentification
      if (toggleKey === 'login') {
        if (isAuthenticated) isEnabled = false;
      } else if (toggleKey === 'contribute') {
        isEnabled = isAuthenticated;
      }

      visibility[toggleKey] = isEnabled;
    });

    // 1) Dock toggles via ToggleManager (filters, basemap, search, location, city, mode3d, actions)
    if (win.toggleManager && typeof win.toggleManager.setVisible === 'function') {
      allToggles.forEach(toggleKey => {
        if (sidebarOnlyKeys.has(toggleKey)) return; // handled separately below
        win.toggleManager.setVisible(toggleKey, visibility[toggleKey]);
      });
    } else if (typeof document !== 'undefined' && document.getElementById) {
      // Fallback : manipulation directe du DOM pour les dock toggles
      allToggles.forEach(toggleKey => {
        if (sidebarOnlyKeys.has(toggleKey)) return;
        const el = document.getElementById(`${toggleKey}-toggle`);
        if (el) el.style.display = visibility[toggleKey] ? '' : 'none';
      });
    }

    // 2) Sidebar action buttons (theme, info, login, contribute)
    if (typeof document !== 'undefined') {
      sidebarOnlyKeys.forEach(key => {
        const btn = document.querySelector(`.gp-sidebar__btn[data-action="${key}"]`);
        if (btn) btn.style.display = visibility[key] ? '' : 'none';
        // Also handle cloned buttons in the mobile actions panel
        const clone = document.querySelector(`#actions-panel-body [data-action="${key}"]`);
        if (clone) clone.style.display = visibility[key] ? '' : 'none';
      });
    }
  },

  /**
   * Récupère toutes les configurations de branding
   * @returns {Promise<Array>} Liste des configurations
   */
  async getAllBranding() {
    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) return [];
      
      const { data, error } = await supabase
        .from('city_branding')
        .select('*')
        .order('ville');
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching all branding:', err);
      return [];
    }
  },

  /**
   * Initialise les listeners d'auth pour mettre à jour les toggles login/contribute.
   * Appelé une seule fois par main.js après que toggleManager est prêt.
   */
  init() {
    // Écouter les changements d'état d'authentification
    if (win.AuthModule && typeof win.AuthModule.onAuthStateChange === 'function') {
      win.AuthModule.onAuthStateChange(async (event, session) => {
        // Récupérer la ville active via CityManager (source unique)
        const activeCity = win.CityManager?.getActiveCity();
        
        // Récupérer le branding pour réappliquer la config
        const branding = win.CityManager?.getBranding();
        if (branding && branding.enabled_toggles) {
          await this.applyTogglesConfig(branding.enabled_toggles, session);
        } else if (activeCity) {
          // Fallback : fetch si le branding n'est pas en cache
          const fetched = await this.getBrandingForCity(activeCity);
          if (fetched?.enabled_toggles) {
            await this.applyTogglesConfig(fetched.enabled_toggles, session);
          }
        }
      });
    }
  }
};

  // Exposer sur window
  win.CityBrandingModule = CityBrandingModule;

})(window);
