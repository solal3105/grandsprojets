// modules/lightbox.js
// Unified fullscreen image lightbox — replaces 3 separate implementations:
//   - navigationmodule.js .cover-lightbox
//   - ficheprojet.js .fiche-lightbox
//   - cameramarkers.js #fp-img-lightbox (inline styles)

;(function(win) {
  'use strict';

  let _overlay = null;
  let _img = null;
  let _keyHandler = null;

  function open(imageUrl, alt) {
    if (!imageUrl) return;

    // Sanitize inputs
    const safeSrc = win.SecurityUtils ? win.SecurityUtils.sanitizeUrl(imageUrl) : imageUrl;
    const safeAlt = win.SecurityUtils ? win.SecurityUtils.escapeAttribute(alt || '') : (alt || '');

    // Reuse or create overlay
    if (!_overlay) {
      _overlay = document.createElement('div');
      _overlay.className = 'gp-lightbox';
      _overlay.setAttribute('role', 'dialog');
      _overlay.setAttribute('aria-modal', 'true');
      _overlay.setAttribute('aria-label', 'Image agrandie');
      _overlay.innerHTML = `
        <div class="gp-lightbox__box">
          <img class="gp-lightbox__img" src="" alt="">
          <button type="button" class="gp-lightbox__close" aria-label="Fermer">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;

      _img = _overlay.querySelector('.gp-lightbox__img');

      // Close on backdrop click
      _overlay.addEventListener('click', function(e) {
        if (e.target === _overlay) close();
      });

      // Close button
      _overlay.querySelector('.gp-lightbox__close').addEventListener('click', close);
    }

    // Set image
    _img.src = safeSrc;
    _img.alt = safeAlt;

    // Insert into DOM
    document.body.appendChild(_overlay);

    // ESC key
    _keyHandler = function(e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', _keyHandler);

    // Focus close button for accessibility
    const closeBtn = _overlay.querySelector('.gp-lightbox__close');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    if (_overlay && _overlay.parentNode) {
      _overlay.remove();
    }
    if (_keyHandler) {
      document.removeEventListener('keydown', _keyHandler);
      _keyHandler = null;
    }
  }

  function isOpen() {
    return _overlay && _overlay.parentNode;
  }

  win.Lightbox = { open, close, isOpen };

})(window);
