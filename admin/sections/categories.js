import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, skeletonTable } from '../components/ui.js';
import { renderIconField, bindIconField, setIconField } from '../components/icon-picker.js';

let _categories = [];
let _layers = [];
let _editingCategory = null; // null = create mode, string = editing category name

const CAT_COLOR_DEFAULT = '#6366f1';

function _getCatColor(cat) {
  if (!cat?.category_styles) return null;
  try {
    const styles = typeof cat.category_styles === 'string'
      ? JSON.parse(cat.category_styles)
      : cat.category_styles;
    return styles?.color || null;
  } catch (e) { console.debug('[admin-categories] getCatColor', e); return null; }
}

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

    <!-- Edit/Create form panel (hidden by default) -->
    <div id="cat-form-card" hidden>
      <form id="cat-form" class="cat-form">
        <div class="cat-form__header">
          <h2 class="cat-form__title" id="cat-form-title">Nouvelle catégorie</h2>
          <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="cat-form-cancel">
            <i class="fa-solid fa-xmark"></i> Annuler
          </button>
        </div>
        <div class="cat-form__sections">
          <div class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-pen-to-square"></i></div>
              <div class="cw-section__titles">
                <div class="cw-section__title">Informations</div>
                <div class="cw-section__desc">Nom et icône de la catégorie</div>
              </div>
            </div>
            <div class="cw-section__body">
              <div class="cw-field">
                <label class="cw-field__label" for="cat-name">Nom <span class="cw-required">*</span></label>
                <input type="text" class="cw-field__input" id="cat-name" required placeholder="Ex: Transport">
              </div>
              <div class="cw-field">
                <label class="cw-field__label">Icône</label>
                ${renderIconField('cat-icon', 'fa-solid fa-folder', 'fa-solid fa-folder')}
              </div>
            </div>
          </div>
          <div class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-palette"></i></div>
              <div class="cw-section__titles">
                <div class="cw-section__title">Couleur</div>
                <div class="cw-section__desc">Marqueurs sur la carte et boutons de filtre</div>
              </div>
            </div>
            <div class="cw-section__body">
              <div class="cw-field">
                <label class="cw-field__label" for="cat-color">Couleur</label>
                <div class="cat-color-picker">
                  <input type="color" id="cat-color" class="cat-color-input" value="${CAT_COLOR_DEFAULT}">
                  <div class="cat-color-swatch" id="cat-color-swatch">
                    <div class="cat-color-swatch__icon"><i class="fa-solid fa-folder"></i></div>
                    <span class="cat-color-swatch__hex" id="cat-color-hex">${CAT_COLOR_DEFAULT.toUpperCase()}</span>
                    <span class="cat-color-swatch__label">Aperçu du marqueur</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-paintbrush"></i></div>
              <div class="cw-section__titles">
                <div class="cw-section__title">Style des tracés</div>
                <div class="cw-section__desc">Lignes et polygones sur la carte</div>
              </div>
              <span class="cw-optional-badge">Optionnel</span>
            </div>
            <div class="cw-section__body">

              <!-- Live SVG preview -->
              <div class="cat-style-preview">
                <div class="cat-style-preview__panel">
                  <span class="cat-style-preview__label">Ligne</span>
                  <div class="cat-style-preview__canvas">
                    <svg viewBox="0 0 170 70" xmlns="http://www.w3.org/2000/svg">
                      <path id="cat-prev-line"
                        d="M 12,50 C 35,20 55,65 80,38 S 130,18 158,42"
                        stroke="${CAT_COLOR_DEFAULT}" stroke-width="3" stroke-linecap="round" fill="none"/>
                    </svg>
                  </div>
                </div>
                <div class="cat-style-preview__panel">
                  <span class="cat-style-preview__label">Polygone</span>
                  <div class="cat-style-preview__canvas">
                    <svg viewBox="0 0 140 90" xmlns="http://www.w3.org/2000/svg">
                      <path id="cat-prev-polygon"
                        d="M 70,8 L 120,40 L 105,82 L 35,82 L 20,40 Z"
                        stroke="${CAT_COLOR_DEFAULT}" stroke-width="3" stroke-linejoin="round" fill="none"/>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Weight -->
              <div class="cw-field">
                <div class="cw-field__label">
                  Épaisseur
                  <span class="cat-style-value" id="cat-weight-val">3 px</span>
                </div>
                <input type="range" id="cat-weight" class="cat-style-range" min="1" max="12" step="1" value="3">
              </div>

              <!-- Dash pattern -->
              <div class="cw-field">
                <label class="cw-field__label">Style du tracé</label>
                <div class="cat-dash-picker" id="cat-dash-picker">
                  <button type="button" class="cat-dash-btn cat-dash-btn--active" data-dash="">
                    <svg viewBox="0 0 56 8"><line x1="0" y1="4" x2="56" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Plein
                  </button>
                  <button type="button" class="cat-dash-btn" data-dash="8,4">
                    <svg viewBox="0 0 56 8"><line x1="0" y1="4" x2="56" y2="4" stroke="currentColor" stroke-width="2" stroke-dasharray="8 4" stroke-linecap="round"/></svg>
                    Tirets
                  </button>
                  <button type="button" class="cat-dash-btn" data-dash="2,5">
                    <svg viewBox="0 0 56 8"><line x1="0" y1="4" x2="56" y2="4" stroke="currentColor" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/></svg>
                    Points
                  </button>
                </div>
              </div>

              <!-- Opacity -->
              <div class="cw-field">
                <div class="cw-field__label">
                  Opacité du tracé
                  <span class="cat-style-value" id="cat-opacity-val">80 %</span>
                </div>
                <input type="range" id="cat-opacity" class="cat-style-range" min="0.1" max="1" step="0.05" value="0.8">
              </div>

              <!-- Fill toggle -->
              <div class="cat-fill-toggle-row">
                <span class="cw-field__label">Remplissage du polygone</span>
                <label class="adm-switch">
                  <input type="checkbox" id="cat-fill">
                  <span class="adm-switch__track"></span>
                </label>
              </div>

              <!-- Fill options (shown when fill checked) -->
              <div id="cat-fill-options" hidden>
                <div class="cw-field">
                  <label class="cw-field__label" for="cat-fill-color">Couleur de remplissage</label>
                  <div class="cat-color-picker">
                    <input type="color" id="cat-fill-color" class="cat-color-input" value="${CAT_COLOR_DEFAULT}">
                    <div class="cat-color-swatch">
                      <div class="cat-color-swatch__icon cat-fill-swatch-icon" style="border-radius:6px;"><i class="fa-solid fa-square"></i></div>
                      <span class="cat-color-swatch__hex" id="cat-fill-hex">${CAT_COLOR_DEFAULT.toUpperCase()}</span>
                      <span class="cat-color-swatch__label">Couleur de fond</span>
                    </div>
                  </div>
                </div>
                <div class="cw-field" style="margin-top:16px;">
                  <div class="cw-field__label">
                    Opacité du fond
                    <span class="cat-style-value" id="cat-fill-opacity-val">30 %</span>
                  </div>
                  <input type="range" id="cat-fill-opacity" class="cat-style-range" min="0.05" max="1" step="0.05" value="0.3">
                </div>
              </div>

            </div>
          </div>
          <div class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-layer-group"></i></div>
              <div class="cw-section__titles">
                <div class="cw-section__title">Couches associées</div>
                <div class="cw-section__desc">Couches visibles pour cette catégorie</div>
              </div>
              <span class="cw-optional-badge">Optionnel</span>
            </div>
            <div class="cw-section__body">
              <div id="cat-layers" class="adm-toggle-grid"></div>
            </div>
          </div>
        </div>
        <div class="cw-footer cat-form__footer">
          <button type="button" class="cw-footer__cancel" id="cat-form-cancel-2">Annuler</button>
          <button type="submit" class="cw-footer__submit" id="cat-form-submit">
            <i class="fa-solid fa-check"></i> Créer
          </button>
        </div>
      </form>
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

  addBtn?.addEventListener('click', () => {
    _editingCategory = null;
    _resetForm(container);
    container.querySelector('#cat-form-title').textContent = 'Nouvelle catégorie';
    container.querySelector('#cat-form-submit').innerHTML = '<i class="fa-solid fa-check"></i> Créer';
    formCard.hidden = false;
    formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  container.querySelectorAll('#cat-form-cancel, #cat-form-cancel-2').forEach(btn => {
    btn.addEventListener('click', () => {
      formCard.hidden = true;
      _editingCategory = null;
    });
  });

  // Live color + icon preview (marker swatch)
  const _updateColorPreview = () => {
    const colorInput = container.querySelector('#cat-color');
    const swatchIcon = container.querySelector('#cat-color-swatch .cat-color-swatch__icon');
    const hexLabel = container.querySelector('#cat-color-hex');
    if (!colorInput || !swatchIcon) return;
    const color = colorInput.value;
    const iconClass = container.querySelector('#cat-icon')?.value || 'fa-solid fa-folder';
    swatchIcon.style.background = color + '1a';
    swatchIcon.style.color = color;
    swatchIcon.querySelector('i').className = iconClass;
    if (hexLabel) hexLabel.textContent = color.toUpperCase();
    // Also refresh SVG stroke color
    _updateStylePreview(container);
  };

  // Live style SVG preview
  const _updateStylePreview = (c) => {
    const color = c.querySelector('#cat-color')?.value || CAT_COLOR_DEFAULT;
    const weight = c.querySelector('#cat-weight')?.value || 3;
    const dash = c.querySelector('.cat-dash-btn--active')?.dataset.dash ?? '';
    const opacity = c.querySelector('#cat-opacity')?.value || 0.8;
    const fill = c.querySelector('#cat-fill')?.checked || false;
    const fillColor = c.querySelector('#cat-fill-color')?.value || CAT_COLOR_DEFAULT;
    const fillOpacity = c.querySelector('#cat-fill-opacity')?.value || 0.3;

    // Value labels
    const weightVal = c.querySelector('#cat-weight-val');
    if (weightVal) weightVal.textContent = `${weight} px`;
    const opacityVal = c.querySelector('#cat-opacity-val');
    if (opacityVal) opacityVal.textContent = `${Math.round(opacity * 100)} %`;
    const fillOpacityVal = c.querySelector('#cat-fill-opacity-val');
    if (fillOpacityVal) fillOpacityVal.textContent = `${Math.round(fillOpacity * 100)} %`;

    // Fill color swatch
    const fillSwatch = c.querySelector('.cat-fill-swatch-icon');
    const fillHex = c.querySelector('#cat-fill-hex');
    if (fillSwatch) { fillSwatch.style.background = fillColor + '33'; fillSwatch.style.color = fillColor; }
    if (fillHex) fillHex.textContent = fillColor.toUpperCase();

    // SVG line
    const linePath = c.querySelector('#cat-prev-line');
    if (linePath) {
      linePath.setAttribute('stroke', color);
      linePath.setAttribute('stroke-width', weight);
      linePath.setAttribute('stroke-opacity', opacity);
      linePath.setAttribute('stroke-dasharray', dash);
    }
    // SVG polygon
    const polyPath = c.querySelector('#cat-prev-polygon');
    if (polyPath) {
      polyPath.setAttribute('stroke', color);
      polyPath.setAttribute('stroke-width', weight);
      polyPath.setAttribute('stroke-opacity', opacity);
      polyPath.setAttribute('stroke-dasharray', dash);
      polyPath.setAttribute('fill', fill ? fillColor : 'none');
      polyPath.setAttribute('fill-opacity', fill ? fillOpacity : '0');
    }
  };

  container.querySelector('#cat-color')?.addEventListener('input', _updateColorPreview);
  container.querySelector('#cat-icon')?.addEventListener('change', _updateColorPreview);
  container.querySelector('#cat-icon')?.addEventListener('input', _updateColorPreview);

  container.querySelector('#cat-weight')?.addEventListener('input', () => _updateStylePreview(container));
  container.querySelector('#cat-opacity')?.addEventListener('input', () => _updateStylePreview(container));
  container.querySelector('#cat-fill-color')?.addEventListener('input', () => _updateStylePreview(container));
  container.querySelector('#cat-fill-opacity')?.addEventListener('input', () => _updateStylePreview(container));

  // Dash picker
  container.querySelector('#cat-dash-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-dash-btn');
    if (!btn) return;
    container.querySelectorAll('.cat-dash-btn').forEach(b => b.classList.remove('cat-dash-btn--active'));
    btn.classList.add('cat-dash-btn--active');
    _updateStylePreview(container);
  });

  // Fill toggle
  container.querySelector('#cat-fill')?.addEventListener('change', (e) => {
    const opts = container.querySelector('#cat-fill-options');
    if (opts) opts.hidden = !e.target.checked;
    _updateStylePreview(container);
  });

  _updateColorPreview();
  _updateStylePreview(container);

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
        // Append new category at end of list (start at 10 to avoid parseInt(0)||100 in supabaseservice)
        const maxOrder = _categories.length > 0
          ? Math.max(..._categories.map(c => c.display_order ?? 0))
          : 0;
        data.display_order = maxOrder + 10;
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
  const color = container.querySelector('#cat-color')?.value || CAT_COLOR_DEFAULT;
  const weight = parseInt(container.querySelector('#cat-weight')?.value || 3);
  const dash = container.querySelector('.cat-dash-btn--active')?.dataset.dash ?? '';
  const opacity = parseFloat(container.querySelector('#cat-opacity')?.value || 0.8);
  const fill = container.querySelector('#cat-fill')?.checked || false;
  const fillColor = container.querySelector('#cat-fill-color')?.value || CAT_COLOR_DEFAULT;
  const fillOpacity = parseFloat(container.querySelector('#cat-fill-opacity')?.value || 0.3);

  // Selected layers
  const checked = container.querySelectorAll('#cat-layers .adm-toggle-item.active');
  const layers = Array.from(checked).map(el => el.dataset.layer);

  const category_styles = { color, weight, opacity };
  if (dash) category_styles.dashArray = dash;
  if (fill) {
    category_styles.fill = true;
    category_styles.fillColor = fillColor;
    category_styles.fillOpacity = fillOpacity;
  }

  return {
    category: name,
    icon_class: icon,
    layers_to_display: layers.length > 0 ? layers : null,
    category_styles,
  };
}

function _resetForm(container) {
  container.querySelector('#cat-name').value = '';
  setIconField(container, 'cat-icon', 'fa-solid fa-folder');

  const colorInput = container.querySelector('#cat-color');
  if (colorInput) colorInput.value = CAT_COLOR_DEFAULT;

  const weightInput = container.querySelector('#cat-weight');
  if (weightInput) weightInput.value = '3';

  const opacityInput = container.querySelector('#cat-opacity');
  if (opacityInput) opacityInput.value = '0.8';

  container.querySelectorAll('.cat-dash-btn').forEach((btn, i) => {
    btn.classList.toggle('cat-dash-btn--active', i === 0);
  });

  const fillInput = container.querySelector('#cat-fill');
  if (fillInput) fillInput.checked = false;
  const fillOptions = container.querySelector('#cat-fill-options');
  if (fillOptions) fillOptions.hidden = true;

  const fillColorInput = container.querySelector('#cat-fill-color');
  if (fillColorInput) fillColorInput.value = CAT_COLOR_DEFAULT;

  const fillOpacityInput = container.querySelector('#cat-fill-opacity');
  if (fillOpacityInput) fillOpacityInput.value = '0.3';

  container.querySelectorAll('#cat-layers .adm-toggle-item').forEach(el => el.classList.remove('active'));

  // Trigger both previews
  container.querySelector('#cat-color')?.dispatchEvent(new Event('input'));
}

async function _loadData(container) {
  const listEl = container.querySelector('#cat-list');
  if (!listEl) return;

  // Preserve active layer selections if the form is open during a reload
  const activeLayers = Array.from(
    container.querySelectorAll('#cat-layers .adm-toggle-item.active')
  ).map(el => el.dataset.layer);

  try {
    [_categories, _layers] = await Promise.all([api.getCategories(), api.getLayers()]);
    _renderLayers(container, activeLayers);
    _renderList(container);
  } catch (e) {
    console.error('[admin/categories]', e);
    listEl.innerHTML = `<div class="adm-card"><div class="adm-card__body" style="color:var(--danger);">Erreur : ${esc(e.message)}</div></div>`;
  }
}

function _renderLayers(container, preserveSelected = []) {
  const layersEl = container.querySelector('#cat-layers');
  if (!layersEl) return;

  if (_layers.length === 0) {
    layersEl.innerHTML = `<p class="cw-field__tip"><i class="fa-solid fa-circle-info"></i> Aucune couche configurée pour cette ville.</p>`;
    return;
  }

  layersEl.innerHTML = _layers.map(l => `
    <div class="adm-toggle-item${preserveSelected.includes(l.name) ? ' active' : ''}" data-layer="${esc(l.name)}">
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

  listEl.innerHTML = `<div class="adm-cat-list" id="cat-sortable">${_categories.map(_renderCatCard).join('')}</div>`;

  const sortableEl = listEl.querySelector('#cat-sortable');
  _bindDragDrop(sortableEl);

  // Bind edit/delete actions
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
  const layersText = Array.isArray(layers) && layers.length > 0 ? layers.join(', ') : '';
  const color = _getCatColor(cat);
  const iconStyle = color
    ? `style="background:${color}1a;color:${color};"`
    : `style="background:var(--primary-alpha-12);color:var(--primary);"`;

  return `
    <div class="adm-cat-card" data-category="${esc(cat.category)}" draggable="true">
      <div class="adm-cat-card__drag" title="Glisser pour réordonner"><i class="fa-solid fa-grip-vertical"></i></div>
      <div class="adm-cat-card__icon" ${iconStyle}>
        <i class="${esc(iconClass)}"></i>
      </div>
      <div class="adm-cat-card__info">
        <div class="adm-cat-card__name">${esc(cat.category)}</div>
        ${layersText ? `<div class="adm-cat-card__layers">${esc(layersText)}</div>` : ''}
      </div>
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

function _bindDragDrop(listEl) {
  let dragSrc = null;

  listEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.adm-cat-card');
    if (!card) return;
    dragSrc = card;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.category);
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });

  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.adm-cat-card');
    if (!card || card === dragSrc) return;
    const rect = card.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      card.before(dragSrc);
    } else {
      card.after(dragSrc);
    }
  });

  listEl.addEventListener('dragend', () => {
    dragSrc?.classList.remove('is-dragging');
    dragSrc = null;
    _persistOrder(listEl);
  });
}

async function _persistOrder(listEl) {
  const cards = [...listEl.querySelectorAll('.adm-cat-card')];
  const updates = [];

  cards.forEach((card, i) => {
    const name = card.dataset.category;
    const newOrder = (i + 1) * 10; // Start at 10 — avoids parseInt(0)||100 bug in supabaseservice
    const cat = _categories.find(c => c.category === name);
    if (cat && cat.display_order !== newOrder) {
      updates.push({ name, newOrder });
    }
  });

  if (updates.length === 0) return;

  // Update in memory immediately so subsequent reorders are consistent
  updates.forEach(({ name, newOrder }) => {
    const cat = _categories.find(c => c.category === name);
    if (cat) cat.display_order = newOrder;
  });

  try {
    await Promise.all(updates.map(({ name, newOrder }) =>
      api.updateCategory(name, { display_order: newOrder })
    ));
    toast('Ordre sauvegardé', 'success');
  } catch (err) {
    toast('Erreur lors de la sauvegarde de l\'ordre', 'error');
    console.error('[admin/categories] _persistOrder:', err);
  }
}

function _startEdit(container, categoryName) {
  const cat = _categories.find(c => c.category === categoryName);
  if (!cat) return;

  _editingCategory = categoryName;
  const formCard = container.querySelector('#cat-form-card');

  container.querySelector('#cat-form-title').textContent = `Modifier — ${categoryName}`;
  container.querySelector('#cat-form-submit').innerHTML = '<i class="fa-solid fa-check"></i> Mettre à jour';
  container.querySelector('#cat-name').value = cat.category || '';
  setIconField(container, 'cat-icon', cat.icon_class || 'fa-solid fa-folder');

  // Parse existing styles
  const styles = (() => {
    if (!cat.category_styles) return {};
    try {
      return typeof cat.category_styles === 'string'
        ? JSON.parse(cat.category_styles)
        : cat.category_styles;
    } catch (e) { console.debug('[admin-categories] parseStyles', e); return {}; }
  })();

  // Restore color
  const catColor = styles.color || CAT_COLOR_DEFAULT;
  const colorInput = container.querySelector('#cat-color');
  if (colorInput) colorInput.value = catColor;

  // Restore weight
  const weightInput = container.querySelector('#cat-weight');
  if (weightInput) weightInput.value = styles.weight || 3;

  // Restore dash
  const dashVal = styles.dashArray || '';
  container.querySelectorAll('.cat-dash-btn').forEach(btn => {
    btn.classList.toggle('cat-dash-btn--active', btn.dataset.dash === dashVal);
  });

  // Restore opacity
  const opacityInput = container.querySelector('#cat-opacity');
  if (opacityInput) opacityInput.value = styles.opacity ?? 0.8;

  // Restore fill
  const fillInput = container.querySelector('#cat-fill');
  const fillOptions = container.querySelector('#cat-fill-options');
  if (fillInput) {
    fillInput.checked = !!styles.fill;
    if (fillOptions) fillOptions.hidden = !styles.fill;
  }
  const fillColorInput = container.querySelector('#cat-fill-color');
  if (fillColorInput) fillColorInput.value = styles.fillColor || CAT_COLOR_DEFAULT;
  const fillOpacityInput = container.querySelector('#cat-fill-opacity');
  if (fillOpacityInput) fillOpacityInput.value = styles.fillOpacity ?? 0.3;

  // Trigger full preview
  container.querySelector('#cat-color')?.dispatchEvent(new Event('input'));

  // Restore layer selections
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
