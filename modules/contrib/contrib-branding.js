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
    brandingCard.innerHTML = `
      <span class="card-icon" aria-hidden="true"><i class="fa-solid fa-palette"></i></span>
      <span class="card-title">Gérer le branding</span>
      <span class="card-desc">Personnalisez les couleurs primaires par ville.</span>
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
          Gestion des couleurs par ville
        </h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1.5rem;">
          Personnalisez la couleur primaire pour chaque ville.
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

      listContainer.innerHTML = brandings.map(branding => `
        <div class="branding-item" data-ville="${branding.ville}">
          <div class="branding-item-header">
            <div class="branding-city-name">${branding.ville.toUpperCase()}</div>
            <div class="branding-color-preview" style="background-color: ${branding.primary_color};" title="${branding.primary_color}"></div>
          </div>
          <div class="branding-item-body">
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
        </div>
      `).join('');

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

      // Bouton enregistrer
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          await this.saveBranding(saveBtn.dataset.ville, textInput.value, saveBtn);
        });
      }
    });
  },

  /**
   * Enregistre la configuration de branding
   */
  async saveBranding(ville, color, button) {
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
  }
};

  // Exposer sur window
  win.ContribBranding = ContribBrandingModule;

})(window);
