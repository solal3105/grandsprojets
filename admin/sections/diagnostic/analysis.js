/**
 * Diagnostic terrain - onglet Analyse.
 * Prépare la sélection, juge sa taille avant le premier appel et ouvre le dossier web.
 */

import { esc } from '../../components/ui.js';
import { dg, layerKind } from './state.js';
import { geometryBbox } from './data.js';
import { resolveSelection, selectInRing, renderSelection, setHover, fitBoundsSafely, zoneBounds } from './map.js';
import { setAnalysisBadge, showTab } from './panel.js';
import { openReport } from './report.js';
import { polygonAreaKm2 } from './geometry.js';
import { createDossier, OBJECTIVE_EXAMPLE } from './dossier/model.js';
import { forecastAnalysis, EXPECTED_BUDGET_MICRO } from './dossier/contract.mjs';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

const _layerOf = (f) => dg.layers.find((l) => l.id === f.__layerId);

/* ── Sélection ─────────────────────────────────────────────────── */

/**
 * Sépare les entités retenues par le lasso selon la nature de leur couche :
 * les témoignages (lus par lots dans le dossier) et le contexte
 * (couches de référence : chiffres de zone, jamais lus point par point).
 */
function _partitionSelection(all) {
  const features = [];
  const context = [];
  for (const f of all) {
    const layer = _layerOf(f);
    (layer && layerKind(layer) === 'reference' ? context : features).push(f);
  }
  return { features, context };
}

/** Reçoit le polygone écran du lasso, résout et affiche la sélection. */
export function handleSelection(screenPoints) {
  const { features: all, polygon } = resolveSelection(screenPoints);
  const { features, context } = _partitionSelection(all);
  // Emprise et surface du périmètre tracé, même sans observation.
  const bbox = geometryBbox(polygon);
  // Une zone vide reste une sélection : le panneau explique quoi faire.
  dg.selection = { features, context, polygon, bbox, areaKm2: polygonAreaKm2(polygon) };
  renderSelection(dg.selection);
  setAnalysisBadge(features.length);
  renderAnalysisPanel();
  showTab('analyse');
  // Cadrer sur la zone tracée réunie aux entités retenues, sans jamais dézoomer.
  fitBoundsSafely(zoneBounds(polygon?.coordinates?.[0], all));
}

/**
 * Recalcule la sélection sur la zone déjà tracée : appelé quand les couches
 * visibles changent (affichage, suppression). Le dossier reflète ainsi les
 * sources effectivement retenues par l'agent.
 * Posé sur dg.onSelectionStale par diagnostic.js (évite un import circulaire).
 */
export function refreshSelection() {
  const ring = dg.selection?.polygon?.coordinates?.[0];
  if (!ring) return;
  const all = selectInRing(ring);
  const { features, context } = _partitionSelection(all);
  const bbox = geometryBbox(dg.selection.polygon);
  dg.selection = { ...dg.selection, features, context, bbox, areaKm2: polygonAreaKm2(dg.selection.polygon) };
  renderSelection(dg.selection);
  setAnalysisBadge(features.length);
  renderAnalysisPanel();
}

export function clearSelection() {
  dg.selection = null;
  renderSelection(null);
  setHover([]);
  setAnalysisBadge(0);
  renderAnalysisPanel();
}

/* ── Statistiques déterministes ────────────────────────────────── */

function _breakdown(features) {
  const byLayer = new Map();
  for (const f of features) {
    byLayer.set(f.__layerId, (byLayer.get(f.__layerId) || 0) + 1);
  }
  return [...byLayer.entries()]
    .map(([id, count]) => ({ layer: dg.layers.find((l) => l.id === id), count }))
    .filter((e) => e.layer)
    .sort((a, b) => b.count - a.count);
}

/** Surface de vérification des décomptes du panneau, sans passer par la carte. */
export const _internals = {
  breakdown: _breakdown,
  partitionSelection: _partitionSelection,
};

/** L’ouverture du dossier lance la lecture des témoignages disponibles. */
export function renderAnalysisPanel() {
  const panel = dg.container?.querySelector('#dg-panel-analyse');
  if (!panel) return;
  const selection = dg.selection;
  if (!selection) {
    panel.innerHTML = `<div class="dg-empty"><i class="fa-solid fa-draw-polygon dg-empty__icon"></i><div class="dg-empty__title">Sélectionnez une zone à étudier</div><p class="dg-empty__text">Entourez un secteur sur la carte. Nous lirons ses témoignages et rassemblerons ses données dans un dossier que vous pourrez compléter et exporter.</p></div>`;
    return;
  }
  const all = [...selection.features, ...(selection.context || [])];
  const rows = _breakdown(all);
  /* La taille de la zone est jugée ICI, avant le premier appel, et non
     découverte à la fin sur un dossier aux trois quarts fait. La prévision part
     des observations exactes que le dossier lira (textes, longueurs, sources) :
     au-delà du budget prévu, on prévient sans empêcher ; une zone qui ne pourrait
     pas aller jusqu'à sa synthèse (plafond, nombre d'appels, taille de la
     synthèse) ne se lance pas. Aucun montant n'est affiché : la consigne suffit. */
  const forecast = forecastAnalysis(createDossier({ selection, layers: dg.layers, runtime: dg.runtime, city: '', brand: '' }).observations);
  const readable = forecast.texts;
  const hasTestimonies = readable > 0;
  const tooLarge = !forecast.fits;
  const smaller = 'Sélectionnez une zone plus petite ou masquez les sources inutiles dans l’onglet Couches.';
  const costNote = !hasTestimonies ? ''
    : tooLarge ? `<p class="dg-dossier-warn">${readable > 1 ? `Les ${_fmt(readable)} textes de cette zone dépassent` : 'Le texte de cette zone dépasse'} ce qu’un seul dossier peut lire. ${smaller}</p>`
    : forecast.spendMicro > EXPECTED_BUDGET_MICRO ? `<p class="dg-dossier-warn">Cette zone contient ${_fmt(readable)} textes : l’analyse sera longue. Vous pouvez la lancer, ou sélectionner une zone plus petite et masquer les sources inutiles dans l’onglet Couches.</p>`
    : '';
  const observations = selection.features.length;
  const summary = !all.length ? 'Aucune donnée visible dans ce périmètre. Vous pourrez documenter ce qui manque et ajouter vos observations.'
    : `Cette zone réunit des données de ${rows.length} source${rows.length > 1 ? 's' : ''}${observations ? `, dont ${_fmt(observations)} observation${observations > 1 ? 's' : ''}${readable ? ` et ${_fmt(readable)} texte${readable > 1 ? 's' : ''} à lire` : ''}` : ''}.`;
  panel.innerHTML = `
    <div class="dg-sel-status"><i class="fa-solid fa-vector-square"></i><span>Zone de <b>${_fmtKm2(selection.areaKm2)} km²</b></span><button type="button" class="dg-sel-clear" id="dg-sel-clear" aria-label="Effacer la sélection"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dg-dossier-intro"><h3>Le dossier de cette zone</h3><p>${summary}</p>
    ${hasTestimonies ? `<p>Nous lirons tous ces textes avant de préparer le dossier. Vous pourrez ensuite le compléter et l’exporter.</p>${costNote}<label class="adm-label" for="dg-study-objective">Objet de l’étude (facultatif)</label><input class="adm-input" id="dg-study-objective" maxlength="500" placeholder="${esc(OBJECTIVE_EXAMPLE)}"><p class="dg-dossier-help">La synthèse s’organise autour de cet objet, sans écarter les autres sujets.</p>` : ''}
    <button type="button" class="dg-analyze-btn" id="dg-analyze" ${tooLarge ? 'disabled' : ''}><i class="fa-solid fa-file-lines"></i> ${hasTestimonies ? 'Analyser la zone' : 'Ouvrir le dossier de zone'}</button>
    ${rows.length ? `<details class="dg-selection-sources"><summary>Voir les sources retenues</summary><dl>${rows.map(({ layer, count }) => `<div><dt>${esc(layer.label)}</dt><dd>${_fmt(count)}</dd></div>`).join('')}</dl></details>` : ''}</div>`;
  panel.querySelector('#dg-sel-clear').addEventListener('click', clearSelection);
  panel.querySelector('#dg-analyze').addEventListener('click', (event) => openReport(event.currentTarget));
}
