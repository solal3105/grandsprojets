// modules/detail-panel.js
// Panneau de fiche de la carte (#project-detail) : seul responsable de son
// ouverture, de sa fermeture, de ce qu'il affiche, des boutons Retour / Fermer
// et de la marge de la carte. Le partagent la fiche projet
// (navigationmodule.js), la fiche chantier (travaux-views.js) et la fiche de
// signalement (participer-views.js) ; personne d'autre ne touche à son
// affichage.
window.DetailPanel = (() => {
  const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

  const panelEl = () => document.getElementById('project-detail');
  const glMap = () => window.MapModule?.map?._mlMap;

  // Ce que le panneau affiche (ex. « nom::catégorie » pour un projet), null
  // pour une fiche sans identité ou un panneau fermé. Ouvrir une autre fiche
  // ou fermer le panneau l'efface : un projet déjà affiché n'est pas re-rendu,
  // mais il se rouvre dès que le panneau a montré autre chose.
  let shownKey = null;

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
   * @param {string|null} [key] - ce que la fiche affiche (voir isShowing)
   * @returns {HTMLElement|null}
   */
  function open(color, key = null) {
    const panel = panelEl();
    if (!panel) return null;
    shownKey = key;
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
    hide({ clear });
    if (window.NavPanel?.getState?.()?.level > 0) window.NavPanel.expand();
    else resetMapPadding(300);
  }

  /**
   * Cache le panneau sans toucher à la navigation ni à la carte : un autre
   * panneau ou une autre catégorie prend la place.
   * @param {{ clear?: boolean }} [opts] - clear : vide aussi le contenu
   */
  function hide({ clear = false } = {}) {
    shownKey = null;
    const panel = panelEl();
    if (!panel) return;
    panel.style.display = 'none';
    if (clear) panel.innerHTML = '';
  }

  /** Le panneau est-il ouvert ? (open l'affiche toujours en flex) */
  function isOpen() {
    return panelEl()?.style.display === 'flex';
  }

  /** Le panneau ouvert affiche-t-il déjà `key` ? */
  function isShowing(key) {
    return key != null && shownKey === key && isOpen();
  }

  /** Oublie ce qu'affiche le panneau, qui reste ouvert (fiche en erreur, test). */
  function forget() {
    shownKey = null;
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

  return { open, close, hide, isOpen, isShowing, forget, resetMapPadding, bindButtons, OVERLAY_BUTTONS };
})();
