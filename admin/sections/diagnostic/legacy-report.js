/** Lecture seule des rapports historiques, conservés dans leur format d’origine. */
import { esc, escAttr } from '../../components/ui.js';
import { store } from '../../store.js';
import { dg, safeColor } from './state.js';
import { METRIC_AGGS } from './data.js';

const _fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const _fmtValue = (v) => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const _THEME_LABELS = { usage: 'Usage', securite: 'Sécurité', equipement: 'Équipement', paroles: 'Ce que disent les gens' };

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

export function showLegacyReport(data, images, date) {
  const a = data.analysis;
  const ins = data.stats?.insights || null;
  const brand = dg.branding?.brand_name || store.city || '';
  const dateLabel = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const couches = a.couches || [];
  const total = data.point_count || couches.reduce((acc, c) => acc + c.count, 0);
  const cites = data.cites || data.analysis?.cites || [];
  const context = Array.isArray(data.stats?.context) ? data.stats.context : [];
  const place = data.title && !data.title.startsWith('Diagnostic du') ? data.title.replace(/ - .*$/, '') : '';
  const img = (src, alt, cls = '') => (src ? `<img class="dg-rs-map ${cls}" src="${src}" alt="${escAttr(alt)}">` : '');
  const themes = ins?.themes || {};
  const t = _THEME_LABELS;

  /* Première page : le lieu, trois constats, six chiffres, la carte des lieux */
  const kpis = (ins?.kpis || []).map((k) => `
    <div class="dg-rs-kpi dg-rs-kpi--${esc(k.tone || 'usage')}">
      <div class="dg-rs-kpi__v">${_fmtValue(k.value)}<small>${esc(k.unit)}</small></div>
      <div class="dg-rs-kpi__l">${esc(k.label || '')}</div>
      ${k.sub ? `<div class="dg-rs-kpi__s">${esc(k.sub)}</div>` : ''}
    </div>`).join('');
  const constats = (ins?.constats || []).map((c, i) => `<li><span>${i + 1}</span>${esc(c)}</li>`).join('');
  const cover = `
    <section class="dg-rs-sheet dg-rs-sheet--cover">
      <header class="dg-rs-head">
        <div class="dg-rs-brand">${esc(brand)}</div>
        <div class="dg-rs-kicker">Diagnostic terrain</div>
        <h1 class="dg-rs-title">${esc(place || 'Zone analysée')}</h1>
        <div class="dg-rs-meta">${esc(dateLabel)} · ${_fmtKm2(data.zone?.area_km2)} km² · ${_fmt(total)} témoignage${total > 1 ? 's' : ''} lu${total > 1 ? 's' : ''}${context.length ? ` · ${context.length} source${context.length > 1 ? 's' : ''} de référence` : ''}</div>
      </header>
      ${constats ? `<ol class="dg-rs-constats">${constats}</ol>` : ''}
      ${kpis ? `<div class="dg-rs-kpis">${kpis}</div>` : ''}
      ${_reperesHtml(themes)}
      ${images?.cover ? `<figure class="dg-rs-fig">${img(images.cover, 'Plan de la zone analysée')}<figcaption>La zone analysée${ins?.hotspots?.length ? ', et les lieux qui cumulent les signaux, numérotés' : ''}. Les points hors de la zone sont estompés.</figcaption></figure>` : ''}
    </section>`;

  /* Lieux qui cumulent */
  const hotspots = (ins?.hotspots || []).map((h) => `
    <article class="dg-rs-spot">
      ${img(images?.hotspots?.[h.n], `Lieu ${h.n}`, 'dg-rs-map--mini')}
      <div class="dg-rs-spot__body">
        <div class="dg-rs-spot__head"><span class="dg-rs-num">${h.n}</span><div><div class="dg-rs-spot__title">${esc(h.place || 'Lieu sans adresse connue')}</div><div class="dg-rs-spot__meta">${_fmt(h.count)} signaux · ${h.sources.length} source${h.sources.length > 1 ? 's' : ''}</div></div></div>
        <ul class="dg-rs-spot__sources">${h.sources.map((s) => `<li><i style="background:${escAttr(safeColor(s.color))}"></i>${esc(s.label.split(' · ')[0])} <b>${_fmt(s.count)}</b></li>`).join('')}</ul>
        ${h.quotes?.length ? h.quotes.map((q) => `<div class="dg-rp-verb">« ${esc(q.text.length > 220 ? `${q.text.slice(0, 220)}…` : q.text)} »</div>`).join('') : ''}
      </div>
    </article>`).join('');
  const attention = (ins?.attention || []).map((p) => `
    <div class="dg-rs-alert"><div class="dg-rs-alert__t"><span class="dg-rs-rule">${esc(p.rule)}</span>${esc(p.title)}</div><p>${esc(p.text)}</p></div>`).join('');
  const spotsSheet = hotspots || attention ? `
    <section class="dg-rs-sheet">
      ${hotspots ? `<h2 class="dg-rs-h2">Les lieux qui cumulent les signaux</h2>
      <p class="dg-rs-lead">Les points de toutes les sources sont regroupés lorsqu'ils sont à moins de 40 mètres les uns des autres. Les lieux sont classés par le nombre de sources qui s'y rejoignent, puis par le nombre de signaux.</p>
      <div class="dg-rs-spots">${hotspots}</div>` : ''}
      ${attention ? `<h2 class="dg-rs-h2">Points d'attention</h2>
      <p class="dg-rs-lead">Chaque point d'attention suit une règle écrite, rappelée en annexe. Aucun n'est un jugement : ce sont des coïncidences que les données rendent visibles.</p>
      <div class="dg-rs-alerts">${attention}</div>` : ''}
    </section>` : '';

  /* Thèmes */
  const facts = (rows) => `<dl class="dg-rs-facts">${rows.filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const sheets = [];
  const u = themes.usage || {};
  if (u.strava || u.counters?.count) {
    const s = u.strava, k = u.counters;
    sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.usage} · qui passe ici</h2>
      ${img(images?.themes?.usage, 'Carte des flux et compteurs')}
      <div class="dg-rs-cols">
        ${s ? `<div><h3 class="dg-rs-h3">Flux cyclistes Strava</h3>${facts([
          ['Axe le plus emprunté', `${_fmt(s.busiestPerDay)} trajet${s.busiestPerDay > 1 ? 's' : ''} par jour`],
          ['Tronçon médian', `${_fmt(s.medianPerDay)} trajet${s.medianPerDay > 1 ? 's' : ''} par jour`],
          ['Trajets pendulaires', `${s.commuteShare} %`],
          ['Vélo électrique', `${s.ebikeShare} %`],
          ['Vitesse moyenne', `${s.speedKmh} km/h`],
          ['Tronçons dans la zone', _fmt(s.segments)],
        ])}<p class="dg-rs-note">Strava compte un échantillon de pratiquants équipés de l'application, surtout sportifs et pendulaires : un ordre de grandeur, pas un comptage exhaustif.</p></div>` : ''}
        ${k?.count ? `<div><h3 class="dg-rs-h3">Compteurs</h3>${facts([
          ['Compteurs dans la zone', _fmt(k.count)],
          ['Passages par jour, cumulés', _fmt(k.perDay)],
          ...k.top.map((c) => [esc(c.nom), `${_fmt(c.perDay)} par jour`]),
        ])}</div>` : ''}
      </div></section>`);
  }
  const se = themes.securite || {};
  if (se.accidents || se.waze) {
    const ac = se.accidents, w = se.waze;
    const years = ac?.byYear?.length > 1 ? _yearsChart(ac.byYear) : '';
    sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.securite} · ce qui s'y est passé</h2>
      ${img(images?.themes?.securite, 'Carte des accidents')}
      <div class="dg-rs-cols">
        ${ac ? `<div><h3 class="dg-rs-h3">Accidents corporels</h3>${ac.cases?.length ? `<ul class="dg-rs-cases">${ac.cases.map((c) => `<li><b>${esc(c.gravite)}</b> le ${esc(_date(c.date))}${c.heure ? ` à ${esc(c.heure)}` : ''}${c.usagers.length ? `, ${esc(c.usagers.join(', '))}` : ''}${c.adresse ? `, ${esc(c.adresse)}` : ''}</li>`).join('')}</ul>` : facts([
          ['Accidents', _fmt(ac.count)],
          ['Tués', _fmt(ac.tues)], ['Blessés hospitalisés', _fmt(ac.hospitalises)], ['Blessés légers', _fmt(ac.legers)],
          ['Avec un vélo', _fmt(ac.velo)], ['Avec un piéton', _fmt(ac.pieton)], ['Avec un deux-roues motorisé', _fmt(ac.deuxRoues)],
          ['Usagers vulnérables impliqués', `${ac.vulnerableShare} % des accidents`],
          ['De nuit', `${ac.nightShare} %`], ['En intersection', `${ac.intersectionShare} %`],
        ])}${years}<p class="dg-rs-note">Seuls les accidents constatés par la police ou la gendarmerie figurent au fichier national : les chutes sans tiers ni intervention n'y sont pas.</p></div>` : ''}
        ${w ? `<div><h3 class="dg-rs-h3">Waze, à l'instant du diagnostic</h3>${facts([
          ['Alertes', _fmt(w.alerts)],
          ...w.byType.slice(0, 4).map((x) => [esc(x.type), _fmt(x.count)]),
          ['Ralentissements', _fmt(w.jams)], ['Retard moyen', w.meanDelayS ? `${Math.round(w.meanDelayS / 60)} min` : ''], ['Longueur ralentie', w.jamKm ? `${w.jamKm} km` : ''],
        ])}<p class="dg-rs-note">Une photographie au moment où le diagnostic a été lancé, pas une moyenne.</p></div>` : ''}
      </div></section>`);
  }
  const eq = themes.equipement || {};
  if (eq.cycleways) {
    const c = eq.cycleways;
    sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.equipement} · ce qui existe</h2>
      ${img(images?.themes?.equipement, 'Carte des aménagements cyclables')}
      <div class="dg-rs-cols"><div><h3 class="dg-rs-h3">Aménagements cyclables</h3>${facts([
        ['Longueur aménagée', `${c.km} km`], ['Tronçons', _fmt(c.segments)],
        ...c.byType.map((x) => [esc(x.type), `${x.km} km`]),
      ])}<p class="dg-rs-note">D'après OpenStreetMap, dont la mise à jour dépend des contributeurs locaux : un aménagement récent peut manquer.</p></div></div></section>`);
  }
  /* Ce que disent les gens : le résumé et les sujets de l'analyse */
  const pa = themes.paroles || {};
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
  sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.paroles}</h2>
    ${img(images?.themes?.paroles, 'Carte des témoignages')}
    ${pa.fub ? `<div class="dg-rs-balance"><div><b>${_fmt(pa.fub.red)}</b> point${pa.fub.red > 1 ? 's' : ''} à améliorer</div><div><b>${_fmt(pa.fub.green)}</b> amélioration${pa.fub.green > 1 ? 's' : ''} constatée${pa.fub.green > 1 ? 's' : ''}</div><div><b>${_fmt(pa.fub.parking)}</b> souhait${pa.fub.parking > 1 ? 's' : ''} de stationnement</div><div class="dg-rs-balance__src">Baromètre vélo, FUB</div></div>` : ''}
    ${a.resume ? `<p class="dg-rp-lead">${esc(a.resume)}</p>` : ''}
    ${_mixBar(couches, total)}
    ${sections || '<div class="dg-rp-muted">Aucun témoignage dans cette zone.</div>'}
  </section>`);

  /* Annexes */
  const citeRows = cites.map((c) => `<tr><td class="dg-rp-cite__n">#${c.n}</td><td>${esc(c.couche)}</td><td>${esc(c.label)}</td><td>${esc(c.texte || '-')}</td></tr>`).join('');
  const srcRows = (data.stats?.sources || []).map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.source)}</td><td class="dg-rp-num">${_fmt(s.inZone)} / ${_fmt(s.total)}</td><td>${esc(s.credit || '')}</td></tr>`).join('');
  const contextRows = context.map((c) => `<tr>
      <td><span class="dg-rp-source__dot" style="background:${escAttr(safeColor(c.color))}"></span>${esc(c.label)}</td>
      <td class="dg-rp-num">${_fmt(c.count)}</td>
      <td>${(c.metrics || []).length
        ? (c.metrics || []).map((m) => `<div class="dg-rp-metric"><span>${esc(METRIC_AGGS[m.agg]?.label || 'Total')} ${esc(m.field)}</span><b>${_fmtValue(m.value)}</b></div>`).join('')
        : '<span class="dg-rp-muted">Décompte seul</span>'}</td>
    </tr>`).join('');
  const annexes = `
    <section class="dg-rs-sheet dg-rs-sheet--annexes">
      <h2 class="dg-rs-h2">Annexes</h2>
      ${srcRows ? `<h3 class="dg-rs-h3">Sources mobilisées</h3>
      <table class="dg-rp-table"><thead><tr><th>Couche</th><th>Provenance</th><th>Dans la zone / au total</th><th>Licence</th></tr></thead><tbody>${srcRows}</tbody></table>` : ''}
      ${contextRows ? `<h3 class="dg-rs-h3">Chiffres de zone des données de référence</h3>
      <table class="dg-rp-table dg-rp-table--context"><thead><tr><th>Source</th><th>Entités</th><th>Chiffres</th></tr></thead><tbody>${contextRows}</tbody></table>` : ''}
      ${citeRows ? `<h3 class="dg-rs-h3">Points cités</h3>
      <table class="dg-rp-table dg-rp-table--cites"><thead><tr><th>N°</th><th>Source</th><th>Libellé</th><th>Texte du signalement</th></tr></thead><tbody>${citeRows}</tbody></table>` : ''}
      <h3 class="dg-rs-h3">Méthode et limites</h3>
      <div class="dg-rp-method">
        <p><b>Périmètre.</b> La zone est celle tracée à la main sur la carte. Les ${_fmt(total)} témoignages qu'elle contient ont <b>tous</b> été lus, sans échantillonnage, d'où le plafond de 300 par sélection. Seules les couches activées au moment de la sélection sont prises en compte.</p>
        <p><b>Ce qui est calculé.</b> Tous les chiffres de ce rapport, décomptes, parts, comparaisons au territoire, longueurs, lieux qui cumulent, sont calculés à partir des données, jamais énoncés par le modèle de langage. La part de la zone rapporte ce qu'elle contient au total de la couche sur le territoire chargé ; le rang compare la zone à des secteurs de même taille découpés sur ce territoire.</p>
        <p><b>Les lieux qui cumulent.</b> Les points de toutes les sources sont regroupés lorsqu'ils sont à moins de 40 mètres les uns des autres ; un lieu est classé par le nombre de sources qui s'y rejoignent, puis par le nombre de points.</p>
        <p><b>Les points d'attention.</b> R1 : un tronçon parmi les 5 % les plus empruntés du territoire d'après Strava, sans aménagement cyclable connu d'OpenStreetMap à moins de 30 mètres. R2 : un accident corporel à moins de 40 mètres d'un point à améliorer du Baromètre. R3 : un lieu où convergent au moins trois sources.</p>
        <p><b>Ce qui est rédigé.</b> Les synthèses par source et les intitulés de sujets sont produits par un modèle de langage à partir du seul texte des témoignages ; les citations sont reproduites mot pour mot et chaque point cité figure ci-dessus.</p>
        <p><b>Ce que ce document ne fait pas.</b> Il ne note pas, ne hiérarchise pas et ne recommande rien. Il restitue et rapproche : l'interprétation et les suites à donner relèvent des services compétents.</p>
      </div>
      <footer class="dg-rp-foot"><span>${esc(brand)} - Diagnostic terrain</span><span>Généré le ${esc(dateLabel)}</span></footer>
    </section>`;

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
    <div class="dg-rp-page dg-rs">
      ${cover}${spotsSheet}${sheets.join('')}${annexes}
    </div>
  `;
  document.body.appendChild(doc);
  const close = () => doc.remove();
  doc.querySelector('[data-rp-close]')?.addEventListener('click', close);
  doc.querySelector('[data-rp-print]')?.addEventListener('click', () => window.print());
}

/** Date lisible depuis JJ/MM/AAAA ou ISO. */
function _date(v) {
  const s = String(v || '');
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const d = fr ? new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Repères de première page : ce qui n'a pas sa feuille mais situe la zone. */
function _reperesHtml(themes) {
  const items = [];
  const k = themes.usage?.counters;
  if (k && !k.count && k.nearest) items.push(`Le compteur vélo le plus proche, ${esc(k.nearest.nom)}, à ${_fmt(k.nearest.distanceM)} m de la zone, compte ${_fmt(k.nearest.perDay)} passages par jour.`);
  const pa = themes.paroles || {};
  if (pa.contributions) items.push(`${_fmt(pa.contributions)} projet${pa.contributions > 1 ? 's' : ''} publié${pa.contributions > 1 ? 's' : ''} sur votre carte dans la zone.`);
  if (pa.travaux) items.push(`${_fmt(pa.travaux)} chantier${pa.travaux > 1 ? 's' : ''} déclaré${pa.travaux > 1 ? 's' : ''} dans la zone.`);
  return items.length ? `<ul class="dg-rs-reperes">${items.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
}

/** Petit graphique en barres des accidents par année (SVG inline, imprimable). */
function _yearsChart(byYear) {
  const max = Math.max(...byYear.map((y) => y.count), 1);
  const w = 260, h = 90, bw = Math.min(40, Math.floor((w - 10) / byYear.length) - 8);
  const bars = byYear.map((y, i) => {
    const bh = Math.round((y.count / max) * 60);
    const x = 10 + i * (bw + 8);
    return `<rect x="${x}" y="${70 - bh}" width="${bw}" height="${bh}" rx="3" fill="#DC2626"></rect>
      <text x="${x + bw / 2}" y="${66 - bh}" text-anchor="middle" font-size="10" font-weight="700" fill="#111827">${y.count}</text>
      <text x="${x + bw / 2}" y="84" text-anchor="middle" font-size="10" fill="#6B7280">${y.year}</text>`;
  }).join('');
  return `<svg class="dg-rs-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Accidents par année">${bars}</svg>`;
}

