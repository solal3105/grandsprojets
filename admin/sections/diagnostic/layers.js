/**
 * Diagnostic terrain - cycle de vie des couches de données.
 * Orchestration entre la config (diagnostic_layers), les données chargées
 * (dg.runtime) et le rendu carte. Aucune manipulation de DOM ici : les
 * appelants fournissent un callback `onUpdate(layer)` pour rafraîchir l'UI.
 */

import * as api from '../../api.js';
import { dg, PALETTE } from './state.js';
import { loadLayerData, detectFields, distinctValues } from './data.js';
import { syncLayerRender, setLayerVisibility, removeLayerRender, updateHeatmap, fitFeatures } from './map.js';

/**
 * Complète les couleurs par catégorie manquantes d'une couche (mode category)
 * à partir des valeurs réellement présentes dans les données.
 */
export function ensureCategoryColors(layer, features) {
  const style = layer.style || {};
  if (style.mode !== 'category' || !style.category_field) return;
  const colors = { ...style.cat_colors };
  let paletteIndex = Object.keys(colors).length;
  for (const [value] of distinctValues(features, style.category_field, 12)) {
    if (!(value in colors)) colors[value] = PALETTE[paletteIndex++ % PALETTE.length];
  }
  style.cat_colors = colors;
  layer.style = style;
}

/** Charge (ou recharge) les données d'une couche et synchronise son rendu. */
export async function loadLayer(layer, onUpdate) {
  const existing = dg.runtime.get(layer.id);
  const visible = existing ? existing.visible : layer.default_on !== false;
  dg.runtime.set(layer.id, { status: 'loading', features: [], count: 0, fields: [], visible, error: null });
  onUpdate?.(layer);
  try {
    const features = await loadLayerData(layer);
    if (!dg.runtime.has(layer.id)) return; // couche supprimée pendant le chargement
    ensureCategoryColors(layer, features);
    dg.runtime.set(layer.id, {
      status: 'ready',
      features,
      count: features.length,
      fields: detectFields(features),
      visible,
      error: null,
    });
    syncLayerRender(layer);
  } catch (e) {
    console.warn('[admin/diagnostic] Chargement couche échoué:', layer.label, e);
    if (!dg.runtime.has(layer.id)) return;
    dg.runtime.set(layer.id, { status: 'error', features: [], count: 0, fields: [], visible, error: e.message || 'Erreur' });
  }
  onUpdate?.(layer);
  updateHeatmap(dg.heatmapOn);
}

/** Charge toutes les couches actives en parallèle puis cadre la carte sur les données. */
export async function loadAllLayers(onUpdate) {
  const enabled = dg.layers.filter((l) => l.enabled !== false);
  await Promise.all(enabled.map((layer) => loadLayer(layer, onUpdate)));
  fitToData();
}

/** Bascule la visibilité d'une couche. */
export function toggleLayer(id, visible) {
  const rt = dg.runtime.get(id);
  if (!rt) return;
  rt.visible = visible;
  setLayerVisibility(id, visible);
  updateHeatmap(dg.heatmapOn);
  dg.onSelectionStale?.(); // la zone tracée ne contient plus les mêmes points
}

/** Supprime une couche : base, carte et état local. */
export async function deleteLayer(id) {
  const { success, error } = await api.deleteDiagnosticLayer(id);
  if (!success) throw (error || new Error('Suppression impossible'));
  removeLayerRender(id);
  dg.runtime.delete(id);
  dg.layers = dg.layers.filter((l) => l.id !== id);
  updateHeatmap(dg.heatmapOn);
  dg.onSelectionStale?.();
}

/** Cadre la carte sur l'ensemble des données visibles chargées. */
export function fitToData() {
  const all = [];
  for (const layer of dg.layers) {
    const rt = dg.runtime.get(layer.id);
    if (rt?.status === 'ready' && rt.visible) all.push(...rt.features);
  }
  if (all.length) fitFeatures(all, { maxZoom: 13, base: 70 });
}
