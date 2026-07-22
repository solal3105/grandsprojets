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
import { renderZoneFigure } from './figure.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/* ── Génération depuis l'analyse courante ──────────────────────── */

/** Compacte l'état courant en données de rapport persistables. */
function _reportData() {
  const a = dg.analysis;
  const sel = dg.selection;

  // Points effectivement cités, pour que le lecteur puisse tout vérifier.
  const citedIdx = new Set();
  for (const c of a.couches) for (const su of c.sujets) for (const n of su.refs) citedIdx.add(n);
  const cites = [...citedIdx].sort((x, y) => x - y).map((n) => {
    const f = dg.aiSample?.[n - 1];
    if (!f) return null;
    const layer = dg.layers.find((l) => l.id === f.__layerId);
    return { n, couche: layer?.label || '', label: _titleOfPoint(f, layer), texte: _textOfPoint(f, layer) };
  }).filter(Boolean);

  return {
    title: `Diagnostic du ${new Date().toLocaleDateString('fr-FR')} — ${_fmt(sel.features.length)} points`,
    zone: { polygon: sel.polygon, bbox: sel.bbox, area_km2: Math.round(sel.areaKm2 * 100) / 100 },
    stats: { couches: a.couches.map(({ label, color, count }) => ({ label, color, count })) },
    // L'annexe voyage dans le jsonb analysis : sans elle, les renvois
    // « Points #3, #7 » d'un rapport rouvert depuis l'historique seraient
    // invérifiables, alors que la section Méthode affirme le contraire.
    analysis: { resume: a.resume, couches: a.couches, cites },
    cites,
    point_count: sel.features.length,
  };
}

/** Libellé d'un point (même règle que le panneau : champ-titre de la popup). */
function _titleOfPoint(f, layer) {
  const field = layer?.popup?.title_field;
  const v = field ? f.properties?.[field] : null;
  return (v !== null && v !== undefined && v !== '') ? String(v) : (layer?.label || 'Point');
}

/** Texte descriptif d'un point : le plus long de ses champs de popup. */
function _textOfPoint(f, layer) {
  const popup = layer?.popup || {};
  let best = '';
  for (const field of popup.fields || []) {
    if (field === popup.title_field) continue;
    const v = f.properties?.[field];
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (t.length > best.length) best = t;
  }
  return best.length > 12 ? best : '';
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
  try { mapImg = await renderZoneFigure(dg.selection); } catch { mapImg = null; }

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

/** Barre de répartition empilée + légende (le PDF n'a pas de survol). */
function _mixBar(couches, total) {
  if (!couches.length || !total) return '';
  const segs = couches.map((c) => `<span class="dg-rp-mix__seg" style="width:${(c.count / total * 100).toFixed(3)}%;background:${escAttr(safeColor(c.color))}"></span>`).join('');
  const legend = couches.map((c) => `<span class="dg-rp-mix__key">
      <i style="background:${escAttr(safeColor(c.color))}"></i>${esc(c.label)}
      <b>${_fmt(c.count)}</b><small>${Math.round(c.count / total * 100)} %</small>
    </span>`).join('');
  return `<div class="dg-rp-mix"><div class="dg-rp-mix__bar">${segs}</div>
    <div class="dg-rp-mix__legend">${legend}</div></div>`;
}

/**
 * Restitution de repli d'une source sans sujet. Le message doit dire la vérité :
 * « pas de texte descriptif » est faux dès lors que les points en portent et que
 * c'est seulement le regroupement qui n'a rien donné.
 */
function _fallbackHtml(c) {
  if (!c.hasText) {
    return '<div class="dg-rp-muted">Ces points ne portent pas de texte descriptif : seul leur décompte est exploitable.</div>';
  }
  const rows = (c.apercu || []).map((p) => `<div class="dg-rp-raw"><b>${esc(p.label)}</b> ${esc(p.texte)}</div>`).join('');
  const reste = c.count - (c.apercu || []).length;
  return '<div class="dg-rp-muted">Aucun sujet récurrent ne se dégage de ces points. Leur contenu, tel quel :</div>'
    + rows
    + (reste > 0 ? `<div class="dg-rp-muted">+ ${_fmt(reste)} autre${reste > 1 ? 's' : ''} point${reste > 1 ? 's' : ''}.</div>` : '');
}

function _showReportDoc(data, mapImg, date) {
  const a = data.analysis;
  const brand = dg.branding?.brand_name || store.city || '';
  const dateLabel = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const couches = a.couches || [];
  const total = data.point_count || couches.reduce((acc, c) => acc + c.count, 0);
  const nbSujets = couches.reduce((acc, c) => acc + (c.sujets?.length || 0), 0);
  const cites = data.cites || data.analysis?.cites || [];

  const sections = couches.map((c) => {
    const share = total ? Math.round((c.count / total) * 100) : 0;
    const sujets = (c.sujets || []).map((su) => {
      const n = su.refs?.length || 0;
      return `
        <div class="dg-rp-sujet">
          <div class="dg-rp-sujet__head">
            <span class="dg-rp-sujet__title">${esc(su.sujet || '')}</span>
            <span class="dg-rp-sujet__count">${_fmt(n)} point${n > 1 ? 's' : ''}</span>
          </div>
          ${(su.verbatims || []).map((v) => `<div class="dg-rp-verb">« ${esc(v)} »</div>`).join('')}
          ${su.refs?.length ? `<div class="dg-rp-sujet__refs">Points ${su.refs.map((r) => `#${r}`).join(', ')}</div>` : ''}
        </div>`;
    }).join('');
    return `
      <div class="dg-rp-source">
        <div class="dg-rp-source__head">
          <span class="dg-rp-source__dot" style="background:${escAttr(safeColor(c.color))}"></span>
          <span class="dg-rp-source__name">${esc(c.label)}</span>
          <span class="dg-rp-source__count">${_fmt(c.count)} point${c.count > 1 ? 's' : ''} · ${share} %</span>
        </div>
        ${c.synthese ? `<p class="dg-rp-source__synth">${esc(c.synthese)}</p>` : ''}
        ${sujets || _fallbackHtml(c)}
      </div>`;
  }).join('');

  const citeRows = cites.map((c) => `<tr>
      <td class="dg-rp-cite__n">#${c.n}</td>
      <td>${esc(c.couche)}</td>
      <td>${esc(c.label)}</td>
      <td>${esc(c.texte || '—')}</td>
    </tr>`).join('');

  const kpis = [
    ['Points lus', _fmt(total)],
    ['Sources', _fmt(couches.length)],
    ['Sujets relevés', _fmt(nbSujets)],
    ['Emprise', `${_fmtKm2(data.zone?.area_km2)} km²`],
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

      <header class="dg-rp-cover">
        <div class="dg-rp-cover__meta">
          <div class="dg-rp-brand">${esc(brand)}</div>
          <h1 class="dg-rp-title">Diagnostic terrain</h1>
          <div class="dg-rp-sub">Zone analysée le ${esc(dateLabel)}</div>
        </div>
        ${mapImg ? `<img class="dg-rp-cover__map" src="${mapImg}" alt="Plan de la zone analysée">` : ''}
        <div class="dg-rp-kpis">${kpis}</div>
      </header>

      <section class="dg-rp-sec">
        <h2 class="dg-rp-h2">Composition de la zone</h2>
        ${_mixBar(couches, total)}
      </section>

      ${a.resume ? `<section class="dg-rp-sec">
        <h2 class="dg-rp-h2">Vue d'ensemble</h2>
        <p class="dg-rp-lead">${esc(a.resume)}</p>
      </section>` : ''}

      <section class="dg-rp-sec">
        <h2 class="dg-rp-h2">Ce que disent les points, source par source</h2>
        ${sections || '<div class="dg-rp-muted">Aucune source exploitable dans cette zone.</div>'}
      </section>

      ${citeRows ? `<section class="dg-rp-sec dg-rp-sec--annexe">
        <h2 class="dg-rp-h2">Annexe — points cités</h2>
        <div class="dg-rp-muted" style="margin-bottom:8px">Chaque point référencé dans ce rapport, tel qu'il figure dans les données sources.</div>
        <table class="dg-rp-table dg-rp-table--cites">
          <thead><tr><th>N°</th><th>Source</th><th>Libellé</th><th>Texte du signalement</th></tr></thead>
          <tbody>${citeRows}</tbody>
        </table>
      </section>` : ''}

      <section class="dg-rp-sec">
        <h2 class="dg-rp-h2">Méthode et limites</h2>
        <div class="dg-rp-method">
          <p><b>Périmètre.</b> Les ${_fmt(total)} points contenus dans la zone tracée ont <b>tous</b> été lus, sans échantillonnage — c'est la raison du plafond de 300 points par sélection. Seules les couches activées au moment de la sélection sont prises en compte.</p>
          <p><b>Ce qui est calculé.</b> La composition de la zone, le nombre de points par source et le nombre de points rattaché à chaque sujet sont calculés à partir des données, jamais énoncés par le modèle.</p>
          <p><b>Ce qui est rédigé.</b> Les synthèses par source et les intitulés de sujets sont produits par un modèle de langage à partir du seul texte des points ; les citations sont reproduites mot pour mot et chaque point cité figure en annexe.</p>
          <p><b>Ce que ce document ne fait pas.</b> Il ne note pas, ne hiérarchise pas et ne recommande rien. Il restitue le contenu des signalements : l'interprétation et les suites à donner relèvent des services compétents.</p>
        </div>
      </section>

      <footer class="dg-rp-foot"><span>${esc(brand)} — Diagnostic terrain</span><span>Généré le ${esc(dateLabel)}</span></footer>
    </div>
  `;
  document.body.appendChild(doc);
  const close = () => doc.remove();
  doc.querySelector('[data-rp-close]')?.addEventListener('click', close);
  doc.querySelector('[data-rp-print]')?.addEventListener('click', () => window.print());
}

/* ── Historique ────────────────────────────────────────────────── */

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
    const nb = (r.analysis?.couches || []).reduce((acc, c) => acc + (c.sujets?.length || 0), 0);
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
