// modules/detail-panel.js
// Panneau de fiche de la carte (#project-detail), partagé par la fiche projet
// (navigationmodule.js) et la fiche chantier (travaux-views.js) : ouverture,
// fermeture, boutons Retour / Fermer et marge de la carte.
window.DetailPanel = (() => {
  const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

  const panelEl = () => document.getElementById('project-detail');
  const glMap = () => window.MapModule?.map?._mlMap;

  /**
   * Remet la marge interne de la carte à zéro. Avec MapLibre GL v4, fitBounds
   * AJOUTE sa marge à celle posée par easeTo : sans cette remise à zéro, les
   * deux s'empilent et dépassent l'écran sur mobile (2 × 62 vh).
   * @param {number} [duration] - 0 : immédiat ; sinon animé
   */
  function resetMapPadding(duration = 0) {
    try {
      const map = glMap();
      if (duration) map?.easeTo?.({ padding: NO_PADDING, duration });
      else map?.jumpTo?.({ padding: NO_PADDING });
    } catch (e) { console.debug('[detail-panel] marge de la carte non remise à zéro:', e); }
  }

  /**
   * Ouvre le panneau : arrête l'animation de carte en cours (sinon le repli de
   * la navigation l'interrompt en plein vol), replie la navigation (son état est
   * gardé pour le retour), remet la marge de la carte à zéro.
   * @param {string} color - couleur de la fiche (--cat-color)
   * @returns {HTMLElement|null}
   */
  function open(color) {
    const panel = panelEl();
    if (!panel) return null;
    try { glMap()?.stop?.(); } catch (e) { console.debug('[detail-panel] animation non arrêtée:', e); }
    window.NavPanel?.collapse();
    resetMapPadding();
    panel.style.removeProperty('max-height');
    panel.style.removeProperty('overflow');
    panel.style.setProperty('--cat-color', color);
    panel.style.display = 'flex';
    return panel;
  }

  /**
   * Ferme le panneau : rouvre la navigation si elle avait été repliée,
   * sinon rend sa marge à la carte en douceur.
   * @param {{ clear?: boolean }} [opts] - clear : vide aussi le contenu
   */
  function close({ clear = false } = {}) {
    const panel = panelEl();
    if (panel) {
      panel.style.display = 'none';
      if (clear) panel.innerHTML = '';
    }
    if (window.NavPanel?.getState?.()?.level > 0) window.NavPanel.expand();
    else resetMapPadding(300);
  }

  /** Barre permanente Retour / Fermer, en tête de chaque fiche. */
  const OVERLAY_BUTTONS = '<div class="detail-overlay-btns">'
    + '<button id="detail-back-btn" class="detail-back-floating" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i></button>'
    + '<button id="detail-close-btn" class="detail-close-floating" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>'
    + '</div>';

  /**
   * Branche les boutons de la barre.
   * @param {HTMLElement} panel
   * @param {{ onBack: Function, onClose: Function }} handlers
   */
  function bindButtons(panel, { onBack, onClose }) {
    panel.querySelector('#detail-back-btn')?.addEventListener('click', onBack);
    panel.querySelector('#detail-close-btn')?.addEventListener('click', onClose);
  }

  return { open, close, resetMapPadding, bindButtons, OVERLAY_BUTTONS };
})();
