// @ts-check
import { test, expect } from '@playwright/test';
import { _internals } from '../netlify/functions/demo-generate.mjs';

/**
 * Tunnel de démo : les gardes de demo-generate.
 *
 * 2 276 lignes non couvertes, le plus gros trou du dépôt, et c'est ce qui
 * convertit un prospect. La fonction parcourt des sites de mairie, des PDFs et
 * de la presse : ses gardes (URL publique uniquement, bornes géographiques,
 * type d'image réel) n'étaient atteignables qu'en lançant une génération
 * complète, donc jamais vérifiés.
 *
 * Aucun test ici n'appelle OpenAI ni ne parcourt le web.
 */

const {
  INSEE_RE, isSafePublicUrl, slugify, stripHtml, hostOf, communeHost, unaccentLower,
  bboxOfContour, geometryExtentKm, extentAcceptable, geometryInBbox,
  centroidOf, haversineM, typeImageReel, looksLikeCode, estPageTremplin,
  collectPageLinks, unescapeBoamp, odonymesDe, distinctiveWords, essaisNominatim,
  sansPrefixeGenerique, locationQueries, nomCoherent, rangStructurel, positionDansLaCommune,
} = _internals;

test.describe('0.64 - Démo : garde contre les requêtes vers le réseau interne', () => {

  test('0.64.1 - Une adresse publique en http(s) est acceptée', () => {
    for (const u of [
      'https://www.villeurbanne.fr/projets',
      'http://mairie-exemple.fr/',
      'https://exemple.fr:8443/x.pdf',
      'https://8.8.8.8/',
    ]) {
      expect(isSafePublicUrl(u), u).toBe(true);
    }
  });

  test('0.64.2 - Les plages privées et de bouclage sont refusées', () => {
    for (const u of [
      'http://localhost/', 'http://LOCALHOST/', 'http://127.0.0.1/', 'http://127.1/',
      'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://172.31.255.255/',
      'http://100.64.0.1/', 'http://0.0.0.0/',
      'http://intranet.local/', 'http://service.internal/',
      'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
    ]) {
      expect(isSafePublicUrl(u), u).toBe(false);
    }
  });

  test("0.64.3 - L'adresse de métadonnées des hébergeurs est refusée", () => {
    // 169.254.169.254 sert les identifiants de l'instance chez tous les clouds.
    for (const u of ['http://169.254.169.254/latest/meta-data/', 'http://metadata.google.internal/']) {
      expect(isSafePublicUrl(u), u).toBe(false);
    }
  });

  test('0.64.4 - RÉGRESSION : un point final ne contourne pas le filtre', () => {
    // `localhost.` résout comme `localhost` en DNS : sans le point optionnel
    // dans le motif, chaque nom d'hôte interdit se contournait par un point.
    for (const u of ['http://localhost./', 'http://intranet.local./', 'http://service.internal./']) {
      expect(isSafePublicUrl(u), u).toBe(false);
    }
  });

  test("0.64.5 - Les écritures numériques d'une IP sont normalisées avant filtrage", () => {
    // 2130706433 et 0x7f000001 valent 127.0.0.1 : le parseur d'URL les
    // canonise, le filtre s'applique donc à la forme décimale pointée.
    for (const u of ['http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/']) {
      expect(isSafePublicUrl(u), u).toBe(false);
    }
  });

  test('0.64.6 - Tout schéma autre que http(s) est refusé', () => {
    for (const u of [
      'file:///etc/passwd', 'ftp://exemple.fr/', 'gopher://exemple.fr/',
      'data:text/html,<script>', 'javascript:alert(1)', 'about:blank',
      '', null, undefined, 'pas une url', '//exemple.fr/',
    ]) {
      expect(isSafePublicUrl(u), String(u)).toBe(false);
    }
  });

});

test.describe('0.65 - Démo : bornes géographiques', () => {

  const carre = (minLng, minLat, maxLng, maxLat) => ({
    type: 'Polygon',
    coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
  });

  test('0.65.1 - bboxOfContour encadre tous les points avec une marge', () => {
    const b = bboxOfContour(carre(4.8, 45.7, 4.9, 45.8));
    // 15 % de marge de part et d'autre : l'emprise déborde du contour
    expect(b.minLng).toBeLessThan(4.8);
    expect(b.maxLng).toBeGreaterThan(4.9);
    expect(b.minLat).toBeLessThan(45.7);
    expect(b.maxLat).toBeGreaterThan(45.8);
    expect(b.maxLng - b.minLng).toBeCloseTo(0.1 * 1.3, 4);
    expect(bboxOfContour({ coordinates: [] })).toBeNull();
    expect(bboxOfContour(null)).toBeNull();
  });

  test('0.65.2 - geometryExtentKm mesure en kilomètres', () => {
    // Un degré de latitude vaut environ 111 km, partout.
    const e = geometryExtentKm(carre(4.8, 45.0, 4.8, 46.0));
    expect(e.h).toBeGreaterThan(105);
    expect(e.h).toBeLessThan(115);
    expect(e.w).toBeCloseTo(0, 1);
  });

  test('0.65.3 - Une géométrie démesurée est écartée', () => {
    // Un projet urbain ne traverse pas la moitié de la France : une géométrie
    // aberrante mise sur la carte de démo ruinerait la démonstration.
    expect(extentAcceptable(carre(4.8, 45.75, 4.81, 45.76), null)).toBe(true);
    expect(extentAcceptable(carre(-5, 42, 8, 51), null)).toBe(false);
  });

  test('0.65.4 - Une géométrie qui couvre presque toute la commune est écartée', () => {
    const commune = { minLng: 4.80, minLat: 45.70, maxLng: 4.90, maxLat: 45.80 };
    const petit = carre(4.82, 45.72, 4.83, 45.73);
    const enorme = carre(4.801, 45.701, 4.899, 45.799);
    expect(extentAcceptable(petit, commune)).toBe(true);
    expect(extentAcceptable(enorme, commune)).toBe(false);
  });

  test('0.65.5 - Un point hors de la commune est rejeté', () => {
    const commune = { minLng: 4.80, minLat: 45.70, maxLng: 4.90, maxLat: 45.80 };
    expect(geometryInBbox(carre(4.82, 45.72, 4.83, 45.73), commune)).toBe(true);
    expect(geometryInBbox(carre(4.82, 45.72, 5.50, 45.73), commune)).toBe(false);
    // Sans emprise connue, on ne rejette rien
    expect(geometryInBbox(carre(0, 0, 1, 1), null)).toBe(true);
  });

  test("0.65.6 - centroidOf tombe à l'intérieur de la géométrie", () => {
    // Moyenne des sommets, pas centre de masse : sur un anneau fermé le premier
    // point compte deux fois, ce qui décale légèrement le résultat. La garantie
    // utile est que le point reste dans l'emprise, jamais qu'il soit exact.
    const c = centroidOf(carre(4.0, 45.0, 6.0, 47.0));
    expect(c.lng).toBeGreaterThan(4.0);
    expect(c.lng).toBeLessThan(6.0);
    expect(c.lat).toBeGreaterThan(45.0);
    expect(c.lat).toBeLessThan(47.0);

    // Sur un anneau ouvert, aucun sommet n'est compté deux fois : la moyenne
    // tombe alors exactement au centre.
    const ouvert = centroidOf({ type: 'Polygon', coordinates: [[[4, 45], [6, 45], [6, 47], [4, 47]]] });
    expect(ouvert.lng).toBeCloseTo(5.0, 6);
    expect(ouvert.lat).toBeCloseTo(46.0, 6);
  });

  test('0.65.7 - haversineM mesure une distance connue', () => {
    // Lyon Part-Dieu → Bellecour : environ 2 km
    const d = haversineM({ lng: 4.8592, lat: 45.7605 }, { lng: 4.8320, lat: 45.7578 });
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(3000);
    expect(haversineM({ lng: 4.85, lat: 45.75 }, { lng: 4.85, lat: 45.75 })).toBeCloseTo(0, 3);
  });

});

test.describe("0.66 - Démo : reconnaissance du type d'image", () => {

  const buf = (...octets) => new Uint8Array([...octets, ...Array.from({ length: 64 }, () => 0)]).buffer;

  test('0.66.1 - Les formats binaires sont reconnus à leurs octets de tête', () => {
    expect(typeImageReel(buf(0x89, 0x50, 0x4e, 0x47))).toEqual({ ext: 'png', ct: 'image/png' });
    expect(typeImageReel(buf(0xff, 0xd8, 0xff))).toEqual({ ext: 'jpg', ct: 'image/jpeg' });
    expect(typeImageReel(buf(0x47, 0x49, 0x46, 0x38))).toEqual({ ext: 'gif', ct: 'image/gif' });
    expect(typeImageReel(buf(0x00, 0x00, 0x01, 0x00))).toEqual({ ext: 'ico', ct: 'image/x-icon' });
  });

  test('0.66.2 - Le WebP exige la signature complète, pas seulement RIFF', () => {
    const webp = new Uint8Array(64);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(typeImageReel(webp.buffer)).toEqual({ ext: 'webp', ct: 'image/webp' });
    // RIFF seul (un WAV par exemple) n'est pas une image
    expect(typeImageReel(buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41))).toBeNull();
  });

  test('0.66.3 - Le SVG est reconnu malgré un BOM ou des espaces', () => {
    const texte = (s) => new TextEncoder().encode(s).buffer;
    expect(typeImageReel(texte('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))?.ext).toBe('svg');
    expect(typeImageReel(texte('   \n<?xml version="1.0"?><svg/>'))?.ext).toBe('svg');
    expect(typeImageReel(texte('﻿<svg/>'))?.ext).toBe('svg');
  });

  test("0.66.4 - RÉGRESSION : un fichier qui n'est pas une image est refusé", () => {
    // Le type déclaré par le serveur ne fait pas foi : c'est le contenu qui
    // décide. Sans cela une page HTML se retrouverait posée en couverture.
    const texte = (s) => new TextEncoder().encode(s).buffer;
    expect(typeImageReel(texte('<!doctype html><html><body>hop</body></html>'))).toBeNull();
    expect(typeImageReel(texte('%PDF-1.4'))).toBeNull();
    expect(typeImageReel(texte('MZ '))).toBeNull();
    expect(typeImageReel(new Uint8Array(0).buffer)).toBeNull();
  });

});

test.describe('0.67 - Démo : tri du contenu récolté', () => {

  test('0.67.1 - stripHtml rend du texte lisible', () => {
    const out = stripHtml('<div><h1>Titre</h1><p>Un <b>projet</b> majeur.</p><script>var x=1</script></div>');
    expect(out).toContain('Titre');
    expect(out).toContain('projet');
    expect(out).not.toContain('<');
    expect(out).not.toContain('var x=1');
  });

  test('0.67.2 - looksLikeCode écarte le JavaScript aspiré avec la page', () => {
    const prose = 'Le projet de requalification de la place centrale. '.repeat(10);
    const code = 'function a(){const x={y:1};if(x.y>0){return x;}}'.repeat(10);
    expect(looksLikeCode(prose)).toBe(false);
    expect(looksLikeCode(code)).toBe(true);
    // Trop court pour trancher : on ne jette pas
    expect(looksLikeCode('const x = 1;')).toBe(false);
    expect(looksLikeCode('')).toBe(false);
  });

  test('0.67.3 - estPageTremplin repère une page de redirection sans contenu', () => {
    const vraiContenu = `<html><main><article>${'du contenu réel. '.repeat(100)}</article></main></html>`;
    expect(estPageTremplin(vraiContenu)).toBe(false);
    expect(estPageTremplin('')).toBe(false);
  });

  test("0.67.4 - RÉGRESSION Conflans : la collecte de liens ne juge plus par mot-clé", () => {
    // Le tri par vocabulaire (« projet », « travaux »...) plus un barème de
    // pénalités écartait « Les pistes de padel débarquent en ville », seule
    // page qui donnait le lieu de l'opération. Le choix revient désormais à un
    // appel IA : la collecte, elle, ne doit plus rien filtrer.
    const html = `
      <a href="/actualites/les-pistes-de-padel-debarquent-en-ville/">Les pistes de padel débarquent en ville</a>
      <a href="/grands-projets/">Les grands projets</a>
      <a href="/demarches/etat-civil">État civil</a>
      <a href="/doc.pdf">Rapport annuel</a>
      <a href="https://autre-site.fr/x">Ailleurs</a>
      <a href="/x">.</a>`;
    const out = [];
    collectPageLinks(html, 'https://ville.fr/', 'ville.fr', out);
    const urls = out.map((l) => l.url);

    // La page de l'actualité est collectée au même titre que les autres
    expect(urls).toContain('https://ville.fr/actualites/les-pistes-de-padel-debarquent-en-ville/');
    expect(urls).toContain('https://ville.fr/grands-projets/');
    // Une page de service reste collectée : c'est l'IA qui tranchera, pas une liste
    expect(urls).toContain('https://ville.fr/demarches/etat-civil');
    // Les seules exclusions restent structurelles
    expect(urls.some((u) => u.endsWith('.pdf'))).toBe(false);
    expect(urls.some((u) => u.includes('autre-site.fr'))).toBe(false);
    expect(urls).not.toContain('https://ville.fr/x');
  });

  test('0.67.4b - collectPageLinks dédoublonne et respecte les liens déjà connus', () => {
    const html = `
      <a href="/a">Page A</a><a href="/a">Page A bis</a><a href="/b">Page B</a>`;
    const out = [];
    collectPageLinks(html, 'https://ville.fr/', 'ville.fr', out, [{ url: 'https://ville.fr/b' }]);
    expect(out.map((l) => l.url)).toEqual(['https://ville.fr/a']);
  });

  test('0.67.5 - unescapeBoamp désencode le double échappement des annonces', () => {
    expect(unescapeBoamp('&amp;lt;p&amp;gt;Travaux de voirie&amp;lt;/p&amp;gt;')).toBe('Travaux de voirie');
    expect(unescapeBoamp('<p>Rue   Garibaldi</p>')).toBe('Rue Garibaldi');
    expect(unescapeBoamp('')).toBe('');
    expect(unescapeBoamp(null)).toBe('');
  });

  test('0.67.6 - odonymesDe relève au plus quatre lieux, sans doublon', () => {
    const out = odonymesDe('Travaux avenue Jean Jaures, rue de la Republique, boulevard des Belges et place Bellecour.');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(4);
    // Une VOIE n'est relevée que sous sa forme complète : « de Verdun » seul
    // est inexploitable, là où « montée de Verdun » désigne une voie précise.
    for (const v of out) expect(v).toMatch(/^(avenue|rue|boulevard|place) /);
    expect(new Set(out).size).toBe(out.length);
    expect(odonymesDe('')).toEqual([]);
  });

  test("0.67.6b - RÉGRESSION Conflans : un équipement nommé est relevé comme un lieu", () => {
    // La mairie de Conflans écrivait le lieu en toutes lettres dans son
    // actualité. Le motif ne connaissait que les types de VOIE, donc « stade
    // Claude-Fichot » n'était jamais relevé, et la seule formulation restante
    // était le titre « pistes de padel ». Punaise posée à 1 km du vrai site.
    const phrase = 'Aménagement de 3 pistes de padel en plein air au stade Claude-Fichot, derrière les courts de tennis couverts.';
    const lieux = odonymesDe(phrase);
    expect(lieux).toContain('stade Claude-Fichot');

    /* Et le NOM PROPRE SEUL, en second. La commune et OpenStreetMap ne
       s'accordent pas sur le mot générique : Conflans écrit « stade
       Claude-Fichot », OSM enregistre « Complexe Sportif Claude Fichot ».
       Mesuré sur l'annuaire réel : la forme complète ne rend RIEN, le nom
       propre seul rend l'équipement au premier rang. Sans cette seconde forme,
       le projet reste sans emplacement malgré une source parfaitement claire. */
    expect(lieux).toContain('Claude-Fichot');
    expect(lieux.indexOf('stade Claude-Fichot')).toBeLessThan(lieux.indexOf('Claude-Fichot'));

    // Les autres familles d'équipements municipaux, même motif
    expect(odonymesDe('Réhabilitation du groupe scolaire Jean Moulin.')).toEqual(
      expect.arrayContaining(['groupe scolaire Jean Moulin', 'Jean Moulin'])
    );
    expect(odonymesDe('Le théâtre Simone Signoret entame sa rénovation.')).toEqual(
      expect.arrayContaining(['théâtre Simone Signoret', 'Simone Signoret'])
    );

    // Le garde-fou de casse tient toujours : sans majuscule, ce n'est pas un nom
    expect(odonymesDe('Le stade est une place importante pour la commune.')).toEqual([]);
  });

  test("0.67.4d - RÉGRESSION Gex : une position d'annuaire hors commune est écartée", () => {
    /* L'annuaire officiel de l'État donne pour « Mairie - Gex » (01173) le bon
       libellé, « 77 rue de l'Horloge, 01170, Gex », et les coordonnées
       45.696793 / 4.885262, qui sont celles de la mairie de VÉNISSIEUX, à
       300 km. Le radar de l'écran partait donc à l'autre bout de la France
       devant le prospect. La donnée fausse vient de la source, pas du code :
       le contour officiel de la commune est le seul juge disponible. */
    const bboxGex = { minLng: 5.98, minLat: 46.30, maxLng: 6.12, maxLat: 46.40 };
    const annuaire = { lat: 45.696793, lng: 4.885262, libelle: "77 rue de l'Horloge, 01170, Gex" };
    expect(positionDansLaCommune(annuaire, bboxGex)).toBe(false);

    // Une position réellement dans la commune passe
    expect(positionDansLaCommune({ lat: 46.3515, lng: 6.0488 }, bboxGex)).toBe(true);
    // Sans contour connu, on ne rejette rien : il n'y a rien à opposer
    expect(positionDansLaCommune(annuaire, null)).toBe(true);
    expect(positionDansLaCommune(null, bboxGex)).toBe(false);
  });

  test("0.67.4c - Le repli sans IA classe par forme, jamais par vocabulaire", () => {
    /* Quand le modèle n'est pas joignable, l'ordre du document ouvrait le menu :
       « Annuaires » en tête (mesuré en local, où Netlify Dev refuse d'injecter
       la clé). Une page de contenu a un chemin plus profond et un intitulé
       rédigé qu'une rubrique de premier niveau. Aucun mot n'est jugé. */
    const menu = { url: 'https://ville.fr/annuaires/', label: 'Annuaires' };
    const contenu = { url: 'https://ville.fr/ma-ville/grands-projets/paul-brard/', label: 'En savoir plus' };
    expect(rangStructurel(contenu)).toBeGreaterThan(rangStructurel(menu));

    // Un intitulé rédigé départage deux pages de même profondeur
    const court = { url: 'https://ville.fr/a/b/', label: 'Voir' };
    const redige = { url: 'https://ville.fr/a/c/', label: 'Les pistes de padel débarquent en ville' };
    expect(rangStructurel(redige)).toBeGreaterThan(rangStructurel(court));

    // Une adresse invalide ne fait pas tomber le calcul
    expect(Number.isFinite(rangStructurel({ url: 'pas une url', label: '' }))).toBe(true);
  });

  test('0.67.6g - RÉGRESSION Conflans : le lieu trouvé doit porter un mot du lieu cherché', () => {
    /* Seul contrôle de PERTINENCE de la chaîne : les trois garde-fous
       existants ne testent que la géographie du résultat. Les dix paires
       ci-dessous sont des mesures réelles sur Conflans, les trois dernières
       étant les punaises fausses que ce test doit désormais empêcher. */
    for (const [cherche, trouve] of [
      ['Groupe scolaire Paul Bert', 'École élémentaire Paul Bert Rue Paul Bert'],
      ['Théâtre Simone-Signoret', 'Théâtre Simone Signoret Place Auguste Romagné'],
      ['Rue Maurice-Berteaux', '47 Rue Maurice Berteaux Vieux Conflans'],
      ['Déchèterie de Conflans-Sainte-Honorine', 'Déchèterie communale de Conflans-Sainte-Honorine'],
      ['Place de la Liberté, Chennevières', '9 Place de la Liberté Chennevières'],
      ['Paul-Brard', '1 Avenue Paul Brard Cité Paul Brard'],
      ['Claude-Fichot', 'Complexe Sportif Claude Fichot Chemin des Grandes Terres'],
    ]) {
      expect(nomCoherent(cherche, trouve), `${cherche} <-> ${trouve}`).toBe(true);
    }
    for (const [cherche, trouve] of [
      // Un arrêt de bus rendu pour « Hôtel de Ville » : « ville » et « centre »
      // sont du vocabulaire d'aménagement, ils ne font pas correspondance.
      ['Hôtel de Ville', 'Centre Ville - Jean Jaurès Avenue Jean Jaurès'],
      ['Secteur Paul-Brard', 'Gymnase Pierre Ruquet N 184 Les Roches'],
      ['Quartier Paul-Brard', '20B Quai de Gaillon Plateau du Moulin'],
    ]) {
      expect(nomCoherent(cherche, trouve), `${cherche} <-> ${trouve}`).toBe(false);
    }

    // Une requête sans aucun mot distinctif ne peut rien départager : on ne
    // rejette pas, un refus serait arbitraire.
    expect(nomCoherent('travaux', "n'importe quoi")).toBe(true);
    expect(nomCoherent('', 'Gymnase Pierre Ruquet')).toBe(true);
  });

  test("0.67.6h - RÉGRESSION Gex : une formulation sans mot distinctif n'est jamais géocodée", () => {
    /* Le nettoyage de l'adresse d'un avis de marché retire le nom de la commune,
       et transformait « Ville de Gex » en « Ville de ». Partie en requête de
       rang 0, elle posait le camping Les Genêts sur l'école de musique. Un
       annuaire interrogé sans nom de lieu répond toujours quelque chose. */
    const qs = locationQueries({
      title: 'Réaménagement du bloc sanitaire du camping Les Genêts',
      address: 'Ville de',
      geo_query: 'Camping Les Genêts',
      place: 'Camping Les Genêts',
      source_excerpt: '',
    });
    expect(qs).not.toContain('Ville de');
    expect(qs[0]).toBe('Camping Les Genêts');

    // Un projet dont aucune formulation ne porte de lieu n'a plus de requête du
    // tout : il sera écarté de la carte, ce qui est le résultat honnête.
    expect(locationQueries({
      title: 'Travaux', address: 'la ville', geo_query: '', place: '', source_excerpt: '',
    })).toEqual([]);
  });

  test('0.67.6e - RÉGRESSION Conflans : le mot générique est retiré des requêtes', () => {
    // Mesuré sur l'annuaire réel : « Quartier Paul-Brard » et « Secteur
    // Paul-Brard » rendent ZÉRO résultat, « Paul-Brard » rend « Cité Paul
    // Brard » au premier rang. Le mot générique vient de l'IA elle-même.
    expect(sansPrefixeGenerique('Quartier Paul-Brard')).toBe('Paul-Brard');
    expect(sansPrefixeGenerique('Secteur Paul-Brard')).toBe('Paul-Brard');
    expect(sansPrefixeGenerique('Stade Claude-Fichot')).toBe('Claude-Fichot');

    // Jamais sur une VOIE : « Maurice-Berteaux » seul est plus ambigu que la
    // rue entière, et la BAN géocode parfaitement la forme complète.
    expect(sansPrefixeGenerique('Rue Maurice-Berteaux')).toBe('');
    expect(sansPrefixeGenerique('Place du Général-Leclerc')).toBe('');
    // Rien à retirer, rien à ajouter
    expect(sansPrefixeGenerique('Paul-Brard')).toBe('');
    expect(sansPrefixeGenerique('')).toBe('');
  });

  test('0.67.6f - RÉGRESSION : une mention incidente du texte ne sert jamais de lieu', () => {
    /* Deux mesures, deux communes, même cause. À Conflans, le gymnase Pierre
       Ruquet, simplement CITÉ dans un avis de marché, servait d'emplacement à
       la requalification du secteur Paul-Brard, à 2 km. À Gex, la place
       Gambetta, citée pour un autre chantier de la même page, servait
       d'emplacement au boulodrome Perdtemps.

       Quand l'IA a nommé un lieu, sa désignation fait foi : on ne se rabat
       jamais sur un nom lu ailleurs dans la page. */
    const qs = locationQueries({
      title: 'Réhabilitation des espaces publics du secteur Paul-Brard',
      address: '',
      geo_query: 'Secteur Paul-Brard',
      place: 'Secteur Paul-Brard',
      source_excerpt: 'REQUALIFICATION DES ESPACES PUBLICS DU SECTEUR PAUL BRARD. Le gymnase Pierre Ruquet reste ouvert.',
    });
    expect(qs[0]).toBe('Secteur Paul-Brard');
    expect(qs[1]).toBe('Paul-Brard');
    expect(qs).not.toContain('gymnase Pierre Ruquet');

    // Le boulodrome de Gex : la place Gambetta de la même page ne doit pas servir
    const gex = locationQueries({
      title: 'Travaux au boulodrome Perdtemps',
      address: '',
      geo_query: 'Boulodrome Perdtemps',
      place: 'Boulodrome Perdtemps',
      source_excerpt: 'La Ville a entamé la restauration de la barrière située place Gambetta.',
    });
    expect(gex).not.toContain('place Gambetta');

    /* En revanche, quand l'IA ne nomme AUCUN lieu, le texte reste la seule
       matière disponible : c'est ainsi que « stade Claude-Fichot » a été
       retrouvé pour les pistes de padel de Conflans. */
    const sansChamp = locationQueries({
      title: 'Construction des pistes de padel',
      address: '', geo_query: '', place: '',
      source_excerpt: 'aménagement de 3 pistes de padel au stade Claude-Fichot, derrière les courts de tennis.',
    });
    expect(sansChamp).toContain('stade Claude-Fichot');
    expect(sansChamp).toContain('Claude-Fichot');

    // Une adresse postale relevée dans la source reste prioritaire sur tout
    const avecAdresse = locationQueries({
      title: 'Requalification de la rue Maurice-Berteaux',
      address: 'Rue Maurice Berteaux',
      geo_query: 'Rue Maurice-Berteaux',
      place: '',
      source_excerpt: '',
    });
    expect(avecAdresse[0]).toBe('Rue Maurice Berteaux');
  });

  test("0.67.6d - RÉGRESSION Conflans : l'étage Nominatim tente deux formulations", () => {
    // Il n'en tentait qu'une, et c'est la forme complète qui arrive en premier.
    // Les essais sont ordonnés par RANG, pas par projet : chaque projet tente
    // sa meilleure formulation avant qu'aucun n'en tente une seconde, pour
    // qu'un budget de tranche épuisé ne prive personne de son premier essai.
    expect(essaisNominatim([['a', 'b', 'c'], ['x'], []])).toEqual([[0, 0], [1, 0], [0, 1]]);
    expect(essaisNominatim([])).toEqual([]);
  });

  test('0.67.7 - distinctiveWords écarte les mots vides', () => {
    const out = distinctiveWords('Le projet de la place de la Republique');
    expect(out.join(' ').toLowerCase()).not.toMatch(/\bde\b|\bla\b|\ble\b/);
    expect(out.length).toBeGreaterThan(0);
  });

  test("0.67.8 - hostOf et communeHost dégradent proprement", () => {
    expect(hostOf('https://www.villeurbanne.fr/x')).toContain('villeurbanne.fr');
    expect(communeHost('https://www.villeurbanne.fr/x')).toContain('villeurbanne.fr');
    // Une URL illisible ne doit pas faire échouer un affichage
    expect(communeHost('pas une url')).toBe('la mairie');
    expect(typeof hostOf('')).toBe('string');
  });

  test('0.67.9 - unaccentLower normalise pour la comparaison', () => {
    expect(unaccentLower('Vaulx-en-Velin')).toBe('vaulx-en-velin');
    expect(unaccentLower('SAINT-ÉTIENNE')).toBe('saint-etienne');
    expect(unaccentLower('Bourg-lès-Valence')).toBe('bourg-les-valence');
    expect(unaccentLower(null)).toBe('');
  });

  test('0.67.10 - slugify produit un identifiant utilisable en URL', () => {
    expect(slugify('Place de la République')).toMatch(/^[a-z0-9-]+$/);
    expect(slugify('Réaménagement du Sacré-Cœur')).toMatch(/^[a-z0-9-]+$/);
    expect(slugify('   ')).toBe('');
    expect(slugify(null)).toBe('');
  });

});

test.describe("0.68 - Démo : validation des paramètres de l'endpoint", () => {

  test('0.68.1 - Un code INSEE hors format est refusé', async ({ request }) => {
    for (const c of ['', 'ABCDE', '123', '1234567', 'lyon', '<script>']) {
      const res = await request.get(`/api/demo-generate?phase=analyse&commune=${encodeURIComponent(c)}`);
      expect(res.status(), c).toBe(400);
    }
  });

  test('0.68.2 - RÉGRESSION : les codes corses passent le motif INSEE', () => {
    // La lettre est en DEUXIÈME position (2A004, 2B033) : l'ancien motif
    // \d{2}[0-9AB]\d{2} refusait les 360 communes de Corse. Vérifié sur le
    // motif et non par requête : un code valide lancerait une vraie génération.
    for (const c of ['2A004', '2B033', '69123', '01053', '97401']) {
      expect(INSEE_RE.test(c), c).toBe(true);
    }
    for (const c of ['', 'ABCDE', '123', '1234567', '2C004', 'A2004', '69-123']) {
      expect(INSEE_RE.test(c), c).toBe(false);
    }
  });

  test('0.68.3 - Une ville hors format est refusée sur les autres phases', async ({ request }) => {
    // Uniquement des cas refusés : un paramètre valide lancerait une génération.
    for (const v of ['', 'lyon', 'essai-LYON', 'essai-lyon/../x', '<script>']) {
      const res = await request.get(`/api/demo-generate?phase=carte&ville=${encodeURIComponent(v)}`);
      expect(res.status(), v).toBe(400);
    }
  });

});
