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
import { createMap, wireLasso, syncLayerRender } from './diagnostic/map.js';
import { loadAllLayers, fitToData } from './diagnostic/layers.js';
import { renderDock, updateLayerRow, renderLayersPanel } from './diagnostic/panel.js';
import { handleSelection, refreshSelection, renderAnalysisPanel } from './diagnostic/analysis.js';
import { openReportsHistory } from './diagnostic/report.js';

// Jeton de génération : le routeur ré-utilise toujours le même conteneur
// #adm-content, donc comparer les conteneurs ne détecte pas un re-render
// (changement de structure, re-clic nav). Chaque rendu incrémente le jeton et
// les continuations async de l'ancien rendu s'interrompent.
let _epoch = 0;

export async function renderDiagnostic(container) {
  destroyDiagnostic();
  resetState();
  const epoch = ++_epoch;
  const alive = () => _epoch === epoch;
  dg.container = container;
  dg.onSelectionStale = refreshSelection;

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

  // Config en parallèle : branding (centre + fond), catalogue de fonds, couches.
  const [branding, basemaps, layers] = await Promise.all([
    api.getBranding().catch(() => null),
    window.supabaseService?.fetchBasemaps() ?? [],
    api.getDiagnosticLayers(),
  ]);
  if (!alive()) return; // section quittée ou re-rendue pendant le chargement
  dg.branding = branding;
  dg.layersLoadFailed = layers === null;
  dg.layers = layers || [];

  // Le dock et les données ne dépendent pas de la carte : la gestion des
  // couches reste fonctionnelle même si WebGL est indisponible.
  const mapWrap = container.querySelector('#dg-mapwrap');
  renderDock(mapWrap);
  renderAnalysisPanel();
  loadAllLayers((layer) => { if (alive()) updateLayerRow(layer.id); }).then(() => {
    if (alive()) renderLayersPanel();
  });

  // MapLibre lit la taille du conteneur à l'init : attendre la fin du layout.
  setTimeout(async () => {
    if (!alive()) return;
    try {
      if (typeof maplibregl === 'undefined') throw new Error('MapLibre non chargé');
      await createMap(container.querySelector('#dg-map'), basemaps);
      if (!alive()) return;
      wireLasso(mapWrap, handleSelection);
      // Synchroniser les couches déjà chargées pendant l'init de la carte.
      for (const layer of dg.layers) syncLayerRender(layer);
      fitToData();
    } catch (err) {
      console.warn('[admin/diagnostic] Carte indisponible:', err);
      // Rendu obsolète : destroyDiagnostic a déjà retiré la carte de CE rendu,
      // et dg.map peut appartenir au rendu suivant — ne pas y toucher.
      if (!alive()) return;
      try { dg.map?.remove(); } catch { /* jamais initialisée */ }
      dg.map = null;
      dg.mapReady = false;
      mapWrap.querySelector('#dg-lasso-btn')?.setAttribute('hidden', '');
      const notice = document.createElement('div');
      notice.className = 'dg-map-error';
      notice.innerHTML = `<i class="fa-solid fa-map"></i> ${esc('Carte non disponible — la gestion des couches reste accessible.')}`;
      mapWrap.appendChild(notice);
    }
  }, 200);
}

/** Détruit la carte et les listeners globaux de la section. */
export function destroyDiagnostic() {
  _epoch++; // interrompt les continuations async du rendu en cours
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
