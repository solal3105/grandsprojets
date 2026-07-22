/**
 * Diagnostic terrain — onglet Analyse.
 * Les nombres sont calculés ici (répartition par source, décompte des points
 * par sujet) ; l'IA (via /api/ai-diagnostic) ne fait que restituer, source par
 * source, ce que disent les points, en citant. Aucune note, aucun jugement.
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
    // La liste des sources et tous les décomptes viennent des données ; l'IA
    // n'apporte que la prose, et ses références sont recadrées sur la source.
    const byLabel = new Map();
    for (const c of Array.isArray(result.couches) ? result.couches : []) {
      const key = String(c?.couche || '').trim();
      if (key && !byLabel.has(key)) byLabel.set(key, c);
    }
    const couches = stats.rows.map((r) => {
      const ai = byLabel.get(r.layer.label);
      const owned = new Set();
      sampled.forEach((f, i) => { if (f.__layerId === r.layer.id) owned.add(i + 1); });
      const sujets = (Array.isArray(ai?.sujets) ? ai.sujets : [])
        .map((su) => ({
          sujet: String(su?.sujet || '').trim(),
          refs: [...new Set((Array.isArray(su?.refs) ? su.refs : []).filter((n) => owned.has(n)))],
          verbatims: (Array.isArray(su?.verbatims) ? su.verbatims : [])
            .map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
        }))
        .filter((su) => su.sujet && su.refs.length)
        .sort((a, b) => b.refs.length - a.refs.length);
      return {
        id: r.layer.id,
        label: r.layer.label,
        color: safeColor(r.layer.style?.color),
        count: r.count,
        synthese: String(ai?.synthese || '').trim(),
        sujets,
      };
    });

    dg.analysis = {
      resume: String(result.resume || ''),
      couches,
      pointCount: sel.features.length,
      areaKm2: sel.areaKm2,
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
  const rows = _breakdown(features).map((r) => ({
    id: r.layer.id, label: r.layer.label, color: safeColor(r.layer.style?.color), count: r.count,
  }));
  if (!rows.length) return '';
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return _mixBarHtml(rows, total) + `<ul class="dg-legend-list">${rows.map((r) => `
    <li class="dg-legend-item" data-layer="${escAttr(r.id)}">
      <span class="dg-legend-dot" style="background:${escAttr(r.color)}"></span>
      <span class="dg-legend-name">${esc(r.label)}</span>
      <span class="dg-legend-count">${_fmt(r.count)}</span>
    </li>`).join('')}</ul>`;
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

  // Survol de la barre ou de la légende : les points concernés s'allument sur la carte
  const rows = _breakdown(sel.features).map((r) => ({
    id: r.layer.id, label: r.layer.label, color: safeColor(r.layer.style?.color), count: r.count,
  }));
  _bindMixBar(panel, rows);
  panel.querySelectorAll('.dg-legend-item').forEach((item) => {
    item.addEventListener('mouseenter', () => setHover(_featuresOfLayer(item.dataset.layer)));
    item.addEventListener('mouseleave', () => setHover([]));
  });
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
  const nbSujets = a.couches.reduce((acc, c) => acc + c.sujets.length, 0);

  panel.innerHTML = `
    <div class="dg-rbar">
      <span class="dg-rbar__meta"><b>${_fmt(n)}</b> point${n > 1 ? 's' : ''} lu${n > 1 ? 's' : ''} · ${a.couches.length} source${a.couches.length > 1 ? 's' : ''}${nbSujets ? ` · ${nbSujets} sujet${nbSujets > 1 ? 's' : ''}` : ''}</span>
      <span class="dg-rbar__spacer"></span>
      <button type="button" class="dg-rbar__btn" id="dg-re" title="Relancer l'analyse"><i class="fa-solid fa-rotate"></i></button>
      <button type="button" class="dg-rbar__btn" id="dg-cl" title="Fermer l'analyse"><i class="fa-solid fa-xmark"></i></button>
    </div>
    ${_mixBarHtml(a.couches, n)}
    ${a.resume ? `<div class="dg-resume">${esc(a.resume)}</div>` : ''}
    <div class="dg-layers-detail" id="dg-layers-detail"></div>
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

  _bindMixBar(panel, a.couches);
  const detail = panel.querySelector('#dg-layers-detail');
  for (const couche of a.couches) detail.appendChild(_coucheBlock(couche));
}

/* ── Répartition : une seule barre, la légende est au survol ────── */

function _mixBarHtml(couches, total) {
  if (!couches.length || !total) return '';
  const segs = couches.map((c) => `<button type="button" class="dg-mix__seg" data-layer="${escAttr(c.id)}"
      style="width:${(c.count / total * 100).toFixed(3)}%;background:${escAttr(c.color)}"
      aria-label="${escAttr(`${c.label} : ${c.count} points`)}"></button>`).join('');
  return `<div class="dg-mix" id="dg-mix">
      <div class="dg-mix__bar">${segs}</div>
      <div class="dg-mix__tip" id="dg-mix-tip" hidden></div>
    </div>`;
}

/**
 * Survol d'un segment : infobulle + mise en évidence des points de cette
 * source sur la carte. Clic : ouvre la section correspondante.
 */
function _bindMixBar(panel, couches) {
  const wrap = panel.querySelector('#dg-mix');
  const tip = panel.querySelector('#dg-mix-tip');
  if (!wrap || !tip) return;
  const total = couches.reduce((acc, c) => acc + c.count, 0) || 1;

  wrap.querySelectorAll('.dg-mix__seg').forEach((seg) => {
    const couche = couches.find((c) => c.id === seg.dataset.layer);
    if (!couche) return;
    seg.addEventListener('mouseenter', () => {
      const share = Math.round((couche.count / total) * 100);
      tip.innerHTML = `<span class="dg-mix__tip-dot" style="background:${escAttr(couche.color)}"></span>`
        + `${esc(couche.label)} · <b>${_fmt(couche.count)}</b> pt${couche.count > 1 ? 's' : ''} (${share} %)`;
      tip.hidden = false;
      // Centrer l'infobulle sur le segment, bornée à la largeur du panneau
      const left = seg.offsetLeft + seg.offsetWidth / 2;
      tip.style.left = `${Math.min(Math.max(left, 70), wrap.clientWidth - 70)}px`;
      setHover(_featuresOfLayer(couche.id));
    });
    seg.addEventListener('mouseleave', () => { tip.hidden = true; setHover([]); });
    seg.addEventListener('click', () => {
      const block = panel.querySelector(`.dg-couche[data-layer="${CSS.escape(couche.id)}"]`);
      if (!block) return; // vue « sélection » : pas encore de sections par source
      _toggleCouche(block, true);
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

const _featuresOfLayer = (id) => (dg.selection?.features || []).filter((f) => f.__layerId === id);

/* ── Une source : synthèse visible, détail au clic ──────────────── */

function _toggleCouche(block, open) {
  const body = block.querySelector('.dg-couche__body');
  const head = block.querySelector('.dg-couche__head');
  const next = open === undefined ? body.hidden : open;
  body.hidden = !next;
  block.classList.toggle('is-open', next);
  head.setAttribute('aria-expanded', String(next));
}

function _coucheBlock(couche) {
  const block = document.createElement('div');
  block.className = 'dg-couche';
  block.dataset.layer = couche.id;
  const nbSujets = couche.sujets.length;
  block.innerHTML = `
    <button type="button" class="dg-couche__head" aria-expanded="false">
      <span class="dg-couche__dot" style="background:${escAttr(couche.color)}"></span>
      <span class="dg-couche__name">${esc(couche.label)}</span>
      <span class="dg-couche__count">${_fmt(couche.count)}</span>
      <i class="fa-solid fa-chevron-down dg-couche__chev"></i>
    </button>
    ${couche.synthese ? `<div class="dg-couche__synth">${esc(couche.synthese)}</div>` : ''}
    <div class="dg-couche__body" hidden></div>
  `;
  const head = block.querySelector('.dg-couche__head');
  head.addEventListener('click', () => _toggleCouche(block));
  head.addEventListener('mouseenter', () => setHover(_featuresOfLayer(couche.id)));
  head.addEventListener('mouseleave', () => setHover([]));

  const body = block.querySelector('.dg-couche__body');
  if (!nbSujets) {
    body.innerHTML = `<div class="dg-couche__none">Ces points ne portent pas de texte descriptif : seul leur décompte est exploitable.</div>`;
  } else {
    for (const sujet of couche.sujets) body.appendChild(_sujetCard(sujet));
  }
  return block;
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
