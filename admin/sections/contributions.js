import { store } from '../store.js';
import { router } from '../router.js';
import * as api from '../api.js';
import { toast, confirm, slidePanel, esc, formatDate, formatRelativeDate, renderPagination, emptyState, skeletonTable } from '../components/ui.js';
import { Copilot } from '../components/copilot.js';

const PAGE_SIZE = 20;

// AbortController for list click listener — ensures only one listener exists at a time
let _listBodyAbort = null;

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
  } catch (e) { console.warn('[admin-contrib] loadCategories', e); }
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
  // Remove any previously attached listener to avoid accumulation across _loadList calls
  if (_listBodyAbort) _listBodyAbort.abort();
  _listBodyAbort = new AbortController();

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
      } catch (err) { toast(err.message, 'error'); }
    }

    if (action === 'unapprove') {
      btn.disabled = true;
      try {
        await api.approveContribution(id, false);
        toast('Approbation retirée', 'warning');
        _loadList(container);
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
      } catch (err) { toast(err.message, 'error'); }
    }
  }, { signal: _listBodyAbort.signal });
}

function _injectDetailStyles() {
  if (document.getElementById('contrib-detail-styles')) return;
  const s = document.createElement('style');
  s.id = 'contrib-detail-styles';
  s.textContent = `
    .sp-cover {
      width: calc(100% + 48px); margin: -24px -24px 20px;
      height: 200px; object-fit: cover; display: block;
      background: var(--adm-bg-tertiary);
    }
    .sp-cover--placeholder {
      display: flex; align-items: center; justify-content: center;
      font-size: 48px; opacity: .15;
      background: radial-gradient(circle at 30% 60%, var(--primary-alpha-24, rgba(33,185,41,.24)) 0%, transparent 60%);
    }
    .sp-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
    .sp-meta {
      display: flex; flex-direction: column; gap: 7px;
      margin-bottom: 20px; padding-bottom: 18px;
      border-bottom: 1px solid var(--adm-glass-border, rgba(0,0,0,.06));
    }
    .sp-meta-item {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: var(--gray-500);
    }
    .sp-meta-item i { color: var(--primary); width: 14px; text-align: center; flex-shrink: 0; }
    .sp-meta-item a { color: var(--primary); text-decoration: none; word-break: break-all; }
    .sp-meta-item a:hover { text-decoration: underline; }
    .sp-section { margin-bottom: 22px; }
    .sp-section-title {
      font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
      color: var(--gray-400); margin-bottom: 10px;
    }
    .sp-description {
      font-size: 14px; color: var(--gray-700); line-height: 1.65;
      background: var(--adm-glass-inner); border-radius: 10px; padding: 14px 16px;
    }
    .sp-map {
      width: 100%; height: 220px; border-radius: 10px; overflow: hidden;
      border: 1px solid var(--adm-glass-border);
    }
    .sp-article {
      font-size: 14px; line-height: 1.7; color: var(--gray-700);
      background: var(--adm-glass-inner); border-radius: 10px; padding: 16px 18px;
    }
    .sp-article h1, .sp-article h2, .sp-article h3 { font-weight: 700; margin: 1em 0 .4em; color: var(--gray-800); }
    .sp-article h1 { font-size: 1.3em; }
    .sp-article h2 { font-size: 1.12em; }
    .sp-article h3 { font-size: 1em; }
    .sp-article p { margin: .5em 0; }
    .sp-article a { color: var(--primary); }
    .sp-article img { max-width: 100%; border-radius: 8px; margin: .4em 0; }
    .sp-article ul, .sp-article ol { padding-left: 1.4em; margin: .4em 0; }
    .sp-article blockquote {
      border-left: 3px solid var(--primary); margin: .6em 0;
      padding: .35em .9em; color: var(--gray-500);
      background: var(--primary-alpha-6, rgba(33,185,41,.06)); border-radius: 0 8px 8px 0;
    }
    .sp-article code { background: var(--adm-bg-tertiary); padding: 2px 5px; border-radius: 4px; font-size: .88em; }
    .sp-article pre { background: var(--adm-bg-tertiary); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
    .sp-docs { display: flex; flex-direction: column; gap: 7px; }
    .sp-doc-link {
      display: flex; align-items: center; gap: 9px;
      padding: 9px 13px;
      background: var(--adm-glass-inner); border: 1px solid var(--adm-glass-border);
      border-radius: 9px; text-decoration: none; color: var(--gray-700);
      font-size: 13px; font-weight: 500;
      transition: background .15s, border-color .15s;
    }
    .sp-doc-link:hover { background: var(--adm-glass); border-color: var(--primary); color: var(--primary); }
    .sp-doc-link i.fa-file-pdf { color: var(--danger); font-size: 15px; }
    .sp-doc-link .sp-doc-ext { margin-left: auto; font-size: 10px; opacity: .45; }
  `;
  document.head.appendChild(s);
}

async function _openDetail(id) {
  try {
    const item = await api.getContribution(id);
    if (!item) { toast('Contribution introuvable', 'error'); return; }

    let dossiers = [];
    try { dossiers = await api.getConsultationDossiers(item.project_name) || []; } catch (e) { console.warn('[admin-contrib] getConsultationDossiers', e); }

    let markdownContent = '';
    if (item.markdown_url) {
      try { markdownContent = await fetch(item.markdown_url).then(r => r.ok ? r.text() : ''); } catch (e) { console.warn('[admin-contrib] fetch markdown', e); }
    }

    _injectDetailStyles();

    const statusBadge = item.approved
      ? '<span class="adm-badge adm-badge--success"><i class="fa-solid fa-check"></i> Approuvée</span>'
      : '<span class="adm-badge adm-badge--warning"><i class="fa-solid fa-clock"></i> En attente</span>';

    const approveBtn = store.isAdmin
      ? (item.approved
        ? `<button class="adm-btn adm-btn--secondary" id="sp-toggle-approve"><i class="fa-solid fa-rotate-left"></i> Retirer l'approbation</button>`
        : `<button class="adm-btn adm-btn--primary" id="sp-toggle-approve"><i class="fa-solid fa-check"></i> Approuver</button>`)
      : '';

    const body = `
      <!-- Cover image — full width, no text overlay -->
      ${item.cover_url
        ? `<img class="sp-cover" src="${esc(item.cover_url)}" alt="">`
        : `<div class="sp-cover sp-cover--placeholder"><i class="fa-solid fa-map-location-dot"></i></div>`}

      <!-- Badges (status + category + tags) -->
      <div class="sp-badges">
        ${statusBadge}
        <span class="adm-badge adm-badge--info">${esc(item.category)}</span>
        ${item.tags ? `<span class="adm-badge adm-badge--neutral">${esc(item.tags)}</span>` : ''}
      </div>

      <!-- Meta -->
      <div class="sp-meta">
        <div class="sp-meta-item"><i class="fa-solid fa-calendar"></i> ${formatDate(item.created_at)}</div>
        <div class="sp-meta-item"><i class="fa-solid fa-building"></i> ${esc(item.ville)}</div>
        ${item.official_url ? `<div class="sp-meta-item"><i class="fa-solid fa-link"></i> <a href="${esc(item.official_url)}" target="_blank" rel="noopener">${esc(item.official_url)}</a></div>` : ''}
      </div>

      <!-- Description -->
      ${item.description ? `
      <div class="sp-section">
        <div class="sp-section-title">Description</div>
        <div class="sp-description">${esc(item.description)}</div>
      </div>` : ''}

      <!-- Map -->
      ${item.geojson_url ? `
      <div class="sp-section">
        <div class="sp-section-title">Localisation</div>
        <div class="sp-map" id="sp-contrib-map"></div>
      </div>` : ''}

      <!-- Article (markdown rendered async) -->
      ${markdownContent ? `
      <div class="sp-section">
        <div class="sp-section-title">Article</div>
        <div class="sp-article" id="sp-contrib-article"></div>
      </div>` : ''}

      <!-- Documents -->
      ${dossiers.length > 0 ? `
      <div class="sp-section">
        <div class="sp-section-title">Documents (${dossiers.length})</div>
        <div class="sp-docs">
          ${dossiers.map(d => `
            <a href="${esc(d.pdf_url)}" target="_blank" rel="noopener" class="sp-doc-link">
              <i class="fa-solid fa-file-pdf"></i>
              <span>${esc(d.title || 'Document')}</span>
              <i class="fa-solid fa-arrow-up-right-from-square sp-doc-ext"></i>
            </a>
          `).join('')}
        </div>
      </div>` : ''}
    `;

    const footer = `
      <button class="adm-btn adm-btn--ghost adm-btn--sm" id="sp-delete" style="color:var(--danger);margin-right:auto;">
        <i class="fa-solid fa-trash"></i> Supprimer
      </button>
      <a href="/admin/contributions/modifier/${id}/" class="adm-btn adm-btn--secondary" data-section="contributions" id="sp-edit">
        <i class="fa-solid fa-pen"></i> Modifier
      </a>
      ${approveBtn}
    `;

    const handle = slidePanel.open({
      title: item.project_name || 'Contribution',
      body,
      footer,
      onClose() {
        if (location.pathname.includes(`/contributions/${id}`)) {
          router.navigate('/admin/contributions/', { replace: true, skipRender: true });
        }
      },
    });

    // Render markdown asynchronously into the already-open panel
    if (markdownContent) {
      const articleEl = handle.content.querySelector('#sp-contrib-article');
      if (articleEl) {
        if (window.MarkdownUtils) {
          await window.MarkdownUtils.loadDeps();
          articleEl.innerHTML = window.MarkdownUtils.renderMarkdown(markdownContent);
        } else {
          articleEl.textContent = markdownContent;
        }
      }
    }

    // Init mini-map with GeoJSON trace
    if (item.geojson_url) {
      const mapEl = handle.content.querySelector('#sp-contrib-map');
      if (mapEl && typeof maplibregl !== 'undefined') {
        const branding = await api.getBranding().catch(() => null);
        const center = [parseFloat(branding?.center_lng) || 4.835, parseFloat(branding?.center_lat) || 45.764];
        const previewMap = new maplibregl.Map({
          container: mapEl,
          style: {
            version: 8,
            sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
          center, zoom: 12,
          attributionControl: false,
          interactive: true,
        });
        previewMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        previewMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
        previewMap.on('load', async () => {
          try {
            const geo = await fetch(item.geojson_url).then(r => { if (!r.ok) throw new Error('GeoJSON fetch failed'); return r.json(); });
            previewMap.addSource('contrib', { type: 'geojson', data: geo });
            previewMap.addLayer({ id: 'contrib-fill', type: 'fill', source: 'contrib', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#14AE5C', 'fill-opacity': 0.18 } });
            previewMap.addLayer({ id: 'contrib-line', type: 'line', source: 'contrib', filter: ['in', '$type', 'LineString', 'Polygon'], paint: { 'line-color': '#14AE5C', 'line-width': 2.5 } });
            previewMap.addLayer({ id: 'contrib-point', type: 'circle', source: 'contrib', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#14AE5C', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

            // Fit bounds to GeoJSON extent
            const coords = [];
            const collect = (g) => {
              if (!g) return;
              if (g.type === 'Point') { coords.push(g.coordinates); return; }
              if (g.type === 'LineString') { coords.push(...g.coordinates); return; }
              if (g.type === 'Polygon') { g.coordinates.forEach(r => coords.push(...r)); return; }
              if (g.type === 'MultiPolygon') { g.coordinates.forEach(p => p.forEach(r => coords.push(...r))); return; }
              if (g.type === 'MultiLineString') { g.coordinates.forEach(l => coords.push(...l)); return; }
              if (g.type === 'FeatureCollection') { g.features.forEach(f => collect(f.geometry)); return; }
              if (g.type === 'Feature') { collect(g.geometry); }
            };
            collect(geo);
            if (coords.length > 0) {
              previewMap.fitBounds(
                [[Math.min(...coords.map(c => c[0])), Math.min(...coords.map(c => c[1]))],
                 [Math.max(...coords.map(c => c[0])), Math.max(...coords.map(c => c[1]))]],
                { padding: 40, maxZoom: 16, duration: 600 }
              );
            }
          } catch (e) { console.debug('[admin-contrib] map fitBounds', e); }
        });
      }
    }

    // Footer action bindings
    handle.content.querySelector('#sp-edit')?.addEventListener('click', () => handle.close());

    handle.content.querySelector('#sp-delete')?.addEventListener('click', async () => {
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
        const listBody = document.querySelector('#contrib-list-body');
        if (listBody) _loadList(listBody.closest('.adm-main__inner') || document.getElementById('adm-content'));
      } catch (err) { toast(err.message, 'error'); }
    });

    handle.content.querySelector('#sp-toggle-approve')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await api.approveContribution(id, !item.approved);
        toast(item.approved ? 'Approbation retirée' : 'Contribution approuvée', 'success');
        handle.close();
        const listBody = document.querySelector('#contrib-list-body');
        if (listBody) _loadList(listBody.closest('.adm-main__inner') || document.getElementById('adm-content'));
      } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
    });

  } catch (e) {
    console.error('[admin/contributions] detail:', e);
    toast('Erreur lors du chargement', 'error');
  }
}



let _wiz = {
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
  _wiz._copilot?.destroy();
  _wiz._map?.remove();
  _wiz._mdEditor?.destroy();
  _wiz = {
    categories: [], branding: null,
    project_name: '', category: '', description: '', official_url: '',
    geojsonFile: null, drawnGeoJSON: null, locationMode: 'file',
    coverFile: null, markdownText: '', docs: [],
    _map: null, _drawFeatures: [], _drawMode: null, _drawPoints: [],
    _mdEditor: null,
    _copilot: null,
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
        try { _wiz.markdownText = await fetch(item.markdown_url).then(r => r.ok ? r.text() : ''); } catch (e) { console.warn('[admin-contrib] fetch markdown for edit', e); }
      }
    } catch (e) {
      console.warn('[admin-contrib] load contribution for edit', e);
      toast('Erreur de chargement', 'error');
      router.navigate('/admin/contributions/');
      return;
    }
  }

  _renderOnePage(container);
}

function _initDrawMap(body) {
  const container = body.querySelector('#cw-map');
  if (!container || _wiz._map) return;
  if (typeof maplibregl === 'undefined') {
    toast('MapLibre non chargé — impossible d\'afficher la carte', 'error');
    return;
  }

  // Wait until the container has real dimensions before creating the map.
  // MapLibre reads the container size at `new Map()` time — if the flex layout
  // hasn't been calculated yet the canvas is created at 0×0.
  function _createMap() {
    if (_wiz._map) return; // guard against double-init

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
      scrollZoom: false,
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

    _wiz._map = map;

    map.on('load', () => {
      map.addSource('draw-features', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({ id: 'draw-fills', type: 'fill', source: 'draw-features', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#4E2BFF', 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'draw-lines', type: 'line', source: 'draw-features', filter: ['in', '$type', 'LineString', 'Polygon'], paint: { 'line-color': '#4E2BFF', 'line-width': 3 } });
      map.addLayer({ id: 'draw-points', type: 'circle', source: 'draw-features', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#4E2BFF', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

      map.addSource('draw-active', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({ id: 'draw-active-line', type: 'line', source: 'draw-active', paint: { 'line-color': '#FF6B35', 'line-width': 2, 'line-dasharray': [3, 2] } });
      map.addLayer({ id: 'draw-active-pts', type: 'circle', source: 'draw-active', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#FF6B35', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

      if (_wiz._drawFeatures.length > 0) {
        _updateDrawSource();
      }
      _renderDrawPanel(body);
    });

    map.on('click', (e) => _handleMapClick(body, e));
    _bindDrawToolbar(body);
  }

  _createMap();
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
    _wiz._drawMode = null;
    _setMapCursor('');
    _updateDrawSource();
    _renderDrawPanel(body);
    return;
  }

  // Line or Polygon — accumulate points
  _wiz._drawPoints.push([lng, lat]);
  _updateActiveDrawLine();
  _renderDrawPanel(body);
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

  _wiz._drawMode = null;
  _setMapCursor('');
  _updateDrawSource();
  _renderDrawPanel(body);
}

function _updateDrawSource() {
  const map = _wiz._map;
  if (!map || !map.getSource('draw-features')) return;
  const fc = { type: 'FeatureCollection', features: _wiz._drawFeatures };
  map.getSource('draw-features').setData(fc);
  _wiz.drawnGeoJSON = _wiz._drawFeatures.length > 0 ? fc : null;
}

function _bindDrawToolbar(body) {
  // Double-click to finish line/polygon (map event, bound once)
  if (_wiz._map) {
    _wiz._map.on('dblclick', (e) => {
      if (_wiz._drawMode === 'line' || _wiz._drawMode === 'polygon') {
        e.preventDefault();
        _finishDrawing(body);
      }
    });
  }
}

function _renderDrawPanel(body, opts) {
  const panel = body.querySelector('#cw-draw-toolbar');
  if (!panel) return;

  const mode  = _wiz._drawMode;
  const pts   = _wiz._drawPoints.length;
  const feats = _wiz._drawFeatures.length;
  const fp    = opts && opts.forcePicker;

  const TOOLS = {
    marker:  { icon: 'fa-solid fa-map-pin',     label: 'Point',  color: '#6366f1' },
    line:    { icon: 'fa-solid fa-route',        label: 'Ligne',  color: '#0ea5e9' },
    polygon: { icon: 'fa-solid fa-draw-polygon', label: 'Zone',   color: '#10b981' },
  };

  if (!mode || fp) {
    if (feats === 0 || fp) {
      // ─ PICKER ──────────────────────────────────────────────
      panel.innerHTML = `
        <div class="cw-dtb cw-dtb--picker">
          <span class="cw-dtb__label">Outil de dessin</span>
          <div class="cw-dtb__tools">
            ${Object.entries(TOOLS).map(([key, t]) => `
              <button class="cw-dtb__tool" data-tool="${key}" style="--tc:${t.color};">
                <i class="${t.icon}"></i><span>${t.label}</span>
              </button>`).join('')}
          </div>
          ${fp && feats > 0 ? `<span class="cw-dtb__aside">${feats} élément${feats > 1 ? 's' : ''} existant${feats > 1 ? 's' : ''}</span>` : ''}
        </div>
      `;
    } else {
      // ─ DONE ────────────────────────────────────────────────
      const nPts  = _wiz._drawFeatures.filter(f => f.geometry.type === 'Point').length;
      const nLns  = _wiz._drawFeatures.filter(f => f.geometry.type === 'LineString').length;
      const nPoly = _wiz._drawFeatures.filter(f => f.geometry.type === 'Polygon').length;
      const badges = [];
      if (nPts)  badges.push(`<span class="cw-feat-badge"><i class="fa-solid fa-map-pin"></i> ${nPts} point${nPts > 1 ? 's' : ''}</span>`);
      if (nLns)  badges.push(`<span class="cw-feat-badge"><i class="fa-solid fa-route"></i> ${nLns} ligne${nLns > 1 ? 's' : ''}</span>`);
      if (nPoly) badges.push(`<span class="cw-feat-badge"><i class="fa-solid fa-draw-polygon"></i> ${nPoly} zone${nPoly > 1 ? 's' : ''}</span>`);
      panel.innerHTML = `
        <div class="cw-dtb cw-dtb--done">
          <i class="fa-solid fa-circle-check cw-dtb__done-ico"></i>
          <span class="cw-dtb__done-label">Tracé enregistré</span>
          <div class="cw-dtb__badges">${badges.join('')}</div>
          <div class="cw-dtb__actions">
            <button class="cw-dtb__btn" id="cw-draw-add-more"><i class="fa-solid fa-plus"></i> Ajouter</button>
            <button class="cw-dtb__icon-btn" id="cw-draw-undo-feat" title="Annuler le dernier élément"><i class="fa-solid fa-rotate-left"></i></button>
            <button class="cw-dtb__icon-btn cw-dtb__icon-btn--danger" id="cw-draw-clear-all" title="Tout effacer"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    }
  } else {
    // ─ DRAWING ─────────────────────────────────────────────
    const t = TOOLS[mode];
    const minPts = mode === 'polygon' ? 3 : 2;
    const canFinish = mode !== 'marker' && pts >= minPts;
    const statusMsg = mode === 'marker'
      ? 'Cliquez sur la carte pour poser le point'
      : pts === 0
        ? 'Cliquez sur la carte pour commencer'
        : canFinish
          ? `<strong>${pts}</strong> points — double-clic ou cliquez Terminer`
          : `<strong>${pts}\u202f/\u202f${minPts}</strong> points minimum`;

    panel.innerHTML = `
      <div class="cw-dtb cw-dtb--active">
        <button class="cw-dtb__back" id="cw-draw-cancel-tool" title="Changer d'outil">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="cw-dtb__active-tool" style="--tc:${t.color};">
          <i class="${t.icon}"></i>
          <strong>${t.label}</strong>
        </div>
        <div class="cw-dtb__sep"></div>
        <div class="cw-dtb__status">
          <span class="cw-dtb__pulse"></span>
          <span>${statusMsg}</span>
        </div>
        <div class="cw-dtb__actions">
          ${pts > 0 && mode !== 'marker' ? `
            <button class="cw-dtb__btn cw-dtb__btn--ghost" id="cw-draw-undo-pt">
              <i class="fa-solid fa-rotate-left"></i> Annuler
            </button>` : ''}
          ${canFinish ? `
            <button class="cw-dtb__btn cw-dtb__btn--primary" id="cw-draw-finish-btn">
              <i class="fa-solid fa-check"></i> Terminer
            </button>` : ''}
        </div>
      </div>
    `;
  }

  panel.querySelectorAll('.cw-dtb__tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_wiz._drawPoints.length > 0) _finishDrawing(body);
      _wiz._drawMode = btn.dataset.tool;
      _setMapCursor('crosshair');
      _renderDrawPanel(body);
    });
  });
  panel.querySelector('#cw-draw-add-more')?.addEventListener('click', () => {
    _renderDrawPanel(body, { forcePicker: true });
  });
  panel.querySelector('#cw-draw-undo-feat')?.addEventListener('click', () => {
    if (_wiz._drawFeatures.length > 0) {
      _wiz._drawFeatures.pop();
      _updateDrawSource();
      _renderDrawPanel(body);
    }
  });
  panel.querySelector('#cw-draw-clear-all')?.addEventListener('click', () => {
    _wiz._drawFeatures = [];
    _wiz._drawPoints = [];
    if (_wiz._map?.getSource('draw-active')) {
      _wiz._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
    }
    _updateDrawSource();
    _renderDrawPanel(body);
  });
  panel.querySelector('#cw-draw-cancel-tool')?.addEventListener('click', () => {
    _wiz._drawMode = null;
    _wiz._drawPoints = [];
    if (_wiz._map?.getSource('draw-active')) {
      _wiz._map.getSource('draw-active').setData({ type: 'FeatureCollection', features: [] });
    }
    _setMapCursor('');
    _renderDrawPanel(body);
  });
  panel.querySelector('#cw-draw-undo-pt')?.addEventListener('click', () => {
    if (_wiz._drawPoints.length > 0) {
      _wiz._drawPoints.pop();
      _updateActiveDrawLine();
      _renderDrawPanel(body);
    }
  });
  panel.querySelector('#cw-draw-finish-btn')?.addEventListener('click', () => {
    _finishDrawing(body);
  });
}
function _setMapCursor(cursor) {
  if (_wiz._map) _wiz._map.getCanvas().style.cursor = cursor;
}

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
    } catch (e) {
      console.warn('[admin-contrib] parse GeoJSON file', e);
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
    // Révoquer l'ancienne ObjectURL pour éviter les fuites mémoire
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
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
    list.innerHTML = '<div class="cw-docs-empty"><i class="fa-solid fa-file-pdf"></i> Aucun document ajouté</div>';
    return;
  }

  list.innerHTML = _wiz.docs.map((d, i) => `
    <div class="cw-doc-item">
      <i class="fa-solid fa-file-pdf"></i>
      <input type="text" class="adm-input adm-input--sm cw-doc-title" value="${esc(d.title)}" data-idx="${i}" placeholder="Titre du document">
      <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" data-remove-doc="${i}" style="color:var(--danger);flex-shrink:0;">
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

function _slugify(str) {
  return (str || 'projet')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function _renderOnePage(container) {
  const isEdit = !!_wiz.editItem;
  const cats = _wiz.categories;

  const catPillsHTML = cats.length > 0
    ? cats.map(c => `
        <button type="button" class="cw-cat-pill ${_wiz.category === c.category ? 'cw-cat-pill--selected' : ''}"
          data-cat="${esc(c.category)}">
          <i class="${esc(c.icon_class || 'fa-solid fa-folder')}"></i>
          <span>${esc(c.category)}</span>
        </button>`).join('')
    : `<input type="text" class="adm-input" id="cw-cat-text" value="${esc(_wiz.category)}" placeholder="Nom de la catégorie">`;

  const hasExistingGeo = isEdit && !!_wiz.editItem?.geojson_url;
  const hasCover = isEdit && !!_wiz.editItem?.cover_url;

  container.innerHTML = `
    <!-- ── HEADER ──────────────────────────────────────────────── -->
    <div class="cw-header">
      <div class="cw-header__top">
        <a href="/admin/contributions/" class="cw-back-link" data-section="contributions">
          <i class="fa-solid fa-arrow-left"></i>
          <span>Contributions</span>
        </a>
      </div>
      <div class="cw-header__main">
        <div class="cw-header__text">
          <h1 class="cw-header__title">${isEdit ? 'Modifier la contribution' : 'Nouvelle contribution'}</h1>
          <p class="cw-header__subtitle">${isEdit ? esc(_wiz.project_name) : 'Complétez le formulaire ci-dessous — seuls les champs marqués d\'une <strong>étoile</strong> sont obligatoires.'}</p>
        </div>
      </div>
    </div>

    <!-- ── FORM SECTIONS ─────────────────────────────── -->
    <div class="cw-sections">

      <!-- ╭─ 1 · IDENTITÉ ─────────────────────────────╮ -->
      <section class="cw-section" id="cw-sect-identity" data-step="identity">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-tag"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Identité du projet</h2>
            <p class="cw-section__desc">Les informations essentielles pour identifier votre contribution</p>
          </div>

        </div>
        <div class="cw-section__body">
          <div class="cw-field">
            <label class="cw-field__label" for="cw-name">
              Nom du projet <span class="cw-required">*</span>
            </label>
            <input type="text" class="cw-field__input cw-field__input--hero" id="cw-name" autocomplete="off"
              value="${esc(_wiz.project_name)}" placeholder="Ex : Rénovation du parc central" maxlength="120">
            <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Choisissez un nom clair et descriptif — il sera affiché sur la carte publique.</p>
          </div>

          <div class="cw-field">
            <label class="cw-field__label">
              Catégorie <span class="cw-required">*</span>
            </label>
            <div class="cw-cat-grid" id="cw-cat-pills">${catPillsHTML}</div>
            <input type="hidden" id="cw-category" value="${esc(_wiz.category)}">
            <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> La catégorie détermine l'icône et la couleur sur la carte.</p>
          </div>

          <div class="cw-field">
            <label class="cw-field__label" for="cw-description">
              Description courte <span class="cw-optional">facultatif</span>
            </label>
            <textarea class="cw-field__textarea" id="cw-description" rows="3" maxlength="500"
              placeholder="En quelques mots, décrivez le projet, ses objectifs, son impact…">${esc(_wiz.description)}</textarea>
            <div class="cw-field__footer">
              <span class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Visible en aperçu dans les résultats de recherche.</span>
              <span class="cw-char-count" id="cw-desc-count">${_wiz.description.length} / 500</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ╭─ 2 · IMAGE DE COUVERTURE ──────────────────╮ -->
      <section class="cw-section" id="cw-sect-visual" data-step="visual">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-image"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Image de couverture</h2>
            <p class="cw-section__desc">Une photo qui illustre votre projet dans les listes et la carte</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>

        </div>
        <div class="cw-section__body">
          <div class="cw-cover-zone">
            <div class="cw-cover-preview" id="cw-cover-preview" ${hasCover ? '' : 'hidden'}>
              <img src="${hasCover ? esc(_wiz.editItem.cover_url) : ''}" alt="" id="cw-cover-img">
              <div class="cw-cover-overlay">
                <button type="button" class="cw-cover-overlay__btn" id="cw-cover-change-btn">
                  <i class="fa-solid fa-camera"></i> Changer l'image
                </button>
              </div>
            </div>
            <div class="cw-drop-area" id="cw-cover-drop" ${hasCover ? 'hidden' : ''}>
              <div class="cw-drop-area__illustration">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <div class="cw-drop-area__text">
                <span class="cw-drop-area__title">Glissez-déposez une image ici</span>
                <span class="cw-drop-area__hint">ou <u>cliquez pour parcourir</u> — JPG, PNG, WebP</span>
              </div>
            </div>
            <input type="file" id="cw-cover-file" accept="image/jpeg,image/png,image/webp" hidden>
          </div>
        </div>
      </section>

      <!-- ╭─ 3 · LOCALISATION ─────────────────────────╮ -->
      <section class="cw-section" id="cw-sect-location" data-step="location">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-map-location-dot"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Localisation <span class="cw-required">*</span></h2>
            <p class="cw-section__desc">Définissez l'emprise géographique du projet sur la carte</p>
          </div>

        </div>
        <div class="cw-section__body">
          ${hasExistingGeo ? `
            <div class="cw-notice cw-notice--success">
              <i class="fa-solid fa-check-circle"></i>
              <div>
                <strong>GeoJSON existant</strong>
                <span>— <a href="${esc(_wiz.editItem.geojson_url)}" target="_blank" rel="noopener">voir le tracé actuel</a>. Dessinez ou importez pour le remplacer.</span>
              </div>
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
          <div id="cw-loc-draw">
            <div class="cw-map-wrap">
              <div id="cw-map"></div>
              <div class="cw-map-instructions" id="cw-map-instructions">
                <i class="fa-solid fa-hand-pointer"></i>
                <span>Sélectionnez un outil de dessin ci-dessous, puis cliquez sur la carte</span>
              </div>
            </div>
            <div id="cw-draw-toolbar"></div>
          </div>

          <!-- File mode -->
          <div id="cw-loc-file" hidden>
            <div class="cw-drop-area cw-drop-area--geo" id="cw-geojson-drop">
              <div class="cw-drop-area__illustration">
                <i class="fa-solid fa-file-arrow-up"></i>
              </div>
              <div class="cw-drop-area__text">
                <span class="cw-drop-area__title">Déposez votre fichier GeoJSON</span>
                <span class="cw-drop-area__hint">ou <u>cliquez pour parcourir</u> — .geojson, .json</span>
              </div>
            </div>
            <input type="file" id="cw-geojson-file" accept=".geojson,.json" hidden>
            <div class="cw-file-result" id="cw-geojson-result" hidden>
              <div class="cw-file-result__info">
                <div class="cw-file-result__icon"><i class="fa-solid fa-file-code"></i></div>
                <div>
                  <div class="cw-file-result__name" id="cw-geojson-name"></div>
                  <div class="cw-file-result__meta" id="cw-geojson-meta"></div>
                </div>
              </div>
              <button type="button" class="cw-file-result__remove" id="cw-geojson-remove" title="Supprimer">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ╭─ 4 · DÉTAILS COMPLÉMENTAIRES ─────────────╮ -->
      <section class="cw-section" id="cw-sect-details" data-step="details">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-layer-group"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Informations complémentaires</h2>
            <p class="cw-section__desc">Enrichissez votre fiche avec un lien, un article ou des documents</p>
          </div>
          <span class="cw-optional-badge">Facultatif</span>

        </div>
        <div class="cw-section__body">

          <!-- URL officielle -->
          <div class="cw-field">
            <label class="cw-field__label" for="cw-official-url">
              <i class="fa-solid fa-link"></i> Lien officiel
            </label>
            <input type="url" class="cw-field__input" id="cw-official-url"
              value="${esc(_wiz.official_url)}" placeholder="https://maville.fr/mon-projet">
            <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Page de référence du projet (site officiel, délibération…)</p>
          </div>

          <!-- Article markdown -->
          <div class="cw-collapsible" id="cw-article-block">
            <button type="button" class="cw-collapsible__trigger" id="cw-md-toggle-btn">
              <div class="cw-collapsible__left">
                <i class="fa-solid fa-align-left"></i>
                <div>
                  <strong>Article de présentation</strong>
                  <span>Contenu riche avec images, liens et mise en forme</span>
                </div>
              </div>
              <label class="adm-switch" style="pointer-events:auto;">
                <input type="checkbox" id="cw-md-toggle" ${_wiz.markdownText ? 'checked' : ''}>
                <span class="adm-switch__track"></span>
              </label>
            </button>
            <div class="cw-collapsible__content cw-editor-wrap" id="cw-md-body" ${_wiz.markdownText ? '' : 'hidden'}>
              <div id="cw-editor"></div>
            </div>
          </div>

          <!-- Documents -->
          <div class="cw-docs-section">
            <div class="cw-docs-section__header">
              <div class="cw-docs-section__left">
                <i class="fa-solid fa-file-pdf"></i>
                <div>
                  <strong>Documents</strong>
                  <span>PDF de consultation publique, plans, rapports…</span>
                </div>
              </div>
              <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="cw-add-doc">
                <i class="fa-solid fa-plus"></i> Ajouter un PDF
              </button>
            </div>
            <div id="cw-docs-list"></div>
            <input type="file" id="cw-doc-file" accept="application/pdf" hidden>
          </div>
        </div>
      </section>

      <!-- ╭─ 5 · PUBLICATION ──────────────────────────╮ -->
      <section class="cw-section" id="cw-sect-publish" data-step="publish">
        <div class="cw-section__header">
          <div class="cw-section__icon"><i class="fa-solid fa-rocket"></i></div>
          <div class="cw-section__titles">
            <h2 class="cw-section__title">Publication</h2>
            <p class="cw-section__desc">Décidez de la visibilité de votre contribution</p>
          </div>
        </div>
        <div class="cw-section__body">
          ${store.isAdmin ? `
          <div class="cw-publish-toggle">
            <div class="cw-publish-toggle__info">
              <div class="cw-publish-toggle__icon cw-publish-toggle__icon--on" id="cw-publish-icon">
                <i class="fa-solid fa-eye"></i>
              </div>
              <div>
                <div class="cw-publish-toggle__title">Publier immédiatement</div>
                <div class="cw-publish-toggle__sub">La contribution sera visible sur la carte publique dès sa création</div>
              </div>
            </div>
            <label class="adm-switch adm-switch--lg">
              <input type="checkbox" id="cw-publish" checked>
              <span class="adm-switch__track"></span>
            </label>
          </div>
          ` : `
          <div class="cw-notice cw-notice--info">
            <i class="fa-solid fa-info-circle"></i>
            <div>
              <strong>Soumise à validation</strong>
              <span>Votre contribution sera examinée par un administrateur avant publication sur la carte.</span>
            </div>
          </div>
          `}
        </div>
      </section>

    </div><!-- /cw-sections -->

    <!-- ── FOOTER STICKY ──────────────────────────────── -->
    <div class="cw-footer">
      <a href="/admin/contributions/" class="cw-footer__cancel" data-section="contributions">
        <i class="fa-solid fa-arrow-left"></i> Retour
      </a>
      <button type="button" class="cw-footer__submit" id="cw-submit">
        <span class="cw-footer__submit-text">${isEdit ? 'Enregistrer les modifications' : 'Publier la contribution'}</span>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  `;

  _wiz.locationMode = 'draw';
  _bindOnePage(container);
  setTimeout(() => _initDrawMap(container), 200);
  if (_wiz.markdownText) setTimeout(() => _initMarkdownEditor(container), 60);
  _renderDocsList(container);

  // Assistant de rédaction IA — bouton intégré dans la barre footer
  const _footerEl = container.querySelector('.cw-footer');
  _wiz._copilot = new Copilot(container, {
    footer: _footerEl,
    city: store.city,
    getWizState: () => _wiz,
    onInsert: (target, text) => _handleCopilotInsert(container, target, text),
  });
}

function _handleCopilotInsert(container, target, text) {
  if (target === 'description') {
    const el = container.querySelector('#cw-description');
    if (el) {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('cw-field__input--valid');
      toast('Description insérée', 'success');
    }
  } else if (target === 'article') {
    _wiz.markdownText = text;
    const toggle = container.querySelector('#cw-md-toggle');
    const body = container.querySelector('#cw-md-body');
    // Enable the markdown section if not already
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      if (body) body.hidden = false;
    }
    // Set editor content (or init it with the text)
    if (_wiz._mdEditor) {
      _wiz._mdEditor.setMarkdown(text);
    } else {
      _initMarkdownEditor(container);
      // Wait for editor to be ready (poll up to 2s)
      let tries = 0;
      const waitEditor = setInterval(() => {
        tries++;
        if (_wiz._mdEditor) {
          clearInterval(waitEditor);
          _wiz._mdEditor.setMarkdown(text);
        } else if (tries > 20) {
          clearInterval(waitEditor);
          // Fallback: plain textarea
          const ta = container.querySelector('#cw-markdown');
          if (ta) ta.value = text;
        }
      }, 100);
    }
    container.querySelector('#cw-sect-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Article inséré', 'success');
  }
}

function _bindOnePage(container) {
  // Name input — live validation
  const nameInput = container.querySelector('#cw-name');
  nameInput?.addEventListener('input', () => {
    const val = nameInput.value.trim();
    nameInput.classList.toggle('cw-field__input--valid', val.length > 0);
    nameInput.classList.toggle('cw-field__input--empty', val.length === 0);
  });
  // Trigger initial state
  if (nameInput?.value.trim()) nameInput.classList.add('cw-field__input--valid');

  // Category pills
  container.querySelectorAll('.cw-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.cw-cat-pill').forEach(p => p.classList.remove('cw-cat-pill--selected'));
      pill.classList.add('cw-cat-pill--selected');
      const catInput = container.querySelector('#cw-category');
      if (catInput) catInput.value = pill.dataset.cat;
      _wiz.category = pill.dataset.cat;
    });
  });

  // Description char counter
  const descEl = container.querySelector('#cw-description');
  const countEl = container.querySelector('#cw-desc-count');
  descEl?.addEventListener('input', () => {
    if (countEl) {
      const len = descEl.value.length;
      countEl.textContent = `${len} / 500`;
      countEl.classList.toggle('cw-char-count--warn', len > 450);
    }
  });

  // Location mode toggle
  container.querySelectorAll('.cw-loc-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      _wiz.locationMode = mode;
      container.querySelectorAll('.cw-loc-toggle__btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      container.querySelector('#cw-loc-draw').hidden = (mode !== 'draw');
      container.querySelector('#cw-loc-file').hidden = (mode !== 'file');
      if (mode === 'draw' && !_wiz._map) {
        setTimeout(() => _initDrawMap(container), 50);
      }
    });
  });

  if (_wiz.geojsonFile) _showGeojsonResult(container, _wiz.geojsonFile.name, null);
  _bindFileUpload(container);
  _bindCoverUpload(container);

  // Markdown toggle
  const mdToggle = container.querySelector('#cw-md-toggle');
  const mdBody = container.querySelector('#cw-md-body');
  mdToggle?.addEventListener('change', (e) => {
    if (mdBody) mdBody.hidden = !e.target.checked;
    if (e.target.checked && !_wiz._mdEditor) {
      setTimeout(() => _initMarkdownEditor(container), 50);
    } else if (!e.target.checked && _wiz._mdEditor) {
      _wiz.markdownText = _wiz._mdEditor.getMarkdown() || '';
    }
  });
  // Also allow clicking the trigger bar (not just the switch)
  container.querySelector('#cw-md-toggle-btn')?.addEventListener('click', (e) => {
    if (e.target.closest('.adm-switch')) return; // let the switch handle itself
    if (mdToggle) { mdToggle.checked = !mdToggle.checked; mdToggle.dispatchEvent(new Event('change')); }
  });

  // Publish toggle icon swap
  const publishToggle = container.querySelector('#cw-publish');
  publishToggle?.addEventListener('change', () => {
    const icon = container.querySelector('#cw-publish-icon');
    if (icon) {
      icon.classList.toggle('cw-publish-toggle__icon--on', publishToggle.checked);
      icon.classList.toggle('cw-publish-toggle__icon--off', !publishToggle.checked);
      icon.innerHTML = publishToggle.checked
        ? '<i class="fa-solid fa-eye"></i>'
        : '<i class="fa-solid fa-eye-slash"></i>';
    }
  });

  _bindDocUpload(container);

  // Step nav scroll removed

  container.querySelector('#cw-submit')?.addEventListener('click', () => _submitOnePage(container));
}

function _validateForm(container) {
  const name = container.querySelector('#cw-name')?.value?.trim();
  if (!name) {
    toast('Le nom du projet est obligatoire', 'error');
    container.querySelector('#cw-name')?.focus();
    container.querySelector('#cw-sect-identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    container.querySelector('#cw-name')?.classList.add('cw-field__input--error');
    return false;
  }
  const catVal = (container.querySelector('#cw-category')?.value || container.querySelector('#cw-cat-text')?.value || '').trim();
  if (!catVal) {
    toast('Veuillez choisir une catégorie', 'error');
    container.querySelector('#cw-sect-identity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return false;
  }
  const hasGeo = !!_wiz.drawnGeoJSON || !!_wiz.geojsonFile || (!!_wiz.editItem?.geojson_url);
  if (!hasGeo) {
    toast('Le tracé géographique est obligatoire — dessinez ou importez un fichier', 'error');
    container.querySelector('#cw-sect-location')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return false;
  }
  return true;
}

async function _submitOnePage(container) {
  if (!_validateForm(container)) return;

  // Read form values from DOM
  _wiz.project_name = container.querySelector('#cw-name')?.value?.trim() || '';
  _wiz.category = (container.querySelector('#cw-category')?.value || container.querySelector('#cw-cat-text')?.value || '').trim();
  _wiz.description = container.querySelector('#cw-description')?.value?.trim() || '';
  _wiz.official_url = container.querySelector('#cw-official-url')?.value?.trim() || '';
  if (_wiz._mdEditor) _wiz.markdownText = _wiz._mdEditor.getMarkdown() || '';

  const submitBtn = container.querySelector('#cw-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';
  }

  const isEdit = !!_wiz.editItem;
  const publishNow = store.isAdmin ? (container.querySelector('#cw-publish')?.checked ?? true) : false;

  try {
    let rowId;

    if (isEdit) {
      rowId = _wiz.editItem.id;
      await api.updateContribution(rowId, {
        project_name: _wiz.project_name,
        category: _wiz.category,
        description: _wiz.description || null,
        official_url: _wiz.official_url || null,
      });
    } else {
      rowId = await api.createContributionRow(
        _wiz.project_name, _wiz.category, null,
        _wiz.description || null, _wiz.official_url || null, []
      );
      if (!rowId) throw new Error('Impossible de créer la contribution');
    }

    // GeoJSON
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

    if (_wiz.coverFile) await api.uploadCover(_wiz.coverFile, _wiz.category, _wiz.project_name, rowId);

    const md = (_wiz.markdownText || '').trim();
    if (md) {
      const mdBlob = new Blob([md], { type: 'text/markdown' });
      await api.uploadMarkdown(mdBlob, _wiz.category, _wiz.project_name, rowId);
    }

    if (_wiz.docs.length > 0) {
      const uploaded = [];
      for (const d of _wiz.docs) {
        try {
          const url = await api.uploadConsultationPdf(d.file, _wiz.category, _wiz.project_name, rowId);
          if (url) uploaded.push({ title: d.title || 'Document', pdf_url: url });
        } catch (err) { console.warn('[contrib] PDF upload error:', err); }
      }
      if (uploaded.length > 0) await api.insertConsultationDossiers(_wiz.project_name, _wiz.category, uploaded, rowId);
    }

    if (!isEdit && publishNow) await api.approveContribution(rowId, true);

    toast(isEdit ? 'Contribution mise à jour' : 'Contribution créée', 'success');
    router.navigate('/admin/contributions/');
  } catch (err) {
    console.error('[admin/contributions] submit:', err);
    toast(err.message || 'Erreur lors de la création', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${isEdit ? 'Enregistrer les modifications' : 'Créer la contribution'}`;
    }
  }
}
