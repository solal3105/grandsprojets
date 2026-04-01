import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, skeletonTable, emptyState } from '../components/ui.js';

const DEFAULT_COLOR = '#21b929';

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
    if (city && container) _showCityForm(container, city);
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

function _showCityForm(container, existing) {
  const isEdit = existing != null;

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
              Nom affiché <span class="cw-optional">facultatif</span>
            </label>
            <input type="text" class="cw-field__input" id="cf-brand-name"
              value="${esc(existing?.brand_name || '')}" placeholder="Ex : Métropole de Lyon">
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
          <div class="cw-field">
            <label class="cw-field__label" for="cf-logo-url">URL du logo</label>
            <input type="url" class="cw-field__input" id="cf-logo-url"
              value="${esc(existing?.logo_url || '')}" placeholder="https://…/logo.png">
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="cf-dark-logo-url">URL du logo sombre</label>
            <input type="url" class="cw-field__input" id="cf-dark-logo-url"
              value="${esc(existing?.dark_logo_url || '')}" placeholder="https://…/logo-dark.png">
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="cf-favicon-url">URL du favicon</label>
            <input type="url" class="cw-field__input" id="cf-favicon-url"
              value="${esc(existing?.favicon_url || '')}" placeholder="https://…/favicon.ico">
          </div>
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

      <!-- 3 · Carte -->
      <section class="cw-section">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-map"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Carte</h2>
            <p class="cw-section__desc">Configuration du fond de carte par défaut</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label" for="cf-basemap">Fond de carte</label>
            <input type="text" class="cw-field__input" id="cf-basemap"
              value="${esc(existing?.default_basemap || '')}" placeholder="Nom du basemap ou vide">
            <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Laissez vide pour utiliser le fond de carte par défaut.</p>
          </div>
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

function _bindCityForm(container, existing) {
  const isEdit = existing != null;

  // Back / cancel → return to list
  const goBack = (e) => {
    e.preventDefault();
    _showList(container);
    _loadCities(container);
  };
  container.querySelector('#cf-back')?.addEventListener('click', goBack);
  container.querySelector('#cf-cancel')?.addEventListener('click', goBack);

  // Sync color picker ↔ text
  const picker = container.querySelector('#cf-color-picker');
  const text = container.querySelector('#cf-color-text');
  picker?.addEventListener('input', (e) => { text.value = e.target.value; });
  text?.addEventListener('input', (e) => { if (e.target.value.match(/^#[0-9A-Fa-f]{6}$/)) picker.value = e.target.value; });

  // Submit
  container.querySelector('#cf-submit')?.addEventListener('click', async () => {
    const btn = container.querySelector('#cf-submit');
    btn.disabled = true;

    const ville = container.querySelector('#cf-ville')?.value?.trim()?.toLowerCase();
    if (!ville) { toast('Code ville obligatoire', 'error'); btn.disabled = false; return; }
    if (!/^[a-z0-9_-]+$/.test(ville)) { toast('Code ville : lettres minuscules, chiffres, tirets uniquement', 'error'); btn.disabled = false; return; }

    const data = {
      brand_name: container.querySelector('#cf-brand-name')?.value?.trim() || null,
      logo_url: container.querySelector('#cf-logo-url')?.value?.trim() || null,
      dark_logo_url: container.querySelector('#cf-dark-logo-url')?.value?.trim() || null,
      favicon_url: container.querySelector('#cf-favicon-url')?.value?.trim() || null,
      primary_color: container.querySelector('#cf-color-text')?.value?.trim() || DEFAULT_COLOR,
      default_basemap: container.querySelector('#cf-basemap')?.value?.trim() || null,
    };

    try {
      if (isEdit) {
        await api.updateCity(existing.ville, data);
        toast('Ville mise à jour', 'success');
      } else {
        await api.createCity({ ville, ...data });
        toast('Ville créée', 'success');
      }
      _showList(container);
      await _loadCities(container);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}
