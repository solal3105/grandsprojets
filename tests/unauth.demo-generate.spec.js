// @ts-check
import { test, expect } from '@playwright/test';
import { _internals } from '../netlify/functions/demo-generate.mjs';
import { promptArticle, retirerLesLiens, sourcesDesAnnotations, blocSources } from '../netlify/functions/lib/redaction.mjs';
import {
  normaliserUrl, estUnePageExplorable, FileExploration,
  empreinteGabarit, retirerGabaritConnu, rapprochement, regrouper, fondre,
} from '../netlify/functions/lib/demo-exploration.mjs';

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
  inChunks, lireFluxBorne, lireJson, corpsJson, MAIRIE_BUDGET_MS,
  sansPrefixeGenerique, locationQueries, nomCoherent, positionDansLaCommune,
  migrerEtatGeo, METHOD_LABELS, communeDuResultat,
  CARTE_COURTE, deLaCommune, messageSansProjet, messageCarteCourte,
  arbitrerMarches, domainesAutorises, featuresDuProjet, tailleMinimaleVisible, nomDistinctifEpci,
  vueAerienneUrl, coverKey, oublierLesEchecs,
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

  test("0.67.14 - RÉGRESSION : la commune d'un résultat ne se lit pas dans municipality", () => {
    /* Sur les données françaises de Nominatim, `municipality` porte
       l'ARRONDISSEMENT et non la commune. Deux mesures réelles le prouvent, et
       les lire dans le mauvais ordre produisait deux bugs opposés :
       tous les résultats de Conflans étaient rejetés, et un chemin d'une
       commune voisine était accepté pour Gex. */
    const claudeFichot = { address: {
      leisure: 'Complexe Sportif Claude Fichot', road: 'Chemin des Grandes Terres',
      suburb: 'Chennevières', town: 'Conflans-Sainte-Honorine',
      municipality: 'Saint-Germain-en-Laye', county: 'Yvelines',
    } };
    expect(communeDuResultat(claudeFichot)).toBe('Conflans-Sainte-Honorine');

    const perdtempsHorsCommune = { address: {
      road: 'Chemin de Dessus-Perdtemps', village: 'Échenevex', municipality: 'Gex', county: 'Ain',
    } };
    expect(communeDuResultat(perdtempsHorsCommune)).toBe('Échenevex');
    expect(communeDuResultat(perdtempsHorsCommune)).not.toBe('Gex');

    // Une place réellement dans Gex reste reconnue
    expect(communeDuResultat({ address: { city: 'Gex', municipality: 'Gex' } })).toBe('Gex');

    // Sans champ de commune, la fonction rend une chaîne vide : l'appelant se
    // rabat alors sur le libellé complet plutôt que de rejeter à l'aveugle.
    expect(communeDuResultat({ address: { municipality: 'Gex' } })).toBe('');
    expect(communeDuResultat({})).toBe('');
    expect(communeDuResultat(null)).toBe('');
  });

  test('0.67.12 - Aucun repli à la maille du quartier', () => {
    /* L'étage IRIS posait le projet sur l'emprise d'un secteur statistique
       entier : une tache de plusieurs centaines de mètres à la place d'un
       chantier ponctuel (mesuré sur Vénissieux, ligne T10 et Grand Parilly).
       Les trois méthodes restantes sont toutes précises. Ce test empêche de
       réintroduire un niveau approximatif sans s'en rendre compte. */
    expect(Object.keys(METHOD_LABELS).sort()).toEqual(['adresse', 'emprise', 'trace']);
    expect(Object.keys(METHOD_LABELS)).not.toContain('quartier');
  });

  test("0.67.13 - RÉGRESSION : un brouillon d'une version antérieure se reprend sans planter", () => {
    /* L'état de la phase de localisation voyage en base entre les tranches.
       Une mise en production tombant au milieu d'une génération faisait
       échouer la reprise : `.push` sur un tableau absent, et surtout
       destructuration de `aTester` qui contenait de simples indices avant de
       contenir des paires [projet, rang]. */
    const queries = [['Rue Maurice Berteaux'], ['Stade Claude-Fichot', 'Claude-Fichot']];

    const ancien = { etape: 'nominatim', curseur: 1, aTester: [0, 1], reste: [0, 1] };
    migrerEtatGeo(ancien, queries);
    expect(Array.isArray(ancien.titresFusionnes)).toBe(true);
    expect(Array.isArray(ancien.titresSuperposes)).toBe(true);
    // Reconstruit en paires, et le curseur repart du début pour ne rien sauter
    expect(ancien.aTester.every((x) => Array.isArray(x))).toBe(true);
    expect(ancien.curseur).toBe(0);
    expect(() => { const [i, rang] = ancien.aTester[0]; return i + rang; }).not.toThrow();

    // Un état DÉJÀ au nouveau format n'est pas rejoué : le curseur est préservé
    const neuf = { etape: 'nominatim', curseur: 3, aTester: essaisNominatim(queries), reste: [1], titresFusionnes: ['x'], titresSuperposes: [] };
    migrerEtatGeo(neuf, queries);
    expect(neuf.curseur).toBe(3);
    expect(neuf.titresFusionnes).toEqual(['x']);

    // Les étages suivants stockent de simples indices : on n'y touche pas
    const ban = { etape: 'ban', curseur: 2, aTester: [0, 1], reste: [0] };
    migrerEtatGeo(ban, queries);
    expect(ban.aTester).toEqual([0, 1]);
    expect(ban.curseur).toBe(2);

    expect(() => migrerEtatGeo(null, queries)).not.toThrow();
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

/**
 * Ce que la machine DIT quand elle trouve peu de choses. Ces deux textes sont
 * lus par un maire sur un stand : ils ne doivent jamais imputer le manque à la
 * commune, mais aux sources publiques, et enchaîner sur ce que ses propres
 * documents permettraient.
 */
test.describe('0.69 - Démo : les textes de la rareté', () => {

  test('0.69.1 - Le seuil de carte courte vaut 3 et ne vit qu\'au serveur', () => {
    expect(CARTE_COURTE).toBe(3);
  });

  /**
   * Non-régression de fond : le texte ne dit pas que la commune manque de
   * projets, il dit que les SOURCES PUBLIQUES n'en documentent pas.
   */
  test('0.69.2 - Le message d\'absence n\'impute rien à la commune', () => {
    const m = messageSansProjet('Nouan-le-Fuzelier');
    // Le sujet de la phrase est « les sources publiques », jamais la commune
    expect(m.startsWith('Les sources publiques ne documentent')).toBe(true);
    expect(m).toContain('aucun projet de Nouan-le-Fuzelier');
    // Vocabulaire de l'échec, proscrit sur cet écran
    for (const mot of ['insuffisant', 'pas assez', 'échec', 'invisible', 'interrompu']) {
      expect(m.toLowerCase(), mot).not.toContain(mot);
    }
    // La sortie est toujours une proposition, jamais un constat sec
    expect(m).toContain('quelques jours');
  });

  test('0.69.3 - L\'avertissement de carte courte s\'accorde en nombre', () => {
    const un = messageCarteCourte('Edern', 1);
    expect(un).toContain("qu'un seul projet documenté");
    expect(un).toContain('avec ce projet');
    expect(un).not.toContain('projets documentés');

    const deux = messageCarteCourte('Edern', 2);
    expect(deux).toContain('que 2 projets documentés');
    expect(deux).toContain('avec ces projets');
  });

  /**
   * Le nom de la commune est celui que le visiteur vient de taper : une faute
   * d'élision se lirait sur son propre nom de commune, à côté du logo.
   */
  test('0.69.5 - La préposition s\'élide et se contracte avec l\'article', () => {
    expect(deLaCommune('Nouan-le-Fuzelier')).toBe('de Nouan-le-Fuzelier');
    expect(deLaCommune('Angers')).toBe("d'Angers");
    expect(deLaCommune('Oyonnax')).toBe("d'Oyonnax");
    expect(deLaCommune('Édern')).toBe("d'Édern");
    expect(deLaCommune('Le Havre')).toBe('du Havre');
    expect(deLaCommune('Les Fins')).toBe('des Fins');
    // L'article féminin ne se contracte pas : « de La Rochelle » est correct
    expect(deLaCommune('La Rochelle')).toBe('de La Rochelle');
    expect(deLaCommune('')).toBe('');
  });

  test('0.69.6 - Les deux messages emploient la forme élidée', () => {
    expect(messageSansProjet('Angers')).toContain("aucun projet d'Angers");
    expect(messageCarteCourte('Le Havre', 2)).toContain('sources publiques du Havre');
  });

  /**
   * L'avertissement annonce une carte, pas une panne : il promet la suite au
   * lieu de la refuser.
   */
  test('0.69.4 - L\'avertissement annonce que la carte se construit quand même', () => {
    const m = messageCarteCourte('Les Fins', 2);
    expect(m).toContain('Nous construisons la carte');
    expect(m).toContain('vos propres documents');
    for (const mot of ['impossible', 'échec', 'pas assez']) {
      expect(m.toLowerCase(), mot).not.toContain(mot);
    }
  });

});

/**
 * 0.70 - Echeance de la collecte mairie (non-regression).
 *
 * Ploudalmezeau (INSEE 29178) ne generait JAMAIS : son site publie un sitemap
 * de 319 adresses et des pages de 190 Ko a 2,2 s. Les lots de `inChunks`
 * s'enchainant en serie, la seule collecte mairie depassait le mur des 60 s
 * d'invocation. La fonction etait tuee avant `closeRun`, la ligne `demo_runs`
 * restait en `running` a commune vide, et le navigateur relançait tout seul :
 * 26 lignes mortes pour une commune, sur deux sessions.
 *
 * Lyon passait parce que son site n'expose AUCUN sitemap : moins de candidats,
 * donc une collecte plus courte. La generation dependait donc de la pauvrete du
 * site d'en face, ce qui est exactement l'inverse de l'effet recherche.
 */
test.describe('0.70 - Démo : la collecte mairie rend la main avant le mur d\'invocation', () => {

  test('0.70.1 - Sans échéance, tous les lots sont traités', async () => {
    const vus = [];
    const out = await inChunks([1, 2, 3, 4, 5], 2, async (n) => { vus.push(n); return n * 2; });
    expect(vus).toEqual([1, 2, 3, 4, 5]);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  test('0.70.2 - Une échéance déjà dépassée n\'ouvre aucun lot', async () => {
    const vus = [];
    const out = await inChunks([1, 2, 3], 2, async (n) => { vus.push(n); return n; }, Date.now() - 1);
    expect(vus).toEqual([]);
    expect(out).toEqual([]);
  });

  /* Le point qui compte : ce qui a deja ete collecte est RENDU, au lieu de
     disparaitre avec l'invocation tuee. */
  test('0.70.3 - L\'échéance atteinte en cours de série rend les lots déjà faits', async () => {
    const echeance = Date.now() + 120;
    const vus = [];
    const out = await inChunks([1, 2, 3, 4, 5, 6], 2, async (n) => {
      vus.push(n);
      await new Promise((r) => setTimeout(r, 80));
      return n;
    }, echeance);
    // Premier lot sous l'echeance, second lot la franchit, le reste est coupe
    expect(vus.length).toBeGreaterThanOrEqual(2);
    expect(vus.length).toBeLessThan(6);
    expect(out).toEqual(vus);
  });

  /* Le filet doit rester AU-DESSUS du normal observe (34,6 s pour la branche
     complete sur Ploudalmezeau) et SOUS le mur d'invocation de 60 s. Trop bas,
     il rogne des collectes qui aboutissent ; trop haut, il ne protege plus. */
  test('0.70.4 - Le filet est au-dessus du normal observé et sous le mur de 60 s', () => {
    expect(MAIRIE_BUDGET_MS).toBeGreaterThan(35000);
    expect(MAIRIE_BUDGET_MS).toBeLessThanOrEqual(50000);
  });

});

/**
 * 0.71 - La cause reelle des communes bloquees (non-regression).
 *
 * www.ploudalmezeau.fr repond en gzip sans content-length et ne termine jamais
 * proprement son flux. Or `AbortController.abort()` NE DEBLOQUE PAS un
 * `reader.read()` deja en attente dans ce cas : la promesse reste pendante pour
 * toujours, ni le catch ni le finally ne s'executent, et TOUTE l'invocation se
 * fige. Mesure Node 20 : en-tetes a 201 ms, abort a 8 s, puis plus rien.
 *
 * Lyon passait par accident : sa page fait 2,45 Mo, donc elle atteint le
 * plafond d'octets et sort par `reader.cancel()` avant les 8 s. Ploudalmezeau
 * fait 443 Ko, juste SOUS le plafond, donc la boucle attendait une fin de flux
 * qui ne venait jamais. Une commune echouait donc parce que sa page etait
 * legere, ce que personne n'aurait devine.
 */
test.describe('0.71 - Démo : un flux qui ne se termine jamais ne fige plus la collecte', () => {

  /** Lecteur qui rend un bloc, puis ne se resout PLUS JAMAIS. C'est
   *  exactement ce que fait un flux gzip que le serveur ne termine pas. */
  const lecteurQuiSeFige = (bloc) => {
    let premier = true;
    return {
      annule: false,
      read() {
        if (premier) { premier = false; return Promise.resolve({ done: false, value: bloc }); }
        return new Promise(() => {}); // pendante pour toujours
      },
      cancel() { this.annule = true; return Promise.resolve(); },
    };
  };

  test('0.71.1 - Une lecture pendante rend la main au délai imparti', async () => {
    const bloc = new TextEncoder().encode('<html><body>Travaux</body></html>');
    const lecteur = lecteurQuiSeFige(bloc);
    const t0 = Date.now();
    const { total, tronque, chunks } = await lireFluxBorne(lecteur, Date.now() + 600, 500000);
    const ecoule = Date.now() - t0;
    // Le point de non-regression : ca REND LA MAIN. Avant, jamais.
    expect(ecoule).toBeGreaterThanOrEqual(550);
    expect(ecoule).toBeLessThan(4000);
    expect(tronque).toBe(true);
    // Et ce qui a ete lu est CONSERVE, pas jete
    expect(total).toBe(bloc.byteLength);
    expect(new TextDecoder().decode(chunks[0])).toContain('Travaux');
    // Le flux est referme, pas laisse ouvert
    expect(lecteur.annule).toBe(true);
  });

  test('0.71.2 - Un flux qui se termine normalement n\'est pas marqué tronqué', async () => {
    const blocs = [new TextEncoder().encode('abc'), new TextEncoder().encode('def')];
    let i = 0;
    const lecteur = {
      read: () => Promise.resolve(i < blocs.length ? { done: false, value: blocs[i++] } : { done: true }),
      cancel: () => Promise.resolve(),
    };
    const { total, tronque } = await lireFluxBorne(lecteur, Date.now() + 5000, 500000);
    expect(tronque).toBe(false);
    expect(total).toBe(6);
  });

  /* Meme defaut sur les corps JSON, et il y etait PIRE : fetchWithTimeout
     annule son minuteur des que les en-tetes arrivent, donc `r.json()` lisait
     sans aucune borne, pas meme un abort. Ce sont les appels Supabase, geo,
     annuaire, BOAMP et Commons qui passaient par la. */
  test('0.71.4 - Un corps JSON qui ne se termine jamais lève au lieu de figer', async () => {
    const bloc = new TextEncoder().encode('{"a":1');
    let premier = true;
    const r = {
      body: {
        getReader: () => ({
          read() {
            if (premier) { premier = false; return Promise.resolve({ done: false, value: bloc }); }
            return new Promise(() => {});
          },
          cancel: () => Promise.resolve(),
        }),
      },
    };
    const t0 = Date.now();
    await expect(lireJson(r, 500)).rejects.toThrow(/corps JSON interrompu/);
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  test('0.71.5 - Un corps JSON complet est décodé normalement', async () => {
    const octets = new TextEncoder().encode('{"ville":"essai-villeurbanne","n":3}');
    let i = 0;
    const r = {
      body: {
        getReader: () => ({
          read: () => Promise.resolve(i++ === 0 ? { done: false, value: octets } : { done: true }),
          cancel: () => Promise.resolve(),
        }),
      },
    };
    await expect(lireJson(r, 5000)).resolves.toEqual({ ville: 'essai-villeurbanne', n: 3 });
  });

  /* Le plafond d'octets reste prioritaire : c'est lui qui sauvait Lyon. */
  test('0.71.3 - Le plafond d\'octets coupe avant le délai', async () => {

    const gros = new Uint8Array(400);
    const lecteur = {
      annule: false,
      read: () => Promise.resolve({ done: false, value: gros }),
      cancel() { this.annule = true; return Promise.resolve(); },
    };
    const { total, tronque } = await lireFluxBorne(lecteur, Date.now() + 5000, 1000);
    expect(tronque).toBe(false);
    expect(total).toBeGreaterThanOrEqual(1000);
    expect(lecteur.annule).toBe(true);
  });

});

/**
 * 0.72 - L'octet NUL rejete par PostgreSQL (non-regression).
 *
 * Villeurbanne collectait parfaitement (32 pages, 17 avis, 22 articles) puis
 * mourait a l'ECRITURE : une de ses pages contient U+0000, que PostgreSQL
 * refuse dans `text` comme dans `jsonb` (SQLSTATE 22P05). Un seul NUL faisait
 * rejeter tout l'insert du brouillon en 400, cinq tentatives de suite.
 */
test.describe('0.72 - Demo : un octet NUL ne fait plus echouer l\'ecriture', () => {

  test('0.72.1 - Le NUL est retire a toutes les profondeurs', () => {
    const etat = {
      commune: { nom: 'Villeurbanne\u0000' },
      mairie: { pages: [{ text: 'Travaux\u0000 rue du Progres' }, { text: 'sain' }] },
      liste: ['a\u0000b', { profond: { encore: '\u0000\u0000x' } }],
    };
    const json = corpsJson(etat);
    expect(json).not.toContain('\\u0000');
    const relu = JSON.parse(json);
    expect(relu.commune.nom).toBe('Villeurbanne');
    expect(relu.mairie.pages[0].text).toBe('Travaux rue du Progres');
    expect(relu.liste[0]).toBe('ab');
    expect(relu.liste[1].profond.encore).toBe('x');
  });

  test('0.72.2 - Le contenu legitime est intact, accents et emoji compris', () => {
    const etat = { titre: 'Rénovation de la médiathèque', note: 'coût : 3 M€', emoji: '🚧' };
    expect(JSON.parse(corpsJson(etat))).toEqual(etat);
  });

  /* Une chaine qui CONTIENT le texte « u0000 » sans NUL reel ne doit pas etre
     amputee : le remplacement porte sur l'echappement, pas sur les caracteres. */
  test('0.72.3 - La sequence litterale u0000 dans un texte est preservee', () => {
    const etat = { doc: 'le code u0000 figure dans la doc' };
    expect(JSON.parse(corpsJson(etat)).doc).toBe('le code u0000 figure dans la doc');
  });

});

/**
 * Les marchés publics passés en DERNIER RECOURS.
 *
 * Mesure qui a motivé la règle, sur Lyon : des 19 projets attestés, les 12
 * venus du site de la ville avaient tous une vraie photo et se géocodaient,
 * les 7 venus d'avis de marché n'en avaient aucune et portaient des intitulés
 * du type « modernisation du système de sécurité incendie de l'université ».
 */
test.describe('0.73 - Démo : les marchés publics ne créent une fiche qu\'à défaut', () => {

  const projet = (title, origine, address = '', marcheDate = '') => ({ title, origine, address, marcheDate });

  test('0.73.1 - Une commune qui documente ses projets voit ses avis écartés', () => {
    const projets = [
      ...Array.from({ length: 12 }, (_, i) => projet(`Projet ville ${i + 1}`, 'commune')),
      ...Array.from({ length: 7 }, (_, i) => projet(`Avis ${i + 1}`, 'marche', '', `2026-0${i + 1}-01`)),
    ];
    const { retenus, ecartes } = arbitrerMarches(projets, 12);
    expect(retenus).toHaveLength(12);
    expect(ecartes).toHaveLength(7);
    expect(retenus.every((p) => p.origine === 'commune')).toBe(true);
  });

  test('0.73.2 - Une commune muette garde TOUS ses avis', () => {
    const projets = Array.from({ length: 6 }, (_, i) => projet(`Avis ${i + 1}`, 'marche'));
    const { retenus, ecartes } = arbitrerMarches(projets, 12);
    expect(retenus).toHaveLength(6);
    expect(ecartes).toHaveLength(0);
  });

  test('0.73.3 - Une commune médiane complète avec ses avis sans en perdre', () => {
    const projets = [
      ...Array.from({ length: 3 }, (_, i) => projet(`Projet ville ${i + 1}`, 'commune')),
      ...Array.from({ length: 5 }, (_, i) => projet(`Avis ${i + 1}`, 'marche')),
    ];
    const { retenus, ecartes } = arbitrerMarches(projets, 12);
    expect(retenus).toHaveLength(8);
    expect(ecartes).toHaveLength(0);
  });

  /* Un avis sans lieu propre finit de toute façon écarté au géocodage : à
     nombre de places égal, celui qui porte une adresse doit passer devant. */
  test('0.73.4 - À places limitées, l\'avis qui porte une adresse est préféré', () => {
    const projets = [
      ...Array.from({ length: 11 }, (_, i) => projet(`Projet ville ${i + 1}`, 'commune')),
      projet('Sans adresse', 'marche', '', '2026-08-01'),
      projet('Avec adresse', 'marche', '1 rue des Écoles', '2026-01-01'),
    ];
    const { retenus } = arbitrerMarches(projets, 12);
    const gardes = retenus.filter((p) => p.origine === 'marche');
    expect(gardes).toHaveLength(1);
    expect(gardes[0].title).toBe('Avec adresse');
  });

  test('0.73.5 - L\'ordre d\'origine des projets est préservé', () => {
    const projets = [
      projet('A', 'commune'), projet('Avis', 'marche'), projet('B', 'commune'),
    ];
    const { retenus } = arbitrerMarches(projets, 12);
    expect(retenus.map((p) => p.title)).toEqual(['A', 'Avis', 'B']);
  });

  test('0.73.6 - La recherche d\'un article est bornée aux domaines attestés', () => {
    const domaines = domainesAutorises({
      sources: [{ url: 'https://www.lyon.fr/actu/x' }, { url: 'https://www.boamp.fr/avis/1' }],
      source_url: 'https://www.lyon.fr/actu/x',
    }, 'www.lyon.fr');
    expect(domaines).toContain('lyon.fr');
    expect(domaines).toContain('boamp.fr');
    expect(domaines).not.toContain('www.lyon.fr');
  });

  test('0.73.7 - Un projet sans source attestée n\'ouvre aucun domaine', () => {
    expect(domainesAutorises({ sources: [], source_url: '' }, '')).toEqual([]);
  });

});

/**
 * Les emprises trop petites pour se voir reçoivent un repère.
 *
 * Le calcul est fait à la PUBLICATION, dans la démo : la carte publique pose
 * déjà un marqueur sur toute forme ponctuelle d'une contribution, elle n'a donc
 * aucune ligne de code à recevoir pour ça.
 */
test.describe('0.74 - Démo : un repère sur les emprises invisibles', () => {

  // Carré de `metres` de côté, à la latitude de Lyon
  const carre = (metres) => {
    const d = metres / 111320;
    return { type: 'Polygon', coordinates: [[[4.83, 45.76], [4.83 + d, 45.76], [4.83 + d, 45.76 + d], [4.83, 45.76 + d], [4.83, 45.76]]] };
  };

  test('0.74.1 - Le seuil de visibilité suit le zoom d\'ouverture', () => {
    // Une métropole s'ouvre au zoom 12, un village au zoom 15 : la même forme
    // n'y a pas la même taille à l'écran.
    const metropole = tailleMinimaleVisible(12, 45.76);
    const village = tailleMinimaleVisible(15, 45.76);
    expect(metropole).toBeGreaterThan(village);
    expect(Math.round(metropole)).toBe(640);
    expect(Math.round(village)).toBe(80);
  });

  test('0.74.2 - Une petite emprise reçoit un point EN PLUS de son contour', () => {
    const f = featuresDuProjet(carre(40), 'Cour d\'école', 12, 45.76);
    expect(f).toHaveLength(2);
    expect(f[0].geometry.type).toBe('Polygon');
    expect(f[1].geometry.type).toBe('Point');
    // Le contour reste EN PREMIER : la carte interroge les formes avant les
    // marqueurs, et le survol doit continuer à souligner l'emprise.
    expect(f[0].properties.name).toBe('Cour d\'école');
    expect(f[1].properties.name).toBe('Cour d\'école');
  });

  test('0.74.3 - Une emprise assez grande reste seule', () => {
    expect(featuresDuProjet(carre(900), 'Quartier', 12, 45.76)).toHaveLength(1);
  });

  test('0.74.4 - Un point reste un point, sans doublon', () => {
    const f = featuresDuProjet({ type: 'Point', coordinates: [4.83, 45.76] }, 'Adresse', 12, 45.76);
    expect(f).toHaveLength(1);
  });

  /* Un tracé est fin mais long : il se voit sur la carte, et son repère doit
     tomber SUR le tracé, pas à côté. */
  test('0.74.5 - Le repère d\'un tracé court est posé sur le tracé', () => {
    // Environ 155 m de long : invisible à l'échelle d'une métropole (zoom 12,
    // seuil 640 m), mais parfaitement lisible à celle d'un village (zoom 15).
    const trace = { type: 'LineString', coordinates: [[4.830, 45.760], [4.831, 45.7605], [4.832, 45.761]] };
    const f = featuresDuProjet(trace, 'Rue', 12, 45.76);
    expect(f).toHaveLength(2);
    // Un sommet du tracé, donc un point qui tombe SUR la rue et non à côté
    expect(f[1].geometry.coordinates).toEqual([4.831, 45.7605]);
    expect(featuresDuProjet(trace, 'Rue', 15, 45.76)).toHaveLength(1);
  });

  test('0.74.6 - Une géométrie absente ne fait pas échouer la publication', () => {
    expect(featuresDuProjet(null, 'Projet', 12, 45.76)).toHaveLength(1);
  });

});

/**
 * La vue aérienne du lieu, qui remplace la recherche de photos à proximité.
 */
test.describe('0.75 - Démo : la vue aérienne remplace la photo du voisinage', () => {

  const bboxDe = (url) => new URL(url).searchParams.get('BBOX').split(',').map(Number);

  /* En WMS 1.3.0 et EPSG:4326, l'ordre est latitude puis longitude, l'inverse
     de l'ordre GeoJSON. Les inverser rend une image de l'autre bout du monde
     sans lever la moindre erreur : c'est le piège du service. */
  test('0.75.1 - RÉGRESSION : la boîte est en latitude, longitude', () => {
    const [minLat, minLng, maxLat, maxLng] = bboxDe(vueAerienneUrl({ type: 'Point', coordinates: [4.83, 45.76] }));
    expect(minLat).toBeGreaterThan(45); expect(maxLat).toBeGreaterThan(45);
    expect(minLng).toBeLessThan(5); expect(maxLng).toBeLessThan(5);
    expect(maxLat).toBeGreaterThan(minLat);
    expect(maxLng).toBeGreaterThan(minLng);
  });

  test('0.75.2 - Le cadrage garde la proportion de la vignette', () => {
    for (const g of [
      { type: 'Point', coordinates: [4.83, 45.76] },
      { type: 'LineString', coordinates: [[4.820, 45.750], [4.835, 45.756]] },
    ]) {
      const [minLat, minLng, maxLat, maxLng] = bboxDe(vueAerienneUrl(g));
      const largeur = (maxLng - minLng) * 111320 * Math.cos((minLat * Math.PI) / 180);
      const hauteur = (maxLat - minLat) * 111320;
      expect(largeur / hauteur).toBeCloseTo(16 / 9, 1);
    }
  });

  test('0.75.3 - Le cadrage est borné dans les deux sens', () => {
    const largeurDe = (g) => {
      const [minLat, minLng, , maxLng] = bboxDe(vueAerienneUrl(g));
      return (maxLng - minLng) * 111320 * Math.cos((minLat * Math.PI) / 180);
    };
    // Un point n'a aucune étendue : il ne doit pas produire une vue floue
    expect(Math.round(largeurDe({ type: 'Point', coordinates: [4.83, 45.76] }))).toBe(220);
    // Un très long tracé ne doit pas produire une vue illisible
    const long = { type: 'LineString', coordinates: [[4.80, 45.76], [4.86, 45.76]] };
    expect(Math.round(largeurDe(long))).toBe(1600);
  });

  /* Toutes les vues aériennes partagent le chemin du service et ne diffèrent
     que par leur cadrage. Sans ce correctif, la première passait et toutes les
     suivantes étaient rejetées comme doublons, silencieusement. */
  test('0.75.4 - RÉGRESSION : deux vues aériennes ne sont pas prises pour un doublon', () => {
    const a = coverKey(vueAerienneUrl({ type: 'Point', coordinates: [4.83, 45.76] }));
    const b = coverKey(vueAerienneUrl({ type: 'Point', coordinates: [4.85, 45.77] }));
    expect(a).not.toBe(b);
  });

  test('0.75.5 - Les vignettes de cache d\'un CMS restent bien dédoublonnées', () => {
    expect(coverKey('https://ville.fr/img/web-parking-3d6e6237.png'))
      .toBe(coverKey('https://ville.fr/img/web-parking-450dc1de.png'));
  });

});

/**
 * L'EXPLORATION : on ne décide plus à l'avance combien de pages lire.
 *
 * L'ancienne collecte téléchargeait un nombre fixe de pages, en faisait un seul
 * document, et demandait à l'IA de le dépouiller d'un coup. Sur une métropole
 * ce document atteignait l'équivalent d'un livre de cent cinquante pages, et
 * l'IA en ratait le milieu : mesure sur Lyon, dix projets tirés d'un corpus
 * pourtant plus riche que celui qui en avait rendu dix-neuf.
 * Désormais chaque page est lue séparément, et ce qu'elle contient désigne la
 * suite du chemin.
 */
test.describe('0.76 - Démo : l\'exploration du site, page par page', () => {

  test('0.76.1 - Une même page écrite de cinq façons n\'est ouverte qu\'une fois', () => {
    const ecritures = [
      'https://www.lyon.fr/projet/',
      'http://lyon.fr/projet',
      'https://LYON.fr/projet#le-calendrier',
      'https://www.lyon.fr/projet?utm_source=newsletter',
      'https://www.lyon.fr//projet/',
    ];
    expect(new Set(ecritures.map(normaliserUrl)).size).toBe(1);
    // Deux pages réellement différentes le restent
    expect(normaliserUrl('https://lyon.fr/a')).not.toBe(normaliserUrl('https://lyon.fr/b'));
  });

  test('0.76.2 - Un paramètre porteur de sens n\'est pas confondu avec un suivi', () => {
    expect(normaliserUrl('https://lyon.fr/p?id=12')).not.toBe(normaliserUrl('https://lyon.fr/p?id=13'));
    // L'ordre des paramètres ne fait pas deux pages
    expect(normaliserUrl('https://lyon.fr/p?a=1&b=2')).toBe(normaliserUrl('https://lyon.fr/p?b=2&a=1'));
  });

  test('0.76.3 - Ce qui n\'est pas une page n\'entre pas dans l\'exploration', () => {
    for (const u of [
      'https://lyon.fr/doc.pdf', 'https://lyon.fr/photo.jpg', 'https://lyon.fr/wp-login.php',
      'https://lyon.fr/etat-civil/acte', 'https://lyon.fr/recrutement', 'https://autre-site.fr/projet',
    ]) {
      expect(estUnePageExplorable(u, 'www.lyon.fr'), u).toBe(false);
    }
    expect(estUnePageExplorable('https://lyon.fr/projets/mermoz', 'www.lyon.fr')).toBe(true);
  });

  test('0.76.4 - La file ouvre d\'abord ce qu\'une page de projets a recommandé', () => {
    const file = new FileExploration({ hote: 'www.lyon.fr' });
    file.ajouter('https://www.lyon.fr/a', 'Rubrique', 0);
    file.ajouter('https://www.lyon.fr/b', 'Actualités', 0);
    file.ajouter('https://www.lyon.fr/c', 'Fiche du projet', 3);
    expect(file.vague(3).map((x) => x.label)).toEqual(['Fiche du projet', 'Rubrique', 'Actualités']);
  });

  test('0.76.5 - Une page déjà ouverte n\'est jamais reproposée', () => {
    const file = new FileExploration({ hote: 'www.lyon.fr' });
    file.ajouter('https://www.lyon.fr/a', 'Page', 0);
    file.vague(1);
    expect(file.ajouter('https://www.lyon.fr/a/', 'La même', 9)).toBe(false);
    expect(file.restantes).toBe(0);
  });

  /* L'exploration travaille par tranches : son état voyage en base entre deux
     invocations, et un registre qui ne survivrait pas au voyage ferait relire
     tout le site à chaque reprise. */
  test('0.76.6 - L\'état de l\'exploration survit à un aller-retour en base', () => {
    const file = new FileExploration({ hote: 'www.lyon.fr' });
    // La plus prioritaire part dans la première vague, l'autre reste en attente
    file.ajouter('https://www.lyon.fr/a', 'Ouverte', 5);
    file.ajouter('https://www.lyon.fr/b', 'En attente', 0);
    expect(file.vague(1)[0].label).toBe('Ouverte');
    const repris = FileExploration.restaurer(JSON.parse(JSON.stringify(file.serialiser())));
    expect(repris.restantes).toBe(1);
    expect(repris.ajouter('https://www.lyon.fr/a', 'Déjà vue', 0)).toBe(false);
    expect(repris.vague(1)[0].label).toBe('En attente');
  });

  /* Le gabarit exige DEUX references : construit sur le seul accueil, il
     mangeait aussi les teasers, et une commune qui presente ses projets en
     page d'accueil voyait la page projet, identique au teaser, retiree comme
     du menu. */
  test('0.76.7 - Le menu, present sur deux references, est retiré des pages', () => {
    const menu = 'Accueil Mairie Demarches Vie associative Agenda Contact Plan du site Mentions legales';
    const gabarit = empreinteGabarit([
      `${menu} Bienvenue sur le site de la commune.`,
      `${menu} Les actualites du mois de mars sont en ligne.`,
    ]);
    const net = retirerGabaritConnu(`${menu} La requalification de la place du marche debutera en mars 2027 avec la reprise des reseaux et du mobilier urbain pour un budget vote au conseil. Les riverains seront informes des fermetures par un affichage sur place et le marche hebdomadaire sera deplace le temps des travaux vers le parking des halles.`, gabarit);
    expect(net).toContain('requalification');
    expect(net).not.toContain('Mentions legales');
  });

  test('0.76.8 - Un teaser present sur le seul accueil n\'est pas du gabarit', () => {
    const teaser = 'La commune lance la requalification de la place du marche des mars 2027';
    const gabarit = empreinteGabarit([
      `Menu Accueil Contact ${teaser} pied de page mentions legales cookies acceptez notre politique`,
      'Menu Accueil Contact autre page sans le teaser pied de page mentions legales cookies acceptez notre politique',
    ]);
    const page = `${teaser} avec la reprise complete des reseaux, du mobilier urbain et des plantations, pour un budget de deux millions d'euros vote au conseil municipal de janvier. Le chantier durera dix-huit mois et le marche hebdomadaire sera deplace vers le parking des halles pendant toute la duree des travaux.`;
    expect(retirerGabaritConnu(page, gabarit)).toContain('requalification de la place');
  });

  test('0.76.9 - Une seule reference ne retire rien : pas de gabarit fiable', () => {
    const gabarit = empreinteGabarit(['Menu Accueil Contact Mentions legales et toute la page d accueil']);
    expect(gabarit.size).toBe(0);
  });

});

/**
 * Le RAPPROCHEMENT, contrepartie de la lecture page par page.
 *
 * Le même écoquartier est décrit sur la rubrique « nos projets », sur
 * l'actualité qui annonce le chantier et dans l'avis de marché : trois adresses
 * distinctes, aucune lue deux fois, et pourtant trois entrées à fondre en une.
 */
test.describe('0.79 - Démo : un même chantier vu par plusieurs pages', () => {

  const VIDES = /^(projet|travaux|amenagement|renovation|construction|nouvelle|ville|commune)$/;

  test('0.79.1 - Deux mots caractéristiques communs suffisent à rapprocher', () => {
    expect(rapprochement(
      { title: 'Renovation du groupe scolaire Jean Moulin', geo_query: 'Jean Moulin' },
      { title: 'Extension du groupe scolaire Jean Moulin', geo_query: 'Jean Moulin' },
      VIDES,
    )).toBe('oui');
  });

  test('0.79.2 - Deux chantiers distincts ne sont pas rapprochés', () => {
    expect(rapprochement(
      { title: 'Piscine municipale', geo_query: 'piscine' },
      { title: 'Mediatheque centrale', geo_query: 'mediatheque' },
      VIDES,
    )).toBe('non');
  });

  test('0.79.3 - La fusion garde le titre le plus informatif, pas le plus court', () => {
    const groupe = [
      { title: 'Travaux ecoquartier', description: 'x', origine: 'marche', source_url: 'https://boamp.fr/1' },
      { title: 'Ecoquartier secteur ancienne gare', description: 'Description complete du chantier.', origine: 'commune', source_url: 'https://lyon.fr/p' },
    ];
    const fondu = fondre(groupe, VIDES);
    // Le titre de l'avis de marche est le plus court mais le plus pauvre
    expect(fondu.title).toBe('Ecoquartier secteur ancienne gare');
    expect(fondu.description).toBe('Description complete du chantier.');
  });

  test('0.79.4 - La fusion additionne les sources et compte les attestations', () => {
    const groupe = [
      { title: 'Ecoquartier de la gare', description: 'Court.', geo_query: 'gare', source_url: 'https://lyon.fr/projets', origine: 'commune' },
      { title: 'Amenagement ecoquartier gare', description: 'Beaucoup plus complet.', geo_query: 'gare', address: '1 rue de la Gare', source_url: 'https://lyon.fr/actu', origine: 'commune' },
      { title: 'Travaux ecoquartier gare', description: 'x', geo_query: 'gare', source_url: 'https://boamp.fr/9', origine: 'marche' },
    ];
    const fondu = fondre(groupe, VIDES);
    expect(fondu.attestations).toBe(3);
    // L'adresse officielle vient de l'avis, la description de la page de la ville
    expect(fondu.address).toBe('1 rue de la Gare');
    expect(fondu.description).toBe('Beaucoup plus complet.');
    // Un projet décrit par la commune n'est jamais classé « de marché »
    expect(fondu.origine).toBe('commune');
  });

  test('0.79.5 - Le regroupement fond ce qui doit l\'être et sépare le reste', () => {
    const bruts = [
      { title: 'Ecoquartier ancienne gare', geo_query: 'gare', description: 'a', source_url: 'https://lyon.fr/1', origine: 'commune' },
      { title: 'Amenagement ecoquartier ancienne gare', geo_query: 'gare', description: 'b', source_url: 'https://lyon.fr/2', origine: 'commune' },
      { title: 'Mediatheque centrale', geo_query: 'mediatheque', description: 'c', source_url: 'https://lyon.fr/3', origine: 'commune' },
    ];
    const { groupes } = regrouper(bruts, VIDES);
    expect(groupes).toHaveLength(2);
    expect(groupes.map((g) => g.length).sort()).toEqual([1, 2]);
  });

  /* Une paire douteuse ne doit jamais être fondue d'office : fusionner deux
     opérations distinctes fait disparaître un projet de la carte, alors que
     les laisser séparées ne coûte qu'une fiche en double. */
  test('0.79.6 - Un cas ambigu est signalé plutôt que tranché tout seul', () => {
    const bruts = [
      { title: 'Requalification avenue Berthelot', geo_query: 'avenue Berthelot', description: 'a', source_url: 'https://lyon.fr/1' },
      { title: 'Residence Berthelot', geo_query: 'residence Berthelot', description: 'b', source_url: 'https://lyon.fr/2' },
    ];
    const { groupes, doutes } = regrouper(bruts, VIDES);
    expect(doutes).toHaveLength(1);
    expect(groupes).toHaveLength(2);
  });

});

/**
 * Le compteur d'échecs d'une phase découpée en tranches.
 * Il n'était remis à zéro qu'en atteignant son plafond, jamais après un travail
 * réussi : deux incidents passagers sur deux tranches distinctes d'une même
 * phase suffisaient à abandonner une génération qui avançait.
 */
test.describe('0.77 - Démo : une tranche réussie efface l\'ardoise', () => {

  test('0.77.1 - Le compteur de la phase est retiré du brouillon', () => {
    const apres = oublierLesEchecs({ _attempts_locate: 1, located: [1, 2] }, 'locate');
    expect(apres._attempts_locate).toBeUndefined();
    expect(apres.located).toEqual([1, 2]);
  });

  test('0.77.2 - Le compteur des AUTRES phases est laissé intact', () => {
    const apres = oublierLesEchecs({ _attempts_locate: 1, _attempts_media: 1 }, 'locate');
    expect(apres._attempts_locate).toBeUndefined();
    expect(apres._attempts_media).toBe(1);
  });

  test('0.77.3 - Un brouillon sans compteur est rendu tel quel', () => {
    const etat = { located: [] };
    expect(oublierLesEchecs(etat, 'media')).toBe(etat);
  });

});

/**
 * Le socle de rédaction partagé avec l'outil de l'admin.
 *
 * Ce qu'il produit est publié TEL QUEL sur une fiche que consultent des
 * habitants : rien ne relit entre le modèle et l'écran.
 */
test.describe('0.78 - Démo : ce qui sort d\'un article rédigé', () => {

  test('0.78.1 - Un lien d\'attribution disparaît, sa phrase reste', () => {
    expect(retirerLesLiens('Le chantier débute en mars ([mairie3.lyon.fr](https://mairie3.lyon.fr/x)).'))
      .toBe('Le chantier débute en mars.');
  });

  /* Le modèle attribue aussi par simple nom de site, sans lien : c'est la forme
     que la consigne « n'insère aucun lien » ne suffit pas à empêcher. */
  test('0.78.2 - Une attribution par nom de site disparaît aussi', () => {
    expect(retirerLesLiens('La ZAC couvre 12 hectares (metropole.nantes.fr).'))
      .toBe('La ZAC couvre 12 hectares.');
    expect(retirerLesLiens('Le budget est de 4 M€ (source : lyon.fr).'))
      .toBe('Le budget est de 4 M€.');
  });

  test('0.78.3 - Les parenthèses légitimes d\'un texte français sont intactes', () => {
    for (const phrase of [
      'Le parc couvre 160 hectares (env. 160 hectares) et sera livré en 2027.',
      'Conformément au décret (n°2021-1104), les travaux commencent en avril.',
      'Les travaux (18 mois) démarreront au printemps.',
    ]) {
      expect(retirerLesLiens(phrase)).toBe(phrase);
    }
  });

  test('0.78.4 - La structure markdown de l\'article n\'est pas abîmée', () => {
    const article = '## Ce qui change\n\n- Une piste cyclable\n- Un parvis végétalisé\n\n## Calendrier\n\nLivraison en 2027.';
    expect(retirerLesLiens(article)).toBe(article);
  });

  test('0.78.5 - Les sources sont dédoublonnées et débarrassées du suivi', () => {
    const sources = sourcesDesAnnotations([
      { type: 'url_citation', url: 'https://www.lyon.fr/a?utm_source=openai', title: 'Ville de Lyon' },
      { type: 'url_citation', url: 'https://www.lyon.fr/a', title: 'Doublon' },
      { type: 'autre', url: 'https://ignore.fr' },
      null,
      { type: 'url_citation', url: 'pas-une-url' },
    ]);
    expect(sources).toEqual([{ url: 'https://www.lyon.fr/a', title: 'Ville de Lyon' }]);
  });

  test('0.78.6 - Une annotation sans titre prend le nom du média', () => {
    const [s] = sourcesDesAnnotations([{ type: 'url_citation', url: 'https://www.leprogres.fr/article' }]);
    expect(s.title).toBe('leprogres.fr');
  });

  test('0.78.7 - Sans source citée, aucun bloc n\'est ajouté', () => {
    expect(blocSources([])).toBe('');
    expect(blocSources(null)).toBe('');
  });

  test('0.78.8 - Le bloc de sources est du markdown de liens', () => {
    expect(blocSources([{ url: 'https://www.lyon.fr/a', title: 'Ville de Lyon' }]))
      .toContain('- [Ville de Lyon](https://www.lyon.fr/a)');
  });

  /* La démo publie sans relecture : la consigne doit interdire explicitement de
     s'adresser au demandeur, faute de quoi la fiche affiche « Voici un texte
     factuel : » ou « Je n'ai trouvé aucune information récente ». */
  test('0.78.9 - La consigne stricte interdit le préambule et l\'attribution', () => {
    const strict = promptArticle({ commune: 'Lyon', stricte: true });
    expect(strict).toContain('Rends l\'article et rien d\'autre');
    expect(strict).toContain('N\'attribue AUCUNE phrase');
    expect(strict).toContain('RÈGLE ABSOLUE');
    // L'admin, où un agent relit avant publication, n'a pas besoin de la règle stricte
    expect(promptArticle({ commune: 'Lyon', stricte: false })).not.toContain('RÈGLE ABSOLUE');
  });

});

/**
 * Le TRI DE MASSE : écarter l'évident, jamais choisir les meilleures.
 *
 * La bascule tient dans cette nuance. L'ancienne sélection retenait trente
 * adresses sur trois cent vingt, ce qui est un pari : sur Lyon, la seule
 * rubrique que l'accueil offrait était de la gouvernance, et les projets ont
 * été manqués. Écarter « état civil » sur son intitulé, en revanche, est un
 * jugement sûr, et tout ce qui survit est ensuite ouvert.
 */
test.describe('0.80 - Démo : ce que l\'exploration refuse d\'ouvrir', () => {

  /* Ces chemins sont refusés sans même consulter l'IA : ils ne mènent jamais à
     une opération d'aménagement, et les ouvrir ne ferait que payer des pages. */
  test('0.80.1 - Les chemins de service sont refusés sans appel IA', () => {
    for (const chemin of [
      '/etat-civil/naissance', '/demarches/carte-identite', '/recrutement',
      '/contact', '/mentions-legales', '/plan-du-site', '/newsletter',
    ]) {
      expect(estUnePageExplorable(`https://ville.fr${chemin}`, 'ville.fr'), chemin).toBe(false);
    }
  });

  /* Dans le doute, on ouvre : une page écartée à tort fait disparaître un
     projet de la carte, une page ouverte pour rien coûte une poignée de
     centimes. C'est l'asymétrie qui commande tout le réglage. */
  test('0.80.2 - Une rubrique d\'aménagement ou un intitulé vague est ouvert', () => {
    for (const chemin of [
      '/travaux/rue-de-la-gare', '/urbanisme/zac-des-vignes', '/actualites/2026/03',
      '/ma-ville/grands-projets', '/cadre-de-vie', '/page-1234', '/actualite-sans-titre',
    ]) {
      expect(estUnePageExplorable(`https://ville.fr${chemin}`, 'ville.fr'), chemin).toBe(true);
    }
  });

  /* Une page de sommaire désigne ses fiches détaillées. Si celles-ci attendent
     déjà dans la file, elles doivent quand même lui être soumises, sinon la
     recommandation est perdue : mesure sur Ploudalmézeau, les trois fiches de
     projets étaient déjà versées par le sitemap, n'étaient donc pas proposées,
     ne recevaient aucune priorité et n'ont jamais été atteintes. */
  test('0.80.3 - RÉGRESSION : une page en attente reste proposable au sommaire', () => {
    const file = new FileExploration({ hote: 'ville.fr' });
    file.ajouter('https://ville.fr/projets/ecoquartier', 'Écoquartier', 0);
    // Elle attend, elle n'a pas été lue : le sommaire peut encore la désigner
    expect(file.connue('https://ville.fr/projets/ecoquartier')).toBe(true);
    expect(file.dejaOuverte('https://ville.fr/projets/ecoquartier')).toBe(false);
    // Une fois lue, elle ne doit plus jamais revenir
    file.vague(1);
    expect(file.dejaOuverte('https://ville.fr/projets/ecoquartier')).toBe(true);
  });

  test('0.80.4 - Une recommandation fait remonter une page déjà en file', () => {
    const file = new FileExploration({ hote: 'ville.fr' });
    file.ajouter('https://ville.fr/a', 'Page quelconque du sitemap', 0);
    file.ajouter('https://ville.fr/b', 'Autre page du sitemap', 0);
    // La page de projets recommande la première : elle passe devant
    file.ajouter('https://ville.fr/b', 'Fiche du projet', 3);
    expect(file.vague(1)[0].url).toBe('https://ville.fr/b');
  });

});

/**
 * Ce que la revue adversariale du modèle d'exploration a confirmé puis corrigé.
 */
test.describe('0.82 - Démo : les décisions fines du rapprochement et de la file', () => {

  const VIDES = /^(projet|travaux|amenagement|renovation|construction|nouvelle|ville|commune)$/;

  /* Fusionner à tort fait DISPARAÎTRE un projet de la carte : des lieux
     explicitement différents interdisent la fusion d'office, l'arbitre tranche. */
  test('0.82.1 - Deux chantiers de lieux différents ne sont jamais fondus d\'office', () => {
    expect(rapprochement(
      { title: 'Requalification de la rue Jean Jaures', geo_query: 'rue Jean Jaures' },
      { title: 'Residence de la rue Jean Jaures', geo_query: 'avenue de la Gare' },
      VIDES,
    )).toBe('doute');
  });

  test('0.82.2 - Un titre sans mot caractéristique au même lieu part en arbitrage', () => {
    expect(rapprochement(
      { title: 'Les travaux', geo_query: 'place du marche' },
      { title: 'Le projet de la ville', geo_query: 'place du marche' },
      VIDES,
    )).toBe('doute');
  });

  test('0.82.3 - La ligature oe ne casse pas la comparaison des titres', () => {
    expect(rapprochement(
      { title: 'Cœur de bourg, phase deux', geo_query: 'centre' },
      { title: 'Amenagement du coeur de bourg', geo_query: 'centre' },
      VIDES,
    )).toBe('oui');
  });

  /* La citation-preuve reste appariée à SA source : mélanger la plus longue
     citation avec la première adresse présentait la phrase d'un avis de marché
     comme relevée sur le site de la commune. */
  test('0.82.4 - La citation et sa source restent appariées à la fusion', () => {
    const fondu = fondre([
      { title: 'Ecoquartier de la gare', description: 'Complet.', geo_query: 'gare', origine: 'commune', source_url: 'https://ville.fr/p', evidence_quote: '' },
      { title: 'Travaux ecoquartier gare', description: 'x', geo_query: 'gare', origine: 'marche', source_url: 'https://boamp.fr/9', evidence_quote: 'Construction de 50 logements sur le site de la gare.' },
    ], VIDES);
    // Le porteur (commune) n'a pas de citation : on prend celle de l'avis, ET son adresse avec
    expect(fondu.evidence_quote).toContain('50 logements');
    expect(fondu.source_url).toBe('https://boamp.fr/9');
  });

  test('0.82.5 - La date d\'avis retenue est la plus récente du groupe', () => {
    const fondu = fondre([
      { title: 'Renovation du gymnase municipal Jean Moulin', geo_query: 'gymnase', origine: 'marche', source_url: 'https://boamp.fr/1', marcheDate: '2024-05-01' },
      { title: 'Gymnase Jean Moulin, seconde tranche', geo_query: 'gymnase', origine: 'marche', source_url: 'https://boamp.fr/2', marcheDate: '2026-03-15' },
    ], VIDES);
    expect(fondu.marcheDate).toBe('2026-03-15');
  });

  /* File pleine : une recommandation chaude évince la pire attente froide,
     jamais l'inverse. */
  test('0.82.6 - Au plafond, une recommandation chaude prend la place d\'une froide', () => {
    const file = new FileExploration({ hote: 'ville.fr', plafond: 3 });
    file.ajouter('https://ville.fr/froide-1', 'Sitemap', 0);
    file.ajouter('https://ville.fr/froide-2', 'Sitemap', 0);
    file.ajouter('https://ville.fr/froide-3', 'Sitemap', 0);
    expect(file.ajouter('https://ville.fr/fiche-projet', 'Fiche designee par un sommaire', 3)).toBe(true);
    expect(file.restantes).toBe(3);
    // Une froide de plus est refusée tant que la file est pleine : elle ne
    // surclasse personne
    expect(file.ajouter('https://ville.fr/froide-4', 'Sitemap', 0)).toBe(false);
    expect(file.vague(1)[0].url).toBe('https://ville.fr/fiche-projet');
  });

});

/**
 * La résilience de l'exploration aux coupures.
 * Une rafale de coupures réseau ne doit ni perdre des pages, ni faire tourner
 * l'exploration en rond sur une adresse durablement en panne.
 */
test.describe('0.81 - Démo : une lecture qui échoue est retentée, une fois', () => {

  test('0.81.1 - Une page en échec retourne en file et repart à la vague suivante', () => {
    const file = new FileExploration({ hote: 'ville.fr' });
    file.ajouter('https://ville.fr/projets/ecole', 'École', 2);
    const [candidate] = file.vague(1);
    expect(file.restantes).toBe(0);
    expect(file.remettre(candidate)).toBe(true);
    expect(file.restantes).toBe(1);
    // Elle repart, et n'est plus considérée comme déjà lue
    expect(file.dejaOuverte('https://ville.fr/projets/ecole')).toBe(false);
    expect(file.vague(1)[0].url).toBe('https://ville.fr/projets/ecole');
  });

  test('0.81.2 - Une seule seconde chance : le troisième échec est définitif', () => {
    const file = new FileExploration({ hote: 'ville.fr' });
    file.ajouter('https://ville.fr/page-en-panne', 'Page', 0);
    const [c1] = file.vague(1);
    expect(file.remettre(c1)).toBe(true);
    const [c2] = file.vague(1);
    // c2 porte le compteur d'essais : plus de remise possible
    expect(file.remettre(c2)).toBe(false);
    expect(file.restantes).toBe(0);
  });

  test('0.81.3 - Le compteur d\'essais survit à un aller-retour en base', () => {
    const file = new FileExploration({ hote: 'ville.fr' });
    file.ajouter('https://ville.fr/p', 'Page', 0);
    file.remettre(file.vague(1)[0]);
    const repris = FileExploration.restaurer(JSON.parse(JSON.stringify(file.serialiser())));
    expect(repris.remettre(repris.vague(1)[0])).toBe(false);
  });

});

/**
 * L'étage intercommunal : les opérations structurantes d'une petite commune
 * vivent souvent sur le site de sa métropole ou de sa communauté de communes.
 */
test.describe('0.83 - Démo : le nom de l\'intercommunalité se retrouve dans l\'annuaire', () => {

  test('0.83.1 - Le nom distinctif survit aux variantes d\'écriture', () => {
    // geo.api.gouv.fr dit « CC du Pays d'Iroise », l'annuaire dit
    // « Communauté de communes - Pays d'Iroise » : seule la partie distinctive
    // permet de faire le pont.
    expect(nomDistinctifEpci("CC du Pays d'Iroise")).toBe("Pays d'Iroise");
    expect(nomDistinctifEpci('Métropole de Lyon')).toBe('Lyon');
    expect(nomDistinctifEpci("Communauté d'agglomération du Bassin de Bourg-en-Bresse")).toBe('Bassin de Bourg-en-Bresse');
    expect(nomDistinctifEpci('CU Le Havre Seine Métropole')).toBe('Le Havre Seine Métropole');
  });

});

/**
 * Le logo de la commune. Relevé en base avant correction : sur 78 espaces
 * d'essai avec un fichier, 53 portaient l'icône de l'onglet du navigateur à la
 * place du logo, parce que l'icône était mêlée aux candidats et que le juge
 * visuel, aveugle aux .svg (le format le plus fréquent des logos de mairie),
 * la désignait faute de mieux. Et Rennes n'avait aucun candidat : ses
 * attributs HTML sont sans guillemets.
 */
test.describe('0.84 - Démo : le logo de la commune', () => {
  const { findSiteLogo, attributHtml, couleurDepuisSvg } = _internals;
  const BASE = 'https://www.ville.fr/';

  test('0.84.1 - Les attributs se lisent avec ou sans guillemets', () => {
    expect(attributHtml('<img src="/a.png" class=\'logo x\' width=178>', 'src')).toBe('/a.png');
    expect(attributHtml('<img src="/a.png" class=\'logo x\' width=178>', 'class')).toBe('logo x');
    expect(attributHtml('<img src=/assets/logo.svg alt="Ville" width=178>', 'src')).toBe('/assets/logo.svg');
    expect(attributHtml('<img src=/assets/logo.svg alt="Ville" width=178>', 'width')).toBe('178');
    // data-src n'est pas src : le nom d'attribut est borné par un espace
    expect(attributHtml('<img data-src="/lazy.png">', 'src')).toBe('');
    expect(attributHtml('<img data-src="/lazy.png">', 'data-src')).toBe('/lazy.png');
  });

  test('0.84.2 - Un logo en attributs sans guillemets, nommé par le lien qui l\'entoure, est trouvé (Rennes)', () => {
    const html = '<header><div class=header-mobile-logo><a class=logo href=https://www.ville.fr/ title="Accueil">'
      + '<img src=/assets/images/ville-metropole_noir.svg alt="Ville et Métropole" height=34 width=178></a></div></header>';
    expect(findSiteLogo(html, BASE)).toEqual(['https://www.ville.fr/assets/images/ville-metropole_noir.svg']);
  });

  test('0.84.3 - Le mot logo porté par le bloc parent suffit, mais pas un bloc lointain', () => {
    const proche = '<a class="site-logo" href="/"><picture><source srcset="/marque.webp"><img src="/marque.png" alt="Ville"></picture></a>';
    expect(findSiteLogo(proche, BASE)).toEqual(['https://www.ville.fr/marque.png']);
    const lointain = '<div class="logo"><p>Texte</p></div><section><img src="/photo.jpg" alt="Photo"></section>';
    expect(findSiteLogo(lointain, BASE)).toEqual([]);
  });

  test('0.84.4 - Le logo SVG de l\'en-tête passe devant les logos de labels en PNG', () => {
    const html = '<header><a class="logo" href="/"><img src="/img/logo-ville.svg" alt="Ville" width="200"></a></header>'
      + '<footer><img src="/img/logo-label-villes-fleuries.png" alt="Villes fleuries" width="200"></footer>';
    const c = findSiteLogo(html, BASE);
    expect(c[0]).toBe('https://www.ville.fr/img/logo-ville.svg');
  });

  test('0.84.5 - La couleur de marque se lit dans un logo SVG, en ignorant blancs, noirs et gris', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#FFFFFF" d="M0 0"/><path fill="#1a1a1a" d="M0 0"/>'
      + '<path fill="#e30613" d="M0 0"/><path fill="#e30613" d="M1 1"/><path style="fill:#888888" d="M2 2"/>'
      + '<stop stop-color="rgb(0, 91, 172)"/></svg>';
    expect(couleurDepuisSvg(svg)).toBe('#e30613');
    expect(couleurDepuisSvg('<svg><path fill="#fff"/><path fill="#333"/></svg>')).toBeNull();
    expect(couleurDepuisSvg('<svg><path fill="#0af"/></svg>')).toBe('#00aaff');
  });
});
