/* ============================================================================
   ADMIN SIDEBAR — Initialization, city selector, nav visibility, mobile toggle
   ============================================================================ */

import { store } from '../store.js';
import { router } from '../router.js';
import * as api from '../api.js';
import { esc } from './ui.js';

export async function initSidebar() {
  _bindMobileToggle();
  _bindLogout();
  _renderUserInfo();
  await _populateCitySelector();
  _applyRoleVisibility();
  _bindCityChange();

  // Re-apply visibility on state change
  store.subscribe(() => {
    _applyRoleVisibility();
    _renderUserInfo();
  });
}

/* ── City selector ── */

async function _populateCitySelector() {
  const select = document.getElementById('adm-city-select');
  if (!select) return;

  try {
    const cities = await api.getAvailableCities();
    select.innerHTML = '';
    if (cities.length === 0) {
      select.innerHTML = '<option value="">Aucune structure</option>';
      return;
    }

    for (const c of cities) {
      const opt = document.createElement('option');
      opt.value = c.value;
      opt.textContent = c.label || c.value;
      if (c.value === store.city) opt.selected = true;
      select.appendChild(opt);
    }

    // If store has no city yet, select first
    if (!store.city && cities.length > 0) {
      store.setCity(cities[0].value);
      select.value = cities[0].value;
    }
    // Sync context chip with initial city
    _updateCityContext(store.city || '');
  } catch (e) {
    console.error('[admin/sidebar] Failed to load cities:', e);
    // Fallback: show user's own cities
    const villes = store.villes.filter(v => v !== 'global');
    select.innerHTML = villes.map(v => `<option value="${esc(v)}" ${v === store.city ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }
}

function _bindCityChange() {
  const select = document.getElementById('adm-city-select');
  if (!select) return;
  select.addEventListener('change', () => {
    const code = select.value;
    if (!code) return;
    // Signal content area to fade before re-render
    document.getElementById('adm-content')?.classList.add('adm-content--refreshing');
    // Update city context chip immediately (no wait for re-render)
    _updateCityContext(code);
    // Single source of truth — the store subscriber in app.js handles the re-render
    store.setCity(code);
  });
}

function _updateCityContext(code) {
  const mobile = document.getElementById('adm-mobile-city');
  if (mobile) mobile.textContent = code;
}

/* ── Role-based nav visibility ── */

function _applyRoleVisibility() {
  document.querySelectorAll('.adm-nav-item[data-role]').forEach(el => {
    const required = el.dataset.role;
    if (required === 'admin') {
      el.hidden = !store.isAdmin;
    } else if (required === 'global') {
      el.hidden = !store.isGlobalAdmin;
    }
  });
}

/* ── User info ── */

function _renderUserInfo() {
  const emailEl = document.getElementById('adm-user-email');
  const roleEl = document.getElementById('adm-user-role');
  if (emailEl) emailEl.textContent = store.user?.email || '';
  if (roleEl) {
    roleEl.textContent = store.isGlobalAdmin ? 'Global Admin' : (store.isAdmin ? 'Admin' : 'Contributeur');
  }
}

/* ── Logout ── */

function _bindLogout() {
  const btn = document.getElementById('adm-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      const client = window.AuthModule?.getClient();
      if (client) await client.auth.signOut();
    } catch (_) {}
    window.location.href = '/login/';
  });
}

/* ── Mobile toggle ── */

function _bindMobileToggle() {
  const toggleBtn = document.getElementById('adm-menu-toggle');
  const sidebar = document.getElementById('adm-sidebar');
  const overlay = document.getElementById('adm-overlay');
  if (!toggleBtn || !sidebar) return;

  const close = () => {
    sidebar.classList.remove('open');
    if (overlay) overlay.hidden = true;
  };

  toggleBtn.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.hidden = !isOpen;
  });

  if (overlay) overlay.addEventListener('click', close);

  // Close on nav item click (mobile)
  sidebar.querySelectorAll('.adm-nav-item').forEach(link => {
    link.addEventListener('click', close);
  });
}

/* ── Update pending badge ── */

export function updatePendingBadge(count) {
  const badge = document.getElementById('adm-badge-pending');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
