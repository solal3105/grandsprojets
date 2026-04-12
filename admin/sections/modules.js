import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, emptyState } from '../components/ui.js';
import { renderIconField, bindIconField } from '../components/icon-picker.js';

/* ── Module templates (known module types) ─────────────────────── */
const MODULE_TEMPLATES = {
  carte: {
    label: 'Carte',
    icon_class: 'fa-solid fa-map',
    description: 'Module principal — carte interactive et catégories',
  },
  travaux: {
    label: 'Travaux',
    icon_class: 'fa-solid fa-helmet-safety',
    description: 'Chantiers, travaux en cours et informations voirie',
  },
};

/* ── State ──────────────────────────────────────────────────────── */
let _modules = [];
let _container = null;

/* ── Public entry point ────────────────────────────────────────── */

export async function renderModules(container, params) {
  _container = container;
  if (params?.id) return _showModuleForm(container, params.id);
  _showList(container);
  await _loadModules(container);
}

/* ── List view ─────────────────────────────────────────────────── */

function _showList(container) {
  const city = store.city;
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-puzzle-piece"></i> Modules</h1>
        <p class="adm-page-subtitle">Modules actifs pour <strong>${esc(city)}</strong></p>
      </div>
      <button class="adm-btn adm-btn--primary" id="mod-add-btn">
        <i class="fa-solid fa-plus"></i> Ajouter un module
      </button>
    </div>

    <div class="adm-card">
      <div id="mod-list-body" style="padding:0;">
        <div style="padding:32px;text-align:center;color:var(--text-secondary);">
          <i class="fa-solid fa-spinner fa-spin"></i> Chargement…
        </div>
      </div>
    </div>
  `;

  container.querySelector('#mod-add-btn')?.addEventListener('click', () => _showAddDialog(container));
}

async function _loadModules(container) {
  const body = container.querySelector('#mod-list-body');
  if (!body) return;

  try {
    _modules = await api.getCityModules();
    _renderModuleList(body);
  } catch (e) {
    console.error('[admin/modules]', e);
    body.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _renderModuleList(body) {
  if (!_modules.length) {
    body.innerHTML = '';
    body.appendChild(emptyState({
      icon: 'fa-solid fa-puzzle-piece',
      title: 'Aucun module configuré',
      text: 'Ajoutez un module pour activer des fonctionnalités sur cette ville.',
    }));
    return;
  }

  body.innerHTML = _modules.map(mod => {
    const tpl = MODULE_TEMPLATES[mod.module_key] || {};
    const desc = tpl.description || '';
    const enabledBadge = mod.enabled
      ? '<span class="adm-badge adm-badge--success">Actif</span>'
      : '<span class="adm-badge adm-badge--neutral">Désactivé</span>';

    return `
      <div class="adm-list-item mod-list-item" data-key="${esc(mod.module_key)}">
        <div class="mod-list-item__icon">
          <i class="${esc(mod.icon_class || 'fa-solid fa-layer-group')}"></i>
        </div>
        <div class="adm-list-item__info">
          <div class="adm-list-item__name">${esc(mod.label || mod.module_key)}</div>
          <div class="adm-list-item__meta">
            <span class="adm-badge adm-badge--info">${esc(mod.module_key)}</span>
            ${enabledBadge}
            ${desc ? `<span>${esc(desc)}</span>` : ''}
          </div>
        </div>
        <div class="adm-list-item__actions" style="display:flex;gap:4px;align-items:center;">
          <label class="adm-switch mod-toggle" title="${mod.enabled ? 'Désactiver' : 'Activer'}">
            <input type="checkbox" ${mod.enabled ? 'checked' : ''} data-action="toggle" data-key="${esc(mod.module_key)}">
            <span class="adm-switch__track"></span>
          </label>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="edit" data-key="${esc(mod.module_key)}" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="delete" data-key="${esc(mod.module_key)}" title="Supprimer" style="color:var(--danger);">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Event delegation
  body.removeEventListener('click', _handleListClick);
  body.addEventListener('click', _handleListClick);
  body.removeEventListener('change', _handleToggle);
  body.addEventListener('change', _handleToggle);
}

/* ── List actions ──────────────────────────────────────────────── */

async function _handleListClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT') return;
  e.stopPropagation();

  const key = btn.dataset.key;
  const action = btn.dataset.action;

  if (action === 'edit') {
    const mod = _modules.find(m => m.module_key === key);
    if (mod) _showModuleForm(_container, key, mod);
  }

  if (action === 'delete') {
    const mod = _modules.find(m => m.module_key === key);
    const yes = await confirm({
      title: 'Supprimer ce module ?',
      message: `Le module "${esc(mod?.label || key)}" sera retiré de cette ville. Les données associées ne seront pas supprimées.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!yes) return;
    try {
      await api.deleteCityModule(key);
      toast('Module supprimé', 'success');
      _showList(_container);
      await _loadModules(_container);
    } catch (err) { toast(err.message, 'error'); }
  }
}

async function _handleToggle(e) {
  const input = e.target.closest('[data-action="toggle"]');
  if (!input) return;

  const key = input.dataset.key;
  const enabled = input.checked;
  const mod = _modules.find(m => m.module_key === key);
  if (!mod) return;

  try {
    const { error } = await api.upsertCityModule(key, { ...mod, enabled });
    if (error) throw error;
    mod.enabled = enabled;
    toast(`${mod.label || key} ${enabled ? 'activé' : 'désactivé'}`, 'success');
  } catch (err) {
    input.checked = !enabled; // revert
    toast('Erreur : ' + (err.message || err), 'error');
  }
}

/* ── Add module dialog ─────────────────────────────────────────── */

function _showAddDialog(container) {
  const existingKeys = new Set(_modules.map(m => m.module_key));
  const available = Object.entries(MODULE_TEMPLATES).filter(([k]) => !existingKeys.has(k));

  if (!available.length) {
    toast('Tous les modules disponibles sont déjà configurés', 'info');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'adm-overlay';
  overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div class="mod-dialog">
      <div class="mod-dialog__header">
        <h2 class="mod-dialog__title">Ajouter un module</h2>
        <button class="mod-dialog__close" id="mod-add-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div style="padding:4px 24px 20px;">
        ${available.map(([key, tpl]) => `
          <button class="mod-add-option" data-key="${esc(key)}" style="
            display:flex;gap:12px;align-items:center;width:100%;padding:14px 16px;
            border:1px solid var(--border-light);border-radius:12px;background:var(--surface-raised);
            cursor:pointer;text-align:left;margin-bottom:8px;transition:all .2s ease;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--primary-alpha-12);
              display:flex;align-items:center;justify-content:center;color:var(--color-primary);font-size:18px;">
              <i class="${esc(tpl.icon_class)}"></i>
            </div>
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${esc(tpl.label)}</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${esc(tpl.description)}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.querySelector('#mod-add-close')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('.mod-add-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const tpl = MODULE_TEMPLATES[key];
      close();
      try {
        const { error } = await api.upsertCityModule(key, {
          label: tpl.label,
          icon_class: tpl.icon_class,
          sort_order: _modules.length,
          enabled: true,
          config: {},
        });
        if (error) throw error;
        toast(`Module "${tpl.label}" ajouté`, 'success');
        _showList(container);
        await _loadModules(container);
      } catch (err) { toast('Erreur : ' + (err.message || err), 'error'); }
    });
  });

  document.body.appendChild(overlay);
}

/* ── Edit form ─────────────────────────────────────────────────── */

function _showModuleForm(container, key, existing) {
  const mod = existing || _modules.find(m => m.module_key === key);
  if (!mod) {
    toast('Module introuvable', 'error');
    _showList(container);
    _loadModules(container);
    return;
  }

  const tpl = MODULE_TEMPLATES[key] || {};

  container.innerHTML = `
    <div class="cw-header">
      <div class="cw-header__top">
        <a href="#" class="cw-back-link" id="mod-back">
          <i class="fa-solid fa-arrow-left"></i>
          <span>Modules</span>
        </a>
      </div>
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title">Modifier : ${esc(mod.label || key)}</h1>
          <p class="cw-header__subtitle">Configuration du module <strong>${esc(key)}</strong> pour ${esc(store.city)}</p>
        </div>
      </div>
    </div>

    <div class="cw-sections">
      <!-- Général -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-sliders"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Paramètres généraux</h2>
            <p class="cw-section__desc">Nom, icône et ordre d'affichage</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label" for="mod-label">Label</label>
            <input type="text" class="cw-field__input" id="mod-label" value="${esc(mod.label || '')}" placeholder="${esc(tpl.label || key)}">
          </div>
          <div class="cw-field">
            <label class="cw-field__label">Icône</label>
            ${renderIconField('mod-icon', mod.icon_class || tpl.icon_class || 'fa-solid fa-layer-group')}
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="mod-sort">Ordre d'affichage</label>
            <input type="number" class="cw-field__input" id="mod-sort" value="${mod.sort_order ?? 0}" min="0" max="99" style="max-width:100px;">
          </div>
          <div class="cw-field">
            <label class="cw-field__label">Activé</label>
            <label class="adm-switch">
              <input type="checkbox" id="mod-enabled" ${mod.enabled ? 'checked' : ''}>
              <span class="adm-switch__track"></span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <div class="cw-footer">
      <a href="#" class="cw-footer__cancel" id="mod-cancel">
        <i class="fa-solid fa-arrow-left"></i> Retour
      </a>
      <button type="button" class="cw-footer__submit" id="mod-submit">
        <span class="cw-footer__submit-text">Enregistrer</span>
        <i class="fa-solid fa-check"></i>
      </button>
    </div>
  `;

  // Bindings
  bindIconField(container, 'mod-icon');

  const goBack = (e) => {
    e.preventDefault();
    _showList(container);
    _loadModules(container);
  };
  container.querySelector('#mod-back')?.addEventListener('click', goBack);
  container.querySelector('#mod-cancel')?.addEventListener('click', goBack);

  container.querySelector('#mod-submit')?.addEventListener('click', async () => {
    const label = container.querySelector('#mod-label')?.value.trim();
    const iconInput = container.querySelector('#mod-icon-value');
    const icon_class = iconInput?.value || mod.icon_class;
    const sort_order = parseInt(container.querySelector('#mod-sort')?.value, 10) || 0;
    const enabled = container.querySelector('#mod-enabled')?.checked ?? true;

    if (!label) { toast('Le label est requis', 'warning'); return; }

    const submitBtn = container.querySelector('#mod-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const { error } = await api.upsertCityModule(key, {
        label,
        icon_class,
        sort_order,
        enabled,
        config: mod.config || {},
      });
      if (error) throw error;
      toast('Module mis à jour', 'success');
      _showList(container);
      await _loadModules(container);
    } catch (err) {
      toast('Erreur : ' + (err.message || err), 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
