import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, skeletonTable, emptyState } from '../components/ui.js';

const DEFAULT_COLOR = '#21b929';
const DEFAULT_CENTER = [2.35, 46.85]; // France center
const DEFAULT_ZOOM = 6;

// Module-level state for logo file uploads
let _logoFile = null;
let _darkLogoFile = null;
let _faviconFile = null;
let _cityMap = null;

export async function renderVilles(container) {
  _showList(container);
  await _loadCities(container);
}

function _showList(container) {
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

    <div class="adm-toolbar">
      <div class="adm-toolbar__search">
        <input type="text" class="adm-input adm-input--search" id="villes-search" placeholder="Rechercher une ville…">
      </div>
    </div>

    <div class="adm-card">
      <div id="villes-list-body" style="padding:0;">
        ${skeletonTable(5)}
      </div>
    </div>
  `;

  container.querySelector('#ville-create-btn')?.addEventListener('click', () => _showCityForm(container, null));

  let timer;
  container.querySelector('#villes-search')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => _filterCities(container, e.target.value.trim()), 250);
  });
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

function _filterCities(container, query) {
  const body = container.querySelector('#villes-list-body');
  if (!body) return;
  const q = query.toLowerCase();
  const filtered = q
    ? _allCities.filter(c =>
        (c.ville || '').toLowerCase().includes(q) ||
        (c.brand_name || '').toLowerCase().includes(q))
    : _allCities;
  _renderCityList(body, filtered);
}

function _renderCityList(body, cities) {
  const list = cities || _allCities;
  if (list.length === 0) {
    body.innerHTML = '';
    body.appendChild(emptyState({ icon: 'fa-solid fa-city', title: 'Aucune ville configurée' }));
    return;
  }

  // Remove old listener before rendering
  body.removeEventListener('click', _handleActions);

  body.innerHTML = list.map(city => {
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

function _showCityForm(container, existing) {
  const isEdit = existing != null;

  // Reset file state
  _logoFile = null;
  _darkLogoFile = null;
  _faviconFile = null;
  if (_cityMap) { _cityMap.remove(); _cityMap = null; }

  const existingCenter = existing?.center_lng && existing?.center_lat
    ? [parseFloat(existing.center_lng), parseFloat(existing.center_lat)]
    : null;
  const existingZoom = existing?.zoom != null ? parseFloat(existing.zoom) : null;

  container.innerHTML = `
    <!-- ── HEADER ── -->
    <div class="cw-header">
      <div class="cw-header__top">
        <a href="#" class="cw-back-link" id="cf-back">
          <i class="fa-solid fa-arrow-left"></i>
          <span>Villes</span>
        </a>
      </div>
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title">${isEdit ? `Modifier : ${esc(existing.brand_name || existing.ville)}` : 'Nouvelle ville'}</h1>
          <p class="cw-header__subtitle">${isEdit ? 'Modifiez les informations de la structure.' : 'Complétez le formulaire ci-dessous pour créer une nouvelle structure.'}</p>
        </div>
      </div>
    </div>

    <!-- ── FORM SECTIONS ── -->
    <div class="cw-sections">

      <!-- 1 · Identifiant -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-fingerprint"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Identifiant</h2>
            <p class="cw-section__desc">L'identifiant unique de cette structure</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label" for="cf-ville">
              Code ville <span class="cw-required">*</span>
            </label>
            <input type="text" class="cw-field__input cw-field__input--hero" id="cf-ville"
              value="${esc(existing?.ville || '')}" ${isEdit ? 'disabled style="opacity:.6;"' : ''}
              required placeholder="ex : lyon" autocomplete="off">
            ${!isEdit ? '<p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Identifiant unique, en minuscules, sans espaces. Il ne pourra plus être modifié.</p>' : ''}
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="cf-brand-name">
              Nom affiché <span class="cw-required">*</span>
            </label>
            <input type="text" class="cw-field__input" id="cf-brand-name"
              value="${esc(existing?.brand_name || '')}" placeholder="Ex : Métropole de Lyon" required>
            <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Le nom public de cette structure, affiché dans l'interface.</p>
          </div>
        </div>
      </section>

      <!-- 2 · Apparence -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-palette"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Apparence</h2>
            <p class="cw-section__desc">Logos, favicon et couleur primaire</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">

          <!-- Logo -->
          <div class="cw-field">
            <label class="cw-field__label">Logo</label>
            ${_logoDropzoneHTML('cf-logo', existing?.logo_url, 'Logo')}
            <input type="file" id="cf-logo-file" accept="image/*" hidden>
            <input type="hidden" id="cf-logo-url" value="${esc(existing?.logo_url || '')}">
          </div>

          <!-- Dark logo -->
          <div class="cw-field">
            <label class="cw-field__label">Logo sombre</label>
            ${_logoDropzoneHTML('cf-dark-logo', existing?.dark_logo_url, 'Logo sombre')}
            <input type="file" id="cf-dark-logo-file" accept="image/*" hidden>
            <input type="hidden" id="cf-dark-logo-url" value="${esc(existing?.dark_logo_url || '')}">
          </div>

          <!-- Favicon -->
          <div class="cw-field">
            <label class="cw-field__label">Favicon</label>
            ${_logoDropzoneHTML('cf-favicon', existing?.favicon_url, 'Favicon', true)}
            <input type="file" id="cf-favicon-file" accept="image/*" hidden>
            <input type="hidden" id="cf-favicon-url" value="${esc(existing?.favicon_url || '')}">
          </div>

          <!-- Color -->
          <div class="cw-field">
            <label class="cw-field__label">Couleur primaire</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="color" id="cf-color-picker" value="${existing?.primary_color || DEFAULT_COLOR}"
                style="width:40px;height:36px;border:none;padding:0;cursor:pointer;background:transparent;">
              <input type="text" class="cw-field__input" id="cf-color-text"
                value="${existing?.primary_color || DEFAULT_COLOR}" style="max-width:120px;font-family:monospace;" maxlength="7">
            </div>
          </div>
        </div>
      </section>

      <!-- 3 · Position sur la carte -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-map-location-dot"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Position sur la carte</h2>
            <p class="cw-section__desc">Définissez le centre et le niveau de zoom par défaut</p>
          </div>
        </div>
        <div class="cw-section__body">

          <!-- Search bar -->
          <div class="cf-map-search-wrap">
            <div class="cf-map-search">
              <i class="fa-solid fa-magnifying-glass cf-map-search__icon"></i>
              <input type="text" class="cw-field__input" id="cf-map-search" placeholder="Rechercher une ville ou une adresse…" autocomplete="off">
            </div>
            <div class="cf-map-search-results" id="cf-map-search-results" hidden></div>
          </div>

          <!-- Map container -->
          <div class="cw-map-wrap" id="cf-map-wrap">
            <div id="cf-map"></div>
            <div class="cf-map-crosshair" id="cf-map-crosshair">
              <i class="fa-solid fa-crosshairs"></i>
            </div>
          </div>

          <!-- Coordinates display -->
          <div class="cf-map-coords" id="cf-map-coords">
            <div class="cf-map-coord">
              <span class="cf-map-coord__label">Lat</span>
              <span class="cf-map-coord__value" id="cf-coord-lat">${existingCenter ? existingCenter[1].toFixed(5) : '—'}</span>
            </div>
            <div class="cf-map-coord">
              <span class="cf-map-coord__label">Lng</span>
              <span class="cf-map-coord__value" id="cf-coord-lng">${existingCenter ? existingCenter[0].toFixed(5) : '—'}</span>
            </div>
            <div class="cf-map-coord">
              <span class="cf-map-coord__label">Zoom</span>
              <span class="cf-map-coord__value" id="cf-coord-zoom">${existingZoom != null ? existingZoom.toFixed(1) : '—'}</span>
            </div>
          </div>

          <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Naviguez sur la carte pour définir la vue par défaut. Le centre et le zoom seront enregistrés automatiquement.</p>
        </div>
      </section>

    </div><!-- /cw-sections -->

    <!-- ── FOOTER ── -->
    <div class="cw-footer">
      <a href="#" class="cw-footer__cancel" id="cf-cancel">
        <i class="fa-solid fa-arrow-left"></i> Retour
      </a>
      <button type="button" class="cw-footer__submit" id="cf-submit">
        <span class="cw-footer__submit-text">${isEdit ? 'Enregistrer' : 'Créer la ville'}</span>
        <i class="fa-solid fa-check"></i>
      </button>
    </div>
  `;

  _bindCityForm(container, existing);
}

/* ── Logo dropzone HTML (reuses structure.js pattern) ── */
function _logoDropzoneHTML(prefix, existingUrl, label, small = false) {
  const hasUrl = !!existingUrl;
  const isDark = label.toLowerCase().includes('sombre');
  const height = small ? '100px' : '140px';
  const bgColor = isDark ? '#1a1a2e' : 'var(--adm-glass-inner)';

  return `
    <div class="st-logo-zone" id="${prefix}-zone" data-prefix="${prefix}">
      <div class="cw-drop-area st-logo-drop ${small ? 'st-logo-drop--sm' : ''}" id="${prefix}-drop" ${hasUrl ? 'hidden' : ''} style="padding:${small ? '20px 16px' : '32px 16px'};">
        <div class="cw-drop-area__illustration" style="width:${small ? '40px' : '52px'};height:${small ? '40px' : '52px'};font-size:${small ? '16px' : '20px'};">
          <i class="fa-solid fa-cloud-arrow-up"></i>
        </div>
        <div class="cw-drop-area__text">
          <span class="cw-drop-area__title" style="font-size:13px;">Glissez-déposez ici</span>
          <span class="cw-drop-area__hint">ou <u>cliquez pour parcourir</u> — PNG, SVG, WebP</span>
        </div>
      </div>
      <div class="st-logo-preview" id="${prefix}-preview" ${hasUrl ? '' : 'hidden'} style="background:${bgColor};height:${height};">
        <img id="${prefix}-img" src="${esc(existingUrl || '')}" alt="${esc(label)}">
        <div class="st-logo-preview__overlay">
          <button type="button" class="st-logo-preview__btn" data-action="change"><i class="fa-solid fa-camera"></i> Changer</button>
          <button type="button" class="st-logo-preview__btn st-logo-preview__btn--danger" data-action="remove"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`;
}

function _bindCityForm(container, existing) {
  const isEdit = existing != null;

  // Back / cancel → return to list
  const goBack = (e) => {
    e.preventDefault();
    if (_cityMap) { _cityMap.remove(); _cityMap = null; }
    _showList(container);
    _loadCities(container);
  };
  container.querySelector('#cf-back')?.addEventListener('click', goBack);
  container.querySelector('#cf-cancel')?.addEventListener('click', goBack);

  // Sync color picker ↔ text
  const picker = container.querySelector('#cf-color-picker');
  const colorText = container.querySelector('#cf-color-text');
  picker?.addEventListener('input', (e) => { colorText.value = e.target.value; });
  colorText?.addEventListener('input', (e) => { if (e.target.value.match(/^#[0-9A-Fa-f]{6}$/)) picker.value = e.target.value; });

  // Logo dropzones
  _bindLogoDropzones(container);

  // Map
  _initCityMap(container, existing);

  // Submit
  container.querySelector('#cf-submit')?.addEventListener('click', async () => {
    const btn = container.querySelector('#cf-submit');
    const origHTML = btn?.innerHTML || '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';

    const ville = container.querySelector('#cf-ville')?.value?.trim()?.toLowerCase();
    if (!ville) { toast('Code ville obligatoire', 'error'); btn.disabled = false; btn.innerHTML = origHTML; return; }
    if (!/^[a-z0-9_-]+$/.test(ville)) { toast('Code ville : lettres minuscules, chiffres, tirets uniquement', 'error'); btn.disabled = false; btn.innerHTML = origHTML; return; }

    const brandName = container.querySelector('#cf-brand-name')?.value?.trim();
    if (!brandName) { toast('Nom affiché obligatoire', 'error'); btn.disabled = false; btn.innerHTML = origHTML; return; }

    // Validate color
    const colorVal = (container.querySelector('#cf-color-text')?.value || '').trim();
    if (colorVal && !colorVal.match(/^#[0-9A-Fa-f]{6}$/)) {
      toast('Couleur invalide — format #RRGGBB attendu', 'error');
      btn.disabled = false; btn.innerHTML = origHTML;
      return;
    }

    // Upload pending logo files
    let logoUrl = container.querySelector('#cf-logo-url')?.value || null;
    let darkLogoUrl = container.querySelector('#cf-dark-logo-url')?.value || null;
    let faviconUrl = container.querySelector('#cf-favicon-url')?.value || null;

    // For new cities we use the ville code directly; for edits, existing.ville
    const uploadVille = isEdit ? existing.ville : ville;

    try {
      if (_logoFile) {
        logoUrl = await api.uploadBrandingAssetForCity(_logoFile, uploadVille, 'logo');
        _logoFile = null;
      }
      if (_darkLogoFile) {
        darkLogoUrl = await api.uploadBrandingAssetForCity(_darkLogoFile, uploadVille, 'dark_logo');
        _darkLogoFile = null;
      }
      if (_faviconFile) {
        faviconUrl = await api.uploadBrandingAssetForCity(_faviconFile, uploadVille, 'favicon');
        _faviconFile = null;
      }
    } catch (err) {
      toast('Erreur lors de l\'upload des images : ' + err.message, 'error');
      btn.disabled = false; btn.innerHTML = origHTML;
      return;
    }

    // Clean up marker
    if (logoUrl === '__pending_upload__') logoUrl = null;
    if (darkLogoUrl === '__pending_upload__') darkLogoUrl = null;
    if (faviconUrl === '__pending_upload__') faviconUrl = null;

    // Map center / zoom
    const mapCenter = _cityMap ? _cityMap.getCenter() : null;
    const mapZoom = _cityMap ? _cityMap.getZoom() : null;

    const data = {
      brand_name: brandName,
      logo_url: logoUrl || null,
      dark_logo_url: darkLogoUrl || null,
      favicon_url: faviconUrl || null,
      primary_color: colorVal || DEFAULT_COLOR,
      center_lat: mapCenter ? parseFloat(mapCenter.lat.toFixed(6)) : null,
      center_lng: mapCenter ? parseFloat(mapCenter.lng.toFixed(6)) : null,
      zoom: mapZoom != null ? parseFloat(mapZoom.toFixed(2)) : null,
    };

    try {
      if (isEdit) {
        await api.updateCity(existing.ville, data);
        toast('Ville mise à jour', 'success');
      } else {
        await api.createCity({ ville, ...data });
        toast('Ville créée', 'success');
      }
      if (_cityMap) { _cityMap.remove(); _cityMap = null; }
      _showList(container);
      await _loadCities(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }
  });
}

/* ── Logo dropzone bindings (same pattern as structure.js) ── */
function _bindLogoDropzones(container) {
  const bindings = [
    { prefix: 'cf-logo',      setRef: f => { _logoFile = f; } },
    { prefix: 'cf-dark-logo', setRef: f => { _darkLogoFile = f; } },
    { prefix: 'cf-favicon',   setRef: f => { _faviconFile = f; } },
  ];

  for (const { prefix, setRef } of bindings) {
    const dropArea = container.querySelector(`#${prefix}-drop`);
    const fileInput = container.querySelector(`#${prefix}-file`);
    const previewEl = container.querySelector(`#${prefix}-preview`);
    const imgEl = container.querySelector(`#${prefix}-img`);
    const hiddenUrl = container.querySelector(`#${prefix}-url`);

    if (!dropArea || !fileInput) continue;

    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) _setLogoFile(file, prefix, setRef, dropArea, previewEl, imgEl, hiddenUrl);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) _setLogoFile(file, prefix, setRef, dropArea, previewEl, imgEl, hiddenUrl);
      fileInput.value = '';
    });

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

/* ── Interactive map with search ── */
function _initCityMap(container, existing) {
  const mapContainer = container.querySelector('#cf-map');
  if (!mapContainer || typeof maplibregl === 'undefined') return;

  const existingCenter = existing?.center_lng && existing?.center_lat
    ? [parseFloat(existing.center_lng), parseFloat(existing.center_lat)]
    : DEFAULT_CENTER;
  const existingZoom = existing?.zoom != null ? parseFloat(existing.zoom) : DEFAULT_ZOOM;

  // Defer init until container has dimensions
  requestAnimationFrame(() => {
    const map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          }
        },
        layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
      },
      center: existingCenter,
      zoom: existingZoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    _cityMap = map;

    // Update coords on move
    const updateCoords = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      const latEl = container.querySelector('#cf-coord-lat');
      const lngEl = container.querySelector('#cf-coord-lng');
      const zoomEl = container.querySelector('#cf-coord-zoom');
      if (latEl) latEl.textContent = c.lat.toFixed(5);
      if (lngEl) lngEl.textContent = c.lng.toFixed(5);
      if (zoomEl) zoomEl.textContent = z.toFixed(1);
    };
    map.on('move', updateCoords);
    map.on('load', updateCoords);

    // Search binding
    _bindMapSearch(container, map);
  });
}

/* ── Geocoding search (Nominatim) ── */
function _bindMapSearch(container, map) {
  const input = container.querySelector('#cf-map-search');
  const resultsEl = container.querySelector('#cf-map-search-results');
  if (!input || !resultsEl) return;

  let debounce = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 3) { resultsEl.hidden = true; return; }
    debounce = setTimeout(() => _doGeoSearch(q, resultsEl), 350);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { resultsEl.hidden = true; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = resultsEl.querySelector('.cf-map-search-item');
      if (first) first.click();
    }
  });

  // Close results on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cf-map-search-wrap')) resultsEl.hidden = true;
  });

  resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.cf-map-search-item');
    if (!item) return;
    const lng = parseFloat(item.dataset.lng);
    const lat = parseFloat(item.dataset.lat);
    const bbox = item.dataset.bbox;
    input.value = item.dataset.name || '';
    resultsEl.hidden = true;

    if (bbox) {
      const [s, n, w, e2] = bbox.split(',').map(Number);
      map.fitBounds([[s, w], [n, e2]], { padding: 40, maxZoom: 15, duration: 1200 });
    } else {
      map.flyTo({ center: [lng, lat], zoom: 13, duration: 1200 });
    }
  });
}

async function _doGeoSearch(query, resultsEl) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=fr`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();

    if (!data.length) {
      resultsEl.innerHTML = '<div class="cf-map-search-empty"><i class="fa-solid fa-magnifying-glass"></i> Aucun résultat</div>';
      resultsEl.hidden = false;
      return;
    }

    resultsEl.innerHTML = data.map(r => {
      const name = r.display_name;
      const type = r.type || '';
      const icon = type.includes('city') || type.includes('town') || type.includes('village')
        ? 'fa-city' : type.includes('admin') ? 'fa-map' : 'fa-location-dot';
      const bbox = r.boundingbox ? r.boundingbox.join(',') : '';
      return `
        <div class="cf-map-search-item" data-lat="${esc(r.lat)}" data-lng="${esc(r.lon)}" data-name="${esc(name)}" data-bbox="${esc(bbox)}">
          <i class="fa-solid ${icon} cf-map-search-item__icon"></i>
          <div class="cf-map-search-item__text">
            <span class="cf-map-search-item__name">${esc(name.split(',')[0])}</span>
            <span class="cf-map-search-item__detail">${esc(name.split(',').slice(1, 3).join(',').trim())}</span>
          </div>
        </div>`;
    }).join('');
    resultsEl.hidden = false;
  } catch (e) {
    console.error('[villes] geocoding error', e);
  }
}
