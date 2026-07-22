/**
 * Diagnostic terrain — rapport de zone.
 * Document imprimable (export PDF via impression navigateur), sauvegardé
 * automatiquement dans diagnostic_reports ; historique consultable en
 * slide-panel avec ré-ouverture des rapports passés.
 */

import * as api from '../../api.js';
import { esc, escAttr, toast, confirm, slidePanel, formatDate } from '../../components/ui.js';
import { store } from '../../store.js';
import { dg, safeColor } from './state.js';
import { captureZoneImage } from './map.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/* ── Génération depuis l'analyse courante ──────────────────────── */

/** Compacte l'état courant en données de rapport persistables. */
function _reportData() {
  const a = dg.analysis;
  const sel = dg.selection;
  const byLayer = new Map();
  for (const f of sel.features) byLayer.set(f.__layerId, (byLayer.get(f.__layerId) || 0) + 1);
  const breakdown = [...byLayer.entries()]
    .map(([id, count]) => {
      const layer = dg.layers.find((l) => l.id === id);
      return layer ? { label: layer.label, color: safeColor(layer.style?.color), count } : null;
    })
    .filter(Boolean)
    .sort((x, y) => y.count - x.count);

  return {
    title: `Diagnostic du ${new Date().toLocaleDateString('fr-FR')} — ${_fmt(sel.features.length)} points`,
    zone: { polygon: sel.polygon, bbox: sel.bbox, area_km2: Math.round(sel.areaKm2 * 100) / 100 },
    stats: { breakdown, stats_txt: a.statsTxt },
    analysis: { resume: a.resume, sujets: a.sujets },
    point_count: sel.features.length,
  };
}

/** Génère le rapport de la zone analysée : capture carte, sauvegarde, affichage. */
export async function openReport(btn) {
  if (!dg.analysis || !dg.selection) return;
  const original = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Génération du rapport…';
  }
  let mapImg = null;
  try { mapImg = await captureZoneImage(dg.selection.features); } catch { mapImg = null; }

  const data = _reportData();
  try {
    const { error } = await api.saveDiagnosticReport(data);
    if (error) throw error;
    toast('Rapport sauvegardé dans l\'historique', 'success');
  } catch (err) {
    console.warn('[admin/diagnostic] Sauvegarde rapport:', err);
    toast('Rapport non sauvegardé : ' + (err.message || err), 'warning');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = original;
  }
  _showReportDoc(data, mapImg, new Date());
}

/* ── Document ──────────────────────────────────────────────────── */

function _barChart(items) {
  if (!items.length) return '<div class="dg-rp-muted">Aucune donnée.</div>';
  const max = Math.max(...items.map((i) => i.value), 1);
  return items.map((i) => `
    <div class="dg-rp-bar">
      <span class="dg-rp-bar__label">${esc(i.label)}</span>
      <span class="dg-rp-bar__track"><span class="dg-rp-bar__fill" style="width:${Math.max(3, Math.round(i.value / max * 100))}%;background:${escAttr(i.color)}"></span></span>
      <span class="dg-rp-bar__value">${_fmt(i.value)}</span>
    </div>`).join('');
}

function _showReportDoc(data, mapImg, date) {
  const a = data.analysis;
  const s = data.stats;
  const brand = dg.branding?.brand_name || store.city || '';
  const dateLabel = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const sujets = (a.sujets || []).slice().sort((x, y) => (y.refs?.length || 0) - (x.refs?.length || 0));
  const layerItems = (s.breakdown || []).map((b) => ({ label: b.label, value: b.count, color: safeColor(b.color) }));
  const cited = sujets.reduce((acc, su) => acc + (su.refs?.length || 0), 0);

  const sujetBlocks = sujets.map((su) => {
    const n = su.refs?.length || 0;
    return `
      <div class="dg-rp-sujet">
        <div class="dg-rp-sujet__head">
          <span class="dg-rp-sujet__title">${esc(su.sujet || '')}</span>
          <span class="dg-rp-sujet__count">${_fmt(n)} point${n > 1 ? 's' : ''}</span>
        </div>
        ${(su.verbatims || []).map((v) => `<div class="dg-rp-verb">« ${esc(v)} »</div>`).join('')}
      </div>`;
  }).join('');

  const sujetRows = sujets.map((su) => `<tr>
      <td><b>${_fmt(su.refs?.length || 0)}</b></td>
      <td>${esc(su.sujet || '')}</td>
      <td>${esc((su.verbatims || [])[0] || '—')}</td>
    </tr>`).join('');

  const kpis = [
    ['Points lus', _fmt(data.point_count)],
    ['Couches', _fmt((s.breakdown || []).length)],
    ['Sujets identifiés', _fmt(sujets.length)],
    ['Zone', `${_fmtKm2(data.zone?.area_km2)} km²`],
  ].map(([label, value]) => `<div class="dg-rp-kpi"><b>${value}</b><span>${label}</span></div>`).join('');

  const doc = document.createElement('div');
  doc.className = 'dg-report-doc';
  doc.innerHTML = `
    <div class="dg-rp-toolbar">
      <span class="dg-rp-toolbar__title"><i class="fa-solid fa-file-lines"></i> Rapport de diagnostic terrain</span>
      <span class="dg-rp-toolbar__actions">
        <button type="button" class="adm-btn adm-btn--secondary" data-rp-close>Fermer</button>
        <button type="button" class="adm-btn adm-btn--primary" data-rp-print><i class="fa-solid fa-file-arrow-down"></i> Exporter en PDF</button>
      </span>
    </div>
    <div class="dg-rp-page">
      <div class="dg-rp-cover">
        <div>
          <div class="dg-rp-brand">${esc(brand)}</div>
          <div class="dg-rp-title">Diagnostic terrain — zone</div>
          <div class="dg-rp-sub">${esc(dateLabel)} · ${_fmt(data.point_count)} points · ${_fmtKm2(data.zone?.area_km2)} km²</div>
        </div>
      </div>
      <div class="dg-rp-kpis">${kpis}</div>
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-align-left"></i> Description de la zone</div>
        <p>${esc(a.resume || '')}</p>
      </div>
      ${mapImg ? `
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-map-location-dot"></i> Carte de la zone</div>
        <img class="dg-rp-map" src="${mapImg}" alt="Carte de la zone analysée">
        <div class="dg-rp-muted">Fond de carte et couches actives, cadrés sur la sélection.</div>
      </div>` : ''}
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-layer-group"></i> Répartition des points</div>
        ${_barChart(layerItems)}
      </div>
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-comment-dots"></i> Ce que disent les points</div>
        ${sujetBlocks || '<div class="dg-rp-muted">Les points de cette zone ne portent aucun texte exploitable.</div>'}
      </div>
      ${sujetRows ? `
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-table-list"></i> Récapitulatif</div>
        <table class="dg-rp-table">
          <thead><tr><th>Points</th><th>Sujet</th><th>Exemple cité</th></tr></thead>
          <tbody>${sujetRows}</tbody>
        </table>
      </div>` : ''}
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-circle-info"></i> Méthode</div>
        <div class="dg-rp-method">Les ${_fmt(data.point_count)} points de la zone ont <b>tous</b> été lus, sans échantillonnage — c'est la raison du plafond de 300 points par sélection. La répartition par couche est calculée par le système. Les sujets ci-dessus sont un regroupement, par lecture du texte des signalements, de ce que ces points expriment ; le nombre de points associé à chaque sujet est recalculé à partir des points effectivement rattachés, et les citations sont reproduites mot pour mot. Ce document ne comporte volontairement ni notation, ni hiérarchisation, ni recommandation : il restitue le contenu des données, l'interprétation revient aux services compétents. Les données analysées sont celles des couches activées au moment de la sélection.</div>
      </div>
      <div class="dg-rp-foot"><span>${esc(brand)} — Diagnostic terrain</span><span>Généré le ${esc(dateLabel)} · ${_fmt(cited)} points rattachés à un sujet</span></div>
    </div>
  `;
  document.body.appendChild(doc);
  doc.querySelector('[data-rp-close]')?.addEventListener('click', () => doc.remove());
  doc.querySelector('[data-rp-print]')?.addEventListener('click', () => window.print());
}

/* ── Historique ────────────────────────────────────────────────── */

/** Ouvre l'historique des rapports de la structure en slide-panel. */
export async function openReportsHistory() {
  const handle = slidePanel.open({
    title: 'Historique des diagnostics',
    body: '<div class="adm-skeleton adm-skeleton--card"></div>',
  });

  const reports = await api.getDiagnosticReports(50);
  if (!reports.length) {
    handle.content.querySelector('.adm-slide-panel__body').innerHTML = `
      <div class="adm-empty">
        <div class="adm-empty__icon"><i class="fa-solid fa-file-lines"></i></div>
        <div class="adm-empty__title">Aucun diagnostic sauvegardé</div>
        <div class="adm-empty__text">Les rapports générés depuis l'onglet Analyse apparaîtront ici.</div>
      </div>`;
    return;
  }

  const body = handle.content.querySelector('.adm-slide-panel__body');
  body.innerHTML = `<div class="dg-history">${reports.map((r) => {
    const nb = (r.analysis?.sujets || []).length;
    return `
      <div class="dg-history__row" data-id="${esc(r.id)}">
        <span class="dg-history__count">${_fmt(r.point_count)}<small>pts</small></span>
        <span class="dg-history__txt">
          <span class="dg-history__title">${esc(r.title || 'Diagnostic')}</span>
          <span class="dg-history__meta">${esc(formatDate(r.created_at))} · ${nb} sujet${nb > 1 ? 's' : ''}</span>
        </span>
        <button type="button" class="dg-row__act" data-act="open" title="Ouvrir le rapport"><i class="fa-solid fa-eye"></i></button>
        <button type="button" class="dg-row__act" data-act="delete" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
      </div>`;
  }).join('')}</div>`;

  body.querySelectorAll('.dg-history__row').forEach((row) => {
    const id = row.dataset.id;
    const report = reports.find((r) => r.id === id);
    row.querySelector('[data-act="open"]')?.addEventListener('click', () => {
      if (!report) return;
      _showReportDoc(
        {
          title: report.title,
          zone: report.zone,
          stats: report.stats,
          analysis: report.analysis,
          point_count: report.point_count,
        },
        null,
        new Date(report.created_at)
      );
    });
    row.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
      const ok = await confirm({ title: 'Supprimer le rapport', message: 'Supprimer ce diagnostic de l\'historique ?', confirmLabel: 'Supprimer', danger: true });
      if (!ok) return;
      const { success, error } = await api.deleteDiagnosticReport(id);
      if (!success) { toast('Erreur : ' + (error?.message || error), 'error'); return; }
      row.remove();
      toast('Rapport supprimé', 'success');
    });
  });
}
