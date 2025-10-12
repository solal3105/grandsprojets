// ===========================================================================
// MODAL NAVIGATION - Système de navigation unifié pour modales
//
// Gère la navigation entre panels avec :
// - Breadcrumb dynamique
// - Historique de navigation
// - Bouton retour
// - Transitions entre panels
// - État persistent
// ===========================================================================

(function(window) {
  'use strict';

  const ModalNavigation = {
    // État interne
    currentPanel: 'landing',
    history: ['landing'],
    modalId: null,
    
    // Configuration des panels
    panels: {
      landing: {
        label: '<i class="fa fa-home"></i> Accueil',
        title: 'Proposer une contribution',
        hasFooter: false,
        headerActions: []
      },
      create: {
        label: 'Créer',
        title: 'Créer une contribution',
        hasFooter: true,
        headerActions: []
      },
      list: {
        label: 'Mes contributions',
        title: 'Gérer mes contributions',
        hasFooter: true,
        headerActions: []
      },
      categories: {
        label: 'Catégories',
        title: 'Gérer les catégories',
        hasFooter: true,
        headerActions: [
          {
            id: 'category-add-btn',
            icon: 'fa-solid fa-plus',
            label: 'Nouvelle catégorie',
            variant: 'primary'
          }
        ]
      },
      users: {
        label: 'Utilisateurs',
        title: 'Gérer les utilisateurs',
        hasFooter: true,
        headerActions: [
          {
            id: 'invite-user-btn',
            icon: 'fa-solid fa-user-plus',
            label: 'Inviter un utilisateur',
            variant: 'primary'
          }
        ]
      }
    },
    
    /**
     * Initialise le système de navigation pour une modale
     * @param {string} modalId - ID de la modale (ex: 'contrib-overlay')
     * @param {Object} options - Options de configuration
     */
    init(modalId, options = {}) {
      this.modalId = modalId;
      
      // Merger les panels personnalisés
      if (options.panels) {
        this.panels = { ...this.panels, ...options.panels };
      }
      
      // Initialiser le bouton retour
      this.initBackButton();
      
      // Initialiser la délégation d'événements pour les actions du header
      this.initHeaderActionsDelegate();
      
      // Mettre à jour l'UI initiale
      this.updateTitle();
      this.updateHeaderActions();
      this.updateFooter();
      
      console.log('[ModalNavigation] Initialized for', modalId);
    },
    
    /**
     * Initialise le bouton retour
     */
    initBackButton() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      const backBtn = modal.querySelector('.gp-modal-back, #contrib-back');
      if (!backBtn) return;
      
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.goBack();
      });
      
      this.updateBackButton();
    },
    
    /**
     * Initialise la délégation d'événements pour les actions du header
     */
    initHeaderActionsDelegate() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      const actionsContainer = modal.querySelector('.gp-modal-header-actions');
      if (!actionsContainer) return;
      
      // Utiliser la délégation d'événements pour gérer les clics sur les boutons
      actionsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.gp-modal-header-action');
        if (!button) return;
        
        // Dispatcher un événement personnalisé avec l'ID du bouton
        const customEvent = new CustomEvent('headerAction', {
          detail: { buttonId: button.id },
          bubbles: true
        });
        button.dispatchEvent(customEvent);
        
        console.log('[ModalNavigation] Header action clicked:', button.id);
      });
    },
    
    /**
     * Navigue vers un panel
     * @param {string} panelId - ID du panel cible
     * @param {Object} options - Options de navigation
     */
    navigateTo(panelId, options = {}) {
      if (!this.panels[panelId]) {
        console.warn('[ModalNavigation] Panel inconnu:', panelId);
        return;
      }
      
      // Gestion de l'historique
      if (options.clearHistory) {
        // Nettoyer l'historique jusqu'au panel cible
        const index = this.history.indexOf(panelId);
        if (index !== -1) {
          this.history = this.history.slice(0, index + 1);
        }
      } else {
        // Éviter les doublons dans l'historique
        if (this.history[this.history.length - 1] !== panelId) {
          this.history.push(panelId);
        }
      }
      
      this.currentPanel = panelId;
      
      // Mettre à jour l'UI
      this.showPanel(panelId);
      this.updateBackButton();
      this.updateTitle();
      this.updateHeaderActions();
      this.updateFooter();
      
      // Callback optionnel
      if (options.onNavigate) {
        options.onNavigate(panelId);
      }
      
      console.log('[ModalNavigation] Navigated to', panelId, 'History:', this.history);
    },
    
    /**
     * Retour au panel précédent
     */
    goBack() {
      if (this.history.length <= 1) {
        console.log('[ModalNavigation] Already at root');
        return;
      }
      
      // Retirer le panel actuel
      this.history.pop();
      
      // Récupérer le panel précédent
      const previousPanel = this.history[this.history.length - 1];
      this.currentPanel = previousPanel;
      
      // Mettre à jour l'UI
      this.showPanel(previousPanel);
      this.updateBackButton();
      this.updateTitle();
      this.updateHeaderActions();
      this.updateFooter();
      
      console.log('[ModalNavigation] Went back to', previousPanel, 'History:', this.history);
    },
    
    /**
     * Affiche un panel et masque les autres
     * @param {string} panelId - ID du panel à afficher
     */
    showPanel(panelId) {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      // Masquer tous les panels
      const allPanels = modal.querySelectorAll(
        '[id^="contrib-panel-"], #contrib-landing, .gp-modal-panel'
      );
      allPanels.forEach(panel => {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
      });
      
      // Afficher le panel cible
      let targetPanel;
      if (panelId === 'landing') {
        targetPanel = modal.querySelector('#contrib-landing');
      } else {
        targetPanel = modal.querySelector(`#contrib-panel-${panelId}`);
      }
      
      if (targetPanel) {
        targetPanel.hidden = false;
        targetPanel.setAttribute('aria-hidden', 'false');
        
        // Scroll to top
        const modalBody = modal.querySelector('.gp-modal-body');
        if (modalBody) {
          modalBody.scrollTop = 0;
        }
      } else {
        console.warn('[ModalNavigation] Panel element not found:', panelId);
      }
    },
    
    /**
     * Met à jour le bouton retour
     */
    updateBackButton() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      const backBtn = modal.querySelector('.gp-modal-back, #contrib-back');
      if (!backBtn) return;
      
      // Afficher/masquer selon l'historique
      const canGoBack = this.history.length > 1;
      backBtn.style.display = canGoBack ? 'flex' : 'none';
      backBtn.disabled = !canGoBack;
    },
    
    /**
     * Met à jour le titre de la modale
     */
    updateTitle() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      const titleEl = modal.querySelector('.gp-modal-title, #contrib-title');
      if (!titleEl) return;
      
      const panel = this.panels[this.currentPanel];
      if (panel && panel.title) {
        titleEl.textContent = panel.title;
      }
    },
    
    /**
     * Met à jour les actions dans le header
     */
    updateHeaderActions() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      const actionsContainer = modal.querySelector('.gp-modal-header-actions');
      if (!actionsContainer) {
        console.warn('[ModalNavigation] Header actions container not found');
        return;
      }
      
      // Nettoyer les actions existantes
      actionsContainer.innerHTML = '';
      
      const panel = this.panels[this.currentPanel];
      if (!panel || !panel.headerActions || panel.headerActions.length === 0) {
        console.log('[ModalNavigation] No header actions for panel:', this.currentPanel);
        return;
      }
      
      console.log('[ModalNavigation] Creating', panel.headerActions.length, 'header action(s) for', this.currentPanel);
      
      // Créer les boutons
      panel.headerActions.forEach(action => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = action.id;
        button.className = `gp-btn gp-btn--${action.variant || 'primary'} gp-modal-header-action`;
        
        if (action.icon) {
          const icon = document.createElement('i');
          icon.className = action.icon;
          button.appendChild(icon);
        }
        
        if (action.label) {
          const label = document.createElement('span');
          label.textContent = action.label;
          button.appendChild(label);
        }
        
        actionsContainer.appendChild(button);
      });
    },
    
    /**
     * Met à jour la visibilité du footer
     */
    updateFooter() {
      const modal = document.getElementById(this.modalId);
      if (!modal) return;
      
      const footer = modal.querySelector('.gp-modal-footer');
      if (!footer) return;
      
      const panel = this.panels[this.currentPanel];
      const shouldShow = panel ? panel.hasFooter : false;
      
      footer.style.display = shouldShow ? 'flex' : 'none';
    },
    
    /**
     * Obtient le panel actuel
     * @returns {string} ID du panel actuel
     */
    getCurrentPanel() {
      return this.currentPanel;
    },
    
    /**
     * Obtient l'historique de navigation
     * @returns {Array} Historique des panels visités
     */
    getHistory() {
      return [...this.history];
    },
    
    /**
     * Réinitialise la navigation
     */
    reset() {
      this.currentPanel = 'landing';
      this.history = ['landing'];
      this.showPanel('landing');
      this.updateBackButton();
      this.updateTitle();
      this.updateHeaderActions();
      this.updateFooter();
      
      console.log('[ModalNavigation] Reset to landing');
    },
    
    /**
     * Enregistre un nouveau panel
     * @param {string} panelId - ID du panel
     * @param {Object} config - Configuration du panel
     */
    registerPanel(panelId, config) {
      this.panels[panelId] = {
        label: config.label || panelId,
        title: config.title || panelId,
        hasFooter: config.hasFooter !== false,
        headerActions: config.headerActions || []
      };
      
      console.log('[ModalNavigation] Registered panel:', panelId);
    }
  };
  
  // Exposer globalement
  window.ModalNavigation = ModalNavigation;
  
})(window);
