// modules/contrib/contrib-draw-controls.js
// Gestion complète des contrôles de dessin manuel (toolbar + state management)

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================
  
  let toolbar = null;
  let drawPanelElement = null;
  let stateChangeCallback = null;

  // ============================================================================
  // TOOLBAR CREATION
  // ============================================================================

  /**
   * Crée la toolbar de dessin avec tous les contrôles
   * @returns {HTMLElement} L'élément toolbar
   */
  function createToolbar() {
    const toolbarEl = document.createElement('div');
    toolbarEl.id = 'contrib-manual-draw-controls';
    toolbarEl.className = 'draw-controls';
    toolbarEl.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 12px 0;
      padding: 12px;
      background: linear-gradient(135deg, var(--gray-50) 0%, var(--gray-100) 100%);
      border: 1px solid var(--gray-200);
      border-radius: 10px;
      flex-wrap: wrap;
      box-shadow: 0 2px 8px var(--black-alpha-06);
    `;

    toolbarEl.innerHTML = `
      <div style="display: flex; gap: 6px; align-items: center;">
        <button type="button" class="draw-btn draw-btn--line" id="btn-draw-line" 
                title="Tracer une ligne" data-action="line">
          <i class="fa-solid fa-route" aria-hidden="true"></i>
          <span>Ligne</span>
        </button>
        <button type="button" class="draw-btn draw-btn--polygon" id="btn-draw-poly" 
                title="Tracer un polygone" data-action="polygon">
          <i class="fa-solid fa-draw-polygon" aria-hidden="true"></i>
          <span>Polygone</span>
        </button>
      </div>
      
      <div style="width: 1px; height: 28px; background: var(--gray-300);"></div>
      
      <div style="display: flex; gap: 6px; align-items: center;">
        <button type="button" class="draw-btn draw-btn--undo" id="btn-undo-point" 
                title="Annuler le dernier point" data-action="undo" disabled>
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
          <span>Annuler</span>
        </button>
        <button type="button" class="draw-btn draw-btn--finish" id="btn-finish" 
                title="Terminer le tracé" data-action="finish" disabled>
          <i class="fa-solid fa-check" aria-hidden="true"></i>
          <span>Terminer</span>
        </button>
      </div>
      
      <div style="width: 1px; height: 28px; background: var(--gray-300);"></div>
      
      <button type="button" class="draw-btn draw-btn--clear" id="btn-clear-geom" 
              title="Effacer la géométrie" data-action="clear" disabled>
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
        <span>Effacer</span>
      </button>
      
      <div id="draw-status" style="margin-left: auto; font-size: 13px; color: var(--gray-500); font-weight: 500; display: flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-info-circle" style="font-size: 14px;"></i>
        <span id="draw-status-text">Choisissez un type de tracé</span>
      </div>
    `;

    // Ajouter les styles CSS
    addToolbarStyles();

    return toolbarEl;
  }

  /**
   * Ajoute les styles CSS pour la toolbar
   */
  function addToolbarStyles() {
    if (document.getElementById('contrib-draw-controls-styles')) return;

    const style = document.createElement('style');
    style.id = 'contrib-draw-controls-styles';
    style.textContent = `
      .draw-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 1px solid var(--gray-300);
        border-radius: 8px;
        background: var(--surface);
        color: var(--gray-700);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
      }

      .draw-btn:hover:not(:disabled) {
        background: var(--gray-50);
        border-color: var(--gray-400);
        transform: translateY(-1px);
        box-shadow: 0 2px 4px var(--black-alpha-10);
      }

      .draw-btn:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 1px 2px var(--black-alpha-10);
      }

      .draw-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--gray-100);
      }

      .draw-btn.is-active {
        background: linear-gradient(135deg, var(--info-light) 0%, var(--info) 100%);
        color: var(--on-accent);
        border-color: var(--info);
        box-shadow: 0 2px 8px var(--info-alpha-3);
      }

      .draw-btn.is-active:hover {
        background: linear-gradient(135deg, var(--info) 0%, var(--info-hover) 100%);
      }

      .draw-btn--finish:not(:disabled) {
        background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%);
        color: var(--on-accent);
        border-color: var(--primary);
      }

      .draw-btn--finish:not(:disabled):hover {
        background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
        box-shadow: 0 2px 8px var(--primary-alpha-3);
      }

      .draw-btn--clear:not(:disabled) {
        background: var(--danger-lighter);
        color: var(--danger);
        border-color: var(--danger-light);
      }

      .draw-btn--clear:not(:disabled):hover {
        background: var(--danger-light);
        border-color: var(--danger-light);
      }

      .draw-btn i {
        font-size: 16px;
      }

      @media (max-width: 640px) {
        .draw-btn span {
          display: none;
        }
        .draw-btn {
          padding: 8px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // TOOLBAR MANAGEMENT
  // ============================================================================

  /**
   * Initialise la toolbar dans le panneau de dessin
   * @param {HTMLElement} drawPanel - Élément du panneau de dessin
   * @param {Function} onStateChange - Callback appelé lors des changements d'état
   */
  function initToolbar(drawPanel, onStateChange) {
    if (!drawPanel) {
      console.error('[contrib-draw-controls] drawPanel is required');
      return;
    }

    drawPanelElement = drawPanel;
    stateChangeCallback = onStateChange;

    // Supprimer l'ancienne toolbar si elle existe
    destroyToolbar();

    // Créer la nouvelle toolbar
    toolbar = createToolbar();

    // Insérer la toolbar au début du panneau
    const helper = drawPanel.querySelector('.helper');
    if (helper) {
      helper.after(toolbar);
    } else {
      drawPanel.prepend(toolbar);
    }

    // Attacher les event listeners
    attachEventListeners();

    console.log('[contrib-draw-controls] Toolbar initialized');
  }

  /**
   * Détruit la toolbar existante
   */
  function destroyToolbar() {
    const existingToolbar = drawPanelElement?.querySelector('#contrib-manual-draw-controls');
    if (existingToolbar) {
      existingToolbar.remove();
      console.log('[contrib-draw-controls] Old toolbar removed');
    }
    toolbar = null;
  }

  /**
   * Attache les event listeners aux boutons
   */
  function attachEventListeners() {
    if (!toolbar) return;

    const btnLine = toolbar.querySelector('#btn-draw-line');
    const btnPoly = toolbar.querySelector('#btn-draw-poly');
    const btnUndo = toolbar.querySelector('#btn-undo-point');
    const btnFinish = toolbar.querySelector('#btn-finish');
    const btnClear = toolbar.querySelector('#btn-clear-geom');

    if (btnLine) {
      btnLine.addEventListener('click', () => handleAction('line'));
    }

    if (btnPoly) {
      btnPoly.addEventListener('click', () => handleAction('polygon'));
    }

    if (btnUndo) {
      btnUndo.addEventListener('click', () => handleAction('undo'));
    }

    if (btnFinish) {
      btnFinish.addEventListener('click', () => handleAction('finish'));
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => handleAction('clear'));
    }

    console.log('[contrib-draw-controls] Event listeners attached');
  }

  /**
   * Gère les actions des boutons
   * @param {string} action - Action à effectuer
   */
  function handleAction(action) {
    console.log('[contrib-draw-controls] Action:', action);

    const ContribMap = win.ContribMap;
    if (!ContribMap) {
      console.error('[contrib-draw-controls] ContribMap not available');
      return;
    }

    switch (action) {
      case 'line':
        ContribMap.startManualDraw?.('line');
        updateStatus('👆 Cliquez sur la carte pour placer le premier point');
        showMapHelper('Cliquez sur la carte pour placer vos points', 'line');
        break;

      case 'polygon':
        ContribMap.startManualDraw?.('polygon');
        updateStatus('👆 Cliquez sur la carte pour placer le premier point');
        showMapHelper('Cliquez sur la carte pour placer vos points', 'polygon');
        break;

      case 'undo':
        ContribMap.undoManualPoint?.();
        updateStatus('Dernier point annulé');
        break;

      case 'finish':
        ContribMap.finishManualDraw?.();
        updateStatus('✅ Tracé terminé ! Vous pouvez continuer');
        hideMapHelper();
        break;

      case 'clear':
        if (confirm('Effacer la géométrie dessinée ?')) {
          ContribMap.clearManualGeometry?.();
          updateStatus('Géométrie effacée');
          hideMapHelper();
        }
        break;
    }

    // Mettre à jour l'état des boutons
    updateButtonStates();
  }

  /**
   * Affiche un message d'aide sur la carte
   * @param {string} message - Message à afficher
   * @param {string} type - Type de tracé (line/polygon)
   */
  function showMapHelper(message, type) {
    hideMapHelper(); // Supprimer l'ancien helper

    const mapContainer = document.getElementById('contrib-draw-map');
    if (!mapContainer) return;

    const helper = document.createElement('div');
    helper.id = 'draw-map-helper';
    helper.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, var(--info-light) 0%, var(--info) 100%);
      color: var(--white);
      padding: 20px 28px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      z-index: 1000;
      box-shadow: 0 8px 24px var(--info-alpha-4);
      pointer-events: none;
      animation: pulse-helper 2s ease-in-out infinite;
      text-align: center;
      max-width: 300px;
    `;

    const icon = type === 'line' ? '📏' : '⬡';
    helper.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 8px;">${icon}</div>
      <div>${message}</div>
      <div style="font-size: 13px; margin-top: 8px; opacity: 0.9;">Cliquez pour commencer</div>
    `;

    mapContainer.appendChild(helper);

    // Ajouter l'animation CSS si elle n'existe pas
    if (!document.getElementById('draw-helper-animation')) {
      const style = document.createElement('style');
      style.id = 'draw-helper-animation';
      style.textContent = `
        @keyframes pulse-helper {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.95; }
        }
      `;
      document.head.appendChild(style);
    }

    // Masquer le helper après le premier clic
    const hideOnClick = () => {
      setTimeout(() => hideMapHelper(), 500);
      mapContainer.removeEventListener('click', hideOnClick);
    };
    mapContainer.addEventListener('click', hideOnClick);
  }

  /**
   * Masque le message d'aide sur la carte
   */
  function hideMapHelper() {
    const helper = document.getElementById('draw-map-helper');
    if (helper) {
      helper.style.animation = 'none';
      helper.style.opacity = '0';
      helper.style.transform = 'translate(-50%, -50%) scale(0.9)';
      helper.style.transition = 'all 0.3s ease';
      setTimeout(() => helper.remove(), 300);
    }
  }

  /**
   * Met à jour l'état des boutons selon l'état du dessin
   */
  function updateButtonStates() {
    if (!toolbar) return;

    const ContribMap = win.ContribMap;
    if (!ContribMap || !ContribMap.getManualDrawState) return;

    const state = ContribMap.getManualDrawState();
    const hasPoints = state.pointsCount > 0;
    const active = state.active === true;
    const type = state.type;
    const hasGeometry = ContribMap.hasDrawGeometry?.() || false;

    // Boutons Ligne/Polygone
    const btnLine = toolbar.querySelector('#btn-draw-line');
    const btnPoly = toolbar.querySelector('#btn-draw-poly');
    
    if (btnLine) {
      btnLine.classList.toggle('is-active', active && type === 'line');
      btnLine.disabled = active && type !== 'line';
    }
    
    if (btnPoly) {
      btnPoly.classList.toggle('is-active', active && type === 'polygon');
      btnPoly.disabled = active && type !== 'polygon';
    }

    // Bouton Annuler
    const btnUndo = toolbar.querySelector('#btn-undo-point');
    if (btnUndo) {
      btnUndo.disabled = !active || !hasPoints;
    }

    // Bouton Terminer
    const btnFinish = toolbar.querySelector('#btn-finish');
    if (btnFinish) {
      const minPoints = type === 'line' ? 2 : 3;
      btnFinish.disabled = !active || state.pointsCount < minPoints;
    }

    // Bouton Effacer
    const btnClear = toolbar.querySelector('#btn-clear-geom');
    if (btnClear) {
      btnClear.disabled = !hasGeometry;
    }

    // Mettre à jour le statut
    if (active) {
      const pointsText = state.pointsCount === 0 ? 'Aucun point' : 
                         state.pointsCount === 1 ? '1 point' : 
                         `${state.pointsCount} points`;
      const typeText = type === 'line' ? '📏 Ligne' : '⬡ Polygone';
      updateStatus(`${typeText} en cours : ${pointsText}`);
    } else if (hasGeometry) {
      updateStatus('✅ Tracé terminé - Vous pouvez continuer');
    } else {
      updateStatus('👉 Choisissez un type de tracé pour commencer');
    }

    // Appeler le callback si défini
    if (stateChangeCallback) {
      stateChangeCallback();
    }
  }

  /**
   * Met à jour le texte de statut
   * @param {string} text - Texte à afficher
   */
  function updateStatus(text) {
    if (!toolbar) return;
    const statusText = toolbar.querySelector('#draw-status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  win.ContribDrawControls = {
    initToolbar,
    destroyToolbar,
    updateButtonStates,
    updateStatus
  };

})(window);
