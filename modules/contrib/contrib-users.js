// modules/contrib/contrib-users.js
// Gestion des utilisateurs pour les admins

;(function(win) {
  'use strict';

  /**
   * Charge et affiche la liste des utilisateurs
   * @param {Object} elements - Éléments DOM { usersListEl }
   */
  async function loadUsersList(elements) {
    const { usersListEl } = elements;
    
    if (!usersListEl) return;
    
    // Récupérer la ville en cours d'édition (depuis le landing-city-selector)
    const selectedCity = win.getCurrentCity?.();
    
    if (!selectedCity) {
      usersListEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--warning);"><i class="fa-solid fa-triangle-exclamation"></i> Veuillez sélectionner une structure.</div>';
      return;
    }
    
    try {
      usersListEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des utilisateurs...</div>';
      
      const users = await win.supabaseService.getVisibleUsers();
      
      // Filtrer par la ville sélectionnée
      const filteredUsers = users?.filter(user => {
        const userVilles = parseVilles(user.ville);
        return userVilles.includes(selectedCity);
      }) || [];
      
      usersListEl.innerHTML = '';
      
      if (filteredUsers.length === 0) {
        renderEmptyState(usersListEl);
        return;
      }
      
      filteredUsers.forEach(user => {
        const card = renderUserCard(user, elements);
        usersListEl.appendChild(card);
      });
      
    } catch (error) {
      console.error('[contrib-users] loadUsersList error:', error);
      usersListEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);">Erreur lors du chargement des utilisateurs.</div>';
    }
  }

  /**
   * Rend une card utilisateur
   * @param {Object} user - Données utilisateur
   * @param {Object} elements - Éléments DOM
   * @returns {HTMLElement} Card utilisateur
   */
  function renderUserCard(user, elements) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.userId = user.id;
    
    const isAdmin = user.role === 'admin';
    const villes = parseVilles(user.ville);
    const hasNoVilles = villes.length === 0;
    
    // Générer les badges de villes
    const villesBadges = villes.length > 0 
      ? villes.map(v => `<span class="user-city-badge">${escapeHtml(v)}</span>`).join('')
      : '<span class="user-city-badge user-city-badge--empty">Aucune structure</span>';
    
    const roleIcon = isAdmin ? 'fa-user-shield' : 'fa-user';
    const roleColor = isAdmin ? 'var(--info)' : 'var(--gray-500)';
    const roleLabel = isAdmin ? 'Admin' : 'Invited';
    
    const createdDate = new Date(user.created_at).toLocaleDateString('fr-FR');
    
    card.innerHTML = `
      <div class="user-card__header">
        <div class="user-card__icon" style="color: ${roleColor};">
          <i class="fa-solid ${roleIcon}"></i>
        </div>
        <div class="user-card__info">
          <div class="user-card__email">${escapeHtml(user.email)}</div>
          <div class="user-card__meta">
            <span class="user-card__role" style="color: ${roleColor};">
              <i class="fa-solid fa-circle" style="font-size: 6px;"></i> ${roleLabel}
            </span>
            <span class="user-card__date">
              <i class="fa-regular fa-calendar"></i> ${createdDate}
            </span>
          </div>
        </div>
      </div>
      <div class="user-card__body">
        <div class="user-card__cities">
          <i class="fa-solid fa-location-dot"></i>
          <div class="user-cities-badges">${villesBadges}</div>
        </div>
        ${hasNoVilles ? '<div class="user-card__warning"><i class="fa-solid fa-triangle-exclamation"></i> Cet utilisateur n\'a aucune structure assignée</div>' : ''}
      </div>
      <div class="user-card__actions">
        ${isAdmin 
          ? `<button type="button" class="btn-secondary user-action-btn" data-action="demote">
               <i class="fa-solid fa-arrow-down"></i> Rétrograder en invited
             </button>`
          : `<button type="button" class="btn-secondary user-action-btn" data-action="promote">
               <i class="fa-solid fa-arrow-up"></i> Promouvoir en admin
             </button>`
        }
      </div>
    `;
    
    // Bind action button
    const actionBtn = card.querySelector('.user-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        const action = actionBtn.dataset.action;
        const newRole = action === 'promote' ? 'admin' : 'invited';
        showConfirmModal(user, newRole, elements);
      });
    }
    
    return card;
  }

  /**
   * Affiche la modale de confirmation de changement de rôle
   * @param {Object} user - Utilisateur cible
   * @param {string} newRole - Nouveau rôle
   * @param {Object} elements - Éléments DOM
   */
  async function showConfirmModal(user, newRole, elements) {
    const currentRoleLabel = user.role === 'admin' ? 'Admin' : 'Invited';
    const newRoleLabel = newRole === 'admin' ? 'Admin' : 'Invited';
    const actionLabel = newRole === 'admin' ? 'Promouvoir' : 'Rétrograder';
    const villes = parseVilles(user.ville);
    const villesText = villes.length > 0 ? villes.join(', ') : 'Aucune';

    const confirmed = await win.ContribUtils.buildConfirmModal({
      id: 'user-role-confirm-overlay',
      title: '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);margin-right:8px;"></i>Confirmer le changement de rôle',
      bodyHTML: `
        <div style="margin-bottom:16px;padding:12px;background:var(--gray-100);border-radius:8px;">
          <div style="margin-bottom:8px;"><strong>Utilisateur :</strong> ${escapeHtml(user.email)}</div>
          <div style="margin-bottom:8px;"><strong>Structures :</strong> ${villesText}</div>
          <div style="margin-bottom:8px;"><strong>Rôle actuel :</strong> ${currentRoleLabel}</div>
          <div><strong>Nouveau rôle :</strong> ${newRoleLabel}</div>
        </div>
        <div style="padding:12px;background:var(--warning-lighter);border-left:4px solid var(--warning);border-radius:4px;">
          <i class="fa-solid fa-info-circle" style="color:var(--warning);margin-right:8px;"></i>
          Cette action est immédiate et modifiera les permissions de l'utilisateur.
        </div>
      `,
      confirmLabel: actionLabel,
      confirmClass: 'btn-primary',
      cancelLabel: 'Annuler'
    });

    if (!confirmed) return;

    try {
      await win.supabaseService.updateUserRole(user.id, newRole);
      win.ContribUtils?.showToast(`Utilisateur ${actionLabel.toLowerCase()} avec succès.`, 'success');
      await loadUsersList(elements);
    } catch (error) {
      console.error('[contrib-users] updateUserRole error:', error);
      win.ContribUtils?.showToast('Erreur lors de la modification du rôle.', 'error');
    }
  }

  /**
   * Affiche l'état vide
   * @param {HTMLElement} container - Conteneur
   */
  function renderEmptyState(container) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:48px 24px;color:var(--gray-500);text-align:center;">
        <i class="fa-regular fa-user" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Aucun utilisateur</div>
        <div style="font-size:14px;opacity:0.8;">Aucun utilisateur ne partage vos structures.</div>
      </div>
    `;
  }

  /**
   * Parse le champ ville (JSON array)
   * @param {string|null} ville - Champ ville
   * @returns {Array<string>} Liste des villes
   */
  function parseVilles(ville) {
    if (!ville) return [];
    try {
      const parsed = typeof ville === 'string' ? JSON.parse(ville) : ville;
      return Array.isArray(parsed) ? parsed.filter(v => v !== 'global') : [];
    } catch {
      return [];
    }
  }

  const escapeHtml = window.SecurityUtils.escapeHtml;

  /**
   * Affiche la modale d'invitation d'un nouvel utilisateur
   * @param {Object} elements - Éléments DOM
   */
  async function showInviteModal(elements) {
    try {
      // Charger la modale si nécessaire
      if (typeof win.loadInviteModalTemplate === 'function') {
        const loaded = await win.loadInviteModalTemplate();
        if (!loaded) {
          win.ContribUtils?.showToast('Erreur lors du chargement du formulaire', 'error');
          return;
        }
      }
      
      // Récupérer la ville avec validation centralisée
      const selectedCity = win.getCurrentCity?.();
      
      if (!selectedCity) {
        // Toast déjà affiché par getCurrentCity
        return;
      }

      // Récupérer les villes disponibles pour obtenir le label
      const cities = await win.supabaseService.getAvailableCities();
      const selectedCityData = cities?.find(c => c.value === selectedCity);
      const cityLabel = selectedCityData?.label || selectedCity;

      // Récupérer les éléments de la modale
      const overlay = document.getElementById('invite-modal-overlay');
      const inviteForm = document.getElementById('invite-form');
      const citiesListEl = document.getElementById('invite-cities-list');
      
      if (!overlay || !inviteForm || !citiesListEl) {
        console.error('[contrib-users] Invite modal elements not found');
        return;
      }

      // Afficher uniquement la ville sélectionnée (pré-cochée et disabled)
      const citiesHTML = `
        <div class="gp-city-preview">
          <label>
            <input type="checkbox" name="ville" value="${escapeHtml(selectedCity)}" checked disabled>
            <span>${escapeHtml(cityLabel)}</span>
          </label>
        </div>
      `;
      
      citiesListEl.innerHTML = citiesHTML;

      // Ouvrir la modale via ModalHelper
      win.ModalHelper.open('invite-modal-overlay', {
        dismissible: true,
        lockScroll: true,
        focusTrap: true,
        onClose: () => inviteForm.reset()
      });

      // Bind form submit
      const emailInput = document.getElementById('invite-email');
      const submitBtn = overlay.querySelector('button[type="submit"]');

      inviteForm.onsubmit = async (e) => {
        e.preventDefault();

        const email = emailInput?.value.trim();
        const selectedRole = inviteForm.querySelector('input[name="role"]:checked')?.value || 'invited';
        // La ville est toujours celle sélectionnée au landing
        const selectedCities = [selectedCity];

        // Validation
        if (!email) {
          emailInput?.focus();
          return;
        }

        // Désactiver le bouton
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Envoi en cours...</span>';
        }

        try {
          await win.supabaseService.inviteUser(email, selectedCities, selectedRole);

          // Réactiver le bouton AVANT de fermer la modale
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> <span>Envoyer l\'invitation</span>';
          }

          win.ModalHelper.close('invite-modal-overlay');
          const roleLabel = selectedRole === 'admin' ? 'Admin' : 'Invited';
          win.ContribUtils?.showToast(`Invitation envoyée à ${email} avec le rôle ${roleLabel} !`, 'success');

          // Recharger la liste des utilisateurs
          if (elements && elements.usersListEl) {
            await loadUsersList(elements);
          }

        } catch (error) {
          console.error('[contrib-users] inviteUser error:', error);
          win.ContribUtils?.showToast(error.message || 'Erreur lors de l\'invitation.', 'error');
          
          // Réactiver le bouton
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> <span>Envoyer l\'invitation</span>';
          }
        }
      };

    } catch (error) {
      console.error('[contrib-users] showInviteModal error:', error);
      win.ContribUtils?.showToast('Erreur lors de l\'ouverture de la modale.', 'error');
    }
  }

  // Export
  win.ContribUsers = {
    loadUsersList,
    showInviteModal
  };

})(window);
