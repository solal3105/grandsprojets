/**
 * Contrib Branding Simple Module
 * Interface simplifiée pour gérer le branding de la ville sélectionnée
 */

;(function(win) {
  'use strict';

  let modalLoaded = false;
  let currentCity = null;
  let saveTimeout = null;

  const ContribBrandingSimple = {
    /**
     * Configuration des toggles disponibles
     */
    getTogglesConfig() {
      return {
        filters: {
          icon: 'fa-map',
          label: 'Filtres',
          description: 'Filtres de carte'
        },
        basemap: {
          icon: 'fa-globe',
          label: 'Fond de carte',
          description: 'Choix du fond'
        },
        theme: {
          icon: 'fa-moon',
          label: 'Mode sombre',
          description: 'Thème clair/sombre'
        },
        search: {
          icon: 'fa-search',
          label: 'Recherche',
          description: 'Recherche d\'adresse'
        },
        location: {
          icon: 'fa-location-arrow',
          label: 'Position',
          description: 'Ma géolocalisation'
        },
        info: {
          icon: 'fa-info-circle',
          label: 'À propos',
          description: 'Informations'
        },
        login: {
          icon: 'fa-user',
          label: 'Connexion',
          description: 'Page de connexion'
        }
      };
    },

    /**
     * Charge le template HTML de la modale
     */
    async loadModalTemplate() {
      if (modalLoaded) return true;
      
      try {
        const response = await fetch('modules/contrib/contrib-branding-modal.html');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        const modalElement = tempDiv.firstElementChild;
        if (modalElement) {
          document.body.appendChild(modalElement);
          modalLoaded = true;
          console.log('[ContribBrandingSimple] Modal template loaded');
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('[ContribBrandingSimple] Error loading modal template:', error);
        return false;
      }
    },

    /**
     * Ouvre la modale de branding pour la ville sélectionnée
     */
    async openBrandingModal(ville) {
      console.log('[ContribBrandingSimple] Opening branding modal for:', ville);
      
      if (!ville) {
        console.warn('[ContribBrandingSimple] No city selected');
        return;
      }
      
      // Charger le template si nécessaire
      const loaded = await this.loadModalTemplate();
      if (!loaded) {
        console.error('[ContribBrandingSimple] Failed to load modal template');
        return;
      }
      
      currentCity = ville;
      
      // Récupérer les éléments
      const overlay = document.getElementById('branding-modal-overlay');
      const closeBtn = document.getElementById('branding-modal-close');
      const cancelBtn = document.getElementById('branding-modal-cancel');
      const titleSpan = document.getElementById('branding-modal-city-name');
      const cityLogo = document.getElementById('branding-city-logo');
      const colorInput = document.getElementById('branding-color-input');
      const colorText = document.getElementById('branding-color-text');
      const previewBtn = document.getElementById('branding-preview-btn');
      const previewBadge = document.getElementById('branding-preview-badge');
      const previewIcon = document.getElementById('branding-preview-icon');
      const previewLink = document.getElementById('branding-preview-link');
      const togglesGrid = document.getElementById('branding-toggles-grid');
      const statusEl = document.getElementById('branding-status');
      
      if (!overlay) {
        console.error('[ContribBrandingSimple] Modal overlay not found');
        return;
      }
      
      // Mettre à jour le titre
      if (titleSpan) {
        titleSpan.textContent = `Branding - ${ville.toUpperCase()}`;
      }
      
      // Charger la config de branding pour la ville
      let branding = null;
      try {
        // Convertir "default" en chaîne vide pour la base
        const villeQuery = ville.toLowerCase() === 'default' ? '' : ville;
        branding = await win.CityBrandingModule?.getBrandingForCity?.(villeQuery);
      } catch (err) {
        console.error('[ContribBrandingSimple] Error loading branding:', err);
      }
      
      // Charger et afficher le logo de la ville depuis le branding
      if (cityLogo && branding) {
        try {
          // Déterminer le thème actuel
          const theme = document.documentElement.getAttribute('data-theme') || 'light';
          const logoUrl = (theme === 'dark' && branding.dark_logo_url) 
            ? branding.dark_logo_url 
            : branding.logo_url;
          
          if (logoUrl) {
            cityLogo.onload = () => {
              cityLogo.style.display = '';
            };
            cityLogo.onerror = () => {
              console.warn('[ContribBrandingSimple] Logo failed to load:', logoUrl);
              cityLogo.style.display = 'none';
            };
            cityLogo.src = logoUrl;
            cityLogo.alt = branding.brand_name || `Logo ${ville}`;
          } else {
            cityLogo.style.display = 'none';
          }
        } catch (err) {
          console.warn('[ContribBrandingSimple] Error loading logo:', err);
          cityLogo.style.display = 'none';
        }
      } else if (cityLogo) {
        cityLogo.style.display = 'none';
      }
      
      const primaryColor = branding?.primary_color || '#21b929';
      const enabledToggles = branding?.enabled_toggles || ['filters', 'basemap', 'theme', 'search', 'location', 'info', 'login'];
      
      // Fonction pour mettre à jour les previews
      const updatePreviews = (color) => {
        if (previewBtn) previewBtn.style.backgroundColor = color;
        if (previewBadge) previewBadge.style.backgroundColor = color;
        if (previewIcon) previewIcon.style.backgroundColor = color;
        if (previewLink) previewLink.style.color = color;
      };
      
      // Initialiser le color picker
      if (colorInput && colorText) {
        colorInput.value = primaryColor;
        colorText.value = primaryColor;
        updatePreviews(primaryColor);
        
        // Sync color picker -> text
        colorInput.addEventListener('input', (e) => {
          const color = e.target.value;
          colorText.value = color;
          updatePreviews(color);
          this.debounceSaveColor(ville, color, statusEl);
        });
        
        // Sync text -> color picker
        colorText.addEventListener('input', (e) => {
          const color = e.target.value;
          if (color.match(/^#[0-9A-Fa-f]{6}$/)) {
            colorInput.value = color;
            updatePreviews(color);
            this.debounceSaveColor(ville, color, statusEl);
          }
        });
      }
      
      // Initialiser les toggles
      if (togglesGrid) {
        const config = this.getTogglesConfig();
        togglesGrid.innerHTML = Object.entries(config).map(([key, toggle]) => {
          const isEnabled = enabledToggles.includes(key);
          return `
            <label class="branding-toggle-card ${isEnabled ? 'is-active' : ''}" data-toggle="${key}">
              <input 
                type="checkbox" 
                data-toggle-key="${key}"
                ${isEnabled ? 'checked' : ''}
              />
              <div class="branding-toggle-icon">
                <i class="fa ${toggle.icon}"></i>
              </div>
              <div class="branding-toggle-label">${toggle.label}</div>
              <div class="branding-toggle-desc">${toggle.description}</div>
            </label>
          `;
        }).join('');
        
        // Attacher les event listeners
        togglesGrid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
          checkbox.addEventListener('change', async (e) => {
            const toggleKey = e.target.dataset.toggleKey;
            const isEnabled = e.target.checked;
            const card = e.target.closest('.branding-toggle-card');
            
            // Update UI
            card.classList.toggle('is-active', isEnabled);
            
            // Save
            await this.saveToggle(ville, toggleKey, isEnabled, statusEl);
          });
        });
      }
      
      // Gérer la fermeture
      const closeModal = () => {
        const modalInner = overlay.querySelector('.gp-modal');
        if (modalInner) {
          modalInner.classList.remove('is-open');
        }
        setTimeout(() => {
          overlay.setAttribute('aria-hidden', 'true');
          // ✅ Bloquer les interactions
          overlay.inert = true;
        }, 220);
      };
      
      if (closeBtn) closeBtn.onclick = closeModal;
      if (cancelBtn) cancelBtn.onclick = closeModal;
      
      overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
      };
      
      // Ouvrir la modale
      overlay.setAttribute('aria-hidden', 'false');
      // ✅ Réactiver les interactions
      overlay.inert = false;
      const modalInner = overlay.querySelector('.gp-modal');
      if (modalInner) {
        requestAnimationFrame(() => {
          modalInner.classList.add('is-open');
        });
      }
    },

    /**
     * Sauvegarde différée de la couleur (debounce 500ms)
     */
    debounceSaveColor(ville, color, statusEl) {
      if (saveTimeout) clearTimeout(saveTimeout);
      
      // Feedback immédiat
      if (statusEl) {
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
        statusEl.className = 'footer-status';
      }
      
      saveTimeout = setTimeout(async () => {
        await this.saveColor(ville, color, statusEl);
      }, 500);
    },

    /**
     * Sauvegarde la couleur
     */
    async saveColor(ville, color, statusEl) {
      try {
        // Convertir "default" en chaîne vide pour la base
        const villeQuery = ville.toLowerCase() === 'default' ? '' : ville;
        
        if (!win.CityBrandingModule?.updateCityBranding) {
          throw new Error('CityBrandingModule non disponible');
        }
        
        await win.CityBrandingModule.updateCityBranding(villeQuery, color);
        
        if (statusEl) {
          statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Enregistré automatiquement';
          statusEl.className = 'footer-status footer-status--success';
        }
        
        console.log('[ContribBrandingSimple] Color saved:', color);
      } catch (err) {
        console.error('[ContribBrandingSimple] Error saving color:', err);
        if (statusEl) {
          statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Erreur d\'enregistrement';
          statusEl.className = 'footer-status footer-status--error';
        }
      }
    },

    /**
     * Sauvegarde un toggle
     */
    async saveToggle(ville, toggleKey, isEnabled, statusEl) {
      try {
        // Convertir "default" en chaîne vide pour la base
        const villeQuery = ville.toLowerCase() === 'default' ? '' : ville;
        
        // Récupérer la config actuelle
        const branding = await win.CityBrandingModule?.getBrandingForCity?.(villeQuery);
        if (!branding) {
          throw new Error('Configuration de branding introuvable');
        }
        
        // Mettre à jour la liste des toggles
        let enabledToggles = branding.enabled_toggles || ['filters', 'basemap', 'theme', 'search', 'location', 'info', 'login'];
        
        if (isEnabled) {
          if (!enabledToggles.includes(toggleKey)) {
            enabledToggles.push(toggleKey);
          }
        } else {
          enabledToggles = enabledToggles.filter(t => t !== toggleKey);
        }
        
        // Sauvegarder
        if (!win.CityBrandingModule?.updateTogglesConfig) {
          throw new Error('CityBrandingModule non disponible');
        }
        
        await win.CityBrandingModule.updateTogglesConfig(villeQuery, enabledToggles);
        
        if (statusEl) {
          statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Enregistré automatiquement';
          statusEl.className = 'footer-status footer-status--success';
          
          setTimeout(() => {
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Modifications enregistrées automatiquement';
          }, 2000);
        }
        
        console.log('[ContribBrandingSimple] Toggle saved:', toggleKey, isEnabled);
      } catch (err) {
        console.error('[ContribBrandingSimple] Error saving toggle:', err);
        if (statusEl) {
          statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Erreur d\'enregistrement';
          statusEl.className = 'footer-status footer-status--error';
        }
      }
    }
  };

  // Exposer sur window
  win.ContribBrandingSimple = ContribBrandingSimple;

})(window);
