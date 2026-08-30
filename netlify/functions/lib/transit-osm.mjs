// Réseau de transport en commun d'une zone, construit depuis OpenStreetMap
// (service Overpass). Produit un GeoJSON avec UNE entité par ligne (métro A,
// T1, C3...), la couleur officielle portée par chaque tracé : `_color` est lue
// nativement par la carte (expression pilotée par la donnée du shim MapLibre),
// aucune table de correspondance côté client.
//
// Règles issues de la mise au point sur Villeurbanne :
// - seules les lignes qui portent leur couleur officielle sont retenues :
//   c'est le réseau de marque, celui qu'un habitant reconnaît ; les navettes
//   scolaires et variantes sans identité brouillaient la carte en confettis
// - une rue n'est comptée qu'une fois par ligne (deux sens et troncs communs
//   se superposaient en traits saturés), mais chaque ligne garde son tracé
//   complet, y compris hors de la commune
// - la géométrie découpée par Overpass met `null` sur les sommets hors zone :
//   la ligne est coupée à chaque trou plutôt que reliée par un trait fantôme

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/* TRANSPORT LOURD uniquement : métro, tramway, funiculaire. Les réseaux de
   bus complets ont été essayés et retirés : sur une ville dense, des dizaines
   de lignes de bus recouvrent la carte au point d'étouffer les projets, qui
   restent les vedettes de l'espace. Le rail, lui, se reconnaît d'un coup
   d'œil, pèse quelques centaines de Ko, et reste lisible en fond de carte. */
const ROUTES_RE = '^(tram|subway|funicular)$';

export const zoneParInsee = (insee) => `area["ref:INSEE"="${insee}"]["boundary"="administrative"]`;
export const zoneParNom = (nom) => `area["name"="${nom}"]["boundary"="administrative"]`;

// Le délai annoncé au serveur suit celui de l'appel : un serveur qui
// travaille encore quand le client a déjà raccroché ne sert à personne
function enteteRequete(timeoutMs) {
  return `[out:json][timeout:${Math.max(10, Math.ceil(timeoutMs / 1000) - 2)}];`;
}

async function requeteOverpass(requete, timeoutMs, tours) {
  const body = 'data=' + encodeURIComponent(requete);
  let derniereErreur = null;
  // Jusqu'à deux tours espacés sur chaque miroir : le service public sature
  // par vagues courtes, une reprise à quelques secondes passe souvent. En
  // pleine génération d'espace, un seul tour : le budget de l'invocation prime.
  const essais = Array.from({ length: Math.max(1, tours) }, () => OVERPASS_ENDPOINTS).flat();
  for (const endpoint of essais) {
    if (derniereErreur) await new Promise((r) => setTimeout(r, 4000));
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // La politique d'usage d'Overpass exige un client identifié : sans
          // cet en-tête, le service répond 406 (l'agent par défaut de Node)
          'User-Agent': 'OpenProjets/1.0 (+https://openprojets.com)',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`overpass ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data.elements)) throw new Error('réponse overpass sans éléments');
      return data;
    } catch (e) {
      derniereErreur = e;
    }
  }
  throw derniereErreur || new Error('overpass injoignable');
}

/* Interroge Overpass avec bascule de miroir : le service public refuse ou
   sature par moments, et un échec ici ne doit jamais faire échouer la
   création d'un espace (la couche réseau est un bonus, pas un prérequis). */
export async function chargerReseau(filtreZone, { timeoutMs = 25000, tours = 2 } = {}) {
  return requeteOverpass(
    `${enteteRequete(timeoutMs)}${filtreZone}->.zone;relation["route"~"${ROUTES_RE}"](area.zone);out geom;`,
    timeoutMs,
    tours
  );
}

const COULEUR_RE = /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$/i;
// ~1 m de précision : largement assez pour un tracé de ligne, et le fichier
// d'une métropole y perd un bon tiers de son poids
const arrondi = (n) => Math.round(n * 1e5) / 1e5;

const PREFIXE_MODE = {
  subway: 'Métro',
  tram: 'Tramway',
  funicular: 'Funiculaire',
  trolleybus: 'Bus',
  bus: 'Bus',
};

export function reseauEnGeojson(data) {
  const lignes = new Map();
  for (const rel of data.elements || []) {
    const tags = rel.tags || {};
    const colour = String(tags.colour || '').trim();
    if (!COULEUR_RE.test(colour)) continue;
    const ref = tags.ref || tags.name || String(rel.id);
    // Le réseau fait partie de la clé : la ligne « 1 » du réseau urbain et la
    // « 1 » des cars régionaux sont deux lignes, pas une
    const cle = `${tags.network || tags.operator || ''}|${ref}`;
    let ligne = lignes.get(cle);
    if (!ligne) {
      const route = tags.route || 'bus';
      ligne = {
        ref,
        colour,
        mode: route === 'subway' || route === 'tram' || route === 'funicular' ? 'rail' : 'road',
        nom: `${PREFIXE_MODE[route] || 'Bus'} ${ref}`,
        vues: new Set(),
        multi: [],
      };
      lignes.set(cle, ligne);
    }
    for (const m of rel.members || []) {
      if (m.type !== 'way' || !m.geometry || m.geometry.length < 2 || ligne.vues.has(m.ref)) continue;
      ligne.vues.add(m.ref);
      let cur = [];
      const flush = () => { if (cur.length > 1) ligne.multi.push(cur); cur = []; };
      for (const p of m.geometry) {
        if (p && Number.isFinite(p.lon)) cur.push([arrondi(p.lon), arrondi(p.lat)]);
        else flush();
      }
      flush();
    }
  }
  const features = [...lignes.values()]
    .filter((l) => l.multi.length)
    // Le rail en dernier : dessiné au-dessus des bus sur la carte
    .sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'rail' ? 1 : -1))
    .map((l) => ({
      type: 'Feature',
      properties: { name: l.nom, ref: l.ref, mode: l.mode, colour: l.colour, _color: l.colour },
      geometry: { type: 'MultiLineString', coordinates: l.multi },
    }));
  return { type: 'FeatureCollection', features };
}

// Style de la couche : opacité contenue, le réseau est un fond de contexte
// sous les projets, pas le sujet de la carte. La couleur de repli ne sert
// que si un tracé n'avait pas de couleur, ce que le filtre ci-dessus empêche.
// Partagé entre la génération et la reprise des villes.
export const STYLE_COUCHE_TRANSPORTS = { color: '#2563EB', weight: 3, opacity: 0.55, fill: false };
export const NOM_COUCHE_TRANSPORTS = 'transports';
export const CATEGORIE_TRANSPORTS = {
  category: 'transports en commun',
  icon_class: 'fa-solid fa-bus',
  layers_to_display: [NOM_COUCHE_TRANSPORTS],
  category_styles: { color: '#0EA5E9' },
};
