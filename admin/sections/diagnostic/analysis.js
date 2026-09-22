/**
 * Diagnostic terrain - onglet Analyse.
 * Prépare la sélection et ouvre le dossier web. Les helpers de lecture de
 * l'ancien format restent isolés pour la compatibilité des rapports historiques.
 */

import { esc } from '../../components/ui.js';
import { dg, safeColor, layerKind, layerMetrics } from './state.js';
import { geometryBbox, aggregateMetrics } from './data.js';
import { resolveSelection, selectInRing, renderSelection, setHover, fitBoundsSafely, zoneBounds } from './map.js';
import { setAnalysisBadge, showTab } from './panel.js';
import { openReport } from './report.js';
import { polygonAreaKm2 } from './geometry.js';
import { observationText } from './dossier/model.js';
import { estimateAnalysisMicro, EXPECTED_BUDGET_MICRO, HARD_LIMIT_MICRO } from './dossier/contract.mjs';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

const _layerOf = (f) => dg.layers.find((l) => l.id === f.__layerId);

/* ── Extraction de texte (pilotée par la config popup des couches) ── */

function _titleOf(f) {
  const layer = _layerOf(f);
  const field = layer?.popup?.title_field;
  const v = field ? f.properties?.[field] : null;
  return (v !== null && v !== undefined && v !== '') ? String(v) : (layer?.label || 'Point');
}

/**
 * Texte descriptif d'un point : le plus long des champs de popup. Prendre le
 * premier venu ferait passer un intitulé court (« Signalement 12 ») pour la
 * description, et reléguerait le vrai texte dans le contexte - où il serait
 * tronqué, puis cité tronqué.
 */
function _textOf(f) {
  const layer = _layerOf(f);
  const popup = layer?.popup || {};
  let best = '';
  for (const field of popup.fields || []) {
    if (field === popup.title_field) continue;
    const v = f.properties?.[field];
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s.length > best.length) best = s;
  }
  return best.length > 12 ? best : '';
}

/**
 * Contexte compact d'un point pour l'IA : valeur de catégorisation puis
 * jusqu'à 2 champs popup courts (rue, commune, date…) - piloté par la config.
 */
function _extraOf(f) {
  const layer = _layerOf(f);
  const popup = layer?.popup || {};
  const parts = [];
  const catField = layer?.style?.category_field;
  const catValue = catField ? f.properties?.[catField] : null;
  if (catValue !== null && catValue !== undefined && catValue !== '') parts.push(String(catValue).slice(0, 40));
  const text = _textOf(f);
  for (const field of popup.fields || []) {
    if (field === popup.title_field || parts.length >= 3) continue;
    const v = f.properties?.[field];
    if (v === null || v === undefined || v === '') continue;
    const s = String(v).trim();
    // Ni le texte descriptif (il est fourni entier ailleurs et doit rester
    // citable tel quel), ni une valeur longue : le contexte est un repère court.
    if (s === text || s.length > 40 || parts.includes(s)) continue;
    parts.push(s);
  }
  return parts.slice(0, 3).join(' · ');
}

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
  dg.abortCtrl?.abort(); // une analyse en cours ne doit jamais se rattacher à la nouvelle zone
  const { features: all, polygon } = resolveSelection(screenPoints);
  const { features, context } = _partitionSelection(all);
  // Emprise et surface du périmètre tracé, même sans observation.
  const bbox = geometryBbox(polygon);
  // Une zone vide reste une sélection : le panneau explique quoi faire.
  dg.selection = { features, context, polygon, bbox, areaKm2: polygonAreaKm2(polygon) };
  dg.analysis = null;
  dg.aiSample = null;
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
  dg.abortCtrl?.abort();
  const all = selectInRing(ring);
  const { features, context } = _partitionSelection(all);
  const bbox = geometryBbox(dg.selection.polygon);
  dg.selection = { ...dg.selection, features, context, bbox, areaKm2: polygonAreaKm2(dg.selection.polygon) };
  dg.analysis = null;
  dg.aiSample = null;
  renderSelection(dg.selection);
  setAnalysisBadge(features.length);
  renderAnalysisPanel();
}

export function clearSelection() {
  dg.selection = null;
  dg.analysis = null;
  dg.aiSample = null;
  dg.abortCtrl?.abort();
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

function _zoneStats(features) {
  const rows = _breakdown(features);
  const lines = rows.map((r) => `- ${r.layer.label} : ${r.count}`);
  lines.push(`Total : ${features.length} points.`);
  // Valeurs fréquentes des champs de catégorisation (générique, par couche).
  for (const r of rows) {
    const field = r.layer.style?.category_field;
    if (!field) continue;
    const counts = new Map();
    for (const f of features) {
      if (f.__layerId !== r.layer.id) continue;
      const v = f.properties?.[field];
      if (v === null || v === undefined || v === '') continue;
      counts.set(String(v), (counts.get(String(v)) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) lines.push(`Valeurs fréquentes « ${field} » (${r.layer.label}) : ${top.map(([v, n]) => `${v} (${n})`).join(', ')}`);
  }
  return { text: lines.join('\n'), rows };
}

/**
 * Chiffres de zone des couches de référence : pour chaque couche ayant au
 * moins une entité dans la zone, son décompte et les agrégats configurés,
 * calculés ici - le modèle ne les produit jamais.
 * @returns {Array<{id, label, color, count, ai_context, metrics: Array<{field, agg, value, n}>}>}
 */
function _contextStats(context) {
  const byLayer = new Map();
  for (const f of context || []) {
    if (!byLayer.has(f.__layerId)) byLayer.set(f.__layerId, []);
    byLayer.get(f.__layerId).push(f);
  }
  const rows = [];
  for (const [id, feats] of byLayer) {
    const layer = dg.layers.find((l) => l.id === id);
    if (!layer) continue;
    rows.push({
      id,
      label: layer.label,
      color: safeColor(layer.style?.color),
      count: feats.length,
      ai_context: layer.ai_context || '',
      metrics: aggregateMetrics(feats, layerMetrics(layer)),
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

/**
 * Contrat historique : ordonne les points à la ronde entre couches, dans la
 * limite fournie. Le dossier utilise désormais son propre découpage par lots.
 */
function _orderedPoints(features, cap) {
  const groups = new Map();
  for (const f of features) {
    if (!groups.has(f.__layerId)) groups.set(f.__layerId, []);
    groups.get(f.__layerId).push(f);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => (_textOf(b) ? 1 : 0) - (_textOf(a) ? 1 : 0));
  }
  const out = [];
  const keys = [...groups.keys()];
  while (out.length < cap) {
    let added = false;
    for (const k of keys) {
      const arr = groups.get(k);
      if (arr.length) {
        out.push(arr.shift());
        added = true;
        if (out.length >= cap) break;
      }
    }
    if (!added) break;
  }
  return out;
}

/* ── Fusion du résultat IA avec les décomptes ──────────────────── */

/**
 * Construit la liste des sources du rapport. La liste, l'ordre et tous les
 * décomptes viennent des données : TOUTE couche ayant au moins un point dans
 * la zone y figure, que le modèle l'ait traitée ou non. L'IA n'apporte que la
 * prose, et chacune de ses affirmations est recadrée sur la source qui possède
 * réellement les points cités.
 */
function _mergeCouches(result, rows, sampled, codeOf) {
  // Indice de point → identifiant de la couche qui le possède.
  const ownerOf = new Map();
  sampled.forEach((f, i) => ownerOf.set(i + 1, f.__layerId));
  const byCode = new Map([...codeOf.entries()].map(([layerId, code]) => [code, layerId]));

  // Un sujet est rattaché à la source qui possède la majorité de ses points,
  // pas à celle que le modèle a déclarée : une erreur d'étiquette ne doit pas
  // détruire un sujet correctement rédigé.
  const sujetsByLayer = new Map();
  const syntheseByLayer = new Map();
  for (const c of Array.isArray(result?.couches) ? result.couches : []) {
    const declared = byCode.get(String(c?.couche || '').trim());
    const synthese = String(c?.synthese || '').trim();
    // Plusieurs entrées pour une même source (le modèle scinde parfois) :
    // on les cumule au lieu de ne garder que la première.
    if (declared && synthese) {
      const prev = syntheseByLayer.get(declared);
      syntheseByLayer.set(declared, prev ? `${prev} ${synthese}` : synthese);
    }
    for (const su of Array.isArray(c?.sujets) ? c.sujets : []) {
      const sujet = String(su?.sujet || '').trim();
      if (!sujet) continue;
      const refs = [...new Set((Array.isArray(su?.refs) ? su.refs : []).filter((n) => ownerOf.has(n)))];
      if (!refs.length) continue;
      const tally = new Map();
      for (const n of refs) {
        const owner = ownerOf.get(n);
        tally.set(owner, (tally.get(owner) || 0) + 1);
      }
      const owner = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (!sujetsByLayer.has(owner)) sujetsByLayer.set(owner, []);
      sujetsByLayer.get(owner).push({
        sujet,
        refs: refs.filter((n) => ownerOf.get(n) === owner),
        verbatims: (Array.isArray(su?.verbatims) ? su.verbatims : [])
          .map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
      });
    }
  }

  return rows.map((r) => {
    const points = sampled.filter((f) => f.__layerId === r.layer.id);
    return {
      id: r.layer.id,
      label: r.layer.label,
      color: safeColor(r.layer.style?.color),
      count: r.count,
      synthese: syntheseByLayer.get(r.layer.id) || '',
      sujets: (sujetsByLayer.get(r.layer.id) || []).sort((a, b) => b.refs.length - a.refs.length),
      // Calculé, jamais déduit d'une absence de sujet : c'est ce qui permet de
      // dire la vérité sur une source que le modèle a laissée de côté.
      hasText: points.some((f) => _textOf(f)),
      // Repli déterministe : la source reste traitée même sans sujet.
      apercu: points.filter((f) => _textOf(f)).slice(0, 8)
        .map((f) => ({ label: _titleOf(f), texte: _textOf(f) })),
    };
  });
}

/**
 * Surface de vérification des chiffres du rapport.
 *
 * Ces fonctions portent l'intégralité des décomptes et le recalage des sujets
 * sur leur source réelle. Sans cette exposition, elles ne seraient atteignables
 * qu'en passant par un appel IA complet, donc jamais vérifiées : un décompte
 * faux ne se voit pas, le rapport reste plausible. Rien d'autre ne les importe.
 */
export const _internals = {
  textOf: _textOf,
  titleOf: _titleOf,
  extraOf: _extraOf,
  breakdown: _breakdown,
  zoneStats: _zoneStats,
  orderedPoints: _orderedPoints,
  mergeCouches: _mergeCouches,
  partitionSelection: _partitionSelection,
  contextStats: _contextStats,
};

/** L’ouverture du dossier lance la lecture des témoignages disponibles. */
export function renderAnalysisPanel() {
  const panel = dg.container?.querySelector('#dg-panel-analyse');
  if (!panel) return;
  const selection = dg.selection;
  if (!selection) {
    panel.innerHTML = `<div class="dg-empty"><i class="fa-solid fa-draw-polygon dg-empty__icon"></i><div class="dg-empty__title">Un dossier pour comprendre votre secteur</div><p class="dg-empty__text">Sélectionnez une zone sur la carte. Ses témoignages seront analysés pour préparer une synthèse documentée et un rapport à partager.</p></div>`;
    return;
  }
  const all = [...selection.features, ...(selection.context || [])];
  const rows = _breakdown(all);
  const readable = selection.features.filter((f) => observationText(f, _layerOf(f))).length;
  const hasTestimonies = readable > 0;
  /* La taille de la zone est jugée ICI, avant le premier appel, et non
     découverte à la fin sur un dossier aux trois quarts fait. Au-delà du budget
     prévu on prévient sans empêcher : la génération ira au bout sous le
     plafond. Seule une zone qui dépasserait le plafond lui-même ne se lance
     pas. Aucun montant n'est affiché : la consigne suffit. */
  const estimate = estimateAnalysisMicro(readable);
  const tooLarge = estimate > HARD_LIMIT_MICRO;
  const consigne = 'Sélectionnez une zone plus petite ou masquez les sources inutiles dans l’onglet Couches.';
  const costNote = !hasTestimonies ? ''
    : tooLarge ? `<p class="dg-dossier-warn">Cette zone contient ${_fmt(readable)} textes, trop pour un seul dossier. ${consigne}</p>`
    : estimate > EXPECTED_BUDGET_MICRO ? `<p class="dg-dossier-warn">Cette zone contient ${_fmt(readable)} textes, c’est beaucoup pour un seul dossier. ${consigne}</p>`
    : '';
  panel.innerHTML = `
    <div class="dg-sel-status"><i class="fa-solid fa-vector-square"></i><span>Zone de <b>${_fmtKm2(selection.areaKm2)} km²</b></span><button type="button" class="dg-sel-clear" id="dg-sel-clear" aria-label="Effacer la sélection"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dg-dossier-intro"><h3>Le dossier de cette zone</h3><p>${!all.length ? 'Aucune donnée visible dans ce périmètre. Vous pourrez documenter ce qui manque et ajouter vos observations.' : `${_fmt(selection.features.length)} observation${selection.features.length > 1 ? 's' : ''} et ${rows.length} source${rows.length > 1 ? 's' : ''} pour comprendre ce secteur.`}</p>
    ${hasTestimonies ? `<p>Les témoignages seront analysés automatiquement avant la préparation du rapport.</p>${costNote}<label class="adm-label" for="dg-study-objective">Objet de l’étude (facultatif)</label><input class="adm-input" id="dg-study-objective" maxlength="500" placeholder="Par exemple : préparer une visite avec une poussette.">` : ''}
    <button type="button" class="dg-analyze-btn" id="dg-analyze" ${tooLarge ? 'disabled' : ''}><i class="fa-solid fa-file-lines"></i> ${hasTestimonies ? 'Analyser la zone' : 'Ouvrir le dossier de zone'}</button>
    ${rows.length ? `<details class="dg-selection-sources"><summary>Voir les sources retenues</summary><dl>${rows.map(({ layer, count }) => `<div><dt>${esc(layer.label)}</dt><dd>${_fmt(count)}</dd></div>`).join('')}</dl></details>` : ''}</div>`;
  panel.querySelector('#dg-sel-clear').addEventListener('click', clearSelection);
  panel.querySelector('#dg-analyze').addEventListener('click', (event) => openReport(event.currentTarget));
}
