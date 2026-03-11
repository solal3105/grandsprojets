/**
 * TOOLTIP MANAGER - Stub
 * 
 * Les tooltips sont gérés nativement par la couche de compatibilité
 * maplibre-compat.js via bindTooltip() dans datamodule.js → bindFeatureEvents().
 * 
 * Ce module est conservé pour compatibilité mais ne fait rien.
 * Le vrai travail de tooltip est dans :
 *  - datamodule.js → bindFeatureEvents() → layer.bindTooltip()
 *  - maplibre-compat.js → PathLayer.bindTooltip() → MapLibre GL Popup
 */
;(function(win) {
  'use strict';

  const TooltipManager = {
    init() {
      console.log('[TooltipManager] ✅ Stub (tooltips gérés par compat layer + bindTooltip)');
    },
    destroy() {}
  };

  win.TooltipManager = TooltipManager;
})(window);
