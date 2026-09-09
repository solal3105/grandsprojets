/**
 * Diagnostic terrain - dock flottant sur la carte.
 * Trois onglets : « Couches » (sources connectées et fichiers, visibilité,
 * ordre, gestion), « Carte » (fond, relief, chaleur) et « Analyse »
 * (sélection lasso + diagnostic, contenu rendu par analysis.js).
 */

import { esc, escAttr, toast, confirm } from '../../components/ui.js';
import { router } from '../../router.js';
import { dg, safeColor, layerKind } from './state.js';
import { loadLayer, toggleLayer, deleteLayer, autoDarkBase, moveInList, reorderLayers } from './layers.js';
import { colorExpression, heatColors, updateHeatmap, setBuildings3D, setDarkBase, setBasemap, fitFeatures } from './map.js';
import { openLayerWizard } from './wizard.js';
import { openDataCatalog } from './catalog.js';
import { sourceOfLayer } from './sources.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

/** Construit le dock (structure + onglets) dans le conteneur de la carte. */
export function renderDock(mapWrap) {
  const dock = document.createElement('div');
  dock.className = 'dg-dock';
  dock.innerHTML = `
    <div class="dg-tabs" role="tablist">
      <button type="button" class="dg-tab is-active" data-tab="layers" role="tab">
        <i class="fa-solid fa-layer-group"></i> Couches
      </button>
      <button type="button" class="dg-tab" data-tab="map" role="tab">
        <i class="fa-solid fa-map"></i> Carte
      </button>
      <button type="button" class="dg-tab" data-tab="analyse" role="tab">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Analyse
        <span class="dg-tab__badge" id="dg-tab-badge" hidden>0</span>
      </button>
    </div>
    <div class="dg-tab-panel" data-panel="layers" id="dg-panel-layers"></div>
    <div class="dg-tab-panel" data-panel="map" id="dg-panel-map" hidden></div>
    <div class="dg-tab-panel" data-panel="analyse" id="dg-panel-analyse" hidden></div>
  `;
  mapWrap.appendChild(dock);

  dock.querySelectorAll('.dg-tab').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  renderLayersPanel();
  renderMapPanel();
}

/** Affiche un onglet du dock. */
export function showTab(name) {
  const dock = dg.container?.querySelector('.dg-dock');
  if (!dock) return;
  dock.querySelectorAll('.dg-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  dock.querySelectorAll('.dg-tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}

/** Met à jour le badge de l'onglet Analyse (nombre de points sélectionnés). */
export function setAnalysisBadge(count) {
  const badge = dg.container?.querySelector('#dg-tab-badge');
  if (!badge) return;
  badge.hidden = !count;
  badge.textContent = _fmt(count);
}

/* ── Onglet Couches ─────────────────────────────────────────────── */

/** Une couche vient du catalogue (source connectée) ou d'un fichier décrit à la main. */
const _isConnected = (layer) => !!sourceOfLayer(layer);

/** Rend (ou re-rend) tout l'onglet Couches depuis dg.layers + dg.runtime. */
export function renderLayersPanel() {
  const panel = dg.container?.querySelector('#dg-panel-layers');
  if (!panel) return;

  if (dg.layersLoadFailed) {
    panel.innerHTML = `
      <div class="dg-empty">
        <i class="fa-solid fa-plug-circle-xmark dg-empty__icon"></i>
        <div class="dg-empty__title">Chargement impossible</div>
        <div class="dg-empty__text">Les couches n'ont pas pu être récupérées. Vérifiez votre connexion puis réessayez.</div>
        <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="dg-layers-retry">
          <i class="fa-solid fa-rotate"></i> Réessayer
        </button>
      </div>
    `;
    panel.querySelector('#dg-layers-retry')?.addEventListener('click', () => {
      router.navigate('/admin/diagnostic/', { replace: true });
    });
    return;
  }

  if (!dg.layers.length) {
    panel.innerHTML = `
      <div class="dg-empty">
        <i class="fa-solid fa-layer-group dg-empty__icon"></i>
        <div class="dg-empty__title">Aucune couche de données</div>
        <div class="dg-empty__text">Signalements des habitants, Baromètre vélo, accidents, flux Strava : choisissez une source, nous faisons le reste.</div>
        <button type="button" class="adm-btn adm-btn--primary adm-btn--sm" id="dg-add-first">
          <i class="fa-solid fa-plus"></i> Ajouter des données
        </button>
      </div>
    `;
    panel.querySelector('#dg-add-first')?.addEventListener('click', () => _openAdd());
    return;
  }

  const connected = dg.layers.filter(_isConnected);
  const manual = dg.layers.filter((l) => !_isConnected(l));
  panel.innerHTML = `
    <div class="dg-layers-list">
      ${_sectionHtml('Sources connectées', 'fa-solid fa-plug', connected, 'sources')}
      ${_sectionHtml('Mes fichiers', 'fa-solid fa-folder-open', manual, 'files')}
    </div>
    <div class="dg-layers-foot">
      <button type="button" class="adm-btn adm-btn--primary adm-btn--sm dg-add-btn" id="dg-add-layer">
        <i class="fa-solid fa-plus"></i> Ajouter des données
      </button>
    </div>
  `;

  panel.querySelector('#dg-add-layer')?.addEventListener('click', () => _openAdd());
  panel.querySelectorAll('.dg-row[data-id]').forEach((row) => _bindLayerRow(row));
  _bindReorder(panel.querySelector('.dg-layers-list'));
}

/** Une section du panneau (sources connectées, fichiers), avec ses groupes. */
function _sectionHtml(title, icon, layers, key) {
  if (!layers.length) return '';
  const groups = new Map();
  for (const layer of layers) {
    const g = layer.group_label || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(layer);
  }
  const visible = layers.filter((l) => (dg.runtime.get(l.id)?.visible ?? l.default_on !== false)).length;
  let html = `
    <section class="dg-sec" data-sec="${key}">
      <div class="dg-sec__head">
        <span class="dg-sec__title"><i class="${icon}"></i> ${esc(title)}</span>
        <span class="dg-sec__count">${visible} / ${layers.length}</span>
      </div>`;
  for (const [group, rows] of groups) {
    if (group) html += `<div class="dg-group-label">${esc(group)}</div>`;
    html += rows.map(_layerRowHtml).join('');
  }
  return html + '</section>';
}

function _swatchColor(layer) {
  const expr = colorExpression(layer.style);
  if (typeof expr === 'string') return safeColor(expr);
  const colors = Object.values(layer.style?.cat_colors || {});
  return safeColor(colors[0] || layer.style?.color);
}

/** Fond de la pastille : dégradé de chaleur en mode gradué, aplat sinon. */
function _swatchStyle(layer) {
  if (layer.style?.mode === 'graduated') {
    const ramp = heatColors(3);
    return `background:linear-gradient(135deg,${ramp[0]},${ramp[1]},${ramp[2]})`;
  }
  return `background:${_swatchColor(layer)}`;
}

/** Mot pour compter les entités d'une couche selon leur géométrie. */
function _unit(rt) {
  const type = rt?.features?.[0]?.geometry?.type || '';
  if (/Point/.test(type)) return 'points';
  if (/Line/.test(type)) return 'tronçons';
  if (/Polygon/.test(type)) return 'zones';
  return 'éléments';
}

/** Ligne de détail : décompte, provenance, synchronisation. */
function _metaHtml(layer) {
  const rt = dg.runtime.get(layer.id);
  const source = sourceOfLayer(layer);
  let count;
  if (!rt || rt.status === 'loading') count = '<span data-count><i class="fa-solid fa-spinner fa-spin"></i></span>';
  else if (rt.status === 'error') count = `<span data-count title="${escAttr(rt.error || 'Chargement impossible')}"><i class="fa-solid fa-triangle-exclamation"></i></span>`;
  else count = `<span data-count>${_fmt(rt.count)}</span> ${_unit(rt)}`;
  const parts = [count];
  if (source) parts.push(esc(source.name));
  else parts.push(layer.source_type === 'url' ? 'Lien' : 'Fichier');
  if (layer.source_type === 'internal' || layer.source_type === 'url') parts.push('synchronisée');
  if (layerKind(layer) === 'reference') parts.push('référence');
  return parts.join(' · ');
}

function _layerRowHtml(layer) {
  const rt = dg.runtime.get(layer.id);
  const visible = rt ? rt.visible : layer.default_on !== false;
  const source = sourceOfLayer(layer);
  const statusClass = rt?.status === 'error' ? ' dg-row--error' : '';
  return `
    <div class="dg-row dg-row--layer${statusClass}${visible ? '' : ' is-off'}" data-id="${escAttr(layer.id)}" draggable="true">
      <span class="dg-row__grip" title="Glisser pour changer l'ordre : la première couche est dessinée au-dessus" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span>
      <span class="dg-swatch${source ? ' dg-swatch--src' : ''}" style="${escAttr(_swatchStyle(layer))}" ${source ? `title="${escAttr(source.name)}"` : ''}>${source ? `<i class="${escAttr(source.icon)}"></i>` : ''}</span>
      <span class="dg-row__txt">
        <span class="dg-row__label">${esc(layer.label)}</span>
        <span class="dg-row__sub">${_metaHtml(layer)}</span>
      </span>
      <span class="dg-row__acts">
        <button type="button" class="dg-row__act" data-act="edit" title="Réglages de la couche"><i class="fa-solid fa-sliders"></i></button>
        <button type="button" class="dg-row__act" data-act="delete" title="Retirer du diagnostic"><i class="fa-solid fa-trash-can"></i></button>
      </span>
      <label class="adm-switch adm-switch--sm"><input type="checkbox" data-act="toggle" ${visible ? 'checked' : ''} aria-label="Afficher ${escAttr(layer.label)}"><span class="adm-switch__track"></span></label>
    </div>
  `;
}

function _bindLayerRow(row) {
  const id = row.dataset.id;
  const layer = () => dg.layers.find((l) => l.id === id);

  row.querySelector('[data-act="toggle"]')?.addEventListener('change', (e) => {
    toggleLayer(id, e.target.checked);
    row.classList.toggle('is-off', !e.target.checked);
    _refreshSectionCounts();
  });

  row.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
    const l = layer();
    if (!l) return;
    openLayerWizard({
      layer: l,
      onSaved: async (saved) => {
        const idx = dg.layers.findIndex((x) => x.id === saved.id);
        if (idx >= 0) dg.layers[idx] = saved;
        await loadLayer(saved, () => updateLayerRow(saved.id));
        renderLayersPanel();
      },
    });
  });

  row.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    const l = layer();
    if (!l) return;
    const ok = await confirm({
      title: 'Retirer la couche',
      message: `Retirer « ${l.label} » du diagnostic ? Les données d'origine ne sont pas touchées.`,
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteLayer(id);
      toast('Couche supprimée', 'success');
      renderLayersPanel();
    } catch (err) {
      toast('Erreur : ' + (err.message || err), 'error');
    }
  });
}

/** Compteurs « visibles / total » des sections, sans re-rendre les lignes. */
function _refreshSectionCounts() {
  const panel = dg.container?.querySelector('#dg-panel-layers');
  if (!panel) return;
  for (const sec of panel.querySelectorAll('.dg-sec')) {
    const rows = [...sec.querySelectorAll('.dg-row--layer')];
    const on = rows.filter((r) => r.querySelector('[data-act="toggle"]')?.checked).length;
    const el = sec.querySelector('.dg-sec__count');
    if (el) el.textContent = `${on} / ${rows.length}`;
  }
}

/** Rafraîchit le compteur/état d'une seule ligne (pendant un chargement). */
export function updateLayerRow(id) {
  const row = dg.container?.querySelector(`.dg-row[data-id="${CSS.escape(id)}"]`);
  const layer = dg.layers.find((l) => l.id === id);
  const rt = dg.runtime.get(id);
  if (!row || !rt || !layer) return;
  const sub = row.querySelector('.dg-row__sub');
  if (sub) sub.innerHTML = _metaHtml(layer);
  row.classList.toggle('dg-row--error', rt.status === 'error');
}

/**
 * Glisser-déposer des lignes : l'ordre de la liste devient l'ordre des
 * couches (la première dessinée au-dessus), enregistré aussitôt.
 */
function _bindReorder(list) {
  if (!list) return;
  let dragged = null;
  const rows = () => [...list.querySelectorAll('.dg-row--layer')];
  const clear = () => rows().forEach((r) => r.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging'));
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.dg-row--layer');
    if (!row) return;
    dragged = row.dataset.id;
    row.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragged); } catch { /* navigateurs stricts */ }
  });
  list.addEventListener('dragover', (e) => {
    const row = e.target.closest?.('.dg-row--layer');
    if (!row || !dragged || row.dataset.id === dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    rows().forEach((r) => r.classList.remove('is-drop-before', 'is-drop-after'));
    row.classList.add(after ? 'is-drop-after' : 'is-drop-before');
  });
  list.addEventListener('dragleave', (e) => {
    const row = e.target.closest?.('.dg-row--layer');
    if (row && !row.contains(e.relatedTarget)) row.classList.remove('is-drop-before', 'is-drop-after');
  });
  list.addEventListener('drop', async (e) => {
    const row = e.target.closest?.('.dg-row--layer');
    const from = dragged || e.dataTransfer.getData('text/plain');
    if (!row || !from || row.dataset.id === from) { clear(); return; }
    e.preventDefault();
    const after = row.classList.contains('is-drop-after');
    clear();
    dragged = null;
    const order = moveInList(dg.layers.map((l) => l.id), from, row.dataset.id, after);
    const ok = await reorderLayers(order);
    renderLayersPanel();
    if (!ok) toast('Ordre non enregistré : il reviendra au rechargement', 'warning');
  });
  list.addEventListener('dragend', () => { dragged = null; clear(); });
}

/* ── Onglet Carte ───────────────────────────────────────────────── */

/** Réglages d'affichage de la carte : fond, relief, chaleur. */
export function renderMapPanel() {
  const panel = dg.container?.querySelector('#dg-panel-map');
  if (!panel) return;
  panel.innerHTML = `
    <div class="dg-settings">
      <div class="dg-setting" id="dg-basemap-row">
        <span class="dg-setting__ico"><i class="fa-solid fa-map"></i></span>
        <span class="dg-row__txt">
          <span class="dg-row__label">Fond de carte</span>
          <span class="dg-row__sub">${dg.basemap === 'satellite' ? 'photographies aériennes IGN' : 'plan OpenStreetMap'}</span>
        </span>
        <div class="dg-seg dg-seg--sm" id="dg-basemap" role="group" aria-label="Fond de carte">
          <button type="button" data-basemap="plan" class="${dg.basemap !== 'satellite' ? 'is-active' : ''}">Plan</button>
          <button type="button" data-basemap="satellite" class="${dg.basemap === 'satellite' ? 'is-active' : ''}">Satellite</button>
        </div>
      </div>
      <label class="dg-setting" id="dg-dark-row">
        <span class="dg-setting__ico"><i class="fa-solid fa-moon"></i></span>
        <span class="dg-row__txt"><span class="dg-row__label">Fond sombre</span><span class="dg-row__sub">fait ressortir les cartes de flux</span></span>
        <span class="adm-switch adm-switch--sm"><input type="checkbox" id="dg-dark-toggle" ${dg.darkBase ? 'checked' : ''}><span class="adm-switch__track"></span></span>
      </label>
      <label class="dg-setting" id="dg-b3d-row">
        <span class="dg-setting__ico"><i class="fa-solid fa-building"></i></span>
        <span class="dg-row__txt"><span class="dg-row__label">Bâtiments en relief</span><span class="dg-row__sub">à partir du zoom 15</span></span>
        <span class="adm-switch adm-switch--sm"><input type="checkbox" id="dg-b3d-toggle" ${dg.buildings3D ? 'checked' : ''}><span class="adm-switch__track"></span></span>
      </label>
      <label class="dg-setting" id="dg-heatmap-row">
        <span class="dg-setting__ico"><i class="fa-solid fa-fire"></i></span>
        <span class="dg-row__txt"><span class="dg-row__label">Chaleur des témoignages</span><span class="dg-row__sub">densité des points des couches visibles</span></span>
        <span class="adm-switch adm-switch--sm"><input type="checkbox" id="dg-heatmap-toggle" ${dg.heatmapOn ? 'checked' : ''}><span class="adm-switch__track"></span></span>
      </label>
    </div>
  `;
  panel.querySelectorAll('#dg-basemap button').forEach((btn) => {
    btn.addEventListener('click', () => {
      setBasemap(btn.dataset.basemap);
      panel.querySelectorAll('#dg-basemap button').forEach((b) => b.classList.toggle('is-active', b === btn));
      const sub = panel.querySelector('#dg-basemap-row .dg-row__sub');
      if (sub) sub.textContent = dg.basemap === 'satellite' ? 'photographies aériennes IGN' : 'plan OpenStreetMap';
    });
  });
  panel.querySelector('#dg-dark-toggle')?.addEventListener('change', (e) => {
    dg.darkBase = e.target.checked;
    setDarkBase(dg.darkBase);
  });
  panel.querySelector('#dg-b3d-toggle')?.addEventListener('change', (e) => {
    dg.buildings3D = e.target.checked;
    setBuildings3D(dg.buildings3D, 'dg-heat');
  });
  panel.querySelector('#dg-heatmap-toggle')?.addEventListener('change', (e) => {
    dg.heatmapOn = e.target.checked;
    updateHeatmap(dg.heatmapOn);
  });
}

/** Reflète un réglage changé par le code (fond sombre automatique). */
export function syncMapPanel() {
  const panel = dg.container?.querySelector('#dg-panel-map');
  if (!panel) return;
  const dark = panel.querySelector('#dg-dark-toggle');
  if (dark) dark.checked = !!dg.darkBase;
}

/* ── Ajout ──────────────────────────────────────────────────────── */

/** Couches fraîchement enregistrées : chargées, listées, montrées. */
async function _onAdded(rows) {
  const added = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  for (const saved of added) dg.layers.push(saved);
  renderLayersPanel();
  await Promise.all(added.map((saved) => loadLayer(saved, () => updateLayerRow(saved.id))));
  autoDarkBase();
  syncMapPanel();
  renderLayersPanel();
  // Montrer ce qui vient d'être importé : la carte peut être cadrée ailleurs.
  const shown = added.flatMap((saved) => {
    const rt = dg.runtime.get(saved.id);
    return rt?.status === 'ready' ? rt.features : [];
  });
  if (shown.length) fitFeatures(shown, { maxZoom: 13, base: 70 });
}

function _openAdd() {
  openDataCatalog({ onAdded: _onAdded });
}
