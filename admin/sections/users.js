import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, formatDate, skeletonTable, emptyState } from '../components/ui.js';

let _allUsers = [];
let _roleFilter = 'all'; // 'all' | 'admin' | 'invited'

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
    <div id="users-invite-card" hidden style="margin-bottom:24px;">
      <form id="invite-form" class="cat-form">
        <div class="cat-form__header">
          <h2 class="cat-form__title"><i class="fa-solid fa-envelope"></i> Inviter un utilisateur</h2>
          <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="invite-cancel">
            <i class="fa-solid fa-xmark"></i> Annuler
          </button>
        </div>
        <div class="cat-form__sections">
          <div class="cw-section">
            <div class="cw-section__header">
              <div class="cw-section__icon"><i class="fa-solid fa-at"></i></div>
              <div class="cw-section__titles">
                <div class="cw-section__title">Coordonnées</div>
                <div class="cw-section__desc">L'utilisateur recevra un email pour se connecter à "${esc(store.city)}"</div>
              </div>
            </div>
            <div class="cw-section__body">
              <div class="cw-field">
                <label class="cw-field__label" for="invite-email">
                  Adresse email <span class="cw-required">*</span>
                </label>
                <input type="email" class="cw-field__input cw-field__input--hero" id="invite-email" required
                  placeholder="utilisateur@example.com" autocomplete="off">
                <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> L'utilisateur recevra un lien de connexion à cette adresse.</p>
              </div>
              <div class="cw-field">
                <label class="cw-field__label">Rôle</label>
                <div class="adm-tabs" style="margin-bottom:0;">
                  <button type="button" class="adm-tab active" data-invite-role="invited">
                    <i class="fa-solid fa-user"></i> Contributeur
                  </button>
                  <button type="button" class="adm-tab" data-invite-role="admin">
                    <i class="fa-solid fa-shield-halved"></i> Admin
                  </button>
                </div>
                <input type="hidden" id="invite-role-value" value="invited">
                <p class="cw-field__tip"><i class="fa-solid fa-lightbulb"></i> Les contributeurs peuvent ajouter du contenu. Les admins peuvent aussi gérer les utilisateurs et la structure.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="cw-footer cat-form__footer">
          <button type="button" class="cw-footer__cancel" id="invite-cancel-2">Annuler</button>
          <button type="submit" class="cw-footer__submit" id="invite-submit">
            <i class="fa-solid fa-paper-plane"></i> Envoyer l'invitation
          </button>
        </div>
      </form>
    </div>

    <!-- Toolbar: role filter + search -->
    <div class="adm-tabs" id="users-role-filter" style="margin-bottom:16px;">
      <button class="adm-tab active" data-role="all">Tous</button>
      <button class="adm-tab" data-role="admin"><i class="fa-solid fa-shield-halved"></i> Admins</button>
      <button class="adm-tab" data-role="invited"><i class="fa-solid fa-user"></i> Contributeurs</button>
    </div>

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

  _roleFilter = 'all';
  _bindEvents(container);
  await _loadUsers(container);
}

function _bindEvents(container) {
  const inviteBtn = container.querySelector('#users-invite-btn');
  const inviteCard = container.querySelector('#users-invite-card');
  const cancelBtns = container.querySelectorAll('#invite-cancel, #invite-cancel-2');
  const inviteForm = container.querySelector('#invite-form');
  const searchInput = container.querySelector('#users-search');

  // Role tab toggle inside invite form
  inviteCard.querySelectorAll('[data-invite-role]').forEach(tab => {
    tab.addEventListener('click', () => {
      inviteCard.querySelectorAll('[data-invite-role]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector('#invite-role-value').value = tab.dataset.inviteRole;
    });
  });

  inviteBtn?.addEventListener('click', () => {
    inviteCard.hidden = false;
    inviteCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    container.querySelector('#invite-email')?.focus();
  });

  cancelBtns.forEach(btn => btn.addEventListener('click', () => {
    inviteCard.hidden = true;
    inviteForm.reset();
    // Reset role tabs
    inviteCard.querySelectorAll('[data-invite-role]').forEach(t => t.classList.remove('active'));
    inviteCard.querySelector('[data-invite-role="invited"]')?.classList.add('active');
    container.querySelector('#invite-role-value').value = 'invited';
  }));

  inviteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = container.querySelector('#invite-submit');
    submitBtn.disabled = true;

    const email = container.querySelector('#invite-email').value.trim();
    const activeTab = inviteCard.querySelector('[data-invite-role].active');
    const role = activeTab?.dataset.inviteRole || container.querySelector('#invite-role-value').value || 'invited';

    try {
      const result = await api.inviteUser(email, role);
      if (result?.alreadyMember) {
        toast(`${email} a déjà accès à cette structure`, 'info');
      } else if (result?.addedToCity) {
        toast(`${email} ajouté à la structure ${esc(store.city)}`, 'success');
      } else {
        toast(`Invitation envoyée à ${email}`, 'success');
      }
      inviteCard.hidden = true;
      inviteForm.reset();
      inviteCard.querySelectorAll('[data-invite-role]').forEach(t => t.classList.remove('active'));
      inviteCard.querySelector('[data-invite-role="invited"]')?.classList.add('active');
      container.querySelector('#invite-role-value').value = 'invited';
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
    timer = setTimeout(() => _applyFilters(container), 250);
  });

  // Role filter tabs
  container.querySelectorAll('#users-role-filter .adm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('#users-role-filter .adm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _roleFilter = tab.dataset.role;
      _applyFilters(container);
    });
  });
}

async function _loadUsers(container) {
  const listBody = container.querySelector('#users-list-body');
  if (!listBody) return;

  try {
    _allUsers = await api.getUsers();
    _applyFilters(container);
  } catch (e) {
    console.error('[admin/users]', e);
    listBody.innerHTML = `<div style="padding:20px;color:var(--danger);">Erreur : ${esc(e.message)}</div>`;
  }
}

function _applyFilters(container) {
  const query = (container.querySelector('#users-search')?.value || '').trim().toLowerCase();
  let filtered = _allUsers;

  if (_roleFilter !== 'all') {
    filtered = filtered.filter(u => u.role === _roleFilter);
  }
  if (query) {
    filtered = filtered.filter(u => (u.email || '').toLowerCase().includes(query));
  }

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
