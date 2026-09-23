/**
 * Diagnostic terrain - « Ajouter des données ».
 * Le catalogue des sources et la page de chaque source : ce que c'est, ce
 * qu'il faut faire (rien, déposer un fichier, créer un compte) et un seul
 * bouton. Les mots techniques restent dans le wizard avancé (wizard.js),
 * accessible par « Décrire ce fichier moi-même » et par les réglages avancés.
 *
 * Un import fixe sa collectivité à l'ouverture du catalogue (`ctx.city`) :
 * changer d'espace pendant la lecture d'un fichier n'enregistre jamais la
 * couche ailleurs. Chaque page du catalogue porte un jeton : la réponse
 * tardive d'une source ne remplace jamais la page que l'on regarde.
 */

import * as api from '../../api.js';
import { store } from '../../store.js';
import { esc, escAttr, toast } from '../../components/ui.js';
import { dg, INTERNAL_SOURCES, DEFAULT_STYLE, onCleanup } from './state.js';
import { FAMILIES, SOURCES, sourceOfLayer } from './sources.js';
import {
  readDrop, loadGeo, prepareDraft, inspectTable, recipeFor, recipeFilterValues, runRecipe,
  persistStorageLayer, layerPopup,
} from './engine.js';
import { filesFromDataTransfer, readableError, countLabel } from './data.js';
import { resolveTerritory, scopeLabel, resolveContours, communeCodesFor } from './sources/territory.js';
import { listFubDatasets, fetchFubLayers, fubLayerCfg } from './sources/fub.js';
import { fetchCycleways, cyclewaysLayerCfg } from './sources/osm.js';
import { listBaacYears, fetchBaacYear, baacLayerCfg, baacPeriods, yearsLabel } from './sources/baac.js';
import { checkWazeFeed, wazeLayerCfgs } from './sources/waze.js';
import { fetchCounters, countersLayerCfg } from './sources/counters.js';
import { openLayerWizard } from './wizard.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const familyLabel = (key) => FAMILIES.find((f) => f.key === key)?.label || '';
const ADD_FAILED = 'L\'ajout n\'a pas abouti. Vérifiez votre connexion, puis réessayez.';

/** Nom d'un périmètre pour une couche : « Lyon », « Métropole de Lyon ». */
const _scopeName = (territory, scope) => scopeLabel(territory, scope).replace(/ \(.*\)$/, '');

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
    // Collectivité de l'import, fixée à l'ouverture.
    city: store.city,
    brand: dg.branding?.brand_name || store.city || '',
    territory: null,
    territoryError: null,
    pageSeq: 0,
    closed: false,
    // La section a été quittée (ou l'espace changé) : la carte affichée
    // n'est plus celle de cet import.
    dead: false,
    close: null,
  };

  const onKeydown = (e) => { if (e.key === 'Escape') ctx.close(); };
  ctx.close = () => {
    ctx.closed = true;
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  document.addEventListener('keydown', onKeydown);
  onCleanup(() => { ctx.dead = true; ctx.close(); });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', ctx.close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) ctx.close(); });
  overlay.querySelector('#dg-cat-back').addEventListener('click', () => _renderHome(ctx));

  // Le territoire sert aux sources publiques : résolu en fond dès l'ouverture.
  resolveTerritory()
    .then((t) => { ctx.territory = t; _updateSubtitle(ctx); })
    .catch((e) => { ctx.territoryError = readableError(e, 'Votre territoire n\'a pas pu être retrouvé. Réessayez dans quelques minutes.'); _updateSubtitle(ctx); });

  _renderHome(ctx);
}

/** Entre dans une page ; la fonction rendue dit si cette page est toujours celle affichée. */
function _enterPage(ctx) {
  const token = ++ctx.pageSeq;
  return () => !ctx.closed && ctx.pageSeq === token;
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
    const rt = dg.runtime.get(mine[0].id);
    const n = mine.reduce((acc, l) => acc + (dg.runtime.get(l.id)?.count || 0), 0);
    const detail = mine.length > 1 ? `${mine.length} couches` : (n ? countLabel(n, rt?.features) : '1 couche');
    return { cls: 'done', text: `Déjà ajouté · ${detail}` };
  }
  if (source.mode === 'file') return { cls: 'file', text: 'Un fichier à déposer · nous expliquons' };
  if (source.mode === 'link') return { cls: 'file', text: 'Un lien à coller · nous expliquons' };
  return { cls: 'auto', text: 'Aucun fichier à fournir' };
}

function _renderHome(ctx) {
  const current = _enterPage(ctx);
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
        <b>Déposez ici un fichier de votre territoire : un tableau avec des coordonnées, un fichier cartographique ou l'archive d'un export.</b>
        <span>Nous réglons nous-mêmes les exports que nous connaissons, et un assistant s'ouvre pour tout autre fichier. Pour une adresse en ligne, <button type="button" class="dg-cat__link" id="dg-cat-advanced">ajoutez une couche à la main</button>.</span>
      </span>
    </label>
    <div id="dg-cat-drop-error"></div>
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
    if (files.length) _handleAnyDrop(ctx, files, current);
  });
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', async (e) => {
    const files = await filesFromDataTransfer(e.dataTransfer).catch(() => [...e.dataTransfer.files]);
    if (files.length) _handleAnyDrop(ctx, files, current);
  });
}

/**
 * Un fichier déposé sans avoir choisi de source : s'il correspond à un
 * export connu, sa page s'ouvre déjà remplie ; sinon, le wizard avancé
 * prend le relais avec le fichier chargé.
 */
async function _handleAnyDrop(ctx, files, current) {
  const drop = ctx.body.querySelector('#dg-cat-drop');
  const errorBox = ctx.body.querySelector('#dg-cat-drop-error');
  if (errorBox) errorBox.innerHTML = '';
  if (drop) drop.classList.add('is-busy');
  try {
    const dropped = await _recognize(files);
    if (!current()) return;
    if (dropped.recipe) {
      const source = SOURCES.find((s) => s.recipeId === dropped.recipe.id);
      if (source) { _openSource(ctx, source, dropped); return; }
    }
    _openAdvanced(ctx, { files });
  } catch (e) {
    if (!current()) return;
    if (drop) drop.classList.remove('is-busy');
    if (errorBox) errorBox.innerHTML = `<div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i><div>${esc(readableError(e, 'Ce fichier n\'a pas pu être lu. Vérifiez qu\'il s\'ouvre sur votre ordinateur, puis déposez-le de nouveau.'))}</div></div>`;
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
  openLayerWizard({ ...opts, city: ctx.city, onSaved: (row) => onAdded?.([row]) });
}

/* ── Page d'une source ──────────────────────────────────────────── */

function _openSource(ctx, source, dropped = null) {
  const current = _enterPage(ctx);
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
  render?.(ctx, source, dropped, current);
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

/** Page d'erreur d'une source : la phrase d'accroche, puis ce qui a manqué. */
function _pageError(ctx, source, message) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(message)}</div></div>`;
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

/**
 * Termine un ajout : message, puis couches montrées sur la carte. Le
 * catalogue ne se ferme que si l'on regarde encore la page de cet ajout.
 */
async function _finish(ctx, rows, current) {
  const message = rows.length > 1 ? `${rows.length} couches ajoutées au diagnostic` : 'Couche ajoutée au diagnostic';
  if (ctx.dead) {
    // Section quittée ou espace changé pendant l'import : la couche est bien
    // enregistrée chez la collectivité de départ, qui n'est plus affichée.
    toast(ctx.brand ? `${message} de ${ctx.brand}` : message, 'success');
    return;
  }
  if (current()) ctx.close();
  toast(message, 'success');
  await ctx.onAdded?.(rows);
}

/* Interne : signalements, projets, chantiers */
function _renderInternal(ctx, source, _dropped, current) {
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
      }, ctx.city);
      if (error) throw error;
      p.done();
      await _finish(ctx, [data], current);
    } catch (err) {
      console.warn('[admin/diagnostic] Ajout interne:', err);
      p.fail(readableError(err, ADD_FAILED));
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

/** « le périmètre « Grenoble-Alpes-Métropole » » quand le périmètre peut s'élargir à l'intercommunalité. */
function _widerScope(territory, scope) {
  return scope === 'commune' && territory.epci ? `le périmètre « ${territory.epci.nom} »` : '';
}

/* Baromètre vélo FUB */
async function _renderFub(ctx, source, _dropped, current) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche des données de votre territoire…</div></div>`;
  let territory, datasets;
  try {
    territory = await _territoryOrError(ctx);
    datasets = await listFubDatasets({ communeCode: territory.commune.code, epciCode: territory.epci?.code, city: ctx.city });
  } catch (e) {
    if (current()) _pageError(ctx, source, readableError(e, 'La plateforme de la FUB n\'a pas pu être consultée. Réessayez dans quelques minutes.'));
    return;
  }
  if (!current()) return;
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
      const order = dg.layers.length;
      try {
        const layers = await fetchFubLayers(d.uid, (msg) => p.step(msg), ctx.city);
        const rows = [];
        const group = `Baromètre vélo ${y} · ${_scopeName(territory, scope)}`;
        for (const { def, fc } of layers) {
          p.step(`Enregistrement : ${def.label} (${countLabel(fc.features.length, fc.features)})…`);
          const { features } = prepareDraft(fc);
          rows.push(await persistStorageLayer({
            features, keep: null, cfg: fubLayerCfg(def, y, group),
            source: source.id, dataset: d.id, sort_order: order + rows.length, city: ctx.city,
          }));
        }
        p.done();
        await _finish(ctx, rows, current);
      } catch (err) {
        console.warn('[admin/diagnostic] Baromètre vélo:', err);
        p.fail(readableError(err, ADD_FAILED));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Aménagements cyclables OpenStreetMap */
async function _renderOsm(ctx, source, _dropped, current) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche de votre territoire…</div></div>`;
  let territory;
  try { territory = await _territoryOrError(ctx); } catch (e) {
    if (current()) _pageError(ctx, source, readableError(e, 'Votre territoire n\'a pas pu être retrouvé. Réessayez dans quelques minutes.'));
    return;
  }
  if (!current()) return;
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
      const order = dg.layers.length;
      try {
        const codes = scope === 'epci' && territory.epci?.communes?.length
          ? territory.epci.communes.map((c) => c.code)
          : [territory.commune.code];
        const fc = await fetchCycleways(codes, { onProgress: (msg) => p.step(msg) });
        if (!fc.features.length) {
          const wider = _widerScope(territory, scope);
          throw new Error(`Aucun aménagement cyclable n'est cartographié dans OpenStreetMap sur ce territoire.${wider ? ` Choisissez ${wider} pour chercher plus largement.` : ''}`);
        }
        p.step(`Enregistrement de ${countLabel(fc.features.length, fc.features)}…`);
        const { features } = prepareDraft(fc);
        const row = await persistStorageLayer({
          features, keep: null, cfg: cyclewaysLayerCfg(_scopeName(territory, scope)),
          source: source.id, dataset: `osm-cycleways-${scope}-${scope === 'epci' ? territory.epci.code : territory.commune.code}`,
          sort_order: order, city: ctx.city,
        });
        p.done();
        await _finish(ctx, [row], current);
      } catch (err) {
        console.warn('[admin/diagnostic] OpenStreetMap:', err);
        p.fail(readableError(err, ADD_FAILED));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Accidents corporels (fichier national BAAC) */
async function _renderBaac(ctx, source, _dropped, current) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche des fichiers nationaux et de votre territoire…</div></div>`;
  let territory, years;
  try {
    [territory, years] = await Promise.all([_territoryOrError(ctx), listBaacYears()]);
  } catch (e) {
    if (current()) _pageError(ctx, source, readableError(e, 'Le fichier national n\'a pas pu être consulté. Réessayez dans quelques minutes.'));
    return;
  }
  if (!current()) return;
  const available = [...years.keys()];
  if (!available.length) {
    ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-cat__error"><i class="fa-solid fa-circle-info"></i> Nous ne trouvons aucun fichier annuel complet sur data.gouv.fr. Réessayez plus tard ; si ce message revient, écrivez-nous depuis openprojets.com/contact.</div></div>`;
    return;
  }
  // Périodes tirées des années réellement publiées : une année absente n'est
  // jamais annoncée ni comptée.
  const { periods, defaultKey } = baacPeriods(available);
  let scope = 'commune';
  let period = periods.find((p) => p.key === defaultKey) || periods[periods.length - 1];

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
      const order = dg.layers.length;
      const chosen = period;
      try {
        p.step('Communes du territoire…');
        const codes = await communeCodesFor(territory, scope);
        const features = [];
        const loaded = [];
        for (const y of chosen.years) {
          // Jamais push(...liste) : une intercommunalité peut compter des
          // dizaines de milliers d'accidents sur plusieurs années.
          for (const f of await fetchBaacYear(y, years.get(y), codes, (msg) => p.step(msg))) features.push(f);
          loaded.push(y);
        }
        if (!features.length) throw new Error(_noAccidentMessage(territory, scope, loaded, periods, chosen));
        p.step(`Enregistrement de ${_fmt(features.length)} accident${features.length > 1 ? 's' : ''}…`);
        const { features: prepared } = prepareDraft({ type: 'FeatureCollection', features });
        const code = scope === 'epci' ? territory.epci.code : territory.commune.code;
        const row = await persistStorageLayer({
          features: prepared, keep: null, cfg: baacLayerCfg(loaded, _scopeName(territory, scope)),
          source: source.id, dataset: `baac-${scope}-${code}-${loaded.join('-')}`, sort_order: order, city: ctx.city,
        });
        p.done();
        await _finish(ctx, [row], current);
      } catch (err) {
        console.warn('[admin/diagnostic] Accidents corporels:', err);
        p.fail(readableError(err, ADD_FAILED));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/** Aucun accident sur la période : dire ce qui a été lu, et ce qui reste possible. */
function _noAccidentMessage(territory, scope, loaded, periods, chosen) {
  const when = loaded.length > 1 ? `sur les années ${yearsLabel(loaded)}` : `en ${loaded[0]}`;
  const options = [];
  if (periods.some((p) => p.years.length > chosen.years.length)) options.push('une période plus longue');
  const wider = _widerScope(territory, scope);
  if (wider) options.push(wider);
  return `Le fichier national ne compte aucun accident corporel localisé sur ce territoire ${when}.${options.length ? ` Choisissez ${options.join(' ou ')}.` : ''}`;
}

/* Compteurs vélo (pages publiques Eco-Compteur) */
async function _renderCounters(ctx, source, _dropped, current) {
  ctx.body.innerHTML = `<div class="dg-page"><p class="dg-page__lead">${esc(source.sentence)}</p><div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Recherche de votre territoire…</div></div>`;
  let territory;
  try { territory = await _territoryOrError(ctx); } catch (e) {
    if (current()) _pageError(ctx, source, readableError(e, 'Votre territoire n\'a pas pu être retrouvé. Réessayez dans quelques minutes.'));
    return;
  }
  if (!current()) return;
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
      const order = dg.layers.length;
      try {
        p.step('Contours du territoire…');
        const contours = await resolveContours(territory, scope);
        const fc = await fetchCounters(contours, (msg) => p.step(msg));
        if (!fc.features.length) throw new Error('Aucun compteur public n\'est recensé sur ce territoire. Si votre collectivité en possède, demandez à son gestionnaire de les publier sur la plateforme nationale des fréquentations.');
        p.step(`Enregistrement de ${_fmt(fc.features.length)} compteur${fc.features.length > 1 ? 's' : ''}…`);
        const { features } = prepareDraft(fc);
        const code = scope === 'epci' ? territory.epci.code : territory.commune.code;
        const row = await persistStorageLayer({
          features, keep: null, cfg: countersLayerCfg(_scopeName(territory, scope)),
          source: source.id, dataset: `counters-${scope}-${code}`, sort_order: order, city: ctx.city,
        });
        p.done();
        await _finish(ctx, [row], current);
      } catch (err) {
        console.warn('[admin/diagnostic] Compteurs:', err);
        p.fail(readableError(err, ADD_FAILED));
        btn.disabled = false;
      }
    });
  };
  draw();
}

/* Un lien à coller (Waze for Cities) */
function _renderLink(ctx, source, _dropped, current) {
  ctx.body.innerHTML = `
    <div class="dg-page">
      <p class="dg-page__lead">${esc(source.sentence)}</p>
      ${_tutorialHtml(source)}
      <div class="adm-form-group">
        <label class="adm-label" for="dg-src-link">Lien du flux</label>
        <div class="dg-url-row">
          <input type="url" class="adm-input" id="dg-src-link" placeholder="${escAttr(source.linkPlaceholder || 'https://…')}" autocomplete="off" spellcheck="false">
          <button type="button" class="adm-btn adm-btn--secondary" id="dg-src-check">Vérifier le lien</button>
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
      const counts = await checkWazeFeed(feed, ctx.city);
      if (!current()) return;
      p.remove();
      result.innerHTML = `
        <div class="dg-reco">
          <div class="dg-reco__head"><span class="dg-reco__ok"><i class="fa-solid fa-check"></i></span> Le lien de votre flux Waze fonctionne.</div>
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
        const addBtn = e.currentTarget;
        addBtn.disabled = true;
        const pp = _progress(result.querySelector('#dg-src-progress'));
        const order = dg.layers.length;
        try {
          const rows = [];
          for (const { cfg, source_ref } of wazeLayerCfgs(feed, ctx.city)) {
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
              sort_order: order + rows.length,
            }, ctx.city);
            if (error) throw error;
            rows.push(data);
          }
          pp.done();
          await _finish(ctx, rows, current);
        } catch (err) {
          console.warn('[admin/diagnostic] Waze:', err);
          pp.fail(readableError(err, ADD_FAILED));
          addBtn.disabled = false;
        }
      });
    } catch (err) {
      p.fail(readableError(err, 'Le lien n\'a pas pu être vérifié. Vérifiez votre connexion, puis réessayez.'));
    } finally {
      btn.disabled = false;
    }
  };
  ctx.body.querySelector('#dg-src-check').addEventListener('click', check);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
}

/* Un export à déposer (Strava Metro…) */
function _renderFile(ctx, source, dropped = null, current = () => true) {
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
    if (files.length) _fileDropped(ctx, source, files, current);
  });
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', async (e) => {
    const files = await filesFromDataTransfer(e.dataTransfer).catch(() => [...e.dataTransfer.files]);
    if (files.length) _fileDropped(ctx, source, files, current);
  });
  if (dropped) _showRecognized(ctx, source, dropped, current);
}

async function _fileDropped(ctx, source, files, current) {
  const result = ctx.body.querySelector('#dg-src-result');
  result.innerHTML = '';
  const p = _progress(result);
  p.step('Lecture des fichiers…');
  try {
    const dropped = await _recognize(files);
    if (!current()) return;
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
          <button type="button" class="adm-btn adm-btn--secondary" id="dg-src-adv">Décrire ce fichier moi-même</button>
        </div>`;
      result.querySelector('#dg-src-switch')?.addEventListener('click', () => _openSource(ctx, other, dropped));
      result.querySelector('#dg-src-adv')?.addEventListener('click', () => _openAdvanced(ctx, { files }));
      return;
    }
    _showRecognized(ctx, source, dropped, current);
  } catch (e) {
    if (!current()) return;
    p.fail(readableError(e, 'Ces fichiers n\'ont pas pu être lus. Vérifiez qu\'il s\'agit bien de l\'archive téléchargée, puis déposez-la de nouveau.'));
  }
}

/** « Tronçons », « Points » : le nom des éléments d'un export, pour une ligne de faits. */
function _nounTitle(features) {
  const label = countLabel(2, features).replace(/^\d+\s/, '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function _showRecognized(ctx, source, dropped, current) {
  const result = ctx.body.querySelector('#dg-src-result');
  const drop = ctx.body.querySelector('#dg-src-drop');
  if (drop) drop.hidden = true;
  result.innerHTML = `<div class="dg-page__loading"><i class="fa-solid fa-spinner fa-spin"></i> Lecture du tableau…</div>`;
  const { recipe, table, features } = dropped;
  let filter = null;
  try {
    filter = await recipeFilterValues(table, recipe);
  } catch (e) {
    if (current()) result.innerHTML = `<div class="dg-cat__error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(readableError(e, 'Le tableau de cet export n\'a pas pu être lu. Déposez de nouveau l\'archive téléchargée.'))}</div>`;
    return;
  }
  if (!current()) return;
  const sortedValues = filter ? filter.values.map(([v]) => v).sort() : [];
  result.innerHTML = `
    <div class="dg-reco">
      <div class="dg-reco__head"><span class="dg-reco__ok"><i class="fa-solid fa-check"></i></span> Nous avons reconnu un export ${esc(recipe.name)}.</div>
      <dl class="dg-reco__facts">
        <div><dt>${esc(_nounTitle(features))}</dt><dd>${_fmt(features.length)}</dd></div>
        ${filter ? `<div><dt>${esc(recipe.join.filterLabel || filter.column)}</dt><dd>${sortedValues.length > 1 ? `de ${esc(sortedValues[0])} à ${esc(sortedValues[sortedValues.length - 1])}` : esc(sortedValues[0] || '')}</dd></div>
        <div><dt>${esc(recipe.join.filterChosenLabel || 'Valeur retenue')}</dt><dd><select class="adm-select adm-select--inline" id="dg-src-filter" aria-label="${escAttr(recipe.join.filterChosenLabel || 'Valeur retenue')}">${filter.values.map(([v, n]) => `<option value="${escAttr(v)}" ${v === filter.chosen ? 'selected' : ''}>${esc(v)} (${_fmt(n)})</option>`).join('')}</select></dd></div>` : ''}
      </dl>
      ${_whatHtml(source)}
    </div>
    <div class="dg-page__actions">
      <button type="button" class="adm-btn adm-btn--primary dg-page__cta" id="dg-src-add"><i class="fa-solid fa-plus"></i> Ajouter au diagnostic</button>
      <button type="button" class="adm-btn adm-btn--secondary" id="dg-src-other">Déposer un autre fichier</button>
    </div>
    <button type="button" class="dg-cat__advlink" id="dg-src-adv"><i class="fa-solid fa-sliders"></i> Ouvrir les réglages avancés <span>nom, colonnes conservées, couleurs, ce qui s'affiche au clic</span></button>
    <div id="dg-src-progress"></div>`;

  const run = async (p) => {
    const filterValue = filter ? result.querySelector('#dg-src-filter').value : '';
    p.step('Rattachement du tableau…');
    const out = await runRecipe({ features, fields: dropped.fields, table, recipe, filterColumn: filter?.column || '', filterValue });
    return { out, filterValue };
  };
  result.querySelector('#dg-src-other').addEventListener('click', () => _renderFile(ctx, source, null, current));
  result.querySelector('#dg-src-add').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const p = _progress(result.querySelector('#dg-src-progress'));
    const order = dg.layers.length;
    try {
      const { out, filterValue } = await run(p);
      p.step(`Enregistrement de ${countLabel(out.features.length, out.features)}…`);
      const row = await persistStorageLayer({
        features: out.features, keep: out.keep, cfg: out.cfg,
        source: source.id, dataset: `${recipe.id}-${filterValue || 'all'}`, sort_order: order, city: ctx.city,
      });
      p.done();
      await _finish(ctx, [row], current);
    } catch (err) {
      console.warn('[admin/diagnostic] Export reconnu:', err);
      p.fail(readableError(err, ADD_FAILED));
      btn.disabled = false;
    }
  });
  result.querySelector('#dg-src-adv').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const p = _progress(result.querySelector('#dg-src-progress'));
    try {
      const { out } = await run(p);
      if (!current()) return;
      p.remove();
      const onAdded = ctx.onAdded;
      ctx.close();
      openLayerWizard({
        prefill: { name: dropped.name, features: out.features, fields: out.fields, keep: out.keep, cfg: out.cfg, source: source.id },
        city: ctx.city,
        onSaved: (row) => onAdded?.([row]),
      });
    } catch (err) {
      p.fail(readableError(err, 'Les réglages avancés n\'ont pas pu s\'ouvrir. Réessayez.'));
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
