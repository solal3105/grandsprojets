/* ============================================================================
   ADMIN Participer - file de traitement

   Onglets À traiter / En cours / Clos / Tous, recherche, pagination, export
   tableur (sans aucune donnée personnelle) et ouverture du détail en panneau
   latéral. Les dépôts non confirmés par email n'apparaissent jamais.
   ============================================================================ */

import { store } from '../../store.js';
import * as api from '../../api.js';
import { esc, toast, skeletonTable, renderPagination, emptyState, formatRelativeDate, truncate } from '../../components/ui.js';
import { loadRefData, statutPill, categoryIcon, categoryLabel, STATUTS_CLOS } from './data.js';
import { openDetail } from './detail.js';

const TABS = [
  { key: 'a-traiter', label: 'À traiter', statuts: ['nouveau'] },
  { key: 'en-cours', label: 'En cours', statuts: ['pris_en_compte', 'en_cours'] },
  { key: 'clos', label: 'Clos', statuts: STATUTS_CLOS },
  { key: 'tous', label: 'Tous', statuts: null },
];

const PAGE_SIZE = 20;
const state = { tab: 'a-traiter', page: 1, search: '' };

export async function renderList(container) {
  const city = store.city;

  container.innerHTML = `
    <div class="adm-page-header">
      <div>
        <h1 class="adm-page-title"><i class="fa-solid fa-bullhorn"></i> Participer</h1>
        <p class="adm-page-subtitle">Signalements des habitants pour <strong>${esc(city)}</strong></p>
      </div>
      <div class="adm-page-header__actions">
        <button class="adm-btn adm-btn--secondary" id="pt-export-btn"><i class="fa-solid fa-file-csv"></i> Exporter</button>
        ${store.isAdmin ? `
        <a href="/admin/participer/categories/" data-section="participer" class="adm-btn adm-btn--secondary"><i class="fa-solid fa-tags"></i> Catégories</a>
        <a href="/admin/participer/statuts/" data-section="participer" class="adm-btn adm-btn--secondary"><i class="fa-solid fa-list-check"></i> Statuts</a>
        <a href="/admin/participer/config/" data-section="participer" class="adm-btn adm-btn--secondary"><i class="fa-solid fa-gear"></i> Réglages</a>` : ''}
      </div>
    </div>

    <div class="adm-tabs" id="pt-tabs">
      ${TABS.map((t) => `<button class="adm-tab ${t.key === state.tab ? 'active' : ''}" data-tab="${t.key}">${t.label}<span class="adm-tab-count" data-count="${t.key}" hidden></span></button>`).join('')}
    </div>

    <div class="adm-toolbar">
      <input type="search" class="adm-input adm-input--search" id="pt-search" placeholder="Référence, description, adresse..." value="${esc(state.search)}">
    </div>

    <div id="pt-list-body">${skeletonTable(5)}</div>
    <div id="pt-pagination"></div>
  `;

  container.querySelector('#pt-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.adm-tab');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    state.page = 1;
    container.querySelectorAll('.adm-tab').forEach((b) => b.classList.toggle('active', b === btn));
    _loadRows(container);
  });

  let searchTimer = null;
  container.querySelector('#pt-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      state.page = 1;
      _loadRows(container);
    }, 250);
  });

  container.querySelector('#pt-export-btn')?.addEventListener('click', () => _exportCsv());

  _injectPendingCount(container);
  await _loadRows(container);
}

async function _loadRows(container) {
  const body = container.querySelector('#pt-list-body');
  const pagination = container.querySelector('#pt-pagination');
  if (!body) return;
  body.innerHTML = skeletonTable(5);

  try {
    const ref = await loadRefData(store.city);
    const tab = TABS.find((t) => t.key === state.tab) || TABS[0];
    const { rows, total } = await api.listParticiperSignalements({
      statutKeys: tab.statuts,
      page: state.page,
      pageSize: PAGE_SIZE,
      search: state.search,
    });

    if (!rows.length) {
      body.innerHTML = '';
      body.appendChild(emptyState({
        icon: 'fa-solid fa-bullhorn',
        title: state.search ? 'Aucun résultat' : 'Aucun signalement ici',
        text: state.search ? 'Essayez une autre recherche.' : 'Les signalements confirmés par leurs auteurs apparaîtront dans cette file.',
      }));
      if (pagination) pagination.innerHTML = '';
      return;
    }

    body.innerHTML = `
      <div class="adm-card">
        ${rows.map((row) => `
          <button class="adm-list-item ptadm-row" data-id="${esc(row.id)}">
            ${categoryIcon(ref, row.category_key)}
            <div class="adm-list-item__info">
              <div class="adm-list-item__name">${esc(categoryLabel(ref, row.category_key))} <span class="ptadm-ref">${esc(row.reference)}</span></div>
              <div class="adm-list-item__meta">
                <span>${esc(formatRelativeDate(row.created_at))}</span>
                ${row.adresse ? `<span>${esc(row.adresse)}</span>` : ''}
                ${row.description ? `<span class="ptadm-row__desc">${esc(truncate(row.description, 80))}</span>` : ''}
              </div>
            </div>
            ${row.photo_path ? '<i class="fa-solid fa-camera ptadm-camera" title="Photo jointe"></i>' : ''}
            ${statutPill(ref, row.statut_key)}
            <span class="adm-badge ${row.published ? 'adm-badge--success' : 'adm-badge--neutral'}">${row.published ? 'Publié' : 'Non publié'}</span>
          </button>`).join('')}
      </div>`;

    body.querySelectorAll('.ptadm-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = rows.find((r) => r.id === btn.dataset.id);
        if (row) openDetail(row, ref, { onChange: () => _loadRows(container) });
      });
    });

    if (pagination) {
      pagination.innerHTML = '';
      if (total > PAGE_SIZE) {
        pagination.appendChild(renderPagination({
          page: state.page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (p) => { state.page = p; _loadRows(container); },
        }));
      }
    }
  } catch (e) {
    // Une file illisible n'est PAS une file vide : le dire franchement
    console.error('[admin/participer]', e);
    body.innerHTML = `<div class="adm-card" style="padding:20px;color:var(--color-danger);">Liste illisible : ${esc(e.message)}</div>`;
    if (pagination) pagination.innerHTML = '';
  }
}

async function _injectPendingCount(container) {
  try {
    const count = await api.getParticiperPendingCount();
    const badge = container.querySelector('[data-count="a-traiter"]');
    if (badge && count > 0) {
      badge.textContent = count;
      badge.hidden = false;
      badge.classList.add('adm-tab-count--warn');
    }
  } catch { /* compteur facultatif */ }
}

/* ── Export tableur ─────────────────────────────────────────────────
   Volontairement SANS email ni hash d'IP : l'export circule (services
   techniques, prestataires), les données personnelles n'y ont pas leur place. */

const EXPORT_MAX = 1000;

async function _exportCsv() {
  try {
    const ref = await loadRefData(store.city);
    const tab = TABS.find((t) => t.key === state.tab) || TABS[0];
    const { rows, total } = await api.listParticiperSignalements({
      statutKeys: tab.statuts,
      page: 1,
      pageSize: EXPORT_MAX,
      search: state.search,
    });
    if (!rows.length) { toast('Rien à exporter', 'info'); return; }
    // Un export tronqué en silence se lit comme un export complet
    if (total > rows.length) {
      toast(`Export limité aux ${rows.length} plus récents sur ${total} - filtrez pour le reste`, 'warning');
    }

    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = [
      ['reference', 'categorie', 'statut', 'description', 'adresse', 'lat', 'lng', 'publie', 'cree_le', 'clos_le'].join(';'),
      ...rows.map((r) => [
        cell(r.reference),
        cell(categoryLabel(ref, r.category_key)),
        cell(ref.statuts.find((s) => s.statut_key === r.statut_key)?.label || r.statut_key),
        cell(r.description),
        cell(r.adresse),
        cell(r.lat),
        cell(r.lng),
        cell(r.published ? 'oui' : 'non'),
        cell(r.created_at ? r.created_at.slice(0, 10) : ''),
        cell(r.closed_at ? r.closed_at.slice(0, 10) : ''),
      ].join(';')),
    ];
    // BOM : Excel FR n'ouvre pas l'UTF-8 correctement sans lui
    const blob = new Blob(['﻿' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `signalements-${store.city}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${rows.length} signalement(s) exporté(s)`, 'success');
  } catch (e) {
    toast('Export impossible : ' + (e.message || e), 'error');
  }
}
