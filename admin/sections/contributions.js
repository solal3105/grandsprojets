/* ============================================================================
   CONTRIBUTIONS SECTION — List, filter, approve, detail slide-panel
   ============================================================================ */

import { store } from '../store.js';
import { router } from '../router.js';
import * as api from '../api.js';
import { toast, confirm, slidePanel, esc, formatDate, formatRelativeDate, renderPagination, emptyState, skeletonTable } from '../components/ui.js';
import { updatePendingBadge } from '../components/sidebar.js';

const PAGE_SIZE = 20;

let _state = {
  search: '',
  category: '',
  status: '',     // '' | 'pending' | 'approved'
  sortBy: 'created_at',
  sortDir: 'desc',
  mineOnly: false,
  page: 1,
  items: [],
  total: 0,
};

export async function renderContributions(container, params) {
  // Sub-routes
  if (params.id === 'nouveau') return _renderCreateWizard(container);
  if (params.id === 'modifier' && params.sub) return _renderCreateWizard(container, parseInt(params.sub, 10));

  // Parse URL params
  const urlParams = new URLSearchParams(window.location.search);
  _state.status = urlParams.get('status') || '';
  _state.page = 1;

  // If we have an ID in the path, show detail
  if (params.id) {
    _renderList(container);
    await _loadList(container);
    await _openDetail(parseInt(params.id, 10));
    return;
  }

  _renderList(container);
  await _loadCategories(container);
  await _loadList(container);
}

function _renderList(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-pen-to-square"></i> Contributions</h1>
        <p class="adm-page-subtitle">Gérer les contributions de ${esc(store.city)}</p>
      </div>
      <div>
        <a href="/admin/contributions/nouveau/" class="adm-btn adm-btn--primary" data-section="contributions">
          <i class="fa-solid fa-plus"></i> Nouvelle contribution
        </a>
      </div>
    </div>

    <!-- Tabs: status filter -->
    <div class="adm-tabs" id="contrib-tabs">
      <button class="adm-tab ${_state.status === '' ? 'active' : ''}" data-status="">Toutes</button>
      <button class="adm-tab ${_state.status === 'pending' ? 'active' : ''}" data-status="pending">
        <i class="fa-solid fa-clock"></i> En attente
      </button>
      <button class="adm-tab ${_state.status === 'approved' ? 'active' : ''}" data-status="approved">
        <i class="fa-solid fa-check"></i> Approuvées
      </button>
    </div>

    <!-- Toolbar -->
    <div class="adm-toolbar">
      <div class="adm-toolbar__search">
        <input type="text" class="adm-input adm-input--search" id="contrib-search" placeholder="Rechercher une contribution…" value="${esc(_state.search)}">
      </div>
      <div class="adm-toolbar__filters">
        <select class="adm-select" id="contrib-filter-cat" style="min-width:160px;">
          <option value="">Toutes les catégories</option>
        </select>
        <select class="adm-select" id="contrib-sort" style="min-width:140px;">
          <option value="created_at:desc" ${_state.sortBy === 'created_at' && _state.sortDir === 'desc' ? 'selected' : ''}>Plus récent</option>
          <option value="created_at:asc" ${_state.sortBy === 'created_at' && _state.sortDir === 'asc' ? 'selected' : ''}>Plus ancien</option>
          <option value="project_name:asc" ${_state.sortBy === 'project_name' ? 'selected' : ''}>Nom A-Z</option>
        </select>
        ${!store.isAdmin ? `
        <label class="adm-checkbox-label">
          <input type="checkbox" id="contrib-mine-only" ${_state.mineOnly ? 'checked' : ''}>
          <span>Mes contributions</span>
        </label>` : ''}
      </div>
    </div>

    <!-- List -->
    <div class="adm-card">
      <div id="contrib-list-body" style="padding:0;">
        ${skeletonTable(5)}
      </div>
    </div>

    <!-- Pagination -->
    <div id="contrib-pagination"></div>
  `;

  _bindToolbar(container);
}

function _bindToolbar(container) {
  // Tabs
  container.querySelectorAll('#contrib-tabs .adm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _state.status = tab.dataset.status;
      _state.page = 1;
      container.querySelectorAll('#contrib-tabs .adm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _loadList(container);
    });
  });

  // Search (debounced)
  const searchInput = container.querySelector('#contrib-search');
  let searchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      _state.search = searchInput.value.trim();
      _state.page = 1;
      _loadList(container);
    }, 350);
  });

  // Category filter
  container.querySelector('#contrib-filter-cat')?.addEventListener('change', (e) => {
    _state.category = e.target.value;
    _state.page = 1;
    _loadList(container);
  });

  // Sort
  container.querySelector('#contrib-sort')?.addEventListener('change', (e) => {
    const [sortBy, sortDir] = e.target.value.split(':');
    _state.sortBy = sortBy;
    _state.sortDir = sortDir || 'desc';
    _state.page = 1;
    _loadList(container);
  });

  // Mine only
  container.querySelector('#contrib-mine-only')?.addEventListener('change', (e) => {
    _state.mineOnly = e.target.checked;
    _state.page = 1;
    _loadList(container);
  });
}

async function _loadCategories(container) {
  try {
    const cats = await api.getCategories();
    const select = container.querySelector('#contrib-filter-cat');
    if (!select) return;
    for (const cat of cats) {
      const opt = document.createElement('option');
      opt.value = cat.category;
      opt.textContent = cat.category;
      select.appendChild(opt);
    }
  } catch (_) {}
}

async function _loadList(container) {
  const listBody = container.querySelector('#contrib-list-body');
  const paginationEl = container.querySelector('#contrib-pagination');
  if (!listBody) return;

  listBody.innerHTML = skeletonTable(5);

  try {
    const result = await api.listContributions({
      search: _state.search,
      category: _state.category,
      page: _state.page,
      pageSize: PAGE_SIZE,
      mineOnly: _state.mineOnly,
      sortBy: _state.sortBy,
      sortDir: _state.sortDir,
    });

    // Apply status client-side filter (API doesn't have status param)
    let items = result.items;
    if (_state.status === 'pending') items = items.filter(i => !i.approved);
    if (_state.status === 'approved') items = items.filter(i => i.approved);

    _state.items = items;
    _state.total = result.count;

    if (items.length === 0) {
      listBody.innerHTML = '';
      listBody.appendChild(emptyState({
        icon: 'fa-solid fa-inbox',
        title: _state.status === 'pending' ? 'Aucune contribution en attente' : 'Aucune contribution',
        text: _state.search ? 'Essayez avec d\'autres termes de recherche' : null,
      }));
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    listBody.innerHTML = items.map(_renderItem).join('');

    // Pagination
    if (paginationEl) {
      paginationEl.innerHTML = '';
      paginationEl.appendChild(renderPagination({
        page: _state.page,
        pageSize: PAGE_SIZE,
        total: result.count,
        onPageChange(p) { _state.page = p; _loadList(container); },
      }));
    }

    // Bind actions
    _bindListActions(container, listBody);
  } catch (e) {
    console.error('[admin/contributions]', e);
    listBody.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _renderItem(item) {
  const statusBadge = item.approved
    ? '<span class="adm-badge adm-badge--success"><i class="fa-solid fa-check"></i> Approuvée</span>'
    : '<span class="adm-badge adm-badge--warning"><i class="fa-solid fa-clock"></i> En attente</span>';

  const coverHTML = item.cover_url
    ? `<img class="adm-list-item__cover" src="${esc(item.cover_url)}" alt="" loading="lazy">`
    : `<div class="adm-list-item__cover" style="display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:18px;"><i class="fa-solid fa-image"></i></div>`;

  return `
    <div class="adm-list-item" data-id="${item.id}">
      ${coverHTML}
      <div class="adm-list-item__info">
        <div class="adm-list-item__name">${esc(item.project_name)}</div>
        <div class="adm-list-item__meta">
          <span>${esc(item.category)}</span>
          <span>·</span>
          <span>${formatRelativeDate(item.created_at)}</span>
          ${statusBadge}
        </div>
      </div>
      <div class="adm-list-item__actions">
        ${store.isAdmin && !item.approved ? `
          <button class="adm-btn adm-btn--primary adm-btn--sm" data-action="approve" data-id="${item.id}" title="Approuver">
            <i class="fa-solid fa-check"></i>
          </button>` : ''}
        ${store.isAdmin && item.approved ? `
          <button class="adm-btn adm-btn--secondary adm-btn--sm" data-action="unapprove" data-id="${item.id}" title="Retirer l'approbation">
            <i class="fa-solid fa-rotate-left"></i>
          </button>` : ''}
        <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="detail" data-id="${item.id}" title="Détails">
          <i class="fa-solid fa-eye"></i>
        </button>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="delete" data-id="${item.id}" title="Supprimer" style="color:var(--danger);">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function _bindListActions(container, listBody) {
  listBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      // Click on row → detail
      const row = e.target.closest('.adm-list-item');
      if (row) _openDetail(parseInt(row.dataset.id, 10));
      return;
    }

    e.stopPropagation();
    const id = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;

    if (action === 'approve') {
      btn.disabled = true;
      try {
        await api.approveContribution(id, true);
        toast('Contribution approuvée', 'success');
        _loadList(container);
        _refreshPendingBadge();
      } catch (err) { toast(err.message, 'error'); }
    }

    if (action === 'unapprove') {
      btn.disabled = true;
      try {
        await api.approveContribution(id, false);
        toast('Approbation retirée', 'warning');
        _loadList(container);
        _refreshPendingBadge();
      } catch (err) { toast(err.message, 'error'); }
    }

    if (action === 'detail') {
      _openDetail(id);
    }

    if (action === 'delete') {
      const item = _state.items.find(i => i.id === id);
      const yes = await confirm({
        title: 'Supprimer cette contribution ?',
        message: `"${item?.project_name || 'Sans nom'}" sera supprimée définitivement, y compris tous les fichiers associés.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!yes) return;
      try {
        await api.deleteContribution(id);
        toast('Contribution supprimée', 'success');
        _loadList(container);
        _refreshPendingBadge();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}

/* ── Detail slide panel ── */

async function _openDetail(id) {
  try {
    const item = await api.getContribution(id);
    if (!item) { toast('Contribution introuvable', 'error'); return; }

    let dossiers = [];
    try { dossiers = await api.getConsultationDossiers(item.project_name) || []; } catch (_) {}

    const markdownContent = item.markdown_url
      ? await fetch(item.markdown_url).then(r => r.ok ? r.text() : '').catch(() => '')
      : '';

    const statusBadge = item.approved
      ? '<span class="adm-badge adm-badge--success"><i class="fa-solid fa-check"></i> Approuvée</span>'
      : '<span class="adm-badge adm-badge--warning"><i class="fa-solid fa-clock"></i> En attente</span>';

    const body = `
      <!-- Cover -->
      ${item.cover_url ? `<img src="${esc(item.cover_url)}" alt="" style="width:100%;border-radius:10px;margin-bottom:20px;max-height:240px;object-fit:cover;">` : ''}

      <!-- Status + Category -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        ${statusBadge}
        <span class="adm-badge adm-badge--info">${esc(item.category)}</span>
        ${item.tags ? `<span class="adm-badge adm-badge--neutral">${esc(item.tags)}</span>` : ''}
      </div>

      <!-- Meta -->
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;color:var(--gray-500);display:flex;flex-direction:column;gap:6px;">
          <span><i class="fa-solid fa-calendar" style="width:18px;"></i> Créée le ${formatDate(item.created_at)}</span>
          <span><i class="fa-solid fa-building" style="width:18px;"></i> ${esc(item.ville)}</span>
          ${item.official_url ? `<a href="${esc(item.official_url)}" target="_blank" rel="noopener" style="color:var(--info);text-decoration:none;"><i class="fa-solid fa-link" style="width:18px;"></i> ${esc(item.official_url)}</a>` : ''}
        </div>
      </div>

      <!-- Description -->
      ${item.description ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--gray-700);">Description</h3>
        <p style="font-size:14px;color:var(--gray-600);line-height:1.6;">${esc(item.description)}</p>
      </div>` : ''}

      <!-- Markdown content -->
      ${markdownContent ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--gray-700);">Article</h3>
        <div style="font-size:14px;color:var(--gray-600);line-height:1.6;max-height:300px;overflow-y:auto;padding:12px;background:var(--gray-50);border-radius:8px;white-space:pre-wrap;">${esc(markdownContent)}</div>
      </div>` : ''}

      <!-- GeoJSON link -->
      ${item.geojson_url ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--gray-700);">Données GeoJSON</h3>
        <a href="${esc(item.geojson_url)}" target="_blank" rel="noopener" class="adm-btn adm-btn--secondary adm-btn--sm">
          <i class="fa-solid fa-download"></i> Télécharger le GeoJSON
        </a>
      </div>` : ''}

      <!-- Dossiers -->
      ${dossiers.length > 0 ? `
      <div>
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--gray-700);">Documents de consultation (${dossiers.length})</h3>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${dossiers.map(d => `
            <a href="${esc(d.pdf_url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border-radius:8px;text-decoration:none;color:var(--gray-700);font-size:13px;">
              <i class="fa-solid fa-file-pdf" style="color:var(--danger);"></i>
              ${esc(d.title || 'Document')}
            </a>
          `).join('')}
        </div>
      </div>` : ''}
    `;

    const approveBtn = store.isAdmin
      ? (item.approved
        ? `<button class="adm-btn adm-btn--secondary" id="slide-toggle-approve"><i class="fa-solid fa-rotate-left"></i> Retirer l'approbation</button>`
        : `<button class="adm-btn adm-btn--primary" id="slide-toggle-approve"><i class="fa-solid fa-check"></i> Approuver</button>`)
      : '';

    const handle = slidePanel.open({
      title: item.project_name || 'Contribution',
      body,
      footer: `
        <button class="adm-btn adm-btn--danger adm-btn--sm" id="slide-delete"><i class="fa-solid fa-trash"></i> Supprimer</button>
        <div style="flex:1;"></div>
        <a href="/admin/contributions/modifier/${id}/" class="adm-btn adm-btn--secondary" data-section="contributions" id="slide-edit">
          <i class="fa-solid fa-pen"></i> Modifier
        </a>
        ${approveBtn}
      `,
      onClose() {
        // Update URL without re-rendering
        if (location.pathname.includes(`/contributions/${id}`)) {
          router.navigate('/admin/contributions/', { replace: true, skipRender: true });
        }
      }
    });

    // Bind footer actions
    const approveToggle = handle.content.querySelector('#slide-toggle-approve');
    if (approveToggle) {
      approveToggle.addEventListener('click', async () => {
        approveToggle.disabled = true;
        try {
          await api.approveContribution(id, !item.approved);
          toast(item.approved ? 'Approbation retirée' : 'Contribution approuvée', 'success');
          handle.close();
          _refreshPendingBadge();
          // Re-render list if we're on the contributions page
          const listBody = document.querySelector('#contrib-list-body');
          if (listBody) _loadList(listBody.closest('.adm-main__inner') || document.getElementById('adm-content'));
        } catch (err) { toast(err.message, 'error'); approveToggle.disabled = false; }
      });
    }

    handle.content.querySelector('#slide-edit')?.addEventListener('click', () => {
      handle.close();
    });

    handle.content.querySelector('#slide-delete')?.addEventListener('click', async () => {
      const yes = await confirm({
        title: 'Supprimer cette contribution ?',
        message: `"${item.project_name}" sera supprimée définitivement.`,
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!yes) return;
      try {
        await api.deleteContribution(id);
        toast('Contribution supprimée', 'success');
        handle.close();
        _refreshPendingBadge();
        const listBody = document.querySelector('#contrib-list-body');
        if (listBody) _loadList(listBody.closest('.adm-main__inner') || document.getElementById('adm-content'));
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (e) {
    console.error('[admin/contributions] detail:', e);
    toast('Erreur lors du chargement', 'error');
  }
}

async function _refreshPendingBadge() {
  try {
    const pending = await api.getPendingCount();
    updatePendingBadge(pending);
  } catch (_) {}
}

/* ============================================================================
   CREATE / EDIT CONTRIBUTION — 3-step wizard
   ============================================================================ */

const WIZARD_STEPS = [
  { key: 'identity', label: 'Identité',     icon: 'fa-tag' },
  { key: 'location', label: 'Localisation', icon: 'fa-map-location-dot' },
  { key: 'media',    label: 'Médias & publication', icon: 'fa-photo-film' },
];

let _wiz = {
  step: 0,
  categories: [],
  branding: null,
  // Form data
  project_name: '',
  category: '',
  description: '',
  official_url: '',
  // Files & drawing
  geojsonFile: null,
  drawnGeoJSON: null,   // GeoJSON FeatureCollection from map drawing
  locationMode: 'file', // 'file' | 'draw'
  coverFile: null,
  markdownText: '',
  docs: [],
  // Map draw state
  _map: null,
  _drawFeatures: [],    // array of GeoJSON features drawn on map
  _drawMode: null,      // 'marker' | 'line' | 'polygon' | null
  _drawPoints: [],      // points being actively drawn
  // Editor
  _mdEditor: null,      // Toast UI Editor instance
  // Edit mode
  editItem: null,
};

function _resetWizard() {
  if (_wiz._map) { try { _wiz._map.remove(); } catch (_) {} }
  if (_wiz._mdEditor) { try { _wiz._mdEditor.destroy(); } catch (_) {} }
  _wiz = {
    step: 0, categories: [], branding: null,
    project_name: '', category: '', description: '', official_url: '',
    geojsonFile: null, drawnGeoJSON: null, locationMode: 'file',
    coverFile: null, markdownText: '', docs: [],
    _map: null, _drawFeatures: [], _drawMode: null, _drawPoints: [],
    _mdEditor: null,
    editItem: null,
  };
}

async function _renderCreateWizard(container, editId = null) {
  _resetWizard();

  // Load categories + branding in parallel
  const [cats, branding] = await Promise.all([
    api.getCategories().catch(() => []),
    api.getBranding().catch(() => null),
  ]);
  _wiz.categories = cats || [];
  _wiz.branding = branding;

  // If editing, load existing data
  if (editId) {
    try {
      const item = await api.getContribution(editId);
      if (!item) { toast('Contribution introuvable', 'error'); router.navigate('/admin/contributions/'); return; }
      _wiz.editItem = item;
      _wiz.project_name = item.project_name || '';
      _wiz.category = item.category || '';
      _wiz.description = item.description || '';
      _wiz.official_url = item.official_url || '';
      if (item.markdown_url) {
        try { _wiz.markdownText = await fetch(item.markdown_url).then(r => r.ok ? r.text() : ''); } catch (_) {}
      }
    } catch (e) {
      toast('Erreur de chargement', 'error');
      router.navigate('/admin/contributions/');
      return;
    }
  }

  _renderWizardShell(container);
  _renderWizardStep(container);
}

function _renderWizardShell(container) {
  const isEdit = !!_wiz.editItem;
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title">
          <a href="/admin/contributions/" class="adm-btn adm-btn--ghost adm-btn--icon" data-section="contributions" style="margin-right:4px;">
            <i class="fa-solid fa-arrow-left"></i>
          </a>
          ${isEdit ? `Modifier : ${esc(_wiz.project_name)}` : 'Nouvelle contribution'}
        </h1>
        <p class="adm-page-subtitle">${isEdit ? 'Modifiez les informations de cette contribution' : 'Créez une contribution en 3 étapes simples'}</p>
      </div>
    </div>

    <!-- Stepper -->
    <div class="cw-stepper" id="cw-stepper">
      ${WIZARD_STEPS.map((s, i) => `
        <div class="cw-step ${i === 0 ? 'cw-step--active' : ''} ${i < _wiz.step ? 'cw-step--done' : ''}" data-step="${i}">
          <div class="cw-step__circle">
            <span class="cw-step__num">${i + 1}</span>
            <i class="fa-solid fa-check cw-step__check"></i>
          </div>
          <div class="cw-step__label">
            <span class="cw-step__title">${s.label}</span>
          </div>
        </div>
        ${i < WIZARD_STEPS.length - 1 ? '<div class="cw-step__line"></div>' : ''}
      `).join('')}
    </div>

    <!-- Wizard body -->
    <div id="cw-body"></div>

    <!-- Sticky actions -->
    <div class="tw-form-actions" id="cw-actions"></div>
  `;
}

function _renderWizardStep(container) {
  const body = container.querySelector('#cw-body');
  if (!body) return;

  // Save current step data before switching
  _saveCurrentStepData(container);

  // Destroy map when leaving step 1 (location)
  if (_wiz._map && _wiz.step !== 1) {
    try { _wiz._map.remove(); } catch (_) {}
    _wiz._map = null;
  }

  // Destroy editor when leaving step 2 (media)
  if (_wiz._mdEditor && _wiz.step !== 2) {
    try { _wiz.markdownText = _wiz._mdEditor.getMarkdown() || ''; } catch (_) {}
    try { _wiz._mdEditor.destroy(); } catch (_) {}
    _wiz._mdEditor = null;
  }
  _saveCurrentStepData(container);

  // Update stepper UI
  container.querySelectorAll('.cw-step').forEach((el, i) => {
    el.classList.toggle('cw-step--active', i === _wiz.step);
    el.classList.toggle('cw-step--done', i < _wiz.step);
  });
  // Color stepper lines
  container.querySelectorAll('.cw-step__line').forEach((line, i) => {
    line.classList.toggle('cw-step__line--done', i < _wiz.step);
  });

  // Render step content
  switch (_wiz.step) {
    case 0: _renderStepIdentity(body); break;
    case 1: _renderStepLocation(body); break;
    case 2: _renderStepMedia(body); break;
  }

  // Render actions
  _renderWizardActions(container);
}

function _saveCurrentStepData(container) {
  // Step 0 — Identity
  const name = container.querySelector('#cw-name');
  if (name) _wiz.project_name = name.value.trim();
  const desc = container.querySelector('#cw-description');
  if (desc) _wiz.description = desc.value.trim();

  // Step 2 — Media
  const url = container.querySelector('#cw-official-url');
  if (url) _wiz.official_url = url.value.trim();
  // Read markdown from editor instance
  if (_wiz._mdEditor) {
    _wiz.markdownText = _wiz._mdEditor.getMarkdown() || '';
  }
}

/* ── Step 1: Identity ── */

function _renderStepIdentity(body) {
  const cats = _wiz.categories;

  body.innerHTML = `
    <div class="cw-identity-layout">
      <div class="adm-card">
        <div class="adm-card__header">
          <h3 class="adm-card__title"><i class="fa-solid fa-tag"></i> Identité du projet</h3>
          <p class="adm-card__subtitle">Décrivez votre projet et choisissez sa catégorie</p>
        </div>
        <div class="adm-card__body">
          <div class="cw-form-row">
            <div class="adm-form-group" style="flex:2;">
              <label class="adm-label" for="cw-name">Nom du projet <span class="adm-required">*</span></label>
              <input type="text" class="adm-input" id="cw-name" required
                value="${esc(_wiz.project_name)}" placeholder="Ex : Rénovation du parc central">
            </div>
            <div class="adm-form-group" style="flex:1;">
              <label class="adm-label" for="cw-category">Catégorie <span class="adm-required">*</span></label>
              ${cats.length > 0 ? `
                <div class="cw-cat-select-wrap">
                  <select class="adm-input cw-cat-select" id="cw-category">
                    <option value="">— Choisir —</option>
                    ${cats.map(c => `<option value="${esc(c.category)}" ${_wiz.category === c.category ? 'selected' : ''} data-icon="${esc(c.icon || 'fa-solid fa-folder')}" data-color="${esc(c.icon_color || 'var(--primary)')}">${esc(c.category)}</option>`).join('')}
                  </select>
                  <div class="cw-cat-select-icon" id="cw-cat-icon">
                    ${_wiz.category ? (() => {
                      const sel = cats.find(c => c.category === _wiz.category);
                      return sel ? `<i class="${esc(sel.icon || 'fa-solid fa-folder')}" style="color:${esc(sel.icon_color || 'var(--primary)')}"></i>` : '';
                    })() : ''}
                  </div>
                </div>
              ` : `
                <input type="text" class="adm-input" id="cw-cat-text" value="${esc(_wiz.category)}" placeholder="Ex : mobilite">
              `}
            </div>
          </div>
          <div class="adm-form-group">
            <label class="adm-label" for="cw-description">Description</label>
            <textarea class="adm-textarea" id="cw-description" rows="5"
              placeholder="Décrivez le projet, ses objectifs, son impact…">${esc(_wiz.description)}</textarea>
            <div class="cw-char-count" id="cw-desc-count">${_wiz.description.length} / 500 caractères</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Category dropdown icon sync
  const catSelect = body.querySelector('#cw-category');
  const catIcon = body.querySelector('#cw-cat-icon');
  catSelect?.addEventListener('change', () => {
    _wiz.category = catSelect.value;
    const opt = catSelect.selectedOptions[0];
    if (opt && opt.value && catIcon) {
      catIcon.innerHTML = `<i class="${opt.dataset.icon || 'fa-solid fa-folder'}" style="color:${opt.dataset.color || 'var(--primary)'}"></i>`;
    } else if (catIcon) {
      catIcon.innerHTML = '';
    }
  });

  // Char counter
  const descEl = body.querySelector('#cw-description');
  const countEl = body.querySelector('#cw-desc-count');
  descEl?.addEventListener('input', () => {
    if (countEl) countEl.textContent = `${descEl.value.length} / 500 caractères`;
  });
}

/* ── Step 2: Location (GeoJSON) ── */

function _renderStepLocation(body) {
  const hasExisting = !!_wiz.editItem?.geojson_url;

  body.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header">
        <h3 class="adm-card__title"><i class="fa-solid fa-map-location-dot"></i> Tracé géographique</h3>
        <p class="adm-card__subtitle">Dessinez directement sur la carte ou importez un fichier GeoJSON</p>
      </div>
      <div class="adm-card__body">
        ${hasExisting ? `
          <div class="cw-existing-geojson">
            <i class="fa-solid fa-check-circle" style="color:var(--success);"></i>
            <div>
              <div style="font-weight:600;font-size:13px;">GeoJSON existant</div>
              <a href="${esc(_wiz.editItem.geojson_url)}" target="_blank" rel="noopener" style="font-size:12px;color:var(--info);">
                <i class="fa-solid fa-external-link-alt"></i> Voir le tracé actuel
              </a>
            </div>
            <div style="margin-left:auto;font-size:12px;color:var(--text-muted);">Ajoutez un nouveau tracé pour remplacer</div>
          </div>
        ` : ''}

        <!-- Mode toggle -->
        <div class="cw-loc-toggle">
          <button type="button" class="cw-loc-toggle__btn ${_wiz.locationMode === 'draw' ? 'active' : ''}" data-mode="draw">
            <i class="fa-solid fa-pencil"></i> Dessiner sur la carte
          </button>
          <button type="button" class="cw-loc-toggle__btn ${_wiz.locationMode === 'file' ? 'active' : ''}" data-mode="file">
            <i class="fa-solid fa-file-import"></i> Importer un fichier
          </button>
        </div>

        <!-- Draw mode -->
        <div class="cw-loc-draw" id="cw-loc-draw" ${_wiz.locationMode !== 'draw' ? 'hidden' : ''}>
          <div class="cw-draw-toolbar" id="cw-draw-toolbar">
            <button type="button" class="cw-draw-tool" data-tool="marker" title="Placer un point">
              <i class="fa-solid fa-map-pin"></i>
              <span>Point</span>
            </button>
            <button type="button" class="cw-draw-tool" data-tool="line" title="Tracer une ligne">
              <i class="fa-solid fa-route"></i>
              <span>Ligne</span>
            </button>
            <button type="button" class="cw-draw-tool" data-tool="polygon" title="Tracer un polygone">
              <i class="fa-solid fa-draw-polygon"></i>
              <span>Polygone</span>
            </button>
            <div class="cw-draw-sep"></div>
            <button type="button" class="cw-draw-tool cw-draw-tool--danger" id="cw-draw-undo" title="Supprimer le dernier tracé" disabled>
              <i class="fa-solid fa-rotate-left"></i>
              <span>Annuler</span>
            </button>
            <button type="button" class="cw-draw-tool cw-draw-tool--danger" id="cw-draw-clear" title="Tout effacer" disabled>
              <i class="fa-solid fa-trash"></i>
              <span>Effacer</span>
            </button>
          </div>
          <div class="cw-draw-hint" id="cw-draw-hint">
            Sélectionnez un outil puis cliquez sur la carte
          </div>
          <div class="cw-map-container" id="cw-map"></div>
          <div class="cw-draw-status" id="cw-draw-status"></div>
        </div>

        <!-- File mode -->
        <div class="cw-loc-file" id="cw-loc-file" ${_wiz.locationMode !== 'file' ? 'hidden' : ''}>
          <div class="cw-geojson-drop" id="cw-geojson-drop">
            <div class="cw-geojson-drop__icon">
              <i class="fa-solid fa-file-arrow-up"></i>
            </div>
            <div class="cw-geojson-drop__text">
              <div class="cw-geojson-drop__title">Déposez votre fichier GeoJSON ici</div>
              <div class="cw-geojson-drop__hint">ou cliquez pour parcourir — .geojson, .json</div>
            </div>
          </div>
          <input type="file" id="cw-geojson-file" accept=".geojson,.json" hidden>

          <div class="cw-geojson-result" id="cw-geojson-result" hidden>
            <div class="cw-geojson-result__info">
              <i class="fa-solid fa-file-code" style="color:var(--primary);"></i>
              <div>
                <div class="cw-geojson-result__name" id="cw-geojson-name"></div>
                <div class="cw-geojson-result__meta" id="cw-geojson-meta"></div>
              </div>
            </div>
            <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="cw-geojson-remove" style="color:var(--danger);">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Mode toggle
  body.querySelectorAll('.cw-loc-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      _wiz.locationMode = mode;
      body.querySelectorAll('.cw-loc-toggle__btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      body.querySelector('#cw-loc-draw').hidden = (mode !== 'draw');
      body.querySelector('#cw-loc-file').hidden = (mode !== 'file');
      if (mode === 'draw' && !_wiz._map) {
        setTimeout(() => _initDrawMap(body), 50);
      }
    });
  });

  // File upload logic
  _bindFileUpload(body);

  // If returning to this step with existing file
  if (_wiz.geojsonFile) {
    _showGeojsonResult(body, _wiz.geojsonFile.name, null);
  }

  // Init draw map if draw mode is active
  if (_wiz.locationMode === 'draw') {
    setTimeout(() => _initDrawMap(body), 100);
  }
}

/* ── Map Drawing Engine ── */

function _initDrawMap(body) {
  const container = body.querySelector('#cw-map');
  if (!container || _wiz._map) return;
  if (typeof maplibregl === 'undefined') {
    toast('MapLibre non chargé — impossible d\'afficher la carte', 'error');
    return;
  }

  const b = _wiz.branding || {};
  const center = [parseFloat(b.center_lng) || 4.835, parseFloat(b.center_lat) || 45.764];
  const zoom = parseFloat(b.zoom) || 12;

  const map = new maplibregl.Map({
    container,
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
      layers: [{
        id: 'osm-raster-layer',
        type: 'raster',
        source: 'osm-raster',
      }],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    },
    center,
    zoom,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  _wiz._map = map;

  map.on('load', () => {
    // Add source for drawn features
    map.addSource('draw-features', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({ id: 'draw-fills', type: 'fill', source: 'draw-features', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': 'rgba(var(--adm-primary-rgb), 0.2)', 'fill-opacity': 0.35 } });
    map.addLayer({ id: 'draw-lines', type: 'line', source: 'draw-features', filter: ['in', '$type', 'LineString', 'Polygon'], paint: { 'line-color': '#4E2BFF', 'line-width': 3 } });
    map.addLayer({ id: 'draw-points', type: 'circle', source: 'draw-features', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#4E2BFF', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

    // Source for in-progress drawing
    map.addSource('draw-active', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({ id: 'draw-active-line', type: 'line', source: 'draw-active', paint: { 'line-color': '#FF6B35', 'line-width': 2, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'draw-active-pts', type: 'circle', source: 'draw-active', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#FF6B35', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

    // Restore drawn features
    if (_wiz._drawFeatures.length > 0) {
      _updateDrawSource();
      _updateDrawStatus(body);
    }
  });

  // Map click handler for drawing
  map.on('click', (e) => _handleMapClick(body, e));

  // Bind toolbar
  _bindDrawToolbar(body);
}

function _handleMapClick(body, e) {
  if (!_wiz._drawMode) return;
  const { lng, lat } = e.lngLat;

  if (_wiz._drawMode === 'marker') {
    _wiz._drawFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {},
    });
    _updateDrawSource();
    _updateDrawStatus(body);
    return;
  }

  // Line or Polygon — accumulate points
  _wiz._drawPoints.push([lng, lat]);
  _updateActiveDrawLine();

  // Show hint
  const hintEl = body.querySelector('#cw-draw-hint');
  if (_wiz._drawMode === 'line') {
    if (hintEl) hintEl.textContent = `${_wiz._drawPoints.length} point(s) — Double-cliquez pour terminer la ligne`;
  } else if (_wiz._drawMode === 'polygon') {
    if (hintEl) hintEl.textContent = `${_wiz._drawPoints.length} point(s) — Double-cliquez pour fermer le polygone (min 3)`;
  }
}

function _updateActiveDrawLine() {
  const map = _wiz._map;
  if (!map || !map.getSource('draw-active')) return;
  const pts = _wiz._drawPoints;
  const features = [];

  // Show points
  pts.forEach(p => features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
  // Show connecting line if 2+ points
  if (pts.length >= 2) {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} });
  }
  map.getSource('draw-active').setData({ type: 'FeatureCollection', features });
}

function _finishDrawing(body) {
  const pts = _wiz._drawPoints;
  const mode = _wiz._drawMode;

  if (mode === 'line' && pts.length >= 2) {
    _wiz._drawFeatures.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [...pts] },
      properties: {},
    });
  } else if (mode === 'polygon' && pts.length >= 3) {
    const coords = [...pts, pts[0]]; // close ring
    _wiz._drawFeatures.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: {},
    });
  }

  // Clear active
  _wiz._drawPoints = [];
  if (_wiz._map?.getSource('draw-active')) {
    _wiz._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
  }

  _updateDrawSource();
  _updateDrawStatus(body);

  // Reset hint
  const hintEl = body.querySelector('#cw-draw-hint');
  if (hintEl) hintEl.textContent = 'Continuez à dessiner ou changez d\'outil';
}

function _updateDrawSource() {
  const map = _wiz._map;
  if (!map || !map.getSource('draw-features')) return;
  const fc = { type: 'FeatureCollection', features: _wiz._drawFeatures };
  map.getSource('draw-features').setData(fc);
  _wiz.drawnGeoJSON = _wiz._drawFeatures.length > 0 ? fc : null;

  // Enable/disable undo/clear buttons
  const undoBtn = document.querySelector('#cw-draw-undo');
  const clearBtn = document.querySelector('#cw-draw-clear');
  const hasFeat = _wiz._drawFeatures.length > 0;
  if (undoBtn) undoBtn.disabled = !hasFeat;
  if (clearBtn) clearBtn.disabled = !hasFeat;
}

function _updateDrawStatus(body) {
  const statusEl = body.querySelector('#cw-draw-status');
  if (!statusEl) return;
  const feats = _wiz._drawFeatures;
  if (feats.length === 0) {
    statusEl.innerHTML = '';
    return;
  }
  const points = feats.filter(f => f.geometry.type === 'Point').length;
  const lines = feats.filter(f => f.geometry.type === 'LineString').length;
  const polys = feats.filter(f => f.geometry.type === 'Polygon').length;
  const parts = [];
  if (points) parts.push(`<span class="cw-feat-badge"><i class="fa-solid fa-map-pin"></i> ${points} point${points > 1 ? 's' : ''}</span>`);
  if (lines) parts.push(`<span class="cw-feat-badge"><i class="fa-solid fa-route"></i> ${lines} ligne${lines > 1 ? 's' : ''}</span>`);
  if (polys) parts.push(`<span class="cw-feat-badge"><i class="fa-solid fa-draw-polygon"></i> ${polys} polygone${polys > 1 ? 's' : ''}</span>`);
  statusEl.innerHTML = `<div class="cw-draw-status__inner"><i class="fa-solid fa-check-circle" style="color:var(--success);"></i> ${parts.join('')} <span style="color:var(--text-muted);font-size:12px;">—  ${feats.length} élément${feats.length > 1 ? 's' : ''} au total</span></div>`;
}

function _bindDrawToolbar(body) {
  const toolbar = body.querySelector('#cw-draw-toolbar');
  if (!toolbar) return;

  // Tool selection
  toolbar.querySelectorAll('.cw-draw-tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      // If switching tool while drawing, finish current
      if (_wiz._drawPoints.length > 0) {
        _finishDrawing(body);
      }
      // Toggle mode
      if (_wiz._drawMode === tool) {
        _wiz._drawMode = null;
        btn.classList.remove('active');
        _setMapCursor('');
        const hintEl = body.querySelector('#cw-draw-hint');
        if (hintEl) hintEl.textContent = 'Sélectionnez un outil puis cliquez sur la carte';
      } else {
        _wiz._drawMode = tool;
        toolbar.querySelectorAll('.cw-draw-tool[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _setMapCursor('crosshair');
        const hintEl = body.querySelector('#cw-draw-hint');
        const hints = {
          marker: 'Cliquez sur la carte pour placer un point',
          line: 'Cliquez pour ajouter des points, double-cliquez pour terminer',
          polygon: 'Cliquez pour dessiner le contour, double-cliquez pour fermer',
        };
        if (hintEl) hintEl.textContent = hints[tool] || '';
      }
    });
  });

  // Double-click to finish line/polygon
  if (_wiz._map) {
    _wiz._map.on('dblclick', (e) => {
      if (_wiz._drawMode === 'line' || _wiz._drawMode === 'polygon') {
        e.preventDefault();
        _finishDrawing(body);
      }
    });
  }

  // Undo last feature
  body.querySelector('#cw-draw-undo')?.addEventListener('click', () => {
    _wiz._drawFeatures.pop();
    _updateDrawSource();
    _updateDrawStatus(body);
  });

  // Clear all
  body.querySelector('#cw-draw-clear')?.addEventListener('click', () => {
    _wiz._drawFeatures = [];
    _wiz._drawPoints = [];
    if (_wiz._map?.getSource('draw-active')) {
      _wiz._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
    }
    _updateDrawSource();
    _updateDrawStatus(body);
    const hintEl = body.querySelector('#cw-draw-hint');
    if (hintEl) hintEl.textContent = 'Sélectionnez un outil puis cliquez sur la carte';
  });
}

function _setMapCursor(cursor) {
  if (_wiz._map) _wiz._map.getCanvas().style.cursor = cursor;
}

/* ── File Upload Logic ── */

function _bindFileUpload(body) {
  const dropzone = body.querySelector('#cw-geojson-drop');
  const fileInput = body.querySelector('#cw-geojson-file');

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) _handleGeojsonFile(body, e.dataTransfer.files[0]);
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) _handleGeojsonFile(body, fileInput.files[0]);
  });

  // Remove button
  body.querySelector('#cw-geojson-remove')?.addEventListener('click', () => {
    _wiz.geojsonFile = null;
    const resultEl = body.querySelector('#cw-geojson-result');
    if (resultEl) resultEl.hidden = true;
    if (dropzone) dropzone.hidden = false;
  });
}

function _handleGeojsonFile(body, file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.geojson') && !name.endsWith('.json')) {
    toast('Le fichier doit être un GeoJSON (.geojson ou .json)', 'error');
    return;
  }

  // Parse to get feature count
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      let count = 0;
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        count = parsed.features.length;
      } else if (parsed.type === 'Feature') {
        count = 1;
      }
      _wiz.geojsonFile = file;
      _showGeojsonResult(body, file.name, count > 0 ? `${count} feature${count > 1 ? 's' : ''} détectée${count > 1 ? 's' : ''}` : null);
    } catch (err) {
      toast('Fichier GeoJSON invalide', 'error');
    }
  };
  reader.readAsText(file);
}

function _showGeojsonResult(body, name, metaText) {
  const dropzone = body.querySelector('#cw-geojson-drop');
  const resultEl = body.querySelector('#cw-geojson-result');
  const nameEl = body.querySelector('#cw-geojson-name');
  const metaEl = body.querySelector('#cw-geojson-meta');
  if (dropzone) dropzone.hidden = true;
  if (resultEl) resultEl.hidden = false;
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = metaText || '';
}

/* ── Step 3: Media & Publication ── */

function _renderStepMedia(body) {
  const isEdit = !!_wiz.editItem;

  body.innerHTML = `
    <div class="cw-grid">
      <div class="cw-col">

        <!-- Cover image -->
        <div class="adm-card">
          <div class="adm-card__header">
            <h3 class="adm-card__title"><i class="fa-solid fa-image"></i> Image de couverture</h3>
            <p class="adm-card__subtitle">Optionnel — Illustre le projet dans la liste</p>
          </div>
          <div class="adm-card__body">
            ${isEdit && _wiz.editItem.cover_url ? `
              <div class="cw-cover-preview" id="cw-cover-preview">
                <img src="${esc(_wiz.editItem.cover_url)}" alt="" id="cw-cover-img">
                <button type="button" class="cw-cover-change" id="cw-cover-change-btn">
                  <i class="fa-solid fa-camera"></i> Changer
                </button>
              </div>
            ` : `
              <div class="cw-cover-preview" id="cw-cover-preview" hidden>
                <img src="" alt="" id="cw-cover-img">
                <button type="button" class="cw-cover-change" id="cw-cover-change-btn">
                  <i class="fa-solid fa-camera"></i> Changer
                </button>
              </div>
            `}
            <div class="adm-dropzone" id="cw-cover-drop" ${isEdit && _wiz.editItem.cover_url ? 'hidden' : ''}>
              <i class="fa-solid fa-image"></i>
              <div class="adm-dropzone__text">Déposez une image ou cliquez</div>
              <div class="adm-dropzone__hint">.jpg, .png, .webp</div>
            </div>
            <input type="file" id="cw-cover-file" accept="image/jpeg,image/png,image/webp" hidden>
          </div>
        </div>

        <!-- URL officielle -->
        <div class="adm-card" style="margin-top:16px;">
          <div class="adm-card__header">
            <h3 class="adm-card__title"><i class="fa-solid fa-link"></i> Lien externe</h3>
          </div>
          <div class="adm-card__body">
            <div class="adm-form-group" style="margin:0;">
              <label class="adm-label" for="cw-official-url">URL officielle <span style="font-weight:400;color:var(--text-muted);font-size:12px;">(optionnel)</span></label>
              <input type="url" class="adm-input" id="cw-official-url"
                value="${esc(_wiz.official_url)}" placeholder="https://…">
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Lien vers le site officiel du projet ou une page de référence</div>
            </div>
          </div>
        </div>

        <!-- Markdown article -->
        <div class="adm-card" style="margin-top:16px;">
          <div class="adm-card__header" style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <h3 class="adm-card__title"><i class="fa-solid fa-align-left"></i> Article de présentation</h3>
              <p class="adm-card__subtitle">Optionnel — Rédigez un article riche avec images et mise en forme</p>
            </div>
            <label class="adm-switch">
              <input type="checkbox" id="cw-md-toggle" ${_wiz.markdownText ? 'checked' : ''}>
              <span class="adm-switch__track"></span>
            </label>
          </div>
          <div class="adm-card__body cw-editor-wrap" id="cw-md-body" ${_wiz.markdownText ? '' : 'hidden'}>
            <div id="cw-editor"></div>
          </div>
        </div>
      </div>

      <div class="cw-col">

        <!-- Documents -->
        <div class="adm-card">
          <div class="adm-card__header">
            <h3 class="adm-card__title"><i class="fa-solid fa-file-pdf"></i> Documents de consultation</h3>
            <p class="adm-card__subtitle">Optionnel — Ajoutez des fichiers PDF liés au projet</p>
          </div>
          <div class="adm-card__body">
            <div id="cw-docs-list"></div>
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="cw-add-doc" style="margin-top:8px;">
              <i class="fa-solid fa-plus"></i> Ajouter un document
            </button>
            <input type="file" id="cw-doc-file" accept="application/pdf" hidden>
          </div>
        </div>

        <!-- Recap -->
        <div class="adm-card" style="margin-top:16px;">
          <div class="adm-card__header">
            <h3 class="adm-card__title"><i class="fa-solid fa-list-check"></i> Récapitulatif</h3>
          </div>
          <div class="adm-card__body" id="cw-recap" style="padding:0;"></div>
        </div>

        <!-- Publish option (admin only) -->
        ${store.isAdmin ? `
        <div class="adm-card" style="margin-top:16px;">
          <div class="adm-card__body">
            <label class="adm-toggle-row">
              <div>
                <div class="adm-toggle-row__title">Publier immédiatement</div>
                <div class="adm-toggle-row__desc">La contribution sera visible sur la carte dès sa création</div>
              </div>
              <label class="adm-switch">
                <input type="checkbox" id="cw-publish" checked>
                <span class="adm-switch__track"></span>
              </label>
            </label>
          </div>
        </div>` : `
        <div class="cw-info-box" style="margin-top:16px;">
          <i class="fa-solid fa-info-circle"></i>
          <div>
            <div style="font-weight:600;font-size:13px;">En attente de validation</div>
            <div style="font-size:12px;color:var(--text-muted);">Votre contribution sera soumise à un administrateur pour approbation</div>
          </div>
        </div>`}
      </div>
    </div>
  `;

  // Cover upload
  _bindCoverUpload(body);

  // Markdown editor toggle
  const mdToggle = body.querySelector('#cw-md-toggle');
  const mdBody = body.querySelector('#cw-md-body');
  mdToggle?.addEventListener('change', (e) => {
    if (mdBody) mdBody.hidden = !e.target.checked;
    if (e.target.checked && !_wiz._mdEditor) {
      setTimeout(() => _initMarkdownEditor(body), 50);
    }
  });
  // Init editor if already enabled
  if (_wiz.markdownText) {
    setTimeout(() => _initMarkdownEditor(body), 50);
  }

  // Docs
  _renderDocsList(body);
  _bindDocUpload(body);

  // Recap
  _renderRecap(body);
}

/* ── Toast UI Markdown Editor ── */

function _initMarkdownEditor(body) {
  const el = body.querySelector('#cw-editor');
  if (!el || _wiz._mdEditor) return;

  // Check library availability
  const EditorClass = window.toastui?.Editor;
  if (!EditorClass) {
    // Fallback to plain textarea
    el.innerHTML = `<textarea class="adm-textarea" id="cw-markdown" rows="10"
      placeholder="Rédigez votre article…" style="min-height:300px;">${esc(_wiz.markdownText)}</textarea>`;
    console.warn('[contrib] Toast UI Editor not loaded, fallback to textarea');
    return;
  }

  const editor = new EditorClass({
    el,
    height: '420px',
    initialEditType: 'wysiwyg',
    initialValue: _wiz.markdownText || '',
    previewStyle: 'vertical',
    language: 'fr-FR',
    usageStatistics: false,
    placeholder: 'Rédigez votre article avec mise en forme, images, liens…',
    toolbarItems: [
      ['heading', 'bold', 'italic', 'strike'],
      ['hr', 'quote'],
      ['ul', 'ol'],
      ['table', 'image', 'link'],
      ['code', 'codeblock'],
    ],
    hooks: {
      addImageBlobHook: async (blob, callback) => {
        try {
          const cat = _wiz.category || 'general';
          const name = _wiz.project_name || 'article';
          const url = await api.uploadArticleImage(blob, cat, name);
          callback(url, blob.name || 'image');
        } catch (err) {
          console.error('[contrib] Image upload error:', err);
          toast('Erreur lors de l\'upload de l\'image', 'error');
        }
      },
    },
  });

  _wiz._mdEditor = editor;
}

function _bindCoverUpload(body) {
  const dropzone = body.querySelector('#cw-cover-drop');
  const fileInput = body.querySelector('#cw-cover-file');
  const preview = body.querySelector('#cw-cover-preview');
  const img = body.querySelector('#cw-cover-img');

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) _setCoverFile(body, e.dataTransfer.files[0]);
  });
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) _setCoverFile(body, fileInput.files[0]);
  });

  body.querySelector('#cw-cover-change-btn')?.addEventListener('click', () => fileInput?.click());
}

function _setCoverFile(body, file) {
  if (!file.type.startsWith('image/')) { toast('Le fichier doit être une image', 'error'); return; }
  _wiz.coverFile = file;

  const img = body.querySelector('#cw-cover-img');
  const preview = body.querySelector('#cw-cover-preview');
  const dropzone = body.querySelector('#cw-cover-drop');

  if (img) {
    const url = URL.createObjectURL(file);
    img.src = url;
  }
  if (preview) preview.hidden = false;
  if (dropzone) dropzone.hidden = true;

  _renderRecap(body);
}

function _bindDocUpload(body) {
  const addBtn = body.querySelector('#cw-add-doc');
  const fileInput = body.querySelector('#cw-doc-file');

  addBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const title = file.name.replace(/\.pdf$/i, '');
    _wiz.docs.push({ title, file });
    _renderDocsList(body);
    _renderRecap(body);
    fileInput.value = '';
  });
}

function _renderDocsList(body) {
  const list = body.querySelector('#cw-docs-list');
  if (!list) return;

  if (_wiz.docs.length === 0) {
    list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">Aucun document ajouté</div>';
    return;
  }

  list.innerHTML = _wiz.docs.map((d, i) => `
    <div class="cw-doc-item">
      <i class="fa-solid fa-file-pdf" style="color:var(--danger);flex-shrink:0;"></i>
      <input type="text" class="adm-input adm-input--sm cw-doc-title" value="${esc(d.title)}" data-idx="${i}" placeholder="Titre du document">
      <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-remove-doc="${i}" style="color:var(--danger);">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');

  // Bind title changes
  list.querySelectorAll('.cw-doc-title').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx, 10);
      if (_wiz.docs[idx]) _wiz.docs[idx].title = input.value.trim();
    });
  });

  // Bind remove
  list.querySelectorAll('[data-remove-doc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.removeDoc, 10);
      _wiz.docs.splice(idx, 1);
      _renderDocsList(body);
      _renderRecap(body);
    });
  });
}

function _renderRecap(body) {
  const recap = body.querySelector('#cw-recap');
  if (!recap) return;

  const isEdit = !!_wiz.editItem;
  const checks = [
    { label: 'Nom du projet', ok: !!_wiz.project_name },
    { label: 'Catégorie', ok: !!_wiz.category },
    { label: 'Tracé géographique', ok: !!_wiz.geojsonFile || !!_wiz.drawnGeoJSON || (isEdit && !!_wiz.editItem?.geojson_url) },
    { label: 'Image de couverture', ok: !!_wiz.coverFile || (isEdit && !!_wiz.editItem?.cover_url) },
    { label: 'URL officielle', ok: !!_wiz.official_url },
    { label: 'Article', ok: !!(_wiz._mdEditor ? _wiz._mdEditor.getMarkdown()?.trim() : _wiz.markdownText?.trim()) || (isEdit && !!_wiz.editItem?.markdown_url) },
    { label: 'Documents', ok: _wiz.docs.length > 0 },
  ];

  recap.innerHTML = checks.map(c => `
    <div class="cw-recap-row">
      <span>${c.label}</span>
      ${c.ok
        ? '<span class="adm-badge adm-badge--success" style="font-size:11px;"><i class="fa-solid fa-check"></i> OK</span>'
        : '<span style="font-size:12px;color:var(--text-muted);">—</span>'
      }
    </div>
  `).join('');
}

/* ── Wizard navigation ── */

function _renderWizardActions(container) {
  const actions = container.querySelector('#cw-actions');
  if (!actions) return;

  const isFirst = _wiz.step === 0;
  const isLast = _wiz.step === WIZARD_STEPS.length - 1;
  const isEdit = !!_wiz.editItem;

  actions.innerHTML = `
    ${!isFirst ? `
      <button type="button" class="adm-btn adm-btn--secondary" id="cw-prev">
        <i class="fa-solid fa-arrow-left"></i> Précédent
      </button>` : `
      <a href="/admin/contributions/" class="adm-btn adm-btn--secondary" data-section="contributions">
        <i class="fa-solid fa-xmark"></i> Annuler
      </a>
    `}
    <div style="flex:1;"></div>
    ${!isLast ? `
      <button type="button" class="adm-btn adm-btn--primary" id="cw-next">
        Continuer <i class="fa-solid fa-arrow-right"></i>
      </button>` : `
      <button type="button" class="adm-btn adm-btn--primary" id="cw-submit">
        <i class="fa-solid fa-rocket"></i> ${isEdit ? 'Enregistrer les modifications' : 'Créer la contribution'}
      </button>
    `}
  `;

  actions.querySelector('#cw-prev')?.addEventListener('click', () => {
    _saveCurrentStepData(container);
    _wiz.step--;
    _renderWizardStep(container);
  });

  actions.querySelector('#cw-next')?.addEventListener('click', () => {
    if (!_validateCurrentStep(container)) return;
    _saveCurrentStepData(container);
    _wiz.step++;
    _renderWizardStep(container);
  });

  actions.querySelector('#cw-submit')?.addEventListener('click', () => {
    _saveCurrentStepData(container);
    _submitWizard(container);
  });
}

function _validateCurrentStep(container) {
  if (_wiz.step === 0) {
    const name = container.querySelector('#cw-name')?.value?.trim();
    if (!name) { toast('Le nom du projet est obligatoire', 'error'); container.querySelector('#cw-name')?.focus(); return false; }
    _wiz.project_name = name;

    // Category: from dropdown or text input
    const catSelect = container.querySelector('#cw-category');
    if (catSelect) _wiz.category = catSelect.value;
    const catText = container.querySelector('#cw-cat-text')?.value?.trim();
    if (catText) _wiz.category = catText;
    if (!_wiz.category) { toast('Veuillez choisir une catégorie', 'error'); return false; }
    return true;
  }
  if (_wiz.step === 1) {
    const isEdit = !!_wiz.editItem;
    const hasGeo = _wiz.geojsonFile || _wiz.drawnGeoJSON || (isEdit && _wiz.editItem?.geojson_url);
    if (!hasGeo) {
      toast('Veuillez dessiner un tracé ou importer un fichier GeoJSON', 'error');
      return false;
    }
    return true;
  }
  return true;
}

/* ── Submit ── */

async function _submitWizard(container) {
  const submitBtn = container.querySelector('#cw-submit');
  if (submitBtn) submitBtn.disabled = true;

  const isEdit = !!_wiz.editItem;
  const publishNow = store.isAdmin ? (container.querySelector('#cw-publish')?.checked ?? true) : false;

  try {
    let rowId;

    if (isEdit) {
      rowId = _wiz.editItem.id;
      // Update core fields
      await api.updateContribution(rowId, {
        project_name: _wiz.project_name,
        category: _wiz.category,
        description: _wiz.description || null,
        official_url: _wiz.official_url || null,
      });
    } else {
      // Create row
      rowId = await api.createContributionRow(
        _wiz.project_name,
        _wiz.category,
        null,
        _wiz.description || null,
        _wiz.official_url || null,
        []
      );
      if (!rowId) throw new Error('Impossible de créer la contribution');
    }

    // Upload GeoJSON — from file or drawn
    let geojsonToUpload = null;
    if (_wiz.geojsonFile) {
      const text = await _wiz.geojsonFile.text();
      const parsed = JSON.parse(text);
      let fc = parsed;
      if (parsed.type === 'Feature') fc = { type: 'FeatureCollection', features: [parsed] };
      else if (parsed.type !== 'FeatureCollection') fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: parsed, properties: {} }] };
      geojsonToUpload = fc;
    } else if (_wiz.drawnGeoJSON && _wiz.drawnGeoJSON.features?.length > 0) {
      geojsonToUpload = _wiz.drawnGeoJSON;
    }

    if (geojsonToUpload) {
      const blob = new Blob([JSON.stringify(geojsonToUpload)], { type: 'application/geo+json' });
      const geoFile = new File([blob], `${_slugify(_wiz.project_name)}.geojson`, { type: 'application/geo+json' });
      await api.uploadGeoJSON(geoFile, _wiz.category, _wiz.project_name, rowId);
    }

    // Upload cover
    if (_wiz.coverFile) {
      await api.uploadCover(_wiz.coverFile, _wiz.category, _wiz.project_name, rowId);
    }

    // Upload markdown
    const md = (_wiz.markdownText || '').trim();
    if (md) {
      const mdBlob = new Blob([md], { type: 'text/markdown' });
      await api.uploadMarkdown(mdBlob, _wiz.category, _wiz.project_name, rowId);
    }

    // Upload consultation docs
    if (_wiz.docs.length > 0) {
      const uploaded = [];
      for (const d of _wiz.docs) {
        try {
          const url = await api.uploadConsultationPdf(d.file, _wiz.category, _wiz.project_name, rowId);
          if (url) uploaded.push({ title: d.title || 'Document', pdf_url: url });
        } catch (err) { console.warn('[contrib] PDF upload error:', err); }
      }
      if (uploaded.length > 0) {
        await api.insertConsultationDossiers(_wiz.project_name, _wiz.category, uploaded);
      }
    }

    // Set approval status
    if (!isEdit && publishNow) {
      await api.approveContribution(rowId, true);
    }

    toast(isEdit ? 'Contribution mise à jour' : 'Contribution créée avec succès', 'success');
    _refreshPendingBadge();
    router.navigate('/admin/contributions/');
  } catch (err) {
    console.error('[admin/contributions] submit:', err);
    toast(err.message || 'Erreur lors de la création', 'error');
    if (submitBtn) submitBtn.disabled = false;
  }
}

function _slugify(str) {
  return (str || 'projet')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
