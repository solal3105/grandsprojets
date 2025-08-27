// modules/contrib.js
;(function (win) {
  function setupContrib() {
    const contribToggle   = document.getElementById('nav-contribute');
    const contribOverlay  = document.getElementById('contrib-overlay');
    const contribCloseBtn = document.getElementById('contrib-close');
    const contribModal    = contribOverlay ? contribOverlay.querySelector('.gp-modal') : null;

    let contribLastFocus  = null;
    let contribCloseTimer = null;

    // Drawing state for geometry input (modale contribution)
    let drawMap = null;
    let drawLayer = null;      // finalized geometry layer (can be L.GeoJSON or vector layer)
    let drawLayerDirty = false; // whether current drawLayer was created/modified by user during this session
    let drawActive = false;    // whether we are currently capturing points
    let drawType = null;       // 'LineString' | 'Polygon'
    let tempLine = null;       // preview line while drawing
    let tempPoly = null;       // preview polygon while drawing
    let drawPoints = [];       // collected LatLng points during drawing

    const closeContrib = () => {
      if (!contribOverlay) return;
      if (contribCloseTimer) { clearTimeout(contribCloseTimer); contribCloseTimer = null; }
      if (contribModal) contribModal.classList.remove('is-open');
      contribOverlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', contribEscHandler);
      document.body.style.overflow = '';
      contribCloseTimer = setTimeout(() => {
        contribOverlay.style.display = 'none';
        if (contribLastFocus && typeof contribLastFocus.focus === 'function') {
          try { contribLastFocus.focus(); } catch (_) {}
        }
      }, 180);
    };

    const openContrib = () => {
      if (!contribOverlay) return;
      if (contribCloseTimer) { clearTimeout(contribCloseTimer); contribCloseTimer = null; }
      contribLastFocus = document.activeElement;
      contribOverlay.style.display = 'flex';
      contribOverlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => { if (contribModal) contribModal.classList.add('is-open'); });
      // Focus sur le bouton fermer pour l’accessibilité
      if (contribCloseBtn && typeof contribCloseBtn.focus === 'function') {
        try { contribCloseBtn.focus(); } catch (_) {}
      }
      document.addEventListener('keydown', contribEscHandler);
      // Assurer le bon rendu de la carte de dessin si visible
      setTimeout(() => {
        try { if (drawMap) drawMap.invalidateSize(); } catch (_) {}
      }, 200);
    };

    const contribEscHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContrib();
      }
    };

    if (contribToggle) {
      contribToggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
          if (session && session.user) {
            openContrib();
          }
        } catch (_) {
          // En cas d'erreur de session, on redirige vers la connexion
          win.location.href = '/login/';
        }
      });
    }

    if (contribCloseBtn) {
      contribCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContrib();
      });
    }

    if (contribOverlay) {
      contribOverlay.addEventListener('click', (e) => {
        if (e.target === contribOverlay) {
          closeContrib();
        }
      });
    }

    // —— Minimal contribution form wiring ——
    const form = document.getElementById('contrib-form');
    const statusEl = document.getElementById('contrib-status');
    const cityEl = document.getElementById('contrib-city');
    const addDocBtn = document.getElementById('contrib-doc-add');
    const docsFieldset = document.getElementById('contrib-docs');
    const existingDocsEl = document.getElementById('contrib-existing-docs');

    // Geometry input UI elements
    const geomModeFieldset = document.getElementById('contrib-geom-mode');
    const geomModeRadios = geomModeFieldset ? geomModeFieldset.querySelectorAll('input[name="contrib-geom-mode"]') : [];
    const fileRowEl = document.getElementById('contrib-file-row');
    const drawPanelEl = document.getElementById('contrib-draw-panel');
    const drawMapContainerId = 'contrib-draw-map';
    const drawBtnLine = document.getElementById('draw-line');
    const drawBtnPolygon = document.getElementById('draw-polygon');
    const drawBtnUndo = document.getElementById('draw-undo');
    const drawBtnFinish = document.getElementById('draw-finish');
    const drawBtnClear = document.getElementById('draw-clear');

    // Tabs & list state
    const tabCreateBtn = document.getElementById('contrib-tab-create');
    const tabListBtn   = document.getElementById('contrib-tab-list');
    const panelCreate  = document.getElementById('contrib-panel-create');
    const panelList    = document.getElementById('contrib-panel-list');
    const listEl       = document.getElementById('contrib-list');
    const listStatusEl = document.getElementById('contrib-list-status');
    const listSearchEl = document.getElementById('contrib-search');
    const listCatEl    = document.getElementById('contrib-filter-category');
    const listSortEl   = document.getElementById('contrib-sort');
    const listSentinel = document.getElementById('contrib-list-sentinel');
    const listMineOnlyEl = document.getElementById('contrib-mine-only');

    let currentEditId = null; // when set, the form is in edit mode
    let listState = {
      search: '',
      category: '',
      sortBy: 'created_at',
      sortDir: 'desc',
      page: 1,
      pageSize: 10,
      mineOnly: false,
      loading: false,
      done: false,
      items: []
    };

    // —— Official links fields visibility by category ——
    const createCatEl = document.getElementById('contrib-category');
    const grandlyonInput = document.getElementById('contrib-grandlyon-url');
    const sytralInput = document.getElementById('contrib-sytral-url');
    const grandlyonRow = grandlyonInput ? grandlyonInput.closest('.form-row') : null;
    const sytralRow = sytralInput ? sytralInput.closest('.form-row') : null;

    function updateOfficialLinkRows(category) {
      const cat = category || '';
      if (grandlyonRow) grandlyonRow.hidden = cat !== 'urbanisme';
      if (sytralRow) sytralRow.hidden = cat !== 'mobilite';
      if (grandlyonInput) grandlyonInput.disabled = cat !== 'urbanisme';
      if (sytralInput) sytralInput.disabled = cat !== 'mobilite';
    }

    if (createCatEl) {
      // Initial state based on default selection
      try { updateOfficialLinkRows(createCatEl.value || ''); } catch(_) {}
      createCatEl.addEventListener('change', (e) => {
        try { updateOfficialLinkRows((e && e.target && e.target.value) || ''); } catch(_) {}
      });
    }

    function slugify(str) {
      return (str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'geom';
    }

    function setStatus(msg, kind = 'info') {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.style.color = kind === 'error' ? 'var(--danger, #b00020)' : (kind === 'success' ? 'var(--success, #2e7d32)' : '');
    }

    // —— Accessible toast notifications ——
    const toastContainer = document.getElementById('toast-container');
    function showToast(message, kind = 'info') {
      if (!toastContainer || !message) return;
      const toast = document.createElement('div');
      const isError = kind === 'error';
      const isSuccess = kind === 'success';
      toast.setAttribute('role', isError ? 'alert' : 'status');
      toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
      toast.style.cssText = 'min-width:200px;max-width:360px;padding:10px 12px;border-radius:8px;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.15);font-size:14px;';
      toast.style.background = isError ? '#c62828' : (isSuccess ? '#2e7d32' : '#455a64');
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => {
        try { toast.style.opacity = '0'; toast.style.transition = 'opacity 200ms'; } catch(_){ }
        setTimeout(() => { try { toast.remove(); } catch(_){} }, 220);
      }, 4200);
    }

    function initDrawMap() {
      if (drawMap || !drawPanelEl) return;
      try {
        const container = document.getElementById(drawMapContainerId);
        if (!container) return;
        // Initialise Leaflet map
        drawMap = L.map(drawMapContainerId).setView([45.75, 4.85], 12);
        // Choose basemap similar to main map
        const bmList = win.basemaps || [];
        const defaultBm = bmList.find(b => b.default === true) || bmList[0];
        let baseUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        let attribution = '&copy; OpenStreetMap contributors';
        if (defaultBm && defaultBm.url) {
          baseUrl = defaultBm.url;
          attribution = defaultBm.attribution || attribution;
        }
        L.tileLayer(baseUrl, { attribution }).addTo(drawMap);

        // Map click to add points while drawing
        drawMap.on('click', (e) => {
          if (!drawActive || !drawType) return;
          drawPoints.push(e.latlng);
          if (drawType === 'LineString') {
            if (!tempLine) {
              tempLine = L.polyline(drawPoints, { color: '#ff5722', weight: 4, dashArray: '4,4' }).addTo(drawMap);
            } else {
              tempLine.setLatLngs(drawPoints);
            }
          } else if (drawType === 'Polygon') {
            if (!tempPoly) {
              tempPoly = L.polygon(drawPoints, { color: '#ff5722', weight: 3, dashArray: '4,4', fillOpacity: 0.2 }).addTo(drawMap);
            } else {
              tempPoly.setLatLngs([drawPoints]);
            }
          }
        });
      } catch (e) {
        console.warn('[contrib] initDrawMap error:', e);
      }
    }

    // —— Tabs logic (ARIA, keyboard) ——
    function activateTab(which) {
      const isCreate = which === 'create';
      if (tabCreateBtn) {
        tabCreateBtn.setAttribute('aria-selected', isCreate ? 'true' : 'false');
        tabCreateBtn.tabIndex = isCreate ? 0 : -1;
      }
      if (tabListBtn) {
        tabListBtn.setAttribute('aria-selected', !isCreate ? 'true' : 'false');
        tabListBtn.tabIndex = !isCreate ? 0 : -1;
      }
      if (panelCreate) panelCreate.hidden = !isCreate;
      if (panelList) panelList.hidden = isCreate;

      if (!isCreate) {
        // ensure list is initialized
        try { if (listEl && !listState.items.length) listResetAndLoad(); } catch(_) {}
        // focus first tabbable in list filters
        try { listSearchEl && listSearchEl.focus(); } catch(_) {}
      } else {
        // focus close button for accessibility or project name
        const nameEl = document.getElementById('contrib-project-name');
        try { (nameEl && nameEl.focus && nameEl.focus()); } catch(_) {}
      }
    }

    function handleTabClick(e) {
      if (e.currentTarget === tabCreateBtn) activateTab('create');
      else if (e.currentTarget === tabListBtn) activateTab('list');
    }

    function handleTabKeydown(e) {
      const tabs = [tabCreateBtn, tabListBtn].filter(Boolean);
      const idx = tabs.indexOf(e.currentTarget);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        let nextIdx = idx;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
        if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') nextIdx = 0;
        if (e.key === 'End') nextIdx = tabs.length - 1;
        const next = tabs[nextIdx];
        if (next) {
          next.focus();
          next.click();
        }
      }
    }

    if (tabCreateBtn) {
      tabCreateBtn.addEventListener('click', handleTabClick);
      tabCreateBtn.addEventListener('keydown', handleTabKeydown);
    }
    if (tabListBtn) {
      tabListBtn.addEventListener('click', handleTabClick);
      tabListBtn.addEventListener('keydown', handleTabKeydown);
    }

    // —— List helpers ——
    function setListStatus(msg) {
      if (listStatusEl) listStatusEl.textContent = msg || '';
    }

    // —— Custom delete confirmation modal ——
    function toStorageRelPathFromPublicUrl(url) {
      try {
        if (!url) return null;
        const marker = '/object/public/';
        const i = url.indexOf(marker);
        if (i === -1) {
          // fallback to basename
          try { return new URL(url, win.location.href).pathname.split('/').slice(-1)[0] || url; } catch (_) { return String(url); }
        }
        const after = url.slice(i + marker.length); // e.g., 'uploads/geojson/...'
        const prefix = 'uploads/';
        return after.startsWith(prefix) ? after.slice(prefix.length) : after;
      } catch (_) {
        return null;
      }
    }

    function openDeleteConfirmModal(details) {
      const { id, projectName, filePaths = [], dossiersCount = 0 } = details || {};
      return new Promise((resolve) => {
        console.log('[contrib] openDeleteConfirmModal', { id, projectName, filePaths, dossiersCount });
        const lastFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'presentation');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';

        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'delc-title');
        modal.setAttribute('aria-describedby', 'delc-desc');
        modal.style.cssText = 'max-width:560px;width:92%;background:#fff;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,0.25);padding:16px 18px;font-size:15px;color:#263238;';

        const title = document.createElement('h2');
        title.id = 'delc-title';
        title.textContent = `Supprimer la contribution ${projectName ? `« ${projectName} »` : `#${id}`} ?`;
        title.style.cssText = 'margin:0 0 8px 0;font-size:18px;';

        const desc = document.createElement('div');
        desc.id = 'delc-desc';
        desc.innerHTML = `
          <p>Cette action est définitive. Elle supprimera les éléments suivants :</p>
          <ul style="margin:0 0 8px 18px;">
            <li>La ligne <code>contribution_uploads</code> (id : <strong>#${id}</strong>)</li>
            ${filePaths.length ? filePaths.map(p => `<li>Fichier de stockage : <code>${p}</code></li>`).join('') : '<li>Aucun fichier de stockage associé.</li>'}
            <li>Dossiers de concertation liés : <strong>${dossiersCount}</strong></li>
          </ul>
          <p>Voulez-vous continuer ?</p>
        `;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:12px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.15);background:#fff;';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Supprimer';
        confirmBtn.style.cssText = 'padding:8px 12px;border-radius:8px;border:0;background:#c62828;color:#fff;';

        const close = (result) => {
          try { document.removeEventListener('keydown', onKey); } catch(_){}
          try { overlay.remove(); } catch(_){}
          try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch(_){}
          resolve(!!result);
        };

        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); close(false); }
          if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
        };

        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        modal.appendChild(title);
        modal.appendChild(desc);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        try { document.addEventListener('keydown', onKey); } catch(_){}
        try { cancelBtn.focus(); } catch(_){}
      });
    }

    // Shared delete flow for both list items and edit button
    async function doDeleteContribution(id, projectName) {
      try {
        console.log('[contrib] doDeleteContribution called', { id, projectName });
        if (!id) { console.log('[contrib] doDeleteContribution: missing id, abort'); return; }
        // Fetch row details for richer confirmation content
        let row = null;
        try { row = await (win.supabaseService && win.supabaseService.getContributionById(id)); } catch(_) {}
        const effectiveName = (row && row.project_name) || projectName || '';
        const filePaths = [];
        try {
          if (row && row.geojson_url) { const p = toStorageRelPathFromPublicUrl(row.geojson_url); if (p) filePaths.push(p); }
          if (row && row.cover_url)   { const p = toStorageRelPathFromPublicUrl(row.cover_url);   if (p) filePaths.push(p); }
          if (row && row.markdown_url){ const p = toStorageRelPathFromPublicUrl(row.markdown_url);if (p) filePaths.push(p); }
        } catch(_) {}
        let dossiersCount = 0;
        try {
          if (effectiveName && win.supabaseService && typeof win.supabaseService.getConsultationDossiersByProject === 'function') {
            const ds = await win.supabaseService.getConsultationDossiersByProject(effectiveName);
            if (Array.isArray(ds)) dossiersCount = ds.length;
          }
        } catch(_) {}
        console.log('[contrib] showing custom delete confirm modal');
        const ok = await openDeleteConfirmModal({ id, projectName: effectiveName, filePaths, dossiersCount });
        console.log('[contrib] confirm response', ok);
        if (!ok) { console.log('[contrib] user canceled deletion'); return; }
        setListStatus('Suppression en cours…');
        console.log('[contrib] set aria-busy on list');
        try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
        // Ensure authenticated session
        console.log('[contrib] requesting session via AuthModule.requireAuthOrRedirect');
        const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
        console.log('[contrib] session result', { hasSession: !!session, hasUser: !!(session && session.user) });
        if (!session || !session.user) { console.log('[contrib] no session/user, likely redirected to /login, aborting'); return; } // redirected
        console.log('[contrib] calling supabaseService.deleteContribution', { id });
        const result = await (win.supabaseService && win.supabaseService.deleteContribution(id));
        console.log('[contrib] deleteContribution result', result);
        setListStatus('');
        if (!result || result.success !== true) {
          console.log('[contrib] deletion failed branch');
          showToast('Échec de la suppression.', 'error');
          return;
        }
        // If we were editing this row, exit edit mode
        if (currentEditId === id) {
          console.log('[contrib] deleting currently edited item, exiting edit mode', { currentEditId });
          try { exitEditMode(); } catch(_) {}
          setStatus('Contribution supprimée.', 'success');
        }
        showToast('Contribution supprimée.', 'success');
        console.log('[contrib] deletion success toast shown');
        // Refresh list if visible
        if (panelList && !panelList.hidden) { console.log('[contrib] refreshing list after delete'); listResetAndLoad(); }
      } catch (e) {
        console.warn('[contrib] delete error:', e);
        showToast('Erreur lors de la suppression.', 'error');
      } finally {
        try { if (listEl) { listEl.removeAttribute('aria-busy'); console.log('[contrib] cleaned aria-busy on list'); } } catch(_) {}
      }
    }

    function renderItem(item) {
      const el = document.createElement('div');
      el.className = 'contrib-list-item';
      el.setAttribute('role', 'listitem');
      el.style.display = 'flex';
      el.style.gap = '10px';
      el.style.width = '100%';
      el.style.textAlign = 'left';
      el.style.padding = '8px';
      el.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
      const cover = item.cover_url ? `<img src="${item.cover_url}" alt="" style="width:54px;height:40px;object-fit:cover;border-radius:4px;"/>` : '';
      const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
      el.innerHTML = `
        ${cover}
        <div class="contrib-item-main" role="button" tabindex="0" style="flex:1 1 auto; cursor:pointer;">
          <div style="font-weight:600;">${item.project_name || '(sans nom)'} <span style="font-size:0.85em;opacity:0.75;">· ${item.category || ''}</span></div>
          <div style="font-size:0.85em;opacity:0.8;">Créé le: ${when}</div>
          ${item.meta ? `<div style=\"font-size:0.85em;opacity:0.85;\">${item.meta}</div>` : ''}
        </div>
        <div class="contrib-item-actions" style="display:flex; align-items:center;">
          <button type="button" class="contrib-item-delete" aria-label="Supprimer" title="Supprimer"
            style="padding:6px 8px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; background:#fff; color:#c62828;">
            <i class="fa fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      `;
      const main = el.querySelector('.contrib-item-main');
      const delBtn = el.querySelector('.contrib-item-delete');
      if (main) main.addEventListener('click', async () => {
        try {
          setListStatus('Chargement…');
          const row = await (win.supabaseService && win.supabaseService.getContributionById(item.id));
          setListStatus('');
          if (row) {
            enterEditMode(row);
            activateTab('create');
          }
        } catch (e) {
          setListStatus('Erreur de chargement.');
          showToast('Erreur lors du chargement de la contribution.', 'error');
        }
      });
      if (main) main.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          main.click();
        }
      });
      if (delBtn) delBtn.addEventListener('click', (ev) => {
        console.log('[contrib] click delete in listing', { id: item.id, project_name: item.project_name });
        ev.stopPropagation();
        doDeleteContribution(item.id, item.project_name);
      });
      return el;
    }

    async function listResetAndLoad() {
      if (!listEl) return;
      listEl.innerHTML = '';
      // Keep sentinel at end
      if (listSentinel) listEl.appendChild(listSentinel);
      listState.page = 1; listState.done = false; listState.items = [];
      await listLoadMore();
    }

    async function listLoadMore() {
      if (listState.loading || listState.done) return;
      listState.loading = true;
      setListStatus('Chargement…');
      try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
      try {
        const { search, category, sortBy, sortDir, page, pageSize, mineOnly } = listState;
        const res = await (win.supabaseService && win.supabaseService.listContributions({
          search, category, page, pageSize, mineOnly, sortBy, sortDir
        }));
        const items = (res && res.items) ? res.items : [];
        if (!items.length) {
          if (page === 1) setListStatus('Aucune contribution.');
          listState.done = true;
        } else {
          setListStatus('');
          listState.items.push(...items);
          items.forEach(it => {
            const node = renderItem(it);
            if (listSentinel && listSentinel.parentNode === listEl) {
              listEl.insertBefore(node, listSentinel);
            } else {
              listEl.appendChild(node);
            }
          });
          listState.page += 1;
          if (items.length < listState.pageSize) listState.done = true;
        }
      } catch (e) {
        setListStatus('Erreur lors du chargement.');
        showToast('Erreur lors du chargement des contributions.', 'error');
      } finally {
        listState.loading = false;
        try { if (listEl) listEl.removeAttribute('aria-busy'); } catch(_) {}
      }
    }

    let io = null;
    function initInfiniteScroll() {
      if (!listEl || !listSentinel) return;
      try { if (io) { io.disconnect(); io = null; } } catch(_) {}
      io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) listLoadMore();
        });
      }, { root: listEl, threshold: 0.1 });
      io.observe(listSentinel);
    }

    // Filters listeners with debounce
    let debounceTimer = null;
    function debouncedReset() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { listResetAndLoad(); }, 250);
    }
    if (listSearchEl) listSearchEl.addEventListener('input', () => { listState.search = listSearchEl.value || ''; debouncedReset(); });
    if (listCatEl) listCatEl.addEventListener('change', () => { listState.category = listCatEl.value || ''; debouncedReset(); });
    if (listSortEl) listSortEl.addEventListener('change', () => {
      const v = listSortEl.value || 'created_at:desc';
      const [by, dir] = v.split(':');
      const mapped = (by === 'updated_at') ? 'created_at' : (by || 'created_at');
      listState.sortBy = mapped;
      listState.sortDir = (dir === 'asc') ? 'asc' : 'desc';
      debouncedReset();
    });
    if (listMineOnlyEl) listMineOnlyEl.addEventListener('change', () => {
      listState.mineOnly = !!listMineOnlyEl.checked;
      debouncedReset();
    });

    // Initialize infinite scroll once
    initInfiniteScroll();

    // —— Edit mode helpers ——
    const cancelEditBtn = document.getElementById('contrib-cancel-edit');
    const deleteEditBtn = document.getElementById('contrib-delete');
    const coverPreview  = document.getElementById('contrib-cover-preview');

    function setEditUI(on) {
      const submitBtn = document.getElementById('contrib-submit');
      const nameEl = document.getElementById('contrib-project-name');
      if (submitBtn) submitBtn.querySelector('span')?.replaceChildren(document.createTextNode(on ? 'Enregistrer' : 'Envoyer'));
      if (cancelEditBtn) cancelEditBtn.style.display = on ? '' : 'none';
      if (deleteEditBtn) deleteEditBtn.style.display = on ? '' : 'none';
      if (nameEl) nameEl.focus();
    }

    function prefillForm(row) {
      const nameEl = document.getElementById('contrib-project-name');
      const catEl  = document.getElementById('contrib-category');
      const citySel = document.getElementById('contrib-city');
      const metaEl = document.getElementById('contrib-meta');
      const descEl = document.getElementById('contrib-description');
      const mdEl   = document.getElementById('contrib-markdown');
      if (nameEl) nameEl.value = row.project_name || '';
      if (catEl) catEl.value = row.category || '';
      // Mettre à jour l'affichage des champs de liens officiels selon la catégorie pré-remplie
      try { updateOfficialLinkRows(catEl ? catEl.value : (row.category || '')); } catch(_) {}
      if (citySel && row && row.ville) {
        try { citySel.value = row.ville; } catch(_) {}
      }
      if (metaEl) metaEl.value = row.meta || '';
      if (descEl) descEl.value = row.description || '';
      if (coverPreview) {
        coverPreview.innerHTML = row.cover_url ? `<img src="${row.cover_url}" alt="Aperçu cover" style="max-height:80px;border-radius:6px;"/>` : '';
      }
      // Try fetching markdown content
      if (mdEl) {
        mdEl.value = '';
        if (row.markdown_url) {
          fetch(row.markdown_url).then(r => r.ok ? r.text() : '').then(txt => { if (typeof txt === 'string') mdEl.value = txt; }).catch(()=>{});
        }
      }
      // Geometry inputs: reset file and drawings (loading from server handled separately)
      const fileInput = document.getElementById('contrib-geojson');
      if (fileInput) { try { fileInput.value = ''; } catch(_){} }
      try { clearAllDrawings(); } catch(_) {}
    }

    function enterEditMode(row) {
      currentEditId = row.id;
      prefillForm(row);
      setStatus('Mode édition. Modifiez et cliquez sur Enregistrer.');
      setEditUI(true);
      // Preload server-side geometry on map if available
      if (row && row.geojson_url) {
        preloadGeometryOnMap(row.geojson_url);
      }
      // Load existing consultation dossiers related to the project name
      try { clearExistingDossiers(); renderExistingDossiers(row.project_name); } catch(_) {}
    }

    function exitEditMode() {
      currentEditId = null;
      try { form.reset(); } catch(_) {}
      if (coverPreview) coverPreview.innerHTML = '';
      setEditUI(false);
      setStatus('');
      try { clearAllDrawings(); } catch(_) {}
      try { setGeomMode('file'); } catch(_) {}
      try { clearExistingDossiers(); } catch(_) {}
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        exitEditMode();
      });
    }

    if (deleteEditBtn) {
      deleteEditBtn.addEventListener('click', async () => {
        console.log('[contrib] click delete in edit mode', { currentEditId });
        if (!currentEditId) { console.log('[contrib] deleteEditBtn: no currentEditId, abort'); return; }
        const projectName = document.getElementById('contrib-project-name')?.value?.trim();
        console.log('[contrib] edit mode delete: resolved projectName', { projectName });
        await doDeleteContribution(currentEditId, projectName);
      });
    }

    function setGeomMode(mode) {
      const fileInput = document.getElementById('contrib-geojson');
      if (mode === 'draw') {
        if (fileRowEl) fileRowEl.style.display = 'none';
        if (fileInput) {
          fileInput.required = false;
          fileInput.disabled = true;
          try { fileInput.value = ''; } catch(_) {}
        }
        if (drawPanelEl) drawPanelEl.style.display = '';
        initDrawMap();
        setTimeout(() => { try { if (drawMap) drawMap.invalidateSize(); } catch(_){} }, 50);
        // Démarrer automatiquement le mode dessin (ligne par défaut)
        resetTemp();
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawActive = true;
        drawType = 'LineString';
        try { if (drawMap) drawMap.getContainer().style.cursor = 'crosshair'; } catch(_){ }
        setStatus('Mode dessin actif (ligne). Cliquez sur la carte pour ajouter des points.');
        drawLayerDirty = false;
      } else {
        if (fileRowEl) fileRowEl.style.display = '';
        if (fileInput) { fileInput.required = true; fileInput.disabled = false; }
        if (drawPanelEl) drawPanelEl.style.display = 'none';
        // Revenir au mode fichier doit nettoyer tout dessin en cours
        try { clearAllDrawings(); } catch(_) {}
      }
    }

    function resetTemp() {
      drawPoints = [];
      if (tempLine) { try { drawMap.removeLayer(tempLine); } catch(_) {} tempLine = null; }
      if (tempPoly) { try { drawMap.removeLayer(tempPoly); } catch(_) {} tempPoly = null; }
    }

    function clearAllDrawings() {
      resetTemp();
      if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
      drawActive = false;
      drawType = null;
      try { if (drawMap) drawMap.getContainer().style.cursor = ''; } catch(_){ }
      drawLayerDirty = false;
    }

    // Preload existing geometry into the draw map in edit mode
    async function preloadGeometryOnMap(url) {
      try {
        setStatus('Chargement de la géométrie…');
        // Switch UI to draw mode and ensure map exists
        const drawRadio = Array.from(geomModeRadios || []).find(r => r.value === 'draw');
        if (drawRadio) { drawRadio.checked = true; }
        setGeomMode('draw');
        // Only display geometry; not interactive drawing
        drawActive = false; drawType = null; try { if (drawMap) drawMap.getContainer().style.cursor = ''; } catch(_){ }
        try { clearAllDrawings(); } catch(_) {}
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('GeoJSON non accessible');
        const gj = await resp.json();
        const style = { color: '#1976d2', weight: 3, fillOpacity: 0.2 };
        const pointToLayer = (feature, latlng) => L.circleMarker(latlng, { radius: 5, color: '#1976d2', weight: 2, fillOpacity: 0.7 });
        drawLayer = L.geoJSON(gj, { style, pointToLayer }).addTo(drawMap);
        try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_){ }
        drawLayerDirty = false; // Loaded from server; don't re-upload unless user redraws
        setStatus('Géométrie chargée depuis la contribution.', 'success');
      } catch (err) {
        console.warn('[contrib] preloadGeometryOnMap error:', err);
        setStatus('Impossible de charger la géométrie existante.', 'error');
        showToast('Impossible de charger la géométrie existante.', 'error');
      }
    }

    // Buttons handlers
    if (drawBtnLine) {
      drawBtnLine.addEventListener('click', () => {
        resetTemp();
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawActive = true;
        drawType = 'LineString';
        try { if (drawMap) drawMap.getContainer().style.cursor = 'crosshair'; } catch(_){}
        setStatus('Mode dessin: ligne. Cliquez sur la carte pour ajouter des points.');
      });
    }
    if (drawBtnPolygon) {
      drawBtnPolygon.addEventListener('click', () => {
        resetTemp();
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        drawActive = true;
        drawType = 'Polygon';
        try { if (drawMap) drawMap.getContainer().style.cursor = 'crosshair'; } catch(_){}
        setStatus('Mode dessin: polygone. Cliquez sur la carte pour ajouter des points.');
      });
    }
    if (drawBtnUndo) {
      drawBtnUndo.addEventListener('click', () => {
        if (!drawPoints.length) return;
        drawPoints.pop();
        if (drawType === 'LineString' && tempLine) tempLine.setLatLngs(drawPoints);
        if (drawType === 'Polygon' && tempPoly) tempPoly.setLatLngs([drawPoints]);
      });
    }
    if (drawBtnFinish) {
      drawBtnFinish.addEventListener('click', () => {
        if (!drawType) return;
        if (drawType === 'LineString' && drawPoints.length < 2) {
          setStatus('Ajoutez au moins 2 points pour une ligne.', 'error');
          return;
        }
        if (drawType === 'Polygon' && drawPoints.length < 3) {
          setStatus('Ajoutez au moins 3 points pour un polygone.', 'error');
          return;
        }
        if (drawLayer) { try { drawMap.removeLayer(drawLayer); } catch(_) {} drawLayer = null; }
        if (drawType === 'LineString') {
          drawLayer = L.polyline(drawPoints, { color: '#1976d2', weight: 4 }).addTo(drawMap);
        } else {
          drawLayer = L.polygon(drawPoints, { color: '#1976d2', weight: 3, fillOpacity: 0.2 }).addTo(drawMap);
        }
        try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_){}
        resetTemp();
        drawActive = false;
        drawType = null;
        try { if (drawMap) drawMap.getContainer().style.cursor = ''; } catch(_){ }
        setStatus('Géométrie finalisée. Vous pouvez soumettre la contribution.', 'success');
        drawLayerDirty = true;
      });
    }
    if (drawBtnClear) {
      drawBtnClear.addEventListener('click', () => {
        clearAllDrawings();
        setStatus('Dessin effacé.');
      });
    }

    // Mode change listeners
    if (geomModeRadios && geomModeRadios.length) {
      geomModeRadios.forEach(r => {
        r.addEventListener('change', () => {
          const checked = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
          setGeomMode(checked);
        });
      });
      // Initialize UI state
      const initialMode = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
      setGeomMode(initialMode);
    }

    function createDocRow() {
      const row = document.createElement('div');
      row.className = 'doc-row';
      row.innerHTML = `
        <input type="text" class="doc-title" placeholder="Titre du document PDF" />
        <input type="url" class="doc-url" placeholder="URL du PDF (https://...)" />
        <button type="button" class="doc-remove" aria-label="Supprimer">&times;</button>
      `;
      const removeBtn = row.querySelector('.doc-remove');
      removeBtn?.addEventListener('click', () => {
        row.remove();
      });
      return row;
    }

    function collectDocs() {
      if (!docsFieldset) return [];
      const rows = docsFieldset.querySelectorAll('.doc-row');
      const out = [];
      rows.forEach((row) => {
        const title = row.querySelector('.doc-title')?.value?.trim();
        const url = row.querySelector('.doc-url')?.value?.trim();
        if (title && url) out.push({ title, pdf_url: url });
      });
      return out;
    }

    // —— Existing consultation dossiers (display-only in edit mode) ——
    function clearExistingDossiers() {
      if (existingDocsEl) existingDocsEl.innerHTML = '';
    }

    async function renderExistingDossiers(projectName) {
      try {
        if (!existingDocsEl || !projectName) return;
        existingDocsEl.innerHTML = '';
        if (!win.supabaseService || typeof win.supabaseService.getConsultationDossiersByProject !== 'function') return;
        const dossiers = await win.supabaseService.getConsultationDossiersByProject(projectName);
        if (!Array.isArray(dossiers) || dossiers.length === 0) return;
        const uniq = new Map();
        dossiers.forEach(d => {
          if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
        });
        const docs = Array.from(uniq.values());
        if (!docs.length) return;
        // Build a simple list
        const wrap = document.createElement('div');
        wrap.className = 'existing-docs-wrap';
        const title = document.createElement('div');
        title.textContent = 'Dossiers liés trouvés :';
        title.style.cssText = 'font-weight:600;margin:4px 0;';
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:0;padding-left:18px;';
        docs.forEach(d => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = d.pdf_url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = d.title || d.pdf_url;
          li.appendChild(a);
          ul.appendChild(li);
        });
        wrap.appendChild(title);
        wrap.appendChild(ul);
        existingDocsEl.appendChild(wrap);
      } catch (e) {
        console.warn('[contrib] renderExistingDossiers error:', e);
      }
    }

    if (addDocBtn && docsFieldset) {
      addDocBtn.addEventListener('click', () => {
        const row = createDocRow();
        // Insert before the add button
        docsFieldset.insertBefore(row, addDocBtn);
      });
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (!form) return;

      const submitBtn = document.getElementById('contrib-submit');
      const projectName = document.getElementById('contrib-project-name')?.value?.trim();
      const category = document.getElementById('contrib-category')?.value;
      const fileInput = document.getElementById('contrib-geojson');
      const coverInput = document.getElementById('contrib-cover');
      const city = document.getElementById('contrib-city')?.value?.trim();
      const grandlyonUrl = document.getElementById('contrib-grandlyon-url')?.value?.trim();
      const sytralUrl = document.getElementById('contrib-sytral-url')?.value?.trim();
      const meta = document.getElementById('contrib-meta')?.value?.trim();
      const description = document.getElementById('contrib-description')?.value?.trim();
      const mdTextRaw = document.getElementById('contrib-markdown')?.value || '';
      const geomMode = (function(){
        const r = geomModeRadios && geomModeRadios.length ? Array.from(geomModeRadios).find(x => x.checked) : null;
        return r ? r.value : 'file';
      })();

      if (!projectName || !category || !city) {
        setStatus('Veuillez renseigner le nom, la catégorie et la ville.', 'error');
        return;
      }

      // Build potential GeoJSON upload only when creating or when explicitly provided in edit
      let fileForUpload = null;
      if (!currentEditId || (currentEditId && (geomMode === 'file' ? (fileInput && fileInput.files && fileInput.files.length) : (!!drawLayer && drawLayerDirty)))) {
        if (geomMode === 'file') {
          if (!fileInput || !fileInput.files?.length) {
            if (!currentEditId) { setStatus('Veuillez sélectionner un fichier GeoJSON.', 'error'); return; }
          } else {
            const file = fileInput.files[0];
            const nameLower = (file.name || '').toLowerCase();
            if (!nameLower.endsWith('.geojson') && !(file.type || '').includes('json')) {
              setStatus('Le fichier doit être un GeoJSON (.geojson ou JSON valide).', 'error');
              return;
            }
            fileForUpload = file;
          }
        } else if (geomMode === 'draw') {
          if (!drawLayer) {
            if (!currentEditId) { setStatus('Veuillez dessiner une géométrie (ligne ou polygone) avant de soumettre.', 'error'); return; }
          } else {
            try {
              const feature = drawLayer.toGeoJSON();
              const feat = feature.type === 'Feature' ? feature : { type: 'Feature', properties: {}, geometry: feature };
              const fc = { type: 'FeatureCollection', features: Array.isArray(feature.features) ? feature.features : [feat] };
              const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
              try { fileForUpload = new File([blob], `${slugify(projectName)}.geojson`, { type: 'application/geo+json' }); }
              catch (_) { fileForUpload = blob; }
            } catch (gerr) {
              setStatus('Impossible de convertir le dessin en GeoJSON.', 'error');
              return;
            }
          }
        } else {
          setStatus('Mode de saisie inconnu.', 'error');
          return;
        }
      }

      const coverFile = coverInput && coverInput.files && coverInput.files[0] ? coverInput.files[0] : null;

      setStatus('Envoi en cours…');
      if (submitBtn) submitBtn.disabled = true;
      try { if (form) form.setAttribute('aria-busy', 'true'); } catch(_) {}

      try {
        // Ensure authenticated session
        const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
        if (!session || !session.user) return; // redirected

        let rowId = currentEditId;
        if (!currentEditId) {
          // 0) Create row (create mode)
          try {
            if (win.supabaseService && typeof win.supabaseService.createContributionRow === 'function') {
              rowId = await win.supabaseService.createContributionRow(projectName, category, city);
            }
          } catch (e) {
            console.warn('[contrib] createContributionRow error:', e);
          }
          if (!rowId) {
            setStatus("Impossible de créer l'entrée de contribution. Réessayez plus tard.", 'error');
            showToast("Création impossible pour le moment.", 'error');
            if (submitBtn) submitBtn.disabled = false;
            return;
          }
        }

        // 1) Upload GeoJSON (fichier importé ou dessiné) vers Supabase Storage
        if (fileForUpload) {
          await (win.supabaseService && win.supabaseService.uploadGeoJSONToStorage(fileForUpload, category, projectName, rowId));
        }

        // 1b) Optional cover upload (non-blocking)
        if (coverFile) {
          try {
            await (win.supabaseService && win.supabaseService.uploadCoverToStorage(coverFile, category, projectName, rowId));
          } catch (coverErr) {
            console.warn('[contrib] cover upload error (non bloquant):', coverErr);
          }
        }

        // 1c) Optional Markdown upload (non-blocking)
        const mdText = (mdTextRaw || '').trim();
        if (mdText) {
          try {
            const mdBlob = new Blob([mdText], { type: 'text/markdown' });
            await (win.supabaseService && win.supabaseService.uploadMarkdownToStorage(mdBlob, category, projectName, rowId));
          } catch (mdErr) {
            console.warn('[contrib] markdown upload error (non bloquant):', mdErr);
          }
        }

        // 2) Optional links
        if (category === 'urbanisme' && grandlyonUrl) {
          await win.supabaseService.upsertGrandLyonLink(projectName, grandlyonUrl);
        }
        if (category === 'mobilite' && sytralUrl) {
          await win.supabaseService.upsertSytralLink(projectName, sytralUrl);
        }

        // 3) Optional consultation dossiers
        const docs = collectDocs();
        if (docs.length) {
          await win.supabaseService.insertConsultationDossiers(projectName, category, docs);
        }

        // 4) Patch core fields (edit or create)
        try {
          await (win.supabaseService && win.supabaseService.updateContribution(rowId, {
            project_name: projectName,
            category: category,
            ville: city,
            meta: meta || null,
            description: description || null
          }));
        } catch (patchErr) {
          console.warn('[contrib] updateContribution warning:', patchErr);
        }

        if (currentEditId) {
          setStatus('Modifications enregistrées.', 'success');
          showToast('Modifications enregistrées.', 'success');
          // Emit event for refresh
          try { window.dispatchEvent(new CustomEvent('contribution:updated', { detail: { id: rowId, project_name: projectName, category } })); } catch(_) {}
          // Keep modal open but exit edit mode
          exitEditMode();
          // Refresh list if visible
          if (panelList && !panelList.hidden) listResetAndLoad();
        } else {
          setStatus('Contribution enregistrée. Merci !', 'success');
          showToast('Contribution enregistrée. Merci !', 'success');
          try { form.reset(); } catch(_) {}
          // Nettoyer l'état de dessin et remettre l'UI en mode fichier par défaut
          try { clearAllDrawings(); } catch(_) {}
          try { setGeomMode('file'); } catch(_) {}
          // Close after a short delay
          setTimeout(() => { try { closeContrib(); } catch(_) {} }, 900);
        }
      } catch (err) {
        console.error('[contrib] submit error:', err);
        setStatus('Échec de l’envoi. Réessayez plus tard.', 'error');
        showToast('Échec de l’envoi de la contribution.', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        try { if (form) form.removeAttribute('aria-busy'); } catch(_) {}
      }
    }

    if (form) {
      form.addEventListener('submit', handleSubmit);
    }

    // Populate city selector from DB and default to active city
    async function populateCities() {
      try {
        if (!cityEl || !win.supabaseService || typeof win.supabaseService.listCities !== 'function') return;
        // temporary placeholder
        cityEl.innerHTML = '<option value="" disabled selected>Chargement…</option>';
        const cities = await win.supabaseService.listCities();
        const options = (Array.isArray(cities) && cities.length ? cities : ['lyon']).map(c => `<option value="${c}">${c}</option>`).join('');
        cityEl.innerHTML = options;
        // default selection
        const active = (win.activeCity || '').trim();
        if (active) {
          try { cityEl.value = active; } catch(_) {}
        }
      } catch (err) {
        console.warn('[contrib] populateCities error:', err);
        if (cityEl && !cityEl.options.length) {
          cityEl.innerHTML = '<option value="lyon" selected>lyon</option>';
        }
      }
    }

    try { populateCities(); } catch(_) {}

    // Ensure tab default is Create when opening
    // Open handler already focuses close btn; we set tab states explicitly here
    activateTab('create');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContrib);
  } else {
    setupContrib();
  }
})(window);
