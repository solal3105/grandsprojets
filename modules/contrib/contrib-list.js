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
    filterCity: null,  // Filtrer par ville
    loading: false,
    done: false,
    items: []
  };

  let io = null; // IntersectionObserver for infinite scroll

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
      `;
      if (listSentinel && listSentinel.parentNode === listEl) {
        listEl.insertBefore(wrap, listSentinel);
      } else {
        listEl.appendChild(wrap);
      }
    } catch(_) {}
  }

  // ============================================================================
  // DELETE CONFIRMATION
  // ============================================================================

  /**
   * Ouvre la modale de confirmation de suppression
   * @param {Object} details - Détails de la contribution
   * @returns {Promise<boolean>} True si confirmé
   */
  function openDeleteConfirmModal(details) {
    const { id, projectName, filePaths = [], dossiersCount = 0 } = details || {};
    return new Promise((resolve) => {
      // Créer l'overlay avec le système unifié
      const overlay = document.createElement('div');
      overlay.id = 'delete-confirm-overlay';
      overlay.className = 'gp-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'delete-confirm-title');
      overlay.setAttribute('aria-describedby', 'delete-confirm-desc');

      // Créer la modale avec structure unifiée
      const modal = document.createElement('div');
      modal.className = 'gp-modal gp-modal--compact';
      modal.setAttribute('role', 'document');

      // Header
      const header = document.createElement('div');
      header.className = 'gp-modal-header';
      const title = document.createElement('h2');
      title.id = 'delete-confirm-title';
      title.className = 'gp-modal-title';
      title.textContent = `Supprimer la contribution ${projectName ? `« ${projectName} »` : `#${id}`} ?`;
      
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'gp-modal-close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.innerHTML = '&times;';
      
      header.appendChild(title);
      header.appendChild(closeBtn);

      // Body
      const body = document.createElement('div');
      body.className = 'gp-modal-body';
      body.id = 'delete-confirm-desc';
      body.innerHTML = `
        <p>Cette action est définitive. Elle supprimera les éléments suivants :</p>
        <ul style="margin:0 0 12px 18px;padding-left:0;">
          <li>La ligne <code>contribution_uploads</code> (id : <strong>#${id}</strong>)</li>
          ${filePaths.length ? filePaths.map(p => `<li>Fichier de stockage : <code>${p}</code></li>`).join('') : '<li>Aucun fichier de stockage associé.</li>'}
          <li>Dossiers de concertation liés : <strong>${dossiersCount}</strong></li>
        </ul>
        <p style="margin-bottom:0;">Voulez-vous continuer ?</p>
      `;

      // Footer avec boutons
      const footer = document.createElement('div');
      footer.className = 'gp-modal-footer';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Annuler';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'btn-danger';
      confirmBtn.textContent = 'Supprimer';

      footer.appendChild(cancelBtn);
      footer.appendChild(confirmBtn);

      // Assembler la modale
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Gérer la fermeture
      const close = (result) => {
        window.ModalHelper?.close('delete-confirm-overlay');
        resolve(!!result);
      };

      // Listeners
      closeBtn.addEventListener('click', () => close(false));
      cancelBtn.addEventListener('click', () => close(false));
      confirmBtn.addEventListener('click', () => close(true));

      // Ouvrir avec ModalHelper
      window.ModalHelper?.open('delete-confirm-overlay', {
        focusTrap: true,
        dismissible: true,
        onClose: () => resolve(false)
      });

      // Focus sur le bouton Annuler
      setTimeout(() => {
        try { cancelBtn.focus(); } catch(_) {}
      }, 100);
    });
  }

  /**
   * Supprime une contribution
   * @param {number} id - ID de la contribution
   * @param {string} projectName - Nom du projet
   * @param {Object} elements - Éléments DOM et callbacks
   */
  async function doDeleteContribution(id, projectName, elements) {
    const { listEl, onExitEditMode, onRefreshList } = elements || {};
    
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
      
      try { if (listEl) listEl.setAttribute('aria-busy', 'true'); } catch(_) {}
      
      // Ensure authenticated session
      const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
      if (!session || !session.user) return;
      
      const result = await (win.supabaseService && win.supabaseService.deleteContribution(id));
      
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
   * Rend un item de contribution moderne
   * @param {Object} item - Données de la contribution
   * @param {Function} onEdit - Callback pour éditer
   * @param {Function} onDelete - Callback pour supprimer
   * @returns {HTMLElement} Élément DOM
   */
  async function renderItem(item, onEdit, onDelete) {
    const card = document.createElement('article');
    card.className = 'contrib-card';
    card.setAttribute('data-contrib-id', item.id);
    
    // Vérifier si l'utilisateur est propriétaire de la contribution
    let isOwner = false;
    try {
      const client = win.supabaseService?.getClient();
      if (client) {
        const { data: userData } = await client.auth.getUser();
        const uid = userData?.user?.id;
        isOwner = (uid && item.created_by === uid);
      } else {
        console.warn('[contrib-list] supabaseService.getClient() not available');
      }
    } catch(err) {
      console.warn('[contrib-list] Error checking ownership:', err);
    }
    
    // Image de couverture (sécurisé)
    const coverHtml = item.cover_url
      ? `<img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.project_name || 'Projet')}" class="contrib-card__image" loading="lazy" />`
      : `<div class="contrib-card__image contrib-card__image--placeholder">
           <i class="fa-solid fa-image"></i>
         </div>`;
    
    // Badge de statut
    const statusBadge = item.approved
      ? `<span class="contrib-card__badge contrib-card__badge--approved">
           <i class="fa-solid fa-circle-check"></i> Approuvé
         </span>`
      : `<span class="contrib-card__badge contrib-card__badge--pending">
           <i class="fa-solid fa-clock"></i> En attente
         </span>`;
    
    // Badge "Votre contribution" si l'utilisateur est le créateur
    const ownerBadge = isOwner
      ? `<span class="contrib-card__badge contrib-card__badge--owner" style="background: var(--primary-color, #2563eb); color: white;">
           <i class="fa-solid fa-user"></i> Votre contribution
         </span>`
      : '';
    
    // Date formatée
    const createdDate = item.created_at 
      ? new Date(item.created_at).toLocaleDateString('fr-FR', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        })
      : '';
    
    // Catégorie avec icône
    const categoryIcon = getCategoryIcon(item.category);
    
    card.innerHTML = `
      <div class="contrib-card__media">
        ${coverHtml}
        <div class="contrib-card__overlay" style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${statusBadge}
          ${ownerBadge}
        </div>
      </div>
      
      <div class="contrib-card__content">
        <div class="contrib-card__header">
          <h3 class="contrib-card__title">${escapeHtml(item.project_name || 'Sans nom')}</h3>
          ${item.category ? `
            <div class="contrib-card__category">
              <i class="fa-solid ${categoryIcon}"></i>
              <span>${escapeHtml(item.category)}</span>
            </div>
          ` : ''}
        </div>
        
        ${item.description ? `
          <p class="contrib-card__description">${escapeHtml(item.description).substring(0, 120)}${item.description.length > 120 ? '...' : ''}</p>
        ` : ''}
        
        <div class="contrib-card__meta">
          <span class="contrib-card__date">
            <i class="fa-solid fa-calendar-days"></i>
            ${createdDate}
          </span>
        </div>
      </div>
      
      <div class="contrib-card__actions">
        ${isOwner || win.__CONTRIB_IS_ADMIN ? `
          <button type="button" class="contrib-card__action contrib-card__action--edit" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="contrib-card__action contrib-card__action--delete" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ''}
      </div>
    `;
    
    // Événements
    const editBtn = card.querySelector('.contrib-card__action--edit');
    const deleteBtn = card.querySelector('.contrib-card__action--delete');
    const content = card.querySelector('.contrib-card__content');
    
    if (editBtn && onEdit) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onEdit(item);
      });
    }
    
    if (deleteBtn && onDelete) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(item.id, item.project_name);
      });
    }
    
    // Note: Avant, toute la carte était cliquable pour éditer
    // Maintenant, seul le bouton "Modifier" permet l'édition (lignes 406-410)
    
    // Admin: Bouton approuver
    const isAdmin = !!win.__CONTRIB_IS_ADMIN;
    if (isAdmin) {
      const actions = card.querySelector('.contrib-card__actions');
      const btnHtml = `
        <button type="button" class="contrib-card__action contrib-card__action--approve ${item.approved ? 'is-approved' : ''}" title="${item.approved ? 'Révoquer l\'approbation' : 'Approuver'}">
          <i class="fa-solid fa-circle-check"></i>
        </button>
      `;
      actions.insertAdjacentHTML('afterbegin', btnHtml);
      
      const approveBtn = actions.querySelector('.contrib-card__action--approve');
      if (approveBtn) {
        approveBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const newVal = !item.approved;
          approveBtn.disabled = true;
          
          try {
            const res = await win.supabaseService?.setContributionApproved(item.id, newVal);
            if (res && !res.error) {
              item.approved = newVal;
              
              // Mettre à jour le bouton
              approveBtn.className = `contrib-card__action contrib-card__action--approve ${newVal ? 'is-approved' : ''}`;
              approveBtn.title = newVal ? 'Révoquer l\'approbation' : 'Approuver';
              
              // Mettre à jour le badge
              const badge = card.querySelector('.contrib-card__badge');
              if (badge) {
                badge.className = newVal 
                  ? 'contrib-card__badge contrib-card__badge--approved'
                  : 'contrib-card__badge contrib-card__badge--pending';
                badge.innerHTML = newVal
                  ? '<i class="fa-solid fa-circle-check"></i> Approuvé'
                  : '<i class="fa-solid fa-clock"></i> En attente';
              }
              
              win.ContribUtils?.showToast(newVal ? 'Contribution approuvée' : 'Approbation révoquée', 'success');
            } else {
              win.ContribUtils?.showToast('Erreur lors de la mise à jour', 'error');
            }
          } catch (err) {
            win.ContribUtils?.showToast('Erreur réseau', 'error');
          } finally {
            approveBtn.disabled = false;
          }
        });
      }
    }
    
    return card;
  }
  
  /**
   * Retourne l'icône FontAwesome pour une catégorie
   */
  function getCategoryIcon(category) {
    const icons = {
      'urbanisme': 'fa-city',
      'mobilites': 'fa-bus',
      'mobilité': 'fa-bus',
      'transport': 'fa-train',
      'ecologie': 'fa-leaf',
      'écologie': 'fa-leaf',
      'education': 'fa-graduation-cap',
      'éducation': 'fa-graduation-cap',
      'culture': 'fa-masks-theater',
      'sport': 'fa-futbol',
      'sante': 'fa-heart-pulse',
      'santé': 'fa-heart-pulse',
      'solidarité': 'fa-handshake-angle',
      'solidarite': 'fa-handshake-angle',
      'sécurité': 'fa-shield-halved',
      'securite': 'fa-shield-halved'
    };
    
    return icons[category?.toLowerCase()] || 'fa-folder';
  }
  
  /**
   * Échappe les caractères HTML pour éviter les XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // LIST LOADING
  // ============================================================================

  /**
   * Réinitialise et charge la liste
   * @param {Object} elements - Éléments DOM
   */
  async function listResetAndLoad(elements) {
    const { listEl, listSentinel, onEdit, onDelete, onCreateClick } = elements || {};
    
    if (!listEl) return;
    listEl.innerHTML = '';
    if (listSentinel) listEl.appendChild(listSentinel);
    listState.page = 1;
    listState.done = false;
    listState.items = [];
    clearEmptyState(listEl);
    await listLoadMore(elements);
  }

  /**
   * Charge plus d'éléments
   * @param {Object} elements - Éléments DOM et callbacks
   */
  async function listLoadMore(elements) {
    const { listEl, listSentinel, onEdit, onDelete, onCreateClick } = elements || {};
    
    if (listState.loading || listState.done) return;
    listState.loading = true;
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
      const { search, category, sortBy, sortDir, page, pageSize, mineOnly, filterCity } = listState;
      
      if (!win.supabaseService || !win.supabaseService.listContributions) {
        console.error('[contrib-list] supabaseService.listContributions not available');
        if (win.ContribUtils?.showToast) {
          win.ContribUtils.showToast('Service non disponible', 'error');
        }
        return;
      }
      
      const res = await win.supabaseService.listContributions({
        search, category, page, pageSize, mineOnly, sortBy, sortDir, city: filterCity
      });
      
      // La réponse peut avoir soit res.data soit res.items
      const items = (res && res.data) ? res.data : (res && res.items) ? res.items : [];
      const totalCount = res && res.count !== undefined ? res.count : items.length;
      
      // Clear skeletons
      try { if (listEl) listEl.querySelectorAll('.contrib-skel').forEach(n => n.remove()); } catch(_) {}
      
      if (!items.length) {
        if (page === 1) { 
          renderEmptyState(listEl, listSentinel, onCreateClick);
        }
        listState.done = true;
      } else {
        clearEmptyState(listEl);
        listState.items.push(...items);
        // Rendre les items (async maintenant)
        for (const it of items) {
          const node = await renderItem(it, onEdit, onDelete);
          if (listSentinel && listSentinel.parentNode === listEl) {
            listEl.insertBefore(node, listSentinel);
          } else {
            listEl.appendChild(node);
          }
        }
        listState.page += 1;
        if (items.length < listState.pageSize) listState.done = true;
      }
    } catch (e) {
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast('Erreur lors du chargement', 'error');
      }
      console.error('[contrib-list] load error:', e);
      listState.done = true; // Arrêter les tentatives de rechargement
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
