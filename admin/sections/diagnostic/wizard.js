/**
 * Diagnostic terrain — wizard d'ajout / édition d'une couche.
 * Modale en 4 étapes : source (fichier GeoJSON/CSV, lien, données Open Projets),
 * identité, style, popup & contexte IA. Tout est persisté dans diagnostic_layers ;
 * les fichiers sont normalisés en GeoJSON et déposés dans Storage.
 */

import * as api from '../../api.js';
import { esc, toast } from '../../components/ui.js';
import { dg, PALETTE, INTERNAL_SOURCES, DEFAULT_STYLE } from './state.js';
import {
  toFeatureCollection, prepareFeatures, detectFields,
  parseCsv, guessColumn, csvToFeatures,
} from './data.js';

/**
 * Ouvre le wizard.
 * @param {Object} opts
 * @param {Object} [opts.layer] - Couche existante (mode édition)
 * @param {Function} opts.onSaved - Callback (ligne sauvegardée) après succès
 */
export function openLayerWizard({ layer = null, onSaved }) {
  const isEdit = !!layer;
  const w = {
    draft: null, // { kind, features, fields, name, url, internalKey, csv }
    cfg: {
      label: layer?.label || '',
      group_label: layer?.group_label || '',
      style: { ...DEFAULT_STYLE, ...layer?.style },
      popup: { title_field: '', fields: [], ...layer?.popup },
      ai_context: layer?.ai_context || '',
      polarity: layer?.polarity || 'neutre',
      default_on: layer ? layer.default_on !== false : true,
    },
  };
  if (isEdit) {
    const rt = dg.runtime.get(layer.id);
    w.draft = { kind: 'edit', features: rt?.features || [], fields: rt?.fields || [] };
  }

  const overlay = document.createElement('div');
  overlay.className = 'adm-overlay dg-modal-overlay';
  overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div class="dg-modal" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Éditer la couche' : 'Ajouter une couche'}">
      <div class="dg-modal__head">
        <div>
          <div class="dg-modal__title"><i class="fa-solid ${isEdit ? 'fa-pen' : 'fa-database'}"></i> ${isEdit ? 'Éditer la couche' : 'Ajouter une couche'}</div>
          <div class="dg-modal__sub">${isEdit ? esc(layer.label) : 'GeoJSON, CSV géolocalisé, lien open data ou données Open Projets'}</div>
        </div>
        <button type="button" class="dg-modal__close" data-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="dg-modal__body">
        ${isEdit ? '' : _sourceStepHtml()}
        <div id="dg-wz-config" ${isEdit ? '' : 'hidden'}>${_configStepsHtml(w)}</div>
      </div>
      <div class="dg-modal__foot">
        <button type="button" class="adm-btn adm-btn--secondary" data-close>Annuler</button>
        <button type="button" class="adm-btn adm-btn--primary" id="dg-wz-save" ${isEdit ? '' : 'disabled'}>
          <i class="fa-solid fa-check"></i> ${isEdit ? 'Enregistrer' : 'Ajouter la couche'}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  if (!isEdit) _bindSourceStep(overlay, w);
  _bindConfigSteps(overlay, w);
  if (isEdit) _refreshFieldSelectors(overlay, w);

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
        <input type="file" id="dg-wz-file" accept=".geojson,.json,.csv" hidden>
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <span class="dg-drop__t">Glissez un fichier ou <u>parcourez</u></span>
        <span class="dg-drop__s">.geojson · .json · .csv (colonnes latitude / longitude)</span>
      </label>
    </div>
    <div data-srcpane="url" hidden>
      <div class="dg-url-row">
        <input type="url" class="adm-input" id="dg-wz-url" placeholder="https://…/donnees.geojson ou .csv">
        <button type="button" class="adm-btn adm-btn--secondary" id="dg-wz-url-load">Charger</button>
      </div>
      <div class="adm-form-hint">Un GeoJSON ou CSV accessible publiquement (open data, API SIG…). La couche restera synchronisée avec cette URL.</div>
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
  fileInput?.addEventListener('change', (e) => { if (e.target.files[0]) _readFile(overlay, w, e.target.files[0]); });
  ['dragover', 'dragenter'].forEach((ev) => drop?.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop?.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop?.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) _readFile(overlay, w, f); });

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
      w.draft = { kind: 'internal', internalKey: key, features: [], fields: [] };
      w.cfg.label = w.cfg.label || src.label;
      w.cfg.group_label = w.cfg.group_label || 'Open Projets';
      w.cfg.style = { ...DEFAULT_STYLE, ...src.defaults.style };
      w.cfg.popup = { ...src.defaults.popup };
      w.cfg.ai_context = src.defaults.ai_context;
      w.cfg.polarity = src.defaults.polarity;
      overlay.querySelectorAll('[data-internal]').forEach((b) => b.classList.toggle('is-active', b === btn));
      _showDetect(overlay, `<b>${esc(src.label)}</b> — les données de la structure seront chargées automatiquement.`, false);
      _showConfig(overlay, w);
    });
  });
}

async function _readFile(overlay, w, file) {
  try {
    const text = await file.text();
    const isCsv = /\.csv$/i.test(file.name);
    const name = file.name.replace(/\.[^.]+$/, '');
    _ingest(overlay, w, text, isCsv ? 'csv' : 'geojson', name, null);
  } catch (e) {
    _showDetect(overlay, `Lecture du fichier impossible (${esc(e.message)}).`, true);
  }
}

function _ingest(overlay, w, text, kind, name, url) {
  try {
    if (kind === 'geojson') {
      const fc = toFeatureCollection(JSON.parse(text));
      if (!fc) throw new Error('GeoJSON non reconnu (FeatureCollection ou Feature attendu)');
      const features = prepareFeatures(fc);
      if (!features.length) throw new Error('Aucune géométrie valide trouvée');
      w.draft = { kind: url ? 'url' : 'file', url, features, fields: detectFields(features), name };
      _showDetect(overlay, `<b>GeoJSON</b> reconnu — <b>${features.length.toLocaleString('fr-FR')}</b> entité(s) valide(s).`, false);
    } else {
      const { headers, records } = parseCsv(text);
      if (!records.length) throw new Error('CSV vide ou illisible');
      const lat = guessColumn(headers, ['lat', 'latitude', 'y']);
      const lng = guessColumn(headers, ['lon', 'lng', 'long', 'longitude', 'x']);
      w.draft = { kind: url ? 'url' : 'file', url, name, csv: { headers, records, lat, lng }, features: [], fields: [] };
      _recountCsv(overlay, w);
    }
    if (!w.cfg.label) w.cfg.label = name;
    _showConfig(overlay, w);
  } catch (e) {
    w.draft = null;
    _showDetect(overlay, esc(e.message), true);
    const config = overlay.querySelector('#dg-wz-config');
    if (config) config.hidden = true;
    _updateSaveState(overlay, w);
  }
}

function _recountCsv(overlay, w) {
  const { headers, records, lat, lng } = w.draft.csv;
  const features = csvToFeatures(records, lat, lng);
  w.draft.features = features;
  w.draft.fields = headers.filter((h) => h !== lat && h !== lng);
  const ok = features.length > 0;
  _showDetect(
    overlay,
    ok
      ? `<b>CSV</b> reconnu — <b>${features.length.toLocaleString('fr-FR')}</b> point(s) géolocalisé(s) sur ${records.length.toLocaleString('fr-FR')} ligne(s).`
      : 'Aucun point géolocalisé — vérifiez les colonnes latitude / longitude.',
    !ok
  );
  _updateSaveState(overlay, w);
}

function _showDetect(overlay, html, isError) {
  const detect = overlay.querySelector('#dg-wz-detect');
  if (!detect) return;
  detect.hidden = false;
  detect.classList.toggle('dg-detect--error', !!isError);
  detect.innerHTML = `<i class="fa-solid ${isError ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> <span>${html}</span>`;
}

/* ── Étapes 2-4 : configuration ────────────────────────────────── */

function _configStepsHtml(w) {
  const groups = [...new Set(dg.layers.map((l) => l.group_label).filter(Boolean))];
  const cfg = w.cfg;
  return `
    <div class="dg-step"><span class="dg-step__n">2</span><span class="dg-step__t">Identité</span></div>
    <div class="adm-form-row">
      <div class="adm-form-group">
        <label class="adm-label" for="dg-wz-label">Nom de la couche</label>
        <input type="text" class="adm-input" id="dg-wz-label" value="${esc(cfg.label)}" placeholder="Ex. Comptages vélo 2026">
      </div>
      <div class="adm-form-group">
        <label class="adm-label" for="dg-wz-group">Groupe <span class="dg-opt">(optionnel)</span></label>
        <input type="text" class="adm-input" id="dg-wz-group" list="dg-wz-groups" value="${esc(cfg.group_label)}" placeholder="Ex. Contributions citoyennes">
        <datalist id="dg-wz-groups">${groups.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>
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

    <div class="dg-step"><span class="dg-step__n">3</span><span class="dg-step__t">Style</span></div>
    <div class="adm-form-group">
      <label class="adm-label">Coloration</label>
      <div class="dg-seg" id="dg-wz-colormode">
        <button type="button" data-mode="single" class="${cfg.style.mode !== 'category' ? 'is-active' : ''}">Couleur unique</button>
        <button type="button" data-mode="category" class="${cfg.style.mode === 'category' ? 'is-active' : ''}">Par catégorie</button>
      </div>
    </div>
    <div class="adm-form-group" id="dg-wz-single-wrap" ${cfg.style.mode === 'category' ? 'hidden' : ''}>
      <div class="dg-swatches" id="dg-wz-swatches"></div>
    </div>
    <div class="adm-form-group" id="dg-wz-cat-wrap" ${cfg.style.mode === 'category' ? '' : 'hidden'}>
      <label class="adm-label" for="dg-wz-catfield">Champ de catégorisation</label>
      <select class="adm-select" id="dg-wz-catfield"></select>
      <div class="adm-form-hint">Une couleur est attribuée automatiquement à chaque valeur.</div>
    </div>
    <div class="adm-form-group">
      <label class="adm-label" for="dg-wz-radius">Taille des points — <b id="dg-wz-radius-v">${esc(String(cfg.style.radius || 4))}</b> px</label>
      <input type="range" min="2" max="9" value="${esc(String(cfg.style.radius || 4))}" id="dg-wz-radius" class="dg-range">
    </div>

    <div class="dg-step"><span class="dg-step__n">4</span><span class="dg-step__t">Popup &amp; analyse IA</span></div>
    <div class="adm-form-group">
      <label class="adm-label" for="dg-wz-title">Champ-titre de la popup</label>
      <select class="adm-select" id="dg-wz-title"></select>
    </div>
    <div class="adm-form-group">
      <label class="adm-label">Champs affichés dans la popup</label>
      <div class="dg-checks" id="dg-wz-popfields"></div>
    </div>
    <div class="adm-form-group">
      <label class="adm-label" for="dg-wz-ai">Contexte pour l'IA <span class="dg-opt">(que représentent ces données ?)</span></label>
      <textarea class="adm-textarea" id="dg-wz-ai" rows="2" placeholder="Ex. Signalements citoyens de dangers cyclables">${esc(cfg.ai_context)}</textarea>
    </div>
    <div class="adm-form-group">
      <label class="adm-label">Polarité des signaux</label>
      <div class="dg-seg" id="dg-wz-polarity">
        <button type="button" data-pol="negatif" class="${cfg.polarity === 'negatif' ? 'is-active' : ''}">Négatif</button>
        <button type="button" data-pol="neutre" class="${cfg.polarity === 'neutre' ? 'is-active' : ''}">Neutre</button>
        <button type="button" data-pol="positif" class="${cfg.polarity === 'positif' ? 'is-active' : ''}">Positif</button>
      </div>
      <div class="adm-form-hint">Pèse dans le score de zone : négatif = problèmes signalés, positif = points forts.</div>
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
  overlay.querySelectorAll('#dg-wz-polarity button').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.pol === cfg.polarity);
  });
  overlay.querySelectorAll('#dg-wz-colormode button').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.mode === (cfg.style.mode === 'category' ? 'category' : 'single'));
  });
  const singleWrap = overlay.querySelector('#dg-wz-single-wrap');
  if (singleWrap) singleWrap.hidden = cfg.style.mode === 'category';
  const catWrap = overlay.querySelector('#dg-wz-cat-wrap');
  if (catWrap) catWrap.hidden = cfg.style.mode !== 'category';
  const radius = overlay.querySelector('#dg-wz-radius');
  if (radius) radius.value = String(cfg.style.radius || 4);
  const radiusLabel = overlay.querySelector('#dg-wz-radius-v');
  if (radiusLabel) radiusLabel.textContent = String(cfg.style.radius || 4);
  _renderSwatches(overlay, w);
}

function _bindConfigSteps(overlay, w) {
  overlay.querySelector('#dg-wz-label')?.addEventListener('input', (e) => {
    w.cfg.label = e.target.value.trim();
    _updateSaveState(overlay, w);
  });
  overlay.querySelector('#dg-wz-group')?.addEventListener('input', (e) => { w.cfg.group_label = e.target.value.trim(); });

  overlay.querySelector('#dg-wz-colormode')?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('#dg-wz-colormode button').forEach((b) => b.classList.toggle('is-active', b === btn));
      w.cfg.style.mode = btn.dataset.mode;
      overlay.querySelector('#dg-wz-single-wrap').hidden = w.cfg.style.mode === 'category';
      overlay.querySelector('#dg-wz-cat-wrap').hidden = w.cfg.style.mode !== 'category';
    });
  });
  overlay.querySelector('#dg-wz-catfield')?.addEventListener('change', (e) => {
    w.cfg.style.category_field = e.target.value;
    w.cfg.style.cat_colors = {}; // recalculées au chargement depuis les données
  });
  overlay.querySelector('#dg-wz-radius')?.addEventListener('input', (e) => {
    w.cfg.style.radius = Number(e.target.value);
    const v = overlay.querySelector('#dg-wz-radius-v');
    if (v) v.textContent = e.target.value;
  });
  overlay.querySelector('#dg-wz-title')?.addEventListener('change', (e) => { w.cfg.popup.title_field = e.target.value; });
  overlay.querySelector('#dg-wz-ai')?.addEventListener('input', (e) => { w.cfg.ai_context = e.target.value.trim(); });
  overlay.querySelector('#dg-wz-polarity')?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('#dg-wz-polarity button').forEach((b) => b.classList.toggle('is-active', b === btn));
      w.cfg.polarity = btn.dataset.pol;
    });
  });
  overlay.querySelector('#dg-wz-defon')?.addEventListener('change', (e) => { w.cfg.default_on = e.target.checked; });

  overlay.querySelector('#dg-wz-lat')?.addEventListener('change', (e) => {
    w.draft.csv.lat = e.target.value;
    _recountCsv(overlay, w);
    _refreshFieldSelectors(overlay, w);
  });
  overlay.querySelector('#dg-wz-lng')?.addEventListener('change', (e) => {
    w.draft.csv.lng = e.target.value;
    _recountCsv(overlay, w);
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

/** Alimente les selects champ-titre / catégorie / popup depuis les champs détectés. */
function _refreshFieldSelectors(overlay, w) {
  const fields = w.draft?.fields || [];
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

  const fieldOptions = (selected) => '<option value="">(aucun)</option>'
    + fields.map((f) => `<option ${f === selected ? 'selected' : ''}>${esc(f)}</option>`).join('');
  const titleSel = overlay.querySelector('#dg-wz-title');
  if (titleSel) titleSel.innerHTML = fieldOptions(cfg.popup.title_field);
  const catSel = overlay.querySelector('#dg-wz-catfield');
  if (catSel) catSel.innerHTML = fieldOptions(cfg.style.category_field);

  const popWrap = overlay.querySelector('#dg-wz-popfields');
  if (popWrap) {
    popWrap.innerHTML = '';
    if (!fields.length) {
      popWrap.innerHTML = '<span class="adm-form-hint">Aucun champ détecté.</span>';
    }
    if (!cfg.popup.fields?.length) cfg.popup.fields = fields.slice(0, 4);
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

    if (w.draft.kind === 'internal') {
      source_type = 'internal';
      source_ref = w.draft.internalKey;
    } else if (w.draft.kind === 'url') {
      source_type = 'url';
      source_ref = w.draft.url;
    } else if (w.draft.kind === 'file') {
      // Fichier local : normalisé en FeatureCollection puis déposé dans Storage.
      const fc = {
        type: 'FeatureCollection',
        features: w.draft.features.map(({ __pt, ...f }) => f),
      };
      source_type = 'storage';
      source_ref = await api.uploadDiagnosticGeoJSON(fc);
    }

    const { data, error } = await api.upsertDiagnosticLayer({
      id: existing?.id,
      label: w.cfg.label,
      group_label: w.cfg.group_label,
      source_type,
      source_ref,
      style: w.cfg.style,
      popup: w.cfg.popup,
      ai_context: w.cfg.ai_context,
      polarity: w.cfg.polarity,
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
