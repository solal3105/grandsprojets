/**
 * Diagnostic terrain - dock flottant sur la carte.
 * Deux onglets : « Couches » (visibilité + gestion) et « Analyse » (sélection
 * lasso + diagnostic IA, contenu rendu par analysis.js).
 */

import { esc, escAttr, toast, confirm } from '../../components/ui.js';
import { router } from '../../router.js';
import { dg, safeColor } from './state.js';
import { loadLayer, toggleLayer, deleteLayer } from './layers.js';
import { colorExpression, updateHeatmap, setBuildings3D } from './map.js';
import { openLayerWizard } from './wizard.js';

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
      <button type="button" class="dg-tab" data-tab="analyse" role="tab">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Analyse
        <span class="dg-tab__badge" id="dg-tab-badge" hidden>0</span>
      </button>
    </div>
    <div class="dg-tab-panel" data-panel="layers" id="dg-panel-layers"></div>
    <div class="dg-tab-panel" data-panel="analyse" id="dg-panel-analyse" hidden></div>
  `;
  mapWrap.appendChild(dock);

  dock.querySelectorAll('.dg-tab').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  renderLayersPanel();
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
        <div class="dg-empty__text">Ajoutez vos sources : signalements citoyens, open data, fichiers GeoJSON ou CSV, ou les données Open Projets de votre structure.</div>
        <button type="button" class="adm-btn adm-btn--primary adm-btn--sm" id="dg-add-first">
          <i class="fa-solid fa-plus"></i> Ajouter une couche
        </button>
      </div>
    `;
    panel.querySelector('#dg-add-first')?.addEventListener('click', () => _openAdd());
    return;
  }

  // Groupes d'affichage (group_label libre, les couches sans groupe en premier).
  const groups = new Map();
  for (const layer of dg.layers) {
    const key = layer.group_label || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(layer);
  }

  let html = '<div class="dg-layers-list">';
  for (const [group, layers] of groups) {
    if (group) html += `<div class="dg-group-label">${esc(group)}</div>`;
    html += layers.map(_layerRowHtml).join('');
  }
  html += '</div>';
  html += `
    <div class="dg-layers-foot">
      <label class="dg-row dg-row--tool" id="dg-heatmap-row">
        <span class="dg-swatch" style="background:linear-gradient(135deg,#22d3ee,#f59e0b,#dc2626)"></span>
        <span class="dg-row__txt"><span class="dg-row__label">Heatmap de densité</span></span>
        <span class="adm-switch"><input type="checkbox" id="dg-heatmap-toggle" ${dg.heatmapOn ? 'checked' : ''}><span class="adm-switch__track"></span></span>
      </label>
      <label class="dg-row dg-row--tool" id="dg-b3d-row">
        <span class="dg-swatch dg-swatch--3d"></span>
        <span class="dg-row__txt"><span class="dg-row__label">Bâtiments en relief</span><span class="dg-row__sub">à partir du zoom 15</span></span>
        <span class="adm-switch"><input type="checkbox" id="dg-b3d-toggle" ${dg.buildings3D ? 'checked' : ''}><span class="adm-switch__track"></span></span>
      </label>
      <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm dg-add-btn" id="dg-add-layer">
        <i class="fa-solid fa-plus"></i> Ajouter une couche
      </button>
    </div>
  `;
  panel.innerHTML = html;

  panel.querySelector('#dg-add-layer')?.addEventListener('click', () => _openAdd());
  panel.querySelector('#dg-heatmap-toggle')?.addEventListener('change', (e) => {
    dg.heatmapOn = e.target.checked;
    updateHeatmap(dg.heatmapOn);
  });
  panel.querySelector('#dg-b3d-toggle')?.addEventListener('change', (e) => {
    dg.buildings3D = e.target.checked;
    setBuildings3D(dg.buildings3D, 'dg-heat');
  });

  panel.querySelectorAll('.dg-row[data-id]').forEach((row) => _bindLayerRow(row));
}

function _swatchColor(layer) {
  const expr = colorExpression(layer.style);
  if (typeof expr === 'string') return safeColor(expr);
  const colors = Object.values(layer.style?.cat_colors || {});
  return safeColor(colors[0] || layer.style?.color);
}

function _layerRowHtml(layer) {
  const rt = dg.runtime.get(layer.id);
  const visible = rt ? rt.visible : layer.default_on !== false;
  let count = '';
  if (!rt || rt.status === 'loading') count = '<i class="fa-solid fa-spinner fa-spin"></i>';
  else if (rt.status === 'error') count = '<i class="fa-solid fa-triangle-exclamation" title="Chargement impossible"></i>';
  else count = _fmt(rt.count);
  const statusClass = rt?.status === 'error' ? ' dg-row--error' : '';
  return `
    <div class="dg-row${statusClass}" data-id="${escAttr(layer.id)}">
      <span class="dg-swatch" style="background:${escAttr(_swatchColor(layer))}"></span>
      <span class="dg-row__txt">
        <span class="dg-row__label">${esc(layer.label)}</span>
      </span>
      <span class="dg-count" data-count>${count}</span>
      <button type="button" class="dg-row__act" data-act="edit" title="Éditer la couche"><i class="fa-solid fa-pen"></i></button>
      <button type="button" class="dg-row__act" data-act="delete" title="Supprimer la couche"><i class="fa-solid fa-trash-can"></i></button>
      <label class="adm-switch adm-switch--sm"><input type="checkbox" data-act="toggle" ${visible ? 'checked' : ''} aria-label="Afficher ${escAttr(layer.label)}"><span class="adm-switch__track"></span></label>
    </div>
  `;
}

function _bindLayerRow(row) {
  const id = row.dataset.id;
  const layer = () => dg.layers.find((l) => l.id === id);

  row.querySelector('[data-act="toggle"]')?.addEventListener('change', (e) => {
    toggleLayer(id, e.target.checked);
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
      title: 'Supprimer la couche',
      message: `Supprimer « ${l.label} » du diagnostic ? Les données sources ne sont pas affectées.`,
      confirmLabel: 'Supprimer',
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

/** Rafraîchit le compteur/état d'une seule ligne (pendant un chargement). */
export function updateLayerRow(id) {
  const row = dg.container?.querySelector(`.dg-row[data-id="${CSS.escape(id)}"]`);
  const rt = dg.runtime.get(id);
  if (!row || !rt) return;
  const count = row.querySelector('[data-count]');
  if (!count) return;
  if (rt.status === 'loading') count.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  else if (rt.status === 'error') count.innerHTML = '<i class="fa-solid fa-triangle-exclamation" title="Chargement impossible"></i>';
  else count.textContent = _fmt(rt.count);
  row.classList.toggle('dg-row--error', rt.status === 'error');
}

function _openAdd() {
  openLayerWizard({
    onSaved: async (saved) => {
      dg.layers.push(saved);
      await loadLayer(saved, () => updateLayerRow(saved.id));
      renderLayersPanel();
    },
  });
}
