/* ============================================================================
   ADMIN UI — Shared UI primitives (toast, confirm, slide-panel, format)
   ============================================================================ */

/* ── Toast ── */

export function toast(message, type = 'info') {
  const container = document.getElementById('adm-toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `adm-toast adm-toast--${type}`;
  el.innerHTML = `<i class="fa-solid ${_toastIcon(type)}"></i><span>${esc(message)}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
  }, 3500);
}

function _toastIcon(type) {
  const map = { success: 'fa-check', error: 'fa-xmark', warning: 'fa-triangle-exclamation', info: 'fa-info-circle' };
  return map[type] || map.info;
}

/* ── Confirm dialog ── */

export function confirm({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('adm-dialog');
    const body = document.getElementById('adm-dialog-body');
    const cancelBtn = document.getElementById('adm-dialog-cancel');
    const confirmBtn = document.getElementById('adm-dialog-confirm');
    if (!dialog || !body) { resolve(false); return; }

    body.innerHTML = `<strong>${esc(title)}</strong>${message ? `<p>${esc(message)}</p>` : ''}`;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = `adm-btn ${danger ? 'adm-btn--danger' : 'adm-btn--primary'}`;

    const cleanup = () => { dialog.close(); cancelBtn.onclick = null; confirmBtn.onclick = null; };
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
    confirmBtn.onclick = () => { cleanup(); resolve(true); };
    dialog.addEventListener('cancel', () => { cleanup(); resolve(false); }, { once: true });

    dialog.showModal();
  });
}

/* ── Slide Panel ── */

export const slidePanel = {
  open({ title, body, footer, onClose }) {
    const panel = document.getElementById('adm-slide-panel');
    const content = document.getElementById('adm-slide-content');
    const backdrop = document.getElementById('adm-slide-backdrop');
    if (!panel || !content) return;

    content.innerHTML = `
      <div class="adm-slide-panel__header">
        <span class="adm-slide-panel__title">${esc(title)}</span>
        <button class="adm-btn adm-btn--ghost adm-btn--icon" id="adm-slide-close" aria-label="Fermer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="adm-slide-panel__body">${body}</div>
      ${footer ? `<div class="adm-slide-panel__footer">${footer}</div>` : ''}
    `;

    panel.setAttribute('aria-hidden', 'false');

    const close = () => {
      panel.setAttribute('aria-hidden', 'true');
      if (onClose) onClose();
    };

    content.querySelector('#adm-slide-close').onclick = close;
    backdrop.onclick = close;

    // Return handle for external close
    return { close, content };
  },

  close() {
    const panel = document.getElementById('adm-slide-panel');
    if (panel) panel.setAttribute('aria-hidden', 'true');
  },
};

/* ── Formatting helpers ── */

export function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = String(str);
  return el.innerHTML;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(dateStr);
}

export function truncate(str, len = 60) {
  if (!str || str.length <= len) return str || '';
  return str.slice(0, len) + '…';
}

/* ── Skeleton generators ── */

export function skeletonTable(rows = 5) {
  return `<div class="adm-card">${Array(rows).fill('<div class="adm-skeleton adm-skeleton--card" style="margin:12px 16px;"></div>').join('')}</div>`;
}

/* ── Pagination helper ── */

export function renderPagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);

  const div = document.createElement('div');
  div.className = 'adm-pagination';
  div.innerHTML = `
    <span class="adm-pagination__info">${start}–${end} sur ${total}</span>
    <div class="adm-pagination__buttons">
      <button class="adm-btn adm-btn--secondary adm-btn--sm" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <button class="adm-btn adm-btn--secondary adm-btn--sm" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
  `;
  div.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages) onPageChange(p);
    });
  });
  return div;
}

/* ── Generic empty state ── */

export function emptyState({ icon = 'fa-solid fa-inbox', title, text, actionLabel, onAction } = {}) {
  const div = document.createElement('div');
  div.className = 'adm-empty';
  div.innerHTML = `
    <div class="adm-empty__icon"><i class="${icon}"></i></div>
    <div class="adm-empty__title">${esc(title || 'Aucun élément')}</div>
    ${text ? `<div class="adm-empty__text">${esc(text)}</div>` : ''}
    ${actionLabel ? `<button class="adm-btn adm-btn--primary">${esc(actionLabel)}</button>` : ''}
  `;
  if (actionLabel && onAction) {
    div.querySelector('.adm-btn').addEventListener('click', onAction);
  }
  return div;
}
