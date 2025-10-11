// modules/contrib/contrib-list.js
// Gestion de la liste des contributions

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

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

  let io = null; // IntersectionObserver for infinite scroll

  // ============================================================================
  // LIST STATUS
  // ============================================================================

  /**
   * Définit le message de statut de la liste
   * @param {string} msg - Message à afficher
   * @param {HTMLElement} listStatusEl - Élément de statut
   */
  function setListStatus(msg, listStatusEl) {
    if (listStatusEl) listStatusEl.textContent = msg || '';
  }

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  /**
   * Efface l'état vide
   * @param {HTMLElement} listEl - Élément de liste
   */
  function clearEmptyState(listEl) {
    try {
      if (!listEl) return;
      const empty = listEl.querySelector('.contrib-empty');
      if (empty) empty.remove();
    } catch(_) {}
  }

  /**
   * Affiche l'état vide
   * @param {HTMLElement} listEl - Élément de liste
   * @param {HTMLElement} listSentinel - Sentinelle pour infinite scroll
   * @param {Function} onCreateClick - Callback au clic sur "Créer"
   */
  function renderEmptyState(listEl, listSentinel, onCreateClick) {
    try {
      if (!listEl) return;
      clearEmptyState(listEl);
      const wrap = document.createElement('div');
      wrap.className = 'contrib-empty';
      wrap.setAttribute('role', 'status');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;color:var(--gray-500);text-align:center;gap:14px;min-height:220px;';
      wrap.innerHTML = `
        <div class="empty-illu" aria-hidden="true" style="font-size:42px;color:var(--gray-400)"><i class="fa-regular fa-folder-open"></i></div>
        <div class="empty-title" style="font-size:18px;font-weight:600;color:var(--gray-700)">Aucune contribution pour le moment</div>
        <div class="empty-sub" style="font-size:14px;opacity:0.8;max-width:520px">Créez votre première contribution pour proposer un projet et le visualiser sur la carte.</div>
        <div><button type="button" id="btn-empty-create" class="gp-btn" style="padding:8px 14px;border-radius:10px;background:var(--primary);color:var(--white);border:none;cursor:pointer;box-shadow:0 3px 10px rgba(25,118,210,0.3);">Créer une contribution</button></div>
      `;
      if (listSentinel && listSentinel.parentNode === listEl) {
        listEl.insertBefore(wrap, listSentinel);
      } else {
        listEl.appendChild(wrap);
      }
      const btn = wrap.querySelector('#btn-empty-create');
      if (btn && onCreateClick) btn.addEventListener('click', onCreateClick);
    } catch(_) {}
  }

  // ============================================================================
  // DELETE CONFIRMATION
  // ============================================================================

  /**
   * Ouvre une modale de confirmation de suppression
   * @param {Object} details - Détails de la contribution
   * @returns {Promise<boolean>} True si confirmé
   */
  function openDeleteConfirmModal(details) {
    const { id, projectName, filePaths = [], dossiersCount = 0 } = details || {};
    return new Promise((resolve) => {
      const lastFocus = document.activeElement;

      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'presentation');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';

      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'delc-title');
      modal.setAttribute('aria-describedby', 'delc-desc');
      modal.style.cssText = 'max-width:560px;width:92%;background:var(--white);border-radius:12px;box-shadow:0 12px 30px var(--black-alpha-25);padding:16px 18px;font-size:15px;color:var(--gray-800);';

      const title = document.createElement('h2');
      title.id = 'delc-title';
      title.textContent = `Supprimer la contribution ${projectName ? `« ${projectName} »` : `#${id}`} ?`;
      title.style.cssText = 'margin:0 0 8px 0;font-size:18px;';

      const desc = document.createElement('div');
      desc.id = 'delc-desc';
      desc.innerHTML = `
        <p>Cette action est définitive. Elle supprimera les éléments suivants :</p>
        <ul style="margin:0 0 8px 18px;">
          <li>La ligne <code>contribution_uploads</code> (id : <strong>#${id}</strong>)</li>
          ${filePaths.length ? filePaths.map(p => `<li>Fichier de stockage : <code>${p}</code></li>`).join('') : '<li>Aucun fichier de stockage associé.</li>'}
          <li>Dossiers de concertation liés : <strong>${dossiersCount}</strong></li>
        </ul>
        <p>Voulez-vous continuer ?</p>
      `;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:12px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Annuler';
      cancelBtn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.15);background:var(--white);';
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Supprimer';
      confirmBtn.style.cssText = 'padding:8px 12px;border-radius:8px;border:0;background:var(--danger);color:var(--white);';

      const close = (result) => {
        try { document.removeEventListener('keydown', onKey); } catch(_) {}
        try { overlay.remove(); } catch(_) {}
        try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch(_) {}
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
      try { document.addEventListener('keydown', onKey); } catch(_) {}
      try { cancelBtn.focus(); } catch(_) {}
    });
  }

  /**
   * Supprime une contribution
   * @param {number} id - ID de la contribution
   * @param {string} projectName - Nom du projet
   * @param {Object} elements - Éléments DOM et callbacks
   */
  async function doDeleteContribution(id, projectName, elements) {
    const { listEl, listStatusEl, onExitEditMode, onRefreshList } = elements || {};
    
    try {
      if (!id) return;
      
      // Fetch row details
      let row = null;
      try { 
        row = await (win.supabaseService && win.supabaseService.getContributionById(id)); 
      } catch(_) {}
      
      const effectiveName = (row && row.project_name) || projectName || '';
      const filePaths = [];
      
      if (win.ContribUtils?.toStorageRelPathFromPublicUrl) {
        try {
          if (row && row.geojson_url) { 
            const p = win.ContribUtils.toStorageRelPathFromPublicUrl(row.geojson_url); 
            if (p) filePaths.push(p); 
          }
          if (row && row.cover_url) { 
            const p = win.ContribUtils.toStorageRelPathFromPublicUrl(row.cover_url); 
            if (p) filePaths.push(p); 
          }
          if (row && row.markdown_url) { 
            const p = win.ContribUtils.toStorageRelPathFromPublicUrl(row.markdown_url); 
            if (p) filePaths.push(p); 
          }
        } catch(_) {}
      }
      
      let dossiersCount = 0;
      try {
        if (effectiveName && win.supabaseService && typeof win.supabaseService.getConsultationDossiersByProject === 'function') {
          const ds = await win.supabaseService.getConsultationDossiersByProject(effectiveName);
          if (Array.isArray(ds)) dossiersCount = ds.length;
        }
      } catch(_) {}
      
      const ok = await openDeleteConfirmModal({ id, projectName: effectiveName, filePaths, dossiersCount });
      if (!ok) return;
      
      setListStatus('Suppression en cours…', listStatusEl);
      try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
      
      // Ensure authenticated session
      const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
      if (!session || !session.user) return;
      
      const result = await (win.supabaseService && win.supabaseService.deleteContribution(id));
      setListStatus('', listStatusEl);
      
      if (!result || result.success !== true) {
        if (win.ContribUtils?.showToast) {
          win.ContribUtils.showToast('Échec de la suppression.', 'error');
        }
        return;
      }
      
      // Exit edit mode if needed
      if (onExitEditMode) {
        onExitEditMode(id);
      }
      
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast('Contribution supprimée.', 'success');
      }
      
      // Refresh list
      if (onRefreshList) {
        onRefreshList();
      }
    } catch (e) {
      console.warn('[contrib-list] delete error:', e);
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast('Erreur lors de la suppression.', 'error');
      }
    } finally {
      try { if (listEl) listEl.removeAttribute('aria-busy'); } catch(_) {}
    }
  }

  // ============================================================================
  // RENDER ITEM
  // ============================================================================

  /**
   * Rend un élément de liste
   * @param {Object} item - Données de la contribution
   * @param {Function} onEdit - Callback pour éditer
   * @param {Function} onDelete - Callback pour supprimer
   * @returns {HTMLElement} Élément DOM
   */
  function renderItem(item, onEdit, onDelete) {
    const el = document.createElement('div');
    el.className = 'contrib-list-item';
    el.setAttribute('role', 'listitem');
    
    const cover = item.cover_url
      ? `<div class="contrib-thumb"><img src="${item.cover_url}" alt="" /></div>`
      : `<div class="contrib-thumb contrib-thumb--placeholder" aria-hidden="true"><i class="fa fa-file-image-o" aria-hidden="true"></i></div>`;
    
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    
    el.innerHTML = `
      ${cover}
      <div class="contrib-item-right">
        <div class="contrib-item-main" role="button" tabindex="0">
          <div class="contrib-title-row">
            <span class="contrib-title">${item.project_name || '(sans nom)'} <span class="contrib-category">· ${item.category || ''}</span></span>
            ${item.approved === true
              ? '<span class="badge-approved">Approuvé</span>'
              : '<span class="badge-pending">En attente</span>'}
          </div>
          <div class="contrib-meta">Créé le: ${when}</div>
          ${item.meta ? `<div class="contrib-extra">${item.meta}</div>` : ''}
        </div>
        <div class="contrib-item-actions">
          <button type="button" class="contrib-item-delete" aria-label="Supprimer" title="Supprimer">
            <i class="fa fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
    
    // Runtime enforcement: ensure two-column structure
    try {
      el.style.display = 'grid';
      el.style.gridTemplateColumns = '96px minmax(0, 1fr)';
      el.style.alignItems = 'center';
      el.style.width = '100%';
      el.style.boxSizing = 'border-box';

      const right = el.querySelector('.contrib-item-right');
      if (right) {
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.gap = '8px';
        right.style.minWidth = '0';
        right.style.maxWidth = '100%';
      }

      const main = el.querySelector('.contrib-item-main');
      if (main) { 
        main.style.minWidth = '0'; 
        main.style.maxWidth = '100%'; 
      }
    } catch(_) {}
    
    const main = el.querySelector('.contrib-item-main');
    const delBtn = el.querySelector('.contrib-item-delete');

    // Admin-only: toggle approved
    try {
      const isAdmin = !!win.__CONTRIB_IS_ADMIN;
      if (isAdmin) {
        const actions = el.querySelector('.contrib-item-actions');
        if (actions) {
          const wrap = document.createElement('label');
          wrap.className = 'contrib-approve-toggle';
          wrap.title = 'Basculer le statut approuvé';
          wrap.innerHTML = `<input type="checkbox" class="contrib-item-approve" ${item.approved ? 'checked' : ''} aria-label="Approuvé"/> <span>Approuvé</span>`;
          actions.prepend(wrap);
          const checkbox = wrap.querySelector('.contrib-item-approve');
          checkbox.addEventListener('change', async () => {
            const newVal = !!checkbox.checked;
            checkbox.disabled = true;
            try {
              const res = await (win.supabaseService && win.supabaseService.setContributionApproved(item.id, newVal));
              if (res && !res.error) {
                item.approved = newVal;
                // Update badges
                const badgeApproved = el.querySelector('.badge-approved');
                const badgePending = el.querySelector('.badge-pending');
                if (newVal) {
                  if (!badgeApproved && badgePending) { 
                    badgePending.outerHTML = '<span class="badge-approved">Approuvé</span>'; 
                  }
                } else {
                  if (!badgePending && badgeApproved) { 
                    badgeApproved.outerHTML = '<span class="badge-pending">En attente</span>'; 
                  }
                }
                if (win.ContribUtils?.showToast) {
                  win.ContribUtils.showToast('Statut mis à jour.', 'success');
                }
              } else {
                checkbox.checked = !newVal;
                if (win.ContribUtils?.showToast) {
                  win.ContribUtils.showToast("Impossible de mettre à jour l'approbation.", 'error');
                }
              }
            } catch (_) {
              checkbox.checked = !newVal;
              if (win.ContribUtils?.showToast) {
                win.ContribUtils.showToast("Erreur lors de la mise à jour de l'approbation.", 'error');
              }
            } finally {
              checkbox.disabled = false;
            }
          });
        }
      }
    } catch(_) {}
    
    if (main && onEdit) {
      main.addEventListener('click', () => onEdit(item));
      main.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          main.click();
        }
      });
    }
    
    if (delBtn && onDelete) {
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onDelete(item.id, item.project_name);
      });
    }
    
    return el;
  }

  // ============================================================================
  // LIST LOADING
  // ============================================================================

  /**
   * Réinitialise et charge la liste
   * @param {Object} elements - Éléments DOM
   */
  async function listResetAndLoad(elements) {
    const { listEl, listSentinel, listStatusEl, onEdit, onDelete, onCreateClick } = elements || {};
    
    if (!listEl) return;
    listEl.innerHTML = '';
    if (listSentinel) listEl.appendChild(listSentinel);
    listState.page = 1;
    listState.done = false;
    listState.items = [];
    clearEmptyState(listEl);
    setListStatus('', listStatusEl);
    await listLoadMore(elements);
  }

  /**
   * Charge plus d'éléments
   * @param {Object} elements - Éléments DOM et callbacks
   */
  async function listLoadMore(elements) {
    const { listEl, listSentinel, listStatusEl, onEdit, onDelete, onCreateClick } = elements || {};
    
    if (listState.loading || listState.done) return;
    listState.loading = true;
    setListStatus('Chargement…', listStatusEl);
    try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
    
    // Insert skeletons on first page
    try {
      if (listEl && listState.page === 1) {
        const skelCount = Math.min(6, listState.pageSize);
        for (let i = 0; i < skelCount; i++) {
          const s = document.createElement('div');
          s.className = 'contrib-skel';
          s.setAttribute('aria-hidden', 'true');
          s.style.cssText = 'height:96px;background:linear-gradient(90deg,var(--gray-200) 25%,var(--gray-300) 50%,var(--gray-200) 75%);background-size:200% 100%;animation:skeleton-loading 1.5s infinite;border-radius:12px;';
          if (listSentinel && listSentinel.parentNode === listEl) {
            listEl.insertBefore(s, listSentinel);
          } else {
            listEl.appendChild(s);
          }
        }
        // Add keyframes if not already present
        if (!document.getElementById('skeleton-keyframes')) {
          const style = document.createElement('style');
          style.id = 'skeleton-keyframes';
          style.textContent = '@keyframes skeleton-loading{0%{background-position:200% 0}100%{background-position:-200% 0}}';
          document.head.appendChild(style);
        }
      }
    } catch(_) {}
    
    try {
      const { search, category, sortBy, sortDir, page, pageSize, mineOnly } = listState;
      console.log('[contrib-list] Loading contributions with params:', { search, category, sortBy, sortDir, page, pageSize, mineOnly });
      
      if (!win.supabaseService || !win.supabaseService.listContributions) {
        console.error('[contrib-list] supabaseService.listContributions not available');
        setListStatus('Erreur: Service non disponible', listStatusEl);
        return;
      }
      
      const res = await win.supabaseService.listContributions({
        search, category, page, pageSize, mineOnly, sortBy, sortDir
      });
      
      console.log('[contrib-list] Response:', res);
      
      // La réponse peut avoir soit res.data soit res.items
      const items = (res && res.data) ? res.data : (res && res.items) ? res.items : [];
      console.log('[contrib-list] Items count:', items.length);
      
      // Clear skeletons
      try { if (listEl) listEl.querySelectorAll('.contrib-skel').forEach(n => n.remove()); } catch(_) {}
      
      if (!items.length) {
        console.log('[contrib-list] No items found, showing empty state');
        if (page === 1) { 
          setListStatus('', listStatusEl); 
          renderEmptyState(listEl, listSentinel, onCreateClick); 
        }
        listState.done = true;
      } else {
        console.log('[contrib-list] Rendering', items.length, 'items');
        setListStatus('', listStatusEl);
        clearEmptyState(listEl);
        listState.items.push(...items);
        items.forEach(it => {
          const node = renderItem(it, onEdit, onDelete);
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
      setListStatus('Erreur lors du chargement.', listStatusEl);
      console.warn('[contrib-list] load error:', e);
    } finally {
      try { if (listEl) listEl.querySelectorAll('.contrib-skel').forEach(n => n.remove()); } catch(_) {}
      listState.loading = false;
      try { if (listEl) listEl.removeAttribute('aria-busy'); } catch(_) {}
    }
  }

  // ============================================================================
  // INFINITE SCROLL
  // ============================================================================

  /**
   * Initialise l'infinite scroll
   * @param {HTMLElement} listEl - Élément de liste
   * @param {HTMLElement} listSentinel - Sentinelle
   * @param {Object} elements - Éléments pour le chargement
   */
  function initInfiniteScroll(listEl, listSentinel, elements) {
    if (!listEl || !listSentinel) return;
    try { if (io) { io.disconnect(); io = null; } } catch(_) {}
    io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !listState.loading && !listState.done) {
          listLoadMore(elements);
        }
      });
    }, { rootMargin: '100px' });
    io.observe(listSentinel);
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Met à jour l'état de la liste
   * @param {Object} updates - Mises à jour de l'état
   */
  function updateListState(updates) {
    Object.assign(listState, updates);
  }

  /**
   * Récupère l'état de la liste
   * @returns {Object} État actuel
   */
  function getListState() {
    return { ...listState };
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribList = {
    // Status
    setListStatus,
    
    // Empty state
    clearEmptyState,
    renderEmptyState,
    
    // Delete
    openDeleteConfirmModal,
    doDeleteContribution,
    
    // Render
    renderItem,
    
    // Loading
    listResetAndLoad,
    listLoadMore,
    
    // Infinite scroll
    initInfiniteScroll,
    
    // State
    updateListState,
    getListState
  };

})(window);
