// modules/modal-helper.js
// Helper unifié pour gérer toutes les modales de la plateforme
// Comportements standardisés : ESC, click outside, scroll lock, focus trap

window.ModalHelper = (() => {
  // Stack pour gérer plusieurs modales empilées
  const openModals = [];
  
  /**
   * Ouvre une modale avec tous les comportements unifiés
   * @param {string} modalId - ID de l'overlay (ex: 'search-overlay')
   * @param {Object} options - Options de comportement
   */
  function open(modalId, options = {}) {
    const {
      dismissible = true,        // Peut être fermé par ESC ou click outside
      lockScroll = true,          // Bloquer le scroll du body
      focusTrap = true,           // Piéger le focus dans la modale
      onOpen = null,              // Callback après ouverture
      onClose = null,             // Callback après fermeture
      animationDuration = 220     // Durée de l'animation (ms)
    } = options;
    
    const overlay = document.getElementById(modalId);
    if (!overlay) {
      console.error(`[ModalHelper] Modal ${modalId} not found`);
      return;
    }
    
    const modal = overlay.querySelector('.gp-modal');
    if (!modal) {
      console.error(`[ModalHelper] .gp-modal not found in ${modalId}`);
      return;
    }
    
    // Lock scroll du body
    if (lockScroll) {
      document.body.classList.add('modal-open');
    }
    
    // Afficher l'overlay
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    
    // Marquer si non-dismissible
    if (!dismissible) {
      overlay.classList.add('no-dismiss');
    }
    
    // Trigger animation
    requestAnimationFrame(() => {
      modal.classList.add('is-open');
    });
    
    // Ajouter à la stack
    const modalState = {
      id: modalId,
      overlay,
      modal,
      dismissible,
      focusTrap,
      onClose,
      previousFocus: document.activeElement
    };
    openModals.push(modalState);
    
    // Focus trap
    if (focusTrap) {
      setupFocusTrap(modal);
    }
    
    // Event listeners pour fermeture
    if (dismissible) {
      setupCloseListeners(modalState);
    }
    
    // Callback
    if (onOpen) {
      setTimeout(onOpen, animationDuration);
    }
    
    // Focus le premier élément focusable
    setTimeout(() => {
      focusFirstElement(modal);
    }, animationDuration);
  }
  
  /**
   * Ferme une modale
   * @param {string} modalId - ID de l'overlay
   */
  function close(modalId) {
    const index = openModals.findIndex(m => m.id === modalId);
    if (index === -1) return;
    
    const modalState = openModals[index];
    const { overlay, modal, onClose, previousFocus } = modalState;
    
    // Animation de fermeture
    modal.classList.remove('is-open');
    
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('no-dismiss');
      
      // Retirer de la stack
      openModals.splice(index, 1);
      
      // Unlock scroll si plus de modales ouvertes
      if (openModals.length === 0) {
        document.body.classList.remove('modal-open');
      }
      
      // Restaurer le focus
      if (previousFocus && previousFocus.focus) {
        try {
          previousFocus.focus();
        } catch (e) {
          // Ignore si l'élément n'est plus focusable
        }
      }
      
      // Callback
      if (onClose) {
        onClose();
      }
    }, 220);
  }
  
  /**
   * Configure les listeners de fermeture (ESC, click outside)
   */
  function setupCloseListeners(modalState) {
    const { id, overlay, modal } = modalState;
    
    // ESC key
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        // Fermer seulement la modale la plus récente
        const topModal = openModals[openModals.length - 1];
        if (topModal && topModal.id === id && topModal.dismissible) {
          e.preventDefault();
          close(id);
        }
      }
    };
    
    // Click outside
    const handleClickOutside = (e) => {
      if (e.target === overlay) {
        close(id);
      }
    };
    
    // Bouton close
    const closeBtn = modal.querySelector('.gp-modal-close');
    const handleCloseBtn = () => close(id);
    
    // Sauvegarder les handlers pour cleanup
    modalState.handlers = {
      handleEsc,
      handleClickOutside,
      handleCloseBtn
    };
    
    document.addEventListener('keydown', handleEsc);
    overlay.addEventListener('click', handleClickOutside);
    if (closeBtn) {
      closeBtn.addEventListener('click', handleCloseBtn);
    }
  }
  
  /**
   * Focus trap : garde le focus dans la modale
   */
  function setupFocusTrap(modal) {
    const focusableElements = modal.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), ' +
      'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const trapFocus = (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    modal.addEventListener('keydown', trapFocus);
  }
  
  /**
   * Focus le premier élément focusable dans la modale
   */
  function focusFirstElement(modal) {
    const focusable = modal.querySelector(
      'input:not([disabled]), button:not([disabled]), ' +
      'textarea:not([disabled]), select:not([disabled]), ' +
      'a[href], [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusable) {
      focusable.focus();
    }
  }
  
  /**
   * Ferme toutes les modales ouvertes
   */
  function closeAll() {
    [...openModals].reverse().forEach(modal => {
      close(modal.id);
    });
  }
  
  /**
   * Vérifie si une modale est ouverte
   */
  function isOpen(modalId) {
    return openModals.some(m => m.id === modalId);
  }
  
  /**
   * Ajoute une classe d'animation à la modale
   */
  function animate(modalId, animationClass) {
    const modalState = openModals.find(m => m.id === modalId);
    if (!modalState) return;
    
    const { modal } = modalState;
    modal.classList.add(animationClass);
    
    // Retirer la classe après l'animation
    setTimeout(() => {
      modal.classList.remove(animationClass);
    }, 600);
  }
  
  /**
   * Met la modale en état loading
   */
  function setLoading(modalId, isLoading) {
    const modalState = openModals.find(m => m.id === modalId);
    if (!modalState) return;
    
    const { modal } = modalState;
    if (isLoading) {
      modal.classList.add('is-loading');
    } else {
      modal.classList.remove('is-loading');
    }
  }
  
  // API publique
  return {
    open,
    close,
    closeAll,
    isOpen,
    animate,
    setLoading
  };
})();

// ===========================================================================
// MODALMANAGER - Wrapper de compatibilité (ancienne API)
// ===========================================================================
// Maintient l'API ModalManager pour compatibilité avec le code existant
// Redirige tous les appels vers ModalHelper

;(function(win) {
  'use strict';

  const ModalManager = (() => {
    
    function isOpen(id) {
      return win.ModalHelper.isOpen(id);
    }

    function open(id) {
      win.ModalHelper.open(id, {
        dismissible: true,
        lockScroll: true,
        focusTrap: true
      });
      return true;
    }

    function close(id) {
      win.ModalHelper.close(id);
    }

    function switchTo(fromId, toId) {
      win.ModalHelper.close(fromId);
      setTimeout(() => {
        win.ModalHelper.open(toId, {
          dismissible: true,
          lockScroll: true,
          focusTrap: true
        });
      }, 250); // Attendre que la première soit fermée
    }

    function top() {
      // Fonction legacy, non utilisée avec ModalHelper
      return null;
    }

    return { 
      open, 
      close, 
      switch: switchTo, 
      isOpen, 
      top 
    };
  })();

  // Exposer ModalManager globalement pour compatibilité
  win.ModalManager = ModalManager;

})(window);

// ===========================================================================
// EXEMPLES D'UTILISATION
// ===========================================================================
// 
// // ModalHelper (API moderne recommandée)
// ModalHelper.open('my-modal');
// ModalHelper.open('my-modal', {
//   dismissible: true,
//   lockScroll: true,
//   onOpen: () => console.log('Modale ouverte'),
//   onClose: () => console.log('Modale fermée')
// });
// ModalHelper.close('my-modal');
// ModalHelper.animate('my-modal', 'shake');
// ModalHelper.setLoading('my-modal', true);
// 
// // ModalManager (API legacy compatible)
// ModalManager.open('my-modal');
// ModalManager.close('my-modal');
// ModalManager.switch('modal1', 'modal2');
// ModalManager.isOpen('my-modal');
