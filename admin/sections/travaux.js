/* ============================================================================
   TRAVAUX SECTION — List chantiers, approve, create/edit inline, config
   ============================================================================ */

import { store } from '../store.js';
import { router } from '../router.js';
import * as api from '../api.js';
import { toast, confirm, slidePanel, esc, formatDate, skeletonTable, emptyState } from '../components/ui.js';

const ETAT_LABELS = {
  en_cours: { label: 'En cours', badge: 'success', icon: 'fa-hammer' },
  prevu:    { label: 'Prévu',    badge: 'info',    icon: 'fa-calendar' },
  termine:  { label: 'Terminé', badge: 'neutral',  icon: 'fa-check' },
  a_venir:  { label: 'À venir', badge: 'warning',  icon: 'fa-clock' },
};

const DEFAULT_ICON = 'fa-solid fa-helmet-safety';

export async function renderTravaux(container, params) {
  if (params.id === 'nouveau') return _renderCreateForm(container);
  if (params.id && params.id !== 'config') return _openChantierDetail(container, parseInt(params.id, 10));
  if (params.id === 'config') return _renderConfig(container);
  _renderListPage(container);
  await _loadList(container);
}

/* ── List page ── */

function _renderListPage(container) {
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
        <a href="/admin/travaux/nouveau/" class="adm-btn adm-btn--primary" data-section="travaux">
          <i class="fa-solid fa-plus"></i> Nouveau chantier
        </a>
      </div>
    </div>

    <!-- Quick stats -->
    <div class="tw-stats" id="travaux-stats"></div>

    <!-- Tabs -->
    <div class="adm-tabs" id="travaux-tabs">
      <button class="adm-tab active" data-filter="">Tous</button>
      <button class="adm-tab" data-filter="en_cours"><i class="fa-solid fa-hammer"></i> En cours</button>
      <button class="adm-tab" data-filter="prevu"><i class="fa-solid fa-calendar"></i> Prévus</button>
      <button class="adm-tab" data-filter="termine"><i class="fa-solid fa-check"></i> Terminés</button>
      <button class="adm-tab" data-filter="pending"><i class="fa-solid fa-clock"></i> En attente</button>
    </div>

    <div class="adm-card">
      <div id="travaux-list-body" style="padding:0;">
        ${skeletonTable(5)}
      </div>
    </div>
  `;

  let activeFilter = '';
  container.querySelectorAll('#travaux-tabs .adm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeFilter = tab.dataset.filter;
      container.querySelectorAll('#travaux-tabs .adm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _filterAndRender(container, activeFilter);
    });
  });
}

let _allTravaux = [];

async function _loadList(container) {
  const listBody = container.querySelector('#travaux-list-body');
  if (!listBody) return;

  try {
    _allTravaux = await api.getTravaux({ adminMode: true });
    _renderStats(container);
    _filterAndRender(container, '');
  } catch (e) {
    console.error('[admin/travaux]', e);
    listBody.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _renderStats(container) {
  const stats = container.querySelector('#travaux-stats');
  if (!stats) return;
  const counts = { en_cours: 0, prevu: 0, termine: 0, pending: 0 };
  _allTravaux.forEach(i => {
    if (!i.approved) counts.pending++;
    else if (counts[i.etat] !== undefined) counts[i.etat]++;
  });
  stats.innerHTML = [
    { key: 'en_cours', icon: 'fa-hammer',   color: 'success', label: 'En cours' },
    { key: 'prevu',    icon: 'fa-calendar', color: 'info',    label: 'Prévus' },
    { key: 'termine',  icon: 'fa-check',    color: 'neutral', label: 'Terminés' },
    { key: 'pending',  icon: 'fa-clock',    color: 'warning', label: 'En attente' },
  ].map(s => `
    <div class="tw-stat tw-stat--${s.color}">
      <i class="fa-solid ${s.icon}"></i>
      <span class="tw-stat__count">${counts[s.key]}</span>
      <span class="tw-stat__label">${s.label}</span>
    </div>
  `).join('');
}

function _filterAndRender(container, filter) {
  const listBody = container.querySelector('#travaux-list-body');
  if (!listBody) return;

  let items = _allTravaux;
  if (filter === 'pending') items = items.filter(i => !i.approved);
  else if (filter) items = items.filter(i => i.etat === filter && i.approved);

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

async function _renderCreateForm(container, chantier = null) {
  const isEdit = chantier != null;
  const title = isEdit ? `Modifier : ${esc(chantier.name || 'Chantier')}` : 'Nouveau chantier';

  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title">
          <a href="/admin/travaux/" class="adm-btn adm-btn--ghost adm-btn--icon" data-section="travaux" style="margin-right:4px;">
            <i class="fa-solid fa-arrow-left"></i>
          </a>
          ${title}
        </h1>
        <p class="adm-page-subtitle">${isEdit ? 'Modifier les informations de ce chantier' : 'Renseignez les informations du nouveau chantier'}</p>
      </div>
    </div>

    <form id="travaux-form">
      <div class="tw-form-grid">

        <!-- LEFT COLUMN -->
        <div class="tw-form-col">

          <!-- Section : Identité -->
          <div class="adm-card">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-tag"></i> Identité du chantier</h3>
            </div>
            <div class="adm-card__body">
              <div class="adm-form-group">
                <label class="adm-label" for="tw-name">Nom du chantier <span class="adm-required">*</span></label>
                <input type="text" class="adm-input" id="tw-name" required
                  value="${esc(chantier?.name || '')}" placeholder="Ex : Réfection de la chaussée">
              </div>
              <div class="adm-form-group">
                <label class="adm-label" for="tw-nature">Nature des travaux</label>
                <input type="text" class="adm-input" id="tw-nature"
                  value="${esc(chantier?.nature || '')}" placeholder="Ex : Voirie, Réseaux, Bâtiment…">
              </div>
              <div class="adm-form-group">
                <label class="adm-label" for="tw-localisation">Localisation</label>
                <input type="text" class="adm-input" id="tw-localisation"
                  value="${esc(chantier?.localisation || '')}" placeholder="Ex : Avenue Jean Jaurès">
              </div>
            </div>
          </div>

          <!-- Section : Description -->
          <div class="adm-card" style="margin-top:16px;">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-align-left"></i> Description</h3>
            </div>
            <div class="adm-card__body">
              <div class="adm-form-group" style="margin:0;">
                <textarea class="adm-textarea" id="tw-description" rows="5"
                  placeholder="Décrivez les travaux, leur impact sur la circulation, les mesures prises…">${esc(chantier?.description || '')}</textarea>
              </div>
            </div>
          </div>

        </div>

        <!-- RIGHT COLUMN -->
        <div class="tw-form-col">

          <!-- Section : État & planning -->
          <div class="adm-card">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-calendar-days"></i> État & planning</h3>
            </div>
            <div class="adm-card__body">
              <!-- État selector -->
              <div class="adm-form-group">
                <label class="adm-label">État du chantier</label>
                <div class="tw-etat-picker" id="tw-etat-picker">
                  ${Object.entries(ETAT_LABELS).map(([val, e]) => `
                    <label class="tw-etat-option tw-etat-option--${e.badge} ${(chantier?.etat || 'en_cours') === val ? 'selected' : ''}" data-val="${val}">
                      <input type="radio" name="tw-etat" value="${val}" ${(chantier?.etat || 'en_cours') === val ? 'checked' : ''} hidden>
                      <i class="fa-solid ${e.icon}"></i>
                      <span>${e.label}</span>
                    </label>
                  `).join('')}
                </div>
                <input type="hidden" id="tw-etat" value="${chantier?.etat || 'en_cours'}">
              </div>
              <div class="adm-form-row">
                <div class="adm-form-group">
                  <label class="adm-label" for="tw-date-debut">Date de début</label>
                  <input type="date" class="adm-input" id="tw-date-debut" value="${esc((chantier?.date_debut || '').slice(0, 10))}">
                </div>
                <div class="adm-form-group">
                  <label class="adm-label" for="tw-date-fin">Date de fin</label>
                  <input type="date" class="adm-input" id="tw-date-fin" value="${esc((chantier?.date_fin || '').slice(0, 10))}">
                </div>
              </div>
            </div>
          </div>

          <!-- Section : Affichage -->
          <div class="adm-card" style="margin-top:16px;">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-palette"></i> Affichage</h3>
            </div>
            <div class="adm-card__body">
              <div class="adm-form-group">
                <label class="adm-label" for="tw-icon">Icône <span style="font-weight:400;color:var(--text-muted);font-size:12px;">(classe Font Awesome)</span></label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <div class="tw-icon-preview" id="tw-icon-preview">
                    <i class="${esc(chantier?.icon || DEFAULT_ICON)}"></i>
                  </div>
                  <input type="text" class="adm-input" id="tw-icon"
                    value="${esc(chantier?.icon || DEFAULT_ICON)}" placeholder="fa-solid fa-helmet-safety">
                </div>
              </div>
            </div>
          </div>

          <!-- Section : Tracé GeoJSON -->
          <div class="adm-card" style="margin-top:16px;">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-map-location-dot"></i> Tracé GeoJSON</h3>
            </div>
            <div class="adm-card__body">
              ${chantier?.geojson_url ? `
                <div style="margin-bottom:12px;">
                  <a href="${esc(chantier.geojson_url)}" target="_blank" class="adm-btn adm-btn--secondary adm-btn--sm">
                    <i class="fa-solid fa-map"></i> Voir le GeoJSON actuel
                  </a>
                </div>` : ''}
              <div class="adm-dropzone" id="tw-geojson-drop">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <div class="adm-dropzone__text">Déposez un fichier GeoJSON ou cliquez</div>
                <div class="adm-dropzone__hint">.geojson · .json</div>
              </div>
              <input type="file" id="tw-geojson-file" accept=".geojson,.json" hidden>
              <div id="tw-geojson-name" style="margin-top:8px;font-size:13px;color:var(--primary);display:flex;align-items:center;gap:6px;" hidden>
                <i class="fa-solid fa-file-code"></i> <span id="tw-geojson-name-text"></span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Actions -->
      <div class="tw-form-actions">
        <a href="/admin/travaux/" class="adm-btn adm-btn--secondary" data-section="travaux">
          <i class="fa-solid fa-xmark"></i> Annuler
        </a>
        <button type="submit" class="adm-btn adm-btn--primary" id="tw-submit">
          <i class="fa-solid fa-check"></i> ${isEdit ? 'Enregistrer les modifications' : 'Créer le chantier'}
        </button>
      </div>
    </form>
  `;

  // État picker interaction
  container.querySelectorAll('.tw-etat-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.tw-etat-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      container.querySelector('#tw-etat').value = opt.dataset.val;
    });
  });

  // Icon preview live update
  container.querySelector('#tw-icon')?.addEventListener('input', (e) => {
    const preview = container.querySelector('#tw-icon-preview i');
    if (preview) preview.className = e.target.value.trim() || DEFAULT_ICON;
  });

  _bindGeoJSONUpload(container);
  _bindFormSubmit(container, chantier);
}

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

let _pendingGeojsonFile = null;

function _bindGeoJSONUpload(container) {
  const dropzone = container.querySelector('#tw-geojson-drop');
  const fileInput = container.querySelector('#tw-geojson-file');
  const nameDisplay = container.querySelector('#tw-geojson-name');
  _pendingGeojsonFile = null;

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) _setGeojsonFile(file, nameDisplay);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) _setGeojsonFile(fileInput.files[0], nameDisplay);
  });
}

function _setGeojsonFile(file, display) {
  _pendingGeojsonFile = file;
  if (display) {
    const nameEl = display.querySelector('#tw-geojson-name-text');
    if (nameEl) nameEl.textContent = file.name;
    display.hidden = false;
  }
}

function _bindFormSubmit(container, existingChantier) {
  const form = container.querySelector('#travaux-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = container.querySelector('#tw-submit');
    submitBtn.disabled = true;

    const data = {
      name: container.querySelector('#tw-name').value.trim(),
      nature: container.querySelector('#tw-nature').value.trim(),
      etat: container.querySelector('#tw-etat').value,
      icon: container.querySelector('#tw-icon').value.trim() || DEFAULT_ICON,
      date_debut: container.querySelector('#tw-date-debut').value || null,
      date_fin: container.querySelector('#tw-date-fin').value || null,
      localisation: container.querySelector('#tw-localisation').value.trim(),
      description: container.querySelector('#tw-description').value.trim(),
    };

    if (!data.name) {
      toast('Le nom du chantier est obligatoire', 'error');
      submitBtn.disabled = false;
      return;
    }

    try {
      // Upload GeoJSON if new file
      if (_pendingGeojsonFile) {
        const text = await _pendingGeojsonFile.text();
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
      submitBtn.disabled = false;
    }
  });
}

/* ── Travaux config ── */

async function _renderConfig(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title">
          <a href="/admin/travaux/" class="adm-btn adm-btn--ghost adm-btn--icon" data-section="travaux" style="margin-right:4px;">
            <i class="fa-solid fa-arrow-left"></i>
          </a>
          Configuration Travaux
        </h1>
        <p class="adm-page-subtitle">Paramètres du module travaux pour ${esc(store.city)}</p>
      </div>
    </div>
    <div id="tw-config-body">${skeletonTable(3)}</div>
  `;

  try {
    const [config, layers] = await Promise.all([api.getTravauxConfig(), api.getLayers()]);
    const cfg = config || {};

    const configBody = container.querySelector('#tw-config-body');
    configBody.innerHTML = `
      <form id="tw-config-form">
        <div class="tw-config-grid">

          <!-- Activation -->
          <div class="adm-card">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-power-off"></i> Activation</h3>
            </div>
            <div class="adm-card__body">
              <label class="adm-toggle-row">
                <div>
                  <div class="adm-toggle-row__title">Module travaux activé</div>
                  <div class="adm-toggle-row__desc">Affiche la section travaux sur la carte publique</div>
                </div>
                <label class="adm-switch">
                  <input type="checkbox" id="twc-enabled" ${cfg.enabled ? 'checked' : ''}>
                  <span class="adm-switch__track"></span>
                </label>
              </label>
            </div>
          </div>

          <!-- Source de données -->
          <div class="adm-card">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-database"></i> Source de données</h3>
            </div>
            <div class="adm-card__body">
              <div class="adm-form-group">
                <label class="adm-label">Type de source</label>
                <div class="tw-source-picker" id="twc-source-picker">
                  <label class="tw-source-option ${cfg.source_type !== 'url' ? 'selected' : ''}" data-val="city_travaux">
                    <input type="radio" name="twc-source" value="city_travaux" ${cfg.source_type !== 'url' ? 'checked' : ''} hidden>
                    <i class="fa-solid fa-database"></i>
                    <div>
                      <div class="tw-source-option__title">Base interne</div>
                      <div class="tw-source-option__desc">Chantiers gérés dans cet admin</div>
                    </div>
                  </label>
                  <label class="tw-source-option ${cfg.source_type === 'url' ? 'selected' : ''}" data-val="url">
                    <input type="radio" name="twc-source" value="url" ${cfg.source_type === 'url' ? 'checked' : ''} hidden>
                    <i class="fa-solid fa-link"></i>
                    <div>
                      <div class="tw-source-option__title">URL externe</div>
                      <div class="tw-source-option__desc">Flux GeoJSON tiers</div>
                    </div>
                  </label>
                </div>
                <input type="hidden" id="twc-source-type" value="${cfg.source_type !== 'url' ? 'city_travaux' : 'url'}">
              </div>
              <div id="twc-url-group" ${cfg.source_type !== 'url' ? 'hidden' : ''}>
                <div class="adm-form-group" style="margin:0;">
                  <label class="adm-label" for="twc-url">URL du flux GeoJSON</label>
                  <input type="url" class="adm-input" id="twc-url" value="${esc(cfg.url || '')}" placeholder="https://…/travaux.geojson">
                </div>
              </div>
            </div>
          </div>

          <!-- Personnalisation -->
          <div class="adm-card">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-palette"></i> Personnalisation</h3>
            </div>
            <div class="adm-card__body">
              <div class="adm-form-group" style="margin:0;">
                <label class="adm-label" for="twc-icon">Icône par défaut <span style="font-weight:400;color:var(--text-muted);font-size:12px;">(Font Awesome)</span></label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <div class="tw-icon-preview" id="twc-icon-preview">
                    <i class="${esc(cfg.icon_class || DEFAULT_ICON)}"></i>
                  </div>
                  <input type="text" class="adm-input" id="twc-icon" value="${esc(cfg.icon_class || DEFAULT_ICON)}" placeholder="fa-solid fa-helmet-safety">
                </div>
              </div>
            </div>
          </div>

          <!-- Couches associées -->
          <div class="adm-card">
            <div class="adm-card__header">
              <h3 class="adm-card__title"><i class="fa-solid fa-layer-group"></i> Couches associées</h3>
              <p class="adm-card__subtitle">Ces couches seront affichées automatiquement quand le filtre travaux est actif</p>
            </div>
            <div class="adm-card__body">
              ${layers.length === 0
                ? `<p style="color:var(--text-muted);font-size:13px;margin:0;">Aucune couche disponible</p>`
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
          </div>

        </div>

        <div class="tw-form-actions">
          <a href="/admin/travaux/" class="adm-btn adm-btn--secondary" data-section="travaux">
            <i class="fa-solid fa-xmark"></i> Retour
          </a>
          <button type="submit" class="adm-btn adm-btn--primary">
            <i class="fa-solid fa-check"></i> Sauvegarder la configuration
          </button>
        </div>
      </form>
    `;

    // Couches toggle
    configBody.querySelectorAll('#twc-layers .adm-toggle-item').forEach(item => {
      item.addEventListener('click', () => item.classList.toggle('active'));
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

    // Icon preview
    configBody.querySelector('#twc-icon')?.addEventListener('input', (e) => {
      const preview = configBody.querySelector('#twc-icon-preview i');
      if (preview) preview.className = e.target.value.trim() || DEFAULT_ICON;
    });

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
          url: configBody.querySelector('#twc-url').value.trim() || null,
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
