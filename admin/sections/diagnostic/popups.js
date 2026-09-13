/**
 * Diagnostic terrain - fenêtres au clic sur la carte.
 * Chaque source du catalogue a sa présentation : un signalement se lit comme
 * un témoignage, un accident comme un bilan, un compteur comme une mesure,
 * un tronçon Strava comme deux sens qui se font face. Toutes partagent la
 * même grammaire (en-tête avec provenance, état, grands chiffres, pastilles,
 * citation, pied) pour rester une seule famille. Une couche décrite à la main
 * reçoit la présentation générique, pilotée par ses champs de popup.
 */

import { esc, escAttr, sanitizeUrl } from '../../components/ui.js';
import { safeColor, layerKind } from './state.js';
import { sourceOfLayer } from './sources.js';
import { GRAVITE_COLORS } from './sources/baac.js';

const _fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: d });
const _has = (v) => v !== null && v !== undefined && v !== '' && v !== 'null';
const _yes = (v) => String(v).toLowerCase() === 'oui';

/** Date lisible depuis un ISO ou un JJ/MM/AAAA ; '' si illisible. */
function _date(v, { time = false } = {}) {
  if (!_has(v)) return '';
  const s = String(v).trim();
  let d = null;
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) d = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
  else if (!Number.isNaN(Date.parse(s))) d = new Date(s);
  if (!d || Number.isNaN(d.getTime())) return s;
  const opts = { day: 'numeric', month: 'long', year: 'numeric' };
  if (time) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', opts);
}

/** « il y a 12 min », « il y a 3 h » pour un flux en temps réel. */
function _ago(v) {
  const t = Date.parse(String(v || ''));
  if (Number.isNaN(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `le ${_date(v)}`;
}

/* ── Briques ────────────────────────────────────────────────────── */

function _head({ eyebrow, title, icon, tint, sub }) {
  return `
    <div class="dgp__head">
      ${icon ? `<span class="dgp__ico" style="--tint:${escAttr(safeColor(tint))}"><i class="${escAttr(icon)}"></i></span>` : ''}
      <div class="dgp__titles">
        ${eyebrow ? `<div class="dgp__eyebrow">${eyebrow}</div>` : ''}
        <div class="dgp__title">${title}</div>
        ${sub ? `<div class="dgp__sub">${sub}</div>` : ''}
      </div>
    </div>`;
}
const _pill = (text, color, { solid = false } = {}) => (_has(text)
  ? `<span class="dgp__pill${solid ? ' dgp__pill--solid' : ''}" style="--c:${escAttr(safeColor(color, '#64748B'))}">${esc(String(text))}</span>` : '');
const _pills = (items) => { const h = items.filter(Boolean).join(''); return h ? `<div class="dgp__pills">${h}</div>` : ''; };
const _big = (value, label, { muted = false, unit = '' } = {}) => `
  <div class="dgp__big${muted ? ' is-muted' : ''}"><b>${value}${unit ? `<small>${esc(unit)}</small>` : ''}</b><span>${esc(label)}</span></div>`;
const _bigs = (items) => `<div class="dgp__bigs">${items.join('')}</div>`;
const _quote = (text, { placeholder = '' } = {}) => (_has(text)
  ? `<blockquote class="dgp__quote">${esc(String(text))}</blockquote>`
  : (placeholder ? `<div class="dgp__none">${esc(placeholder)}</div>` : ''));
const _line = (icon, text) => (_has(text) ? `<div class="dgp__line"><i class="${escAttr(icon)}"></i><span>${text}</span></div>` : '');
const _facts = (rows) => {
  const body = rows.filter(([, v]) => _has(v)).map(([k, v]) => `<div class="dgp__fact"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('');
  return body ? `<dl class="dgp__facts">${body}</dl>` : '';
};
const _foot = (text) => (text ? `<div class="dgp__foot">${text}</div>` : '');
const _img = (url, alt) => {
  const safe = _has(url) ? sanitizeUrl(String(url)) : '';
  return safe ? `<img class="dgp__img" src="${escAttr(safe)}" alt="${escAttr(alt || '')}" loading="lazy">` : '';
};
/** Dix points de fiabilité, comme une jauge discrète. */
const _dots = (n, max = 10) => `<span class="dgp__dots" aria-label="${n} sur ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('')}</span>`;
const _bars = (level, max = 5) => `<span class="dgp__bars" aria-label="niveau ${level} sur ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'is-on' : ''}"></i>`).join('')}</span>`;

/* ── Par source ─────────────────────────────────────────────────── */

const RENDERERS = {
  participer(p, layer, source) {
    return _img(p.photo_url, 'Photo du signalement')
      + _head({
        eyebrow: `Signalement${_has(p.reference) ? ` · ${esc(p.reference)}` : ' d\'un habitant'}`,
        title: esc(p.category_label || 'Signalement'),
        icon: p.category_icon || source.icon, tint: p.category_color || source.tint,
      })
      + _pills([_pill(p.statut_label, p.statut_color, { solid: true })])
      + _quote(p.description, { placeholder: 'Sans description.' })
      + _line('fa-solid fa-location-dot', esc(p.adresse))
      + _foot(`Signalé le ${esc(_date(p.created_at))}${_has(p.updated_at) && p.updated_at !== p.created_at ? ` · mis à jour le ${esc(_date(p.updated_at))}` : ''}`);
  },

  contributions(p, layer, source) {
    return _img(p.cover_url, p.project_name)
      + _head({ eyebrow: 'Projet publié sur votre carte', title: esc(p.project_name || 'Projet'), icon: source.icon, tint: source.tint })
      + _pills([_pill(p.category, source.tint)])
      + _foot('Module Carte · tel que le voient vos habitants');
  },

  travaux(p, layer, source) {
    const dates = _has(p.date_debut) || _has(p.date_fin)
      ? `${_has(p.date_debut) ? `du ${esc(_date(p.date_debut))}` : ''}${_has(p.date_fin) ? ` au ${esc(_date(p.date_fin))}` : ''}`.trim() : '';
    return _head({ eyebrow: 'Chantier', title: esc(p.project_name || 'Chantier'), icon: source.icon, tint: source.tint, sub: esc(p.nature_travaux) })
      + _pills([_pill(p.etat, source.tint, { solid: true })])
      + _line('fa-regular fa-calendar', esc(dates))
      + _quote(p.description)
      + _line('fa-solid fa-location-dot', esc([p.adresse, p.commune].filter(_has).join(', ')))
      + _foot(`Module Travaux${_has(p.last_update) ? ` · mis à jour le ${esc(_date(p.last_update))}` : ''}`);
  },

  fub(p, layer, source) {
    const edition = (layer.label.match(/\d{4}/) || [''])[0];
    const kindLabel = layer.label.split(' · ')[0];
    return _head({ eyebrow: `Baromètre vélo${edition ? ` ${edition}` : ''}`, title: esc(kindLabel), icon: source.icon, tint: safeColor(layer.style?.color, source.tint) })
      + _quote(p.description, { placeholder: 'Le cycliste n\'a pas laissé de commentaire : seul le lieu compte.' })
      + _foot('Contribution d\'un cycliste à l\'enquête nationale de la FUB · licence ODbL');
  },

  'osm-cycleways'(p, layer, source) {
    return _head({ eyebrow: 'Aménagement cyclable', title: esc(p.type || 'Aménagement'), icon: source.icon, tint: source.tint, sub: esc(p.nom) })
      + _pills([
        _pill(_yes(p.sens_unique) ? 'Sens unique' : 'Double sens', source.tint),
        _pill(_has(p.revetement) ? `Revêtement : ${p.revetement}` : '', '#64748B'),
      ])
      + _foot('OpenStreetMap, contributeurs · licence ODbL');
  },

  accidents(p) {
    const color = GRAVITE_COLORS[p.gravite] || '#64748B';
    const involved = [
      ['velo', 'Vélo'], ['pieton', 'Piéton'], ['trottinette', 'Trottinette'], ['deux_roues_motorise', 'Deux-roues motorisé'],
      ['voiture', 'Voiture'], ['poids_lourd', 'Poids lourd'], ['transport_en_commun', 'Transport en commun'],
    ].filter(([k]) => _yes(p[k])).map(([, label]) => _pill(label, color));
    const context = [p.lumiere, p.intersection, p.meteo && p.meteo !== 'Normale' ? p.meteo : '', _yes(p.agglomeration) ? 'En agglomération' : 'Hors agglomération']
      .filter(_has).join(' · ');
    return _head({ eyebrow: 'Accident corporel', title: esc(p.gravite || 'Accident'), icon: 'fa-solid fa-triangle-exclamation', tint: color, sub: `${esc(_date(p.date))}${_has(p.heure) ? ` à ${esc(p.heure)}` : ''}` })
      + _bigs([
        _big(_fmt(p.tues), p.tues > 1 ? 'tués' : 'tué', { muted: !p.tues }),
        _big(_fmt(p.blesses_hospitalises), p.blesses_hospitalises > 1 ? 'hospitalisés' : 'hospitalisé', { muted: !p.blesses_hospitalises }),
        _big(_fmt(p.blesses_legers), p.blesses_legers > 1 ? 'blessés légers' : 'blessé léger', { muted: !p.blesses_legers }),
      ])
      + _pills(involved)
      + _line('fa-solid fa-road', esc(context))
      + _line('fa-solid fa-location-dot', esc(p.adresse))
      + _foot(`${_fmt(p.usagers)} usager${p.usagers > 1 ? 's' : ''} impliqué${p.usagers > 1 ? 's' : ''} · fichier national BAAC, ONISR`);
  },

  comptages(p, layer, source) {
    return _head({ eyebrow: `Compteur${_has(p.type) ? ` · ${esc(p.type)}` : ''}`, title: esc(p.nom || 'Compteur'), icon: source.icon, tint: source.tint })
      + _bigs([
        _big(_fmt(p.moyenne_journaliere), 'passages par jour en moyenne'),
        _big(_fmt(p.hier), 'hier', { muted: !p.hier }),
      ])
      + _facts([
        ['Depuis la pose', _has(p.total_depuis_la_pose) ? `${_fmt(p.total_depuis_la_pose)} passages` : ''],
        ['Installé le', esc(_date(p.installe_le))],
        ['Relevé le', esc(_date(p.releve_le))],
      ])
      + _foot(`${esc(p.organisme || 'Gestionnaire du compteur')} · page publique Eco-Compteur`);
  },

  strava(p, layer, source) {
    const total = Number(p.total_trip_count) || 0;
    const fwd = Number(p.forward_trip_count) || 0;
    const rev = Number(p.reverse_trip_count) || 0;
    const kmh = (ms) => (_has(ms) ? `${_fmt(Number(ms) * 3.6, 1)} km/h` : '');
    const share = (part, all) => (all ? `${Math.round((Number(part) || 0) / all * 100)} %` : '');
    const ebike = Number(p.ebike_ride_count) || 0;
    const year = (layer.label.match(/\d{4}/) || [''])[0];
    return _head({ eyebrow: `Flux cyclistes Strava${year ? ` · ${year}` : ''}`, title: `${_fmt(total)} passages`, icon: source.icon, tint: source.tint, sub: 'sur l\'année, tous sens confondus' })
      + `<div class="dgp__dirs">
          <div class="dgp__dir"><div class="dgp__dir-h"><i class="fa-solid fa-arrow-right"></i> Un sens</div>
            <b>${_fmt(fwd)}</b>
            ${_facts([['Pendulaires', share(p.forward_commute_trip_count, fwd)], ['Vitesse', kmh(p.forward_average_speed_meters_per_second)]])}</div>
          <div class="dgp__dir"><div class="dgp__dir-h"><i class="fa-solid fa-arrow-left"></i> L'autre</div>
            <b>${_fmt(rev)}</b>
            ${_facts([['Pendulaires', share(p.reverse_commute_trip_count, rev)], ['Vitesse', kmh(p.reverse_average_speed_meters_per_second)]])}</div>
        </div>`
      + _pills([_pill(total ? `${share(ebike, total)} en vélo électrique` : '', source.tint)])
      + _foot('Strava Metro · échantillon des trajets enregistrés, pas un comptage exhaustif');
  },

  'waze-alerts'(p, layer, source) {
    const rel = Number(p.fiabilite);
    return _head({ eyebrow: `Alerte Waze · ${esc(_ago(p.signale_le) || '')}`, title: esc(p.precision || p.type || 'Alerte'), icon: source.icon, tint: source.tint, sub: _has(p.precision) ? esc(p.type) : '' })
      + _line('fa-solid fa-location-dot', esc([p.rue, p.commune].filter(_has).join(', ')))
      + _quote(p.description)
      + _facts([
        ['Fiabilité', isFinite(rel) ? `${_dots(Math.max(0, Math.min(10, Math.round(rel))))} <span class="dgp__muted">${rel}/10</span>` : ''],
        ['Confirmations', _has(p.confirmations) ? `${_fmt(p.confirmations)} conducteur${p.confirmations > 1 ? 's' : ''}` : ''],
      ])
      + _foot('Signalé par des conducteurs Waze · flux Waze for Cities de votre collectivité');
  },

  'waze-jams'(p) {
    const delay = Number(p.retard_s) || 0;
    const mins = Math.floor(delay / 60);
    const secs = delay % 60;
    const delayTxt = delay >= 60 ? `${mins} min${secs ? ` ${String(secs).padStart(2, '0')}` : ''}` : `${delay} s`;
    const level = Math.max(0, Math.min(5, Number(p.niveau) || 0));
    return _head({ eyebrow: `Ralentissement Waze · ${esc(_ago(p.signale_le) || '')}`, title: esc(p.rue || 'Ralentissement'), icon: 'fa-solid fa-car-burst', tint: '#DC2626', sub: esc(p.commune) })
      + _bigs([
        _big(delayTxt, 'de retard'),
        _big(_fmt(p.vitesse_kmh, 0), 'de vitesse', { unit: ' km/h' }),
        _big(_fmt(p.longueur_m), 'de bouchon', { unit: ' m' }),
      ])
      + _facts([['Intensité', `${_bars(level)} <span class="dgp__muted">${level}/5</span>`]])
      + _foot('Mesuré par Waze · flux Waze for Cities de votre collectivité');
  },
};

/** Présentation générique : le champ-titre, puis les champs choisis. */
function _generic(p, layer) {
  const popup = layer.popup || {};
  const title = _has(p[popup.title_field]) ? String(p[popup.title_field]) : layer.label;
  // Un nom de champ devient lisible : « releve_le » → « Releve le ».
  const pretty = (f) => { const t = String(f).replace(/[_-]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const rows = (popup.fields || []).filter((f) => f !== popup.title_field).map((f) => [pretty(f), esc(String(p[f] ?? '').slice(0, 300))]);
  const color = safeColor(layer.style?.color);
  return _head({ eyebrow: esc(_has(p[popup.title_field]) ? layer.label : (layerKind(layer) === 'reference' ? 'Donnée de référence' : 'Point')), title: esc(title.slice(0, 120)), icon: layerKind(layer) === 'reference' ? 'fa-solid fa-chart-simple' : 'fa-solid fa-comment-dots', tint: color })
    + _facts(rows)
    + _foot(layer.source_type === 'url' ? 'Couche synchronisée avec son lien' : 'Fichier importé');
}

/** Identité du rendu pour une couche : source du catalogue, et pour Waze la partie. */
function _rendererKey(layer) {
  const source = sourceOfLayer(layer);
  if (!source) return null;
  if (source.id === 'waze') return /part=jams/.test(String(layer.source_ref)) ? 'waze-jams' : 'waze-alerts';
  return source.id;
}

/**
 * HTML de la fenêtre au clic d'une entité.
 * @param {Object} layer - config de la couche
 * @param {Object} props - propriétés de l'entité (MapLibre les rend toutes en chaînes)
 */
export function renderPopup(layer, props) {
  const p = props || {};
  const key = _rendererKey(layer);
  const source = sourceOfLayer(layer);
  const inner = key && RENDERERS[key] ? RENDERERS[key](p, layer, source) : _generic(p, layer);
  return `<div class="dgp" data-source="${escAttr(key || 'generic')}">${inner}</div>`;
}
