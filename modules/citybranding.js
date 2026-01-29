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
      
      console.warn('[CityBranding] supabaseService not available');
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
      console.warn('[CityBranding] Invalid primary color format:', primaryColor);
      return;
    }
    
    // Vérifier que le document est disponible
    if (typeof document === 'undefined' || !document.documentElement) {
      console.warn('[CityBranding] Document not available for styling');
      return;
    }
    
    document.documentElement.style.setProperty('--color-primary', primaryColor);
  },

  /**
   * Charge et applique le branding pour la ville active
   * @param {string} ville - Nom de la ville
   * @param {boolean} skipToggles - Si true, ne pas appliquer la config des toggles (sera fait par onAuthStateChange)
   */
  async loadAndApplyBranding(ville, skipToggles = false) {
    if (!ville) {
      this.applyPrimaryColor('#21b929');
      return;
    }
    
    const branding = await this.getBrandingForCity(ville);
    
    if (branding) {
      if (branding.primary_color) {
        this.applyPrimaryColor(branding.primary_color);
      } else {
        this.applyPrimaryColor('#21b929');
      }
      
      // Appliquer les toggles seulement si demandé
      // À la première connexion, on skip pour éviter la race condition
      // Le listener onAuthStateChange s'en chargera
      if (branding.enabled_toggles && !skipToggles) {
        this.applyTogglesConfig(branding.enabled_toggles);
      }
    } else {
      this.applyPrimaryColor('#21b929');
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
      
      const { data, error } = await supabase
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
      const activeCity = localStorage.getItem('activeCity');
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
      const activeCity = localStorage.getItem('activeCity');
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
      const activeCity = localStorage.getItem('activeCity');
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
        console.warn('[CityBranding] Error checking auth status:', err);
      }
    }

    // Liste de tous les toggles possibles
    const allToggles = ['filters', 'basemap', 'theme', 'search', 'location', 'city', 'info', 'contribute', 'login'];

    // Utiliser le ToggleManager si disponible pour une gestion cohérente
    if (win.toggleManager && typeof win.toggleManager.setVisible === 'function') {
      allToggles.forEach(toggleKey => {
        let isEnabled = enabledToggles.includes(toggleKey);
        
        // Règles spéciales selon l'état d'authentification
        if (toggleKey === 'login') {
          // Masquer le toggle login si l'utilisateur est connecté
          if (isAuthenticated) {
            isEnabled = false;
          }
        } else if (toggleKey === 'contribute') {
          // Contribute apparaît dès que l'utilisateur est connecté (indépendant de la config ville)
          isEnabled = isAuthenticated;
        }
        
        win.toggleManager.setVisible(toggleKey, isEnabled);
      });
    } else {
      // Fallback : manipulation directe du DOM
      // Vérifier que le document est disponible
      if (typeof document !== 'undefined' && document.getElementById) {
        allToggles.forEach(toggleKey => {
          const toggleElement = document.getElementById(`${toggleKey}-toggle`);
          if (toggleElement) {
            let isEnabled = enabledToggles.includes(toggleKey);
            
            // Règles spéciales selon l'état d'authentification
            if (toggleKey === 'login') {
              // Masquer le toggle login si l'utilisateur est connecté
              if (isAuthenticated) {
                isEnabled = false;
              }
            } else if (toggleKey === 'contribute') {
              // Contribute apparaît dès que l'utilisateur est connecté (indépendant de la config ville)
              isEnabled = isAuthenticated;
            }
            
            if (isEnabled) {
              toggleElement.style.display = '';
            } else {
              toggleElement.style.display = 'none';
            }
          }
        });
      }
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
   * Initialise les listeners pour mettre à jour le toggle login/contribute selon l'état d'authentification
   */
  async init() {
    // Vérifier que nous sommes dans un contexte avec les dépendances requises
    if (!win.AuthModule && !win.supabaseService) {
      console.warn('[CityBranding] No auth dependencies available - skipping initialization');
      return;
    }
    
    // Attendre que toggleManager soit initialisé avant d'appliquer la config
    const waitForToggleManager = () => {
      return new Promise((resolve) => {
        if (win.toggleManager && win.toggleManager.initialized) {
          resolve();
        } else {
          const checkInterval = setInterval(() => {
            if (win.toggleManager && win.toggleManager.initialized) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
          
          // Timeout après 5 secondes
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        }
      });
    };
    
    // Attendre que toggleManager soit prêt
    await waitForToggleManager();
    
    // Appliquer la configuration initiale des toggles basée sur la session actuelle
    try {
      const activeCity = localStorage.getItem('activeCity');
      const branding = await this.getBrandingForCity(activeCity);
      if (branding && branding.enabled_toggles) {
        await this.applyTogglesConfig(branding.enabled_toggles);
      }
    } catch (err) {
      console.warn('[CityBranding] Failed to apply initial toggles config:', err);
    }
    
    // Écouter les changements d'état d'authentification
    if (win.AuthModule && typeof win.AuthModule.onAuthStateChange === 'function') {
      win.AuthModule.onAuthStateChange(async (event, session) => {
        console.log('[CityBranding] Auth state changed:', event, '- session:', !!session);
        
        // Récupérer la ville active
        const activeCity = localStorage.getItem('activeCity');
        
        // Récupérer le branding pour réappliquer la config
        const branding = await this.getBrandingForCity(activeCity);
        if (branding && branding.enabled_toggles) {
          // Passer la session directement pour éviter les race conditions
          await this.applyTogglesConfig(branding.enabled_toggles, session);
        }
      });
    }
  }
};

  // Exposer sur window
  win.CityBrandingModule = CityBrandingModule;
  
  // Initialiser automatiquement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      CityBrandingModule.init();
    });
  } else {
    CityBrandingModule.init();
  }

})(window);
