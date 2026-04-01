/* ============================================================================
   CATEGORIES SECTION — List, create, edit, reorder, delete
   ============================================================================ */

import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, skeletonTable } from '../components/ui.js';
import { renderIconField, bindIconField, setIconField } from '../components/icon-picker.js';

let _categories = [];
let _layers = [];
let _editingCategory = null; // null = create mode, string = editing category name

export async function renderCategories(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-tags"></i> Catégories</h1>
        <p class="adm-page-subtitle">Gérer les catégories de ${esc(store.city)}</p>
      </div>
      <button class="adm-btn adm-btn--primary" id="cat-add-btn">
        <i class="fa-solid fa-plus"></i> Nouvelle catégorie
      </button>
    </div>

    <!-- Edit/Create form (hidden by default) -->
    <div class="adm-card" id="cat-form-card" hidden>
      <div class="adm-card__header">
        <span class="adm-card__title" id="cat-form-title">Nouvelle catégorie</span>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" id="cat-form-cancel">
          <i class="fa-solid fa-xmark"></i> Annuler
        </button>
      </div>
      <div class="adm-card__body">
        <form id="cat-form">
          <div class="adm-form-row">
            <div class="adm-form-group">
              <label class="adm-label">Nom <span class="adm-required">*</span></label>
              <input type="text" class="adm-input" id="cat-name" required placeholder="Ex: Transport">
            </div>
            <div class="adm-form-group">
              <label class="adm-label">Icône</label>
              ${renderIconField('cat-icon', 'fa-solid fa-folder', 'fa-solid fa-folder')}
            </div>
          </div>
          <div class="adm-form-group">
            <label class="adm-label">Ordre d'affichage</label>
            <input type="number" class="adm-input" id="cat-order" value="0" min="0" style="max-width:120px;">
          </div>
          <div class="adm-form-group">
            <label class="adm-label">Couches associées</label>
            <div id="cat-layers" class="adm-toggle-grid" style="margin-top:4px;"></div>
            <p class="adm-form-hint">Sélectionnez les couches à afficher pour cette catégorie</p>
          </div>
          <div class="adm-form-group">
            <label class="adm-label">Tags disponibles</label>
            <textarea class="adm-textarea" id="cat-tags" rows="2" placeholder='[{"name":"tag1","color":"#14AE5C","icon":"fa-solid fa-tag"}]'></textarea>
            <p class="adm-form-hint">Format JSON. Chaque tag: {name, color, icon}</p>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button type="button" class="adm-btn adm-btn--secondary" id="cat-form-cancel-2">Annuler</button>
            <button type="submit" class="adm-btn adm-btn--primary" id="cat-form-submit">Créer</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Categories list -->
    <div id="cat-list">
      ${skeletonTable(4)}
    </div>
  `;

  _bindForm(container);
  bindIconField(container, 'cat-icon', { category: 'general' });
  await _loadData(container);
}

function _bindForm(container) {
  const addBtn = container.querySelector('#cat-add-btn');
  const formCard = container.querySelector('#cat-form-card');
  const form = container.querySelector('#cat-form');
  const cancelBtns = container.querySelectorAll('#cat-form-cancel, #cat-form-cancel-2');

  addBtn?.addEventListener('click', () => {
    _editingCategory = null;
    _resetForm(container);
    container.querySelector('#cat-form-title').textContent = 'Nouvelle catégorie';
    container.querySelector('#cat-form-submit').textContent = 'Créer';
    formCard.hidden = false;
    formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  cancelBtns.forEach(btn => btn.addEventListener('click', () => {
    formCard.hidden = true;
    _editingCategory = null;
  }));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = container.querySelector('#cat-form-submit');
    submitBtn.disabled = true;

    const data = _collectFormData(container);

    try {
      if (_editingCategory) {
        await api.updateCategory(_editingCategory, data);
        toast('Catégorie mise à jour', 'success');
      } else {
        await api.createCategory(data);
        toast('Catégorie créée', 'success');
      }
      formCard.hidden = true;
      _editingCategory = null;
      await _loadData(container);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function _collectFormData(container) {
  const name = container.querySelector('#cat-name').value.trim();
  const icon = container.querySelector('#cat-icon').value.trim() || 'fa-solid fa-folder';
  const order = parseInt(container.querySelector('#cat-order').value, 10) || 0;
  const tagsRaw = container.querySelector('#cat-tags').value.trim();

  // Selected layers
  const checked = container.querySelectorAll('#cat-layers .adm-toggle-item.active');
  const layers = Array.from(checked).map(el => el.dataset.layer);

  let tags = null;
  if (tagsRaw) {
    try { tags = JSON.parse(tagsRaw); } catch (_) { tags = null; }
  }

  return {
    category: name,
    icon_class: icon,
    display_order: order,
    layers_to_display: layers.length > 0 ? layers : null,
    available_tags: tags ? JSON.stringify(tags) : null,
  };
}

function _resetForm(container) {
  container.querySelector('#cat-name').value = '';
  setIconField(container, 'cat-icon', 'fa-solid fa-folder');
  container.querySelector('#cat-order').value = '0';
  container.querySelector('#cat-tags').value = '';
  container.querySelectorAll('#cat-layers .adm-toggle-item').forEach(el => el.classList.remove('active'));
}

async function _loadData(container) {
  const listEl = container.querySelector('#cat-list');
  if (!listEl) return;

  try {
    [_categories, _layers] = await Promise.all([api.getCategories(), api.getLayers()]);
    _renderLayers(container);
    _renderList(container);
  } catch (e) {
    console.error('[admin/categories]', e);
    listEl.innerHTML = `<div class="adm-card"><div class="adm-card__body" style="color:var(--danger);">Erreur : ${esc(e.message)}</div></div>`;
  }
}

function _renderLayers(container) {
  const layersEl = container.querySelector('#cat-layers');
  if (!layersEl) return;
  layersEl.innerHTML = _layers.map(l => `
    <div class="adm-toggle-item" data-layer="${esc(l.name)}">
      <i class="${esc(l.icon || 'fa-solid fa-layer-group')}"></i>
      <span>${esc(l.name)}</span>
    </div>
  `).join('');

  layersEl.querySelectorAll('.adm-toggle-item').forEach(item => {
    item.addEventListener('click', () => item.classList.toggle('active'));
  });
}

function _renderList(container) {
  const listEl = container.querySelector('#cat-list');
  if (!listEl) return;

  if (_categories.length === 0) {
    listEl.innerHTML = `
      <div class="adm-card">
        <div class="adm-empty" style="padding:48px;">
          <div class="adm-empty__icon"><i class="fa-solid fa-tags"></i></div>
          <div class="adm-empty__title">Aucune catégorie</div>
          <div class="adm-empty__text">Créez votre première catégorie pour organiser les contributions.</div>
        </div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `<div class="adm-cat-list">${_categories.map(_renderCatCard).join('')}</div>`;

  // Bind actions
  listEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = btn.closest('.adm-cat-card')?.dataset.category;
      if (!cat) return;
      if (btn.dataset.action === 'edit') _startEdit(container, cat);
      if (btn.dataset.action === 'delete') _handleDelete(container, cat);
    });
  });
}

function _renderCatCard(cat) {
  const iconClass = cat.icon_class || 'fa-solid fa-folder';
  const layers = cat.layers_to_display;
  const layersText = Array.isArray(layers) && layers.length > 0 ? layers.join(', ') : 'Aucune couche';

  return `
    <div class="adm-cat-card" data-category="${esc(cat.category)}">
      <div class="adm-cat-card__drag"><i class="fa-solid fa-grip-vertical"></i></div>
      <div class="adm-cat-card__icon" style="background:var(--primary-alpha-12);color:var(--primary);">
        <i class="${esc(iconClass)}"></i>
      </div>
      <div class="adm-cat-card__info">
        <div class="adm-cat-card__name">${esc(cat.category)}</div>
        <div class="adm-cat-card__layers">${esc(layersText)}</div>
      </div>
      <span class="adm-badge adm-badge--neutral">Ordre: ${cat.display_order ?? 0}</span>
      <div class="adm-cat-card__actions">
        <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="edit" title="Modifier">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="delete" title="Supprimer" style="color:var(--danger);">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function _startEdit(container, categoryName) {
  const cat = _categories.find(c => c.category === categoryName);
  if (!cat) return;

  _editingCategory = categoryName;
  const formCard = container.querySelector('#cat-form-card');

  container.querySelector('#cat-form-title').textContent = `Modifier : ${categoryName}`;
  container.querySelector('#cat-form-submit').textContent = 'Mettre à jour';
  container.querySelector('#cat-name').value = cat.category || '';
  setIconField(container, 'cat-icon', cat.icon_class || 'fa-solid fa-folder');
  container.querySelector('#cat-order').value = cat.display_order ?? 0;

  // Tags
  const tags = cat.available_tags;
  container.querySelector('#cat-tags').value = tags ? (typeof tags === 'string' ? tags : JSON.stringify(tags, null, 2)) : '';

  // Layers
  const layers = Array.isArray(cat.layers_to_display) ? cat.layers_to_display : [];
  container.querySelectorAll('#cat-layers .adm-toggle-item').forEach(el => {
    el.classList.toggle('active', layers.includes(el.dataset.layer));
  });

  formCard.hidden = false;
  formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function _handleDelete(container, categoryName) {
  const yes = await confirm({
    title: 'Supprimer cette catégorie ?',
    message: `La catégorie "${categoryName}" sera supprimée. Les contributions existantes ne seront pas affectées.`,
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!yes) return;

  try {
    await api.deleteCategory(categoryName);
    toast('Catégorie supprimée', 'success');
    await _loadData(container);
  } catch (err) {
    toast(err.message, 'error');
  }
}
