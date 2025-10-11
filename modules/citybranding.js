/**
 * City Branding Module
 * Gère la personnalisation des couleurs par ville
 */

;(function(win) {
  'use strict';

  const CityBrandingModule = {
  /**
   * Récupère la configuration de branding pour une ville
   * @param {string} ville - Nom de la ville
   * @returns {Promise<Object|null>} Configuration de branding
   */
  async getBrandingForCity(ville) {
    if (!ville) return null;
    
    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) return null;
      
      const { data, error } = await supabase
        .from('city_branding')
        .select('*')
        .eq('ville', ville.toLowerCase())
        .single();
      
      if (error) {
        console.warn(`No branding found for city: ${ville}`, error);
        return null;
      }
      
      return data;
    } catch (err) {
      console.error('Error fetching city branding:', err);
      return null;
    }
  },

  /**
   * Applique la couleur primaire au document
   * @param {string} primaryColor - Couleur au format hex (#RRGGBB)
   */
  applyPrimaryColor(primaryColor) {
    if (!primaryColor || !primaryColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      console.warn('Invalid primary color format:', primaryColor);
      return;
    }
    
    // Appliquer la couleur à la racine du document
    document.documentElement.style.setProperty('--color-primary', primaryColor);
    console.log(`Applied primary color: ${primaryColor}`);
  },

  /**
   * Charge et applique le branding pour la ville active
   * @param {string} ville - Nom de la ville
   */
  async loadAndApplyBranding(ville) {
    const branding = await this.getBrandingForCity(ville);
    if (branding) {
      // Appliquer la couleur primaire
      if (branding.primary_color) {
        this.applyPrimaryColor(branding.primary_color);
      }
      
      // Appliquer la configuration des toggles
      if (branding.enabled_toggles) {
        this.applyTogglesConfig(branding.enabled_toggles);
      }
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
      
      console.log('City branding updated:', data);
      
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

      console.log('Toggles config updated:', data);

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
   * Applique la configuration des toggles (masque/affiche les contrôles)
   * @param {Array<string>} enabledToggles - Liste des toggles activés
   */
  applyTogglesConfig(enabledToggles) {
    if (!Array.isArray(enabledToggles)) return;

    console.log('[CityBranding] Applying toggles config:', enabledToggles);

    // Liste de tous les toggles possibles
    const allToggles = ['filters', 'basemap', 'theme', 'search', 'location', 'info'];

    allToggles.forEach(toggleKey => {
      const toggleElement = document.getElementById(`${toggleKey}-toggle`);
      if (toggleElement) {
        if (enabledToggles.includes(toggleKey)) {
          toggleElement.style.display = '';
        } else {
          toggleElement.style.display = 'none';
        }
      }
    });
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
  }
};

  // Exposer sur window
  win.CityBrandingModule = CityBrandingModule;

})(window);
