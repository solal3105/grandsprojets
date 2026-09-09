/**
 * Diagnostic terrain - wizard d'ajout / édition d'une couche.
 * Modale en 5 étapes : source (GeoJSON, CSV géolocalisé, shapefile zippé,
 * lien, données Open Projets), complément (tableau à rattacher, champs
 * conservés), identité et nature, style, popup / chiffres de zone / contexte
 * IA. Tout est persisté dans diagnostic_layers ; les fichiers sont normalisés
 * en GeoJSON et déposés dans Storage.
 */

import * as api from '../../api.js';
import { esc, escAttr, toast } from '../../components/ui.js';
import { dg, PALETTE, INTERNAL_SOURCES, DEFAULT_STYLE, LAYER_KINDS, layerKind, layerMetrics } from './state.js';
import {
  toFeatureCollection, prepareFeatures, detectFields, numericFields, guessKind, restrictProps,
  parseCsv, guessColumn, csvToFeatures, readShapefileParts, isIdLike,
  csvHead, csvDistinct, buildJoinIndex, applyJoin, guessJoinColumns, METRIC_AGGS,
  expandFiles, filesFromDataTransfer, classifyFiles, latestValue,
} from './data.js';
import { matchRecipe, resolveColumn } from './recipes.js';

const _norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

/**
 * Ouvre le wizard.
 * @param {Object} opts
 * @param {Object} [opts.layer] - Couche existante (mode édition)
 * @param {File[]} [opts.files] - Fichiers déjà déposés (depuis le catalogue) : lus à l'ouverture
 * @param {Object} [opts.prefill] - Entités et réglages déjà préparés par le moteur
 *   ({ name, features, fields, keep, cfg, source }) : « Réglages avancés » d'un export reconnu
 * @param {Function} opts.onSaved - Callback (ligne sauvegardée) après succès
 */
export function openLayerWizard({ layer = null, files = null, prefill = null, onSaved }) {
  const isEdit = !!layer;
  const isPrefilled = !isEdit && !!prefill;
  const w = {
    // draft : { kind, url, name, base, features, fields, csv, join, keep }
    //   base = entités avant jointure, features = entités courantes,
    //   keep = champs conservés (null = tous), join = tableau rattaché.
    draft: null,
    cfg: {
      label: layer?.label || '',
      group_label: layer?.group_label || '',
      kind: layer ? layerKind(layer) : 'temoignages',
      style: { ...DEFAULT_STYLE, color: PALETTE[dg.layers.length % PALETTE.length], ...layer?.style },
      popup: { title_field: '', fields: [], ...layer?.popup },
      metrics: layer ? layerMetrics(layer) : [],
      ai_context: layer?.ai_context || '',
      default_on: layer ? layer.default_on !== false : true,
    },
  };
  if (isEdit) {
    const rt = dg.runtime.get(layer.id);
    w.draft = { kind: 'edit', base: rt?.features || [], features: rt?.features || [], fields: rt?.fields || [], keep: null, join: null };
  }
  if (isPrefilled) {
    w.draft = { kind: 'file', name: prefill.name || '', base: prefill.features, features: prefill.features, fields: prefill.fields, keep: prefill.keep || null, join: null, source: prefill.source || '' };
    w.cfg = { ...w.cfg, ...prefill.cfg, style: { ...w.cfg.style, ...prefill.cfg?.style }, popup: { ...w.cfg.popup, ...prefill.cfg?.popup }, metrics: (prefill.cfg?.metrics || []).map((m) => ({ ...m })) };
  }

  const overlay = document.createElement('div');
  overlay.className = 'adm-overlay dg-modal-overlay';
  overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div class="dg-modal" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Éditer la couche' : 'Ajouter une couche'}">
      <div class="dg-modal__head">
        <div>
          <div class="dg-modal__title"><i class="fa-solid ${isEdit ? 'fa-pen' : 'fa-database'}"></i> ${isEdit ? 'Éditer la couche' : 'Ajouter une couche'}</div>
          <div class="dg-modal__sub">${isEdit ? esc(layer.label) : (isPrefilled ? 'Réglages avancés' : 'GeoJSON, CSV géolocalisé, shapefile zippé, lien open data ou données Open Projets')}</div>
        </div>
        <button type="button" class="dg-modal__close" data-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="dg-modal__body">
        ${isEdit || isPrefilled ? '' : _sourceStepHtml()}
        ${isEdit ? '' : _enrichStepHtml()}
        <div id="dg-wz-config" ${isEdit || isPrefilled ? '' : 'hidden'}>${_configStepsHtml(w)}</div>
      </div>
      <div class="dg-modal__foot">
        <button type="button" class="adm-btn adm-btn--secondary" data-close>Annuler</button>
        <button type="button" class="adm-btn adm-btn--primary" id="dg-wz-save" ${isEdit || isPrefilled ? '' : 'disabled'}>
          <i class="fa-solid fa-check"></i> ${isEdit ? 'Enregistrer' : 'Ajouter la couche'}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  document.addEventListener('keydown', onKeydown);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#dg-wz-label')?.focus();

  if (!isEdit && !isPrefilled) _bindSourceStep(overlay, w);
  if (!isEdit) _bindEnrichStep(overlay, w);
  _bindConfigSteps(overlay, w);
  if (isEdit) _refreshFieldSelectors(overlay, w);
  if (isPrefilled) {
    // Le tableau est déjà rattaché : seul l'allègement des champs reste utile.
    const enrich = overlay.querySelector('#dg-wz-enrich');
    if (enrich) enrich.hidden = false;
    const joinDrop = overlay.querySelector('#dg-wz-join-drop');
    if (joinDrop) joinDrop.closest('.adm-form-group').hidden = true;
    _renderKeepChips(overlay, w);
    _syncConfigUI(overlay, w);
    _refreshFieldSelectors(overlay, w);
    _updateSaveState(overlay, w);
  }
  if (files?.length) _readFiles(overlay, w, files);

  overlay.querySelector('#dg-wz-save')?.addEventListener('click', async () => {
    await _save(overlay, w, layer, onSaved, close);
  });
}

/* ── Étape 1 : source (mode ajout) ─────────────────────────────── */

function _sourceStepHtml() {
  const existingInternal = new Set(
    dg.layers.filter((l) => l.source_type === 'internal').map((l) => l.source_ref)
  );
  const internal = Object.entries(INTERNAL_SOURCES).filter(([key]) => !existingInternal.has(key));
  return `
    <div class="dg-step"><span class="dg-step__n">1</span><span class="dg-step__t">Source des données</span></div>
    <div class="dg-src-tabs" id="dg-src-tabs">
      <button type="button" class="dg-src-tab is-active" data-src="file"><i class="fa-solid fa-file-arrow-up"></i> Fichier</button>
      <button type="button" class="dg-src-tab" data-src="url"><i class="fa-solid fa-link"></i> Lien / API</button>
      ${internal.length ? '<button type="button" class="dg-src-tab" data-src="internal"><i class="fa-solid fa-location-dot"></i> Open Projets</button>' : ''}
    </div>
    <div data-srcpane="file">
      <label class="dg-drop" id="dg-wz-drop">
        <input type="file" id="dg-wz-file" multiple accept=".geojson,.json,.csv,.zip,.shp,.dbf,.shx,.prj,.cpg" hidden>
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <span class="dg-drop__t">Glissez un fichier, un dossier ou une archive, ou <u>parcourez</u></span>
        <span class="dg-drop__s">GeoJSON · CSV (latitude / longitude) · shapefile (.shp, .dbf, .shx, .prj) avec son tableau · zip d'un export. Les exports connus sont reconnus et configurés d'office.</span>
      </label>
    </div>
    <div data-srcpane="url" hidden>
      <div class="dg-url-row">
        <input type="url" class="adm-input" id="dg-wz-url" placeholder="https://…/donnees.geojson ou .csv">
        <button type="button" class="adm-btn adm-btn--secondary" id="dg-wz-url-load">Charger</button>
      </div>
      <div class="adm-form-hint">Un GeoJSON ou CSV accessible publiquement (open data, API SIG…). Un GeoJSON reste synchronisé avec l'URL ; un CSV est converti puis stocké.</div>
    </div>
    ${internal.length ? `
    <div data-srcpane="internal" hidden>
      ${internal.map(([key, src]) => `
        <button type="button" class="dg-internal-option" data-internal="${esc(key)}">
          <span class="dg-internal-option__icon"><i class="${esc(src.icon)}"></i></span>
          <span class="dg-internal-option__txt">
            <span class="dg-internal-option__label">${esc(src.label)}</span>
            <span class="dg-internal-option__desc">${esc(src.description)}</span>
          </span>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      `).join('')}
    </div>` : ''}
    <div class="dg-detect" id="dg-wz-detect" hidden></div>
  `;
}

function _bindSourceStep(overlay, w) {
  // Bascule des panneaux de source.
  overlay.querySelectorAll('.dg-src-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.dg-src-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      overlay.querySelectorAll('[data-srcpane]').forEach((p) => { p.hidden = p.dataset.srcpane !== tab.dataset.src; });
    });
  });

  // Fichier (clic + drag & drop).
  const drop = overlay.querySelector('#dg-wz-drop');
  const fileInput = overlay.querySelector('#dg-wz-file');
  fileInput?.addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = ''; // permet de re-sélectionner le même fichier après une erreur
    if (files.length) _readFiles(overlay, w, files);
  });
  ['dragover', 'dragenter'].forEach((ev) => drop?.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop?.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop?.addEventListener('drop', async (e) => {
    const files = await filesFromDataTransfer(e.dataTransfer).catch(() => [...e.dataTransfer.files]);
    if (files.length) _readFiles(overlay, w, files);
  });

  // URL.
  overlay.querySelector('#dg-wz-url-load')?.addEventListener('click', async () => {
    const url = overlay.querySelector('#dg-wz-url')?.value.trim();
    if (!url) return;
    const btn = overlay.querySelector('#dg-wz-url-load');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const isCsv = /\.csv(\?|$)/i.test(url) || !['{', '['].includes(text.trim()[0]);
      const name = decodeURIComponent((url.split('/').pop() || 'couche').replace(/\?.*$/, '').replace(/\.[^.]+$/, ''));
      _ingest(overlay, w, text, isCsv ? 'csv' : 'geojson', name, url);
    } catch (e) {
      _showDetect(overlay, `Impossible de charger cette URL (${esc(e.message)}). Vérifiez qu'elle est publique et autorise l'accès externe (CORS).`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Charger';
    }
  });

  // Sources internes Open Projets.
  overlay.querySelectorAll('[data-internal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.internal;
      const src = INTERNAL_SOURCES[key];
      w.draft = { kind: 'internal', internalKey: key, base: [], features: [], fields: [], keep: null, join: null };
      w.cfg.label = w.cfg.label || src.label;
      w.cfg.group_label = w.cfg.group_label || 'Open Projets';
      w.cfg.kind = 'temoignages';
      w.cfg.style = { ...DEFAULT_STYLE, ...src.defaults.style };
      w.cfg.popup = { ...src.defaults.popup };
      w.cfg.metrics = [];
      w.cfg.ai_context = src.defaults.ai_context;
      overlay.querySelectorAll('[data-internal]').forEach((b) => b.classList.toggle('is-active', b === btn));
      _showDetect(overlay, `<b>${esc(src.label)}</b> - les données de la structure seront chargées automatiquement.`, false);
      _showConfig(overlay, w);
    });
  });
}

/**
 * Lit ce qui a été déposé : un fichier, plusieurs, un dossier ou une archive.
 * La source géographique devient la couche ; un tableau qui l'accompagne est
 * rattaché de lui-même, et un export connu est configuré d'office.
 */
async function _readFiles(overlay, w, rawFiles) {
  try {
    _showDetect(overlay, '<i class="fa-solid fa-spinner fa-spin"></i> Lecture des fichiers…', false);
    const files = await expandFiles(rawFiles);
    const { geo, tables } = classifyFiles(files);
    if (!geo) throw new Error('Aucun fichier géographique reconnu : GeoJSON, shapefile (.shp avec .dbf et .prj) ou CSV avec latitude et longitude.');
    // Une archive déposée seule donne son nom : c'est celui que l'on connaît,
    // pas celui, souvent illisible, du fichier qu'elle contient.
    const name = rawFiles.length === 1 && /\.zip$/i.test(rawFiles[0].name)
      ? rawFiles[0].name.replace(/\.[^.]+$/, '')
      : geo.name;
    if (geo.kind === 'shapefile') {
      const fc = await readShapefileParts(geo);
      _ingestFeatures(overlay, w, fc, 'Shapefile', name, null);
    } else {
      _ingest(overlay, w, await geo.file.text(), geo.kind === 'csv' ? 'csv' : 'geojson', name, null);
    }
    if (!w.draft) return; // échec déjà affiché
    if (tables.length && w.draft.base.length) await _attachTable(overlay, w, tables[0]);
  } catch (e) {
    _ingestFailed(overlay, w, e.message);
  }
}

/**
 * Un tableau accompagne la source : export connu → configuration complète ;
 * sinon, jointure automatique si une colonne porte le même nom des deux
 * côtés ; sinon, le panneau reste ouvert pour que l'administrateur choisisse.
 */
async function _attachTable(overlay, w, file) {
  await _readJoinFile(overlay, w, file);
  const j = w.draft?.join;
  if (!j) return;
  const recipe = matchRecipe({ geoFields: w.draft.fields, tableHeaders: j.headers });
  if (recipe) {
    await _applyRecipe(overlay, w, recipe);
    return;
  }
  if (_norm(j.layerKey) === _norm(j.tableKey)) {
    await _applyJoin(overlay, w);
    if (j.index) {
      _showDetect(overlay, `Tableau « ${esc(file.name)} » rattaché de lui-même par la colonne commune « ${esc(j.layerKey)} » - <b>${_fmt(w.draft.features.length)}</b> entité(s). Filtrez ou ajustez ci-dessous si besoin.`, false);
    }
    return;
  }
  _showDetect(overlay, `Un tableau accompagne les données (« ${esc(file.name)} ») : indiquez la colonne commune ci-dessous pour le rattacher.`, false);
}

/** Applique une recette : jointure, filtre sur la dernière valeur, réglages de la couche. */
async function _applyRecipe(overlay, w, recipe) {
  const d = w.draft;
  const j = d.join;
  j.layerKey = d.fields.find((f) => _norm(f) === _norm(recipe.join.layerKey)) || j.layerKey;
  j.tableKey = resolveColumn(j.headers, recipe.join.tableKey) || j.tableKey;
  overlay.querySelector('#dg-wz-join-lkey').value = j.layerKey;
  overlay.querySelector('#dg-wz-join-tkey').value = j.tableKey;
  j.columns = recipe.join.columns.map((c) => resolveColumn(j.headers, c)).filter(Boolean);
  _renderJoinColumns(overlay, w);

  let filterInfo = '';
  const filterCol = recipe.join.filterColumn ? resolveColumn(j.headers, recipe.join.filterColumn) : '';
  if (filterCol) {
    overlay.querySelector('#dg-wz-join-fcol').value = filterCol;
    const values = await _loadFilterValues(overlay, w, filterCol);
    if (values?.length) {
      const chosen = recipe.join.filterRule === 'latest' ? latestValue(values) : values[0][0];
      j.filterValue = chosen;
      overlay.querySelector('#dg-wz-join-fval').value = chosen;
      const all = values.map(([v]) => v).sort();
      filterInfo = all.length > 1
        ? ` ${esc(filterCol)} disponible de ${esc(all[0])} à ${esc(all[all.length - 1])} : <b>${esc(chosen)}</b> retenu.`
        : '';
    }
  }
  await _applyJoin(overlay, w);
  if (!j.index) return; // l'échec est affiché dans le statut de jointure

  const L = recipe.layer;
  w.cfg.label = String(L.label || '').replace('{value}', j.filterValue || '').trim();
  w.cfg.group_label = L.group_label || '';
  w.cfg.kind = L.kind === 'reference' ? 'reference' : 'temoignages';
  w.cfg.style = { ...DEFAULT_STYLE, ...L.style };
  w.cfg.popup = { title_field: '', fields: [], ...L.popup };
  w.cfg.metrics = (L.metrics || []).map((m) => ({ ...m }));
  w.cfg.ai_context = L.ai_context || '';
  w.autoMetric = null;
  const keep = new Set([
    ...(recipe.keepGeoFields || []).map((f) => d.fields.find((x) => _norm(x) === _norm(f))).filter(Boolean),
    ...j.columns,
  ]);
  d.keep = new Set(d.fields.filter((f) => keep.has(f)));

  const set = (sel, v) => { const el = overlay.querySelector(sel); if (el) el.value = v; };
  set('#dg-wz-label', w.cfg.label);
  set('#dg-wz-group', w.cfg.group_label);
  set('#dg-wz-ai', w.cfg.ai_context);
  _syncConfigUI(overlay, w);
  _renderKeepChips(overlay, w);
  _refreshFieldSelectors(overlay, w);
  _updateSaveState(overlay, w);
  _showDetect(overlay, `<b>${esc(recipe.name)}</b> reconnu - <b>${_fmt(d.features.length)}</b> entité(s) prêtes.${filterInfo} Tout est configuré : enregistrez, ou ajustez ci-dessous.`, false);
}

function _ingestFailed(overlay, w, message) {
  w.draft = null;
  _showDetect(overlay, esc(message), true);
  const config = overlay.querySelector('#dg-wz-config');
  if (config) config.hidden = true;
  const enrich = overlay.querySelector('#dg-wz-enrich');
  if (enrich) enrich.hidden = true;
  _updateSaveState(overlay, w);
}

/** Une FeatureCollection lue (GeoJSON ou shapefile) devient le brouillon. */
function _ingestFeatures(overlay, w, fc, format, name, url) {
  const features = prepareFeatures(fc);
  if (!features.length) throw new Error('Aucune géométrie valide trouvée');
  w.draft = { kind: url ? 'url' : 'file', url, name, base: features, features, fields: detectFields(features), keep: null, join: null };
  _showDetect(overlay, `<b>${esc(format)}</b> reconnu - <b>${_fmt(features.length)}</b> entité(s) valide(s).`, false);
  _afterIngest(overlay, w, name);
}

function _ingest(overlay, w, text, kind, name, url) {
  try {
    if (kind === 'geojson') {
      const fc = toFeatureCollection(JSON.parse(text));
      if (!fc) throw new Error('GeoJSON non reconnu (FeatureCollection ou Feature attendu)');
      _ingestFeatures(overlay, w, fc, 'GeoJSON', name, url);
    } else {
      const { headers, records } = parseCsv(text);
      if (!records.length) throw new Error('CSV vide ou illisible');
      const lat = guessColumn(headers, ['lat', 'latitude', 'y']);
      const lng = guessColumn(headers, ['lon', 'lng', 'long', 'longitude', 'x']);
      w.draft = { kind: url ? 'url' : 'file', url, name, csv: { headers, records, lat, lng }, base: [], features: [], fields: [], keep: null, join: null };
      _recountCsv(overlay, w);
      _afterIngest(overlay, w, name);
    }
  } catch (e) {
    _ingestFailed(overlay, w, e.message);
  }
}

/** Suite commune à toute source lue : nature présumée, étapes suivantes. */
function _afterIngest(overlay, w, name) {
  if (!w.cfg.label) w.cfg.label = name;
  w.cfg.kind = guessKind(w.draft.features);
  const enrich = overlay.querySelector('#dg-wz-enrich');
  if (enrich) enrich.hidden = false;
  _renderKeepChips(overlay, w);
  _showConfig(overlay, w);
}

function _recountCsv(overlay, w) {
  const { records, lat, lng } = w.draft.csv;
  const features = csvToFeatures(records, lat, lng);
  w.draft.base = prepareFeatures({ features });
  _recompute(w);
  const ok = w.draft.features.length > 0;
  _showDetect(
    overlay,
    ok
      ? `<b>CSV</b> reconnu - <b>${_fmt(features.length)}</b> point(s) géolocalisé(s) sur ${_fmt(records.length)} ligne(s).`
      : 'Aucun point géolocalisé - vérifiez les colonnes latitude / longitude.',
    !ok
  );
  _updateSaveState(overlay, w);
}

/**
 * Recalcule les entités courantes depuis la base : jointure éventuelle, puis
 * liste des champs (les colonnes lat/lng d'un CSV n'en font pas partie).
 */
function _recompute(w) {
  const d = w.draft;
  let features = d.base;
  if (d.join?.index) {
    const r = applyJoin(d.base, d.join.index, d.join.layerKey, { keepUnmatched: !d.join.strict });
    features = r.features;
    d.join.matched = r.matched;
    d.join.unmatched = r.unmatched;
  }
  d.features = features;
  const hidden = d.csv ? new Set([d.csv.lat, d.csv.lng]) : new Set();
  d.fields = detectFields(features).filter((f) => !hidden.has(f));
  if (d.keep) d.keep = new Set([...d.keep].filter((f) => d.fields.includes(f)));
}

function _showDetect(overlay, html, isError) {
  const detect = overlay.querySelector('#dg-wz-detect');
  if (!detect) return;
  detect.hidden = false;
  detect.classList.toggle('dg-detect--error', !!isError);
  detect.innerHTML = `<i class="fa-solid ${isError ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> <span>${html}</span>`;
}

/* ── Étape 2 : compléter et alléger (mode ajout) ───────────────── */

function _enrichStepHtml() {
  return `
    <div id="dg-wz-enrich" hidden>
      <div class="dg-step"><span class="dg-step__n">2</span><span class="dg-step__t">Compléter et alléger <span class="dg-opt">(optionnel)</span></span></div>
      <div class="adm-form-group">
        <label class="adm-label">Rattacher un tableau</label>
        <div class="adm-form-hint" style="margin-bottom:8px">Des données livrées en deux fichiers (tracés d'un côté, chiffres de l'autre) se rejoignent par une colonne commune. Un tableau de plusieurs centaines de milliers de lignes est lu sans être chargé en entier.</div>
        <label class="dg-drop dg-drop--sm" id="dg-wz-join-drop">
          <input type="file" id="dg-wz-join-file" accept=".csv" hidden>
          <i class="fa-solid fa-table"></i>
          <span class="dg-drop__t">Glissez un tableau CSV ou <u>parcourez</u></span>
        </label>
        <div id="dg-wz-join-cfg" class="dg-join" hidden>
          <div class="adm-form-row">
            <div class="adm-form-group">
              <label class="adm-label" for="dg-wz-join-lkey">Colonne commune dans la couche</label>
              <select class="adm-select" id="dg-wz-join-lkey"></select>
            </div>
            <div class="adm-form-group">
              <label class="adm-label" for="dg-wz-join-tkey">Colonne commune dans le tableau</label>
              <select class="adm-select" id="dg-wz-join-tkey"></select>
            </div>
          </div>
          <div class="adm-form-row">
            <div class="adm-form-group">
              <label class="adm-label" for="dg-wz-join-fcol">Ne garder que les lignes où <span class="dg-opt">(optionnel)</span></label>
              <select class="adm-select" id="dg-wz-join-fcol"></select>
            </div>
            <div class="adm-form-group">
              <label class="adm-label" for="dg-wz-join-fval">vaut</label>
              <select class="adm-select" id="dg-wz-join-fval" disabled><option value="">-</option></select>
            </div>
          </div>
          <div class="adm-form-group">
            <label class="adm-label">Colonnes à reprendre</label>
            <div class="dg-checks" id="dg-wz-join-cols"></div>
          </div>
          <label class="adm-checkbox-label">
            <input type="checkbox" id="dg-wz-join-strict" checked> Retirer les entités absentes du tableau
          </label>
          <div class="dg-join__actions">
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="dg-wz-join-apply"><i class="fa-solid fa-link"></i> Rattacher le tableau</button>
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="dg-wz-join-remove" hidden><i class="fa-solid fa-link-slash"></i> Retirer le tableau</button>
            <span class="dg-join__status" id="dg-wz-join-status"></span>
          </div>
        </div>
      </div>
      <div class="adm-form-group" id="dg-wz-keep-wrap">
        <label class="adm-label">Champs conservés</label>
        <div class="adm-form-hint" style="margin-bottom:8px">Décochez ce qui ne servira ni à la carte ni à l'analyse : la couche se charge d'autant plus vite.</div>
        <div class="dg-checks" id="dg-wz-keep"></div>
      </div>
    </div>
  `;
}

function _bindEnrichStep(overlay, w) {
  const drop = overlay.querySelector('#dg-wz-join-drop');
  const input = overlay.querySelector('#dg-wz-join-file');
  input?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) _readJoinFile(overlay, w, file);
  });
  ['dragover', 'dragenter'].forEach((ev) => drop?.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop?.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop?.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) _readJoinFile(overlay, w, f); });

  overlay.querySelector('#dg-wz-join-lkey')?.addEventListener('change', (e) => { if (w.draft?.join) w.draft.join.layerKey = e.target.value; });
  overlay.querySelector('#dg-wz-join-tkey')?.addEventListener('change', (e) => {
    if (!w.draft?.join) return;
    w.draft.join.tableKey = e.target.value;
    _renderJoinColumns(overlay, w);
  });
  overlay.querySelector('#dg-wz-join-fcol')?.addEventListener('change', (e) => _loadFilterValues(overlay, w, e.target.value));
  overlay.querySelector('#dg-wz-join-fval')?.addEventListener('change', (e) => { if (w.draft?.join) w.draft.join.filterValue = e.target.value; });
  overlay.querySelector('#dg-wz-join-strict')?.addEventListener('change', (e) => { if (w.draft?.join) w.draft.join.strict = e.target.checked; });
  overlay.querySelector('#dg-wz-join-apply')?.addEventListener('click', () => _applyJoin(overlay, w));
  overlay.querySelector('#dg-wz-join-remove')?.addEventListener('click', () => {
    if (!w.draft) return;
    w.draft.join = null;
    _recompute(w);
    overlay.querySelector('#dg-wz-join-cfg').hidden = true;
    overlay.querySelector('#dg-wz-join-drop').hidden = false;
    _setJoinStatus(overlay, '');
    _showDetect(overlay, `Tableau retiré - <b>${_fmt(w.draft.features.length)}</b> entité(s).`, false);
    _renderKeepChips(overlay, w);
    _refreshFieldSelectors(overlay, w);
    _updateSaveState(overlay, w);
  });
}

async function _readJoinFile(overlay, w, file) {
  if (!w.draft?.base?.length) return;
  _setJoinStatus(overlay, '<i class="fa-solid fa-spinner fa-spin"></i> Lecture des en-têtes…');
  try {
    const { headers, sample } = await csvHead(file, 50);
    if (!headers.length) throw new Error('Tableau vide ou illisible');
    const guess = guessJoinColumns(w.draft.fields, headers);
    w.draft.join = {
      file, headers, sample,
      layerKey: guess.layerKey, tableKey: guess.tableKey,
      filterColumn: '', filterValue: '', strict: true,
      columns: headers.filter((h) => h !== guess.tableKey),
      index: null, matched: 0, unmatched: 0,
    };
    const lkey = overlay.querySelector('#dg-wz-join-lkey');
    const tkey = overlay.querySelector('#dg-wz-join-tkey');
    const fcol = overlay.querySelector('#dg-wz-join-fcol');
    lkey.innerHTML = w.draft.fields.map((f) => `<option ${f === guess.layerKey ? 'selected' : ''}>${esc(f)}</option>`).join('');
    tkey.innerHTML = headers.map((h) => `<option ${h === guess.tableKey ? 'selected' : ''}>${esc(h)}</option>`).join('');
    fcol.innerHTML = '<option value="">(toutes les lignes)</option>' + headers.map((h) => `<option>${esc(h)}</option>`).join('');
    const fval = overlay.querySelector('#dg-wz-join-fval');
    fval.innerHTML = '<option value="">-</option>';
    fval.disabled = true;
    overlay.querySelector('#dg-wz-join-strict').checked = true;
    _renderJoinColumns(overlay, w);
    overlay.querySelector('#dg-wz-join-cfg').hidden = false;
    overlay.querySelector('#dg-wz-join-drop').hidden = true;
    overlay.querySelector('#dg-wz-join-apply').hidden = false;
    overlay.querySelector('#dg-wz-join-remove').hidden = true;
    _setJoinStatus(overlay, `${esc(file.name)} - ${headers.length} colonnes`);
  } catch (e) {
    w.draft.join = null;
    _setJoinStatus(overlay, `<span class="dg-join__error">${esc(e.message)}</span>`);
  }
}

function _renderJoinColumns(overlay, w) {
  const wrap = overlay.querySelector('#dg-wz-join-cols');
  const j = w.draft?.join;
  if (!wrap || !j) return;
  j.columns = j.columns.filter((c) => c !== j.tableKey);
  wrap.innerHTML = '';
  for (const h of j.headers) {
    if (h === j.tableKey) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dg-chk' + (j.columns.includes(h) ? ' is-active' : '');
    chip.textContent = h;
    chip.addEventListener('click', () => {
      const i = j.columns.indexOf(h);
      if (i >= 0) j.columns.splice(i, 1); else j.columns.push(h);
      chip.classList.toggle('is-active');
    });
    wrap.appendChild(chip);
  }
}

async function _loadFilterValues(overlay, w, column) {
  const j = w.draft?.join;
  const fval = overlay.querySelector('#dg-wz-join-fval');
  if (!j || !fval) return null;
  j.filterColumn = column;
  j.filterValue = '';
  if (!column) {
    fval.innerHTML = '<option value="">-</option>';
    fval.disabled = true;
    return null;
  }
  fval.disabled = true;
  fval.innerHTML = '<option value="">Lecture des valeurs…</option>';
  _setJoinStatus(overlay, '<i class="fa-solid fa-spinner fa-spin"></i> Lecture du tableau…');
  try {
    const values = await csvDistinct(j.file, column, 200);
    if (j.filterColumn !== column) return null; // l'utilisateur a changé de colonne entre-temps
    fval.innerHTML = '<option value="">(choisir une valeur)</option>'
      + values.map(([v, n]) => `<option value="${escAttr(v)}">${esc(v)} (${_fmt(n)})</option>`).join('');
    fval.disabled = false;
    _setJoinStatus(overlay, `${values.length} valeur(s) distincte(s) dans « ${esc(column)} »`);
    return values;
  } catch (e) {
    _setJoinStatus(overlay, `<span class="dg-join__error">${esc(e.message)}</span>`);
    return null;
  }
}

async function _applyJoin(overlay, w) {
  const j = w.draft?.join;
  if (!j) return;
  if (j.filterColumn && !j.filterValue) {
    _setJoinStatus(overlay, '<span class="dg-join__error">Choisissez la valeur à garder, ou retirez le filtre.</span>');
    return;
  }
  const btn = overlay.querySelector('#dg-wz-join-apply');
  btn.disabled = true;
  _setJoinStatus(overlay, '<i class="fa-solid fa-spinner fa-spin"></i> Lecture du tableau et rattachement…');
  try {
    const { index, rows, kept } = await buildJoinIndex(j.file, {
      keyColumn: j.tableKey,
      keepColumns: j.columns,
      filterColumn: j.filterColumn,
      filterValue: j.filterValue,
    });
    if (!index.size) throw new Error(`Aucune ligne exploitable (${_fmt(rows)} lue(s)) : vérifiez la colonne commune et le filtre.`);
    j.index = index;
    _recompute(w);
    if (!w.draft.features.length) {
      j.index = null;
      _recompute(w);
      throw new Error('Aucune entité de la couche ne correspond au tableau : vérifiez les deux colonnes communes.');
    }
    const dropped = j.strict ? ` · ${_fmt(j.unmatched)} sans correspondance retirée(s)` : ` · ${_fmt(j.unmatched)} sans correspondance gardée(s)`;
    _setJoinStatus(overlay, `<i class="fa-solid fa-circle-check"></i> ${_fmt(kept)} ligne(s) retenue(s) sur ${_fmt(rows)} · ${_fmt(j.matched)} entité(s) enrichie(s)${dropped}`);
    _showDetect(overlay, `Tableau rattaché - <b>${_fmt(w.draft.features.length)}</b> entité(s) avec ${j.columns.length} colonne(s) supplémentaire(s).`, false);
    btn.hidden = true;
    overlay.querySelector('#dg-wz-join-remove').hidden = false;
    // La nature se redevine sur les données enrichies.
    w.cfg.kind = guessKind(w.draft.features);
    _syncConfigUI(overlay, w);
    _renderKeepChips(overlay, w);
    _refreshFieldSelectors(overlay, w);
    _updateSaveState(overlay, w);
  } catch (e) {
    _setJoinStatus(overlay, `<span class="dg-join__error">${esc(e.message)}</span>`);
  } finally {
    btn.disabled = false;
  }
}

function _setJoinStatus(overlay, html) {
  const el = overlay.querySelector('#dg-wz-join-status');
  if (el) el.innerHTML = html;
}

/** Champs effectivement conservés (tous si aucune restriction). */
function _keptFields(w) {
  const d = w.draft;
  if (!d) return [];
  return d.keep ? d.fields.filter((f) => d.keep.has(f)) : d.fields;
}

/** Entités telles qu'elles seront enregistrées (champs conservés seulement). */
function _keptFeatures(w) {
  const d = w.draft;
  if (!d) return [];
  return d.keep ? restrictProps(d.features, _keptFields(w)) : d.features;
}

function _renderKeepChips(overlay, w) {
  const wrap = overlay.querySelector('#dg-wz-keep');
  const d = w.draft;
  if (!wrap || !d) return;
  // Une source « lien » GeoJSON reste distante : rien n'est réécrit, donc rien à alléger.
  const stored = d.kind === 'file' || !!d.csv || !!d.join?.index;
  overlay.querySelector('#dg-wz-keep-wrap').hidden = !stored;
  wrap.innerHTML = '';
  if (!d.fields.length) {
    wrap.innerHTML = '<span class="adm-form-hint">Aucun champ détecté.</span>';
    return;
  }
  for (const f of d.fields) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dg-chk' + (!d.keep || d.keep.has(f) ? ' is-active' : '');
    chip.textContent = f;
    chip.addEventListener('click', () => {
      if (!d.keep) d.keep = new Set(d.fields);
      if (d.keep.has(f)) d.keep.delete(f); else d.keep.add(f);
      chip.classList.toggle('is-active', d.keep.has(f));
      _refreshFieldSelectors(overlay, w);
    });
    wrap.appendChild(chip);
  }
}

/* ── Étapes 3-5 : configuration ────────────────────────────────── */

function _configStepsHtml(w) {
  const groups = [...new Set(dg.layers.map((l) => l.group_label).filter(Boolean))];
  const cfg = w.cfg;
  const isGraduated = cfg.style.mode === 'graduated';
  const isCategory = cfg.style.mode === 'category';
  return `
    <div class="dg-step"><span class="dg-step__n">3</span><span class="dg-step__t">Identité</span></div>
    <div class="adm-form-row">
      <div class="adm-form-group">
        <label class="adm-label" for="dg-wz-label">Nom de la couche</label>
        <input type="text" class="adm-input" id="dg-wz-label" value="${escAttr(cfg.label)}" placeholder="Ex. Comptages vélo 2026">
      </div>
      <div class="adm-form-group">
        <label class="adm-label" for="dg-wz-group">Groupe <span class="dg-opt">(optionnel)</span></label>
        <input type="text" class="adm-input" id="dg-wz-group" list="dg-wz-groups" value="${escAttr(cfg.group_label)}" placeholder="Ex. Contributions citoyennes">
        <datalist id="dg-wz-groups">${groups.map((g) => `<option value="${escAttr(g)}"></option>`).join('')}</datalist>
      </div>
    </div>
    <div class="adm-form-row" id="dg-wz-latlng" hidden>
      <div class="adm-form-group">
        <label class="adm-label" for="dg-wz-lat">Colonne latitude</label>
        <select class="adm-select" id="dg-wz-lat"></select>
      </div>
      <div class="adm-form-group">
        <label class="adm-label" for="dg-wz-lng">Colonne longitude</label>
        <select class="adm-select" id="dg-wz-lng"></select>
      </div>
    </div>
    <div class="adm-form-group">
      <label class="adm-label">Nature des données</label>
      <div class="dg-seg" id="dg-wz-kind">
        ${Object.entries(LAYER_KINDS).map(([key, k]) => `<button type="button" data-kind="${key}" class="${cfg.kind === key ? 'is-active' : ''}">${esc(k.label)}</button>`).join('')}
      </div>
      <div class="adm-form-hint" id="dg-wz-kind-hint">${esc(LAYER_KINDS[cfg.kind].hint)}</div>
    </div>

    <div class="dg-step"><span class="dg-step__n">4</span><span class="dg-step__t">Style</span></div>
    <div class="adm-form-group">
      <label class="adm-label">Coloration</label>
      <div class="dg-seg" id="dg-wz-colormode">
        <button type="button" data-mode="single" class="${!isCategory && !isGraduated ? 'is-active' : ''}">Couleur unique</button>
        <button type="button" data-mode="category" class="${isCategory ? 'is-active' : ''}">Par catégorie</button>
        <button type="button" data-mode="graduated" class="${isGraduated ? 'is-active' : ''}">Selon une valeur</button>
      </div>
    </div>
    <div class="adm-form-group" id="dg-wz-single-wrap" ${isCategory ? 'hidden' : ''}>
      <div class="dg-swatches" id="dg-wz-swatches"></div>
    </div>
    <div class="adm-form-group" id="dg-wz-cat-wrap" ${isCategory ? '' : 'hidden'}>
      <label class="adm-label" for="dg-wz-catfield">Champ de catégorisation</label>
      <select class="adm-select" id="dg-wz-catfield"></select>
      <div class="adm-form-hint">Une couleur est attribuée automatiquement à chaque valeur.</div>
    </div>
    <div class="adm-form-group" id="dg-wz-grad-wrap" ${isGraduated ? '' : 'hidden'}>
      <label class="adm-label" for="dg-wz-valuefield">Champ numérique</label>
      <select class="adm-select" id="dg-wz-valuefield"></select>
      <div class="adm-form-hint">Les tracés s'épaississent et se foncent avec la valeur ; les paliers suivent la répartition réelle des données.</div>
    </div>
    <div class="adm-form-group">
      <label class="adm-label" for="dg-wz-radius">Taille des points - <b id="dg-wz-radius-v">${esc(String(cfg.style.radius || 4))}</b> px</label>
      <input type="range" min="2" max="9" value="${esc(String(cfg.style.radius || 4))}" id="dg-wz-radius" class="dg-range">
    </div>

    <div class="dg-step"><span class="dg-step__n">5</span><span class="dg-step__t">Popup &amp; analyse IA</span></div>
    <div class="adm-form-group">
      <label class="adm-label" for="dg-wz-title">Champ-titre de la popup</label>
      <select class="adm-select" id="dg-wz-title"></select>
    </div>
    <div class="adm-form-group">
      <label class="adm-label">Champs affichés dans la popup</label>
      <div class="dg-checks" id="dg-wz-popfields"></div>
    </div>
    <div class="adm-form-group" id="dg-wz-metrics-wrap" ${cfg.kind === 'reference' ? '' : 'hidden'}>
      <label class="adm-label">Chiffres de zone</label>
      <div class="adm-form-hint" style="margin-bottom:8px">Pour chaque zone tracée, ces valeurs sont totalisées ou moyennées sur les entités qu'elle contient, affichées dans l'analyse et dans le rapport.</div>
      <div class="dg-metrics" id="dg-wz-metrics"></div>
    </div>
    <div class="adm-form-group">
      <label class="adm-label" for="dg-wz-ai">Contexte pour l'IA <span class="dg-opt">(que représentent ces données ?)</span></label>
      <textarea class="adm-textarea" id="dg-wz-ai" rows="2" placeholder="Ex. Signalements citoyens de dangers cyclables, ou passages de cyclistes par tronçon en 2025">${esc(cfg.ai_context)}</textarea>
    </div>
    <label class="adm-checkbox-label">
      <input type="checkbox" id="dg-wz-defon" ${cfg.default_on ? 'checked' : ''}> Afficher la couche par défaut
    </label>
  `;
}

function _showConfig(overlay, w) {
  const config = overlay.querySelector('#dg-wz-config');
  if (config) config.hidden = false;
  _syncConfigUI(overlay, w);
  _refreshFieldSelectors(overlay, w);
  _updateSaveState(overlay, w);
}

/** Reflète w.cfg dans les contrôles du formulaire (après choix d'une source). */
function _syncConfigUI(overlay, w) {
  const cfg = w.cfg;
  const label = overlay.querySelector('#dg-wz-label');
  if (label && !label.value && cfg.label) label.value = cfg.label;
  const group = overlay.querySelector('#dg-wz-group');
  if (group && !group.value && cfg.group_label) group.value = cfg.group_label;
  const ai = overlay.querySelector('#dg-wz-ai');
  if (ai && !ai.value && cfg.ai_context) ai.value = cfg.ai_context;
  overlay.querySelectorAll('#dg-wz-kind button').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === cfg.kind));
  const kindHint = overlay.querySelector('#dg-wz-kind-hint');
  if (kindHint) kindHint.textContent = LAYER_KINDS[cfg.kind]?.hint || '';
  const metricsWrap = overlay.querySelector('#dg-wz-metrics-wrap');
  if (metricsWrap) metricsWrap.hidden = cfg.kind !== 'reference';
  const mode = ['category', 'graduated'].includes(cfg.style.mode) ? cfg.style.mode : 'single';
  overlay.querySelectorAll('#dg-wz-colormode button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
  _syncModePanes(overlay, mode);
  const radius = overlay.querySelector('#dg-wz-radius');
  if (radius) radius.value = String(cfg.style.radius || 4);
  const radiusLabel = overlay.querySelector('#dg-wz-radius-v');
  if (radiusLabel) radiusLabel.textContent = String(cfg.style.radius || 4);
  _renderSwatches(overlay, w);
}

function _syncModePanes(overlay, mode) {
  const single = overlay.querySelector('#dg-wz-single-wrap');
  const cat = overlay.querySelector('#dg-wz-cat-wrap');
  const grad = overlay.querySelector('#dg-wz-grad-wrap');
  // La couleur de base sert aussi au dégradé : les pastilles restent visibles en mode gradué.
  if (single) single.hidden = mode === 'category';
  if (cat) cat.hidden = mode !== 'category';
  if (grad) grad.hidden = mode !== 'graduated';
}

function _bindConfigSteps(overlay, w) {
  overlay.querySelector('#dg-wz-label')?.addEventListener('input', (e) => {
    w.cfg.label = e.target.value.trim();
    _updateSaveState(overlay, w);
  });
  overlay.querySelector('#dg-wz-group')?.addEventListener('input', (e) => { w.cfg.group_label = e.target.value.trim(); });

  overlay.querySelectorAll('#dg-wz-kind button').forEach((btn) => {
    btn.addEventListener('click', () => {
      w.cfg.kind = btn.dataset.kind in LAYER_KINDS ? btn.dataset.kind : 'temoignages';
      _syncConfigUI(overlay, w);
      _refreshFieldSelectors(overlay, w);
    });
  });

  overlay.querySelector('#dg-wz-colormode')?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('#dg-wz-colormode button').forEach((b) => b.classList.toggle('is-active', b === btn));
      w.cfg.style.mode = btn.dataset.mode;
      _syncModePanes(overlay, w.cfg.style.mode);
      _refreshFieldSelectors(overlay, w);
    });
  });
  overlay.querySelector('#dg-wz-catfield')?.addEventListener('change', (e) => {
    w.cfg.style.category_field = e.target.value;
    w.cfg.style.cat_colors = {}; // recalculées au chargement depuis les données
  });
  overlay.querySelector('#dg-wz-valuefield')?.addEventListener('change', (e) => {
    w.cfg.style.value_field = e.target.value;
    _refreshFieldSelectors(overlay, w);
  });
  overlay.querySelector('#dg-wz-radius')?.addEventListener('input', (e) => {
    w.cfg.style.radius = Number(e.target.value);
    const v = overlay.querySelector('#dg-wz-radius-v');
    if (v) v.textContent = e.target.value;
  });
  overlay.querySelector('#dg-wz-title')?.addEventListener('change', (e) => { w.cfg.popup.title_field = e.target.value; });
  overlay.querySelector('#dg-wz-ai')?.addEventListener('input', (e) => { w.cfg.ai_context = e.target.value.trim(); });
  overlay.querySelector('#dg-wz-defon')?.addEventListener('change', (e) => { w.cfg.default_on = e.target.checked; });

  overlay.querySelector('#dg-wz-lat')?.addEventListener('change', (e) => {
    w.draft.csv.lat = e.target.value;
    _recountCsv(overlay, w);
    _renderKeepChips(overlay, w);
    _refreshFieldSelectors(overlay, w);
  });
  overlay.querySelector('#dg-wz-lng')?.addEventListener('change', (e) => {
    w.draft.csv.lng = e.target.value;
    _recountCsv(overlay, w);
    _renderKeepChips(overlay, w);
    _refreshFieldSelectors(overlay, w);
  });

  _renderSwatches(overlay, w);
}

function _renderSwatches(overlay, w) {
  const wrap = overlay.querySelector('#dg-wz-swatches');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const color of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dg-swatch-btn' + (color === w.cfg.style.color ? ' is-active' : '');
    btn.style.background = color;
    btn.setAttribute('aria-label', color);
    btn.addEventListener('click', () => {
      w.cfg.style.color = color;
      wrap.querySelectorAll('.dg-swatch-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
    wrap.appendChild(btn);
  }
}

/**
 * Devine le champ qui identifie un point : le premier champ textuel dont les
 * valeurs sont courtes et majoritairement distinctes (un intitulé, pas une
 * description ni une constante). Retourne '' si rien de convaincant.
 */
function _guessTitleField(draft, fields) {
  const sample = (draft?.features || []).slice(0, 60);
  if (!sample.length) return '';
  for (const field of fields) {
    const values = sample.map((f) => f.properties?.[field]).filter((v) => typeof v === 'string' && v.trim());
    if (values.length < sample.length * 0.6) continue;
    const avg = values.reduce((acc, v) => acc + v.trim().length, 0) / values.length;
    if (avg > 45) continue; // c'est une description, pas un intitulé
    const distinct = new Set(values.map((v) => v.trim())).size;
    if (distinct < 2 && values.length > 3) continue; // valeur constante
    return field;
  }
  return '';
}

/** Alimente les selects champ-titre / catégorie / valeur / popup / chiffres depuis les champs conservés. */
function _refreshFieldSelectors(overlay, w) {
  const fields = _keptFields(w);
  const cfg = w.cfg;

  const latlng = overlay.querySelector('#dg-wz-latlng');
  if (latlng) {
    const isCsv = !!w.draft?.csv;
    latlng.hidden = !isCsv;
    if (isCsv) {
      const opts = w.draft.csv.headers.map((h) => `<option>${esc(h)}</option>`).join('');
      const latSel = overlay.querySelector('#dg-wz-lat');
      const lngSel = overlay.querySelector('#dg-wz-lng');
      latSel.innerHTML = opts;
      lngSel.innerHTML = opts;
      latSel.value = w.draft.csv.lat;
      lngSel.value = w.draft.csv.lng;
    }
  }

  const fieldOptions = (selected, list = fields) => '<option value="">(aucun)</option>'
    + list.map((f) => `<option ${f === selected ? 'selected' : ''}>${esc(f)}</option>`).join('');
  // Champ-titre pré-choisi : sans lui, chaque point s'affiche sous le nom de sa
  // couche - dans la popup comme dans l'annexe du rapport.
  if (!cfg.popup.title_field) cfg.popup.title_field = _guessTitleField(w.draft, fields);
  const titleSel = overlay.querySelector('#dg-wz-title');
  if (titleSel) titleSel.innerHTML = fieldOptions(cfg.popup.title_field);
  const catSel = overlay.querySelector('#dg-wz-catfield');
  if (catSel) catSel.innerHTML = fieldOptions(cfg.style.category_field);

  // Champs numériques : dégradé et chiffres de zone. Un identifiant n'est pas
  // une grandeur, il n'est proposé que s'il est déjà configuré.
  const configured = new Set([cfg.style.value_field, ...cfg.metrics.map((m) => m.field)].filter(Boolean));
  const numeric = numericFields(w.draft?.features || []).filter((f) => fields.includes(f) && (!isIdLike(f) || configured.has(f)));
  if (numeric.length && cfg.style.mode === 'graduated' && (!cfg.style.value_field || !numeric.includes(cfg.style.value_field))) {
    cfg.style.value_field = numeric.find((f) => !isIdLike(f)) || numeric[0] || '';
  }
  const valSel = overlay.querySelector('#dg-wz-valuefield');
  if (valSel) {
    valSel.innerHTML = numeric.length
      ? fieldOptions(cfg.style.value_field, numeric)
      : `<option value="${escAttr(cfg.style.value_field || '')}">${cfg.style.value_field ? esc(cfg.style.value_field) : '(aucun champ numérique)'}</option>`;
  }
  _renderMetrics(overlay, w, numeric);

  const popWrap = overlay.querySelector('#dg-wz-popfields');
  if (popWrap) {
    popWrap.innerHTML = '';
    if (!fields.length) {
      popWrap.innerHTML = '<span class="adm-form-hint">Aucun champ détecté.</span>';
    }
    if (!cfg.popup.fields?.length) cfg.popup.fields = fields.slice(0, 4);
    // Ne purger qu'à champs connus : en édition, les données peuvent ne pas
    // être encore chargées, et la config ne doit pas s'effacer pour autant.
    if (fields.length) cfg.popup.fields = cfg.popup.fields.filter((f) => fields.includes(f));
    for (const f of fields) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'dg-chk' + (cfg.popup.fields.includes(f) ? ' is-active' : '');
      chip.textContent = f;
      chip.addEventListener('click', () => {
        const i = cfg.popup.fields.indexOf(f);
        if (i >= 0) cfg.popup.fields.splice(i, 1); else cfg.popup.fields.push(f);
        chip.classList.toggle('is-active');
      });
      popWrap.appendChild(chip);
    }
  }
}

/** Lignes « chiffres de zone » : un interrupteur et une agrégation par champ numérique. */
function _renderMetrics(overlay, w, numeric) {
  const wrap = overlay.querySelector('#dg-wz-metrics');
  if (!wrap) return;
  const cfg = w.cfg;
  if (numeric.length) cfg.metrics = cfg.metrics.filter((m) => numeric.includes(m.field));
  // Par défaut, le champ du dégradé est totalisé : c'est la grandeur que
  // l'administrateur a déjà désignée comme celle qui compte. Ce choix
  // automatique suit le champ tant que l'administrateur n'y a pas touché.
  if (cfg.style.mode === 'graduated' && cfg.style.value_field) {
    const untouched = !cfg.metrics.length
      || (cfg.metrics.length === 1 && cfg.metrics[0].field === w.autoMetric && cfg.metrics[0].agg === 'sum');
    if (untouched && cfg.metrics[0]?.field !== cfg.style.value_field) {
      cfg.metrics = [{ field: cfg.style.value_field, agg: 'sum' }];
      w.autoMetric = cfg.style.value_field;
    }
  }
  wrap.innerHTML = '';
  if (!numeric.length) {
    wrap.innerHTML = '<span class="adm-form-hint">Aucun champ numérique : la zone n\'affichera que le nombre d\'entités.</span>';
    return;
  }
  for (const field of numeric) {
    const current = cfg.metrics.find((m) => m.field === field);
    const row = document.createElement('label');
    row.className = 'dg-metric' + (current ? ' is-active' : '');
    row.innerHTML = `
      <input type="checkbox" data-mfield="${escAttr(field)}" ${current ? 'checked' : ''}>
      <span class="dg-metric__name">${esc(field)}</span>
      <select class="adm-select adm-select--sm" data-magg="${escAttr(field)}" ${current ? '' : 'disabled'}>
        ${Object.entries(METRIC_AGGS).map(([key, a]) => `<option value="${key}" ${(current?.agg || 'sum') === key ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}
      </select>`;
    const check = row.querySelector('input');
    const select = row.querySelector('select');
    check.addEventListener('change', () => {
      const i = cfg.metrics.findIndex((m) => m.field === field);
      if (check.checked && i < 0) cfg.metrics.push({ field, agg: select.value });
      if (!check.checked && i >= 0) cfg.metrics.splice(i, 1);
      select.disabled = !check.checked;
      row.classList.toggle('is-active', check.checked);
    });
    select.addEventListener('change', () => {
      const m = cfg.metrics.find((x) => x.field === field);
      if (m) m.agg = select.value;
    });
    wrap.appendChild(row);
  }
}

function _isValid(w) {
  if (!w.cfg.label) return false;
  if (!w.draft) return false;
  if (w.draft.kind === 'edit' || w.draft.kind === 'internal') return true;
  return (w.draft.features || []).length > 0;
}

function _updateSaveState(overlay, w) {
  const save = overlay.querySelector('#dg-wz-save');
  if (save) save.disabled = !_isValid(w);
}

/* ── Sauvegarde ────────────────────────────────────────────────── */

async function _save(overlay, w, existing, onSaved, close) {
  if (!_isValid(w)) return;
  const save = overlay.querySelector('#dg-wz-save');
  save.disabled = true;
  save.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';
  try {
    let source_type = existing?.source_type;
    let source_ref = existing?.source_ref;
    const stored = w.draft.kind === 'file' || !!w.draft.csv || !!w.draft.join?.index;

    if (w.draft.kind === 'internal') {
      source_type = 'internal';
      source_ref = w.draft.internalKey;
    } else if (w.draft.kind === 'url' && !stored) {
      source_type = 'url';
      source_ref = w.draft.url;
    } else if (stored) {
      // Fichier local, CSV distant ou couche enrichie d'un tableau : normalisé
      // en FeatureCollection (champs conservés seulement) puis déposé dans Storage.
      const fc = {
        type: 'FeatureCollection',
        features: _keptFeatures(w).map(({ __pt, __bbox, ...f }) => f),
      };
      source_type = 'storage';
      source_ref = await api.uploadDiagnosticGeoJSON(fc);
    }

    const popup = {
      title_field: w.cfg.popup.title_field || '',
      fields: w.cfg.popup.fields || [],
      kind: w.cfg.kind,
      metrics: w.cfg.kind === 'reference' ? w.cfg.metrics : [],
    };
    // Provenance : une couche venue du catalogue le reste, même retouchée.
    const source = w.draft.source || existing?.popup?.source;
    if (source) popup.source = source;
    if (existing?.popup?.dataset) popup.dataset = existing.popup.dataset;
    const { data, error } = await api.upsertDiagnosticLayer({
      id: existing?.id,
      label: w.cfg.label,
      group_label: w.cfg.group_label,
      source_type,
      source_ref,
      style: w.cfg.style,
      popup,
      ai_context: w.cfg.ai_context,
      default_on: w.cfg.default_on,
      sort_order: existing?.sort_order ?? dg.layers.length,
    });
    if (error) throw error;

    toast(existing ? 'Couche mise à jour' : 'Couche ajoutée', 'success');
    close();
    await onSaved?.(data);
  } catch (err) {
    console.error('[admin/diagnostic] Sauvegarde couche:', err);
    toast('Erreur : ' + (err.message || err), 'error');
    save.disabled = false;
    save.innerHTML = `<i class="fa-solid fa-check"></i> ${existing ? 'Enregistrer' : 'Ajouter la couche'}`;
  }
}
