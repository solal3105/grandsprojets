/* ============================================================================
   STRUCTURE SECTION — Branding, toggles, basemap, enabled cities
   ============================================================================ */

import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, skeletonTable } from '../components/ui.js';

const DEFAULT_COLOR = '#21b929';

export async function renderStructure(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-palette"></i> Ma structure</h1>
        <p class="adm-page-subtitle">Branding & paramètres de ${esc(store.city)}</p>
      </div>
    </div>

    <div id="structure-body">${skeletonTable(4)}</div>
  `;

  try {
    const [branding, basemaps] = await Promise.all([
      api.getBranding(),
      _fetchBasemaps(),
    ]);

    _renderContent(container.querySelector('#structure-body'), branding || {}, basemaps);
  } catch (e) {
    console.error('[admin/structure]', e);
    container.querySelector('#structure-body').innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

/* ── Fetch basemaps from global (loaded via supabaseService) ── */

async function _fetchBasemaps() {
  try {
    if (window.basemaps && window.basemaps.length) return window.basemaps;
    if (window.supabaseService?.fetchBasemaps) {
      const bm = await window.supabaseService.fetchBasemaps();
      window.basemaps = bm;
      return bm || [];
    }
    return [];
  } catch { return []; }
}

/* ── Main content ── */

function _renderContent(body, branding, basemaps) {
  const color = branding.primary_color || DEFAULT_COLOR;
  const enabledToggles = new Set(branding.enabled_toggles || []);
  const enabledCities = branding.enabled_cities || [];
  const togglesConfig = window.TOGGLES_CONFIG || {};
  const excludedToggles = ['overflow', 'contribute'];

  body.innerHTML = `
    <!-- Identity -->
    <div class="adm-card" style="margin-bottom:20px;">
      <div class="adm-card__header"><h2 class="adm-card__title"><i class="fa-solid fa-id-card"></i> Identité</h2></div>
      <div class="adm-card__body">
        <div class="adm-form-row">
          <div class="adm-form-group">
            <label class="adm-label">Nom affiché</label>
            <input type="text" class="adm-input" id="st-brand-name" value="${esc(branding.brand_name || '')}">
          </div>
          <div class="adm-form-group">
            <label class="adm-label">Code ville</label>
            <input type="text" class="adm-input" value="${esc(branding.ville || store.city)}" disabled style="opacity:.6;">
          </div>
        </div>

        ${branding.logo_url ? `
          <div style="margin-bottom:12px;">
            <label class="adm-label">Logo actuel</label>
            <div style="display:flex;gap:12px;align-items:center;margin-top:4px;">
              <img src="${esc(branding.logo_url)}" alt="Logo" style="max-height:56px;border-radius:8px;background:var(--adm-bg-tertiary);padding:4px;">
              ${branding.dark_logo_url ? `<img src="${esc(branding.dark_logo_url)}" alt="Logo sombre" style="max-height:56px;border-radius:8px;background:#1a1a2e;padding:4px;">` : ''}
            </div>
          </div>
        ` : ''}

        <div class="adm-form-row">
          <div class="adm-form-group">
            <label class="adm-label">URL du logo</label>
            <input type="url" class="adm-input" id="st-logo-url" value="${esc(branding.logo_url || '')}" placeholder="https://...">
          </div>
          <div class="adm-form-group">
            <label class="adm-label">URL du logo sombre</label>
            <input type="url" class="adm-input" id="st-dark-logo-url" value="${esc(branding.dark_logo_url || '')}" placeholder="https://...">
          </div>
        </div>

        <div class="adm-form-group">
          <label class="adm-label">URL du favicon</label>
          <input type="url" class="adm-input" id="st-favicon-url" value="${esc(branding.favicon_url || '')}" placeholder="https://...">
        </div>
      </div>
    </div>

    <!-- Couleur primaire -->
    <div class="adm-card" style="margin-bottom:20px;">
      <div class="adm-card__header"><h2 class="adm-card__title"><i class="fa-solid fa-droplet"></i> Couleur primaire</h2></div>
      <div class="adm-card__body">
        <div style="display:flex;gap:12px;align-items:center;">
          <input type="color" id="st-color-picker" value="${color}" style="width:48px;height:40px;border:none;padding:0;cursor:pointer;background:transparent;">
          <input type="text" class="adm-input" id="st-color-text" value="${color}" style="max-width:140px;font-family:monospace;" maxlength="7">
          <div id="st-color-preview" style="display:flex;gap:8px;align-items:center;margin-left:auto;">
            <span class="adm-badge" style="background:${color};color:#fff;">Aperçu badge</span>
            <button class="adm-btn adm-btn--sm" style="background:${color};color:#fff;border:none;">Bouton</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Fond de carte -->
    <div class="adm-card" style="margin-bottom:20px;">
      <div class="adm-card__header"><h2 class="adm-card__title"><i class="fa-solid fa-map"></i> Fond de carte par défaut</h2></div>
      <div class="adm-card__body">
        <select class="adm-select" id="st-basemap">
          <option value="">Utiliser le défaut global</option>
          ${basemaps.map(b => `<option value="${esc(b.name)}" ${b.name === branding.default_basemap ? 'selected' : ''}>${esc(b.label || b.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Toggles -->
    <div class="adm-card" style="margin-bottom:20px;">
      <div class="adm-card__header"><h2 class="adm-card__title"><i class="fa-solid fa-toggle-on"></i> Contrôles activés</h2></div>
      <div class="adm-card__body">
        <p style="font-size:13px;color:var(--adm-text-secondary);margin-bottom:12px;">Cliquez pour activer/désactiver les contrôles visibles sur la carte.</p>
        <div class="adm-toggle-grid" id="st-toggles-grid">
          ${Object.entries(togglesConfig)
            .filter(([key]) => !excludedToggles.includes(key))
            .map(([key, cfg]) => {
              const hasCities = enabledCities.length > 0;
              const isCityDisabled = key === 'city' && !hasCities;
              const active = enabledToggles.has(key) && !isCityDisabled;
              return `
                <div class="adm-toggle-item ${active ? 'active' : ''} ${isCityDisabled ? 'disabled' : ''}" data-toggle="${esc(key)}" ${isCityDisabled ? 'title="Configurez les espaces pour activer"' : ''}>
                  <i class="fas ${esc(cfg.icon || 'fa-circle')}"></i>
                  <span>${esc(cfg.label || key)}</span>
                </div>`;
            }).join('')}
        </div>
        ${Object.keys(togglesConfig).length === 0 ? '<p style="color:var(--adm-text-tertiary);font-size:13px;">Aucun toggle configuré (TOGGLES_CONFIG absent).</p>' : ''}
      </div>
    </div>

    <!-- Villes activées (espaces) -->
    <div class="adm-card" style="margin-bottom:20px;">
      <div class="adm-card__header"><h2 class="adm-card__title"><i class="fa-solid fa-city"></i> Espaces activés</h2></div>
      <div class="adm-card__body">
        <p style="font-size:13px;color:var(--adm-text-secondary);margin-bottom:12px;">Villes affichées dans le sélecteur public (toggle "Ville").</p>
        <div id="st-enabled-cities">
          ${enabledCities.length > 0 ? enabledCities.map(c => `
            <span class="adm-badge adm-badge--info" style="margin:2px;">${esc(c)} <button class="adm-btn-remove-city" data-city="${esc(c)}" style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:11px;color:inherit;">×</button></span>
          `).join('') : '<span style="color:var(--adm-text-tertiary);font-size:13px;">Aucun espace configuré.</span>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input type="text" class="adm-input" id="st-add-city-input" placeholder="Code ville…" style="max-width:200px;">
          <button class="adm-btn adm-btn--secondary adm-btn--sm" id="st-add-city-btn"><i class="fa-solid fa-plus"></i> Ajouter</button>
        </div>
      </div>
    </div>

    <!-- Save -->
    <div style="display:flex;justify-content:flex-end;gap:8px;padding-bottom:24px;">
      <button class="adm-btn adm-btn--primary adm-btn--lg" id="st-save-all">
        <i class="fa-solid fa-check"></i> Enregistrer tout
      </button>
    </div>
  `;

  _bindColorSync(body);
  _bindToggles(body);
  _bindCitiesList(body, enabledCities);
  _bindSaveAll(body, branding);
}

/* ── Color picker sync ── */

function _bindColorSync(body) {
  const picker = body.querySelector('#st-color-picker');
  const text = body.querySelector('#st-color-text');
  const preview = body.querySelector('#st-color-preview');

  function update(color) {
    if (!color.match(/^#[0-9A-Fa-f]{6}$/)) return;
    picker.value = color;
    text.value = color;
    const badge = preview?.querySelector('.adm-badge');
    const btn = preview?.querySelector('.adm-btn');
    if (badge) badge.style.background = color;
    if (btn) btn.style.background = color;
  }

  picker?.addEventListener('input', (e) => update(e.target.value));
  text?.addEventListener('input', (e) => { if (e.target.value.match(/^#[0-9A-Fa-f]{6}$/)) update(e.target.value); });
}

/* ── Toggles grid ── */

function _bindToggles(body) {
  body.querySelectorAll('#st-toggles-grid .adm-toggle-item:not(.disabled)').forEach(item => {
    item.addEventListener('click', () => item.classList.toggle('active'));
  });
}

/* ── Enabled cities list ── */

let _currentCities = [];

function _bindCitiesList(body, initial) {
  _currentCities = [...initial];

  body.querySelectorAll('.adm-btn-remove-city').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = btn.dataset.city;
      _currentCities = _currentCities.filter(c => c !== code);
      _rerenderCitiesBadges(body);
    });
  });

  body.querySelector('#st-add-city-btn')?.addEventListener('click', () => {
    const input = body.querySelector('#st-add-city-input');
    const code = input.value.trim().toLowerCase();
    if (!code) return;
    if (_currentCities.includes(code)) { toast('Ville déjà ajoutée', 'warning'); return; }
    _currentCities.push(code);
    input.value = '';
    _rerenderCitiesBadges(body);
  });
}

function _rerenderCitiesBadges(body) {
  const container = body.querySelector('#st-enabled-cities');
  if (!container) return;
  if (_currentCities.length === 0) {
    container.innerHTML = '<span style="color:var(--adm-text-tertiary);font-size:13px;">Aucun espace configuré.</span>';
    return;
  }
  container.innerHTML = _currentCities.map(c => `
    <span class="adm-badge adm-badge--info" style="margin:2px;">${esc(c)} <button class="adm-btn-remove-city" data-city="${esc(c)}" style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:11px;color:inherit;">×</button></span>
  `).join('');
  container.querySelectorAll('.adm-btn-remove-city').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      _currentCities = _currentCities.filter(c => c !== btn.dataset.city);
      _rerenderCitiesBadges(body);
    });
  });
}

/* ── Save all ── */

function _bindSaveAll(body, originalBranding) {
  body.querySelector('#st-save-all')?.addEventListener('click', async () => {
    const btn = body.querySelector('#st-save-all');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';

    // Gather all fields
    const color = body.querySelector('#st-color-text')?.value?.trim() || DEFAULT_COLOR;
    if (!color.match(/^#[0-9A-Fa-f]{6}$/)) {
      toast('Couleur invalide (format #RRGGBB)', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer tout';
      return;
    }

    const enabledToggles = [];
    body.querySelectorAll('#st-toggles-grid .adm-toggle-item.active').forEach(el => {
      enabledToggles.push(el.dataset.toggle);
    });

    const data = {
      brand_name: body.querySelector('#st-brand-name')?.value?.trim() || null,
      logo_url: body.querySelector('#st-logo-url')?.value?.trim() || null,
      dark_logo_url: body.querySelector('#st-dark-logo-url')?.value?.trim() || null,
      favicon_url: body.querySelector('#st-favicon-url')?.value?.trim() || null,
      primary_color: color,
      default_basemap: body.querySelector('#st-basemap')?.value || null,
      enabled_toggles: enabledToggles,
      enabled_cities: _currentCities.length > 0 ? _currentCities : null,
    };

    try {
      await api.updateBranding(data);

      // Apply color immediately if viewing own city
      if (window.CityBrandingModule?.applyPrimaryColor) {
        window.CityBrandingModule.applyPrimaryColor(color);
      }

      toast('Structure mise à jour', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer tout';
    }
  });
}
