/**
 * ContribBrandingSimple - Module de gestion du branding ville
 * Gère la modale de configuration des couleurs, toggles et villes activées
 */
;(function(win) {
  'use strict';

  /**
   * Récupère la config des toggles depuis la source centralisée (toggles-config.js)
   * Extrait seulement icon et label pour l'affichage dans la modale
   */
  function getTogglesConfig() {
    const globalConfig = win.TOGGLES_CONFIG || {};
    const config = {};
    for (const [key, val] of Object.entries(globalConfig)) {
      if (val && val.icon && val.label) {
        config[key] = { icon: val.icon, label: val.label };
      }
    }
    return config;
  }

  let currentCity = null;
  let currentBranding = null;

  const ContribBrandingSimple = {
    /**
     * Ouvre la modale de branding pour une ville
     * @param {string} city - Code de la ville
     */
    async openBrandingModal(city) {
      if (!city) {
        console.error('[ContribBrandingSimple] Ville requise');
        return;
      }

      currentCity = city;

      // Charger le branding
      try {
        currentBranding = await win.CityBrandingModule?.getBrandingForCity(city);
      } catch (e) {
        console.error('[ContribBrandingSimple] Erreur chargement branding:', e);
        currentBranding = null;
      }

      // Ouvrir la modale
      if (win.ModalManager?.open) {
        win.ModalManager.open('branding-modal-overlay');
      } else {
        const overlay = document.getElementById('branding-modal-overlay');
        if (overlay) {
          overlay.style.display = 'flex';
          overlay.setAttribute('aria-hidden', 'false');
        }
      }

      // Initialiser le contenu
      this.initModalContent();
    },

    /**
     * Ferme la modale de branding
     */
    closeBrandingModal() {
      if (win.ModalManager?.close) {
        win.ModalManager.close('branding-modal-overlay');
      } else {
        const overlay = document.getElementById('branding-modal-overlay');
        if (overlay) {
          overlay.style.display = 'none';
          overlay.setAttribute('aria-hidden', 'true');
        }
      }
      currentCity = null;
      currentBranding = null;
    },

    /**
     * Initialise le contenu de la modale
     */
    initModalContent() {
      // Titre avec nom de ville
      const titleEl = document.getElementById('branding-modal-city-name');
      if (titleEl) {
        const displayName = currentBranding?.brand_name || currentCity;
        titleEl.textContent = `Branding - ${displayName}`;
      }

      // Logo de la ville
      const logoEl = document.getElementById('branding-city-logo');
      if (logoEl) {
        const logoUrl = currentBranding?.logo_url;
        if (logoUrl) {
          logoEl.src = logoUrl;
          logoEl.alt = currentBranding?.brand_name || currentCity;
          logoEl.style.display = 'block';
        } else {
          logoEl.style.display = 'none';
        }
      }

      // Couleur primaire
      const colorInput = document.getElementById('branding-color-input');
      const colorText = document.getElementById('branding-color-text');
      const primaryColor = currentBranding?.primary_color || '#21b929';
      
      if (colorInput) colorInput.value = primaryColor;
      if (colorText) colorText.value = primaryColor;
      
      this.updateColorPreview(primaryColor);

      // Bind events couleur
      this.bindColorEvents();

      // Render toggles
      this.renderTogglesGrid();

      // Bind close buttons
      this.bindCloseEvents();
    },

    /**
     * Bind les événements de couleur
     */
    bindColorEvents() {
      const colorInput = document.getElementById('branding-color-input');
      const colorText = document.getElementById('branding-color-text');

      if (colorInput && !colorInput._bound) {
        colorInput.addEventListener('input', (e) => {
          const color = e.target.value;
          if (colorText) colorText.value = color;
          this.updateColorPreview(color);
          this.saveColor(color);
        });
        colorInput._bound = true;
      }

      if (colorText && !colorText._bound) {
        colorText.addEventListener('input', (e) => {
          const color = e.target.value;
          if (color.match(/^#[0-9A-Fa-f]{6}$/)) {
            if (colorInput) colorInput.value = color;
            this.updateColorPreview(color);
            this.saveColor(color);
          }
        });
        colorText._bound = true;
      }
    },

    /**
     * Met à jour l'aperçu de couleur
     */
    updateColorPreview(color) {
      const btn = document.getElementById('branding-preview-btn');
      const badge = document.getElementById('branding-preview-badge');
      const icon = document.getElementById('branding-preview-icon');
      const link = document.getElementById('branding-preview-link');

      if (btn) btn.style.backgroundColor = color;
      if (badge) badge.style.backgroundColor = color;
      if (icon) icon.style.color = color;
      if (link) link.style.color = color;
    },

    /**
     * Sauvegarde la couleur
     */
    async saveColor(color) {
      if (!currentCity || !color.match(/^#[0-9A-Fa-f]{6}$/)) return;

      try {
        await win.CityBrandingModule?.updateCityBranding(currentCity, color);
        this.showStatus('Couleur enregistrée', 'success');
      } catch (e) {
        console.error('[ContribBrandingSimple] Erreur sauvegarde couleur:', e);
        this.showStatus('Erreur de sauvegarde', 'error');
      }
    },

    /**
     * Render la grille des toggles
     */
    renderTogglesGrid() {
      const grid = document.getElementById('branding-toggles-grid');
      if (!grid) return;

      const enabledToggles = currentBranding?.enabled_toggles || [];
      const enabledSet = new Set(enabledToggles);
      
      // Vérifier si des villes sont configurées (pour désactiver le toggle city si non)
      const enabledCities = currentBranding?.enabled_cities;
      const hasCities = Array.isArray(enabledCities) && enabledCities.length > 0;

      const html = Object.entries(getTogglesConfig())
        .map(([key, config]) => {
          const isEnabled = enabledSet.has(key);
          const isCityDisabled = key === 'city' && !hasCities;
          
          return `
            <label 
              class="branding-toggle-item${isEnabled && !isCityDisabled ? ' is-active' : ''}${isCityDisabled ? ' is-disabled' : ''}" 
              data-toggle="${key}"
              ${isCityDisabled ? 'title="Configurez les espaces dans « Modifier ma structure » pour activer cette fonctionnalité"' : ''}
            >
              <input type="checkbox" ${isEnabled && !isCityDisabled ? 'checked' : ''} ${isCityDisabled ? 'disabled' : ''} />
              <div class="toggle-icon"><i class="fas ${config.icon}"></i></div>
              <div class="toggle-label">${config.label}</div>
            </label>
          `;
        }).join('');

      grid.innerHTML = html;

      // Bind events pour les toggles actifs
      grid.querySelectorAll('.branding-toggle-item:not(.is-disabled)').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox._bound) {
          checkbox.addEventListener('change', () => {
            item.classList.toggle('is-active', checkbox.checked);
            this.saveToggles();
          });
          checkbox._bound = true;
        }
      });
      
      // Bind click pour les toggles désactivés (city sans villes configurées)
      grid.querySelectorAll('.branding-toggle-item.is-disabled').forEach(item => {
        if (!item._bound) {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Ouvrir la modale de modification de ville pour configurer les villes
            this.openCityConfigFromDisabledToggle();
          });
          item._bound = true;
        }
      });
    },
    
    /**
     * Ouvre la modale de modification de ville depuis le toggle city désactivé
     */
    async openCityConfigFromDisabledToggle() {
      if (!currentCity) return;
      
      // Ouvrir la modale de modification de ville par-dessus
      if (win.ContribCitiesManagement?.editCity) {
        // Récupérer les données de la ville
        const cityData = await win.supabaseService?.getCityBranding?.(currentCity);
        if (cityData) {
          win.ContribCitiesManagement.editCity(cityData);
        }
      }
    },

    /**
     * Sauvegarde les toggles
     */
    async saveToggles() {
      if (!currentCity) return;

      const grid = document.getElementById('branding-toggles-grid');
      if (!grid) return;

      const enabledToggles = [];
      grid.querySelectorAll('.branding-toggle-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox?.checked) {
          enabledToggles.push(item.dataset.toggle);
        }
      });

      try {
        await win.CityBrandingModule?.updateTogglesConfig(currentCity, enabledToggles);
        this.showStatus('Contrôles enregistrés', 'success');
      } catch (e) {
        console.error('[ContribBrandingSimple] Erreur sauvegarde toggles:', e);
        this.showStatus('Erreur de sauvegarde', 'error');
      }
    },

    /**
     * Affiche un message de statut
     */
    showStatus(message, type = 'success') {
      const statusEl = document.getElementById('branding-status');
      if (!statusEl) return;

      statusEl.className = `footer-status footer-status--${type}`;
      statusEl.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
        ${message}
      `;

      // Reset après 3s
      setTimeout(() => {
        statusEl.className = 'footer-status footer-status--success';
        statusEl.innerHTML = `
          <i class="fa-solid fa-circle-check"></i>
          Modifications enregistrées automatiquement
        `;
      }, 3000);
    },

    /**
     * Bind les événements de fermeture
     */
    bindCloseEvents() {
      const closeBtn = document.getElementById('branding-modal-close');
      const cancelBtn = document.getElementById('branding-modal-cancel');

      if (closeBtn && !closeBtn._bound) {
        closeBtn.addEventListener('click', () => this.closeBrandingModal());
        closeBtn._bound = true;
      }

      if (cancelBtn && !cancelBtn._bound) {
        cancelBtn.addEventListener('click', () => this.closeBrandingModal());
        cancelBtn._bound = true;
      }

      // Fermeture sur clic overlay
      const overlay = document.getElementById('branding-modal-overlay');
      if (overlay && !overlay._bound) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.closeBrandingModal();
        });
        overlay._bound = true;
      }
    }
  };

  // Exposer le module
  win.ContribBrandingSimple = ContribBrandingSimple;

})(window);
