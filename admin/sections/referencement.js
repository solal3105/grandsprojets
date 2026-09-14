/**
 * Référencement : quels espaces sont proposés aux moteurs de recherche.
 *
 * Page réservée aux super administrateurs (profil admin avec 'global').
 * Le réglage est city_branding.indexable ; la base le garde elle-même
 * (trigger city_indexing_guard : seul un super administrateur peut le
 * changer) et consigne chaque changement dans city_indexing_log. L'écran
 * lit la vue city_indexing_overview : un espace par ligne, son réglage, ses
 * fiches publiques et son dernier changement.
 *
 * Tout ce qui se calcule ou se formule sans le DOM est dans
 * referencement/model.js.
 */
import { store } from '../store.js';
import * as api from '../api.js';
import { toast, confirm, esc, emptyState, formatDate, formatDateTime, skeletonTable } from '../components/ui.js';
import {
  FILTERS, filterSpaces, summarize, displayName,
  stateLabel, changeLabel, fichesLabel, authorLabel, confirmCopy,
} from './referencement/model.js';

const LOG_LIMIT = 30;

/* ── State ──────────────────────────────────────────────────────── */
let _rows = [];
let _log = [];
let _state = { query: '', filter: FILTERS.all };
let _container = null;

/* ── Public entry point ────────────────────────────────────────── */

export async function renderReferencement(container) {
  _container = container;
  _state = { query: '', filter: FILTERS.all };

  if (!store.isGlobalAdmin) {
    _showReserved(container);
    return;
  }

  _showShell(container);
  await _load();
}

/* ── Page réservée ─────────────────────────────────────────────── */

function _showReserved(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-magnifying-glass"></i> Référencement</h1>
      </div>
    </div>
    <div class="adm-card" id="idx-reserved"></div>
  `;
  container.querySelector('#idx-reserved')?.appendChild(emptyState({
    icon: 'fa-solid fa-lock',
    title: 'Cette page est réservée aux super administrateurs',
    text: 'Le choix des espaces proposés aux moteurs de recherche vaut pour toute la plateforme. Demandez à un super administrateur si un espace doit être retiré des moteurs ou remis dans les moteurs.',
  }));
}

/* ── Squelette de la page ──────────────────────────────────────── */

function _showShell(container) {
  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-magnifying-glass"></i> Référencement</h1>
        <p class="adm-page-subtitle">Choisissez les espaces dont la page de ville et les fiches sont proposées aux moteurs de recherche.</p>
      </div>
    </div>

    <div class="adm-card idx-intro">
      <p>Un espace retiré des moteurs reste ouvert : sa carte, sa page de ville et ses fiches se consultent toujours par lien. Elles sortent du plan du site et signalent aux moteurs de recherche qu'elles ne doivent pas apparaître dans les résultats.</p>
      <p>Le plan du site se met à jour dans l'heure et les pages dans les cinq minutes. Google met ensuite de quelques jours à plusieurs semaines pour retirer ou ajouter les pages, à son rythme. Les pages du site vitrine, de l'aide et de la démonstration ne se règlent pas ici.</p>
    </div>

    <div class="idx-stats" id="idx-stats" aria-live="polite"></div>

    <div class="adm-tabs" id="idx-tabs" role="tablist" aria-label="Filtrer les espaces">
      <button class="adm-tab active" data-filter="all" role="tab" aria-selected="true">Tous les espaces</button>
      <button class="adm-tab" data-filter="on" role="tab" aria-selected="false">Proposés aux moteurs</button>
      <button class="adm-tab" data-filter="off" role="tab" aria-selected="false">Retirés des moteurs</button>
    </div>

    <div class="adm-toolbar">
      <div class="adm-toolbar__search">
        <input type="search" class="adm-input adm-input--search" id="idx-search"
               placeholder="Rechercher par nom ou par code" aria-label="Rechercher un espace par son nom ou son code">
      </div>
    </div>

    <div class="adm-card">
      <div id="idx-list" class="idx-list">${skeletonTable(6)}</div>
    </div>

    <section class="idx-log" aria-labelledby="idx-log-title">
      <h2 class="idx-log__title" id="idx-log-title">Derniers changements</h2>
      <div class="adm-card">
        <div id="idx-log">${skeletonTable(3)}</div>
      </div>
    </section>
  `;

  container.querySelector('#idx-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-filter]');
    if (!tab) return;
    _state.filter = tab.dataset.filter;
    container.querySelectorAll('#idx-tabs .adm-tab').forEach((el) => {
      const active = el === tab;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    _renderList();
  });

  let timer;
  container.querySelector('#idx-search')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _state.query = e.target.value.trim();
      _renderList();
    }, 200);
  });

  const list = container.querySelector('#idx-list');
  list?.addEventListener('change', _onToggle);
}

/* ── Chargement ────────────────────────────────────────────────── */

async function _load() {
  const list = _container?.querySelector('#idx-list');
  if (!list) return;

  try {
    [_rows, _log] = await Promise.all([api.getIndexingOverview(), api.getIndexingLog(LOG_LIMIT)]);
    _renderStats();
    _renderList();
    _renderLog();
  } catch (e) {
    console.error('[admin/referencement]', e);
    list.innerHTML = '';
    list.appendChild(emptyState({
      icon: 'fa-solid fa-triangle-exclamation',
      title: 'Les espaces n\'ont pas pu être chargés',
      text: 'Rechargez la page. Si le problème persiste, vérifiez votre connexion.',
    }));
  }
}

async function _reloadLog() {
  try {
    _log = await api.getIndexingLog(LOG_LIMIT);
    _renderLog();
  } catch (e) {
    console.warn('[admin/referencement] journal', e);
  }
}

/* ── Rendu ─────────────────────────────────────────────────────── */

function _renderStats() {
  const el = _container?.querySelector('#idx-stats');
  if (!el) return;
  const s = summarize(_rows);
  const tile = (value, label) => `
    <div class="idx-stat">
      <div class="idx-stat__value">${value.toLocaleString('fr-FR')}</div>
      <div class="idx-stat__label">${label}</div>
    </div>`;
  el.innerHTML = [
    tile(s.proposes, 'espaces proposés aux moteurs'),
    tile(s.retires, 'espaces retirés des moteurs'),
    tile(s.fichesProposees, 'fiches proposées aux moteurs'),
    tile(s.fichesRetirees, 'fiches retirées avec leur espace'),
  ].join('');
}

function _renderList() {
  const list = _container?.querySelector('#idx-list');
  if (!list) return;

  const rows = filterSpaces(_rows, _state);
  if (!rows.length) {
    list.innerHTML = '';
    list.appendChild(emptyState({
      icon: 'fa-solid fa-magnifying-glass',
      title: _state.query
        ? 'Aucun espace ne correspond à cette recherche'
        : (_state.filter === FILTERS.off ? 'Aucun espace n\'est retiré des moteurs' : 'Aucun espace n\'est proposé aux moteurs'),
      text: _state.query ? 'Essayez le code de l\'espace, tel qu\'il apparaît dans l\'adresse de sa carte.' : '',
    }));
    return;
  }

  list.innerHTML = rows.map(_rowHTML).join('');
}

function _rowHTML(row) {
  const on = row.indexable !== false;
  const name = displayName(row);
  const last = row.last_changed_at
    ? `<span class="idx-row__last">${on ? 'Proposé' : 'Retiré'} le ${esc(formatDate(row.last_changed_at))} ${esc(authorLabel(row.last_changed_by_email))}</span>`
    : '';
  return `
    <div class="adm-list-item idx-row" data-ville="${esc(row.ville)}" data-indexable="${on ? 'true' : 'false'}">
      <div class="idx-row__state ${on ? 'idx-row__state--on' : 'idx-row__state--off'}" aria-hidden="true">
        <i class="fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'}"></i>
      </div>
      <div class="adm-list-item__info">
        <div class="adm-list-item__name">${esc(name)}</div>
        <div class="adm-list-item__meta">
          <span class="adm-badge adm-badge--info">${esc(row.ville)}</span>
          <span class="adm-badge ${on ? 'adm-badge--success' : 'adm-badge--neutral'}">${stateLabel(row.indexable)}</span>
          <span>${esc(fichesLabel(row.fiches_publiques))}</span>
          ${last}
        </div>
      </div>
      <div class="idx-row__toggle">
        <label class="adm-switch">
          <input type="checkbox" ${on ? 'checked' : ''} data-action="toggle" data-ville="${esc(row.ville)}"
                 aria-label="Proposer ${esc(name)} aux moteurs de recherche">
          <span class="adm-switch__track"></span>
        </label>
      </div>
    </div>
  `;
}

function _renderLog() {
  const el = _container?.querySelector('#idx-log');
  if (!el) return;

  if (!_log.length) {
    el.innerHTML = '';
    el.appendChild(emptyState({
      icon: 'fa-solid fa-clock-rotate-left',
      title: 'Aucun changement enregistré pour l\'instant',
      text: 'Chaque espace proposé ou retiré des moteurs depuis cette page apparaîtra ici, avec la date et l\'auteur du changement.',
    }));
    return;
  }

  const nameOf = new Map(_rows.map((r) => [r.ville, displayName(r)]));
  el.innerHTML = `<ul class="idx-log__list">${_log.map((entry) => `
    <li class="idx-log__item" data-ville="${esc(entry.ville)}">
      <span class="idx-log__date">${esc(formatDateTime(entry.changed_at))}</span>
      <span class="idx-log__text">
        <strong>${esc(nameOf.get(entry.ville) || entry.ville)}</strong>
        <span class="adm-badge adm-badge--info">${esc(entry.ville)}</span>
        ${changeLabel(entry.indexable)} ${esc(authorLabel(entry.changed_by_email))}
      </span>
    </li>`).join('')}</ul>`;
}

/* ── Bascule ───────────────────────────────────────────────────── */

async function _onToggle(e) {
  const input = e.target.closest('input[data-action="toggle"]');
  if (!input) return;

  const ville = input.dataset.ville;
  const row = _rows.find((r) => r.ville === ville);
  if (!row) return;

  const next = input.checked;
  const copy = confirmCopy(row, next);
  const yes = await confirm({ ...copy, danger: !next });
  if (!yes) {
    input.checked = !next;
    return;
  }

  input.disabled = true;
  try {
    const updated = await api.setCityIndexable(ville, next);
    Object.assign(row, updated || { indexable: next });
    toast(`${displayName(row)} est ${changeLabel(row.indexable)} de recherche`, 'success');
    _renderStats();
    _renderList();
    await _reloadLog();
  } catch (err) {
    input.checked = !next;
    input.disabled = false;
    // PGRST116 : aucune ligne modifiée (droits) ; sinon le message de la base
    // (garde : « Seul un super administrateur… ») est déjà une phrase.
    const message = err?.code === 'PGRST116'
      ? 'Le changement n\'a pas été enregistré. Rechargez la page et réessayez.'
      : (err?.message || 'Le changement n\'a pas été enregistré.');
    toast(message, 'error');
  }
}
