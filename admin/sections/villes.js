/* ============================================================================
   VILLES SECTION — Global admin city management
   ============================================================================ */

import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, slidePanel, esc, formatDate, skeletonTable, emptyState } from '../components/ui.js';

export async function renderVilles(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-earth-europe"></i> Gestion des villes</h1>
        <p class="adm-page-subtitle">Administration globale — toutes les structures</p>
      </div>
      <button class="adm-btn adm-btn--primary" id="ville-create-btn">
        <i class="fa-solid fa-plus"></i> Nouvelle ville
      </button>
    </div>

    <div class="adm-card">
      <div id="villes-list-body" style="padding:0;">
        ${skeletonTable(5)}
      </div>
    </div>
  `;

  container.querySelector('#ville-create-btn')?.addEventListener('click', () => _openCityForm(null));
  await _loadCities(container);
}

let _allCities = [];

async function _loadCities(container) {
  const body = container.querySelector('#villes-list-body');
  if (!body) return;

  try {
    _allCities = await api.getAllCities();
    _renderCityList(body);
  } catch (e) {
    console.error('[admin/villes]', e);
    body.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _renderCityList(body) {
  if (_allCities.length === 0) {
    body.innerHTML = '';
    body.appendChild(emptyState({ icon: 'fa-solid fa-city', title: 'Aucune ville configurée' }));
    return;
  }

  // Remove old listener before rendering
  body.removeEventListener('click', _handleActions);

  body.innerHTML = _allCities.map(city => {
    const logo = city.logo_url
      ? `<img src="${esc(city.logo_url)}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:8px;background:var(--adm-bg-tertiary);padding:2px;">`
      : `<div style="width:40px;height:40px;border-radius:8px;background:var(--primary-alpha-12);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--primary);"><i class="fa-solid fa-city"></i></div>`;

    const colorDot = city.primary_color
      ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${esc(city.primary_color)};vertical-align:middle;margin-right:4px;border:2px solid var(--adm-border);"></span>`
      : '';

    const adminBadge = city.admin_count != null
      ? `<span class="adm-badge adm-badge--neutral">${city.admin_count} admin${city.admin_count !== 1 ? 's' : ''}</span>`
      : '';

    const toggleCount = Array.isArray(city.enabled_toggles) ? city.enabled_toggles.length : 0;

    return `
      <div class="adm-list-item" data-ville="${esc(city.ville)}">
        ${logo}
        <div class="adm-list-item__info">
          <div class="adm-list-item__name">${colorDot}${esc(city.brand_name || city.ville)}</div>
          <div class="adm-list-item__meta">
            <span class="adm-badge adm-badge--info">${esc(city.ville)}</span>
            ${adminBadge}
            ${toggleCount > 0 ? `<span>${toggleCount} toggle${toggleCount > 1 ? 's' : ''}</span>` : ''}
            ${city.default_basemap ? `<span>· Carte : ${esc(city.default_basemap)}</span>` : ''}
          </div>
        </div>
        <div class="adm-list-item__actions">
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="edit" data-ville="${esc(city.ville)}" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="select" data-ville="${esc(city.ville)}" title="Administrer cette ville">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
          </button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="delete" data-ville="${esc(city.ville)}" title="Supprimer" style="color:var(--danger);">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  body.addEventListener('click', _handleActions);
}

async function _handleActions(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.stopPropagation();

  const ville = btn.dataset.ville;
  const action = btn.dataset.action;
  const container = btn.closest('.adm-card')?.parentElement;

  if (action === 'edit') {
    const city = _allCities.find(c => c.ville === ville);
    if (city) _openCityForm(city);
  }

  if (action === 'select') {
    store.setCity(ville);
    toast(`Ville active : ${ville}`, 'success');
  }

  if (action === 'delete') {
    const city = _allCities.find(c => c.ville === ville);
    const yes = await confirm({
      title: 'Supprimer cette ville ?',
      message: `"${city?.brand_name || ville}" et toutes ses données de branding seront supprimées. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!yes) return;
    try {
      await api.deleteCity(ville);
      toast('Ville supprimée', 'success');
      if (container) await _loadCities(container);
    } catch (err) { toast(err.message, 'error'); }
  }
}

/* ── City create / edit slide panel ── */

function _openCityForm(existing) {
  const isEdit = existing != null;
  const title = isEdit ? `Modifier : ${existing.brand_name || existing.ville}` : 'Nouvelle ville';

  const html = `
    <form id="city-form">
      <div class="adm-form-group">
        <label class="adm-label">Code ville <span class="adm-required">*</span></label>
        <input type="text" class="adm-input" id="cf-ville" value="${esc(existing?.ville || '')}" ${isEdit ? 'disabled style="opacity:.6;"' : ''} required placeholder="ex: lyon">
        ${!isEdit ? '<p style="font-size:12px;color:var(--adm-text-tertiary);margin-top:2px;">Identifiant unique, en minuscules, sans espaces.</p>' : ''}
      </div>

      <div class="adm-form-group">
        <label class="adm-label">Nom affiché</label>
        <input type="text" class="adm-input" id="cf-brand-name" value="${esc(existing?.brand_name || '')}">
      </div>

      <div class="adm-form-row">
        <div class="adm-form-group">
          <label class="adm-label">URL du logo</label>
          <input type="url" class="adm-input" id="cf-logo-url" value="${esc(existing?.logo_url || '')}">
        </div>
        <div class="adm-form-group">
          <label class="adm-label">URL du logo sombre</label>
          <input type="url" class="adm-input" id="cf-dark-logo-url" value="${esc(existing?.dark_logo_url || '')}">
        </div>
      </div>

      <div class="adm-form-group">
        <label class="adm-label">URL du favicon</label>
        <input type="url" class="adm-input" id="cf-favicon-url" value="${esc(existing?.favicon_url || '')}">
      </div>

      <div class="adm-form-row">
        <div class="adm-form-group">
          <label class="adm-label">Couleur primaire</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="color" id="cf-color-picker" value="${existing?.primary_color || DEFAULT_COLOR}" style="width:40px;height:36px;border:none;padding:0;cursor:pointer;background:transparent;">
            <input type="text" class="adm-input" id="cf-color-text" value="${existing?.primary_color || DEFAULT_COLOR}" style="max-width:120px;font-family:monospace;" maxlength="7">
          </div>
        </div>
        <div class="adm-form-group">
          <label class="adm-label">Fond de carte</label>
          <input type="text" class="adm-input" id="cf-basemap" value="${esc(existing?.default_basemap || '')}" placeholder="Nom du basemap ou vide">
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="adm-btn adm-btn--primary" id="cf-submit">
      <i class="fa-solid fa-check"></i> ${isEdit ? 'Enregistrer' : 'Créer'}
    </button>
  `;

  const panel = slidePanel.open({ title, body: html, footer });

  // Sync color
  const picker = panel.content.querySelector('#cf-color-picker');
  const text = panel.content.querySelector('#cf-color-text');
  picker?.addEventListener('input', (e) => { text.value = e.target.value; });
  text?.addEventListener('input', (e) => { if (e.target.value.match(/^#[0-9A-Fa-f]{6}$/)) picker.value = e.target.value; });

  // Submit
  panel.content.querySelector('#cf-submit')?.addEventListener('click', async () => {
    const btn = panel.content.querySelector('#cf-submit');
    btn.disabled = true;

    const ville = panel.content.querySelector('#cf-ville')?.value?.trim()?.toLowerCase();
    if (!ville) { toast('Code ville obligatoire', 'error'); btn.disabled = false; return; }
    if (!/^[a-z0-9_-]+$/.test(ville)) { toast('Code ville : lettres minuscules, chiffres, tirets uniquement', 'error'); btn.disabled = false; return; }

    const data = {
      brand_name: panel.content.querySelector('#cf-brand-name')?.value?.trim() || null,
      logo_url: panel.content.querySelector('#cf-logo-url')?.value?.trim() || null,
      dark_logo_url: panel.content.querySelector('#cf-dark-logo-url')?.value?.trim() || null,
      favicon_url: panel.content.querySelector('#cf-favicon-url')?.value?.trim() || null,
      primary_color: panel.content.querySelector('#cf-color-text')?.value?.trim() || DEFAULT_COLOR,
      default_basemap: panel.content.querySelector('#cf-basemap')?.value?.trim() || null,
    };

    try {
      if (isEdit) {
        await api.updateCity(existing.ville, data);
        toast('Ville mise à jour', 'success');
      } else {
        await api.createCity({ ville, ...data });
        toast('Ville créée', 'success');
      }
      panel.close();
      // Reload list
      const listContainer = document.querySelector('#adm-main');
      if (listContainer) await _loadCities(listContainer);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}
