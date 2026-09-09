/**
 * Diagnostic terrain - cycle de vie des couches de données.
 * Orchestration entre la config (diagnostic_layers), les données chargées
 * (dg.runtime) et le rendu carte. Aucune manipulation de DOM ici : les
 * appelants fournissent un callback `onUpdate(layer)` pour rafraîchir l'UI.
 */

import * as api from '../../api.js';
import { dg, PALETTE, layerKind } from './state.js';
import { loadLayerData, detectFields, distinctValues, quantileStops } from './data.js';
import { syncLayerRender, setLayerVisibility, removeLayerRender, updateHeatmap, fitFeatures, heatColors, setDarkBase, syncLayerOrder } from './map.js';

/**
 * Complète les couleurs par catégorie manquantes d'une couche (mode category)
 * à partir des valeurs réellement présentes dans les données.
 */
function ensureCategoryColors(layer, features) {
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

/**
 * Paliers d'un style gradué, calculés sur les données réellement chargées
 * (quantiles) : rien n'est persisté, une mise à jour des données recale la
 * lecture toute seule. null si le style n'est pas gradué ou si le champ est vide.
 */
function graduatedRamp(layer, features) {
  const style = layer.style || {};
  if (style.mode !== 'graduated' || !style.value_field) return null;
  const stops = quantileStops(features, style.value_field);
  if (stops.length < 2) return null;
  return { stops, colors: heatColors(stops.length) };
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
      ramp: graduatedRamp(layer, features),
    });
    syncLayerRender(layer);
    syncLayerOrder();
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
  syncLayerOrder();
  autoDarkBase();
  fitToData();
}

/**
 * Nouvel ordre d'une liste quand on dépose `draggedId` sur `targetId`.
 * Fonction pure : [ids] → [ids].
 * @param {string[]} ids - ordre courant
 * @param {string} draggedId - couche déplacée
 * @param {string} targetId - couche sur laquelle on la dépose
 * @param {boolean} after - déposée après (true) ou avant (false) la cible
 */
export function moveInList(ids, draggedId, targetId, after) {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return [...ids];
  const rest = ids.filter((id) => id !== draggedId);
  const at = rest.indexOf(targetId) + (after ? 1 : 0);
  rest.splice(at, 0, draggedId);
  return rest;
}

/**
 * Applique un nouvel ordre : liste, carte, puis base (seules les couches dont
 * le rang change sont réécrites). Résout false si l'enregistrement a échoué,
 * la liste et la carte restent alors dans le nouvel ordre pour cette session.
 */
export async function reorderLayers(ids) {
  const byId = new Map(dg.layers.map((l) => [l.id, l]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const l of dg.layers) if (!ordered.includes(l)) ordered.push(l);
  const changed = [];
  ordered.forEach((l, i) => { if (l.sort_order !== i) { l.sort_order = i; changed.push({ id: l.id, sort_order: i }); } });
  dg.layers = ordered;
  syncLayerOrder();
  if (!changed.length) return true;
  const { success } = await api.updateDiagnosticLayersOrder(changed);
  return success;
}

/** Une carte de flux visible appelle un fond sombre : on l'active sans rien demander. */
export function autoDarkBase() {
  const flux = dg.layers.some((l) => {
    const rt = dg.runtime.get(l.id);
    return rt?.status === 'ready' && rt.visible && rt.ramp;
  });
  if (flux && !dg.darkBase) {
    dg.darkBase = true;
    setDarkBase(true);
  }
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

/**
 * Cadre la carte sur les données visibles chargées. Les témoignages priment :
 * une couche de référence couvre souvent toute l'agglomération, alors que les
 * signalements disent où l'on travaille.
 */
export function fitToData() {
  const temoignages = [];
  const reference = [];
  for (const layer of dg.layers) {
    const rt = dg.runtime.get(layer.id);
    if (rt?.status !== 'ready' || !rt.visible) continue;
    (layerKind(layer) === 'reference' ? reference : temoignages).push(...rt.features);
  }
  const all = temoignages.length ? temoignages : reference;
  if (all.length) fitFeatures(all, { maxZoom: 13, base: 70 });
}
