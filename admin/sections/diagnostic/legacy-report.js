/**
 * Lecture seule des rapports historiques, conservés dans leur format d’origine.
 *
 * Tout ce que ce rapport affiche vient d'une ligne de diagnostic_reports, que
 * tout administrateur de la ville peut écrire : aucune valeur n'y est donc
 * insérée telle quelle. Un texte passe par esc(), un nombre par les
 * formateurs ci-dessous (un « nombre » qui n'en est pas un n'est pas affiché),
 * une couleur par safeColor().
 */
import { esc, escAttr } from '../../components/ui.js';
import { store } from '../../store.js';
import { dg, safeColor } from './state.js';
import { METRIC_AGGS, maxOf } from './data.js';

/** La valeur enregistrée si c'est vraiment un nombre, sinon null. */
const _num = (v) => (v === '' || v === null || v === undefined || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
const _finite = (v) => _num(v) !== null;
const _fmt = (n) => (_num(n) ?? 0).toLocaleString('fr-FR');
const _fmtKm2 = (n) => (_num(n) ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const _fmtValue = (v) => (_num(v) ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
/** Un nombre suivi de son unité, ou '' si la valeur enregistrée n'est pas un nombre (la ligne disparaît). */
const _with = (v, unit, digits = 1) => { const n = _num(v); return n === null ? '' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${unit}`; };
/** Un entier écrit sans séparateur (année, numéro de point), ou ''. */
const _int = (v) => { const n = _num(v); return n === null ? '' : String(Math.round(n)); };
const _list = (v) => (Array.isArray(v) ? v : []);
const _text = (v) => (v === null || v === undefined ? '' : String(v));
const _THEME_LABELS = { usage: 'Usage', securite: 'Sécurité', equipement: 'Équipement', paroles: 'Ce que disent les gens' };

/** Barre de répartition empilée + légende (le PDF n'a pas de survol). */
function _mixBar(couches, total) {
  if (!couches.length || !(Number(total) > 0)) return '';
  const share = (c) => (_finite(c.count) ? Number(c.count) / Number(total) * 100 : 0);
  const segs = couches.map((c) => `<span class="dg-rp-mix__seg" style="width:${share(c).toFixed(3)}%;background:${escAttr(safeColor(c.color))}"></span>`).join('');
  const legend = couches.map((c) => `<span class="dg-rp-mix__key">
      <i style="background:${escAttr(safeColor(c.color))}"></i>${esc(_text(c.label))}
      <b>${_fmt(c.count)}</b><small>${Math.round(share(c))} %</small>
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
  const apercu = _list(c.apercu);
  const rows = apercu.map((p) => `<div class="dg-rp-raw"><b>${esc(_text(p?.label))}</b> ${esc(_text(p?.texte))}</div>`).join('');
  const reste = (_finite(c.count) ? Number(c.count) : 0) - apercu.length;
  return '<div class="dg-rp-muted">Aucun sujet récurrent ne se dégage de ces points. Leur contenu, tel quel :</div>'
    + rows
    + (reste > 0 ? `<div class="dg-rp-muted">Et ${_fmt(reste)} autre${reste > 1 ? 's' : ''} point${reste > 1 ? 's' : ''}.</div>` : '');
}

export function showLegacyReport(data, images, date) {
  const a = data.analysis || {};
  const ins = data.stats?.insights || null;
  const brand = dg.branding?.brand_name || store.city || '';
  const dateLabel = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const couches = _list(a.couches).filter((c) => c && typeof c === 'object');
  const total = _finite(data.point_count) && Number(data.point_count) > 0
    ? Number(data.point_count)
    : couches.reduce((acc, c) => acc + (_finite(c.count) ? Number(c.count) : 0), 0);
  const cites = _list(data.cites || a.cites);
  const context = _list(data.stats?.context);
  const rawTitle = _text(data.title);
  const place = rawTitle && !rawTitle.startsWith('Diagnostic du') ? rawTitle.replace(/ - .*$/, '') : '';
  // Seules des images produites par le navigateur (data:image) sont affichées.
  const img = (src, alt, cls = '') => (typeof src === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(src)
    ? `<img class="dg-rs-map ${escAttr(cls)}" src="${escAttr(src)}" alt="${escAttr(alt)}">` : '');
  const themes = ins?.themes || {};
  const t = _THEME_LABELS;

  /* Première page : le lieu, trois constats, six chiffres, la carte des lieux */
  const kpis = _list(ins?.kpis).map((k) => `
    <div class="dg-rs-kpi dg-rs-kpi--${escAttr(/^[a-z]+$/.test(_text(k?.tone)) ? k.tone : 'usage')}">
      <div class="dg-rs-kpi__v">${_fmtValue(k?.value)}<small>${esc(_text(k?.unit))}</small></div>
      <div class="dg-rs-kpi__l">${esc(_text(k?.label))}</div>
      ${k?.sub ? `<div class="dg-rs-kpi__s">${esc(_text(k.sub))}</div>` : ''}
    </div>`).join('');
  const constats = _list(ins?.constats).map((c, i) => `<li><span>${i + 1}</span>${esc(_text(c))}</li>`).join('');
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
      ${images?.cover ? `<figure class="dg-rs-fig">${img(images.cover, 'Plan de la zone analysée')}<figcaption>La zone analysée${_list(ins?.hotspots).length ? ', et les lieux qui cumulent les signaux, numérotés' : ''}. Les points hors de la zone sont estompés.</figcaption></figure>` : ''}
    </section>`;

  /* Lieux qui cumulent */
  const hotspots = _list(ins?.hotspots).map((h) => {
    const sources = _list(h?.sources);
    const quotes = _list(h?.quotes);
    const n = _int(h?.n);
    return `
    <article class="dg-rs-spot">
      ${img(images?.hotspots?.[n], `Lieu ${n}`, 'dg-rs-map--mini')}
      <div class="dg-rs-spot__body">
        <div class="dg-rs-spot__head"><span class="dg-rs-num">${n}</span><div><div class="dg-rs-spot__title">${esc(_text(h?.place) || 'Lieu sans adresse connue')}</div><div class="dg-rs-spot__meta">${_fmt(h?.count)} signaux · ${sources.length} source${sources.length > 1 ? 's' : ''}</div></div></div>
        <ul class="dg-rs-spot__sources">${sources.map((s) => `<li><i style="background:${escAttr(safeColor(s?.color))}"></i>${esc(_text(s?.label).split(' · ')[0])} <b>${_fmt(s?.count)}</b></li>`).join('')}</ul>
        ${quotes.map((q) => { const txt = _text(q?.text); return `<div class="dg-rp-verb">« ${esc(txt.length > 220 ? `${txt.slice(0, 220)}…` : txt)} »</div>`; }).join('')}
      </div>
    </article>`;
  }).join('');
  const attention = _list(ins?.attention).map((p) => `
    <div class="dg-rs-alert"><div class="dg-rs-alert__t"><span class="dg-rs-rule">${esc(_text(p?.rule))}</span>${esc(_text(p?.title))}</div><p>${esc(_text(p?.text))}</p></div>`).join('');
  const spotsSheet = hotspots || attention ? `
    <section class="dg-rs-sheet">
      ${hotspots ? `<h2 class="dg-rs-h2">Les lieux qui cumulent les signaux</h2>
      <p class="dg-rs-lead">Les points de toutes les sources sont regroupés lorsqu'ils sont à moins de 40 mètres les uns des autres. Les lieux sont classés par le nombre de sources qui s'y rejoignent, puis par le nombre de signaux.</p>
      <div class="dg-rs-spots">${hotspots}</div>` : ''}
      ${attention ? `<h2 class="dg-rs-h2">Points d'attention</h2>
      <p class="dg-rs-lead">Chaque point d'attention suit une règle écrite, rappelée en annexe. Aucun n'est un jugement : ce sont des coïncidences que les données rendent visibles.</p>
      <div class="dg-rs-alerts">${attention}</div>` : ''}
    </section>` : '';

  /* Thèmes : chaque valeur est du texte, échappée ici ; une ligne vide disparaît. */
  const facts = (rows) => `<dl class="dg-rs-facts">${rows.filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `<div><dt>${esc(_text(k))}</dt><dd>${esc(_text(v))}</dd></div>`).join('')}</dl>`;
  const perDay = (v) => { const n = _num(v); return n === null ? '' : `${_fmt(n)} trajet${n > 1 ? 's' : ''} par jour`; };
  const sheets = [];
  const u = themes.usage || {};
  if (u.strava || u.counters?.count) {
    const s = u.strava, k = u.counters;
    sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.usage} · qui passe ici</h2>
      ${img(images?.themes?.usage, 'Carte des flux et compteurs')}
      <div class="dg-rs-cols">
        ${s ? `<div><h3 class="dg-rs-h3">Flux cyclistes Strava</h3>${facts([
          ['Axe le plus emprunté', perDay(s.busiestPerDay)],
          ['Tronçon médian', perDay(s.medianPerDay)],
          ['Trajets pendulaires', _with(s.commuteShare, '%', 0)],
          ['Vélo électrique', _with(s.ebikeShare, '%', 0)],
          ['Vitesse moyenne', _with(s.speedKmh, 'km/h')],
          ['Tronçons dans la zone', _finite(s.segments) ? _fmt(s.segments) : ''],
        ])}<p class="dg-rs-note">Strava compte un échantillon de pratiquants équipés de l'application, surtout sportifs et pendulaires : un ordre de grandeur, pas un comptage exhaustif.</p></div>` : ''}
        ${k?.count ? `<div><h3 class="dg-rs-h3">Compteurs</h3>${facts([
          ['Compteurs dans la zone', _fmt(k.count)],
          ['Passages par jour, cumulés', _fmt(k.perDay)],
          ..._list(k.top).map((c) => [_text(c?.nom), _with(c?.perDay, 'par jour', 0)]),
        ])}</div>` : ''}
      </div></section>`);
  }
  const se = themes.securite || {};
  if (se.accidents || se.waze) {
    const ac = se.accidents, w = se.waze;
    const byYear = _list(ac?.byYear);
    const years = byYear.length > 1 ? _yearsChart(byYear) : '';
    const cases = _list(ac?.cases);
    sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.securite} · ce qui s'y est passé</h2>
      ${img(images?.themes?.securite, 'Carte des accidents')}
      <div class="dg-rs-cols">
        ${ac ? `<div><h3 class="dg-rs-h3">Accidents corporels</h3>${cases.length ? `<ul class="dg-rs-cases">${cases.map((c) => `<li><b>${esc(_text(c?.gravite))}</b> le ${esc(_date(c?.date))}${c?.heure ? ` à ${esc(_text(c.heure))}` : ''}${_list(c?.usagers).length ? `, ${esc(_list(c.usagers).map(_text).join(', '))}` : ''}${c?.adresse ? `, ${esc(_text(c.adresse))}` : ''}</li>`).join('')}</ul>` : facts([
          ['Accidents', _fmt(ac.count)],
          ['Tués', _fmt(ac.tues)], ['Blessés hospitalisés', _fmt(ac.hospitalises)], ['Blessés légers', _fmt(ac.legers)],
          ['Avec un vélo', _fmt(ac.velo)], ['Avec un piéton', _fmt(ac.pieton)], ['Avec un deux-roues motorisé', _fmt(ac.deuxRoues)],
          ['Usagers vulnérables impliqués', _with(ac.vulnerableShare, '% des accidents', 0)],
          ['De nuit', _with(ac.nightShare, '%', 0)], ['En intersection', _with(ac.intersectionShare, '%', 0)],
        ])}${years}<p class="dg-rs-note">Seuls les accidents constatés par la police ou la gendarmerie figurent au fichier national : les chutes sans tiers ni intervention n'y sont pas.</p></div>` : ''}
        ${w ? `<div><h3 class="dg-rs-h3">Waze, à l'instant du diagnostic</h3>${facts([
          ['Alertes', _fmt(w.alerts)],
          ..._list(w.byType).slice(0, 4).map((x) => [_text(x?.type), _fmt(x?.count)]),
          ['Ralentissements', _fmt(w.jams)],
          ['Retard moyen', Number(w.meanDelayS) > 0 ? `${Math.round(Number(w.meanDelayS) / 60)} min` : ''],
          ['Longueur ralentie', Number(w.jamKm) > 0 ? _with(w.jamKm, 'km') : ''],
        ])}<p class="dg-rs-note">Une photographie au moment où le diagnostic a été lancé, pas une moyenne.</p></div>` : ''}
      </div></section>`);
  }
  const eq = themes.equipement || {};
  if (eq.cycleways) {
    const c = eq.cycleways;
    sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.equipement} · ce qui existe</h2>
      ${img(images?.themes?.equipement, 'Carte des aménagements cyclables')}
      <div class="dg-rs-cols"><div><h3 class="dg-rs-h3">Aménagements cyclables</h3>${facts([
        ['Longueur aménagée', _with(c.km, 'km')], ['Tronçons', _finite(c.segments) ? _fmt(c.segments) : ''],
        ..._list(c.byType).map((x) => [_text(x?.type), _with(x?.km, 'km')]),
      ])}<p class="dg-rs-note">D'après OpenStreetMap, dont la mise à jour dépend des contributeurs locaux : un aménagement récent peut manquer.</p></div></div></section>`);
  }
  /* Ce que disent les gens : le résumé et les sujets de l'analyse */
  const pa = themes.paroles || {};
  const sections = couches.map((c) => {
    const count = _finite(c.count) ? Number(c.count) : 0;
    const share = total ? Math.round((count / total) * 100) : 0;
    const sujets = _list(c.sujets).map((su) => {
      const refs = _list(su?.refs).map(_int).filter(Boolean);
      const n = refs.length;
      return `
        <div class="dg-rp-sujet">
          <div class="dg-rp-sujet__head">
            <span class="dg-rp-sujet__title">${esc(_text(su?.sujet))}</span>
            <span class="dg-rp-sujet__count">${_fmt(n)} point${n > 1 ? 's' : ''}</span>
          </div>
          ${_list(su?.verbatims).map((v) => `<div class="dg-rp-verb">« ${esc(_text(v))} »</div>`).join('')}
          ${n ? `<div class="dg-rp-sujet__refs">Points ${refs.map((r) => `#${r}`).join(', ')}</div>` : ''}
        </div>`;
    }).join('');
    return `
      <div class="dg-rp-source">
        <div class="dg-rp-source__head">
          <span class="dg-rp-source__dot" style="background:${escAttr(safeColor(c.color))}"></span>
          <span class="dg-rp-source__name">${esc(_text(c.label))}</span>
          <span class="dg-rp-source__count">${_fmt(count)} point${count > 1 ? 's' : ''} · ${share} %</span>
        </div>
        ${c.synthese ? `<p class="dg-rp-source__synth">${esc(_text(c.synthese))}</p>` : ''}
        ${sujets || _fallbackHtml(c)}
      </div>`;
  }).join('');
  const fub = pa.fub;
  sheets.push(`<section class="dg-rs-sheet"><h2 class="dg-rs-h2">${t.paroles}</h2>
    ${img(images?.themes?.paroles, 'Carte des témoignages')}
    ${fub ? `<div class="dg-rs-balance"><div><b>${_fmt(fub.red)}</b> point${Number(fub.red) > 1 ? 's' : ''} à améliorer</div><div><b>${_fmt(fub.green)}</b> amélioration${Number(fub.green) > 1 ? 's' : ''} constatée${Number(fub.green) > 1 ? 's' : ''}</div><div><b>${_fmt(fub.parking)}</b> souhait${Number(fub.parking) > 1 ? 's' : ''} de stationnement</div><div class="dg-rs-balance__src">Baromètre vélo, FUB</div></div>` : ''}
    ${a.resume ? `<p class="dg-rp-lead">${esc(_text(a.resume))}</p>` : ''}
    ${_mixBar(couches, total)}
    ${sections || '<div class="dg-rp-muted">Aucun témoignage dans cette zone.</div>'}
  </section>`);

  /* Annexes */
  const citeRows = cites.map((c) => `<tr><td class="dg-rp-cite__n">#${_int(c?.n)}</td><td>${esc(_text(c?.couche))}</td><td>${esc(_text(c?.label))}</td><td>${esc(_text(c?.texte) || 'Sans texte')}</td></tr>`).join('');
  const srcRows = _list(data.stats?.sources).map((s) => `<tr><td>${esc(_text(s?.label))}</td><td>${esc(_text(s?.source))}</td><td class="dg-rp-num">${_fmt(s?.inZone)} / ${_fmt(s?.total)}</td><td>${esc(_text(s?.credit))}</td></tr>`).join('');
  const contextRows = context.map((c) => `<tr>
      <td><span class="dg-rp-source__dot" style="background:${escAttr(safeColor(c?.color))}"></span>${esc(_text(c?.label))}</td>
      <td class="dg-rp-num">${_fmt(c?.count)}</td>
      <td>${_list(c?.metrics).length
        ? _list(c.metrics).map((m) => `<div class="dg-rp-metric"><span>${esc(Object.hasOwn(METRIC_AGGS, m?.agg) ? METRIC_AGGS[m.agg].label : 'Total')} ${esc(_text(m?.label || m?.field))}</span><b>${_fmtValue(m?.value)}</b></div>`).join('')
        : '<span class="dg-rp-muted">Décompte seul</span>'}</td>
    </tr>`).join('');
  const annexes = `
    <section class="dg-rs-sheet dg-rs-sheet--annexes">
      <h2 class="dg-rs-h2">Annexes</h2>
      ${srcRows ? `<h3 class="dg-rs-h3">Sources mobilisées</h3>
      <table class="dg-rp-table"><thead><tr><th>Couche</th><th>Provenance</th><th>Dans la zone / au total</th><th>Licence</th></tr></thead><tbody>${srcRows}</tbody></table>` : ''}
      ${contextRows ? `<h3 class="dg-rs-h3">Chiffres de zone des données de référence</h3>
      <table class="dg-rp-table dg-rp-table--context"><thead><tr><th>Source</th><th>Éléments</th><th>Chiffres</th></tr></thead><tbody>${contextRows}</tbody></table>` : ''}
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
      <footer class="dg-rp-foot"><span>${esc(brand)} · Diagnostic terrain</span><span>Généré le ${esc(dateLabel)}</span></footer>
    </section>`;

  const doc = document.createElement('div');
  doc.className = 'dg-report-doc';
  // Les témoignages cités n'apparaissent jamais en clair dans les
  // enregistrements de session (modules/analytics.js).
  doc.setAttribute('data-op-mask', '');
  doc.innerHTML = `
    <div class="dg-rp-toolbar">
      <span class="dg-rp-toolbar__title"><i class="fa-solid fa-file-lines"></i> Rapport de diagnostic terrain</span>
      <span class="dg-rp-toolbar__actions">
        <button type="button" class="adm-btn adm-btn--secondary" data-rp-close>Fermer le rapport</button>
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

/** Date lisible depuis JJ/MM/AAAA ou ISO ; texte brut sinon (à échapper par l'appelant). */
function _date(v) {
  const s = _text(v);
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const d = fr ? new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Repères de première page : ce qui n'a pas sa feuille mais situe la zone. */
function _reperesHtml(themes) {
  const items = [];
  const k = themes.usage?.counters;
  if (k && !k.count && k.nearest) items.push(`Le compteur vélo le plus proche, ${esc(_text(k.nearest.nom))}, à ${_fmt(k.nearest.distanceM)} m de la zone, compte ${_fmt(k.nearest.perDay)} passages par jour.`);
  const pa = themes.paroles || {};
  if (Number(pa.contributions) > 0) items.push(`${_fmt(pa.contributions)} projet${Number(pa.contributions) > 1 ? 's' : ''} publié${Number(pa.contributions) > 1 ? 's' : ''} sur votre carte dans la zone.`);
  if (Number(pa.travaux) > 0) items.push(`${_fmt(pa.travaux)} chantier${Number(pa.travaux) > 1 ? 's' : ''} déclaré${Number(pa.travaux) > 1 ? 's' : ''} dans la zone.`);
  return items.length ? `<ul class="dg-rs-reperes">${items.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
}

/** Petit graphique en barres des accidents par année (SVG inline, imprimable). */
function _yearsChart(byYear) {
  const rows = byYear
    .map((y) => ({ year: _int(y?.year), count: _finite(y?.count) ? Math.max(0, Number(y.count)) : 0 }))
    .filter((y) => y.year);
  if (rows.length < 2) return '';
  const max = Math.max(1, maxOf(rows.map((y) => y.count)));
  const w = 260, h = 90, bw = Math.min(40, Math.floor((w - 10) / rows.length) - 8);
  const bars = rows.map((y, i) => {
    const bh = Math.round((y.count / max) * 60);
    const x = 10 + i * (bw + 8);
    return `<rect x="${x}" y="${70 - bh}" width="${bw}" height="${bh}" rx="3" fill="#DC2626"></rect>
      <text x="${x + bw / 2}" y="${66 - bh}" text-anchor="middle" font-size="10" font-weight="700" fill="#111827">${_fmt(y.count)}</text>
      <text x="${x + bw / 2}" y="84" text-anchor="middle" font-size="10" fill="#6B7280">${y.year}</text>`;
  }).join('');
  return `<svg class="dg-rs-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Accidents par année">${bars}</svg>`;
}
