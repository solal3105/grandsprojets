/**
 * Section admin — Diagnostic terrain.
 * Carte plein écran qui agrège les couches de données de la structure
 * (diagnostic_layers), permet une sélection lasso et produit un diagnostic
 * IA de zone sourcé, exportable en rapport.
 *
 * Entrée : renderDiagnostic(container) — cleanup : destroyDiagnostic()
 * (branché sur router.setBeforeNavigate dans app.js).
 */

import * as api from '../api.js';
import { store } from '../store.js';
import { esc } from '../components/ui.js';
import { dg, resetState } from './diagnostic/state.js';
import { createMap, wireLasso } from './diagnostic/map.js';
import { loadAllLayers } from './diagnostic/layers.js';
import { renderDock, updateLayerRow, renderLayersPanel } from './diagnostic/panel.js';
import { handleSelection, renderAnalysisPanel } from './diagnostic/analysis.js';
import { openReportsHistory } from './diagnostic/report.js';

export async function renderDiagnostic(container) {
  destroyDiagnostic();
  resetState();
  dg.container = container;

  if (!store.isAdmin) {
    container.innerHTML = `
      <div class="adm-empty">
        <div class="adm-empty__icon"><i class="fa-solid fa-lock"></i></div>
        <div class="adm-empty__title">Accès réservé</div>
        <div class="adm-empty__text">Le diagnostic terrain est réservé aux administrateurs de la structure.</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="dg-section">
      <div class="adm-page-header dg-header">
        <div>
          <h1 class="adm-page-title"><i class="fa-solid fa-map-location-dot"></i> Diagnostic terrain</h1>
          <p class="adm-page-subtitle">Agrégez les données de votre territoire, sélectionnez une zone et obtenez un diagnostic sourcé.</p>
        </div>
        <div class="dg-header__actions">
          <button type="button" class="adm-btn adm-btn--secondary" id="dg-history-btn">
            <i class="fa-solid fa-clock-rotate-left"></i> Historique
          </button>
        </div>
      </div>
      <div class="dg-mapwrap" id="dg-mapwrap">
        <div id="dg-map"></div>
        <button type="button" class="dg-lasso-btn" id="dg-lasso-btn" title="Dessinez une zone à main levée sur la carte">
          <i class="fa-solid fa-draw-polygon"></i> Sélectionner une zone
        </button>
        <div class="dg-lasso-hint" id="dg-lasso-hint" hidden>
          <i class="fa-solid fa-hand-pointer"></i> Entourez les points à analyser — <b>Échap</b> pour annuler
        </div>
      </div>
    </div>
  `;

  container.querySelector('#dg-history-btn')?.addEventListener('click', openReportsHistory);

  if (typeof maplibregl === 'undefined') {
    container.querySelector('#dg-mapwrap').innerHTML =
      `<div class="adm-empty"><div class="adm-empty__title">${esc('Carte indisponible')}</div><div class="adm-empty__text">MapLibre n'a pas pu être chargé.</div></div>`;
    return;
  }

  // Config en parallèle : branding (centre + fond), catalogue de fonds, couches.
  const [branding, basemaps, layers] = await Promise.all([
    api.getBranding().catch(() => null),
    window.supabaseService?.fetchBasemaps() ?? [],
    api.getDiagnosticLayers(),
  ]);
  if (dg.container !== container) return; // section quittée pendant le chargement
  dg.branding = branding;
  dg.layers = layers;

  const mapWrap = container.querySelector('#dg-mapwrap');
  // MapLibre lit la taille du conteneur à l'init : attendre la fin du layout.
  setTimeout(async () => {
    if (dg.container !== container) return;
    await createMap(container.querySelector('#dg-map'), basemaps);
    if (dg.container !== container) return;
    renderDock(mapWrap);
    renderAnalysisPanel();
    wireLasso(mapWrap, handleSelection);
    await loadAllLayers((layer) => updateLayerRow(layer.id));
    renderLayersPanel();
  }, 200);
}

/** Détruit la carte et les listeners globaux de la section. */
export function destroyDiagnostic() {
  dg.abortCtrl?.abort();
  for (const fn of dg.cleanupFns) {
    try { fn(); } catch { /* listener déjà retiré */ }
  }
  dg.cleanupFns = [];
  try { dg.map?.remove(); } catch { /* carte déjà détruite */ }
  dg.map = null;
  dg.mapReady = false;
  dg.container = null;
  document.querySelectorAll('.dg-report-doc, .dg-modal-overlay').forEach((el) => el.remove());
}
