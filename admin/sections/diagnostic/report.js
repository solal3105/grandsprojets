/**
 * Diagnostic terrain — rapport de zone.
 * Document imprimable (export PDF via impression navigateur), sauvegardé
 * automatiquement dans diagnostic_reports ; historique consultable en
 * slide-panel avec ré-ouverture des rapports passés.
 */

import * as api from '../../api.js';
import { esc, toast, confirm, slidePanel, formatDate } from '../../components/ui.js';
import { store } from '../../store.js';
import { dg, LEVEL_COLORS, SEVERITY_COLORS } from './state.js';
import { captureZoneImage } from './map.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

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
      return layer ? { label: layer.label, color: layer.style?.color || '#2563EB', count } : null;
    })
    .filter(Boolean)
    .sort((x, y) => y.count - x.count);

  return {
    title: `Diagnostic du ${new Date().toLocaleDateString('fr-FR')} — ${_fmt(sel.features.length)} points — zone ${a.level}`,
    zone: { polygon: sel.polygon, bbox: sel.bbox, area_km2: Math.round(sel.areaKm2 * 100) / 100 },
    stats: {
      breakdown,
      neg: a.stats.neg,
      pos: a.stats.pos,
      neutral: sel.features.length - a.stats.neg - a.stats.pos,
      correlations_total: a.stats.correlations,
      stats_txt: a.statsTxt,
      corr_txt: a.corrTxt,
    },
    analysis: { resume: a.resume, level: a.level, insights: a.insights },
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
      <span class="dg-rp-bar__track"><span class="dg-rp-bar__fill" style="width:${Math.max(3, Math.round(i.value / max * 100))}%;background:${esc(i.color)}"></span></span>
      <span class="dg-rp-bar__value">${_fmt(i.value)}</span>
    </div>`).join('');
}

function _sentimentStack(neg, pos, neutral) {
  const total = (neg + pos + neutral) || 1;
  const seg = (v, color) => v
    ? `<span style="width:${(v / total * 100)}%;background:${color}">${v / total > 0.08 ? v : ''}</span>` : '';
  return `
    <div class="dg-rp-stack">${seg(neg, '#DC2626')}${seg(pos, '#16A34A')}${seg(neutral, '#94A3B8')}</div>
    <div class="dg-rp-legend">
      <span><i style="background:#DC2626"></i>Négatifs ${_fmt(neg)}</span>
      <span><i style="background:#16A34A"></i>Positifs ${_fmt(pos)}</span>
      <span><i style="background:#94A3B8"></i>Neutres ${_fmt(neutral)}</span>
    </div>`;
}

function _showReportDoc(data, mapImg, date) {
  const a = data.analysis;
  const s = data.stats;
  const levelColor = LEVEL_COLORS[a.level] || '#64748B';
  const brand = dg.branding?.brand_name || store.city || '';
  const dateLabel = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const insights = (a.insights || []).slice().sort((x, y) => (y.gravite || 0) - (x.gravite || 0));
  const grave = insights.filter((i) => (i.gravite || 0) >= 4).length;

  const gravCounts = [5, 4, 3, 2, 1].map((g) => ({
    label: `Gravité ${g}`,
    value: insights.filter((i) => i.gravite === g).length,
    color: SEVERITY_COLORS[g],
  }));
  const layerItems = (s.breakdown || []).map((b) => ({ label: b.label, value: b.count, color: b.color }));

  const insightBlocks = insights.map((i) => {
    const sev = SEVERITY_COLORS[i.gravite] || SEVERITY_COLORS[1];
    return `
      <div class="dg-rp-ins" style="border-left-color:${esc(sev)}">
        <div class="dg-rp-ins__top">
          <span class="dg-rp-ins__sev" style="background:${esc(sev)}">Gravité ${i.gravite}</span>
          <span class="dg-rp-ins__cat">${esc(i.categorie || '')}</span>
          <span class="dg-rp-ins__conf">Confiance ${esc(i.confiance || '—')}</span>
        </div>
        <div class="dg-rp-ins__title">${esc(i.titre || '')}</div>
        ${i.correlation ? `<div class="dg-rp-ins__corr">${esc(i.correlation)}</div>` : ''}
        ${(i.verbatims || []).map((v) => `<div class="dg-rp-verb">« ${esc(v)} »</div>`).join('')}
        ${i.piste ? `<div class="dg-rp-ins__piste"><b>Piste à explorer :</b> ${esc(i.piste)}</div>` : ''}
      </div>`;
  }).join('');

  const pisteRows = insights.filter((i) => i.piste).map((i) => {
    const sev = SEVERITY_COLORS[i.gravite] || SEVERITY_COLORS[1];
    return `<tr>
      <td><span class="dg-rp-pill" style="background:${esc(sev)}">${i.gravite}</span></td>
      <td>${esc(i.piste)}</td>
      <td>${esc(i.categorie || '')}</td>
    </tr>`;
  }).join('');

  const kpis = [
    ['Points analysés', _fmt(data.point_count)],
    ['Signaux négatifs', _fmt(s.neg)],
    ['Signaux positifs', _fmt(s.pos)],
    ['Co-occurrences', _fmt(s.correlations_total)],
    ['Constats grav. ≥ 4', _fmt(grave)],
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
          <div class="dg-rp-brand"><i class="fa-solid fa-location-dot"></i> Open Projets</div>
          <div class="dg-rp-title">Diagnostic terrain — zone</div>
          <div class="dg-rp-sub">${esc(brand)} · ${esc(dateLabel)}<br>${_fmt(data.point_count)} points · ${Number(data.zone?.area_km2 || 0).toFixed(2)} km²</div>
        </div>
        <span class="dg-rp-level" style="background:${esc(levelColor)}">Zone ${esc(a.level)}</span>
      </div>
      <div class="dg-rp-kpis">${kpis}</div>
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-align-left"></i> Synthèse</div>
        <p>${esc(a.resume || '')}</p>
        ${s.corr_txt ? `<ul class="dg-rp-corrs">${s.corr_txt.split('\n').filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      </div>
      ${mapImg ? `
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-map-location-dot"></i> Carte de la zone analysée</div>
        <img class="dg-rp-map" src="${mapImg}" alt="Carte de la zone analysée">
        <div class="dg-rp-muted">Fond de carte et couches actives, cadrés sur la sélection.</div>
      </div>` : ''}
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-chart-column"></i> Indicateurs</div>
        <div class="dg-rp-grid2">
          <div><div class="dg-rp-chart-t">Points par couche</div>${_barChart(layerItems)}</div>
          <div><div class="dg-rp-chart-t">Constats par gravité</div>${_barChart(gravCounts.filter((g) => g.value))}</div>
        </div>
        <div class="dg-rp-chart-t" style="margin-top:16px">Balance des signaux</div>
        ${_sentimentStack(s.neg, s.pos, s.neutral ?? Math.max(0, data.point_count - s.neg - s.pos))}
      </div>
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-list-check"></i> Constats priorisés</div>
        ${insightBlocks || '<div class="dg-rp-muted">Aucun constat.</div>'}
      </div>
      ${pisteRows ? `
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-compass-drafting"></i> Pistes à explorer</div>
        <div class="dg-rp-muted" style="margin-bottom:8px">Pistes non prescriptives, à instruire par les services compétents.</div>
        <table class="dg-rp-table">
          <thead><tr><th>Grav.</th><th>Piste à explorer</th><th>Catégorie</th></tr></thead>
          <tbody>${pisteRows}</tbody>
        </table>
      </div>` : ''}
      <div class="dg-rp-sec">
        <div class="dg-rp-h2"><i class="fa-solid fa-circle-info"></i> Méthodologie &amp; limites</div>
        <div class="dg-rp-method">Diagnostic généré par IA à partir d'un échantillon représentatif des ${_fmt(data.point_count)} points de la zone, enrichi de statistiques et de co-occurrences spatiales calculées par le système (rayon 60 m). Les constats sont des observations factuelles issues des données ; les citations sont extraites verbatim des signalements sources. Les « pistes à explorer » sont indicatives et non prescriptives : elles ne préjugent d'aucune solution technique et doivent être instruites par les services compétents. Les données analysées sont celles des couches activées au moment de la sélection.</div>
      </div>
      <div class="dg-rp-foot"><span>Open Projets — Diagnostic terrain</span><span>Généré le ${esc(dateLabel)}</span></div>
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
    const level = r.analysis?.level || '—';
    const color = LEVEL_COLORS[level] || '#64748B';
    return `
      <div class="dg-history__row" data-id="${esc(r.id)}">
        <span class="dg-history__level" style="background:${esc(color)}">${esc(level)}</span>
        <span class="dg-history__txt">
          <span class="dg-history__title">${esc(r.title || 'Diagnostic')}</span>
          <span class="dg-history__meta">${esc(formatDate(r.created_at))} · ${_fmt(r.point_count)} points · ${(r.analysis?.insights || []).length} constats</span>
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
