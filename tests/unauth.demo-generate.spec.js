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
  scoreProjectLink, unescapeBoamp, odonymesDe, distinctiveWords,
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

  test('0.67.4 - scoreProjectLink favorise les pages profondes', () => {
    const superficiel = scoreProjectLink({ url: 'https://ville.fr/actualites', label: 'Actualités' });
    const profond = scoreProjectLink({ url: 'https://ville.fr/projets/urbanisme/place-centrale', label: 'Projet place centrale' });
    expect(profond).toBeGreaterThan(superficiel);
    // Une URL invalide ne fait pas tomber le calcul
    expect(Number.isFinite(scoreProjectLink({ url: 'pas une url', label: '' }))).toBe(true);
  });

  test('0.67.5 - unescapeBoamp désencode le double échappement des annonces', () => {
    expect(unescapeBoamp('&amp;lt;p&amp;gt;Travaux de voirie&amp;lt;/p&amp;gt;')).toBe('Travaux de voirie');
    expect(unescapeBoamp('<p>Rue   Garibaldi</p>')).toBe('Rue Garibaldi');
    expect(unescapeBoamp('')).toBe('');
    expect(unescapeBoamp(null)).toBe('');
  });

  test('0.67.6 - odonymesDe relève au plus trois voies', () => {
    const out = odonymesDe('Travaux avenue Jean Jaures, rue de la Republique, boulevard des Belges et place Bellecour.');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
    for (const v of out) expect(v.length).toBeGreaterThanOrEqual(8);
    // Pas de doublon
    expect(new Set(out).size).toBe(out.length);
    expect(odonymesDe('')).toEqual([]);
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
