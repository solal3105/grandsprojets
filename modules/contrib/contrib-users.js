// modules/contrib/contrib-users.js
// Gestion des utilisateurs pour les admins

;(function(win) {
  'use strict';

  /**
   * Charge et affiche la liste des utilisateurs
   * @param {Object} elements - Éléments DOM { usersListEl, usersStatusEl }
   */
  async function loadUsersList(elements) {
    const { usersListEl, usersStatusEl } = elements;
    
    if (!usersListEl) return;
    
    try {
      if (usersStatusEl) usersStatusEl.textContent = 'Chargement des utilisateurs...';
      usersListEl.innerHTML = '';
      
      const users = await win.supabaseService.getVisibleUsers();
      
      if (usersStatusEl) usersStatusEl.textContent = '';
      
      if (!users || users.length === 0) {
        renderEmptyState(usersListEl);
        return;
      }
      
      users.forEach(user => {
        const card = renderUserCard(user, elements);
        usersListEl.appendChild(card);
      });
      
    } catch (error) {
      console.error('[contrib-users] loadUsersList error:', error);
      if (usersStatusEl) usersStatusEl.textContent = 'Erreur lors du chargement des utilisateurs.';
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
    const villesText = villes.length > 0 ? villes.join(', ') : 'Aucune';
    const hasNoVilles = villes.length === 0;
    
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
          <span>${villesText}</span>
        </div>
        ${hasNoVilles ? '<div class="user-card__warning"><i class="fa-solid fa-triangle-exclamation"></i> Cet utilisateur n\'a aucune ville assignée</div>' : ''}
      </div>
      <div class="user-card__actions">
        ${isAdmin 
          ? `<button type="button" class="gp-btn gp-btn--secondary user-action-btn" data-action="demote">
               <i class="fa-solid fa-arrow-down"></i> Rétrograder en invited
             </button>`
          : `<button type="button" class="gp-btn gp-btn--primary user-action-btn" data-action="promote">
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
   * Affiche la modale de confirmation
   * @param {Object} user - Utilisateur cible
   * @param {string} newRole - Nouveau rôle
   * @param {Object} elements - Éléments DOM
   */
  function showConfirmModal(user, newRole, elements) {
    const overlay = document.createElement('div');
    overlay.className = 'user-confirm-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--black-alpha-50);display:flex;align-items:center;justify-content:center;z-index:10001;';
    
    const modal = document.createElement('div');
    modal.className = 'user-confirm-modal';
    modal.style.cssText = 'background:var(--surface);border-radius:12px;padding:24px;max-width:480px;width:90%;box-shadow:0 8px 32px var(--black-alpha-20);';
    
    const currentRoleLabel = user.role === 'admin' ? 'Admin' : 'Invited';
    const newRoleLabel = newRole === 'admin' ? 'Admin' : 'Invited';
    const actionLabel = newRole === 'admin' ? 'Promouvoir' : 'Rétrograder';
    const villes = parseVilles(user.ville);
    const villesText = villes.length > 0 ? villes.join(', ') : 'Aucune';
    
    modal.innerHTML = `
      <h3 style="margin:0 0 16px 0;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i>
        Confirmer le changement de rôle
      </h3>
      <div style="margin-bottom:16px;padding:12px;background:var(--gray-100);border-radius:8px;">
        <div style="margin-bottom:8px;"><strong>Utilisateur :</strong> ${escapeHtml(user.email)}</div>
        <div style="margin-bottom:8px;"><strong>Villes :</strong> ${villesText}</div>
        <div style="margin-bottom:8px;"><strong>Rôle actuel :</strong> ${currentRoleLabel}</div>
        <div><strong>Nouveau rôle :</strong> ${newRoleLabel}</div>
      </div>
      <div style="padding:12px;background:var(--warning-lighter);border-left:4px solid var(--warning);margin-bottom:16px;border-radius:4px;">
        <i class="fa-solid fa-info-circle" style="color:var(--warning);"></i>
        Cette action est immédiate et modifiera les permissions de l'utilisateur.
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        <button type="button" class="gp-btn gp-btn--secondary cancel-btn">Annuler</button>
        <button type="button" class="gp-btn gp-btn--primary confirm-btn">${actionLabel}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const close = () => overlay.remove();
    
    modal.querySelector('.cancel-btn').addEventListener('click', close);
    modal.querySelector('.confirm-btn').addEventListener('click', async () => {
      try {
        const confirmBtn = modal.querySelector('.confirm-btn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement...';
        
        await win.supabaseService.updateUserRole(user.id, newRole);
        
        close();
        if (win.ContribUtils?.showToast) {
          win.ContribUtils.showToast(`Utilisateur ${actionLabel.toLowerCase()} avec succès.`, 'success');
        }
        
        // Recharger la liste
        await loadUsersList(elements);
        
      } catch (error) {
        console.error('[contrib-users] updateUserRole error:', error);
        if (win.ContribUtils?.showToast) {
          win.ContribUtils.showToast('Erreur lors de la modification du rôle.', 'error');
        }
        close();
      }
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
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
        <div style="font-size:14px;opacity:0.8;">Aucun utilisateur ne partage vos villes.</div>
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

  /**
   * Échappe les caractères HTML
   * @param {string} str - Chaîne à échapper
   * @returns {string} Chaîne échappée
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Affiche la modale d'invitation d'un nouvel utilisateur
   * @param {Object} elements - Éléments DOM
   */
  async function showInviteModal(elements) {
    try {
      // Récupérer les villes disponibles
      const cities = await win.supabaseService.getAvailableCities();
      
      if (!cities || cities.length === 0) {
        win.ContribUtils?.showToast('Aucune ville disponible pour l\'invitation.', 'error');
        return;
      }

      // Créer l'overlay
      const overlay = document.createElement('div');
      overlay.className = 'invite-modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--black-alpha-50);display:flex;align-items:center;justify-content:center;z-index:10001;animation:fadeIn 0.2s;';

      // Créer la modale
      const modal = document.createElement('div');
      modal.className = 'invite-modal';
      modal.style.cssText = 'background:var(--surface);border-radius:16px;padding:32px;max-width:520px;width:90%;box-shadow:0 8px 32px var(--black-alpha-20);animation:slideUp 0.3s;';

      // Générer les checkboxes pour les villes
      const citiesHTML = cities.map(city => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:6px;transition:background 0.2s;" class="city-checkbox-label">
          <input type="checkbox" name="ville" value="${escapeHtml(city.value)}" style="width:18px;height:18px;cursor:pointer;">
          <span style="font-size:14px;">${escapeHtml(city.label)}</span>
        </label>
      `).join('');

      modal.innerHTML = `
        <h3 style="margin:0 0 8px 0;display:flex;align-items:center;gap:10px;font-size:22px;">
          <i class="fa-solid fa-envelope" style="color:var(--info);"></i>
          Inviter un nouvel utilisateur
        </h3>
        <p style="margin:0 0 24px 0;color:var(--gray-500);font-size:14px;">L'utilisateur recevra un email pour se connecter.</p>
        
        <form id="invite-form" style="display:flex;flex-direction:column;gap:20px;">
          <div>
            <label style="display:block;margin-bottom:6px;font-weight:600;font-size:14px;">
              Email de l'utilisateur <span style="color:var(--danger);">*</span>
            </label>
            <input 
              type="email" 
              id="invite-email" 
              required 
              placeholder="user@example.com"
              style="width:100%;padding:12px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;box-sizing:border-box;"
            />
          </div>
          
          <div>
            <label style="display:block;margin-bottom:8px;font-weight:600;font-size:14px;">
              Rôle <span style="color:var(--danger);">*</span>
            </label>
            <div style="display:flex;gap:12px;">
              <label style="flex:1;display:flex;align-items:center;gap:8px;padding:12px;border:1px solid var(--gray-300);border-radius:8px;cursor:pointer;transition:all 0.2s;" class="role-option">
                <input type="radio" name="role" value="invited" checked style="width:18px;height:18px;cursor:pointer;">
                <div>
                  <div style="font-weight:600;font-size:14px;">Invited</div>
                  <div style="font-size:12px;color:var(--gray-500);">Accès limité à ses contributions</div>
                </div>
              </label>
              <label style="flex:1;display:flex;align-items:center;gap:8px;padding:12px;border:1px solid var(--gray-300);border-radius:8px;cursor:pointer;transition:all 0.2s;" class="role-option">
                <input type="radio" name="role" value="admin" style="width:18px;height:18px;cursor:pointer;">
                <div>
                  <div style="font-weight:600;font-size:14px;">Admin</div>
                  <div style="font-size:12px;color:var(--gray-500);">Accès complet et gestion</div>
                </div>
              </label>
            </div>
          </div>
          
          <div>
            <label style="display:block;margin-bottom:8px;font-weight:600;font-size:14px;">
              Villes autorisées <span style="color:var(--danger);">*</span>
            </label>
            <div id="cities-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--gray-300);border-radius:8px;padding:8px;">
              ${citiesHTML}
            </div>
            <p id="cities-error" style="margin:6px 0 0 0;color:var(--danger);font-size:13px;display:none;">
              <i class="fa-solid fa-triangle-exclamation"></i> Sélectionnez au moins une ville
            </p>
          </div>
          
          <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px;">
            <button type="button" class="gp-btn gp-btn--secondary cancel-btn" style="padding:12px 24px;">
              Annuler
            </button>
            <button type="submit" class="gp-btn gp-btn--primary submit-btn" style="padding:12px 24px;display:flex;align-items:center;gap:8px;">
              <i class="fa-solid fa-envelope"></i>
              Envoyer l'invitation
            </button>
          </div>
        </form>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Ajouter les animations CSS
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .city-checkbox-label:hover { background: var(--gray-100); }
        .role-option:hover { background: var(--gray-50); border-color: var(--info); }
        .role-option:has(input:checked) { background: var(--info-lighter); border-color: var(--info); }
      `;
      document.head.appendChild(style);

      const close = () => {
        overlay.remove();
        style.remove();
      };

      // Bind cancel button
      modal.querySelector('.cancel-btn').addEventListener('click', close);

      // Bind overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      // Bind form submit
      const form = modal.querySelector('#invite-form');
      const emailInput = modal.querySelector('#invite-email');
      const citiesError = modal.querySelector('#cities-error');
      const submitBtn = modal.querySelector('.submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const selectedRole = modal.querySelector('input[name="role"]:checked')?.value || 'invited';
        const selectedCities = Array.from(modal.querySelectorAll('input[name="ville"]:checked'))
          .map(cb => cb.value);

        // Validation
        if (!email) {
          emailInput.focus();
          return;
        }

        if (selectedCities.length === 0) {
          citiesError.style.display = 'block';
          return;
        }

        citiesError.style.display = 'none';

        // Désactiver le bouton
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours...';

        try {
          await win.supabaseService.inviteUser(email, selectedCities, selectedRole);

          close();
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
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> Envoyer l\'invitation';
        }
      });

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
