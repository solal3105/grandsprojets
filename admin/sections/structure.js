/* ============================================================================
   STRUCTURE SECTION — Branding, toggles, basemap, enabled cities
   Redesigned to use the cw-* design system (shared with contributions/travaux)
   ============================================================================ */

import { store } from '../store.js';
import * as api from '../api.js';
import { toast, esc, skeletonTable } from '../components/ui.js';

const DEFAULT_COLOR = '#21b929';

/**
 * Authoritative list of all configurable toggles.
 * Must match the keys used in CityBrandingModule.applyTogglesConfig.
 * Keys NOT in this list are either auto-managed (contribute) or internal (overflow, actions).
 */
const ALL_TOGGLES = [
  { key: 'filters',  icon: 'fa-map',            label: 'Filtres de carte',   desc: 'Bouton d\u2019affichage des filtres de couches' },
  { key: 'basemap',  icon: 'fa-globe',          label: 'Fond de carte',      desc: 'Sélecteur de fond de carte (satellite, plan, etc.)' },
  { key: 'theme',    icon: 'fa-moon',           label: 'Thème clair/sombre', desc: 'Bascule entre le mode clair et le mode sombre' },
  { key: 'search',   icon: 'fa-search',         label: 'Recherche',          desc: 'Barre de recherche d\u2019adresses et de lieux' },
  { key: 'location', icon: 'fa-location-arrow', label: 'Ma position',        desc: 'Géolocalisation \u2014 centre la carte sur l\u2019utilisateur' },
  { key: 'city',     icon: 'fa-city',           label: 'Sélecteur d\u2019espace', desc: 'Permet de basculer entre les espaces configurés' },
  { key: 'info',     icon: 'fa-circle-info',    label: 'Informations',       desc: 'Bouton \u00ab\u00a0À propos\u00a0\u00bb de la plateforme' },
  { key: 'login',    icon: 'fa-right-to-bracket',label: 'Connexion',         desc: 'Bouton de connexion (masqué si déjà connecté)' },
  { key: 'mode3d',   icon: 'fa-cube',           label: 'Mode 3D',           desc: 'Active le relief et les bâtiments 3D sur la carte' },
];

/* ── State ── */
let _currentCities = [];
let _logoFile = null;       // File objects for drag-drop
let _darkLogoFile = null;
let _faviconFile = null;

export async function renderStructure(container) {
  container.innerHTML = `<div id="structure-body" style="max-width:780px;margin:0 auto;">${skeletonTable(4)}</div>`;

  try {
    const [branding, basemaps] = await Promise.all([
      api.getBranding(),
      _fetchBasemaps(),
    ]);
    _renderContent(container, branding || {}, basemaps);
  } catch (e) {
    console.error('[admin/structure]', e);
    container.querySelector('#structure-body').innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

/* ── Fetch basemaps ── */
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

/* ============================================================================
   RENDER
   ============================================================================ */

function _renderContent(container, branding, basemaps) {
  const color = branding.primary_color || DEFAULT_COLOR;
  const colorHex = color.replace('#', '');
  const enabledToggles = new Set(branding.enabled_toggles || []);
  const enabledCities = branding.enabled_cities || [];

  // Reset file state
  _logoFile = null;
  _darkLogoFile = null;
  _faviconFile = null;
  _currentCities = [...enabledCities];

  container.innerHTML = `
    <!-- ── HEADER ── -->
    <div class="cw-header">
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title"><i class="fa-solid fa-palette" style="background:linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--info)));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:28px;"></i> Ma structure</h1>
          <p class="cw-header__subtitle">Personnalisez le branding et les paramètres de <strong>${esc(store.city)}</strong></p>
        </div>
      </div>
    </div>

    <!-- ── SECTIONS ── -->
    <div class="cw-sections">

      <!-- ╭─ 1 · IDENTITÉ ─────────────────────────────╮ -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-id-card"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Identité</h2>
            <p class="cw-section__desc">Nom affiché et identifiant de votre espace</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label" for="st-brand-name">Nom affiché</label>
            <input type="text" class="cw-field__input cw-field__input--hero" id="st-brand-name"
              value="${esc(branding.brand_name || '')}" placeholder="Ex : Métropole de Lyon" maxlength="80">
            <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Ce nom apparaît dans l'en-tête de votre carte publique.</p>
          </div>
          <div class="cw-field">
            <label class="cw-field__label">Code ville</label>
            <input type="text" class="cw-field__input" value="${esc(branding.ville || store.city)}" disabled style="opacity:.55;cursor:not-allowed;">
          </div>
        </div>
      </section>

      <!-- ╭─ 2 · LOGOS ────────────────────────────────╮ -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-image"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Logos & favicon</h2>
            <p class="cw-section__desc">Identité visuelle affichée sur la carte et dans l'onglet du navigateur</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <!-- Logo clair -->
            <div class="cw-field">
              <label class="cw-field__label">Logo — thème clair</label>
              ${_logoDropzoneHTML('st-logo', branding.logo_url, 'Fond clair')}
              <input type="file" id="st-logo-file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden>
              <input type="hidden" id="st-logo-url" value="${esc(branding.logo_url || '')}">
            </div>
            <!-- Logo sombre -->
            <div class="cw-field">
              <label class="cw-field__label">Logo — thème sombre</label>
              ${_logoDropzoneHTML('st-dark-logo', branding.dark_logo_url, 'Fond sombre')}
              <input type="file" id="st-dark-logo-file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden>
              <input type="hidden" id="st-dark-logo-url" value="${esc(branding.dark_logo_url || '')}">
            </div>
          </div>

          <!-- Favicon -->
          <div class="cw-field" style="margin-top:20px;">
            <label class="cw-field__label">Favicon</label>
            ${_logoDropzoneHTML('st-favicon', branding.favicon_url, 'Favicon', true)}
            <input type="file" id="st-favicon-file" accept="image/png,image/x-icon,image/svg+xml,image/webp" hidden>
            <input type="hidden" id="st-favicon-url" value="${esc(branding.favicon_url || '')}">
          </div>
        </div>
      </section>

      <!-- ╭─ 3 · COULEUR PRIMAIRE ─────────────────────╮ -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-droplet"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Couleur primaire</h2>
            <p class="cw-section__desc">Teinte principale de votre interface publique</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="st-color-row">
            <input type="color" id="st-color-picker" value="${color}" class="st-color-swatch">
            <div class="st-color-input-wrap">
              <span class="st-color-hash">#</span>
              <input type="text" class="cw-field__input st-color-input" id="st-color-text" value="${colorHex}" maxlength="6" placeholder="RRGGBB">
            </div>
            <div id="st-color-preview" class="st-color-preview">
              <span class="adm-badge" style="background:${color};color:#fff;">Badge</span>
              <span class="st-color-btn-preview" style="background:${color};">Bouton</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ╭─ 4 · FOND DE CARTE ────────────────────────╮ -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-map"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Fond de carte</h2>
            <p class="cw-section__desc">Carte de base affichée au premier chargement de l'application</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <select class="cw-field__input" id="st-basemap" style="cursor:pointer;">
              <option value="">Défaut global</option>
              ${basemaps.map(b => `<option value="${esc(b.name)}" ${b.name === branding.default_basemap ? 'selected' : ''}>${esc(b.label || b.name)}</option>`).join('')}
            </select>
            ${basemaps.length === 0 ? '<p class="cw-field__tip"><i class="fa-solid fa-circle-info"></i> Aucun fond de carte disponible — le défaut global sera utilisé.</p>' : ''}
          </div>
        </div>
      </section>

      <!-- ╭─ 5 · CONTRÔLES ACTIVÉS ────────────────────╮ -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-sliders"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Contrôles de la carte</h2>
            <p class="cw-section__desc">Boutons visibles sur la carte publique — activez ceux dont vous avez besoin</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="st-toggles" id="st-toggles-list">
            ${ALL_TOGGLES.map(t => {
              const hasCities = enabledCities.length > 0;
              const isCityDisabled = t.key === 'city' && !hasCities;
              const active = enabledToggles.has(t.key) && !isCityDisabled;
              return `
                <div class="st-toggle-row ${isCityDisabled ? 'st-toggle-row--disabled' : ''}" data-toggle="${esc(t.key)}" ${isCityDisabled ? 'title="Ajoutez au moins un espace ci-dessous pour activer ce contrôle"' : ''}>
                  <div class="st-toggle-row__info">
                    <div class="st-toggle-row__icon"><i class="fas ${esc(t.icon)}"></i></div>
                    <div>
                      <div class="st-toggle-row__name">${esc(t.label)}</div>
                      <div class="st-toggle-row__hint">${esc(t.desc)}${isCityDisabled ? ' · <em>Nécessite au moins un espace activé</em>' : ''}</div>
                    </div>
                  </div>
                  <label class="adm-switch">
                    <input type="checkbox" ${active ? 'checked' : ''} ${isCityDisabled ? 'disabled' : ''}>
                    <span class="adm-switch__track"></span>
                  </label>
                </div>`;
            }).join('')}
          </div>
        </div>
      </section>

      <!-- ╭─ 6 · ESPACES ACTIVÉS ──────────────────────╮ -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-city"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Espaces activés</h2>
            <p class="cw-section__desc">Villes affichées dans le sélecteur public <em>(contrôle « Ville »)</em></p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">
          <div id="st-enabled-cities" class="st-cities-wrap">
            ${enabledCities.length > 0
              ? enabledCities.map(c => _cityChipHTML(c)).join('')
              : '<span class="st-cities-empty">Aucun espace configuré</span>'}
          </div>
          <div class="st-cities-add">
            <input type="text" class="cw-field__input" id="st-add-city-input" placeholder="Code espace (ex : lyon)" style="flex:1;max-width:260px;">
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="st-add-city-btn">
              <i class="fa-solid fa-plus"></i> Ajouter
            </button>
          </div>
          <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Identifiants en minuscules — chaque code correspond à un espace existant dans la plateforme.</p>
        </div>
      </section>

    </div><!-- /cw-sections -->

    <!-- ── FOOTER STICKY ── -->
    <div class="cw-footer">
      <div></div>
      <button type="button" class="cw-footer__submit" id="st-save-all">
        <span>Enregistrer les modifications</span>
        <i class="fa-solid fa-check"></i>
      </button>
    </div>
  `;

  // Bind everything
  _bindColorSync(container);
  _bindToggleRows(container);
  _bindLogoDropzones(container);
  _bindCitiesList(container);
  _bindSave(container);
}

/* ============================================================================
   LOGO DROP ZONES — reusable HTML helper
   ============================================================================ */

function _logoDropzoneHTML(prefix, existingUrl, label, small = false) {
  const hasUrl = !!existingUrl;
  const isDark = label.toLowerCase().includes('sombre');
  const height = small ? '100px' : '140px';
  const bgColor = isDark ? '#1a1a2e' : 'var(--adm-glass-inner)';

  return `
    <div class="st-logo-zone" id="${prefix}-zone" data-prefix="${prefix}">
      <!-- Drop area -->
      <div class="cw-drop-area st-logo-drop ${small ? 'st-logo-drop--sm' : ''}" id="${prefix}-drop" ${hasUrl ? 'hidden' : ''} style="padding:${small ? '20px 16px' : '32px 16px'};">
        <div class="cw-drop-area__illustration" style="width:${small ? '40px' : '52px'};height:${small ? '40px' : '52px'};font-size:${small ? '16px' : '20px'};">
          <i class="fa-solid fa-cloud-arrow-up"></i>
        </div>
        <div class="cw-drop-area__text">
          <span class="cw-drop-area__title" style="font-size:13px;">Glissez-déposez ici</span>
          <span class="cw-drop-area__hint">ou <u>cliquez pour parcourir</u> — PNG, SVG, WebP</span>
        </div>
      </div>
      <!-- Preview -->
      <div class="st-logo-preview" id="${prefix}-preview" ${hasUrl ? '' : 'hidden'} style="background:${bgColor};height:${height};">
        <img id="${prefix}-img" src="${esc(existingUrl || '')}" alt="${esc(label)}">
        <div class="st-logo-preview__overlay">
          <button type="button" class="st-logo-preview__btn" data-action="change"><i class="fa-solid fa-camera"></i> Changer</button>
          <button type="button" class="st-logo-preview__btn st-logo-preview__btn--danger" data-action="remove"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`;
}

/* ============================================================================
   CITY CHIP HTML
   ============================================================================ */

function _cityChipHTML(c) {
  return `<span class="st-city-chip">
    <span>${esc(c)}</span>
    <button type="button" class="st-city-chip__remove" data-city="${esc(c)}" aria-label="Retirer ${esc(c)}">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </span>`;
}

/* ============================================================================
   BINDINGS
   ============================================================================ */

/* ── Color ── */
function _bindColorSync(container) {
  const picker = container.querySelector('#st-color-picker');
  const text = container.querySelector('#st-color-text');
  const preview = container.querySelector('#st-color-preview');

  function apply(hex6) {
    if (!hex6.match(/^[0-9A-Fa-f]{6}$/)) return;
    const full = '#' + hex6;
    picker.value = full;
    text.value = hex6.toUpperCase();
    const badge = preview?.querySelector('.adm-badge');
    const btn = preview?.querySelector('.st-color-btn-preview');
    if (badge) badge.style.background = full;
    if (btn) btn.style.background = full;
  }

  picker?.addEventListener('input', e => apply(e.target.value.replace('#', '')));
  text?.addEventListener('input', e => {
    const v = e.target.value.replace(/^#/, '');
    e.target.value = v;
    apply(v);
  });
}

/* ── Toggle rows ── */
function _bindToggleRows(container) {
  container.querySelectorAll('.st-toggle-row:not(.st-toggle-row--disabled)').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    // Click on the row (but not on the switch itself) toggles the switch
    row.addEventListener('click', e => {
      if (e.target.closest('.adm-switch')) return;
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  });
}

/* ── Logo drop zones ── */
function _bindLogoDropzones(container) {
  const bindings = [
    { prefix: 'st-logo',      fileRef: () => _logoFile,      setRef: f => { _logoFile = f; } },
    { prefix: 'st-dark-logo', fileRef: () => _darkLogoFile,   setRef: f => { _darkLogoFile = f; } },
    { prefix: 'st-favicon',   fileRef: () => _faviconFile,    setRef: f => { _faviconFile = f; } },
  ];

  for (const { prefix, setRef } of bindings) {
    const dropArea = container.querySelector(`#${prefix}-drop`);
    const fileInput = container.querySelector(`#${prefix}-file`);
    const previewEl = container.querySelector(`#${prefix}-preview`);
    const imgEl = container.querySelector(`#${prefix}-img`);
    const hiddenUrl = container.querySelector(`#${prefix}-url`);

    if (!dropArea || !fileInput) continue;

    // Click to browse
    dropArea.addEventListener('click', () => fileInput.click());

    // Drag & drop
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) _setLogoFile(file, prefix, setRef, dropArea, previewEl, imgEl, hiddenUrl);
    });

    // File input change
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) _setLogoFile(file, prefix, setRef, dropArea, previewEl, imgEl, hiddenUrl);
      fileInput.value = '';
    });

    // Preview overlay actions (change / remove) — delegate
    previewEl?.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'change') fileInput.click();
      if (action === 'remove') {
        setRef(null);
        if (hiddenUrl) hiddenUrl.value = '';
        if (imgEl) imgEl.src = '';
        if (previewEl) previewEl.hidden = true;
        if (dropArea) dropArea.hidden = false;
      }
    });
  }
}

function _setLogoFile(file, prefix, setRef, dropArea, previewEl, imgEl, hiddenUrl) {
  if (!file.type.startsWith('image/') && !file.type.includes('svg')) {
    toast('Le fichier doit être une image (PNG, SVG, WebP, JPG)', 'error');
    return;
  }
  setRef(file);
  if (hiddenUrl) hiddenUrl.value = '__pending_upload__';
  if (imgEl) imgEl.src = URL.createObjectURL(file);
  if (previewEl) previewEl.hidden = false;
  if (dropArea) dropArea.hidden = true;
}

/* ── Cities ── */
function _bindCitiesList(container) {
  const citiesEl = container.querySelector('#st-enabled-cities');
  const addInput = container.querySelector('#st-add-city-input');
  const addBtn = container.querySelector('#st-add-city-btn');

  // Delegate remove
  citiesEl?.addEventListener('click', e => {
    const btn = e.target.closest('.st-city-chip__remove');
    if (!btn) return;
    e.preventDefault();
    _currentCities = _currentCities.filter(c => c !== btn.dataset.city);
    _rerenderCities(container);
  });

  const doAdd = () => {
    const raw = (addInput?.value || '').trim();
    const code = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!code) return;
    if (_currentCities.includes(code)) { toast('Espace déjà ajouté', 'warning'); return; }
    _currentCities.push(code);
    if (addInput) addInput.value = '';
    _rerenderCities(container);
  };

  addBtn?.addEventListener('click', doAdd);
  addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
}

function _rerenderCities(container) {
  const el = container.querySelector('#st-enabled-cities');
  if (!el) return;
  el.innerHTML = _currentCities.length > 0
    ? _currentCities.map(c => _cityChipHTML(c)).join('')
    : '<span class="st-cities-empty">Aucun espace configuré</span>';
}

/* ============================================================================
   SAVE
   ============================================================================ */

function _bindSave(container) {
  container.querySelector('#st-save-all')?.addEventListener('click', () => _doSave(container));
}

async function _doSave(container) {
  const btn = container.querySelector('#st-save-all');
  const origHTML = btn?.innerHTML || '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…'; }

  // Color
  const colorHex = (container.querySelector('#st-color-text')?.value || '').trim().replace(/^#/, '');
  const color = '#' + colorHex.toUpperCase();
  if (!color.match(/^#[0-9A-Fa-f]{6}$/)) {
    toast('Couleur invalide — saisissez 6 caractères hexadécimaux (ex : 21B929)', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    return;
  }

  // Upload pending logo files
  let logoUrl = container.querySelector('#st-logo-url')?.value || null;
  let darkLogoUrl = container.querySelector('#st-dark-logo-url')?.value || null;
  let faviconUrl = container.querySelector('#st-favicon-url')?.value || null;

  try {
    if (_logoFile) {
      logoUrl = await api.uploadBrandingAsset(_logoFile, 'logo');
      _logoFile = null;
    }
    if (_darkLogoFile) {
      darkLogoUrl = await api.uploadBrandingAsset(_darkLogoFile, 'dark_logo');
      _darkLogoFile = null;
    }
    if (_faviconFile) {
      faviconUrl = await api.uploadBrandingAsset(_faviconFile, 'favicon');
      _faviconFile = null;
    }
  } catch (err) {
    toast('Erreur lors de l\'upload des images : ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    return;
  }

  // Clean up __pending_upload__ marker
  if (logoUrl === '__pending_upload__') logoUrl = null;
  if (darkLogoUrl === '__pending_upload__') darkLogoUrl = null;
  if (faviconUrl === '__pending_upload__') faviconUrl = null;

  // Toggles
  const enabledToggles = [];
  container.querySelectorAll('.st-toggle-row:not(.st-toggle-row--disabled) input[type="checkbox"]:checked').forEach(cb => {
    const row = cb.closest('.st-toggle-row');
    if (row?.dataset.toggle) enabledToggles.push(row.dataset.toggle);
  });

  const data = {
    brand_name:      container.querySelector('#st-brand-name')?.value?.trim() || null,
    logo_url:        logoUrl || null,
    dark_logo_url:   darkLogoUrl || null,
    favicon_url:     faviconUrl || null,
    primary_color:   color,
    default_basemap: container.querySelector('#st-basemap')?.value || null,
    enabled_toggles: enabledToggles,
    enabled_cities:  _currentCities.length > 0 ? _currentCities : null,
  };

  try {
    await api.updateBranding(data);

    // Update hidden URLs with actual uploaded values
    const urlFields = { 'st-logo-url': logoUrl, 'st-dark-logo-url': darkLogoUrl, 'st-favicon-url': faviconUrl };
    for (const [id, val] of Object.entries(urlFields)) {
      const el = container.querySelector(`#${id}`);
      if (el) el.value = val || '';
    }

    if (window.CityBrandingModule?.applyPrimaryColor) {
      window.CityBrandingModule.applyPrimaryColor(color);
    }

    toast('Structure mise à jour', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
  }
}
