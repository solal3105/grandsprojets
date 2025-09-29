// modules/modalmanager.js
// Gestionnaire de modales réutilisable avec gestion de pile et accessibilité

;(function(win) {
  'use strict';

  const ModalManager = (() => {
    const stack = [];
    let escBound = false;
    let escHandler = null;

    function el(id) { 
      return document.getElementById(id); 
    }

    function isOpen(id) {
      const e = el(id);
      return !!(e && getComputedStyle(e).display !== 'none');
    }

    function top() { 
      return stack[stack.length - 1] || null; 
    }

    function ensureOnTop(e) {
      try { 
        document.body.appendChild(e); 
      } catch (_) {}
    }

    function show(id) {
      const overlay = el(id);
      if (!overlay) return false;

      ensureOnTop(overlay);
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden', 'false');

      // Empêcher le scroll du body uniquement sur la première modale
      if (stack.length === 0) { 
        try { 
          document.body.style.overflow = 'hidden'; 
        } catch (_) {} 
      }

      // Ajouter la classe is-open pour l'animation
      const modal = overlay.querySelector('.gp-modal');
      if (modal) {
        requestAnimationFrame(() => {
          modal.classList.add('is-open');
        });
      }

      // Focus sur le bouton de fermeture si présent
      try { 
        const closeBtn = overlay.querySelector('#' + id.replace('-overlay', '') + '-close') || 
                        overlay.querySelector('.gp-modal-close');
        if (closeBtn) closeBtn.focus();
      } catch(_) {}

      // Click en dehors → fermer la modale du dessus
      if (!overlay._mm_clickOutside) {
        overlay._mm_clickOutside = (ev) => {
          const panel = overlay.querySelector('.gp-modal');
          if (!panel || !panel.contains(ev.target)) {
            const t = top(); 
            if (t && t.el === overlay) close(id);
          }
        };
        overlay.addEventListener('click', overlay._mm_clickOutside);
      }

      // ESC → fermer la modale du dessus
      if (!escBound) {
        escHandler = (ev) => { 
          if (ev.key === 'Escape') { 
            const t = top(); 
            if (t) close(t.id); 
          } 
        };
        document.addEventListener('keydown', escHandler);
        escBound = true;
      }

      stack.push({ id, el: overlay });
      return true;
    }

    function hide(id) {
      const overlay = el(id);
      if (!overlay) return;

      // Retirer la classe is-open pour l'animation
      const modal = overlay.querySelector('.gp-modal');
      if (modal) {
        modal.classList.remove('is-open');
      }

      // Si le focus est dans la modale, le déplacer vers le body
      try { 
        if (overlay.contains(document.activeElement)) { 
          document.body.focus(); 
        } 
      } catch(_) {}

      // Attendre la fin de l'animation avant de masquer
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
      }, 180);

      const idx = stack.findIndex(x => x.id === id);
      if (idx >= 0) stack.splice(idx, 1);

      if (stack.length === 0) {
        try { 
          document.body.style.overflow = ''; 
        } catch (_) {}
        if (escBound && escHandler) { 
          document.removeEventListener('keydown', escHandler); 
          escBound = false; 
          escHandler = null; 
        }
      }
    }

    function open(id) { 
      return show(id); 
    }

    function close(id) { 
      return hide(id); 
    }

    function switchTo(fromId, toId) { 
      show(toId); 
      hide(fromId); 
    }

    return { 
      open, 
      close, 
      switch: switchTo, 
      isOpen, 
      top 
    };
  })();

  // Exposer le module globalement
  win.ModalManager = ModalManager;

})(window);
