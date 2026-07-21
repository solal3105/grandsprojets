/**
 * Diagnostic terrain — onglet Analyse.
 * Le déterministe (ventilation, corrélations spatiales, score de zone,
 * échantillonnage) est calculé ici ; l'IA (via /api/ai-diagnostic) ne fait
 * que synthétiser ces faits en constats sourcés.
 */

import { store } from '../../store.js';
import { esc, escAttr } from '../../components/ui.js';
import { dg, LEVEL_COLORS, SEVERITY_COLORS, safeColor } from './state.js';
import { distanceM, featuresBbox, bboxAreaKm2, geometryBbox } from './data.js';
import { resolveSelection, renderSelection, setHover, fitFeatures } from './map.js';
import { setAnalysisBadge, showTab } from './panel.js';
import { openReport } from './report.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const CORRELATION_RADIUS_M = 60;
const SAMPLE_SIZE = 40; // aligné sur le plafond serveur (MAX_SAMPLE)

const _layerOf = (f) => dg.layers.find((l) => l.id === f.__layerId);
const _polarityOf = (f) => _layerOf(f)?.polarity || 'neutre';

/* ── Extraction de texte (pilotée par la config popup des couches) ── */

function _titleOf(f) {
  const layer = _layerOf(f);
  const field = layer?.popup?.title_field;
  const v = field ? f.properties?.[field] : null;
  return (v !== null && v !== undefined && v !== '') ? String(v) : (layer?.label || 'Point');
}

function _textOf(f) {
  const layer = _layerOf(f);
  const popup = layer?.popup || {};
  for (const field of popup.fields || []) {
    if (field === popup.title_field) continue;
    const v = f.properties?.[field];
    if (typeof v === 'string' && v.trim().length > 12) return v.trim();
  }
  return '';
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
    const s = String(v).trim().slice(0, 40);
    if (s === text.slice(0, 40) || parts.includes(s)) continue;
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
 * Une couche vient d'être supprimée : purge ses features de la sélection
 * et invalide l'analyse (les statistiques ne sont plus valables).
 * Posé sur dg.onLayerRemoved par diagnostic.js (évite un import circulaire).
 */
export function removeLayerFromSelection(layerId) {
  if (!dg.selection) return;
  const kept = dg.selection.features.filter((f) => f.__layerId !== layerId);
  if (kept.length === dg.selection.features.length) return;
  dg.abortCtrl?.abort();
  const bbox = featuresBbox(kept);
  dg.selection = { ...dg.selection, features: kept, bbox, areaKm2: bboxAreaKm2(bbox) };
  dg.analysis = null;
  dg.aiSample = null;
  renderSelection(dg.selection);
  setAnalysisBadge(kept.length);
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
  let neg = 0, pos = 0;
  for (const f of features) {
    const p = _polarityOf(f);
    if (p === 'negatif') neg++;
    else if (p === 'positif') pos++;
  }
  const lines = rows.map((r) => `- ${r.layer.label} : ${r.count}`);
  lines.push(`Total : ${features.length} points (${neg} négatifs / ${pos} positifs).`);
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
  return { text: lines.join('\n'), neg, pos, rows };
}

/** Co-occurrences spatiales entre couches négatives distinctes (< 60 m). */
function _correlations(features) {
  const CAP = 500; // borne le coût quadratique sur les grosses sélections
  const negByLayer = new Map();
  for (const f of features) {
    if (_polarityOf(f) !== 'negatif') continue;
    if (!negByLayer.has(f.__layerId)) negByLayer.set(f.__layerId, []);
    const arr = negByLayer.get(f.__layerId);
    if (arr.length < CAP) arr.push(f);
  }
  const ids = [...negByLayer.keys()];
  const entries = [];
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = negByLayer.get(ids[i]);
      const b = negByLayer.get(ids[j]);
      let count = 0;
      for (const fa of a) {
        if (b.some((fb) => distanceM(fa.__pt, fb.__pt) <= CORRELATION_RADIUS_M)) count++;
      }
      if (count > 0) {
        const la = dg.layers.find((l) => l.id === ids[i])?.label;
        const lb = dg.layers.find((l) => l.id === ids[j])?.label;
        entries.push({ count, line: `${count} point(s) « ${la} » à moins de ${CORRELATION_RADIUS_M} m d'un point « ${lb} ».` });
        total += count;
      }
    }
  }
  // De la plus forte à la plus faible : l'IA doit exploiter les majeures d'abord
  entries.sort((a, b) => b.count - a.count);
  return { text: entries.map((e) => e.line).join('\n'), total };
}

/** Niveau de vigilance de la zone — purement déterministe. */
function _zoneLevel(stats, correlations, totalCount) {
  const negShare = totalCount ? stats.neg / totalCount : 0;
  const score = negShare + (correlations.total > 0 ? 0.12 : 0) + (correlations.total >= 5 ? 0.1 : 0);
  if (score < 0.3) return 'Faible';
  if (score < 0.5) return 'Modéré';
  if (score < 0.7) return 'Élevé';
  return 'Critique';
}

/** Échantillon stratifié : équilibre entre couches, priorité aux points textés. */
function _stratifiedSample(features, cap) {
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
  if (!sel || !sel.features.length) return;
  const panel = dg.container?.querySelector('#dg-panel-analyse');
  if (!panel) return;

  const stats = _zoneStats(sel.features);
  const correlations = _correlations(sel.features);
  const level = _zoneLevel(stats, correlations, sel.features.length);
  const sampled = _stratifiedSample(sel.features, SAMPLE_SIZE);
  dg.aiSample = sampled;

  const body = {
    ville: store.city,
    zone: { area_km2: Math.round(sel.areaKm2 * 100) / 100, point_count: sel.features.length },
    stats: stats.text,
    correlations: correlations.text,
    layers: stats.rows.map((r) => ({
      label: r.layer.label,
      polarity: r.layer.polarity,
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
    const insights = (Array.isArray(result.insights) ? result.insights : [])
      .filter((ins) => ins && String(ins.titre || '').trim())
      .map((ins) => ({
        ...ins,
        gravite: Math.max(1, Math.min(5, Math.round(Number(ins.gravite) || 1))),
        refs: (Array.isArray(ins.refs) ? ins.refs : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= sampled.length),
        verbatims: (Array.isArray(ins.verbatims) ? ins.verbatims : []).map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
      }))
      .sort((a, b) => b.gravite - a.gravite);

    dg.analysis = {
      resume: String(result.resume || ''),
      insights,
      level,
      statsTxt: stats.text,
      corrTxt: correlations.text,
      stats: { neg: stats.neg, pos: stats.pos, correlations: correlations.total },
    };
    dg.insightFilter = 'all';
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
  panel.innerHTML = `
    <div class="dg-sel-status">
      <i class="fa-solid fa-vector-square"></i>
      <span><b>${_fmt(n)}</b> point${n > 1 ? 's' : ''} dans la zone (~${_fmtKm2(sel.areaKm2)} km²)</span>
      <button type="button" class="dg-sel-clear" id="dg-sel-clear" title="Effacer la sélection"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${n === 0 ? `
    <div class="dg-empty">
      <i class="fa-solid fa-magnifying-glass-location dg-empty__icon"></i>
      <div class="dg-empty__text">Aucun point des couches visibles dans cette zone. Élargissez la sélection ou activez d'autres couches.</div>
    </div>` : `
    ${_breakdownHtml(sel.features)}
    <button type="button" class="dg-analyze-btn" id="dg-analyze">
      <i class="fa-solid fa-wand-magic-sparkles"></i> Analyser la zone
    </button>
    <div class="adm-form-hint dg-analyze-hint">L'IA synthétise les signaux en constats sourcés — chaque constat renvoie aux points qui le justifient.</div>`}
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
  const n = dg.selection?.features.length || 0;
  const levelColor = LEVEL_COLORS[a.level] || '#64748B';
  const counts = {
    all: a.insights.length,
    neg: a.insights.filter((i) => i.polarite === 'negatif').length,
    pos: a.insights.filter((i) => i.polarite === 'positif').length,
  };
  const filters = [['all', 'Tout', counts.all], ['neg', 'Négatifs', counts.neg], ['pos', 'Positifs', counts.pos]];

  let list = a.insights;
  if (dg.insightFilter === 'neg') list = list.filter((i) => i.polarite === 'negatif');
  else if (dg.insightFilter === 'pos') list = list.filter((i) => i.polarite === 'positif');

  panel.innerHTML = `
    <div class="dg-rbar">
      <span class="dg-level" style="background:${esc(levelColor)}">Zone ${esc(a.level)}</span>
      <span class="dg-rbar__meta">${_fmt(n)} pts · ${counts.all} constat${counts.all > 1 ? 's' : ''}</span>
      <span class="dg-rbar__spacer"></span>
      <button type="button" class="dg-rbar__btn" id="dg-re" title="Relancer l'analyse"><i class="fa-solid fa-rotate"></i></button>
      <button type="button" class="dg-rbar__btn" id="dg-cl" title="Fermer l'analyse"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${a.resume ? `<div class="dg-resume">${esc(a.resume)}</div>` : ''}
    ${a.corrTxt ? a.corrTxt.split('\n').map((l) => `<div class="dg-corr-chip"><i class="fa-solid fa-link"></i>${esc(l)}</div>`).join('') : ''}
    <div class="dg-ifilters">${filters.map(([k, label, c]) =>
      `<button type="button" class="dg-ifilter ${dg.insightFilter === k ? 'is-active' : ''}" data-filter="${k}">${label} <span>${c}</span></button>`).join('')}
    </div>
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
  panel.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dg.insightFilter = btn.dataset.filter;
      renderAnalysisPanel();
    });
  });
  panel.querySelector('#dg-report')?.addEventListener('click', (e) => openReport(e.currentTarget));

  const cards = panel.querySelector('#dg-icards');
  if (!list.length) {
    cards.innerHTML = '<div class="dg-empty__text" style="text-align:center;padding:14px;">Aucun constat pour ce filtre.</div>';
  } else {
    for (const ins of list) cards.appendChild(_insightCard(ins));
  }
}

function _insightCard(ins) {
  const sev = SEVERITY_COLORS[ins.gravite] || SEVERITY_COLORS[1];
  const refFeatures = ins.refs.map((num) => dg.aiSample?.[num - 1]).filter(Boolean);
  const card = document.createElement('div');
  card.className = 'dg-ins';
  card.innerHTML = `
    <span class="dg-ins__bar" style="background:${esc(sev)}"></span>
    <div class="dg-ins__body">
      <div class="dg-ins__head">
        <span class="dg-ins__cat">${esc(ins.categorie || 'Constat')}</span>
        <span class="dg-ins__sev" style="background:${esc(sev)}">Gravité ${ins.gravite}</span>
        <span class="dg-ins__conf"><i class="fa-solid fa-shield-halved"></i> ${esc(ins.confiance || '—')}</span>
      </div>
      <div class="dg-ins__title">${esc(ins.titre)}</div>
      ${ins.correlation ? `<div class="dg-ins__corr"><i class="fa-solid fa-link"></i> ${esc(ins.correlation)}</div>` : ''}
      <div class="dg-ins__refs"></div>
      ${ins.verbatims.map((v) => `<div class="dg-ins__verb">« ${esc(v)} »</div>`).join('')}
      ${ins.piste ? `<div class="dg-ins__piste"><span class="dg-ins__piste-label"><i class="fa-solid fa-compass-drafting"></i> Piste à explorer</span>${esc(ins.piste)}</div>` : ''}
    </div>
  `;
  const refsWrap = card.querySelector('.dg-ins__refs');
  for (const num of ins.refs.slice(0, 8)) {
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
  if (refFeatures.length) {
    card.addEventListener('mouseenter', () => setHover(refFeatures));
    card.addEventListener('mouseleave', () => setHover([]));
  }
  return card;
}
