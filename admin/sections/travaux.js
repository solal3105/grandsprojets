/* ============================================================================
   TRAVAUX SECTION — List chantiers, approve, create/edit inline, config
   ============================================================================ */

import { store } from '../store.js';
import { router } from '../router.js';
import * as api from '../api.js';
import { toast, confirm, slidePanel, esc, formatDate, skeletonTable, emptyState } from '../components/ui.js';
import { renderIconField, bindIconField } from '../components/icon-picker.js';

const ETAT_LABELS = {
  en_cours: { label: 'En cours', badge: 'success', icon: 'fa-hammer' },
  prevu:    { label: 'Prévu',    badge: 'info',    icon: 'fa-calendar' },
  termine:  { label: 'Terminé', badge: 'neutral',  icon: 'fa-check' },
  a_venir:  { label: 'À venir', badge: 'warning',  icon: 'fa-clock' },
};

const DEFAULT_ICON = 'fa-solid fa-helmet-safety';

let _twState = {
  search: '',
  status: '',   // '' | 'pending' | 'approved'
  sortBy: 'created_at',
  sortDir: 'desc',
  readOnly: false,   // true in open-data scenarios
  scenario: 'normal', // 'normal' | 'opendata' | 'opendata_nourl'
};

export async function renderTravaux(container, params) {
  // Config page always accessible regardless of module state
  if (params.id === 'config') return _renderConfig(container);

  // Load config fresh on each navigation to always reflect current state
  const config = await api.getTravauxConfig().catch(() => null);
  const scenario = _getTwScenario(config);

  // Scenarios A (unconfigured) & B (disabled) → empty state
  if (scenario === 'unconfigured' || scenario === 'disabled') {
    return _renderModuleEmpty(container, scenario);
  }

  // Scenarios D & E (open data) → no manual entry routes
  if (scenario === 'opendata' || scenario === 'opendata_nourl') {
    if (params.id === 'nouveau' || (params.id && params.id !== 'config')) {
      router.navigate('/admin/travaux/');
      return;
    }
    _twState.readOnly = true;
    _twState.scenario = scenario;
    const urlParams = new URLSearchParams(window.location.search);
    _twState.status = urlParams.get('status') || '';
    _renderListPage(container);
    await _loadList(container);
    return;
  }

  // Scenario C (normal) → full access
  _twState.readOnly = false;
  _twState.scenario = 'normal';
  if (params.id === 'nouveau') return _renderCreateForm(container);
  if (params.id) return _openChantierDetail(container, parseInt(params.id, 10));

  const urlParams = new URLSearchParams(window.location.search);
  _twState.status = urlParams.get('status') || '';
  _renderListPage(container);
  await _loadList(container);
}

/* ── Scenario helpers ── */

function _getTwScenario(config) {
  if (!config) return 'unconfigured';
  if (!config.enabled) return 'disabled';
  if (config.source_type === 'url') return config.url ? 'opendata' : 'opendata_nourl';
  return 'normal';
}

function _renderModuleEmpty(container, scenario) {
  const isDisabled = scenario === 'disabled';
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-helmet-safety"></i> Travaux</h1>
        <p class="adm-page-subtitle">Module non actif pour ${esc(store.city)}</p>
      </div>
      <a href="/admin/travaux/config/" class="adm-btn adm-btn--secondary" data-section="travaux">
        <i class="fa-solid fa-gear"></i> Configuration
      </a>
    </div>
    <div class="adm-module-empty">
      <div class="adm-module-empty__icon${isDisabled ? ' adm-module-empty__icon--muted' : ''}">
        <i class="fa-solid fa-helmet-safety"></i>
      </div>
      <h2 class="adm-module-empty__title">
        ${isDisabled ? 'Module Travaux désactivé' : 'Module Travaux non configuré'}
      </h2>
      <p class="adm-module-empty__desc">
        ${isDisabled
          ? 'Le module est configuré mais actuellement désactivé. Les chantiers ne sont pas visibles sur la carte publique.'
          : 'Ce module n\'est pas encore activé pour cette structure. Configurez-le pour afficher des chantiers sur la carte publique.'
        }
      </p>
      <a href="/admin/travaux/config/" class="adm-btn adm-btn--primary" data-section="travaux">
        <i class="fa-solid fa-${isDisabled ? 'power-off' : 'gear'}"></i>
        ${isDisabled ? 'Activer le module' : 'Configurer le module'}
      </a>
    </div>
  `;
}

/* ── List page ── */

function _renderListPage(container) {
  const isReadOnly = _twState.readOnly;
  const scenario = _twState.scenario;

  const banner = isReadOnly ? `
    <div class="adm-opendata-banner adm-opendata-banner--${scenario === 'opendata_nourl' ? 'warning' : 'info'}">
      <i class="fa-solid fa-${scenario === 'opendata_nourl' ? 'triangle-exclamation' : 'link'}"></i>
      <div>
        ${scenario === 'opendata_nourl'
          ? `<strong>URL du flux non définie</strong><span>Le module est en mode open data mais aucune URL source n'est configurée. <a href="/admin/travaux/config/" data-section="travaux" style="font-weight:600;text-decoration:underline;">Configurer →</a></span>`
          : `<strong>Source open data active</strong><span>Les chantiers sont importés via un flux externe. Les entrées ci-dessous ont été créées manuellement et ne sont plus affichées sur la carte publique.</span>`
        }
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-helmet-safety"></i> Travaux</h1>
        <p class="adm-page-subtitle">Chantiers de ${esc(store.city)}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="/admin/travaux/config/" class="adm-btn adm-btn--secondary" data-section="travaux">
          <i class="fa-solid fa-gear"></i> Configuration
        </a>
        ${!isReadOnly ? `<a href="/admin/travaux/nouveau/" class="adm-btn adm-btn--primary" data-section="travaux">
          <i class="fa-solid fa-plus"></i> Nouveau chantier
        </a>` : ''}
      </div>
    </div>

    ${banner}

    ${!isReadOnly ? `
    <!-- Tabs: status filter -->
    <div class="adm-tabs" id="travaux-tabs">
      <button class="adm-tab ${_twState.status === '' ? 'active' : ''}" data-status="">Tous</button>
      <button class="adm-tab ${_twState.status === 'pending' ? 'active' : ''}" data-status="pending">
        <i class="fa-solid fa-clock"></i> En attente
      </button>
      <button class="adm-tab ${_twState.status === 'approved' ? 'active' : ''}" data-status="approved">
        <i class="fa-solid fa-check"></i> Approuvés
      </button>
    </div>` : ''}

    <!-- Toolbar -->
    <div class="adm-toolbar">
      <div class="adm-toolbar__search">
        <input type="text" class="adm-input adm-input--search" id="travaux-search"
          placeholder="Rechercher un chantier…" value="${esc(_twState.search)}">
      </div>
      <div class="adm-toolbar__filters">
        <select class="adm-select" id="travaux-sort" style="min-width:140px;">
          <option value="created_at:desc" ${_twState.sortBy === 'created_at' && _twState.sortDir === 'desc' ? 'selected' : ''}>Plus récent</option>
          <option value="created_at:asc"  ${_twState.sortBy === 'created_at' && _twState.sortDir === 'asc'  ? 'selected' : ''}>Plus ancien</option>
          <option value="name:asc"        ${_twState.sortBy === 'name' ? 'selected' : ''}>Nom A-Z</option>
        </select>
      </div>
    </div>

    <!-- List -->
    <div class="adm-card">
      <div id="travaux-list-body" style="padding:0;">
        ${skeletonTable(5)}
      </div>
    </div>
  `;

  _bindTwToolbar(container);
}

function _bindTwToolbar(container) {
  // Tabs
  container.querySelectorAll('#travaux-tabs .adm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _twState.status = tab.dataset.status;
      container.querySelectorAll('#travaux-tabs .adm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _filterAndRender(container);
    });
  });

  // Search (debounced)
  const searchInput = container.querySelector('#travaux-search');
  let searchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _twState.search = searchInput.value.trim();
      _filterAndRender(container);
    }, 350);
  });

  // Sort
  container.querySelector('#travaux-sort')?.addEventListener('change', (e) => {
    const [sortBy, sortDir] = e.target.value.split(':');
    _twState.sortBy = sortBy;
    _twState.sortDir = sortDir || 'asc';
    _filterAndRender(container);
  });
}

let _allTravaux = [];

async function _loadList(container) {
  const listBody = container.querySelector('#travaux-list-body');
  if (!listBody) return;

  try {
    _allTravaux = await api.getTravaux({ adminMode: true });
    _filterAndRender(container);
  } catch (e) {
    console.error('[admin/travaux]', e);
    listBody.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _filterAndRender(container) {
  const listBody = container.querySelector('#travaux-list-body');
  if (!listBody) return;

  let items = _allTravaux;

  // Status filter
  if (_twState.status === 'pending') items = items.filter(i => !i.approved);
  else if (_twState.status === 'approved') items = items.filter(i => i.approved);

  // Search filter
  if (_twState.search) {
    const q = _twState.search.toLowerCase();
    items = items.filter(i =>
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.nature && i.nature.toLowerCase().includes(q)) ||
      (i.localisation && i.localisation.toLowerCase().includes(q))
    );
  }

  // Sort
  items = [...items].sort((a, b) => {
    const dir = _twState.sortDir === 'asc' ? 1 : -1;
    const va = a[_twState.sortBy] || '';
    const vb = b[_twState.sortBy] || '';
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  if (items.length === 0) {
    listBody.innerHTML = '';
    listBody.appendChild(emptyState({ icon: 'fa-solid fa-helmet-safety', title: 'Aucun chantier' }));
    return;
  }

  listBody.innerHTML = items.map(_renderTravauxRow).join('');
  _bindTravauxActions(container, listBody);
}

function _renderTravauxRow(item) {
  const etat = ETAT_LABELS[item.etat] || ETAT_LABELS.en_cours;
  const icon = item.icon || DEFAULT_ICON;
  const isPending = !item.approved;

  const dates = [item.date_debut && `Du ${formatDate(item.date_debut)}`, item.date_fin && `au ${formatDate(item.date_fin)}`]
    .filter(Boolean).join(' ');

  return `
    <div class="adm-list-item ${isPending ? 'adm-list-item--pending' : ''}" data-id="${item.id}">
      <div class="tw-row-icon tw-row-icon--${etat.badge}">
        <i class="${esc(icon)}"></i>
      </div>
      <div class="adm-list-item__info">
        <div class="adm-list-item__name">
          ${esc(item.name || 'Sans nom')}
          ${isPending ? '<span class="adm-badge adm-badge--warning" style="margin-left:6px;font-size:11px;"><i class="fa-solid fa-clock"></i> En attente</span>' : ''}
        </div>
        <div class="adm-list-item__meta">
          <span class="adm-badge adm-badge--${etat.badge}"><i class="fa-solid ${etat.icon}"></i> ${etat.label}</span>
          ${item.nature ? `<span class="tw-meta-pill">${esc(item.nature)}</span>` : ''}
          ${dates ? `<span style="color:var(--text-muted);">${dates}</span>` : ''}
          ${item.localisation ? `<span style="color:var(--text-muted);"><i class="fa-solid fa-location-dot" style="margin-right:3px;"></i>${esc(item.localisation)}</span>` : ''}
        </div>
      </div>
      <div class="adm-list-item__actions">
        ${!_twState.readOnly ? `
          ${isPending ? `
          <button class="adm-btn adm-btn--primary adm-btn--sm" data-action="approve" data-id="${item.id}" title="Approuver">
            <i class="fa-solid fa-check"></i> Approuver
          </button>` : ''}
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="edit" data-id="${item.id}" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="delete" data-id="${item.id}" title="Supprimer" style="color:var(--danger);">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : `<span class="adm-badge adm-badge--neutral" style="font-size:11px;"><i class="fa-solid fa-box-archive"></i> Legacy</span>`}
      </div>
    </div>
  `;
}

function _bindTravauxActions(container, listBody) {
  listBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    const id = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;

    if (action === 'approve') {
      btn.disabled = true;
      try {
        await api.updateTravaux(id, { approved: true });
        toast('Chantier approuvé', 'success');
        await _loadList(container);
      } catch (err) { toast(err.message, 'error'); }
    }

    if (action === 'edit') {
      router.navigate(`/admin/travaux/${id}/`);
    }

    if (action === 'delete') {
      const item = _allTravaux.find(i => i.id === id);
      const yes = await confirm({
        title: 'Supprimer ce chantier ?',
        message: `"${item?.name || 'Ce chantier'}" sera supprimé définitivement.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!yes) return;
      try {
        await api.deleteTravaux(id);
        toast('Chantier supprimé', 'success');
        await _loadList(container);
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}

/* ── Create / Edit form ── */

let _tw = { _map: null, _drawFeatures: [], _drawMode: null, _drawPoints: [], drawnGeoJSON: null, geojsonFile: null, branding: null, locationMode: 'draw' };

function _resetTwForm() {
  if (_tw._map) { try { _tw._map.remove(); } catch (_) {} }
  _tw = { _map: null, _drawFeatures: [], _drawMode: null, _drawPoints: [], drawnGeoJSON: null, geojsonFile: null, branding: null, locationMode: 'draw' };
}

async function _renderCreateForm(container, chantier = null) {
  _resetTwForm();
  const isEdit = chantier != null;
  const hasExistingGeo = isEdit && !!chantier?.geojson_url;

  // Load branding for map center
  _tw.branding = await api.getBranding().catch(() => null);

  container.innerHTML = `
    <!-- ── HEADER ── -->
    <div class="cw-header">
      <div class="cw-header__top">
        <a href="/admin/travaux/" class="cw-back-link" data-section="travaux">
          <i class="fa-solid fa-arrow-left"></i><span>Travaux</span>
        </a>
      </div>
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title">${isEdit ? 'Modifier le chantier' : 'Nouveau chantier'}</h1>
          <p class="cw-header__subtitle">${isEdit ? esc(chantier.name) : 'Renseignez les informations du chantier — seul le <strong>nom</strong> est obligatoire.'}</p>
        </div>
      </div>
    </div>

    <!-- ── SECTIONS ── -->
    <div class="cw-sections">

      <!-- 1 · IDENTITÉ -->
      <section class="cw-section" id="tw-sect-identity">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-tag"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Identité du chantier</h2>
            <p class="cw-section__desc">Nom, nature et adresse des travaux</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label" for="tw-name">Nom du chantier <span class="cw-required">*</span></label>
            <input type="text" class="cw-field__input cw-field__input--hero" id="tw-name" autocomplete="off"
              value="${esc(chantier?.name || '')}" placeholder="Ex : Réfection de la chaussée" maxlength="120">
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="tw-nature">Nature des travaux <span class="cw-optional">facultatif</span></label>
            <input type="text" class="cw-field__input" id="tw-nature"
              value="${esc(chantier?.nature || '')}" placeholder="Ex : Voirie, Réseaux, Bâtiment…">
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="tw-localisation"><i class="fa-solid fa-location-dot"></i> Adresse / Localisation <span class="cw-optional">facultatif</span></label>
            <input type="text" class="cw-field__input" id="tw-localisation"
              value="${esc(chantier?.localisation || '')}" placeholder="Ex : Avenue Jean Jaurès">
          </div>
          <div class="cw-field">
            <label class="cw-field__label" for="tw-description">Description <span class="cw-optional">facultatif</span></label>
            <textarea class="cw-field__textarea" id="tw-description" rows="4"
              placeholder="Décrivez les travaux, leur impact sur la circulation…">${esc(chantier?.description || '')}</textarea>
          </div>
        </div>
      </section>

      <!-- 2 · ÉTAT & PLANNING -->
      <section class="cw-section" id="tw-sect-planning">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-calendar-days"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">État & planning</h2>
            <p class="cw-section__desc">Avancement et dates prévisionnelles</p>
          </div>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label">État du chantier</label>
            <div class="tw-etat-picker" id="tw-etat-picker">
              ${Object.entries(ETAT_LABELS).map(([val, e]) => `
                <label class="tw-etat-option tw-etat-option--${e.badge} ${(chantier?.etat || 'en_cours') === val ? 'selected' : ''}" data-val="${val}">
                  <input type="radio" name="tw-etat" value="${val}" ${(chantier?.etat || 'en_cours') === val ? 'checked' : ''} hidden>
                  <i class="fa-solid ${e.icon}"></i>
                  <span>${e.label}</span>
                </label>`).join('')}
            </div>
            <input type="hidden" id="tw-etat" value="${chantier?.etat || 'en_cours'}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div class="cw-field">
              <label class="cw-field__label" for="tw-date-debut">Date de début</label>
              <input type="date" class="cw-field__input" id="tw-date-debut" value="${esc((chantier?.date_debut || '').slice(0, 10))}">
            </div>
            <div class="cw-field">
              <label class="cw-field__label" for="tw-date-fin">Date de fin</label>
              <input type="date" class="cw-field__input" id="tw-date-fin" value="${esc((chantier?.date_fin || '').slice(0, 10))}">
            </div>
          </div>
        </div>
      </section>

      <!-- 3 · LOCALISATION -->
      <section class="cw-section" id="tw-sect-location">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-map-location-dot"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Localisation sur la carte</h2>
            <p class="cw-section__desc">Dessinez l'emprise ou importez un fichier GeoJSON</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">
          ${hasExistingGeo ? `
            <div class="cw-notice cw-notice--success">
              <i class="fa-solid fa-check-circle"></i>
              <div><strong>GeoJSON existant</strong>
              <span>— <a href="${esc(chantier.geojson_url)}" target="_blank" rel="noopener">voir le tracé actuel</a>. Dessinez ou importez pour le remplacer.</span></div>
            </div>` : ''}

          <div class="cw-loc-toggle">
            <button type="button" class="cw-loc-toggle__btn active" data-mode="draw">
              <i class="fa-solid fa-pencil"></i> Dessiner sur la carte
            </button>
            <button type="button" class="cw-loc-toggle__btn" data-mode="file">
              <i class="fa-solid fa-file-import"></i> Importer un fichier
            </button>
          </div>

          <!-- Draw mode -->
          <div id="tw-loc-draw">
            <div class="cw-map-wrap">
              <div id="tw-map"></div>
              <div class="cw-map-instructions" id="tw-map-instructions">
                <i class="fa-solid fa-hand-pointer"></i>
                <span>Sélectionnez un outil ci-dessous, puis cliquez sur la carte</span>
              </div>
            </div>
            <div id="tw-draw-toolbar"></div>
          </div>

          <!-- File mode -->
          <div id="tw-loc-file" hidden>
            <div class="cw-drop-area" id="tw-geojson-drop">
              <div class="cw-drop-area__illustration"><i class="fa-solid fa-file-arrow-up"></i></div>
              <div class="cw-drop-area__text">
                <span class="cw-drop-area__title">Déposez votre fichier GeoJSON</span>
                <span class="cw-drop-area__hint">ou <u>cliquez pour parcourir</u> — .geojson, .json</span>
              </div>
            </div>
            <input type="file" id="tw-geojson-file" accept=".geojson,.json" hidden>
            <div class="cw-file-result" id="tw-geojson-result" hidden>
              <div class="cw-file-result__info">
                <div class="cw-file-result__icon"><i class="fa-solid fa-file-code"></i></div>
                <div>
                  <div class="cw-file-result__name" id="tw-geojson-name"></div>
                  <div class="cw-file-result__meta" id="tw-geojson-meta"></div>
                </div>
              </div>
              <button type="button" class="cw-file-result__remove" id="tw-geojson-remove" title="Supprimer">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 4 · AFFICHAGE -->
      <section class="cw-section" id="tw-sect-display">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-palette"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Affichage</h2>
            <p class="cw-section__desc">Personnalisez l'icône du chantier sur la carte</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>
        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label">Icône du chantier sur la carte</label>
            ${renderIconField('tw-icon', chantier?.icon || DEFAULT_ICON, DEFAULT_ICON)}
          </div>
        </div>
      </section>

    </div><!-- /cw-sections -->

    <!-- ── FOOTER ── -->
    <div class="cw-footer">
      <a href="/admin/travaux/" class="cw-footer__cancel" data-section="travaux">
        <i class="fa-solid fa-arrow-left"></i> Retour
      </a>
      <button type="button" class="cw-footer__submit" id="tw-submit">
        <span>${isEdit ? 'Enregistrer les modifications' : 'Créer le chantier'}</span>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  `;

  _bindTwForm(container, chantier);
  setTimeout(() => _initTwMap(container), 200);
}

/* ── Form bindings ── */
function _bindTwForm(container, existingChantier) {
  // Name validation
  const nameInput = container.querySelector('#tw-name');
  nameInput?.addEventListener('input', () => {
    nameInput.classList.toggle('cw-field__input--valid', nameInput.value.trim().length > 0);
  });
  if (nameInput?.value.trim()) nameInput.classList.add('cw-field__input--valid');

  // État picker
  container.querySelectorAll('.tw-etat-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.tw-etat-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      container.querySelector('#tw-etat').value = opt.dataset.val;
    });
  });

  // Icon picker
  bindIconField(container, 'tw-icon', { category: 'travaux' });

  // Location mode toggle
  container.querySelectorAll('.cw-loc-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      _tw.locationMode = mode;
      container.querySelectorAll('.cw-loc-toggle__btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      container.querySelector('#tw-loc-draw').hidden = (mode !== 'draw');
      container.querySelector('#tw-loc-file').hidden = (mode !== 'file');
      if (mode === 'draw' && !_tw._map) setTimeout(() => _initTwMap(container), 50);
    });
  });

  _bindTwFileUpload(container);

  // Submit
  container.querySelector('#tw-submit')?.addEventListener('click', () => _submitTwForm(container, existingChantier));
}

/* ── GeoJSON file upload ── */
function _bindTwFileUpload(container) {
  const dropzone = container.querySelector('#tw-geojson-drop');
  const fileInput = container.querySelector('#tw-geojson-file');

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) _handleTwGeojsonFile(container, e.dataTransfer.files[0]);
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) _handleTwGeojsonFile(container, fileInput.files[0]);
  });

  container.querySelector('#tw-geojson-remove')?.addEventListener('click', () => {
    _tw.geojsonFile = null;
    const result = container.querySelector('#tw-geojson-result');
    if (result) result.hidden = true;
    if (dropzone) dropzone.hidden = false;
  });
}

function _handleTwGeojsonFile(container, file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.geojson') && !name.endsWith('.json')) {
    toast('Le fichier doit être un GeoJSON (.geojson ou .json)', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      let count = 0;
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) count = parsed.features.length;
      else if (parsed.type === 'Feature') count = 1;

      _tw.geojsonFile = file;
      const dropzone = container.querySelector('#tw-geojson-drop');
      const result = container.querySelector('#tw-geojson-result');
      if (dropzone) dropzone.hidden = true;
      if (result) {
        result.hidden = false;
        const nameEl = result.querySelector('#tw-geojson-name');
        const metaEl = result.querySelector('#tw-geojson-meta');
        if (nameEl) nameEl.textContent = file.name;
        if (metaEl) metaEl.textContent = count > 0 ? `${count} feature${count > 1 ? 's' : ''} détectée${count > 1 ? 's' : ''}` : '';
      }
    } catch (_) { toast('Fichier GeoJSON invalide', 'error'); }
  };
  reader.readAsText(file);
}

/* ── Form submit ── */
async function _submitTwForm(container, existingChantier) {
  const name = container.querySelector('#tw-name')?.value?.trim();
  if (!name) {
    toast('Le nom du chantier est obligatoire', 'error');
    container.querySelector('#tw-name')?.focus();
    container.querySelector('#tw-sect-identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    container.querySelector('#tw-name')?.classList.add('cw-field__input--error');
    return;
  }

  const submitBtn = container.querySelector('#tw-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…'; }

  const data = {
    name,
    nature: container.querySelector('#tw-nature')?.value?.trim() || '',
    etat: container.querySelector('#tw-etat')?.value || 'en_cours',
    icon: container.querySelector('#tw-icon')?.value?.trim() || DEFAULT_ICON,
    date_debut: container.querySelector('#tw-date-debut')?.value || null,
    date_fin: container.querySelector('#tw-date-fin')?.value || null,
    localisation: container.querySelector('#tw-localisation')?.value?.trim() || '',
    description: container.querySelector('#tw-description')?.value?.trim() || '',
  };

  try {
    // Upload drawn GeoJSON or file
    if (_tw.drawnGeoJSON) {
      const url = await api.uploadTravauxGeoJSON(_tw.drawnGeoJSON);
      data.geojson_url = url;
    } else if (_tw.geojsonFile) {
      const text = await _tw.geojsonFile.text();
      const geojson = JSON.parse(text);
      const url = await api.uploadTravauxGeoJSON(geojson);
      data.geojson_url = url;
    }

    if (existingChantier) {
      await api.updateTravaux(existingChantier.id, data);
      toast('Chantier mis à jour', 'success');
    } else {
      data.approved = store.isAdmin;
      await api.createTravaux(data);
      toast(store.isAdmin ? 'Chantier créé' : 'Proposition envoyée — en attente de validation', 'success');
    }
    router.navigate('/admin/travaux/');
  } catch (err) {
    toast(err.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<span>${existingChantier ? 'Enregistrer les modifications' : 'Créer le chantier'}</span> <i class="fa-solid fa-arrow-right"></i>`; }
  }
}

/* ── Map drawing ── */

function _initTwMap(body) {
  const el = body.querySelector('#tw-map');
  if (!el || _tw._map) return;
  if (typeof maplibregl === 'undefined') { toast('MapLibre non chargé', 'error'); return; }

  const b = _tw.branding || {};
  const center = [parseFloat(b.center_lng) || 4.835, parseFloat(b.center_lat) || 45.764];
  const zoom = parseFloat(b.zoom) || 12;

  const map = new maplibregl.Map({
    container: el,
    style: {
      version: 8,
      sources: { 'osm-raster': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
      layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    },
    center, zoom, attributionControl: false, scrollZoom: false,
  });

  // Click-to-unlock scroll zoom
  const mapEl = map.getContainer();
  const lock = document.createElement('div');
  lock.className = 'cw-map-lock';
  lock.innerHTML = '<button class="cw-map-lock__btn" type="button"><i class="fa-solid fa-hand-pointer"></i> Cliquer pour activer le zoom</button>';
  mapEl.appendChild(lock);
  lock.addEventListener('click', () => { map.scrollZoom.enable(); lock.remove(); }, { once: true });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  _tw._map = map;

  map.on('load', () => {
    map.addSource('draw-features', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'draw-fills', type: 'fill', source: 'draw-features', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#4E2BFF', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'draw-lines', type: 'line', source: 'draw-features', filter: ['in', '$type', 'LineString', 'Polygon'], paint: { 'line-color': '#4E2BFF', 'line-width': 3 } });
    map.addLayer({ id: 'draw-points', type: 'circle', source: 'draw-features', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#4E2BFF', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addSource('draw-active', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'draw-active-line', type: 'line', source: 'draw-active', paint: { 'line-color': '#FF6B35', 'line-width': 2, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'draw-active-pts', type: 'circle', source: 'draw-active', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#FF6B35', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    if (_tw._drawFeatures.length > 0) _updateTwDrawSource();
    _renderTwDrawPanel(body);
  });

  map.on('click', (e) => _handleTwMapClick(body, e));
  map.on('dblclick', (e) => {
    if (_tw._drawMode === 'line' || _tw._drawMode === 'polygon') { e.preventDefault(); _finishTwDrawing(body); }
  });
}

function _handleTwMapClick(body, e) {
  if (!_tw._drawMode) return;
  const { lng, lat } = e.lngLat;
  if (_tw._drawMode === 'marker') {
    _tw._drawFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} });
    _tw._drawMode = null;
    _setTwMapCursor('');
    _updateTwDrawSource();
    _renderTwDrawPanel(body);
    return;
  }
  _tw._drawPoints.push([lng, lat]);
  _updateTwActiveDrawLine();
  _renderTwDrawPanel(body);
}

function _updateTwActiveDrawLine() {
  const map = _tw._map;
  if (!map?.getSource('draw-active')) return;
  const pts = _tw._drawPoints;
  const features = pts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
  if (pts.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} });
  map.getSource('draw-active').setData({ type: 'FeatureCollection', features });
}

function _finishTwDrawing(body) {
  const pts = _tw._drawPoints, mode = _tw._drawMode;
  if (mode === 'line' && pts.length >= 2) {
    _tw._drawFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [...pts] }, properties: {} });
  } else if (mode === 'polygon' && pts.length >= 3) {
    _tw._drawFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] }, properties: {} });
  }
  _tw._drawPoints = [];
  if (_tw._map?.getSource('draw-active')) _tw._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
  _tw._drawMode = null;
  _setTwMapCursor('');
  _updateTwDrawSource();
  _renderTwDrawPanel(body);
}

function _updateTwDrawSource() {
  const map = _tw._map;
  if (!map?.getSource('draw-features')) return;
  const fc = { type: 'FeatureCollection', features: _tw._drawFeatures };
  map.getSource('draw-features').setData(fc);
  _tw.drawnGeoJSON = _tw._drawFeatures.length > 0 ? fc : null;
}

function _setTwMapCursor(cursor) {
  if (_tw._map) _tw._map.getCanvas().style.cursor = cursor;
}

const TW_DRAW_TOOLS = {
  marker:  { icon: 'fa-solid fa-map-pin',     label: 'Point',  color: '#6366f1' },
  line:    { icon: 'fa-solid fa-route',        label: 'Ligne',  color: '#0ea5e9' },
  polygon: { icon: 'fa-solid fa-draw-polygon', label: 'Zone',   color: '#10b981' },
};

function _renderTwDrawPanel(body, opts) {
  const panel = body.querySelector('#tw-draw-toolbar');
  if (!panel) return;
  const mode = _tw._drawMode, pts = _tw._drawPoints.length, feats = _tw._drawFeatures.length, fp = opts?.forcePicker;

  if (!mode || fp) {
    if (feats === 0 || fp) {
      panel.innerHTML = `<div class="cw-dtb cw-dtb--picker">
        <span class="cw-dtb__label">Outil de dessin</span>
        <div class="cw-dtb__tools">${Object.entries(TW_DRAW_TOOLS).map(([k, t]) =>
          `<button class="cw-dtb__tool" data-tool="${k}" style="--tc:${t.color};"><i class="${t.icon}"></i><span>${t.label}</span></button>`).join('')}
        </div>${fp && feats > 0 ? `<span class="cw-dtb__aside">${feats} élément${feats > 1 ? 's' : ''} existant${feats > 1 ? 's' : ''}</span>` : ''}
      </div>`;
    } else {
      const nPts = _tw._drawFeatures.filter(f => f.geometry.type === 'Point').length;
      const nLns = _tw._drawFeatures.filter(f => f.geometry.type === 'LineString').length;
      const nPoly = _tw._drawFeatures.filter(f => f.geometry.type === 'Polygon').length;
      const badges = [];
      if (nPts)  badges.push(`<span class="cw-feat-badge"><i class="fa-solid fa-map-pin"></i> ${nPts} point${nPts > 1 ? 's' : ''}</span>`);
      if (nLns)  badges.push(`<span class="cw-feat-badge"><i class="fa-solid fa-route"></i> ${nLns} ligne${nLns > 1 ? 's' : ''}</span>`);
      if (nPoly) badges.push(`<span class="cw-feat-badge"><i class="fa-solid fa-draw-polygon"></i> ${nPoly} zone${nPoly > 1 ? 's' : ''}</span>`);
      panel.innerHTML = `<div class="cw-dtb cw-dtb--done">
        <i class="fa-solid fa-circle-check cw-dtb__done-ico"></i>
        <span class="cw-dtb__done-label">Tracé enregistré</span>
        <div class="cw-dtb__badges">${badges.join('')}</div>
        <div class="cw-dtb__actions">
          <button class="cw-dtb__btn" id="tw-draw-add-more"><i class="fa-solid fa-plus"></i> Ajouter</button>
          <button class="cw-dtb__icon-btn" id="tw-draw-undo-feat" title="Annuler le dernier"><i class="fa-solid fa-rotate-left"></i></button>
          <button class="cw-dtb__icon-btn cw-dtb__icon-btn--danger" id="tw-draw-clear-all" title="Tout effacer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }
  } else {
    const t = TW_DRAW_TOOLS[mode], minPts = mode === 'polygon' ? 3 : 2, canFinish = mode !== 'marker' && pts >= minPts;
    const statusMsg = mode === 'marker' ? 'Cliquez sur la carte pour poser le point'
      : pts === 0 ? 'Cliquez sur la carte pour commencer'
      : canFinish ? `<strong>${pts}</strong> points — double-clic ou cliquez Terminer`
      : `<strong>${pts}\u202f/\u202f${minPts}</strong> points minimum`;
    panel.innerHTML = `<div class="cw-dtb cw-dtb--active">
      <button class="cw-dtb__back" id="tw-draw-cancel-tool" title="Changer d'outil"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="cw-dtb__active-tool" style="--tc:${t.color};"><i class="${t.icon}"></i><strong>${t.label}</strong></div>
      <div class="cw-dtb__sep"></div>
      <div class="cw-dtb__status"><span class="cw-dtb__pulse"></span><span>${statusMsg}</span></div>
      <div class="cw-dtb__actions">
        ${pts > 0 && mode !== 'marker' ? `<button class="cw-dtb__btn cw-dtb__btn--ghost" id="tw-draw-undo-pt"><i class="fa-solid fa-rotate-left"></i> Annuler</button>` : ''}
        ${canFinish ? `<button class="cw-dtb__btn cw-dtb__btn--primary" id="tw-draw-finish-btn"><i class="fa-solid fa-check"></i> Terminer</button>` : ''}
      </div>
    </div>`;
  }

  // Bind draw panel interactions
  panel.querySelectorAll('.cw-dtb__tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_tw._drawPoints.length > 0) _finishTwDrawing(body);
      _tw._drawMode = btn.dataset.tool;
      _setTwMapCursor('crosshair');
      _renderTwDrawPanel(body);
    });
  });
  panel.querySelector('#tw-draw-add-more')?.addEventListener('click', () => _renderTwDrawPanel(body, { forcePicker: true }));
  panel.querySelector('#tw-draw-undo-feat')?.addEventListener('click', () => {
    if (_tw._drawFeatures.length > 0) { _tw._drawFeatures.pop(); _updateTwDrawSource(); _renderTwDrawPanel(body); }
  });
  panel.querySelector('#tw-draw-clear-all')?.addEventListener('click', () => {
    _tw._drawFeatures = []; _tw._drawPoints = [];
    if (_tw._map?.getSource('draw-active')) _tw._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
    _updateTwDrawSource(); _renderTwDrawPanel(body);
  });
  panel.querySelector('#tw-draw-cancel-tool')?.addEventListener('click', () => {
    _tw._drawMode = null; _tw._drawPoints = [];
    if (_tw._map?.getSource('draw-active')) _tw._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
    _setTwMapCursor(''); _renderTwDrawPanel(body);
  });
  panel.querySelector('#tw-draw-undo-pt')?.addEventListener('click', () => {
    if (_tw._drawPoints.length > 0) { _tw._drawPoints.pop(); _updateTwActiveDrawLine(); _renderTwDrawPanel(body); }
  });
  panel.querySelector('#tw-draw-finish-btn')?.addEventListener('click', () => _finishTwDrawing(body));
}

/* ── Detail (edit) loader ── */

async function _openChantierDetail(container, id) {
  container.innerHTML = skeletonTable(3);
  try {
    const chantier = await api.getTravauxItem(id);
    if (!chantier) { toast('Chantier introuvable', 'error'); router.navigate('/admin/travaux/'); return; }
    _renderCreateForm(container, chantier);
  } catch (e) {
    toast('Erreur de chargement', 'error');
    router.navigate('/admin/travaux/');
  }
}

/* ── Travaux config ── */

async function _renderConfig(container) {
  container.innerHTML = `
    <div class="cw-header">
      <div class="cw-header__top">
        <a href="/admin/travaux/" class="cw-back-link" data-section="travaux">
          <i class="fa-solid fa-arrow-left"></i><span>Travaux</span>
        </a>
      </div>
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title">Configuration du module</h1>
          <p class="cw-header__subtitle">Module travaux · <strong>${esc(store.city)}</strong></p>
        </div>
      </div>
    </div>
    <div id="tw-config-body">
      <div class="cw-sections">${skeletonTable(3)}</div>
    </div>
  `;

  try {
    const [config, layers] = await Promise.all([api.getTravauxConfig(), api.getLayers()]);
    const cfg = config || {};
    const isUrl = cfg.source_type === 'url';

    const configBody = container.querySelector('#tw-config-body');
    configBody.innerHTML = `
      <form id="tw-config-form">
        <div class="cw-sections">

          <!-- § 1 — ACTIVATION -->
          <section class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-power-off"></i></div>
              <div class="cw-section__titles">
                <h2 class="cw-section__title">Activation</h2>
                <p class="cw-section__desc">Rend le filtre Travaux visible sur la carte publique de ${esc(store.city)}.</p>
              </div>
            </div>
            <div class="cw-section__body">
              <div class="twc-toggle-row">
                <div class="twc-toggle-row__text">
                  <div class="twc-toggle-row__title">Module travaux</div>
                  <div class="twc-toggle-row__status ${cfg.enabled ? 'twc-toggle-row__status--on' : 'twc-toggle-row__status--off'}">
                    <i class="fa-solid fa-circle-dot"></i>
                    ${cfg.enabled ? 'Visible sur la carte publique' : 'Masqué sur la carte publique'}
                  </div>
                </div>
                <label class="adm-switch adm-switch--lg">
                  <input type="checkbox" id="twc-enabled" ${cfg.enabled ? 'checked' : ''}>
                  <span class="adm-switch__track"></span>
                </label>
              </div>
            </div>
          </section>

          <!-- § 2 — SOURCE -->
          <section class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-database"></i></div>
              <div class="cw-section__titles">
                <h2 class="cw-section__title">Source des données</h2>
                <p class="cw-section__desc">D'où viennent les chantiers — saisis manuellement ici, ou importés depuis un flux GeoJSON externe.</p>
              </div>
            </div>
            <div class="cw-section__body">
              <div class="tw-source-picker" id="twc-source-picker">
                <label class="tw-source-option ${!isUrl ? 'selected' : ''}" data-val="city_travaux">
                  <input type="radio" name="twc-source" value="city_travaux" ${!isUrl ? 'checked' : ''} hidden>
                  <i class="fa-solid fa-database"></i>
                  <div>
                    <div class="tw-source-option__title">Base interne</div>
                    <div class="tw-source-option__desc">Créez et gérez vos chantiers ici</div>
                  </div>
                </label>
                <label class="tw-source-option ${isUrl ? 'selected' : ''}" data-val="url">
                  <input type="radio" name="twc-source" value="url" ${isUrl ? 'checked' : ''} hidden>
                  <i class="fa-solid fa-link"></i>
                  <div>
                    <div class="tw-source-option__title">Flux externe (open data)</div>
                    <div class="tw-source-option__desc">Import via une URL GeoJSON</div>
                  </div>
                </label>
              </div>
              <input type="hidden" id="twc-source-type" value="${isUrl ? 'url' : 'city_travaux'}">

              <div id="twc-url-group" ${!isUrl ? 'hidden' : ''}>
                <div class="cw-field" style="margin-top:16px;">
                  <label class="cw-field__label" for="twc-url">URL du flux GeoJSON</label>
                  <input type="url" class="cw-field__input" id="twc-url"
                    value="${esc(cfg.url || '')}" placeholder="https://data.example.fr/travaux.geojson">
                </div>
                <div class="twc-url-notice">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>La création manuelle de chantiers sera désactivée. Les entrées existantes restent conservées.</span>
                </div>
              </div>
            </div>
          </section>

          <!-- § 3 — APPARENCE -->
          <section class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-palette"></i></div>
              <div class="cw-section__titles">
                <h2 class="cw-section__title">Apparence</h2>
                <p class="cw-section__desc">Icône par défaut pour les chantiers sans icône personnalisée.</p>
              </div>
            </div>
            <div class="cw-section__body">
              <div class="cw-field">
                <label class="cw-field__label">Icône par défaut des chantiers</label>
                ${renderIconField('twc-icon', cfg.icon_class || DEFAULT_ICON, DEFAULT_ICON)}
              </div>
            </div>
          </section>

          <!-- § 4 — COUCHES ASSOCIÉES -->
          <section class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-layer-group"></i></div>
              <div class="cw-section__titles">
                <h2 class="cw-section__title">Couches associées</h2>
                <p class="cw-section__desc">Affichées automatiquement quand le filtre Travaux est actif — utile pour contextualiser les déviations ou périmètres de chantier.</p>
              </div>
            </div>
            <div class="cw-section__body">
              ${layers.length === 0
                ? `<p class="twc-empty-layers"><i class="fa-solid fa-layer-group"></i> Aucune couche disponible — créez-en dans la section <strong>Couches</strong> de l'admin.</p>`
                : `<div id="twc-layers" class="adm-toggle-grid">
                  ${layers.map(l => {
                    const active = Array.isArray(cfg.layers_to_display) && cfg.layers_to_display.includes(l.name);
                    return `<div class="adm-toggle-item ${active ? 'active' : ''}" data-layer="${esc(l.name)}">
                      <i class="${esc(l.icon || 'fa-solid fa-layer-group')}"></i>
                      <span>${esc(l.name)}</span>
                    </div>`;
                  }).join('')}
                </div>`
              }
            </div>
          </section>

        </div>

        <div class="cw-footer">
          <a href="/admin/travaux/" class="cw-footer__cancel" data-section="travaux">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </a>
          <button type="submit" class="cw-footer__submit">
            <span>Sauvegarder la configuration</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </form>
    `;

    // Toggle status label live
    const enabledCb = configBody.querySelector('#twc-enabled');
    const statusEl = configBody.querySelector('.twc-toggle-row__status');
    enabledCb?.addEventListener('change', () => {
      const on = enabledCb.checked;
      statusEl.className = `twc-toggle-row__status ${on ? 'twc-toggle-row__status--on' : 'twc-toggle-row__status--off'}`;
      statusEl.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${on ? 'Visible sur la carte publique' : 'Masqué sur la carte publique'}`;
    });

    // Source picker
    configBody.querySelectorAll('.tw-source-option').forEach(opt => {
      opt.addEventListener('click', () => {
        configBody.querySelectorAll('.tw-source-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        const val = opt.dataset.val;
        configBody.querySelector('#twc-source-type').value = val;
        configBody.querySelector('#twc-url-group').hidden = val !== 'url';
      });
    });

    // Couches toggle
    configBody.querySelectorAll('#twc-layers .adm-toggle-item').forEach(item => {
      item.addEventListener('click', () => item.classList.toggle('active'));
    });

    // Icon picker
    bindIconField(configBody, 'twc-icon', { category: 'travaux' });

    // Submit
    configBody.querySelector('#tw-config-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;

      const selectedLayers = Array.from(configBody.querySelectorAll('#twc-layers .adm-toggle-item.active'))
        .map(el => el.dataset.layer);

      try {
        await api.updateTravauxConfig({
          enabled: configBody.querySelector('#twc-enabled').checked,
          source_type: configBody.querySelector('#twc-source-type').value,
          url: configBody.querySelector('#twc-url')?.value.trim() || null,
          icon_class: configBody.querySelector('#twc-icon').value.trim() || DEFAULT_ICON,
          layers_to_display: selectedLayers.length > 0 ? selectedLayers : null,
        });
        toast('Configuration sauvegardée', 'success');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  } catch (e) {
    console.error('[admin/travaux/config]', e);
    container.querySelector('#tw-config-body').innerHTML = `<div style="color:var(--danger);padding:20px;">Erreur : ${esc(e.message)}</div>`;
  }
}
