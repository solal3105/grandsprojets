/* ============================================================================
   USERS SECTION — List, invite, change role
   ============================================================================ */

import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, formatDate, skeletonTable, emptyState } from '../components/ui.js';

export async function renderUsers(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-users"></i> Utilisateurs</h1>
        <p class="adm-page-subtitle">Gérer les utilisateurs de ${esc(store.city)}</p>
      </div>
      <button class="adm-btn adm-btn--primary" id="users-invite-btn">
        <i class="fa-solid fa-envelope"></i> Inviter
      </button>
    </div>

    <!-- Invite form (inline, hidden by default) -->
    <div class="adm-card" id="users-invite-card" hidden style="margin-bottom:24px;">
      <div class="adm-card__header">
        <span class="adm-card__title"><i class="fa-solid fa-envelope"></i> Inviter un utilisateur</span>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" id="invite-cancel">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="adm-card__body">
        <form id="invite-form">
          <div class="adm-form-row">
            <div class="adm-form-group">
              <label class="adm-label">Email <span class="adm-required">*</span></label>
              <input type="email" class="adm-input" id="invite-email" required placeholder="user@example.com">
            </div>
            <div class="adm-form-group">
              <label class="adm-label">Rôle</label>
              <div style="display:flex; gap:12px; margin-top:8px;">
                <label class="adm-radio-label">
                  <input type="radio" name="invite-role" value="invited" checked> Contributeur
                </label>
                <label class="adm-radio-label">
                  <input type="radio" name="invite-role" value="admin"> Admin
                </label>
              </div>
            </div>
          </div>
          <p class="adm-form-hint" style="margin-bottom:12px;">
            L'utilisateur recevra un email pour se connecter. Il aura accès à la structure "${esc(store.city)}".
          </p>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" class="adm-btn adm-btn--secondary" id="invite-cancel-2">Annuler</button>
            <button type="submit" class="adm-btn adm-btn--primary" id="invite-submit">
              <i class="fa-solid fa-paper-plane"></i> Envoyer l'invitation
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Search -->
    <div class="adm-toolbar">
      <div class="adm-toolbar__search">
        <input type="text" class="adm-input adm-input--search" id="users-search" placeholder="Rechercher par email…">
      </div>
    </div>

    <!-- Users list -->
    <div class="adm-card">
      <div id="users-list-body" style="padding:0;">
        ${skeletonTable(4)}
      </div>
    </div>
  `;

  _bindEvents(container);
  await _loadUsers(container);
}

function _bindEvents(container) {
  const inviteBtn = container.querySelector('#users-invite-btn');
  const inviteCard = container.querySelector('#users-invite-card');
  const cancelBtns = container.querySelectorAll('#invite-cancel, #invite-cancel-2');
  const inviteForm = container.querySelector('#invite-form');
  const searchInput = container.querySelector('#users-search');

  inviteBtn?.addEventListener('click', () => {
    inviteCard.hidden = false;
    inviteCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    container.querySelector('#invite-email')?.focus();
  });

  cancelBtns.forEach(btn => btn.addEventListener('click', () => {
    inviteCard.hidden = true;
    inviteForm.reset();
  }));

  inviteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = container.querySelector('#invite-submit');
    submitBtn.disabled = true;

    const email = container.querySelector('#invite-email').value.trim();
    const role = container.querySelector('input[name="invite-role"]:checked')?.value || 'invited';

    try {
      await api.inviteUser(email, role);
      toast(`Invitation envoyée à ${email}`, 'success');
      inviteCard.hidden = true;
      inviteForm.reset();
      await _loadUsers(container);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Search
  let timer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => _filterList(container, searchInput.value.trim()), 250);
  });
}

let _allUsers = [];

async function _loadUsers(container) {
  const listBody = container.querySelector('#users-list-body');
  if (!listBody) return;

  try {
    _allUsers = await api.getUsers();
    _renderUsers(container, _allUsers);
  } catch (e) {
    console.error('[admin/users]', e);
    listBody.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _filterList(container, query) {
  const filtered = query
    ? _allUsers.filter(u => (u.email || '').toLowerCase().includes(query.toLowerCase()))
    : _allUsers;
  _renderUsers(container, filtered);
}

function _renderUsers(container, users) {
  const listBody = container.querySelector('#users-list-body');
  if (!listBody) return;

  if (users.length === 0) {
    listBody.innerHTML = '';
    listBody.appendChild(emptyState({
      icon: 'fa-solid fa-users',
      title: 'Aucun utilisateur',
      text: 'Invitez des utilisateurs pour commencer.',
    }));
    return;
  }

  listBody.innerHTML = users.map(_renderUserRow).join('');

  // Bind role change
  listBody.querySelectorAll('[data-action="toggle-role"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      const user = _allUsers.find(u => u.id === userId);
      if (!user) return;

      const newRole = user.role === 'admin' ? 'invited' : 'admin';
      const label = newRole === 'admin' ? 'Promouvoir en Admin' : 'Rétrograder en Contributeur';

      const yes = await confirm({
        title: label,
        message: `Changer le rôle de ${user.email} en "${newRole}" ?`,
        confirmLabel: label,
        danger: newRole === 'invited',
      });
      if (!yes) return;

      btn.disabled = true;
      try {
        await api.updateUserRole(userId, newRole);
        toast(`Rôle mis à jour : ${newRole}`, 'success');
        await _loadUsers(container);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function _renderUserRow(user) {
  const roleIcon = user.role === 'admin' ? 'fa-shield-halved' : 'fa-user';
  const roleBadge = user.role === 'admin'
    ? '<span class="adm-badge adm-badge--info"><i class="fa-solid fa-shield-halved"></i> Admin</span>'
    : '<span class="adm-badge adm-badge--neutral"><i class="fa-solid fa-user"></i> Contributeur</span>';

  const villes = Array.isArray(user.ville) ? user.ville.filter(v => v !== 'global') : [];
  const villesBadges = villes.map(v => `<span class="adm-badge adm-badge--neutral" style="font-size:11px;">${esc(v)}</span>`).join(' ');

  const toggleLabel = user.role === 'admin' ? 'Rétrograder' : 'Promouvoir';
  const toggleIcon = user.role === 'admin' ? 'fa-arrow-down' : 'fa-arrow-up';

  return `
    <div class="adm-user-row">
      <div class="adm-user-row__avatar">
        <i class="fa-solid ${roleIcon}"></i>
      </div>
      <div class="adm-user-row__info">
        <div class="adm-user-row__email">${esc(user.email)}</div>
        <div class="adm-user-row__meta">
          ${roleBadge}
          ${villesBadges}
          <span>· ${formatDate(user.created_at)}</span>
        </div>
      </div>
      <div class="adm-user-row__actions">
        <button class="adm-btn adm-btn--secondary adm-btn--sm" data-action="toggle-role" data-user-id="${user.id}" title="${toggleLabel}">
          <i class="fa-solid ${toggleIcon}"></i> ${toggleLabel}
        </button>
      </div>
    </div>
  `;
}
