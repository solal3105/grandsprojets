/**
 * Contrib Branding Module
 * Interface admin pour gérer les couleurs de branding par ville
 */

;(function(win) {
  'use strict';

  const ContribBrandingModule = {
  /**
   * Initialise le module de branding
   */
  async init() {
    console.log('[ContribBranding] Initializing branding management');
    console.log('[ContribBranding] CityBrandingModule available:', !!win.CityBrandingModule);
    await this.renderBrandingPanel();
  },

  /**
   * Vérifie si l'utilisateur est admin
   */
  async isAdmin() {
    try {
      const supabase = win.AuthModule?.getClient?.();
      if (!supabase) return false;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      // Vérifier le rôle dans user_metadata ou une table dédiée
      // Pour l'instant, on considère tous les utilisateurs authentifiés comme admins
      return true;
    } catch (err) {
      console.error('Error checking admin status:', err);
      return false;
    }
  },

  /**
   * Rend le panneau de gestion du branding
   */
  async renderBrandingPanel() {
    console.log('[ContribBranding] renderBrandingPanel called');
    const isAdmin = await this.isAdmin();
    console.log('[ContribBranding] isAdmin:', isAdmin);
    if (!isAdmin) {
      console.log('[ContribBranding] User is not admin, skipping branding panel');
      return;
    }

    // Trouver le conteneur des cartes dans le landing
    const landingCards = document.querySelector('#contrib-landing .landing-cards');
    console.log('[ContribBranding] landingCards:', landingCards);
    if (!landingCards) {
      console.warn('[ContribBranding] Landing cards container not found');
      return;
    }

    // Ajouter le bouton Branding dans le landing
    const brandingCard = document.createElement('button');
    brandingCard.className = 'choice-card';
    brandingCard.setAttribute('role', 'listitem');
    brandingCard.id = 'landing-branding';
    brandingCard.setAttribute('data-target', 'branding');
    brandingCard.setAttribute('aria-describedby', 'landing-branding-desc');
    brandingCard.innerHTML = `
      <span class="card-icon" aria-hidden="true"><i class="fa-solid fa-palette"></i></span>
      <span class="card-title">Gérer le branding</span>
      <span class="card-desc" id="landing-branding-desc">Personnalisez l'apparence et les contrôles d'interface par ville.</span>
    `;
    landingCards.appendChild(brandingCard);

    // Créer le panneau de branding
    const modalBody = document.querySelector('#contrib-overlay .gp-modal-body');
    console.log('[ContribBranding] modalBody:', modalBody);
    if (!modalBody) {
      console.warn('[ContribBranding] Modal body not found');
      return;
    }

    const brandingPanel = document.createElement('div');
    brandingPanel.id = 'contrib-panel-branding';
    brandingPanel.className = 'contrib-panel';
    brandingPanel.setAttribute('role', 'tabpanel');
    brandingPanel.setAttribute('aria-labelledby', 'tab-branding');
    brandingPanel.style.display = 'none';
    console.log('[ContribBranding] Creating branding panel');
    brandingPanel.innerHTML = `
      <div class="branding-management">
        <h3 style="margin-top: 0; font-size: 1.2rem; color: var(--text-primary);">
          Gestion du branding par ville
        </h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1.5rem;">
          Personnalisez l'apparence et les contrôles d'interface pour chaque ville.
        </p>
        
        <div id="branding-list" class="branding-list">
          <div class="loading-state">Chargement...</div>
        </div>
      </div>
    `;
    modalBody.appendChild(brandingPanel);

    // Charger les configurations de branding
    await this.loadBrandingList();

    // Gérer le clic sur le bouton landing
    brandingCard.addEventListener('click', () => {
      this.showBrandingPanel();
    });
    
    console.log('[ContribBranding] Branding panel initialized successfully');
  },

  /**
   * Affiche le panneau de branding
   */
  showBrandingPanel() {
    console.log('[ContribBranding] showBrandingPanel called');
    
    // Cacher le landing
    const landing = document.getElementById('contrib-landing');
    if (landing) landing.hidden = true;
    
    // Cacher tous les autres panneaux
    const panels = ['contrib-panel-create', 'contrib-panel-list', 'contrib-panel-categories', 'contrib-panel-users', 'contrib-panel-cities'];
    panels.forEach(panelId => {
      const panel = document.getElementById(panelId);
      if (panel) panel.hidden = true;
    });

    // Afficher le panneau branding
    const brandingPanel = document.getElementById('contrib-panel-branding');
    if (brandingPanel) {
      brandingPanel.style.display = 'block';
      brandingPanel.hidden = false;
    }
    
    // Afficher le bouton retour
    const backBtn = document.getElementById('contrib-back');
    if (backBtn) backBtn.style.display = '';
    
    // Mettre à jour le titre
    const titleEl = document.getElementById('contrib-title');
    if (titleEl) titleEl.textContent = 'Gérer le branding';
    
    console.log('[ContribBranding] Branding panel shown');
  },

  /**
   * Configuration des toggles disponibles
   */
  getTogglesConfig() {
    return {
      filters: {
        icon: 'fa-map',
        label: 'Filtres de carte',
        description: 'Affiche/masque les filtres de carte'
      },
      basemap: {
        icon: 'fa-globe',
        label: 'Fond de carte',
        description: 'Change le fond de carte'
      },
      theme: {
        icon: 'fa-moon',
        label: 'Mode sombre',
        description: 'Bascule entre mode clair et sombre'
      },
      search: {
        icon: 'fa-search',
        label: 'Recherche',
        description: 'Recherche d\'adresse'
      },
      location: {
        icon: 'fa-location-arrow',
        label: 'Ma position',
        description: 'Géolocalisation utilisateur'
      },
      info: {
        icon: 'fa-info-circle',
        label: 'À propos',
        description: 'Informations sur l\'application'
      }
    };
  },

  /**
   * Génère les cartes de configuration des toggles (version compacte grille)
   */
  renderToggleCardsCompact(ville, enabledToggles) {
    const config = this.getTogglesConfig();
    
    return Object.entries(config).map(([key, toggle]) => {
      const isEnabled = enabledToggles.includes(key);
      return `
        <label class="toggle-config-compact ${isEnabled ? 'active' : ''}" data-toggle="${key}">
          <input 
            type="checkbox" 
            class="toggle-checkbox-compact"
            data-ville="${ville}"
            data-toggle="${key}"
            ${isEnabled ? 'checked' : ''}
          />
          <i class="fa ${toggle.icon}"></i>
          <span>${toggle.label}</span>
        </label>
      `;
    }).join('');
  },

  /**
   * Charge et affiche la liste des configurations de branding
   */
  async loadBrandingList() {
    const listContainer = document.getElementById('branding-list');
    if (!listContainer) return;

    try {
      const brandings = await win.CityBrandingModule?.getAllBranding?.() || [];
      
      if (brandings.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            Aucune configuration de branding trouvée.
          </div>
        `;
        return;
      }

      listContainer.innerHTML = brandings.map(branding => {
        const enabledToggles = branding.enabled_toggles || ['filters','basemap','theme','search','location','info'];
        const totalToggles = 6;
        const activeCount = enabledToggles.length;
        
        return `
        <div class="branding-item" data-ville="${branding.ville}">
          <div class="branding-item-header" data-toggle-header>
            <div class="branding-header-left">
              <i class="branding-chevron fa-solid fa-chevron-right"></i>
              <div class="branding-city-name">${branding.ville.toUpperCase()}</div>
            </div>
            <div class="branding-header-right">
              <div class="branding-color-preview" style="background-color: ${branding.primary_color};" title="${branding.primary_color}"></div>
              <div class="branding-controls-count">${activeCount}/${totalToggles} contrôles</div>
            </div>
          </div>
          
          <div class="branding-item-body" style="display: none;">
            <!-- Section Couleur -->
            <div class="branding-section">
              <label for="color-${branding.ville}" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                Couleur primaire
              </label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input 
                  type="color" 
                  id="color-${branding.ville}" 
                  value="${branding.primary_color}"
                  class="branding-color-input"
                  style="width: 60px; height: 40px; border: 1px solid var(--border-medium); border-radius: 8px; cursor: pointer;"
                />
                <input 
                  type="text" 
                  value="${branding.primary_color}"
                  class="branding-color-text"
                  placeholder="#RRGGBB"
                  maxlength="7"
                  style="flex: 1; padding: 0.5rem; border: 1px solid var(--border-medium); border-radius: 8px; background: var(--surface-base); color: var(--text-primary);"
                />
                <button 
                  class="branding-save-btn"
                  data-ville="${branding.ville}"
                  style="padding: 0.5rem 1rem; background: var(--primary); color: var(--black); border: none; border-radius: 8px; font-weight: 600; cursor: pointer; white-space: nowrap;"
                >
                  Enregistrer
                </button>
              </div>
            </div>

            <!-- Section Contrôles d'interface -->
            <div class="branding-section" style="margin-top: 1.5rem;">
              <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">
                Contrôles
              </h4>
              <div class="toggles-config-grid">
                ${this.renderToggleCardsCompact(branding.ville, enabledToggles)}
              </div>
            </div>
          </div>
        </div>
      `}).join('');

      // Ajouter les event listeners
      this.attachBrandingEventListeners();
    } catch (err) {
      console.error('Error loading branding list:', err);
      listContainer.innerHTML = `
        <div class="error-state" style="text-align: center; padding: 2rem; color: var(--danger);">
          Erreur lors du chargement des configurations.
        </div>
      `;
    }
  },

  /**
   * Attache les event listeners pour les contrôles de branding
   */
  attachBrandingEventListeners() {
    // Headers cliquables pour collapse/expand
    document.querySelectorAll('[data-toggle-header]').forEach(header => {
      header.addEventListener('click', (e) => {
        const item = header.closest('.branding-item');
        const body = item.querySelector('.branding-item-body');
        const chevron = header.querySelector('.branding-chevron');
        
        const isOpen = body.style.display !== 'none';
        
        if (isOpen) {
          body.style.display = 'none';
          chevron.classList.remove('fa-chevron-down');
          chevron.classList.add('fa-chevron-right');
          item.classList.remove('is-open');
        } else {
          body.style.display = 'block';
          chevron.classList.remove('fa-chevron-right');
          chevron.classList.add('fa-chevron-down');
          item.classList.add('is-open');
        }
      });
    });
    
    // Synchroniser color picker et text input
    document.querySelectorAll('.branding-item').forEach(item => {
      const colorInput = item.querySelector('.branding-color-input');
      const textInput = item.querySelector('.branding-color-text');
      const preview = item.querySelector('.branding-color-preview');
      const saveBtn = item.querySelector('.branding-save-btn');

      if (colorInput && textInput) {
        // Color picker -> text input
        colorInput.addEventListener('input', (e) => {
          textInput.value = e.target.value;
          if (preview) preview.style.backgroundColor = e.target.value;
        });

        // Text input -> color picker
        textInput.addEventListener('input', (e) => {
          const value = e.target.value;
          if (value.match(/^#[0-9A-Fa-f]{6}$/)) {
            colorInput.value = value;
            if (preview) preview.style.backgroundColor = value;
          }
        });
      }

      // Bouton enregistrer couleur
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          await this.saveBranding(item);
        });
      }

      // Toggle checkboxes compacts
      const toggleCheckboxes = item.querySelectorAll('.toggle-checkbox-compact');
      toggleCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
          await this.saveTogglesConfig(e.target);
        });
      });
    });
  },

  /**
   * Enregistre la configuration de branding (couleur)
   */
  async saveBranding(item) {
    const ville = item.dataset.ville;
    const colorInput = item.querySelector('.branding-color-text');
    const button = item.querySelector('.branding-save-btn');
    const color = colorInput.value;
    if (!color.match(/^#[0-9A-Fa-f]{6}$/)) {
      alert('Format de couleur invalide. Utilisez le format #RRGGBB');
      return;
    }

    const originalText = button.textContent;
    button.textContent = 'Enregistrement...';
    button.disabled = true;

    try {
      if (!win.CityBrandingModule?.updateCityBranding) {
        throw new Error('Module CityBrandingModule non disponible');
      }
      await win.CityBrandingModule.updateCityBranding(ville, color);
      button.textContent = '✓ Enregistré';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    } catch (err) {
      console.error('Error saving branding:', err);
      alert(`Erreur lors de l'enregistrement: ${err.message}`);
      button.textContent = originalText;
      button.disabled = false;
    }
  },

  /**
   * Enregistre la configuration des toggles
   */
  async saveTogglesConfig(checkbox) {
    const ville = checkbox.dataset.ville;
    const toggleKey = checkbox.dataset.toggle;
    const isEnabled = checkbox.checked;

    try {
      // Récupérer la config actuelle
      const branding = await win.CityBrandingModule?.getBrandingForCity?.(ville);
      if (!branding) {
        throw new Error('Configuration de branding introuvable');
      }

      // Mettre à jour la liste des toggles activés
      let enabledToggles = branding.enabled_toggles || ['filters','basemap','theme','search','location','info'];
      
      if (isEnabled) {
        // Ajouter le toggle s'il n'est pas déjà présent
        if (!enabledToggles.includes(toggleKey)) {
          enabledToggles.push(toggleKey);
        }
      } else {
        // Retirer le toggle
        enabledToggles = enabledToggles.filter(t => t !== toggleKey);
      }

      // Sauvegarder
      if (!win.CityBrandingModule?.updateTogglesConfig) {
        throw new Error('Module CityBrandingModule non disponible');
      }
      
      await win.CityBrandingModule.updateTogglesConfig(ville, enabledToggles);
      
      // Feedback visuel
      const label = checkbox.closest('.toggle-config-compact');
      if (label) {
        label.classList.toggle('active', isEnabled);
      }
      
      // Mettre à jour le compteur dans le header
      const item = checkbox.closest('.branding-item');
      const countEl = item.querySelector('.branding-controls-count');
      if (countEl) {
        const totalToggles = 6;
        countEl.textContent = `${enabledToggles.length}/${totalToggles} contrôles`;
      }
      
      console.log(`[ContribBranding] Toggles updated for ${ville}:`, enabledToggles);
    } catch (err) {
      console.error('Error saving toggles config:', err);
      alert(`Erreur lors de l'enregistrement: ${err.message}`);
      // Restaurer l'état précédent
      checkbox.checked = !checkbox.checked;
    }
  }
};

  // Exposer sur window
  win.ContribBranding = ContribBrandingModule;

})(window);
