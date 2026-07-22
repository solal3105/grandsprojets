/**
 * Diagnostic terrain — onglet Analyse.
 * Les nombres sont calculés ici (ventilation par couche, décompte des points
 * par sujet) ; l'IA (via /api/ai-diagnostic) ne fait que lire le texte des
 * points et le regrouper par sujet, en citant. Aucune note, aucun jugement.
 */

import { store } from '../../store.js';
import { esc, escAttr } from '../../components/ui.js';
import { dg, safeColor, MAX_ANALYSIS_POINTS } from './state.js';
import { featuresBbox, bboxAreaKm2, geometryBbox } from './data.js';
import { resolveSelection, selectInRing, renderSelection, setHover, fitFeatures } from './map.js';
import { setAnalysisBadge, showTab } from './panel.js';
import { openReport } from './report.js';

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
 * description, et reléguerait le vrai texte dans le contexte — où il serait
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
 * jusqu'à 2 champs popup courts (rue, commune, date…) — piloté par la config.
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

/** Reçoit le polygone écran du lasso, résout et affiche la sélection. */
export function handleSelection(screenPoints) {
  dg.abortCtrl?.abort(); // une analyse en cours ne doit jamais se rattacher à la nouvelle zone
  const { features, polygon } = resolveSelection(screenPoints);
  // Emprise des points retenus — à défaut, celle du polygone tracé (zone vide).
  const bbox = featuresBbox(features) || geometryBbox(polygon);
  // Une zone vide reste une sélection : le panneau explique quoi faire.
  dg.selection = { features, polygon, bbox, areaKm2: bboxAreaKm2(bbox) };
  dg.analysis = null;
  dg.aiSample = null;
  renderSelection(dg.selection);
  setAnalysisBadge(features.length);
  renderAnalysisPanel();
  showTab('analyse');
  if (features.length) fitFeatures(features);
}

/**
 * Recalcule la sélection sur la zone déjà tracée : appelé quand les couches
 * visibles changent (affichage, suppression). Masquer une couche allège donc
 * immédiatement la sélection — c'est le levier pour repasser sous le plafond.
 * Posé sur dg.onSelectionStale par diagnostic.js (évite un import circulaire).
 */
export function refreshSelection() {
  const ring = dg.selection?.polygon?.coordinates?.[0];
  if (!ring) return;
  dg.abortCtrl?.abort();
  const features = selectInRing(ring);
  const bbox = featuresBbox(features) || geometryBbox(dg.selection.polygon);
  dg.selection = { ...dg.selection, features, bbox, areaKm2: bboxAreaKm2(bbox) };
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
 * Ordonne les points à la ronde entre couches : la liste envoyée à l'IA reste
 * équilibrée d'un bout à l'autre. Tous les points sont transmis — le plafond
 * MAX_ANALYSIS_POINTS garantit que la liste tient dans la requête.
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

/* ── Appel IA ──────────────────────────────────────────────────── */

async function _runAnalysis() {
  const sel = dg.selection;
  if (!sel || !sel.features.length || sel.features.length > MAX_ANALYSIS_POINTS) return;
  const panel = dg.container?.querySelector('#dg-panel-analyse');
  if (!panel) return;

  const stats = _zoneStats(sel.features);
  // Intégralité des points de la zone, ordonnés à la ronde entre couches.
  const sampled = _orderedPoints(sel.features, MAX_ANALYSIS_POINTS);
  dg.aiSample = sampled;

  const body = {
    ville: store.city,
    zone: { area_km2: Math.round(sel.areaKm2 * 100) / 100, point_count: sel.features.length },
    stats: stats.text,
    layers: stats.rows.map((r) => ({
      label: r.layer.label,
      ai_context: r.layer.ai_context,
      count: r.count,
    })),
    sample: sampled.map((f, i) => ({
      i: i + 1,
      layer: _layerOf(f)?.label || '',
      label: _titleOf(f),
      text: _textOf(f),
      extra: _extraOf(f),
    })),
  };

  _renderLoading(panel);
  dg.abortCtrl?.abort();
  dg.abortCtrl = new AbortController();

  try {
    const res = await fetch('/api/ai-diagnostic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(store.session?.access_token ? { 'Authorization': `Bearer ${store.session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: dg.abortCtrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    // Le serveur streame le JSON du diagnostic en SSE ({content} … [DONE]).
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let streamError = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) fullText += parsed.content;
          if (parsed.error) streamError = parsed.error;
        } catch { /* fragment non JSON, ignoré */ }
      }
    }
    if (streamError) throw new Error(streamError);
    if (!fullText.trim()) throw new Error('Réponse vide');
    if (dg.selection !== sel) return; // la zone a changé pendant le stream : résultat obsolète

    const result = JSON.parse(fullText);
    // Le décompte n'est jamais celui annoncé par l'IA : il est déduit des
    // points réellement référencés, après élimination des indices invalides.
    const sujets = (Array.isArray(result.sujets) ? result.sujets : [])
      .map((s) => ({
        sujet: String(s?.sujet || '').trim(),
        refs: [...new Set((Array.isArray(s?.refs) ? s.refs : [])
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= sampled.length))],
        verbatims: (Array.isArray(s?.verbatims) ? s.verbatims : [])
          .map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
      }))
      .filter((s) => s.sujet && s.refs.length)
      .sort((a, b) => b.refs.length - a.refs.length);

    dg.analysis = {
      resume: String(result.resume || ''),
      sujets,
      statsTxt: stats.text,
      rows: stats.rows.map((r) => ({ label: r.layer.label, color: safeColor(r.layer.style?.color), count: r.count })),
      pointCount: sel.features.length,
    };
    renderAnalysisPanel();
  } catch (err) {
    if (err.name === 'AbortError' || dg.selection !== sel) return;
    console.error('[admin/diagnostic] Analyse IA:', err);
    _renderError(panel, err.message || 'Erreur inconnue');
  }
}

/* ── Rendu de l'onglet ─────────────────────────────────────────── */

/** Rend l'onglet Analyse selon l'état : vide / sélection / résultats. */
export function renderAnalysisPanel() {
  const panel = dg.container?.querySelector('#dg-panel-analyse');
  if (!panel) return;
  if (dg.analysis) { _renderResults(panel); return; }
  if (dg.selection) { _renderSelectionView(panel); return; }
  panel.innerHTML = `
    <div class="dg-empty">
      <i class="fa-solid fa-draw-polygon dg-empty__icon"></i>
      <div class="dg-empty__title">Aucune zone sélectionnée</div>
      <div class="dg-empty__text">Cliquez sur <b>Sélectionner une zone</b> (ou maintenez <b>Maj</b>) puis entourez les points à analyser sur la carte.</div>
    </div>
  `;
}

function _breakdownHtml(features) {
  const rows = _breakdown(features);
  if (!rows.length) return '';
  const max = rows[0].count;
  return `<ul class="dg-break">${rows.map((r) => {
    const color = escAttr(safeColor(r.layer.style?.color));
    return `
    <li class="dg-brow">
      <span class="dg-bdot" style="background:${color}"></span>
      <span class="dg-bname">${esc(r.layer.label)}</span>
      <span class="dg-bcount">${_fmt(r.count)}</span>
      <span class="dg-btrack"><span class="dg-bfill" style="width:${Math.max(6, Math.round(r.count / max * 100))}%;background:${color}"></span></span>
    </li>`;
  }).join('')}</ul>`;
}

function _renderSelectionView(panel) {
  const sel = dg.selection;
  const n = sel.features.length;
  const tooMany = n > MAX_ANALYSIS_POINTS;

  let body;
  if (n === 0) {
    body = `
      <div class="dg-empty">
        <i class="fa-solid fa-magnifying-glass-location dg-empty__icon"></i>
        <div class="dg-empty__text">Aucun point des couches visibles dans cette zone. Élargissez la sélection ou activez d'autres couches.</div>
      </div>`;
  } else if (tooMany) {
    // L'analyse lit l'intégralité des points : au-delà du plafond, elle serait
    // un sondage. On montre le poids de chaque couche pour guider l'allègement.
    body = `
      <div class="dg-over">
        <div class="dg-over__title"><i class="fa-solid fa-circle-exclamation"></i> Zone trop large pour être analysée</div>
        <div class="dg-over__text">
          L'analyse lit <b>tous</b> les points de la zone, dans la limite de ${_fmt(MAX_ANALYSIS_POINTS)}.
          Resserrez la sélection autour d'un carrefour ou d'un tronçon, ou masquez des couches ci-dessous
          — le décompte se met à jour aussitôt.
        </div>
      </div>
      ${_breakdownHtml(sel.features)}
      <button type="button" class="dg-analyze-btn" id="dg-analyze" disabled>
        <i class="fa-solid fa-wand-magic-sparkles"></i> ${_fmt(n)} points — maximum ${_fmt(MAX_ANALYSIS_POINTS)}
      </button>`;
  } else {
    body = `
      ${_breakdownHtml(sel.features)}
      <button type="button" class="dg-analyze-btn" id="dg-analyze">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Analyser la zone
      </button>
      <div class="adm-form-hint dg-analyze-hint">L'IA lit l'intégralité des ${_fmt(n)} points sélectionnés et en tire des constats sourcés — chaque constat renvoie aux points qui le justifient.</div>`;
  }

  panel.innerHTML = `
    <div class="dg-sel-status${tooMany ? ' dg-sel-status--over' : ''}">
      <i class="fa-solid fa-vector-square"></i>
      <span><b>${_fmt(n)}</b> point${n > 1 ? 's' : ''} dans la zone (~${_fmtKm2(sel.areaKm2)} km²)</span>
      <button type="button" class="dg-sel-clear" id="dg-sel-clear" title="Effacer la sélection"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${body}
  `;
  panel.querySelector('#dg-sel-clear')?.addEventListener('click', clearSelection);
  panel.querySelector('#dg-analyze')?.addEventListener('click', _runAnalysis);
}

function _renderLoading(panel) {
  panel.innerHTML = `
    <div class="dg-loading">
      <div class="adm-skeleton dg-skel dg-skel--bar"></div>
      <div class="adm-skeleton dg-skel dg-skel--line"></div>
      <div class="adm-skeleton dg-skel dg-skel--card"></div>
      <div class="adm-skeleton dg-skel dg-skel--card"></div>
      <div class="dg-loading__txt"><i class="fa-solid fa-wand-magic-sparkles"></i> Analyse de la zone en cours…</div>
    </div>
  `;
}

function _renderError(panel, message) {
  panel.innerHTML = `
    <div class="dg-empty">
      <i class="fa-solid fa-triangle-exclamation dg-empty__icon" style="color:var(--color-danger)"></i>
      <div class="dg-empty__title">Analyse indisponible</div>
      <div class="dg-empty__text">${esc(message)}</div>
      <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="dg-retry"><i class="fa-solid fa-rotate"></i> Réessayer</button>
    </div>
  `;
  panel.querySelector('#dg-retry')?.addEventListener('click', _runAnalysis);
}

function _renderResults(panel) {
  const a = dg.analysis;
  const n = a.pointCount || 0;
  const nb = a.sujets.length;

  panel.innerHTML = `
    <div class="dg-rbar">
      <span class="dg-rbar__meta"><b>${_fmt(n)}</b> point${n > 1 ? 's' : ''} lu${n > 1 ? 's' : ''} · ${nb} sujet${nb > 1 ? 's' : ''}</span>
      <span class="dg-rbar__spacer"></span>
      <button type="button" class="dg-rbar__btn" id="dg-re" title="Relancer l'analyse"><i class="fa-solid fa-rotate"></i></button>
      <button type="button" class="dg-rbar__btn" id="dg-cl" title="Fermer l'analyse"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${a.resume ? `<div class="dg-resume">${esc(a.resume)}</div>` : ''}
    <div class="dg-section-label">Répartition des points</div>
    ${_rowsHtml(a.rows)}
    <div class="dg-section-label">Ce que disent les points</div>
    <div class="dg-icards" id="dg-icards"></div>
    <button type="button" class="dg-report-btn" id="dg-report">
      <i class="fa-solid fa-file-lines"></i> Générer le rapport de zone
    </button>
  `;

  panel.querySelector('#dg-re')?.addEventListener('click', _runAnalysis);
  panel.querySelector('#dg-cl')?.addEventListener('click', () => {
    dg.analysis = null;
    renderAnalysisPanel();
  });
  panel.querySelector('#dg-report')?.addEventListener('click', (e) => openReport(e.currentTarget));

  const cards = panel.querySelector('#dg-icards');
  if (!a.sujets.length) {
    cards.innerHTML = '<div class="dg-empty__text" style="text-align:center;padding:14px;">Les points de cette zone ne portent aucun texte exploitable — seuls les décomptes ci-dessus sont disponibles.</div>';
  } else {
    for (const sujet of a.sujets) cards.appendChild(_sujetCard(sujet));
  }
}

/** Barres de répartition par couche (données calculées, pas issues de l'IA). */
function _rowsHtml(rows) {
  if (!rows?.length) return '';
  const max = rows[0].count;
  return `<ul class="dg-break">${rows.map((r) => `
    <li class="dg-brow">
      <span class="dg-bdot" style="background:${escAttr(r.color)}"></span>
      <span class="dg-bname">${esc(r.label)}</span>
      <span class="dg-bcount">${_fmt(r.count)}</span>
      <span class="dg-btrack"><span class="dg-bfill" style="width:${Math.max(6, Math.round(r.count / max * 100))}%;background:${escAttr(r.color)}"></span></span>
    </li>`).join('')}</ul>`;
}

function _sujetCard(sujet) {
  const feats = sujet.refs.map((num) => dg.aiSample?.[num - 1]).filter(Boolean);
  const n = sujet.refs.length;
  const card = document.createElement('div');
  card.className = 'dg-sujet';
  card.innerHTML = `
    <div class="dg-sujet__head">
      <span class="dg-sujet__title">${esc(sujet.sujet)}</span>
      <span class="dg-sujet__count">${_fmt(n)} point${n > 1 ? 's' : ''}</span>
    </div>
    <div class="dg-ins__refs"></div>
    ${sujet.verbatims.map((v) => `<div class="dg-ins__verb">« ${esc(v)} »</div>`).join('')}
  `;
  const refsWrap = card.querySelector('.dg-ins__refs');
  for (const num of sujet.refs.slice(0, 12)) {
    const f = dg.aiSample?.[num - 1];
    if (!f) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dg-ref';
    chip.textContent = `#${num}`;
    chip.title = _titleOf(f);
    chip.addEventListener('mouseenter', () => setHover([f]));
    chip.addEventListener('mouseleave', () => setHover([]));
    chip.addEventListener('click', () => {
      dg.map?.easeTo({ center: f.__pt, zoom: Math.max(dg.map.getZoom(), 16), duration: 400 });
    });
    refsWrap.appendChild(chip);
  }
  if (sujet.refs.length > 12) {
    const more = document.createElement('span');
    more.className = 'dg-ref dg-ref--more';
    more.textContent = `+${sujet.refs.length - 12}`;
    more.title = 'Autres points de ce sujet';
    refsWrap.appendChild(more);
  }
  if (feats.length) {
    card.addEventListener('mouseenter', () => setHover(feats));
    card.addEventListener('mouseleave', () => setHover([]));
  }
  return card;
}
