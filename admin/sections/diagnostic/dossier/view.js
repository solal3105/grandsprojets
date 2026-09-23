/** Une même version de données, deux compositions : lecture web et édition papier. */
import { esc } from '../../../components/ui.js';
import { coverage, dossierSummary, number, analysisRequired, overviewMissing, OBJECTIVE_EXAMPLE } from './model.js';
import { safeColor } from '../state.js';
import { sourceById } from '../sources.js';
import { makeBatches } from './contract.mjs';
import { findingObservations, findingLayerId, layerAnalyses, sourceRegister, distinctTexts, orderedFindings, findingNumber, findingAnchor, evidenceAnchor, findingFormat, findingSheets, findingFigureKey, sourceLink, proofGroups } from './presentation.js';

export const dateText = (value) => new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const icon = (name) => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
const paras = (text) => String(text || '').split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
const sourceNames = (d, ids) => d.sources.filter((s) => ids.includes(s.id)).map((s) => s.label);
const budgetStopped = (dossier) => dossier.analysis?.lastError?.code === 'budget';
const safeImage = (url) => /^data:image\/(?:jpeg|png);base64,[a-z0-9+/=]+$/i.test(url || '') ? url : '';
const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
// Les exemples ne répètent pas un même texte, sans retirer les observations
// distinctes du décompte ni de l'accès aux preuves.
const illustrativeObservations = (observations) => distinctTexts(observations).slice(0, 2);

export function mapFigure(dossier, finding, { compact = false, web = false } = {}) {
  const sourceId = finding?.kind === 'measure' ? finding.sourceIds[0] : null;
  const detail = finding && dossier.figures[findingFigureKey(dossier, finding)];
  const asset = sourceId ? dossier.figures[sourceId] : detail || dossier.figures.cover;
  if (sourceId && !safeImage(asset?.url)) return '<div class="dz-map-unavailable">La carte de cette source n’a pas pu être conservée. Ses indicateurs restent consultables.</div>';
  const url = safeImage(asset?.url);
  const bbox = asset?.bounds || dossier.zone.bbox;
  if (!bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return '<div class="dz-map-unavailable">La carte n’est pas disponible pour ce dossier.</div>';
  const width = 600, height = asset ? Math.round(width * asset.height / asset.width) : 650;
  const y0 = mercator(bbox[1]), y1 = mercator(bbox[3]);
  const project = (point) => [(point[0] - bbox[0]) / (bbox[2] - bbox[0] || 1) * width, height - (mercator(point[1]) - y0) / (y1 - y0 || 1) * height];
  const ids = new Set(finding?.observationIds || []);
  const points = dossier.observations.filter((o) => o.point && (!finding || ids.has(o.id)));
  if (!url && !points.length) return '<div class="dz-map-unavailable">Le fond de carte n’est pas disponible pour cette version. Le périmètre et les données retenues restent conservés dans le dossier.</div>';
  const bins = new Map(), groups = [], spacing = 48;
  for (const o of points) {
    const [x, y] = project(o.point);
    if (!Number.isFinite(x + y) || x < 0 || x > width || y < 0 || y > height) continue;
    const bx = Math.floor(x / spacing), by = Math.floor(y / spacing);
    let bin;
    for (let dx = -1; dx <= 1 && !bin; dx++) for (let dy = -1; dy <= 1 && !bin; dy++) {
      bin = (bins.get(`${bx + dx}:${by + dy}`) || []).find((b) => Math.hypot(b.x - x, b.y - y) < spacing);
    }
    if (!bin) {
      bin = { x, y, n: 0 }; groups.push(bin);
      const key = `${bx}:${by}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(bin);
    }
    bin.n++;
  }
  const marks = groups.map((p) => `<g><circle class="dz-map-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.n > 1 ? 12 + Math.min(8, Math.log(p.n) * 2) : 7}"/><title>${p.n} observation${p.n > 1 ? 's' : ''}</title>${p.n > 1 ? `<text class="dz-map-number" x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle">${p.n}</text>` : ''}</g>`).join('');
  const examples = finding ? illustrativeObservations(findingObservations(dossier, finding)) : [];
  const locatedLabels = examples.flatMap((o, i) => o.point ? [String.fromCharCode(65 + i)] : []);
  const labels = examples.map((o, i) => {
    if (!o.point) return '';
    const [x, y] = project(o.point);
    // Les deux textes illustratifs gardent le même repère sur la carte.
    const dx = i ? 34 : -34, dy = i ? 30 : -30;
    return `<g class="dz-map-callout"><title>Repère ${String.fromCharCode(65 + i)} : ${esc(o.id.toUpperCase())}</title><path d="M${x},${y} l${dx},${dy}"/><circle cx="${x + dx}" cy="${y + dy}" r="17"/><text x="${x + dx}" y="${y + dy + 5}" text-anchor="middle">${String.fromCharCode(65 + i)}</text></g>`;
  }).join('');
  const polygon = (dossier.zone.polygon?.coordinates?.[0] || []).map((p) => project(p).map((n) => n.toFixed(1)).join(',')).join(' ');
  const label = finding ? `Carte : ${finding.title}` : 'Périmètre du dossier et observations disponibles';
  const source = dossier.sources.find((s) => s.id === sourceId);
  const legend = source?.legend?.length ? `<div class="dz-map-key">${source.legendField ? `<span>${esc(source.legendField)} :</span>` : ''}${source.legend.map((key) => `<span><i${source.geometryTypes?.length && source.geometryTypes.every((type) => /LineString/.test(type)) ? ' class="is-line"' : ''} style="--dz-key: ${safeColor(key.color)}" aria-hidden="true"></i>${esc(key.label)}</span>`).join('')}</div>` : '';
  const caption = sourceId && dossier.figures[sourceId] ? `${sourceNames(dossier, [sourceId]).join('')}. ${source?.period.label || ''}.`
    : points.length ? `${number(points.length, 0)} observation${points.length > 1 ? 's' : ''} localisée${points.length > 1 ? 's' : ''}. ` : 'Le contour représente le périmètre retenu.';
  return `<figure class="dz-map${!url ? ' is-schematic' : ''}${compact ? ' dz-map--compact' : ''}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
    ${url ? `<image href="${url}" width="${width}" height="${height}"/>` : `<rect class="dz-map-base" width="${width}" height="${height}"/><polygon class="dz-map-outline" points="${polygon}"/>`}
    ${!sourceId ? marks + labels : ''}
    </svg>${legend}${!web && !sourceId && groups.length ? `<div class="dz-map-key"><span><i class="dz-key-observation" aria-hidden="true"></i>Les cercles regroupent les observations ; leur nombre est indiqué.</span>${locatedLabels.length ? `<span>${locatedLabels.length > 1 ? 'Les lettres A et B situent les citations.' : `La lettre ${locatedLabels[0]} situe la citation.`}</span>` : ''}</div>` : ''}<figcaption>${web ? '' : esc(caption)}${!web && finding && !sourceId ? (detail ? ' Vue rapprochée des observations.' : ' Vue générale du secteur.') : ''}${!url ? ' Fond de carte indisponible ; les positions sont représentées dans le périmètre.' : ` ${esc(asset.credit || 'Fond © OpenStreetMap contributors') + (asset.complete === false ? ' (chargement du fond incomplet)' : '')}.`}</figcaption></figure>`;
}

function metricList(dossier, finding, limit = 6) {
  const selected = dossier.facts.filter((f) => finding.factIds.includes(f.id));
  const source = dossier.sources.find((s) => s.id === finding.sourceIds[0]);
  // Un total entièrement constitué d'un seul type ne devient pas deux chiffres identiques.
  if (source?.catalogId === 'osm-cycleways' && selected.length === 2 && number(selected[0].value) === number(selected[1].value)) {
    selected[0] = { ...selected[0], note: `${selected[1].label}. ${selected[0].note}` }; selected.pop();
  }
  if (!selected.length) return '';
  const rows = (facts) => facts.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${number(f.value)} <span>${esc(f.unit)}</span></dd>${f.note ? `<p>${esc(f.note)}</p>` : ''}</div>`).join('');
  return `<dl class="dz-metrics">${rows(selected.slice(0, limit))}</dl>${selected.length > limit ? `<details class="dz-more"><summary>Voir les ${selected.length - limit} autres indicateurs</summary><dl class="dz-metrics">${rows(selected.slice(limit))}</dl></details>` : ''}`;
}

function findingWeb(dossier, finding) {
  const observations = findingObservations(dossier, finding);
  const quotes = illustrativeObservations(observations);
  const peers = dossier.findings.filter((f) => findingLayerId(dossier, f) === findingLayerId(dossier, finding));
  const index = peers.findIndex((f) => f.id === finding.id);
  const simple = findingFormat(dossier, finding) === 'compact' && !finding.edited;
  const reading = !simple && finding.reading?.trim() !== finding.title?.trim() ? finding.reading : '';
  return `<article class="dz-finding" data-finding="${esc(finding.id)}">
    ${finding.edited ? '<p class="dz-summary-credit">Reformulé par la collectivité</p>' : ''}
    ${finding.sourceIds.length > 1 ? '<p class="dz-caveat">Ce constat transversal d’une ancienne version est conservé avec toutes ses preuves.</p>' : ''}
    ${reading ? `<div class="dz-finding-reading">${paras(reading)}</div>` : ''}
    <div class="dz-finding-layout"><div>${mapFigure(dossier, finding, { compact: true, web: true })}</div><div class="dz-testimonies">
      ${quotes.map((o, i) => `<blockquote><p>«&nbsp;${esc(o.text.length > 220 ? `${o.text.slice(0, 220).replace(/\s+\S*$/, '')}…` : o.text)}&nbsp;»</p><cite>${o.point ? `${String.fromCharCode(65 + i)} · ` : ''}${esc(dossier.sources.find((source) => source.id === o.sourceId)?.label)} · ${esc(o.id.toUpperCase())}</cite></blockquote>`).join('')}
      <button type="button" class="dz-text-button" data-evidence="${esc(finding.id)}">Consulter ${observations.length === 1 ? "l’observation" : `les ${number(observations.length, 0)} observations`} ${icon('arrow-right')}</button>
    </div></div>
    ${finding.caveat || finding.question ? `<div class="dz-finding-context">${finding.caveat ? `<p class="dz-caveat">${esc(finding.caveat)}</p>` : ''}${finding.question ? `<p><b>À vérifier sur le terrain</b> ${esc(finding.question)}</p>` : ''}</div>` : ''}
    <details class="dz-finding-options"><summary>Modifier ce constat ${icon('sliders')}</summary><div>
      <label class="dz-check"><input type="checkbox" data-include="${esc(finding.id)}" ${finding.included !== false ? 'checked' : ''}>Inclure ce constat dans le PDF</label>
      <button type="button" class="dz-text-button" data-edit-finding="${esc(finding.id)}">${icon('pen')} Reformuler le constat</button>
      ${peers.length > 1 ? `<div class="dz-finding-order"><span>Ordre de lecture</span><button type="button" class="dz-text-button" data-move-finding="${esc(finding.id)}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>Monter</button><button type="button" class="dz-text-button" data-move-finding="${esc(finding.id)}" data-direction="1" ${index === peers.length - 1 ? 'disabled' : ''}>Descendre</button></div>` : ''}
    </div></details>
  </article>`;
}

export function findingArticle(dossier, finding, { print = false, number: printedNumber } = {}) {
  if (!print) return findingWeb(dossier, finding);
  const observations = findingObservations(dossier, finding);
  const sources = dossier.sources.filter((s) => finding.sourceIds.includes(s.id));
  const quotes = illustrativeObservations(observations);
  const ordered = orderedFindings(dossier);
  const index = printedNumber || findingNumber(ordered.indexOf(finding));
  const compact = print && findingFormat(dossier, finding) === 'compact';
  const simple = findingFormat(dossier, finding) === 'compact' && !finding.edited;
  const inset = compact || (print && finding.kind === 'measure');
  const excerptLimit = compact ? 140 : 260;
  const peers = dossier.findings.filter((f) => f.kind === finding.kind), position = peers.indexOf(finding);
  return `<article class="dz-finding${print ? ` dz-print-finding${compact ? ' is-compact' : ''}` : ''}"${print ? ` id="${esc(findingAnchor(finding.id))}"` : ''} data-finding="${esc(finding.id)}">
    <header>${print ? `<span class="dz-finding-number">${esc(index)}</span>` : ''}<div><h3>${esc(finding.title)}</h3><div class="dz-finding-meta">${finding.edited ? 'Reformulé par la collectivité' : finding.kind === 'testimony' ? 'Lecture des observations' : 'Données de référence'}${sources.length ? ` · ${sources.map((s) => esc(s.period.label)).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}` : ''}</div></div></header>
    ${finding.kind === 'testimony' && !simple && !compact ? `<div class="dz-finding-reading">${paras(finding.reading)}</div>` : ''}
    <div class="dz-finding-layout"><div>${mapFigure(dossier, finding, { compact: true })}</div><div>${compact && finding.edited ? `<div class="dz-finding-reading">${paras(finding.reading)}</div>` : ''}
      ${metricList(dossier, finding, print ? Infinity : 6)}
      ${sources.some((s) => s.records?.length) ? `<ul class="dz-records">${sources.flatMap((s) => s.records || []).map((r) => `<li><b>${esc(r.title)}</b><p>${esc(r.detail)}</p></li>`).join('')}</ul>` : ''}
      ${observations.length ? `<p class="dz-evidence-count">${number(observations.length, 0)} observation${observations.length > 1 ? 's' : ''} référencée${observations.length > 1 ? 's' : ''}.</p>` : ''}
      ${quotes.map((o, i) => `<blockquote><p>«&nbsp;${esc(o.text.length > excerptLimit ? `${o.text.slice(0, excerptLimit).replace(/\s+\S*$/, '')}…` : o.text)}&nbsp;»</p><cite>${o.point ? `Repère ${String.fromCharCode(65 + i)} · ` : ''}${esc(dossier.sources.find((s) => s.id === o.sourceId)?.label)} · ${print ? `<a href="#${esc(evidenceAnchor(o.id))}">${esc(o.id.toUpperCase())}</a>` : esc(o.id.toUpperCase())}</cite></blockquote>`).join('')}
      ${inset && finding.caveat ? `<div class="dz-nuance"><h4>Limite de lecture</h4>${paras(finding.caveat)}</div>` : ''}${inset && finding.question ? `<div class="dz-question"><h4>À vérifier sur le terrain</h4>${paras(finding.question)}</div>` : ''}
      ${!print && observations.length ? `<button type="button" class="dz-text-button" data-evidence="${esc(finding.id)}">Consulter les ${number(observations.length, 0)} observations ${icon('arrow-right')}</button>` : ''}
    </div></div>
    ${!print && simple ? `<details class="dz-reading-details"><summary>Lire l’interprétation proposée</summary><div class="dz-finding-reading">${paras(finding.reading)}</div></details>` : ''}
    ${!inset && finding.caveat ? `<div class="dz-nuance"><h4>Limite de lecture</h4>${paras(finding.caveat)}</div>` : ''}
    ${!inset && finding.question ? `<div class="dz-question"><h4>À vérifier sur le terrain</h4>${paras(finding.question)}</div>` : ''}
    <footer class="dz-finding-sources">${sources.map((s) => `<span>${esc(s.label)} · ${esc(s.period.label)}</span>`).join('')}${observations.length && print ? `<span>Preuves : ${observations.slice(0, 12).map((o) => `<a href="#${esc(evidenceAnchor(o.id))}">${esc(o.id.toUpperCase())}</a>`).join(', ')}${observations.length > 12 ? ` et ${observations.length - 12} autres en annexe` : ''}.</span>` : ''}</footer>
    ${!print ? `<details class="dz-finding-options"><summary>Options du constat ${icon('sliders')}</summary><div><label class="dz-check"><input type="checkbox" data-include="${esc(finding.id)}" ${finding.included !== false ? 'checked' : ''}>Inclure ce constat dans le PDF</label>` : ''}
    ${!print && finding.kind === 'testimony' ? `<button type="button" class="dz-text-button dz-edit-button" data-edit-finding="${esc(finding.id)}">${icon('pen')} Modifier le constat</button>` : ''}
    ${!print && peers.length > 1 ? `<div class="dz-finding-order"><span>Ordre de lecture</span><button type="button" class="dz-text-button" data-move-finding="${esc(finding.id)}" data-direction="-1" ${position === 0 ? 'disabled' : ''}>${icon('arrow-up')} Monter ce constat</button><button type="button" class="dz-text-button" data-move-finding="${esc(finding.id)}" data-direction="1" ${position === peers.length - 1 ? 'disabled' : ''}>${icon('arrow-down')} Descendre ce constat</button></div>` : ''}
    ${!print ? '</div></details>' : ''}
  </article>`;
}

/* Plan de travail : le corpus est découpé en lots, un lot ne mélange jamais deux
   sources, et chaque lot est lu puis vérifié. L'état vient des résultats
   conservés, jamais d'un compteur qui avancerait tout seul. */
export function analysisPlan(dossier, progress) {
  const state = dossier.analysis || {};
  const leaves = (id, size) => (state.splits?.[id] && size > 1
    ? [...leaves(`${id}.a`, Math.ceil(size / 2)), ...leaves(`${id}.b`, Math.floor(size / 2))]
    : [id]);
  const phase = progress?.phase || 'read';
  const live = state.status === 'running' || state.status === 'pending';
  const active = phase === 'overview' ? -1 : Math.max(0, (Number(progress?.current) || 1) - 1);
  const lots = makeBatches(dossier.observations).map((batch, index) => {
    const parts = leaves(batch.id, batch.observations.length);
    const read = parts.every((id) => state.batches?.[id]);
    const checked = read && parts.every((id) => state.reviews?.[id]);
    return {
      sourceId: batch.observations[0]?.sourceId || '',
      texts: new Set(batch.observations.map((o) => o.originalId)).size,
      read, checked, divided: parts.length > 1,
      current: live && index === active && !checked,
    };
  });
  const groups = [];
  for (const lot of lots) {
    const last = groups[groups.length - 1];
    if (last && last.sourceId === lot.sourceId) { last.lots.push(lot); last.texts += lot.texts; }
    else groups.push({ sourceId: lot.sourceId, label: dossier.sources.find((s) => s.id === lot.sourceId)?.label || 'Témoignages', lots: [lot], texts: lot.texts });
  }
  // Une source lue en plusieurs lots est ensuite rapprochée : ses constats voisins sont réunis.
  for (const group of groups) {
    group.merge = group.lots.length > 1 ? { done: Boolean(state.synthesis?.[group.sourceId]?.signature || state.mergeFailures?.[group.sourceId]), current: live && phase === 'synthesize' && group.lots.every((l) => l.checked) && !state.synthesis?.[group.sourceId]?.signature } : null;
  }
  const synthesis = { done: Boolean(dossier.overview), current: live && phase === 'overview' && !dossier.overview };
  return { groups, lots, synthesis, left: lots.filter((l) => !l.checked).length, merges: groups.filter((g) => g.merge && !g.merge.done).length };
}

/* La barre suit les unités réellement terminées : deux par lot, deux pour la
   synthèse, qui dure autant que plusieurs lots. Elle ne prétend pas à la
   seconde près et ne recule jamais. */
export function analysisProgress(dossier, progress) {
  const plan = analysisPlan(dossier, progress);
  const merges = plan.groups.filter((g) => g.merge);
  const total = plan.lots.length * 2 + merges.length + 2;
  const done = plan.lots.reduce((n, l) => n + (l.checked ? 2 : l.read ? 1 : 0), 0)
    + merges.filter((g) => g.merge.done).length
    + (plan.synthesis.done ? 2 : plan.synthesis.current ? 1 : 0);
  return Math.max(2, Math.min(100, Math.round((100 * done) / Math.max(1, total))));
}

const lotStyle = (lot) => `--dz-read:${lot.read ? 1 : 0};--dz-check:${lot.checked ? 1 : 0};flex-grow:${Math.max(1, lot.texts)}`;
const lotTitle = (lot) => {
  const s = lot.texts > 1 ? 's' : '';
  return `${lot.texts} texte${s} ${lot.checked ? `lu${s} et relu${s}` : lot.read ? `lu${s}, relecture à venir` : 'à lire'}`;
};

function analysisPlanHtml(plan) {
  const cell = (lot) => `<span class="dz-run__lot${lot.current ? ' is-current' : ''}" title="${esc(lotTitle(lot))}"`
    + ` style="${lotStyle(lot)}"><span></span></span>`;
  const merge = (g) => g.merge ? `<span class="dz-run__lot dz-run__merge${g.merge.current ? ' is-current' : ''}" title="${g.merge.done ? 'Constats rapprochés' : 'Rapprochement des constats à venir'}"`
    + ` style="--dz-read:${g.merge.done || g.merge.current ? 1 : 0};--dz-check:${g.merge.done ? 1 : 0}"><span></span></span>` : '';
  const group = (g) => `<div class="dz-run__group${g.lots.some((l) => l.current) || g.merge?.current ? ' is-current' : ''}" style="flex-grow:${Math.max(1, g.texts)}">`
    + `<span class="dz-run__label">${esc(g.label)}</span>`
    + `<div class="dz-run__lots">${g.lots.map(cell).join('')}${merge(g)}</div></div>`;
  const final = `<div class="dz-run__group dz-run__final${plan.synthesis.current ? ' is-current' : ''}">`
    + '<span class="dz-run__label">Synthèse</span>'
    + `<div class="dz-run__lots"><span class="dz-run__lot${plan.synthesis.current ? ' is-current' : ''}"`
    + ` style="--dz-read:${plan.synthesis.done || plan.synthesis.current ? 1 : 0};--dz-check:${plan.synthesis.done ? 1 : 0}"><span></span></span></div></div>`;
  return `<div class="dz-run">${plan.groups.map(group).join('')}${final}</div>`;
}

export function analysisStatus(dossier, progress) {
  const c = coverage(dossier), status = dossier.analysis.status;
  if (!c.readable) return `<div class="dz-analysis-status is-quiet"><span>${icon('circle-info')}</span><p>Aucun témoignage textuel à analyser dans cette zone. Le dossier présente uniquement les données disponibles.</p></div>`;
  if (!analysisRequired(dossier)) return `<div class="dz-analysis-status is-quiet is-complete" role="status"><span>${icon('check')}</span><p>${number(c.read, 0)} textes examinés. ${number(c.cited, 0)} sont rattachés aux constats.</p></div>`;
  // Le plafond d'un dossier ne se dépasse pas : aucune reprise n'est proposée.
  if (budgetStopped(dossier)) return `<div class="dz-analysis-status" role="status"><div><b>L’analyse s’est arrêtée à la limite prévue pour un dossier.</b><p>${c.read < c.readable
    ? `Nous avons examiné ${number(c.read, 0)} texte${c.read > 1 ? 's' : ''} sur ${number(c.readable, 0)}. Ce dossier n’aura ni synthèse ni PDF : revenez à la carte et sélectionnez une zone plus petite, ou masquez les sources inutiles dans l’onglet Couches.`
    : `${c.read > 1 ? `Les ${number(c.read, 0)} textes sont lus et leurs constats sont consultables` : 'Le texte est lu et ses constats sont consultables'}, mais la synthèse n’a pas pu être rédigée. Écrivez la vôtre dans « Personnaliser » pour exporter le dossier.`}</p></div><a class="adm-btn adm-btn--secondary" href="/admin/diagnostic/" data-back>Revenir à la carte</a></div>`;
  if (status === 'running' || status === 'pending') {
    const plan = analysisPlan(dossier, progress), percent = analysisProgress(dossier, progress);
    const phase = progress?.phase || 'read';
    const title = progress?.recovery === 'network' ? 'La connexion a été interrompue ; nous réessayons.'
      : progress?.recovery === 'quality' ? 'Nous corrigeons une formulation.'
      : progress?.recovery === 'split' ? 'Nous reprenons ces textes en deux fois.'
      : phase === 'review' ? 'Nous relisons les constats.'
      : phase === 'synthesize' ? 'Nous rapprochons les constats de chaque source.'
      : phase === 'overview' ? 'Nous rédigeons la synthèse.'
      : 'Nous lisons les témoignages.';
    const detail = progress?.recovery === 'network'
      ? `Nouvel essai ${number(progress.attempt, 0)} sur ${number(progress.attempts, 0)}.`
      : `Nous avons examiné ${number(c.read, 0)} textes sur ${number(c.readable, 0)}.`;
    const next = plan.merges ? 'puis le rapprochement des constats et la synthèse' : 'puis la synthèse';
    const left = plan.left > 1 ? `Il reste ${number(plan.left, 0)} groupes de textes à lire ou à relire, ${next}.`
      : plan.left === 1 ? `Il reste un groupe de textes à lire ou à relire, ${next}.`
      : plan.synthesis.done ? 'Nous terminons.' : plan.merges ? 'Il reste le rapprochement des constats et la synthèse.' : 'Il ne reste que la synthèse.';
    return `<div class="dz-analysis-status is-running" role="status">
      <div class="dz-run-head"><div><b>${title}</b><p>${detail}</p></div>${status === 'running' ? '<button type="button" class="dz-text-button" data-pause>Mettre en pause</button>' : ''}</div>
      <div role="progressbar" aria-label="Avancement de l’analyse" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">${analysisPlanHtml(plan)}</div>
      <div class="dz-run-foot"><p>Chaque groupe de textes est lu, puis relu au regard des textes d’origine.</p><p>${left}</p></div>
    </div>`;
  }
  // Un refus de nos contrôles de fidélité s'explique à l'agent sans lui transmettre une consigne écrite pour le modèle.
  const reason = !dossier.analysis.error ? ''
    : dossier.analysis.lastError?.code === 'quality' ? 'Nous n’avons pas obtenu une rédaction assez fidèle aux textes pour terminer cette étape.'
      : dossier.analysis.error;
  const missing = overviewMissing(dossier);
  return `<div class="dz-analysis-status" role="status"><div><b>${status === 'paused' ? 'L’analyse est en pause.' : missing ? 'La synthèse n’a pas pu être rédigée.' : 'L’analyse s’est arrêtée avant la fin.'}</b><p>${missing ? `${c.read > 1 ? `Les ${number(c.read, 0)} textes sont lus et leurs constats sont consultables` : 'Le texte est lu et ses constats sont consultables'}. Reprenez l’analyse pour rédiger la synthèse, ou écrivez la vôtre dans « Personnaliser » pour exporter le dossier.` : `Nous avons examiné ${number(c.read, 0)} texte${c.read > 1 ? 's' : ''} sur ${number(c.readable, 0)}. Reprenez l’analyse : les étapes terminées ne seront pas refaites.`}</p>${reason ? `<p>${esc(reason)}</p>` : ''}</div><button type="button" class="adm-btn adm-btn--primary" data-analyze>Reprendre l’analyse</button></div>`;
}

export function sourcesTable(dossier) {
  return `<div class="dz-table-scroll"><table class="dz-sources-table"><colgroup><col><col><col></colgroup><thead><tr><th>Source et provenance</th><th>Période</th><th>Données retenues</th></tr></thead><tbody>${dossier.sources.map((s) => `<tr><td data-label="Source"><b>${esc(s.label)}</b>${s.provider !== s.label ? `<span>${esc(s.provider)}</span>` : ''}${s.credit ? `<small>${esc(s.credit)}</small>` : ''}${sourceLink(s.url) ? `<a href="${esc(sourceLink(s.url))}" target="_blank" rel="noopener noreferrer">Consulter la source</a>` : ''}</td><td data-label="Période">${esc(s.period.label)}</td><td data-label="Dans la zone">${s.status === 'ready' ? `${number(s.count, 0)} dans la zone<span>sur ${number(s.total, 0)} élément${s.total > 1 ? 's chargés' : ' chargé'}</span>` : 'Non chargée'}</td></tr>`).join('')}</tbody></table></div>`;
}

function limitations(dossier) {
  const c = coverage(dossier);
  const notes = [
    'Le périmètre et les sources sont ceux retenus au moment de la création du dossier. Une absence d’observation ne démontre pas une absence de difficulté.',
    'Les témoignages décrivent des expériences rapportées. Les rapprochements proposés ne démontrent ni une cause, ni une fréquence, ni une évolution.',
  ];
  if (c.unknownPeriods.length) notes.push(`${c.unknownPeriods.length} source${c.unknownPeriods.length > 1 ? 's ont une période incomplète ou inconnue' : ' a une période incomplète ou inconnue'} : ${c.unknownPeriods.map((s) => s.label).join(', ')}. Les comparaisons dans le temps ne sont pas établies.`);
  if (c.failed.length) notes.push(`Sources non chargées lors de la sélection : ${c.failed.map((s) => s.label).join(', ')}. Le dossier ne couvre pas leur contenu.`);
  if (c.read < c.readable) notes.push(`La lecture des témoignages est incomplète : ${number(c.read, 0)} textes traités sur ${number(c.readable, 0)}.`);
  if (Object.values(dossier.analysis.synthesis || {}).some((entry) => entry?.chunks > 1)) notes.push('Une source très volumineuse a été rapprochée par ensembles de constats successifs. Des constats voisins peuvent subsister d’un ensemble à l’autre.');
  const unmerged = Object.keys(dossier.analysis.mergeFailures || {}).map((id) => dossier.sources.find((s) => s.id === id)?.label).filter(Boolean);
  if (unmerged.length) notes.push(`Les constats de ${unmerged.join(', ')} n’ont pas pu être rapprochés : des constats voisins peuvent s’y répéter.`);
  if (dossier.facts.length > 60) notes.push('Les rapprochements automatiques utilisent une partie des indicateurs de contexte. Tous les indicateurs restent disponibles dans les données de référence du dossier.');
  return `<ul class="dz-limits">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
}

export function editorHtml(dossier, { appendix = false } = {}) {
  return `<form class="dz-editor" data-editor>
    <label>Nom du secteur<input class="adm-input" name="title" maxlength="180" value="${esc(dossier.title)}" required></label>
    <label>Objet de l’étude <span>Facultatif</span><input class="adm-input" name="objective" maxlength="500" value="${esc(dossier.objective)}" placeholder="${esc(OBJECTIVE_EXAMPLE)}"></label>${coverage(dossier).readable ? '<p data-objective-help>Après un changement d’objet, actualisez la synthèse. Les textes déjà lus ne sont pas relus.</p><button type="button" class="adm-btn adm-btn--secondary" data-refresh-overview hidden>Actualiser la synthèse selon cet objet</button>' : ''}
    <label>Synthèse de la collectivité <span>Facultatif. Remplace la synthèse proposée${overviewMissing(dossier) ? ' et permet d’exporter le dossier si celle-ci n’a pas pu être rédigée' : ''}.</span><textarea class="adm-input" name="editorialSummary" rows="5" maxlength="8000" placeholder="Ce que vous retenez du secteur.">${esc(dossier.editorialSummary)}</textarea></label>
    <label>Vos observations et les suites à examiner <span>Facultatif</span><textarea class="adm-input" name="notes" rows="5" maxlength="12000" placeholder="Votre connaissance du terrain et les points à vérifier.">${esc(dossier.notes)}</textarea></label>
    <details class="dz-editor-export"><summary>Contenu du PDF</summary><label class="dz-check"><input type="checkbox" data-appendix ${appendix ? 'checked' : ''}>Joindre toutes les observations (${dossier.observations.length})</label><p>Les observations citées sont toujours jointes en entier. L’export utilise l’impression du navigateur : choisissez « Enregistrer au format PDF » sans en-têtes ni pieds de page.</p></details>
    <p>Ces ajouts sont conservés sur cet appareil. Enregistrez une version pour les retrouver ailleurs.</p>
    <button type="button" class="adm-btn adm-btn--primary" data-editor-done>Fermer</button>
  </form>`;
}

/** Une phrase de bilan quand l'analyse est terminée : ce qui a été lu, ce qui en ressort. */
function analysisRecap(dossier, pending) {
  const c = coverage(dossier);
  if (pending || dossier.analysis.status !== 'complete' || !c.readable) return '';
  const findings = dossier.findings.filter((f) => f.kind === 'testimony' && f.included !== false).length;
  const sources = dossier.sources.filter((s) => s.count && s.kind === 'temoignages').length;
  return `<p class="dz-recap">L’analyse est terminée : ${number(c.read, 0)} texte${c.read > 1 ? 's' : ''} examiné${c.read > 1 ? 's' : ''}, ${findings ? `${number(findings, 0)} constat${findings > 1 ? 's' : ''} retenu${findings > 1 ? 's' : ''}` : 'aucun constat retenu'}, ${number(sources, 0)} source${sources > 1 ? 's' : ''} de témoignages.</p>`;
}

function overviewHtml(dossier, pending) {
  const layers = layerAnalyses(dossier), available = layers.filter((l) => l.source.status === 'ready' && l.source.count).length;
  const failed = layers.filter((l) => l.status === 'error').length;
  return `<div class="dz-surface dz-overview">
    <section class="dz-overview-text"><span class="dz-eyebrow">${!pending ? 'Lecture du secteur' : dossier.analysis.status === 'running' ? 'Analyse en cours' : budgetStopped(dossier) ? 'Analyse arrêtée' : 'Analyse à reprendre'}</span><h2>${!pending ? 'Ce qu’il faut retenir' : dossier.analysis.status === 'running' ? 'La synthèse se prépare.' : budgetStopped(dossier) ? (overviewMissing(dossier) ? 'La synthèse n’a pas pu être rédigée.' : 'Ce dossier n’aura pas de synthèse.') : 'La synthèse sera rédigée à la reprise de l’analyse.'}</h2>${analysisRecap(dossier, pending)}<p class="dz-summary-credit" data-summary-credit ${!pending && dossier.editorialSummary?.trim() ? '' : 'hidden'}>Synthèse de la collectivité</p><p class="dz-lead">${esc(dossierSummary(dossier))}</p><p class="dz-overview-scope">${available > 1 ? `${available} jeux de données documentent ce secteur.` : available === 1 ? 'Un seul jeu de données documente ce secteur.' : 'Aucune donnée exploitable dans ce périmètre.'}${failed ? ` ${failed} jeu${failed > 1 ? 'x' : ''} de données n’${failed > 1 ? 'ont' : 'a'} pas pu être chargé${failed > 1 ? 's' : ''}.` : ''}</p><button type="button" class="dz-text-button dz-overview-action" data-open-view="findings">Explorer les analyses ${icon("arrow-right")}</button></section>
    <section class="dz-overview-map" aria-label="Périmètre étudié">${mapFigure(dossier, null, { web: true })}<p class="dz-area">Périmètre étudié : ${number(dossier.zone.areaKm2, 3)} km²</p></section>
    <section class="dz-field-note" ${dossier.notes?.trim() ? '' : 'hidden'} data-field-note><h2>Les observations de la collectivité</h2><div data-notes-preview>${paras(dossier.notes)}</div></section>
  </div>`;
}

const layerIcon = (source) => `<i class="${esc(sourceById(source.catalogId)?.icon || (source.kind === 'temoignages' ? 'fa-solid fa-comment-dots' : 'fa-solid fa-chart-simple'))}" aria-hidden="true"></i>`;
const layerState = (layer, stopped = false) => layer.status === 'error' ? 'Échec du chargement' : layer.status === 'empty' ? 'Aucune donnée dans cette zone' : layer.status === 'pending' ? (stopped ? 'Analyse arrêtée' : 'Analyse à terminer') : layer.findings.length ? `${layer.findings.length} constat${layer.findings.length > 1 ? 's' : ''}` : 'Données sans constat';

function measureWeb(dossier, finding) {
  const source = dossier.sources.find((s) => s.id === finding.sourceIds[0]);
  return `<article class="dz-finding dz-reference" data-finding="${esc(finding.id)}" data-measure="${esc(finding.id)}">
    <div class="dz-finding-layout"><div>${metricList(dossier, finding)}${(source.records || []).map((r) => `<p class="dz-source-record"><b>${esc(r.title)}</b><br>${esc(r.detail)}</p>`).join('')}</div><div>${mapFigure(dossier, finding, { web: true })}</div></div>
    ${finding.caveat ? `<p class="dz-caveat dz-finding-context">${esc(finding.caveat)}</p>` : ''}
    <details class="dz-finding-options"><summary>Options du PDF ${icon('sliders')}</summary><div><label class="dz-check"><input type="checkbox" data-include="${esc(finding.id)}" ${finding.included !== false ? 'checked' : ''}>Inclure ce constat dans le PDF</label></div></details>
  </article>`;
}

export function layerHtml(dossier, layer, activeId) {
  if (!layer) return '<div class="dz-empty"><h2>Aucune donnée dans cette zone.</h2><p>Les couches chargées ne contiennent aucun élément dans le périmètre retenu. Revenez à la carte pour ajouter des données ou choisir une autre zone.</p><a class="dz-text-button" href="/admin/diagnostic/" data-back>Revenir à la carte</a></div>';
  const { source, findings, status } = layer;
  const active = activeId === false ? null : findings.find((f) => f.id === activeId) || findings[0];
  const meta = [source.period.label, source.status === 'ready' ? `${number(source.count, 0)} ${source.kind === 'temoignages' ? 'observation' : 'élément'}${source.count > 1 ? 's' : ''} dans la zone` : 'Données indisponibles'];
  return `<header class="dz-layer-heading"><div><span class="dz-eyebrow">${source.kind === 'temoignages' ? 'Lecture des témoignages' : 'Lecture des mesures'}</span><h2>${esc(source.label)}</h2><p>${meta.map(esc).join(' · ')}</p></div><button type="button" class="dz-text-button" data-source-link="${esc(source.id)}">Voir la source ${icon('arrow-up-right-from-square')}</button></header>
    ${status === 'error' ? `<div class="dz-layer-empty">${icon('triangle-exclamation')}<h3>Ce jeu de données n’a pas pu être chargé.</h3><p>Son contenu dans la zone est inconnu. Revenez à la carte pour rétablir son chargement, puis créez un nouveau dossier.</p><a class="dz-text-button" href="/admin/diagnostic/" data-back>Revenir à la carte ${icon('arrow-right')}</a></div>`
      : status === 'empty' ? '<div class="dz-layer-empty"><h3>Aucune donnée dans cette zone.</h3><p>Ce jeu de données a été chargé, mais aucun de ses éléments ne se trouve dans le périmètre retenu.</p></div>'
      : `${status === 'pending' ? `<p class="dz-layer-notice" role="status">Nous avons examiné ${layer.read} texte${layer.read > 1 ? 's' : ''} sur ${layer.readable}. ${budgetStopped(dossier) ? 'L’analyse s’est arrêtée à la limite prévue pour un dossier ; les textes d’origine restent consultables.' : 'Les constats seront disponibles à la fin de l’analyse.'}</p>` : ''}
        ${status !== 'pending' && findings.length ? `<div class="dz-constats">${findings.map((f, i) => `<section class="dz-constat${f.id === active?.id ? ' is-open' : ''}"><h3><button type="button" id="tab-${esc(f.id)}" data-finding-tab="${esc(f.id)}" aria-expanded="${f.id === active?.id}" aria-controls="finding-${esc(f.id)}"><span class="dz-index">${findingNumber(i)}</span><span>${esc(f.title)}<small ${f.included === false ? '' : 'hidden'}>Hors PDF</small></span>${icon('chevron-down')}</button></h3><div id="finding-${esc(f.id)}" ${f.id === active?.id ? '' : 'hidden'}>${f.id === active?.id ? `<div id="dz-active-finding">${f.kind === 'testimony' ? findingArticle(dossier, f) : measureWeb(dossier, f)}</div>` : ''}</div></section>`).join('')}</div>` : status !== 'pending' ? `<div class="dz-layer-empty">${layerIcon(source)}<h3>${source.kind === 'temoignages' ? 'Aucun constat ne peut être établi à partir de ces textes.' : 'Ce jeu de données ne comporte pas d’indicateur calculable.'}</h3><p>${source.kind === 'temoignages' ? (layer.readable ? 'Les textes ont été examinés, mais ne décrivent pas de situation exploitable. Les observations d’origine restent consultables.' : 'Les éléments de ce jeu de données n’ont pas de texte descriptif à analyser.') : `Les éléments sont présents dans la zone. Pour obtenir des chiffres, revenez à la carte, ouvrez les réglages de la couche « ${esc(source.label)} », choisissez ses « Chiffres de zone », puis créez un nouveau dossier.`}</p></div>` : ''}
        ${layer.observations.length ? `<footer class="dz-layer-footer"><span>${status === 'pending' ? 'Les textes d’origine restent accessibles.' : 'Chaque constat conserve ses preuves.'}</span><button type="button" class="dz-text-button" data-layer-evidence="${esc(source.id)}">Toutes les observations de ce jeu de données ${icon('arrow-right')}</button></footer>` : ''}`}`;
}

function findingsHtml(dossier, activeLayerId, activeId) {
  const layers = layerAnalyses(dossier);
  const active = layers.find((l) => l.source.id === activeLayerId && l.status !== 'empty') || layers.find((l) => l.status !== 'empty');
  return `<div class="dz-reader"><aside class="dz-layer-nav" aria-label="Données du dossier"><p class="dz-nav-label">Jeux de données <span>${layers.length}</span></p><label class="dz-layer-picker">Jeu de données à afficher<select class="adm-input" data-layer-picker>${!active ? '<option>Aucune donnée disponible</option>' : ''}${layers.map((l) => `<option value="${esc(l.source.id)}" ${l.status === 'empty' ? 'disabled' : ''} ${l === active ? 'selected' : ''}>${esc(l.source.label)} · ${layerState(l, budgetStopped(dossier))}</option>`).join('')}</select></label><div class="dz-layer-list">${layers.map((l) => `<button type="button" data-layer-tab="${esc(l.source.id)}" aria-controls="dz-active-layer" ${l === active ? 'aria-current="true"' : ''} ${l.status === 'empty' ? 'disabled' : ''} class="${l.status === 'error' ? 'is-error' : ''}"><span class="dz-layer-icon">${layerIcon(l.source)}</span><span class="dz-layer-label">${esc(l.source.label)}<small>${layerState(l, budgetStopped(dossier))}</small></span>${l.status === 'error' ? icon('triangle-exclamation') : '<i class="fa-solid fa-chevron-right dz-layer-arrow" aria-hidden="true"></i>'}</button>`).join('')}</div></aside><div class="dz-surface dz-layer-sheet" id="dz-active-layer">${layerHtml(dossier, active, activeId)}</div></div>`;
}

function sourceDetails(dossier, sources) {
  const source = sources[0], url = sourceLink(source.url);
  const label = sources.length > 1 ? sourceById(source.catalogId)?.name || source.provider : source.label;
  return `<details class="dz-source" data-source="${esc(source.id)}"><summary><span class="dz-source-name">${layerIcon(source)}<span>${esc(label)}${source.provider !== label ? `<small>${esc(source.provider)}</small>` : ''}</span></span><span class="dz-source-period">${esc(source.period.label)}</span><span class="dz-source-count">${sources.every((s) => s.status !== 'ready') ? 'Chargement échoué' : `${sources.length} jeu${sources.length > 1 ? 'x' : ''} de données`}</span>${icon('chevron-down')}</summary><div class="dz-source-body">
    <div class="dz-source-provenance"><p>${esc(source.credit || source.provider)}${source.dataset && source.dataset !== label ? ` · ${esc(source.dataset)}` : ''}</p>${url ? `<a class="dz-text-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ouvrir le site de la source ${icon('arrow-up-right-from-square')}</a>` : ''}</div>
    ${source.description ? `<p>${esc(source.description)}</p>` : ''}
    <p class="dz-source-capture">Données conservées le ${esc(dateText(source.capturedAt || dossier.capturedAt))}. ${source.period.known ? '' : 'La période des données n’est pas renseignée.'}</p>
    <ul class="dz-source-layers">${sources.map((s) => `<li data-layer-source="${esc(s.id)}"><span><b>${esc(s.label)}</b><small>${s.status !== 'ready' ? 'Le chargement a échoué. Le contenu de la zone est inconnu.' : !s.count ? 'Aucune donnée dans cette zone.' : `${number(s.count, 0)} éléments dans la zone sur ${number(s.total, 0)} chargés.`}</small></span>${s.status === 'ready' && s.count ? `<button type="button" class="dz-text-button" data-open-layer="${esc(s.id)}">Voir l’analyse ${icon('arrow-right')}</button>` : ''}</li>`).join('')}</ul>
  </div></details>`;
}

function sourcesHtml(dossier) {
  const c = coverage(dossier);
  return `<section class="dz-surface dz-source-register"><header class="dz-register-heading"><div><h2>Les sources du diagnostic</h2><p>La provenance, les périodes et les limites des données utilisées.</p></div></header>
    <div class="dz-source-columns" aria-hidden="true"><span>Source et provenance</span><span>Période des données</span><span>Contenu</span></div>
    ${sourceRegister(dossier).map((sources) => sourceDetails(dossier, sources)).join('') || '<p class="dz-source-empty">Aucune source n’a été retenue. Revenez à la carte pour ajouter des données.</p>'}
    <details class="dz-method"><summary>Méthode et limites de lecture</summary><p>${c.readable ? `${number(c.read, 0)} textes examinés sur ${number(c.readable, 0)} ; ${number(c.cited, 0)} rattachés aux constats.` : 'Aucun témoignage textuel à analyser dans cette zone.'}</p>${limitations(dossier)}<p>Les constats sont établis pour chaque jeu de données, puis rapprochés quand plusieurs lectures décrivent la même situation. La synthèse croise les éclairages disponibles sans établir de causalité entre eux.</p><p>Sur les cartes, les nombres comptent les observations regroupées à l’échelle d’affichage. Les lettres situent les citations. Ces regroupements ne mesurent pas une concentration statistique.</p><p>Les lectures sont proposées par l’IA ; les citations reproduisent les textes d’origine. Une version conserve les données et les cartes du relevé.</p></details>
  </section>`;
}

/** Un seul libellé par état d'enregistrement, au premier affichage comme après une modification. */
export function saveStateText(dossier, { saved = true, local = true } = {}) {
  if (saved) return `Version ${Number(dossier.revision) || 1} enregistrée`;
  return local ? 'Vos modifications sont gardées sur cet appareil.' : 'Vos modifications ne sont pas gardées sur cet appareil : enregistrez une version.';
}

export function pageHtml(dossier, { activeId, activeLayerId, activeView = 'overview', saved = true, local = true, progress } = {}) {
  const pending = analysisRequired(dossier);
  const tabs = [['overview', 'Synthèse'], ['findings', 'Analyses'], ['sources', 'Sources']];
  return `<div class="dz-workspace">
    <div class="dz-toolbar"><a href="/admin/diagnostic/" data-back>${icon('arrow-left')} Carte du diagnostic</a><div class="dz-toolbar-actions"><span class="dz-save-state" role="status" data-save-state>${saveStateText(dossier, { saved, local })}</span><button type="button" class="adm-btn adm-btn--secondary dz-tool-button" data-edit>${icon('sliders')} <span>Personnaliser</span></button><button type="button" class="adm-btn adm-btn--secondary dz-tool-button" data-save ${dossier.analysis.status === 'running' ? 'disabled' : ''} aria-label="Enregistrer une version" title="Enregistrer une nouvelle version">${icon('floppy-disk')} <span>Enregistrer</span></button><button type="button" class="adm-btn adm-btn--primary" data-export data-print aria-label="Exporter en PDF" ${pending ? 'disabled aria-describedby="dz-analysis-status"' : ''}>${icon('file-arrow-down')} <span class="dz-wide-label">Exporter en PDF</span><span class="dz-short-label" aria-hidden="true">Exporter</span></button></div></div>
    <div class="dz-document"><header class="dz-header"><div><span class="dz-eyebrow">${esc(dossier.brand)} · Diagnostic terrain</span><h1>${esc(dossier.title)}</h1><p class="dz-objective" ${dossier.objective ? '' : 'hidden'}>${esc(dossier.objective)}</p></div><p class="dz-date">Constitué le ${esc(dateText(dossier.capturedAt))}</p></header>
    <div id="dz-analysis-status" data-analysis-status ${pending ? '' : 'hidden'}>${pending ? analysisStatus(dossier, progress) : ''}</div>
    <nav class="dz-tabs" role="tablist" aria-label="Dossier de zone">${tabs.map(([id, label]) => `<button type="button" role="tab" id="dz-tab-${id}" data-view="${id}" aria-controls="dz-${id}" aria-selected="${activeView === id}" tabindex="${activeView === id ? 0 : -1}">${label}</button>`).join('')}</nav>
    <main class="dz-content">
      <section class="dz-section" id="dz-overview" role="tabpanel" aria-labelledby="dz-tab-overview" ${activeView !== 'overview' ? 'hidden' : ''}>${overviewHtml(dossier, pending)}</section>
      <section class="dz-section" id="dz-findings" role="tabpanel" aria-labelledby="dz-tab-findings" ${activeView !== 'findings' ? 'hidden' : ''}>${findingsHtml(dossier, activeLayerId, activeId)}</section>
      <section class="dz-section" id="dz-sources" role="tabpanel" aria-labelledby="dz-tab-sources" ${activeView !== 'sources' ? 'hidden' : ''}>${sourcesHtml(dossier)}</section>
    </main></div>
  </div>`;
}

export function printHtml(dossier, { appendix = false, draft = false, reportUrl = '' } = {}) {
  // Couvre aussi l'impression native du navigateur, qui contourne le bouton.
  if (analysisRequired(dossier)) return `<div class="dz-print"><section class="dz-print-cover"><h1>${esc(dossier.title)}</h1><h2>L’analyse des témoignages n’est pas terminée.</h2><p>Le rapport PDF sera disponible après la lecture de tous les témoignages et la préparation de leur synthèse. Revenez au dossier web pour suivre ou reprendre l’analyse.</p></section></div>`;
  const c = coverage(dossier);
  const findings = orderedFindings(dossier).filter((f) => f.included !== false);
  const readings = findings.filter((f) => f.kind === 'testimony');
  const measures = findings.filter((f) => f.kind !== 'testimony');
  const cited = new Set(findings.flatMap((f) => f.observationIds));
  const evidence = dossier.observations.filter((o) => appendix || cited.has(o.id));
  const coverWeight = dossier.title.length * 3 + (dossier.objective || '').length + dossierSummary(dossier).length + (c.read < c.readable ? 120 : 0) + (c.failed.length ? 120 : 0);
  const extendedOpening = coverWeight > 1500;
  const periods = [...new Set(dossier.sources.filter((s) => s.count && s.period.known).map((s) => s.period.label))];
  const sectionHeading = (label, title) => `<div class="dz-chapter"><span>${esc(label)}</span><h2>${esc(title)}</h2></div>`;
  const article = (f) => findingArticle(dossier, f, { print: true, number: findingNumber(findings.indexOf(f)) });
  // L'adresse de la version appartient à l'application, jamais au contenu importé.
  const webUrl = !draft && /^https?:\/\/[^/]+\/admin\/diagnostic\/[0-9a-f-]{36}\/$/i.test(reportUrl) ? reportUrl : '';
  return `<div class="dz-print${readings.length <= 1 && measures.length <= 1 && dossier.sources.length <= 2 && !dossier.notes && !extendedOpening ? ' is-brief' : ''}">
    <section class="dz-print-cover${coverWeight > 650 ? ' is-long' : ''}"><div class="dz-document-brand"><b>${esc(dossier.brand)}</b><span>Diagnostic terrain</span></div>
      <div class="dz-cover-heading"><span class="dz-eyebrow">${draft ? 'Brouillon' : `Version ${Number(dossier.revision) || 1}`} · ${esc(dateText(dossier.capturedAt))}</span><h1>${esc(dossier.title)}</h1>${dossier.objective ? `<p class="dz-print-objective">${esc(dossier.objective)}</p>` : ''}</div>
      ${dossier.editorialSummary?.trim() ? '<p class="dz-summary-credit">Synthèse de la collectivité</p>' : ''}<p class="dz-lead">${esc(dossierSummary(dossier))}</p>
      ${extendedOpening ? `</section><section class="dz-print-cover">${sectionHeading('Périmètre du dossier', 'La zone et les données retenues')}` : ''}<div class="dz-cover-map">${mapFigure(dossier)}</div>
      <dl class="dz-cover-facts"><div><dt>Périmètre étudié</dt><dd>${number(dossier.zone.areaKm2, 2)} <span>km²</span></dd></div><div><dt>Observations disponibles</dt><dd>${number(c.observations, 0)}</dd></div><div><dt>Jeux de données retenus</dt><dd>${dossier.sources.length}</dd></div></dl>
      <p class="dz-periods">${periods.length ? `Périodes documentées : ${esc(periods.join(' / '))}.` : 'Les périodes des sources ne sont pas renseignées.'}${c.unknownPeriods.length && periods.length ? ` ${c.unknownPeriods.length} source${c.unknownPeriods.length > 1 ? 's ont une période à préciser' : ' a une période à préciser'}.` : ''} La date du dossier indique sa constitution.</p>
      ${c.read < c.readable ? `<p class="dz-print-status">Lecture à compléter : ${number(c.read, 0)} textes examinés sur ${number(c.readable, 0)}.</p>` : ''}${c.failed.length ? '<p class="dz-print-status">Certaines sources n’ont pas été chargées. Leurs limites sont précisées en fin de dossier.</p>' : ''}
      <nav class="dz-print-navigation" aria-label="Parcourir le PDF">${readings.length ? `<a href="#dz-report-findings">${readings.length === 1 ? 'Lire le constat' : `Lire les ${readings.length} constats`} <span aria-hidden="true">→</span></a>` : ''}${measures.length ? `<a href="#dz-report-measures">Consulter les mesures <span aria-hidden="true">→</span></a>` : ''}<a href="#dz-report-sources">${evidence.length ? 'Retrouver les sources et les preuves' : 'Vérifier les sources'} <span aria-hidden="true">→</span></a></nav>
      
    </section>
    ${findingSheets(dossier).map((sheet, i) => `<section class="dz-print-sheet${sheet.compact ? ' is-compact' : ''}"${i === 0 ? ' id="dz-report-findings"' : ''}>${i === 0 ? sectionHeading('01 / Comprendre le secteur', 'Les constats documentés') : ''}${sheet.findings.map(article).join('')}</section>`).join('')}
    ${measures.length ? `<section class="dz-print-measures" id="dz-report-measures">${sectionHeading(`${findingNumber(readings.length ? 1 : 0)} / Mettre en perspective`, 'Les repères chiffrés')}${measures.map(article).join('')}</section>` : ''}
    ${dossier.notes ? `<section class="dz-print-notes">${sectionHeading('Contribution de la collectivité', 'Observations et suites à examiner')}${paras(dossier.notes)}</section>` : ''}
    <section class="dz-print-sources" id="dz-report-sources">${sectionHeading(`${findingNumber(Number(!!readings.length) + Number(!!measures.length))} / Vérifier la lecture`, 'Les sources et les limites')}<p class="dz-source-intro">Les décomptes décrivent les données retenues dans la zone. Ils ne mesurent ni la représentativité des témoignages ni la couverture de toute la collectivité.</p>${sourcesTable(dossier)}<h3>Méthode de lecture</h3>${limitations(dossier)}<p>Les surfaces et les longueurs sont calculées dans le périmètre tracé. Les lectures des témoignages sont proposées par l’IA, sauf mention d’une reformulation par la collectivité. Les lettres sur les cartes renvoient aux citations ; les nombres dans les cercles comptent les observations regroupées à l’échelle d’affichage.</p>${webUrl ? `<p class="dz-report-link"><a href="${esc(webUrl)}">Ouvrir cette version dans le dossier web</a><span>${esc(webUrl)}</span>L’accès est réservé aux personnes autorisées de la collectivité.</p>` : ''}<p class="dz-print-disclaimer">Ce dossier rapproche les données disponibles. Les témoignages ne constituent pas des vérifications sur place. L’interprétation et les suites à donner relèvent de la collectivité.</p></section>
    ${evidence.length ? `<section class="dz-print-evidence">${sectionHeading('Annexe / Textes d’origine', appendix ? 'Toutes les observations' : 'Les preuves des constats')}<p>${appendix ? 'Cette annexe reprend toutes les observations du dossier.' : 'Cette annexe reprend toutes les observations référencées par les constats retenus.'} Les textes identiques d’une même source sont présentés ensemble ; chaque observation conserve son identifiant.</p>${proofGroups(evidence).map((group) => `<article><header><b>${group.observations.map((o) => `<span id="${esc(evidenceAnchor(o.id))}">${esc(o.id.toUpperCase())}</span>`).join(', ')}</b><span>${esc(dossier.sources.find((s) => s.id === group.sourceId)?.label)}</span></header><p>${esc(group.text || 'Cette observation ne comporte pas de texte descriptif.')}</p></article>`).join('')}</section>` : ''}
  </div>`;
}
