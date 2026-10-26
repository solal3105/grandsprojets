/**
 * Diagnostic terrain - écran « Demander » (/admin/diagnostic/demander/).
 * Une conversation sur les données du diagnostic de l'espace : chaque réponse
 * montre la zone étudiée sur une carte, les références citées et ses sources.
 * Les conversations restent dans ce navigateur, par espace.
 */

import * as api from '../../../api.js';
import { store } from '../../../store.js';
import { esc } from '../../../components/ui.js';
import { dg, safeColor, PALETTE, layerKind } from '../state.js';
import { loadLayerData } from '../data.js';
import { resolveTerritory } from '../sources/territory.js';
import { sourceOfLayer } from '../sources.js';
import { featuresInZone, geometryKind } from './zone.mjs';
import { runTurn, zoneSentence } from './engine.js';
import { PlaceError } from './place.js';

const LIVE_MAPS = 3;
const MAX_CONVERSATIONS = 30;
const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.85 } }],
};

let _state = null;

const storeKey = () => `dg.assistant.${store.city || ''}`;
function readConversations() {
  try { return JSON.parse(localStorage.getItem(storeKey()) || '[]').filter((c) => c && Array.isArray(c.turns)); } catch { return []; }
}
function writeConversations(list) {
  let items = list.slice(0, MAX_CONVERSATIONS);
  // Un navigateur plein garde les conversations récentes plutôt que rien.
  while (items.length) {
    try { localStorage.setItem(storeKey(), JSON.stringify(items)); return; } catch { items = items.slice(0, -1); }
  }
}

const colorOf = (layer, i) => safeColor(layer?.style?.color, PALETTE[i % PALETTE.length]);

/** Libellé court d'une couche : sans la mention de source après le point médian. */
const shortLabel = (label) => String(label || '').split(' · ')[0];

export function destroyAssistantPage() {
  if (!_state) return;
  _state.abort?.abort();
  for (const m of _state.maps) { try { m.map.remove(); } catch { /* déjà retirée */ } }
  _state = null;
}

export async function renderAssistantPage(container, alive) {
  destroyAssistantPage();
  const state = _state = {
    container, alive, maps: [], abort: null, busy: false,
    conversations: readConversations(), current: null,
    layers: [], data: new Map(), loading: null, territory: null,
  };
  document.title = 'Demander · Diagnostic terrain';
  container.innerHTML = `
    <div class="dga">
      <aside class="dga-side" aria-label="Conversations">
        <a href="/admin/diagnostic/" class="dga-back" data-section="diagnostic"><i class="fa-solid fa-arrow-left"></i> Carte du diagnostic</a>
        <button type="button" class="dga-new" data-new><i class="fa-solid fa-pen-to-square"></i> Nouvelle question</button>
        <div class="dga-convs" data-convs></div>
      </aside>
      <section class="dga-main">
        <div class="dga-thread" data-thread><div class="dga-col" data-col></div></div>
        <form class="dga-composer" data-form>
          <label class="dga-sr" for="dga-input">Votre question</label>
          <textarea id="dga-input" rows="1" maxlength="2000" placeholder="Posez une question sur un lieu de votre territoire"></textarea>
          <button type="submit" class="dga-send" data-send aria-label="Envoyer la question"><i class="fa-solid fa-arrow-up"></i></button>
        </form>
        <p class="dga-note">Les chiffres sont calculés sur vos couches de données. Le texte est rédigé par une IA : vérifiez sur place avant de décider.</p>
      </section>
    </div>`;

  const input = container.querySelector('#dga-input');
  const form = container.querySelector('[data-form]');
  input.addEventListener('input', () => autosize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.busy) { state.abort?.abort(); return; }
    const q = input.value.trim();
    if (!q) return;
    input.value = ''; autosize(input);
    ask(q);
  });
  container.querySelector('[data-new]').addEventListener('click', () => { if (!state.busy) openConversation(null); });

  const [branding, layers] = await Promise.all([api.getBranding().catch(() => null), api.getDiagnosticLayers()]);
  if (!alive()) return;
  dg.branding = branding;
  state.branding = branding;
  state.layers = (layers || []).filter((l) => l.enabled !== false);
  state.territory = await resolveTerritory().catch(() => null);
  if (!alive()) return;
  state.loading = loadData(state);
  drawSide();
  openConversation(null);
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}

/** Charge les données de toutes les couches une fois pour l'écran. */
async function loadData(state) {
  let done = 0;
  await Promise.all(state.layers.map(async (layer) => {
    try { state.data.set(layer.id, await loadLayerData(layer)); }
    catch (e) { state.data.set(layer.id, []); console.warn('[diagnostic/assistant] Couche non lue :', layer.label, e); }
    done++;
    if (_state === state) updateDataLine(state, done);
  }));
}

function territoryName(state) {
  return state.territory?.epci?.nom || state.territory?.commune?.nom || 'votre territoire';
}

function updateDataLine(state, done = state.layers.length) {
  const el = state.container.querySelector('[data-dataline]');
  if (!el) return;
  if (!state.layers.length) {
    el.innerHTML = 'Aucune couche de données n\'est encore ajoutée. <a href="/admin/diagnostic/" data-section="diagnostic">Ajoutez des données sur la carte du diagnostic</a>, puis revenez poser vos questions.';
    return;
  }
  const n = [...state.data.values()].reduce((s, f) => s + f.length, 0);
  el.textContent = done < state.layers.length
    ? `Lecture des données : ${done} couche${done > 1 ? 's' : ''} sur ${state.layers.length}…`
    : `Je réponds à partir de ${state.layers.length} couche${state.layers.length > 1 ? 's' : ''} de données, ${n.toLocaleString('fr-FR')} éléments en tout.`;
}

/* ── Conversations ─────────────────────────────────────────────── */

function drawSide() {
  const state = _state;
  const box = state.container.querySelector('[data-convs]');
  if (!state.conversations.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<h2>Conversations</h2>${state.conversations.map((c) => `
    <button type="button" data-conv="${esc(c.id)}" class="${state.current?.id === c.id ? 'is-active' : ''}" title="${esc(c.title)}">${esc(c.title)}</button>`).join('')}`;
  box.querySelectorAll('[data-conv]').forEach((b) => b.addEventListener('click', () => {
    if (state.busy) return;
    openConversation(state.conversations.find((c) => c.id === b.dataset.conv));
  }));
}

function openConversation(conv) {
  const state = _state;
  for (const m of state.maps) { try { m.map.remove(); } catch { /* déjà retirée */ } }
  state.maps = [];
  state.current = conv;
  drawSide();
  const col = state.container.querySelector('[data-col]');
  if (!conv) { col.innerHTML = homeHtml(state); wireHome(state); updateDataLine(state, state.data.size); return; }
  col.innerHTML = '';
  conv.turns.forEach((turn) => { const view = addTurnView(turn); renderTurn(view, turn); });
  placeholder();
  scrollEnd(false);
}

function placeholder() {
  const last = _state.current?.turns.filter((t) => t.zone).at(-1);
  _state.container.querySelector('#dga-input').placeholder = last ? `Une autre question sur ${last.zone.label}, ou sur un autre lieu` : 'Posez une question sur un lieu de votre territoire';
}

/** Questions d'exemple bâties sur les couches et le territoire de l'espace. */
export function exampleQuestions(layers, territory) {
  const commune = territory?.commune?.nom || '';
  const epci = territory?.epci?.nom || '';
  const sources = new Set(layers.map((l) => sourceOfLayer(l)?.id));
  const out = [];
  if (layers.some((l) => layerKind(l) === 'temoignages') && epci) out.push(`Que signalent les habitants dans un rayon de 1 km autour du siège de ${epci} ?`);
  if (sources.has('accidents') && commune) out.push(`Combien d'accidents à moins de 500 m de la gare de ${commune} ?`);
  if (commune) out.push(`Fais un bilan axe par axe autour de la mairie de ${commune}.`);
  out.push('Quelles données as-tu sur le territoire ?');
  return out.slice(0, 4);
}

function homeHtml(state) {
  return `
    <div class="dga-home">
      <h1>Que voulez-vous savoir sur ${esc(territoryName(state))} ?</h1>
      <p class="dga-home__lead">Nommez un lieu, une rue ou une adresse, et dites ce que vous cherchez. Je compte ce que vos données disent dans la zone et je vous montre où.</p>
      <div class="dga-examples">${exampleQuestions(state.layers, state.territory).map((q) => `<button type="button" data-example>${esc(q)}</button>`).join('')}</div>
      <p class="dga-home__data" data-dataline></p>
    </div>`;
}

function wireHome(state) {
  state.container.querySelectorAll('[data-example]').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
}

/* ── Un tour ───────────────────────────────────────────────────── */

const request = async (payload, signal) => {
  const res = await fetch('/api/ai-assistant', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(store.session?.access_token ? { Authorization: `Bearer ${store.session.access_token}` } : {}) },
    body: JSON.stringify({ ...payload, ville: store.city, conversationId: _state?.current?.id }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const error = new Error(body?.error || (res.status === 401 ? 'Votre session a expiré. Reconnectez-vous, puis reposez la question.' : `L'assistant ne répond pas pour le moment (erreur ${res.status}). Réessayez dans quelques minutes.`));
    error.code = body?.code;
    throw error;
  }
  return body;
};

async function ask(question) {
  const state = _state;
  if (!state || state.busy) return;
  if (!state.current) {
    state.current = { id: crypto.randomUUID(), title: question.length > 60 ? `${question.slice(0, 57).replace(/\s+\S*$/, '')}…` : question, turns: [] };
    state.conversations.unshift(state.current);
    state.container.querySelector('[data-col]').innerHTML = '';
    drawSide();
  }
  const conv = state.current;
  const turn = { question, pending: true };
  const view = addTurnView(turn);
  renderTurn(view, turn);
  scrollEnd();
  setBusy(true);
  state.abort = new AbortController();
  const steps = [];
  try {
    await state.loading;
    const done = await runTurn({
      question, turns: conv.turns, layers: state.layers, featuresOf: (id) => state.data.get(id) || [],
      branding: state.branding, territory: state.territory, request, signal: state.abort.signal, turnIndex: conv.turns.length,
      onStep: (label) => { steps.push(label); renderSteps(view, steps, true); },
    });
    Object.assign(turn, done, { steps, pending: false });
  } catch (e) {
    Object.assign(turn, { steps, pending: false, error: e?.name === 'AbortError' ? 'Réponse arrêtée.' : (e instanceof PlaceError || e?.message ? e.message : 'L\'assistant n\'a pas pu répondre. Réessayez.') });
  }
  if (_state !== state) return;
  conv.turns.push(turn);
  conv.updatedAt = new Date().toISOString();
  state.conversations = [conv, ...state.conversations.filter((c) => c !== conv)];
  writeConversations(state.conversations);
  setBusy(false);
  drawSide();
  renderTurn(view, turn);
  placeholder();
}

function setBusy(on) {
  const state = _state;
  state.busy = on;
  const send = state.container.querySelector('[data-send]');
  send.innerHTML = on ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-arrow-up"></i>';
  send.setAttribute('aria-label', on ? 'Arrêter la réponse' : 'Envoyer la question');
  state.container.querySelector('[data-new]').disabled = on;
}

function addTurnView(turn) {
  const col = _state.container.querySelector('[data-col]');
  const el = document.createElement('div');
  el.className = 'dga-turn';
  el.innerHTML = `<div class="dga-user"><p>${esc(turn.question)}</p></div><div class="dga-ai" aria-live="polite"></div>`;
  col.appendChild(el);
  return { el, ai: el.querySelector('.dga-ai') };
}

function renderSteps(view, steps, live) {
  const box = view.ai.querySelector('[data-steps]') || view.ai.appendChild(Object.assign(document.createElement('div'), { className: 'dga-steps' }));
  box.dataset.steps = '';
  box.innerHTML = live
    ? `<p class="dga-live"><span class="dga-dot"></span>${esc(steps.at(-1) || 'Je lis la demande')}…</p>`
    : steps.length ? `<details><summary>${steps.length} étape${steps.length > 1 ? 's' : ''}</summary><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : '';
}

function renderTurn(view, turn) {
  const state = _state;
  if (turn.pending) { view.ai.innerHTML = ''; renderSteps(view, [], true); return; }
  view.ai.innerHTML = '';
  renderSteps(view, turn.steps || [], false);
  if (turn.error) {
    view.ai.insertAdjacentHTML('beforeend', `<div class="dga-error" role="alert"><p>${esc(turn.error)}</p><button type="button" class="adm-btn adm-btn--secondary" data-retry>Reposer la question</button></div>`);
    view.ai.querySelector('[data-retry]').addEventListener('click', () => ask(turn.question));
    return;
  }
  const layers = (turn.layerIds || []).map((id) => state.layers.find((l) => l.id === id)).filter(Boolean);
  const order = refOrder(turn.answer);
  if (turn.layerIds) {
    view.ai.insertAdjacentHTML('beforeend', `
      <figure class="dga-mapcard">
        <figcaption class="dga-zone">${esc(zoneSentence(turn.zone))}</figcaption>
        <div class="dga-map" data-map></div>
      </figure>
      <ul class="dga-legend">${layers.map((l) => `<li><i style="background:${colorOf(l, state.layers.indexOf(l))}"></i>${esc(shortLabel(l.label))} <b>${(turn.counts?.[l.id] ?? 0).toLocaleString('fr-FR')}</b></li>`).join('')}</ul>`);
    mountMap(view, turn, layers, order);
  }
  view.ai.insertAdjacentHTML('beforeend', `<div class="dga-answer">${answerHtml(turn, order)}</div>`);
  if (turn.layerIds) {
    view.ai.insertAdjacentHTML('beforeend', `<p class="dga-sources">Sources : ${layers.map((l) => esc(l.label)).join(' ; ')}.${turn.zone?.adresse ? ` Lieu trouvé : ${esc(turn.zone.adresse)}.` : ''}</p>`);
  }
  view.ai.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => focusRef(view, turn, b.dataset.ref)));
}

const refOrder = (text) => {
  const out = [];
  for (const m of String(text || '').matchAll(/\[\[([a-z]+\d+)\]\]/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
};

/** Réponse en paragraphes et listes ; les références deviennent des boutons numérotés. */
export function answerHtml(turn, order = refOrder(turn.answer)) {
  const state = _state;
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\s*\[\[([a-z]+\d+)\]\]/g, (_, ref) => {
      const r = turn.refs?.[ref];
      if (!r) return '';
      const layer = state?.layers.find((l) => l.id === r.layer);
      const color = colorOf(layer, state?.layers.indexOf(layer) ?? 0);
      return ` <button type="button" class="dga-ref" data-ref="${ref}" style="background:${color}" aria-label="Voir l'élément ${order.indexOf(ref) + 1} sur la carte">${order.indexOf(ref) + 1}</button>`;
    });
  const out = [];
  let list = null;
  for (const raw of String(turn.answer || '').split('\n')) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) { (list ||= []).push(`<li>${inline(item[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (line) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('');
}

/* ── Carte d'une réponse ───────────────────────────────────────── */

/** Largeur en pixels d'une distance au sol, selon le zoom (expression MapLibre). */
function metersToPixels(meters, lat) {
  // MapLibre compte ses zooms en tuiles de 512 pixels : 78 271,5 m par pixel au zoom 0, à l'équateur.
  const atZero = meters / (78271.517 * Math.cos(lat * Math.PI / 180));
  return ['interpolate', ['exponential', 2], ['zoom'], 0, atZero, 22, atZero * 2 ** 22];
}

function bboxOf(geometries) {
  let b = null;
  const walk = (c) => {
    if (typeof c?.[0] === 'number') { b = b ? [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])] : [c[0], c[1], c[0], c[1]]; return; }
    if (Array.isArray(c)) c.forEach(walk);
  };
  geometries.forEach((g) => walk(g?.coordinates));
  return b;
}

function mountMap(view, turn, layers, order) {
  const state = _state;
  // Les entités de la zone se recalculent sur les données : attendre leur lecture.
  Promise.resolve(state.loading).then(() => { if (_state === state) buildMap(view, turn, layers, order); });
}

function buildMap(view, turn, layers, order) {
  const state = _state;
  const el = view.ai.querySelector('[data-map]');
  if (typeof maplibregl === 'undefined' || !el) { el?.closest('figure')?.remove(); return; }
  // Seules les cartes récentes restent vivantes : un navigateur limite les contextes WebGL.
  while (state.maps.length >= LIVE_MAPS) {
    const old = state.maps.shift();
    try { old.map.remove(); } catch { /* déjà retirée */ }
    old.el.innerHTML = '<button type="button" class="dga-map-wake">Afficher la carte</button>';
    old.el.querySelector('button').addEventListener('click', () => { old.el.innerHTML = ''; mountMap(old.view, old.turn, old.layers, old.order); });
  }
  const zone = turn.zone;
  const members = layers.map((l) => ({ layer: l, list: featuresInZone(state.data.get(l.id) || [], zone?.geometry || null, zone?.radius || 0) }));
  const box = zone ? bboxOf([zone.geometry]) : bboxOf(members.flatMap((m) => m.list.map((x) => x.feature.geometry)));
  const lat = box ? (box[1] + box[3]) / 2 : 46.6;
  let map;
  try {
    map = new maplibregl.Map({ container: el, style: OSM_STYLE, center: box ? [(box[0] + box[2]) / 2, lat] : [2.35, 46.6], zoom: 13, attributionControl: false, cooperativeGestures: true });
  } catch (e) {
    console.warn('[diagnostic/assistant] Carte indisponible :', e);
    el.closest('figure')?.remove();
    return;
  }
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  const entry = { map, el, view, turn, layers, order };
  state.maps.push(entry);
  view.map = entry;
  if (box) {
    const dy = (zone?.radius || 0) / 111320, dx = dy / Math.max(0.2, Math.cos(lat * Math.PI / 180));
    map.fitBounds([[box[0] - dx, box[1] - dy], [box[2] + dx, box[3] + dy]], { padding: { top: 56, bottom: 24, left: 24, right: 56 }, duration: 0, maxZoom: 17 });
  }
  map.on('load', () => {
    if (zone) {
      const kind = geometryKind(zone.geometry);
      map.addSource('zone', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: zone.geometry } });
      if (kind === 'point') {
        map.addLayer({ id: 'zone', type: 'circle', source: 'zone', paint: { 'circle-radius': metersToPixels(zone.radius, lat), 'circle-color': '#4E2BFF', 'circle-opacity': 0.07, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#4E2BFF', 'circle-stroke-opacity': 0.55 } });
      } else {
        map.addLayer({ id: 'zone-band', type: 'line', source: 'zone', paint: { 'line-width': metersToPixels(zone.radius * 2, lat), 'line-color': '#4E2BFF', 'line-opacity': 0.08 } });
        if (kind === 'area') map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': '#4E2BFF', 'fill-opacity': 0.07 } });
      }
      map.addLayer({ id: 'zone-place', type: kind === 'point' ? 'circle' : 'line', source: 'zone', paint: kind === 'point' ? { 'circle-radius': 6, 'circle-color': '#4E2BFF', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } : { 'line-color': '#4E2BFF', 'line-width': 3 } });
    }
    members.forEach(({ layer, list }) => {
      const color = colorOf(layer, state.layers.indexOf(layer));
      const id = `l-${layer.id}`;
      map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: list.slice(0, 5000).map((x) => ({ type: 'Feature', properties: {}, geometry: x.feature.geometry })) } });
      map.addLayer({ id: `${id}-line`, type: 'line', source: id, filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': color, 'line-width': 2.5, 'line-opacity': 0.75 } });
      map.addLayer({ id: `${id}-pt`, type: 'circle', source: id, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': color, 'circle-opacity': 0.8, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } });
    });
    entry.markers = order.map((ref, i) => {
      const r = turn.refs?.[ref];
      if (!r?.at) return null;
      const layer = state.layers.find((l) => l.id === r.layer);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'dga-pin';
      pin.style.background = colorOf(layer, state.layers.indexOf(layer));
      pin.textContent = String(i + 1);
      pin.setAttribute('aria-label', `Élément ${i + 1}`);
      pin.addEventListener('click', () => focusRef(view, turn, ref));
      return { ref, marker: new maplibregl.Marker({ element: pin }).setLngLat(r.at).addTo(map) };
    }).filter(Boolean);
  });
}

function focusRef(view, turn, ref) {
  const r = turn.refs?.[ref];
  const entry = view.map;
  view.ai.querySelectorAll('[data-ref]').forEach((b) => b.classList.toggle('is-focus', b.dataset.ref === ref));
  if (!r?.at || !entry?.map) return;
  entry.markers?.forEach((m) => m.marker.getElement().classList.toggle('is-focus', m.ref === ref));
  const layer = _state.layers.find((l) => l.id === r.layer);
  entry.popup?.remove();
  entry.popup = new maplibregl.Popup({ offset: 14, maxWidth: '300px' }).setLngLat(r.at)
    .setHTML(`<div class="dga-pop"><small>${esc(shortLabel(layer?.label))}${r.distance ? ` · à ${r.distance} m` : ''}</small><p>${esc(r.text)}</p></div>`).addTo(entry.map);
  entry.map.easeTo({ center: r.at, duration: 500 });
  view.ai.querySelector('.dga-mapcard')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function scrollEnd(smooth = true) {
  const t = _state.container.querySelector('[data-thread]');
  t.scrollTo({ top: t.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}
