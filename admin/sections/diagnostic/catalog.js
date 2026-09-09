/**
 * Diagnostic terrain - « Ajouter des données ».
 * Le catalogue des sources et la page de chaque source : ce que c'est, ce
 * qu'il faut faire (rien, déposer un fichier, créer un compte) et un seul
 * bouton. Les mots techniques restent dans le wizard avancé (wizard.js),
 * accessible par « Un autre fichier » et par « Réglages avancés ».
 */

import * as api from '../../api.js';
import { esc, escAttr, toast } from '../../components/ui.js';
import { dg, INTERNAL_SOURCES, DEFAULT_STYLE } from './state.js';
import { FAMILIES, SOURCES, sourceOfLayer } from './sources.js';
import {
  readDrop, loadGeo, prepareDraft, inspectTable, recipeFor, recipeFilterValues, runRecipe,
  persistStorageLayer, layerPopup,
} from './engine.js';
import { filesFromDataTransfer } from './data.js';
import { resolveTerritory, scopeLabel } from './sources/territory.js';
import { listFubDatasets, fetchFubLayers, fubLayerCfg } from './sources/fub.js';
import { fetchCycleways, cyclewaysLayerCfg } from './sources/osm.js';
import { listBaacYears, fetchBaacYear, baacLayerCfg } from './sources/baac.js';
import { checkWazeFeed, wazeLayerCfgs } from './sources/waze.js';
import { fetchCounters, countersLayerCfg } from './sources/counters.js';
import { resolveContours, communeCodesFor } from './sources/territory.js';
import { openLayerWizard } from './wizard.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const familyLabel = (key) => FAMILIES.find((f) => f.key === key)?.label || '';

/**
 * Ouvre le catalogue.
 * @param {Object} opts
 * @param {(rows: Array) => Promise<void>|void} opts.onAdded - couches enregistrées
 */
export function openDataCatalog({ onAdded }) {
  const overlay = document.createElement('div');
  overlay.className = 'adm-overlay dg-cat-overlay';
  overlay.innerHTML = `
    <div class="dg-cat" role="dialog" aria-modal="true" aria-label="Ajouter des données">
      <div class="dg-cat__head">
        <button type="button" class="dg-cat__back" id="dg-cat-back" hidden aria-label="Retour au catalogue"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="dg-cat__titles">
          <div class="dg-cat__title" id="dg-cat-title">Ajouter des données</div>
          <div class="dg-cat__sub" id="dg-cat-sub">${esc(dg.branding?.brand_name || '')}</div>
        </div>
        <button type="button" class="dg-cat__close" data-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="dg-cat__body" id="dg-cat-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const ctx = {
    overlay,
    body: overlay.querySelector('#dg-cat-body'),
    onAdded,
    territory: null,
    territoryError: null,
    close: null,
  };

  const onKeydown = (e) => { if (e.key === 'Escape') ctx.close(); };
  ctx.close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  document.addEventListener('keydown', onKeydown);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', ctx.close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) ctx.close(); });
  overlay.querySelector('#dg-cat-back').addEventListener('click', () => _renderHome(ctx));

  // Le territoire sert aux sources publiques : résolu en fond dès l'ouverture.
  resolveTerritory()
    .then((t) => { ctx.territory = t; _updateSubtitle(ctx); })
    .catch((e) => { ctx.territoryError = e.message; _updateSubtitle(ctx); });

  _renderHome(ctx);
}

function _updateSubtitle(ctx) {
  const sub = ctx.overlay.querySelector('#dg-cat-sub');
  if (!sub) return;
  const t = ctx.territory;
  if (t) {
    sub.textContent = t.epci ? `${t.commune.nom} · ${scopeLabel(t, 'epci')}` : t.commune.nom;
  } else if (ctx.territoryError) {
    sub.textContent = dg.branding?.brand_name || '';
  }
}

function _setHead(ctx, title, back) {
  ctx.overlay.querySelector('#dg-cat-title').textContent = title;
  ctx.overlay.querySelector('#dg-cat-back').hidden = !back;
}

/* ── Accueil : le catalogue ─────────────────────────────────────── */

/** Couches de l'espace qui viennent d'une source du catalogue. */
function _layersOf(source) {
  return dg.layers.filter((l) => sourceOfLayer(l)?.id === source.id);
}

function _stateOf(source) {
  const mine = _layersOf(source);
  if (source.mode === 'soon') return { cls: 'soon', text: 'Bientôt disponible' };
  if (mine.length) {
    const n = mine.reduce((acc, l) => acc + (dg.runtime.get(l.id)?.count || 0), 0);
    const detail = mine.length > 1 ? `${mine.length} couches` : (n ? `${_fmt(n)} entité${n > 1 ? 's' : ''}` : '1 couche');
    return { cls: 'done', text: `Déjà ajouté · ${detail}` };
  }
  if (source.mode === 'file') return { cls: 'file', text: 'Un fichier à déposer · nous expliquons' };
  if (source.mode === 'link') return { cls: 'file', text: 'Un lien à coller · nous expliquons' };
  return { cls: 'auto', text: 'Nous récupérons tout' };
}

function _renderHome(ctx) {
  _setHead(ctx, 'Ajouter des données', false);
  const groups = FAMILIES.map((f) => ({ f, sources: SOURCES.filter((s) => s.family === f.key) })).filter((g) => g.sources.length);
  ctx.body.innerHTML = `
    ${groups.map(({ f, sources }) => `
      <div class="dg-cat__family">${esc(f.label)}</div>
      <div class="dg-cat__list">
        ${sources.map((s) => {
          const st = _stateOf(s);
          return `
          <button type="button" class="dg-src dg-src--${st.cls}" data-source="${escAttr(s.id)}">
            <span class="dg-src__ico" style="--tint:${escAttr(s.tint)}"><i class="${escAttr(s.icon)}"></i></span>
            <span class="dg-src__body">
              <span class="dg-src__name">${esc(s.name)}</span>
              <span class="dg-src__desc">${esc(s.description)}</span>
            </span>
            <span class="dg-src__state"><i></i>${esc(st.text)}</span>
            <span class="dg-src__chev"><i class="fa-solid fa-chevron-right"></i></span>
          </button>`;
        }).join('')}
      </div>`).join('')}
    <div class="dg-cat__family">Vos propres fichiers</div>
    <label class="dg-cat__drop" id="dg-cat-drop">
      <input type="file" id="dg-cat-file" multiple accept=".geojson,.json,.csv,.zip,.shp,.dbf,.shx,.prj,.cpg" hidden>
      <span class="dg-cat__drop-ico"><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
      <span class="dg-cat__drop-txt">
        <b>Déposez un fichier ici : GeoJSON, CSV, shapefile, export d'un outil.</b>
        <span>Un export connu est reconnu et réglé tout seul. Pour un autre fichier ou un lien vers une API, <button type="button" class="dg-cat__link" id="dg-cat-advanced">décrivez-le vous-même</button>.</span>
      </span>
    </label>
  `;
  ctx.body.querySelector('#dg-cat-advanced').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); _openAdvanced(ctx); });

  ctx.body.querySelectorAll('[data-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const source = SOURCES.find((s) => s.id === btn.dataset.source);
      if (source) _openSource(ctx, source);
    });
  });

  const drop = ctx.body.querySelector('#dg-cat-drop');
  const input = ctx.body.querySelector('#dg-cat-file');
  input.addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) _handleAnyDrop(ctx, files);
  });
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', async (e) => {
    const files = await filesFromDataTransfer(e.dataTransfer).catch(() => [...e.dataTransfer.files]);
    if (files.length) _handleAnyDrop(ctx, files);
  });
}

/**
 * Un fichier déposé sans avoir choisi de source : s'il correspond à un
 * export connu, sa page s'ouvre déjà remplie ; sinon, le wizard avancé
 * prend le relais avec le fichier chargé.
 */
async function _handleAnyDrop(ctx, files) {
  const drop = ctx.body.querySelector('#dg-cat-drop');
  if (drop) drop.classList.add('is-busy');
  try {
    const dropped = await _recognize(files);
    if (dropped.recipe) {
      const source = SOURCES.find((s) => s.recipeId === dropped.recipe.id);
      if (source) { _openSource(ctx, source, dropped); return; }
    }
    _openAdvanced(ctx, { files });
  } catch (e) {
    toast(e.message || 'Fichier illisible', 'error');
    if (drop) drop.classList.remove('is-busy');
  }
}

/** Lecture d'un dépôt : entités, tableau éventuel, recette reconnue. */
async function _recognize(files) {
  const drop = await readDrop(files);
  const fc = await loadGeo(drop.geo);
  const { features, fields } = prepareDraft(fc);
  let table = null;
  let recipe = null;
  if (drop.tables.length) {
    table = await inspectTable(drop.tables[0]);
    recipe = recipeFor(fields, table.headers);
  }
  return { files, name: drop.name, features, fields, table, recipe, csv: fc.csv || null };
}

function _openAdvanced(ctx, opts = {}) {
  const onAdded = ctx.onAdded;
  ctx.close();
  openLayerWizard({ ...opts, onSaved: (row) => onAdded?.([row]) });
}

/* ── Page d'une source ──────────────────────────────────────────── */

function _openSource(ctx, source, dropped = null) {
  _setHead(ctx, source.name, true);
  ctx.body.scrollTop = 0;
  const autos = { fub: _renderFub, 'osm-cycleways': _renderOsm, accidents: _renderBaac, comptages: _renderCounters };
  const render = {
    internal: _renderInternal,
    auto: autos[source.id],
    file: _renderFile,
    link: _renderLink,
    soon: _renderSoon,
  }[source.mode];
  render?.(ctx, source, dropped);
}

function _whatHtml(source) {
  if (!source.what?.length) return '';
  return `<dl class="dg-what">${source.what.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function _tutorialHtml(source) {
  if (!source.tutorial?.length) return '';
  return `<ol class="dg-tuto">${source.tutorial.map((st) => `
    <li><div class="dg-tuto__body"><div class="dg-tuto__t">${esc(st.title)}</div><div class="dg-tuto__d">${esc(st.text)}${st.link ? ` <a href="${escAttr(st.link)}" target="_blank" rel="noopener">${esc(st.linkLabel || st.link)}</a>` : ''}</div></div></li>`).join('')}</ol>`;
}

function _existingHtml(source) {
  const mine = _layersOf(source);
  if (!mine.length) return '';
  return `<div class="dg-cat__note"><i class="fa-solid fa-circle-check"></i> Déjà dans votre diagnostic : ${mine.map((l) => esc(l.label)).join(', ')}.</div>`;
}

/** Zone de progression : une ligne par étape, la dernière en cours. */
function _progress(container) {
  const box = document.createElement('div');
  box.className = 'dg-progress';
  container.appendChild(box);
  const steps = [];
  return {
    step(label) {
      steps.forEach((s) => s.classList.add('is-done'));
      const el = document.createElement('div');
      el.className = 'dg-progress__step';
      el.innerHTML = `<span class="dg-progress__ico"></span><span>${esc(label)}</span>`;
      box.appendChild(el);
      steps.push(el);
    },
    done() { steps.forEach((s) => s.classList.add('is-done')); box.classList.add('is-done'); },
    fail(message) {
      const last = steps[steps.length - 1];
      if (last) last.classList.add('is-failed');
      const el = document.createElement('div');
      el.className = 'dg-progress__error';
      el.textContent = message;
      box.appendChild(el);
    },
    remove() { box.remove(); },
  };
}

/** Termine un ajout : couches chargées, catalogue fermé, message. */
async function _finish(ctx, rows) {
  ctx.close();
  toast(rows.length > 1 ? `${rows.length} couches ajoutées au diagnostic` : 'Couche ajoutée au diagnostic', 'success');
  await ctx.onAdded?.(rows);
}

/* Interne : signalements, projets, travaux */
function _renderInternal(ctx, source) {
  const src = INTERNAL_SOURCES[source.internalKey];
  const exists = _layersOf(source).length > 0;
  ctx.body.innerHTML = `
    <div class="dg-page">
      <p class="dg-page__lead">${esc(source.sentence)}</p>
      ${_whatHtml(source)}
      ${_existingHtml(source)}
      <div class="dg-page__actions">
        <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add" ${exists ? 'disabled' : ''}>
          <i class="fa-solid fa-plus"></i> ${exists ? 'Déjà dans votre diagnostic' : 'Ajouter au diagnostic'}
        </button>
      </div>
      <div id="dg-src-progress"></div>
    </div>`;
  ctx.body.querySelector('#dg-src-add')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const p = _progress(ctx.body.querySelector('#dg-src-progress'));
    p.step('Enregistrement de la couche…');
    try {
      const { data, error } = await api.upsertDiagnosticLayer({
        label: src.label,
        group_label: familyLabel(source.family),
        source_type: 'internal',
        source_ref: source.internalKey,
        style: { ...DEFAULT_STYLE, ...src.defaults.style },
        popup: layerPopup({ kind: 'temoignages', popup: src.defaults.popup }, source.id),
        ai_context: src.defaults.ai_context,
        default_on: true,
        sort_order: dg.layers.length,
      });
      if (error) throw error;
      p.done();
      await _finish(ctx, [data]);
    } catch (err) {
      p.fail(err.message || String(err));
      btn.disabled = false;
    }
  });
}

/* Territoire : commune ou intercommunalité */
async function _territoryOrError(ctx) {
  if (ctx.territory) return ctx.territory;
  if (ctx.territoryError) throw new Error(ctx.territoryError);
  return resolveTerritory();
}

function _scopeHtml(territory, scope, { onlyIf = () => true } = {}) {
  const opts = [['commune', `Commune de ${territory.commune.nom}`]];
  if (territory.epci) opts.push(['epci', scopeLabel(territory, 'epci')]);
  return `<div class="adm-form-group"><label class="adm-label">Territoire</label>
    <div class="dg-seg" id="dg-src-scope">${opts.map(([k, label]) => `<button type="button" data-scope="${k}" class="${k === scope ? 'is-active' : ''}" ${onlyIf(k) ? '' : 'disabled title="Pas de données pour ce périmètre"'}>${esc(label)}</button>`).join('')}</div>
  </div>`;
}

/* Baromètre vélo FUB */
async function _renderFub(ctx, source) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche des données de votre territoire…</div></div>`;
  let territory, datasets;
  try {
    territory = await _territoryOrError(ctx);
    datasets = await listFubDatasets({ communeCode: territory.commune.code, epciCode: territory.epci?.code });
  } catch (e) {
    ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div></div>`;
    return;
  }
  const has = (scope) => datasets.some((d) => d.scope === scope);
  let scope = has('epci') && territory.epci ? 'epci' : 'commune';
  if (!has(scope)) scope = has('commune') ? 'commune' : (has('epci') ? 'epci' : scope);
  const yearsOf = (sc) => [...new Set(datasets.filter((d) => d.scope === sc).map((d) => d.year))].sort((a, b) => b - a);

  const draw = () => {
    const years = yearsOf(scope);
    const year = years[0];
    const ds = datasets.find((d) => d.scope === scope && d.year === year);
    const exists = ds && dg.layers.some((l) => l.popup?.dataset === ds.id);
    ctx.body.innerHTML = `
      <div class="dg-page">
        <p class="dg-page__lead">${esc(source.sentence)}</p>
        ${datasets.length ? _scopeHtml(territory, scope, { onlyIf: has }) : ''}
        ${datasets.length ? `
        <div class="adm-form-group"><label class="adm-label" for="dg-src-year">Édition</label>
          <select class="adm-select" id="dg-src-year">${years.map((y) => `<option value="${y}">Baromètre vélo ${y}</option>`).join('')}</select>
        </div>
        ${_whatHtml(source)}
        ${exists ? `<div class="dg-cat__note"><i class="fa-solid fa-circle-check"></i> L'édition ${year} pour ce territoire est déjà dans votre diagnostic.</div>` : ''}
        <div class="dg-page__actions">
          <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add" ${exists ? 'disabled' : ''}><i class="fa-solid fa-plus"></i> ${exists ? 'Déjà dans votre diagnostic' : 'Ajouter au diagnostic'}</button>
          <a class="adm-btn adm-btn--secondary" href="https://opendata.parlons-velo.fr/" target="_blank" rel="noopener">Voir la source</a>
        </div>
        <div id="dg-src-progress"></div>`
        : `<div class="dg-cat__error"><i class="fa-solid fa-circle-info"></i> La FUB n'a publié aucune contribution cartographique pour ${esc(territory.commune.nom)}${territory.epci ? ` ni pour ${esc(territory.epci.nom)}` : ''}. Le Baromètre ne couvre que les communes qui ont reçu assez de réponses.</div>`}
      </div>`;
    ctx.body.querySelectorAll('#dg-src-scope button').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope; draw(); }));
    ctx.body.querySelector('#dg-src-year')?.addEventListener('change', () => {
      const y = Number(ctx.body.querySelector('#dg-src-year').value);
      const d = datasets.find((x) => x.scope === scope && x.year === y);
      const ex = d && dg.layers.some((l) => l.popup?.dataset === d.id);
      const btn = ctx.body.querySelector('#dg-src-add');
      btn.disabled = !!ex;
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> ${ex ? 'Déjà dans votre diagnostic' : 'Ajouter au diagnostic'}`;
    });
    ctx.body.querySelector('#dg-src-add')?.addEventListener('click', async (e) => {
      const y = Number(ctx.body.querySelector('#dg-src-year').value);
      const d = datasets.find((x) => x.scope === scope && x.year === y);
      if (!d) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      const p = _progress(ctx.body.querySelector('#dg-src-progress'));
      try {
        const layers = await fetchFubLayers(d.uid, (msg) => p.step(msg));
        const rows = [];
        const group = `Baromètre vélo ${y} · ${scopeLabel(territory, scope).replace(/ \(.*\)$/, '')}`;
        for (const { def, fc } of layers) {
          p.step(`Enregistrement : ${def.label} (${_fmt(fc.features.length)} points)…`);
          const { features } = prepareDraft(fc);
          rows.push(await persistStorageLayer({
            features, keep: null, cfg: fubLayerCfg(def, y, group),
            source: source.id, dataset: d.id, sort_order: dg.layers.length + rows.length,
          }));
        }
        p.done();
        await _finish(ctx, rows);
      } catch (err) {
        p.fail(err.message || String(err));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Aménagements cyclables OpenStreetMap */
async function _renderOsm(ctx, source) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche de votre territoire…</div></div>`;
  let territory;
  try { territory = await _territoryOrError(ctx); } catch (e) {
    ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div></div>`;
    return;
  }
  let scope = 'commune';
  const draw = () => {
    const exists = _layersOf(source).length > 0;
    ctx.body.innerHTML = `
      <div class="dg-page">
        <p class="dg-page__lead">${esc(source.sentence)}</p>
        ${_scopeHtml(territory, scope)}
        ${_whatHtml(source)}
        ${_existingHtml(source)}
        <div class="dg-page__actions">
          <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add"><i class="fa-solid fa-plus"></i> ${exists ? 'Ajouter à nouveau' : 'Ajouter au diagnostic'}</button>
          <a class="adm-btn adm-btn--secondary" href="https://www.openstreetmap.org/" target="_blank" rel="noopener">Voir la source</a>
        </div>
        <div id="dg-src-progress"></div>
      </div>`;
    ctx.body.querySelectorAll('#dg-src-scope button').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope; draw(); }));
    ctx.body.querySelector('#dg-src-add')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const p = _progress(ctx.body.querySelector('#dg-src-progress'));
      try {
        const codes = scope === 'epci' && territory.epci?.communes?.length
          ? territory.epci.communes.map((c) => c.code)
          : [territory.commune.code];
        const fc = await fetchCycleways(codes, { onProgress: (msg) => p.step(msg) });
        if (!fc.features.length) throw new Error('Aucun aménagement cyclable n\'est cartographié dans OpenStreetMap sur ce territoire.');
        p.step(`Enregistrement de ${_fmt(fc.features.length)} tronçons…`);
        const { features } = prepareDraft(fc);
        const row = await persistStorageLayer({
          features, keep: null, cfg: cyclewaysLayerCfg(scopeLabel(territory, scope).replace(/ \(.*\)$/, '')),
          source: source.id, dataset: `osm-cycleways-${scope}-${scope === 'epci' ? territory.epci.code : territory.commune.code}`,
          sort_order: dg.layers.length,
        });
        p.done();
        await _finish(ctx, [row]);
      } catch (err) {
        p.fail(err.message || String(err));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Accidents corporels (fichier national BAAC) */
async function _renderBaac(ctx, source) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche des fichiers nationaux et de votre territoire…</div></div>`;
  let territory, years;
  try {
    [territory, years] = await Promise.all([_territoryOrError(ctx), listBaacYears()]);
  } catch (e) {
    ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div></div>`;
    return;
  }
  const available = [...years.keys()].sort((a, b) => a - b);
  if (!available.length) {
    ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-circle-info"></i> Aucun fichier annuel n'est disponible pour le moment sur data.gouv.fr.</div></div>`;
    return;
  }
  const last = available[available.length - 1];
  // Périodes proposées : la dernière année, puis 3, 5 ans, puis tout.
  const periods = [];
  const push = (n, label) => {
    const from = Math.max(available[0], last - n + 1);
    const key = `${from}-${last}`;
    if (!periods.some((p) => p.key === key)) periods.push({ key, from, to: last, label: label.replace('{span}', from === last ? String(last) : `${from} à ${last}`) });
  };
  push(1, 'Dernière année ({span})');
  push(3, 'Trois ans ({span})');
  push(5, 'Cinq ans ({span})');
  push(available.length, 'Tout ({span})');
  let scope = 'commune';
  let period = periods.find((p) => p.to - p.from === 4) || periods[periods.length - 1];

  const draw = () => {
    const exists = _layersOf(source).length > 0;
    ctx.body.innerHTML = `
      <div class="dg-page">
        <p class="dg-page__lead">${esc(source.sentence)}</p>
        ${_scopeHtml(territory, scope)}
        <div class="adm-form-group"><label class="adm-label" for="dg-src-period">Période</label>
          <select class="adm-select" id="dg-src-period">${periods.map((p) => `<option value="${p.key}" ${p.key === period.key ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
          <div class="adm-form-hint">Chaque année demande une trentaine de mégaoctets à lire : comptez quelques secondes par année.</div>
        </div>
        ${_whatHtml(source)}
        ${_existingHtml(source)}
        <div class="dg-page__actions">
          <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add"><i class="fa-solid fa-plus"></i> ${exists ? 'Ajouter à nouveau' : 'Ajouter au diagnostic'}</button>
          <a class="adm-btn adm-btn--secondary" href="https://www.data.gouv.fr/datasets/bases-de-donnees-annuelles-des-accidents-corporels-de-la-circulation-routiere-annees-de-2005-a-2024" target="_blank" rel="noopener">Voir la source</a>
        </div>
        <div id="dg-src-progress"></div>
      </div>`;
    ctx.body.querySelectorAll('#dg-src-scope button').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope; draw(); }));
    ctx.body.querySelector('#dg-src-period')?.addEventListener('change', (e) => { period = periods.find((p) => p.key === e.target.value) || period; });
    ctx.body.querySelector('#dg-src-add')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const p = _progress(ctx.body.querySelector('#dg-src-progress'));
      try {
        p.step('Communes du territoire…');
        const codes = await communeCodesFor(territory, scope);
        const chosen = available.filter((y) => y >= period.from && y <= period.to);
        const features = [];
        for (const y of chosen) features.push(...await fetchBaacYear(y, years.get(y), codes, (msg) => p.step(msg)));
        if (!features.length) throw new Error('Aucun accident corporel géolocalisé sur ce territoire pour cette période.');
        p.step(`Enregistrement de ${_fmt(features.length)} accidents…`);
        const { features: prepared } = prepareDraft({ type: 'FeatureCollection', features });
        const code = scope === 'epci' ? territory.epci.code : territory.commune.code;
        const row = await persistStorageLayer({
          features: prepared, keep: null, cfg: baacLayerCfg(chosen, scopeLabel(territory, scope).replace(/ \(.*\)$/, '')),
          source: source.id, dataset: `baac-${scope}-${code}-${period.key}`, sort_order: dg.layers.length,
        });
        p.done();
        await _finish(ctx, [row]);
      } catch (err) {
        p.fail(err.message || String(err));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Compteurs vélo (pages publiques Eco-Compteur) */
async function _renderCounters(ctx, source) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche de votre territoire…</div></div>`;
  let territory;
  try { territory = await _territoryOrError(ctx); } catch (e) {
    ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div></div>`;
    return;
  }
  let scope = territory.epci ? 'epci' : 'commune';
  const draw = () => {
    const exists = _layersOf(source).length > 0;
    ctx.body.innerHTML = `
      <div class="dg-page">
        <p class="dg-page__lead">${esc(source.sentence)}</p>
        ${_scopeHtml(territory, scope)}
        ${_whatHtml(source)}
        ${_existingHtml(source)}
        <div class="dg-page__actions">
          <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add"><i class="fa-solid fa-plus"></i> ${exists ? 'Ajouter à nouveau' : 'Ajouter au diagnostic'}</button>
          <a class="adm-btn adm-btn--secondary" href="https://reseau-velo-marche.org/observatoires/frequentation/comptages/" target="_blank" rel="noopener">Voir la source</a>
        </div>
        <div id="dg-src-progress"></div>
      </div>`;
    ctx.body.querySelectorAll('#dg-src-scope button').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope; draw(); }));
    ctx.body.querySelector('#dg-src-add')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const p = _progress(ctx.body.querySelector('#dg-src-progress'));
      try {
        p.step('Contours du territoire…');
        const contours = await resolveContours(territory, scope);
        const fc = await fetchCounters(contours, (msg) => p.step(msg));
        if (!fc.features.length) throw new Error('Aucun compteur public n\'est recensé sur ce territoire. Si votre collectivité en possède, demandez à son gestionnaire de les publier sur la plateforme nationale des fréquentations.');
        p.step(`Enregistrement de ${_fmt(fc.features.length)} compteurs…`);
        const { features } = prepareDraft(fc);
        const code = scope === 'epci' ? territory.epci.code : territory.commune.code;
        const row = await persistStorageLayer({
          features, keep: null, cfg: countersLayerCfg(scopeLabel(territory, scope).replace(/ \(.*\)$/, '')),
          source: source.id, dataset: `counters-${scope}-${code}`, sort_order: dg.layers.length,
        });
        p.done();
        await _finish(ctx, [row]);
      } catch (err) {
        p.fail(err.message || String(err));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Un lien à coller (Waze for Cities) */
function _renderLink(ctx, source) {
  ctx.body.innerHTML = `
    <div class="dg-page">
      <p class="dg-page__lead">${esc(source.sentence)}</p>
      ${_tutorialHtml(source)}
      <div class="adm-form-group">
        <label class="adm-label" for="dg-src-link">Lien du flux</label>
        <div class="dg-url-row">
          <input type="url" class="adm-input" id="dg-src-link" placeholder="${escAttr(source.linkPlaceholder || 'https://…')}" autocomplete="off" spellcheck="false">
          <button type="button" class="adm-btn adm-btn--secondary" id="dg-src-check">Vérifier</button>
        </div>
      </div>
      ${_existingHtml(source)}
      <div id="dg-src-result"></div>
    </div>`;
  const input = ctx.body.querySelector('#dg-src-link');
  const result = ctx.body.querySelector('#dg-src-result');
  const check = async () => {
    const feed = input.value.trim();
    if (!feed) { input.focus(); return; }
    const btn = ctx.body.querySelector('#dg-src-check');
    btn.disabled = true;
    result.innerHTML = '';
    const p = _progress(result);
    p.step('Lecture du flux…');
    try {
      const counts = await checkWazeFeed(feed);
      p.remove();
      result.innerHTML = `
        <div class="dg-reco">
          <div class="dg-reco__head"><span class="dg-reco__ok"><i class="fa-solid fa-check"></i></span> Flux Waze valide</div>
          <dl class="dg-reco__facts">
            <div><dt>En ce moment</dt><dd>${_fmt(counts.alerts)} alerte${counts.alerts > 1 ? 's' : ''} et ${_fmt(counts.jams)} ralentissement${counts.jams > 1 ? 's' : ''}</dd></div>
          </dl>
          ${_whatHtml(source)}
        </div>
        <div class="dg-page__actions">
          <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add"><i class="fa-solid fa-plus"></i> Ajouter au diagnostic</button>
        </div>
        <div id="dg-src-progress"></div>`;
      result.querySelector('#dg-src-add').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const pp = _progress(result.querySelector('#dg-src-progress'));
        try {
          const rows = [];
          for (const { cfg, source_ref } of wazeLayerCfgs(feed)) {
            pp.step(`Enregistrement : ${cfg.label}…`);
            const { data, error } = await api.upsertDiagnosticLayer({
              label: cfg.label,
              group_label: cfg.group_label,
              source_type: 'url',
              source_ref,
              style: cfg.style,
              popup: layerPopup(cfg, source.id, 'waze-feed'),
              ai_context: cfg.ai_context,
              default_on: cfg.default_on,
              sort_order: dg.layers.length + rows.length,
            });
            if (error) throw error;
            rows.push(data);
          }
          pp.done();
          await _finish(ctx, rows);
        } catch (err) {
          pp.fail(err.message || String(err));
          btn.disabled = false;
        }
      });
    } catch (err) {
      p.fail(err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  };
  ctx.body.querySelector('#dg-src-check').addEventListener('click', check);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
}

/* Un export à déposer (Strava Metro…) */
function _renderFile(ctx, source, dropped = null) {
  ctx.body.innerHTML = `
    <div class="dg-page">
      <p class="dg-page__lead">${esc(source.sentence)}</p>
      ${_tutorialHtml(source)}
      <label class="dg-cat__drop dg-cat__drop--tall" id="dg-src-drop">
        <input type="file" id="dg-src-file" multiple accept=".geojson,.json,.csv,.zip,.shp,.dbf,.shx,.prj,.cpg" hidden>
        <span class="dg-cat__drop-ico"><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
        <span class="dg-cat__drop-txt"><b>Déposez l'export ici</b><span>${esc(source.dropHint || 'Fichier, dossier ou archive, tels que téléchargés.')}</span></span>
      </label>
      ${_existingHtml(source)}
      <div id="dg-src-result"></div>
    </div>`;
  const drop = ctx.body.querySelector('#dg-src-drop');
  const input = ctx.body.querySelector('#dg-src-file');
  input.addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) _fileDropped(ctx, source, files);
  });
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', async (e) => {
    const files = await filesFromDataTransfer(e.dataTransfer).catch(() => [...e.dataTransfer.files]);
    if (files.length) _fileDropped(ctx, source, files);
  });
  if (dropped) _showRecognized(ctx, source, dropped);
}

async function _fileDropped(ctx, source, files) {
  const result = ctx.body.querySelector('#dg-src-result');
  result.innerHTML = '';
  const p = _progress(result);
  p.step('Lecture des fichiers…');
  try {
    const dropped = await _recognize(files);
    p.remove();
    if (!dropped.recipe || dropped.recipe.id !== source.recipeId) {
      const other = dropped.recipe ? SOURCES.find((s) => s.recipeId === dropped.recipe.id) : null;
      result.innerHTML = `
        <div class="dg-cat__error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>${other
            ? `Ce fichier ressemble à un export « ${esc(other.name)} », pas à ${esc(source.name)}.`
            : `Nous ne reconnaissons pas ces fichiers comme un export ${esc(source.name)}. Vérifiez qu'il s'agit bien de l'archive téléchargée, avec son tableau.`}
          </div>
        </div>
        <div class="dg-page__actions">
          ${other ? `<button type="button" class="adm-btn adm-btn--primary" id="dg-src-switch">Ouvrir « ${esc(other.name)} »</button>` : ''}
          <button type="button" class="adm-btn adm-btn--secondary" id="dg-src-adv">Décrire moi-même ces données</button>
        </div>`;
      result.querySelector('#dg-src-switch')?.addEventListener('click', () => _openSource(ctx, other, dropped));
      result.querySelector('#dg-src-adv')?.addEventListener('click', () => _openAdvanced(ctx, { files }));
      return;
    }
    _showRecognized(ctx, source, dropped);
  } catch (e) {
    p.fail(e.message || String(e));
  }
}

async function _showRecognized(ctx, source, dropped) {
  const result = ctx.body.querySelector('#dg-src-result');
  const drop = ctx.body.querySelector('#dg-src-drop');
  if (drop) drop.hidden = true;
  result.innerHTML = `<div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Lecture du tableau…</div>`;
  const { recipe, table, features } = dropped;
  let filter = null;
  try { filter = await recipeFilterValues(table, recipe); } catch (e) { result.innerHTML = `<div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</div>`; return; }
  const sortedValues = filter ? filter.values.map(([v]) => v).sort() : [];
  result.innerHTML = `
    <div class="dg-reco">
      <div class="dg-reco__head"><span class="dg-reco__ok"><i class="fa-solid fa-check"></i></span> ${esc(recipe.name)} reconnu</div>
      <dl class="dg-reco__facts">
        <div><dt>Entités</dt><dd>${_fmt(features.length)}</dd></div>
        ${filter ? `<div><dt>${esc(recipe.join.filterLabel || filter.column)}</dt><dd>${sortedValues.length > 1 ? `de ${esc(sortedValues[0])} à ${esc(sortedValues[sortedValues.length - 1])}` : esc(sortedValues[0] || '')}</dd></div>
        <div><dt>Retenu</dt><dd><select class="adm-select adm-select--inline" id="dg-src-filter">${filter.values.map(([v, n]) => `<option value="${escAttr(v)}" ${v === filter.chosen ? 'selected' : ''}>${esc(v)} (${_fmt(n)})</option>`).join('')}</select></dd></div>` : ''}
      </dl>
      ${_whatHtml(source)}
    </div>
    <div class="dg-page__actions">
      <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add"><i class="fa-solid fa-plus"></i> Ajouter au diagnostic</button>
      <button type="button" class="adm-btn adm-btn--secondary" id="dg-src-other">Autre fichier</button>
    </div>
    <button type="button" class="dg-cat__advlink" id="dg-src-adv"><i class="fa-solid fa-sliders"></i> Réglages avancés <span>nom, colonnes reprises, couleur, champs de la fenêtre au clic</span></button>
    <div id="dg-src-progress"></div>`;

  const run = async (p) => {
    const filterValue = filter ? result.querySelector('#dg-src-filter').value : '';
    p.step('Rattachement du tableau…');
    const out = await runRecipe({ features, fields: dropped.fields, table, recipe, filterColumn: filter?.column || '', filterValue });
    return { out, filterValue };
  };
  result.querySelector('#dg-src-other').addEventListener('click', () => _renderFile(ctx, source));
  result.querySelector('#dg-src-add').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const p = _progress(result.querySelector('#dg-src-progress'));
    try {
      const { out, filterValue } = await run(p);
      p.step(`Enregistrement de ${_fmt(out.features.length)} entités…`);
      const row = await persistStorageLayer({
        features: out.features, keep: out.keep, cfg: out.cfg,
        source: source.id, dataset: `${recipe.id}-${filterValue || 'all'}`, sort_order: dg.layers.length,
      });
      p.done();
      await _finish(ctx, [row]);
    } catch (err) {
      p.fail(err.message || String(err));
      btn.disabled = false;
    }
  });
  result.querySelector('#dg-src-adv').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const p = _progress(result.querySelector('#dg-src-progress'));
    try {
      const { out } = await run(p);
      p.remove();
      const onAdded = ctx.onAdded;
      ctx.close();
      openLayerWizard({
        prefill: { name: dropped.name, features: out.features, fields: out.fields, keep: out.keep, cfg: out.cfg, source: source.id },
        onSaved: (row) => onAdded?.([row]),
      });
    } catch (err) {
      p.fail(err.message || String(err));
      btn.disabled = false;
    }
  });
}

/* Annoncée */
function _renderSoon(ctx, source) {
  ctx.body.innerHTML = `
    <div class="dg-page">
      <p class="dg-page__lead">${esc(source.sentence || source.description)}</p>
      ${_tutorialHtml(source)}
      <div class="dg-cat__note"><i class="fa-solid fa-clock"></i> Cette source arrive prochainement. Vous n'avez rien à préparer.</div>
    </div>`;
}
