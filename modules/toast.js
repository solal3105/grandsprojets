// modules/toast.js
// Unified toast notification system — replaces:
//   - ContribUtils.showToast() inline styles + #toast-container
//   - ficheprojet.js showFicheToast() + .fiche-toast CSS

;(function(win) {
  'use strict';

  // Lazy-create the container if not present
  function getContainer() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'false');
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Notifications');
      el.className = 'gp-toast-container';
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * Show a toast notification
   * @param {string} message - Message text
   * @param {string} kind - 'info' | 'success' | 'error'
   * @param {number} duration - Auto-dismiss time in ms (default 4000)
   */
  function show(message, kind, duration) {
    if (!message) return;
    kind = kind || 'info';
    duration = duration || 4000;

    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = 'gp-toast gp-toast--' + kind;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    toast.textContent = message;

    container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(function() {
      toast.classList.add('gp-toast--visible');
    });

    // Auto dismiss
    setTimeout(function() {
      toast.classList.remove('gp-toast--visible');
      toast.classList.add('gp-toast--exit');
      setTimeout(function() {
        try { toast.remove(); } catch(_) {}
      }, 300);
    }, duration);
  }

  win.Toast = { show: show };

})(window);
