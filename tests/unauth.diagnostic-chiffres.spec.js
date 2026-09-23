// @ts-check
import { test, expect } from '@playwright/test';
import { _internals } from '../admin/sections/diagnostic/analysis.js';
import { dg } from '../admin/sections/diagnostic/state.js';

/**
 * Diagnostic terrain : les chiffres du rapport.
 *
 * L'en-tête du module le dit : « Les nombres sont calculés ici, l'IA ne fait
 * que restituer ». C'est le module vendu en supplément, et il était couvert à
 * 8 %. Un décompte faux ne se voit pas : le rapport reste beau et plausible.
 *
 * Tout ce fichier est du calcul pur, sans carte ni WebGL ni appel IA. Les
 * fixtures reprennent les données réelles (titres du catalogue data.gouv,
 * en-têtes des fichiers nationaux, tableaux Windows-1252, fichiers en
 * Lambert 93) : des données idéales ne montrent pas les défauts.
 */

const { breakdown } = _internals;

/** Deux couches typées comme en production (config popup + champ catégorie). */
const COUCHES = [
  {
    id: 'L1',
    label: 'Signalements voirie',
    style: { color: '#DC2626', category_field: 'type' },
    popup: { title_field: 'titre', fields: ['titre', 'description', 'rue', 'commune'] },
  },
  {
    id: 'L2',
    label: 'Comptages vélo',
    style: { color: '#2563EB' },
    popup: { title_field: 'nom', fields: ['nom', 'commentaire'] },
  },
];

const pt = (layerId, props) => ({ __layerId: layerId, properties: props });

test.beforeEach(() => {
  dg.layers = JSON.parse(JSON.stringify(COUCHES));
});

test.describe('0.51 - Diagnostic : décomptes de zone', () => {

  test('0.51.1 - breakdown compte par couche et classe du plus fourni au moins fourni', () => {
    const rows = breakdown([
      pt('L2', {}), pt('L1', {}), pt('L1', {}), pt('L2', {}), pt('L1', {}),
    ]);
    expect(rows.map((r) => [r.layer.id, r.count])).toEqual([['L1', 3], ['L2', 2]]);
  });

  test("0.51.2 - Un point d'une couche disparue est ignoré, pas compté à zéro", () => {
    const rows = breakdown([pt('L1', {}), pt('LX', {}), pt('LX', {})]);
    expect(rows.map((r) => r.layer.id)).toEqual(['L1']);
  });

  test('0.51.3 - Une zone vide ne produit aucune ligne', () => {
    expect(breakdown([])).toEqual([]);
  });

});

/* ── Données de référence, jointure, style gradué ─────────────── */

import {
  CsvParser, parseCsv, numericFields, guessKind, quantileStops, aggregateMetrics,
  joinKey, applyJoin, guessJoinColumns, restrictProps, typedValue,
  maxOf, decodeText, readTextFile, streamCsv, streamCsvFromStream, guessLatLng,
  projectionProblem, csvProjectionProblem, prepareFeatures, readableError, countLabel,
  loadLayerData,
} from '../admin/sections/diagnostic/data.js';
import { colorExpression, lineWidthExpression, colorRamp } from '../admin/sections/diagnostic/map.js';
import { layerKind, layerMetrics } from '../admin/sections/diagnostic/state.js';

const { partitionSelection } = _internals;

const feat = (props, geometry = { type: 'Point', coordinates: [5.7, 45.2] }) => ({ type: 'Feature', geometry, properties: props, __pt: [5.7, 45.2] });

/** Octets d'un texte écrit en Windows-1252, comme un CSV enregistré par Excel en France. */
const cp1252 = (s) => Uint8Array.from([...s].map((c) => ({ 'é': 0xE9, 'è': 0xE8, 'ê': 0xEA, 'É': 0xC9, 'ç': 0xE7, 'à': 0xE0, '’': 0x92, 'œ': 0x9C })[c] ?? c.charCodeAt(0)));

/** Un flux d'octets découpé en morceaux de `size` octets. */
const chunked = (bytes, size) => new ReadableStream({
  start(controller) {
    for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
    controller.close();
  },
});

test.describe('0.54 - Diagnostic : lecture des données (CSV en flux, jointure, champs)', () => {

  test('0.54.1 - Le CSV lu par morceaux donne le même résultat que le CSV lu d\'un bloc', () => {
    const text = 'nom;valeur;"desc"\r\n"Cap ""1""";45,5;"ligne 1\nsuite"\r\nB;46;plain\r\n\r\nC,x;47;"a;b"\n';
    const ref = parseCsv(text);
    for (const size of [1, 3, 7, 1000]) {
      const rows = [];
      const p = new CsvParser((r) => rows.push(r));
      for (let i = 0; i < text.length; i += size) p.push(text.slice(i, i + size));
      p.end();
      expect(rows[0]).toEqual(ref.headers);
      expect(rows.slice(1)).toEqual(ref.records.map((r) => ref.headers.map((h) => r[h])));
    }
    expect(ref.records[0].nom).toBe('Cap "1"');
    expect(ref.records[0].desc).toBe('ligne 1\nsuite');
    expect(ref.records[2].nom).toBe('C,x');
  });

  test('0.54.2 - Un CSV sans retour à la ligne final garde sa dernière ligne', () => {
    const rows = [];
    const p = new CsvParser((r) => rows.push(r));
    p.push('a,b\n1,');
    p.push('2\n3,4');
    p.end();
    expect(rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  test('0.54.3 - Les champs numériques sont ceux dont les valeurs renseignées sont des nombres', () => {
    const feats = [
      feat({ n: 12, s: 'abc', mixte: '3', vide: '' }),
      feat({ n: '13,5', s: 'def', mixte: 'x', vide: '' }),
      feat({ n: 14, s: 'ghi', mixte: '5', vide: '' }),
    ];
    expect(numericFields(feats)).toEqual(['n']);
  });

  test('0.54.4 - La nature présumée suit la présence d\'un vrai texte', () => {
    const comptages = [feat({ id: 1, total: 120, type: 'Ride' }), feat({ id: 2, total: 90, type: 'Ride' })];
    expect(guessKind(comptages)).toBe('reference');
    const signalements = [feat({ titre: 'S1', description: 'La chaussee est degradee ici' }), feat({ titre: 'S2', description: 'Un feu reste au rouge trop longtemps' })];
    expect(guessKind(signalements)).toBe('temoignages');
    expect(guessKind([])).toBe('temoignages');
  });

  test('0.54.5 - Les paliers du dégradé sont des quantiles, insensibles à une valeur extrême', () => {
    const feats = [];
    for (let i = 1; i <= 100; i++) feats.push(feat({ v: i }));
    feats.push(feat({ v: 50000 }));
    const stops = quantileStops(feats, 'v');
    expect(stops.length).toBeGreaterThanOrEqual(4);
    expect(stops[0]).toBeGreaterThanOrEqual(1);
    expect(stops[stops.length - 1]).toBeLessThanOrEqual(100); // le 95e centile ignore l'extrême
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1]);
    // Champ vide ou constant : pas de dégradé possible
    expect(quantileStops([feat({ v: 3 }), feat({ v: 3 })], 'v')).toEqual([]);
    expect(quantileStops(feats, 'absent')).toEqual([]);
  });

  test('0.54.6 - Les chiffres de zone sont totalisés, moyennés ou maximisés, jamais inventés', () => {
    const feats = [feat({ t: 10, s: 4 }), feat({ t: '30', s: 6 }), feat({ t: 'n/a', s: '' })];
    const out = aggregateMetrics(feats, [
      { field: 't', agg: 'sum' }, { field: 's', agg: 'mean' }, { field: 't', agg: 'max' },
      { field: 'absent', agg: 'sum' }, { field: 's', agg: 'inconnu' },
    ]);
    expect(out).toEqual([
      { field: 't', agg: 'sum', value: 40, n: 2 },
      { field: 's', agg: 'mean', value: 5, n: 2 },
      { field: 't', agg: 'max', value: 30, n: 2 },
      { field: 's', agg: 'sum', value: 10, n: 2 },
    ]);
    expect(aggregateMetrics(feats, null)).toEqual([]);
  });

  test('0.54.7 - La clé de jointure ignore la casse et les zéros de tête', () => {
    expect(joinKey('0012')).toBe(joinKey(12));
    expect(joinKey(' ABC ')).toBe(joinKey('abc'));
    expect(joinKey(null)).toBe('');
    expect(typedValue('12,5')).toBe(12.5);
    expect(typedValue('12a')).toBe('12a');
    expect(typedValue('')).toBeNull();
  });

  test('0.54.8 - La jointure enrichit les entités appariées et retire (ou garde) les autres', () => {
    const feats = [feat({ edgeUID: 101, nom: 'A' }), feat({ edgeUID: 102, nom: 'B' }), feat({ edgeUID: 103, nom: 'C' })];
    const index = new Map([['101', { total: 4715 }], ['102', { total: 170 }]]);
    const strict = applyJoin(feats, index, 'edgeUID');
    expect(strict.matched).toBe(2);
    expect(strict.unmatched).toBe(1);
    expect(strict.features.map((f) => f.properties)).toEqual([{ edgeUID: 101, nom: 'A', total: 4715 }, { edgeUID: 102, nom: 'B', total: 170 }]);
    const lax = applyJoin(feats, index, 'edgeUID', { keepUnmatched: true });
    expect(lax.features).toHaveLength(3);
    expect(lax.features[2].properties).toEqual({ edgeUID: 103, nom: 'C' });
  });

  test('0.54.9 - Les colonnes communes sont devinées au nom près (edgeUID ↔ edge_uid)', () => {
    expect(guessJoinColumns(['edgeUID', 'osmId'], ['edge_uid', 'year', 'total'])).toEqual({ layerKey: 'edgeUID', tableKey: 'edge_uid' });
    expect(guessJoinColumns(['nom', 'code_insee'], ['commune', 'insee_code', 'pop'])).toEqual({ layerKey: 'code_insee', tableKey: 'insee_code' });
  });

  test('0.54.10 - Les champs conservés restreignent les propriétés sans toucher à la géométrie', () => {
    const out = restrictProps([feat({ a: 1, b: 2, c: 3 })], ['c', 'a']);
    expect(out[0].properties).toEqual({ a: 1, c: 3 });
    expect(out[0].geometry.type).toBe('Point');
  });

  test('0.54.11 - Le style gradué colore et épaissit selon la valeur, sinon couleur et épaisseur fixes', () => {
    const style = { mode: 'graduated', color: '#2563EB', value_field: 'total' };
    const ramp = { stops: [10, 100, 1000], colors: colorRamp('#2563EB', 3) };
    const color = colorExpression(style, ramp);
    expect(color[0]).toBe('interpolate');
    expect(color).toContain(1000);
    expect(colorRamp('#2563EB', 3)).toHaveLength(3);
    expect(colorRamp('#2563EB', 3)[1]).toBe('#2563eb');
    const width = lineWidthExpression(style, ramp);
    expect(Array.isArray(width)).toBe(true);
    // Sans paliers (champ vide), on retombe sur la couleur unique
    expect(colorExpression(style, null)).toBe('#2563EB');
    expect(lineWidthExpression(style, null)).toBe(2.5);
    expect(lineWidthExpression({ mode: 'single' }, ramp)).toBe(2.5);
  });

  test('0.54.12 - Un maximum sur 200 000 valeurs se calcule, et une valeur sous le minimum configuré est écartée', () => {
    // Math.max(...valeurs) levait une erreur au-delà d'environ 65 000 valeurs
    // (une zone qui couvre une grande partie d'un export Strava).
    const many = Array.from({ length: 200000 }, (_, i) => feat({ v: i }));
    expect(maxOf(many.map((f) => f.properties.v))).toBe(199999);
    expect(aggregateMetrics(many, [{ field: 'v', agg: 'max' }])).toEqual([{ field: 'v', agg: 'max', value: 199999, n: 200000 }]);
    // Waze note -1 le retard d'une circulation bloquée : ce n'est pas un retard.
    const jams = [feat({ retard_s: -1 }), feat({ retard_s: 120 }), feat({ retard_s: 60 })];
    expect(aggregateMetrics(jams, [{ field: 'retard_s', agg: 'mean', min: 0 }])).toEqual([{ field: 'retard_s', agg: 'mean', value: 90, n: 2 }]);
    // Une agrégation au nom d'une propriété de l'objet n'est pas une agrégation.
    expect(aggregateMetrics(jams, [{ field: 'retard_s', agg: 'toString' }])[0].agg).toBe('sum');
  });

  test('0.54.13 - Un tableau enregistré par Excel en Windows-1252 garde ses accents', async () => {
    const bytes = cp1252('nom;catégorie\nRue de l’Église;Stationnement gênant\n');
    expect(decodeText(bytes)).toContain('Rue de l’Église');
    expect(await readTextFile(new File([bytes], 'doleances.csv'))).toContain('Stationnement gênant');
    // Lecture en flux d'un fichier (tableau rattaché, aperçu)
    const rows = [];
    const headers = await streamCsv(new File([bytes], 'doleances.csv'), (cells) => { rows.push(cells); });
    expect(headers).toEqual(['nom', 'catégorie']);
    expect(rows[0]).toEqual(['Rue de l’Église', 'Stationnement gênant']);
    // Des milliers de lignes ASCII puis le premier accent, en morceaux de 7 octets :
    // le texte déjà lu ne change pas, la suite est relue en Windows-1252.
    const long = cp1252(`nom;valeur\n${'a;1\n'.repeat(5000)}Élévation;2\n`);
    const tail = [];
    await streamCsvFromStream(chunked(long, 7), (cells) => { tail.push(cells); });
    expect(tail).toHaveLength(5001);
    expect(tail[5000]).toEqual(['Élévation', '2']);
    // Un vrai UTF-8, coupé au milieu de ses caractères, reste de l'UTF-8.
    const utf8 = [];
    await streamCsvFromStream(chunked(new TextEncoder().encode('nom;v\nÉté;1\nçà;2\n'), 1), (cells) => { utf8.push(cells); });
    expect(utf8).toEqual([['Été', '1'], ['çà', '2']]);
  });

  test('0.54.14 - La latitude et la longitude ne sont jamais la même colonne', () => {
    expect(guessLatLng(['nom', 'latitude', 'longitude'])).toEqual({ lat: 'latitude', lng: 'longitude' });
    expect(guessLatLng(['nom', 'x', 'y'])).toEqual({ lat: 'y', lng: 'x' });
    // Rien de convaincant : aucune colonne, l'administrateur choisit (avant : la première colonne pour les deux).
    expect(guessLatLng(['nom', 'lieu', 'commentaire'])).toEqual({ lat: '', lng: '' });
    const { lat, lng } = guessLatLng(['coord_lat', 'nom']);
    expect(lat).toBe('coord_lat');
    expect(lng).not.toBe(lat);
  });

  test('0.54.15 - Un fichier en Lambert 93 est reconnu, et une couche déjà enregistrée ainsi n\'a plus de position hors des degrés', () => {
    const lambert = { type: 'FeatureCollection', features: [feat({ nom: 'A' }, { type: 'Point', coordinates: [842000, 6519000] })] };
    expect(projectionProblem(lambert)).toBe(true);
    const declared = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } }, features: [] };
    expect(projectionProblem(declared)).toBe(true);
    const wgs84 = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }, features: [feat({}, { type: 'Point', coordinates: [4.83, 45.76] })] };
    expect(projectionProblem(wgs84)).toBe(false);
    // Un CSV en X / Y Lambert 93
    expect(csvProjectionProblem([{ X: '842000', Y: '6519000' }, { X: '843000,5', Y: '6520000' }], 'Y', 'X')).toBe(true);
    expect(csvProjectionProblem([{ lat: '45,76', lng: '4,83' }], 'lat', 'lng')).toBe(false);
    // Chargement d'une couche mêlant les deux : seule la position en degrés reste.
    const mixed = prepareFeatures({ features: [feat({ id: 1 }, { type: 'Point', coordinates: [4.83, 45.76] }), feat({ id: 2 }, { type: 'Point', coordinates: [842000, 6519000] })] });
    expect(mixed.map((f) => f.properties.id)).toEqual([1]);
  });

  test('0.54.17 - Une couche enregistrée entièrement en Lambert 93 dit pourquoi elle ne s\'affiche pas', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [feat({ nom: 'A' }, { type: 'Point', coordinates: [842000, 6519000] })] }), { status: 200 });
    try {
      await expect(loadLayerData({ source_type: 'url', source_ref: 'https://opendata.example/pistes-l93.geojson' })).rejects.toThrow(/Lambert 93.*Retirez-la/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('0.54.16 - Une erreur technique ne s\'affiche jamais telle quelle, un message écrit pour l\'écran si', () => {
    expect(readableError(new Error('Ce tableau est vide ou illisible.'), 'repli')).toBe('Ce tableau est vide ou illisible.');
    expect(readableError(new TypeError('Failed to fetch'), 'repli')).toBe('La connexion a échoué. Vérifiez votre réseau, puis réessayez.');
    expect(readableError(Object.assign(new Error('new row violates row-level security policy'), { code: '42501' }), 'repli')).toBe('repli');
    expect(readableError({ message: 'JWT expired', details: '' }, 'repli')).toBe('repli');
    expect(readableError(new SyntaxError('Unexpected token < in JSON'), 'repli')).toBe('repli');
    expect(countLabel(1, [feat({})])).toBe('1 point');
    expect(countLabel(12, [{ geometry: { type: 'LineString' } }])).toBe('12 tronçons');
    expect(countLabel(3, [])).toBe('3 éléments');
  });
});

test.describe('0.55 - Diagnostic : les données de référence ne sont pas des points à lire', () => {

  const COUCHES_MIXTES = [
    { id: 'L1', label: 'Signalements', style: { color: '#DC2626' }, popup: { title_field: 'titre', fields: ['titre', 'description'] } },
    { id: 'R1', label: 'Flux cyclistes 2025', style: { color: '#2563EB', mode: 'graduated', value_field: 'total' }, ai_context: 'Passages Strava', popup: { kind: 'reference', metrics: [{ field: 'total', agg: 'sum' }, { field: 'vitesse', agg: 'mean' }] } },
  ];

  test.beforeEach(() => {
    dg.layers = JSON.parse(JSON.stringify(COUCHES_MIXTES));
  });

  test('0.55.1 - La nature et les chiffres de zone se lisent dans la config de la couche', () => {
    expect(layerKind(dg.layers[0])).toBe('temoignages');
    expect(layerKind(dg.layers[1])).toBe('reference');
    expect(layerKind(null)).toBe('temoignages');
    expect(layerMetrics(dg.layers[1]).map((m) => m.field)).toEqual(['total', 'vitesse']);
    expect(layerMetrics({ popup: { metrics: [{ agg: 'sum' }, null] } })).toEqual([]);
  });

  test('0.55.2 - Une sélection se sépare en témoignages (plafonnés) et contexte (hors plafond)', () => {
    const all = [
      pt('L1', { titre: 'S1', description: 'Chaussee degradee sur vingt metres' }),
      pt('R1', { total: 100, vitesse: 4 }),
      pt('R1', { total: 300, vitesse: 6 }),
      pt('LX', { x: 1 }), // couche disparue : traitée comme témoignage, jamais perdue
    ];
    const { features, context } = partitionSelection(all);
    expect(features.map((f) => f.__layerId)).toEqual(['L1', 'LX']);
    expect(context.map((f) => f.__layerId)).toEqual(['R1', 'R1']);
  });
});

/* ── Dépôt d'un export complet : archive, tri des fichiers, formats reconnus ── */

import { readFileSync } from 'node:fs';
import { readZipEntries, expandFiles, classifyFiles, latestValue } from '../admin/sections/diagnostic/data.js';
import { matchRecipe, resolveColumn, RECIPES } from '../admin/sections/diagnostic/recipes.js';

const EXPORT_ZIP = 'tests/fixtures/diagnostic-export-strava.zip';

test.describe('0.56 - Diagnostic : un export déposé tel quel', () => {

  test('0.56.1 - L\'archive est lue sans dépendance, dossiers et fichiers macOS ignorés', async () => {
    const files = await readZipEntries(new Uint8Array(readFileSync(EXPORT_ZIP)).buffer);
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['abc123.csv', 'abc123.dbf', 'abc123.prj', 'abc123.shp', 'abc123.shx', 'abc123.txt']);
    const csv = files.find((f) => f.name === 'abc123.csv');
    expect((await csv.text()).split('\n')[0]).toContain('edge_uid,activity_type,year');
    const prj = files.find((f) => f.name === 'abc123.prj');
    expect(await prj.text()).toContain('WGS_1984');
  });

  test('0.56.2 - Un lot mêlant archive et fichiers est aplati, les fichiers cachés écartés', async () => {
    const zip = new File([readFileSync(EXPORT_ZIP)], 'export.zip');
    const files = await expandFiles([zip, new File(['{}'], 'autre.geojson'), new File([''], '.DS_Store')]);
    expect(files.map((f) => f.name)).toContain('abc123.shp');
    expect(files.map((f) => f.name)).toContain('autre.geojson');
    expect(files.map((f) => f.name)).not.toContain('.DS_Store');
  });

  test('0.56.3 - Le tri reconnaît le shapefile et ses compagnons, et met le tableau à part', () => {
    const mk = (n) => new File([''], n);
    const { geo, tables } = classifyFiles([mk('a.csv'), mk('x.shp'), mk('x.dbf'), mk('x.prj'), mk('x.shx'), mk('notes.txt')]);
    expect(geo.kind).toBe('shapefile');
    expect(geo.name).toBe('x');
    expect(geo.dbf.name).toBe('x.dbf');
    expect(geo.prj.name).toBe('x.prj');
    expect(tables.map((f) => f.name)).toEqual(['a.csv']);
    // Un GeoJSON seul
    expect(classifyFiles([mk('pts.geojson')]).geo).toMatchObject({ kind: 'geojson', name: 'pts' });
    // Un CSV seul = des points ; deux CSV sans géographie = rien
    expect(classifyFiles([mk('capteurs.csv')]).geo).toMatchObject({ kind: 'csv', name: 'capteurs' });
    expect(classifyFiles([mk('a.csv'), mk('b.csv')]).geo).toBeNull();
  });

  test('0.56.4 - La valeur la plus récente est la plus grande numériquement, quel que soit l\'ordre', () => {
    expect(latestValue([['2021', 5], ['2025', 9], ['2023', 2]])).toBe('2025');
    expect(latestValue([['b', 1], ['a', 2]])).toBe('b');
    expect(latestValue([])).toBe('');
  });

  test('0.56.5 - L\'export Strava Metro est reconnu à ses colonnes, à la casse près', () => {
    const r = matchRecipe({ geoFields: ['edgeuid', 'osmId'], tableHeaders: ['EDGE_UID', 'year', 'Total_Trip_Count', 'x'] });
    expect(r?.id).toBe('strava-metro-edges');
    expect(matchRecipe({ geoFields: ['edgeUID'], tableHeaders: ['edge_uid', 'year'] })).toBeNull();
    expect(matchRecipe({ geoFields: ['nom'], tableHeaders: ['edge_uid', 'year', 'total_trip_count'] })).toBeNull();
    expect(resolveColumn(['Total_Trip_Count'], 'total_trip_count')).toBe('Total_Trip_Count');
    expect(resolveColumn(['a'], 'b')).toBe('');
  });

  test('0.56.6 - Chaque recette est complète : jointure, nature, style gradué sur une colonne reprise', () => {
    for (const r of RECIPES) {
      expect(r.join.columns).toContain(r.layer.style.value_field);
      expect(['temoignages', 'reference']).toContain(r.layer.kind);
      for (const m of r.layer.metrics) expect(r.join.columns).toContain(m.field);
      expect(r.layer.label).toContain('{value}');
      expect(r.layer.ai_context.length).toBeGreaterThan(20);
      // Le nom se lit dans une phrase : pas de trait d'union servant de tiret.
      expect(r.name).not.toMatch(/ - /);
    }
  });

  test('0.56.7 - Un dépôt qui contient plusieurs fichiers cartographiques est refusé, jamais réduit en silence', async () => {
    const mk = (n) => new File([''], n);
    expect(() => classifyFiles([mk('a.shp'), mk('a.dbf'), mk('b.shp'), mk('b.dbf')])).toThrow(/2 fichiers cartographiques \(a\.shp, b\.shp\)/);
    expect(() => classifyFiles([mk('pistes.geojson'), mk('bandes.geojson')])).toThrow(/2 fichiers cartographiques/);
    expect(() => classifyFiles([mk('x.shp'), mk('x.dbf'), mk('autre.geojson')])).toThrow(/2 fichiers cartographiques/);
    // Un shapefile accompagné d'un fichier .json de métadonnées reste un seul fichier cartographique.
    expect(classifyFiles([mk('x.shp'), mk('x.dbf'), mk('metadonnees.json')]).geo).toMatchObject({ kind: 'shapefile', name: 'x' });
    // Deux archives du même export : deux shapefiles, refusés.
    const zip = readFileSync('tests/fixtures/diagnostic-troncons.zip');
    const files = await expandFiles([new File([zip], 'a.zip'), new File([zip], 'b.zip')]);
    expect(() => classifyFiles(files)).toThrow(/fichiers cartographiques/);
  });
});

/* ── Catalogue de sources et moteur d'import ─────────────────────── */

import { SOURCES, FAMILIES, sourceOfLayer, sourceById } from '../admin/sections/diagnostic/sources.js';
import { cfgFromRecipe, joinColumnsFor, parseGeoJSONText } from '../admin/sections/diagnostic/engine.js';
import { cyclewayType, waysToGeoJSON } from '../admin/sections/diagnostic/sources/osm.js';
import { FUB_LAYERS, fubLayerCfg } from '../admin/sections/diagnostic/sources/fub.js';
import { scopeLabel } from '../admin/sections/diagnostic/sources/territory.js';
import { INTERNAL_SOURCES } from '../admin/sections/diagnostic/state.js';

test.describe('0.57 - Diagnostic : catalogue de sources', () => {

  test('0.57.1 - Chaque source est complète et rangée dans une famille connue', () => {
    const families = new Set(FAMILIES.map((f) => f.key));
    const ids = new Set();
    for (const s of SOURCES) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(families.has(s.family)).toBe(true);
      expect(['internal', 'auto', 'file', 'link', 'soon']).toContain(s.mode);
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.icon).toMatch(/^fa-/);
      expect(s.description.length).toBeGreaterThan(20);
      if (s.mode === 'file') {
        expect(RECIPES.some((r) => r.id === s.recipeId)).toBe(true);
        expect(s.tutorial.length).toBeGreaterThanOrEqual(2);
      }
      if (s.mode === 'link') expect(s.tutorial.length).toBeGreaterThanOrEqual(2);
      if (s.mode === 'internal') expect(s.internalKey).toBeTruthy();
      // Le chemin principal ne parle jamais SIG
      const txt = [s.name, s.description, s.sentence || '', ...(s.what || []).flat()].join(' ').toLowerCase();
      for (const mot of ['geojson', 'jointure', 'popup', 'shapefile', 'entité']) expect(txt).not.toContain(mot);
    }
  });

  test('0.57.2 - La source d\'une couche se retrouve par sa provenance', () => {
    expect(sourceOfLayer({ source_type: 'internal', source_ref: 'travaux' })?.id).toBe('travaux');
    expect(sourceOfLayer({ source_type: 'storage', popup: { source: 'fub' } })?.id).toBe('fub');
    expect(sourceOfLayer({ source_type: 'storage', popup: {} })).toBeNull();
    expect(sourceOfLayer(null)).toBeNull();
  });

  test('0.57.3 - Une recette décrit une couche complète, l\'année dans le nom', () => {
    const recipe = RECIPES.find((r) => r.id === 'strava-metro-edges');
    const cfg = cfgFromRecipe(recipe, '2025');
    expect(cfg.label).toBe('Flux Strava 2025');
    expect(cfg.kind).toBe('reference');
    expect(cfg.style.mode).toBe('graduated');
    expect(cfg.metrics.length).toBeGreaterThan(0);
    expect(joinColumnsFor(['edgeUID', 'osmId'], { headers: ['EDGE_UID', 'year'] }, recipe)).toEqual({ layerKey: 'edgeUID', tableKey: 'EDGE_UID' });
    expect(joinColumnsFor(['id_troncon', 'nom'], { headers: ['ID_TRONCON', 'bruit'] }, null)).toEqual({ layerKey: 'id_troncon', tableKey: 'ID_TRONCON' });
  });

  test('0.57.4 - OpenStreetMap : seules les voies aménagées deviennent des tronçons typés', () => {
    expect(cyclewayType({ highway: 'cycleway' })).toBe('Piste cyclable');
    expect(cyclewayType({ highway: 'residential', 'cycleway:right': 'lane' })).toBe('Bande cyclable');
    expect(cyclewayType({ highway: 'path', bicycle: 'designated' })).toBe('Voie verte');
    expect(cyclewayType({ highway: 'residential' })).toBe('');
    const fc = waysToGeoJSON({ elements: [
      { type: 'way', id: 1, tags: { highway: 'cycleway', name: 'Quai' }, geometry: [{ lon: 5.7, lat: 45.1 }, { lon: 5.71, lat: 45.11 }] },
      { type: 'way', id: 2, tags: { highway: 'residential' }, geometry: [{ lon: 5.7, lat: 45.1 }, { lon: 5.71, lat: 45.11 }] },
      { type: 'node', id: 3 },
    ] });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toMatchObject({ type: 'Piste cyclable', nom: 'Quai', sens_unique: 'non' });
  });

  test('0.57.5 - Baromètre FUB : trois couches de témoignages, la première affichée par défaut', () => {
    expect(FUB_LAYERS.map((l) => l.key)).toEqual(['points-rouges', 'points-verts', 'stationnements']);
    expect(FUB_LAYERS[0].file.test('points-rouges-38185.geojson')).toBe(true);
    expect(FUB_LAYERS[2].file.test('clusters-stationnements-38185.geojson')).toBe(false);
    const cfg = fubLayerCfg(FUB_LAYERS[0], 2025, 'Baromètre vélo 2025');
    expect(cfg.kind).toBe('temoignages');
    expect(cfg.label).toContain('2025');
    expect(cfg.popup.fields).toEqual(['description']);
    expect(cfg.default_on).toBe(true);
    expect(fubLayerCfg(FUB_LAYERS[1], 2025, 'x').default_on).toBe(false);
  });

  test('0.57.6 - Le libellé d\'un périmètre nomme la commune ou l\'intercommunalité avec ses communes', () => {
    const t = { commune: { nom: 'Grenoble' }, epci: { nom: 'Grenoble-Alpes-Métropole', communes: Array.from({ length: 49 }, () => ({})) } };
    expect(scopeLabel(t, 'commune')).toBe('Grenoble');
    expect(scopeLabel(t, 'epci')).toBe('Grenoble-Alpes-Métropole (49 communes)');
    expect(scopeLabel({ commune: { nom: 'X' }, epci: null }, 'epci')).toBe('X');
  });

  test('0.57.7 - Le catalogue ne promet que ce que le dossier calcule', () => {
    const what = (id) => (sourceById(id).what || []).flat().join(' ');
    // Strava : le tronçon le plus emprunté, jamais une somme, ni vitesse ni vélo électrique.
    expect(what('strava')).toContain('tronçon le plus emprunté');
    expect(what('strava')).not.toMatch(/total des passages|électrique|vitesse/);
    // Compteurs : un par un, jamais cumulés, et jamais « hier » pour un chiffre figé à l'ajout.
    expect(what('comptages')).toContain('jamais additionnés');
    expect(what('comptages')).not.toMatch(/cumul|\bhier\b|chaud|Eco-Visio/);
    expect(what('comptages')).toContain('la veille du relevé');
    // OpenStreetMap : des kilomètres, pas un nombre de tronçons.
    expect(what('osm-cycleways')).toContain('kilomètres');
    // Baromètre : tous les points n'ont pas de commentaire, et pas toujours trois couches.
    expect(sourceById('fub').sentence).toContain('quand il en a laissé un');
    expect(what('fub')).toContain('Jusqu\'à trois ensembles de points');
    // Waze : les chiffres que le dossier donne vraiment.
    expect(what('waze')).toContain('retard moyen');
    expect(what('waze')).not.toContain('nombre d\'alertes');
    // Le module Travaux sert aussi les chantiers à venir et terminés.
    expect(sourceById('travaux').name).toBe('Chantiers publiés');
    expect(INTERNAL_SOURCES.travaux.label).toBe('Chantiers publiés');
    expect(INTERNAL_SOURCES.travaux.defaults.ai_context).toMatch(/terminés, en cours ou à venir/);
    expect(INTERNAL_SOURCES.travaux.defaults.popup.fields).toEqual(expect.arrayContaining(['etat', 'date_debut', 'date_fin']));
  });

  test('0.57.8 - Un GeoJSON illisible ou en Lambert 93 est refusé en disant quoi faire', () => {
    expect(() => parseGeoJSONText('{"type": "FeatureCol')).toThrow(/illisible/);
    expect(() => parseGeoJSONText('{"type":"Topology"}')).toThrow(/données cartographiques/);
    const lambert = JSON.stringify({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } }, features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [842000, 6519000] }, properties: {} }] });
    expect(() => parseGeoJSONText(lambert)).toThrow(/Lambert 93/);
    expect(() => parseGeoJSONText(lambert)).toThrow(/WGS 84/);
    expect(parseGeoJSONText(JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [4.83, 45.76] }, properties: {} })).features).toHaveLength(1);
  });
});

/* ── Ordre des couches ─────────────────────────────────────────── */

import { moveInList } from '../admin/sections/diagnostic/layers.js';

test.describe('0.58 - Diagnostic : réordonner les couches', () => {

  test('0.58.1 - Déposer avant ou après une cible déplace la couche sans en perdre', () => {
    expect(moveInList(['a', 'b', 'c', 'd'], 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveInList(['a', 'b', 'c', 'd'], 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveInList(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b']);
  });

  test('0.58.2 - Une cible ou une source inconnue, ou la même couche, ne changent rien', () => {
    expect(moveInList(['a', 'b'], 'a', 'a', true)).toEqual(['a', 'b']);
    expect(moveInList(['a', 'b'], 'x', 'a', true)).toEqual(['a', 'b']);
    expect(moveInList(['a', 'b'], 'a', 'x', true)).toEqual(['a', 'b']);
  });
});

/* ── Accidents corporels (BAAC) et flux Waze ──────────────────── */

import { fetchBaacYear, baacLayerCfg, baacFilesByYear, baacPeriods, yearsLabel, GRAVITE_COLORS } from '../admin/sections/diagnostic/sources/baac.js';
import { alertsToGeoJSON, jamsToGeoJSON, isAllowedFeedUrl } from '../netlify/functions/lib/waze-feed.mjs';
import { wazeLayerCfgs, upgradeWazeMetrics, checkWazeFeed, WAZE_METRICS } from '../admin/sections/diagnostic/sources/waze.js';
import { listFubDatasets } from '../admin/sections/diagnostic/sources/fub.js';
import { renderPopup } from '../admin/sections/diagnostic/popups.js';

/** Remplace fetch le temps d'un essai. */
async function withFetch(impl, fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

test.describe('0.59 - Diagnostic : accidents corporels', () => {

  test('0.59.1 - Une année se lit en flux, filtrée sur les communes, victimes et véhicules rattachés', async () => {
    const fixtures = {
      caract: readFileSync('tests/fixtures/baac-caract.csv', 'utf8'),
      usagers: readFileSync('tests/fixtures/baac-usagers.csv', 'utf8'),
      vehicules: readFileSync('tests/fixtures/baac-vehicules.csv', 'utf8'),
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => new Response(fixtures[String(url).replace('mock://', '')], { status: 200 });
    try {
      const features = await fetchBaacYear(2024, { caract: 'mock://caract', usagers: 'mock://usagers', vehicules: 'mock://vehicules' }, ['69123']);
      expect(features).toHaveLength(2); // l'accident parisien est écarté
      const a1 = features.find((f) => f.properties.numero === '202400000001').properties;
      expect(a1).toMatchObject({ date: '07/05/2024', heure: '06:00', gravite: 'Blessé hospitalisé', usagers: 3, tues: 0, blesses_hospitalises: 1, blesses_legers: 1, pieton: 'oui', velo: 'oui', voiture: 'oui', deux_roues_motorise: 'non', lumiere: 'Plein jour', agglomeration: 'oui', intersection: 'Intersection en Y' });
      expect(features.find((f) => f.properties.numero === '202400000001').geometry.coordinates).toEqual([4.835, 45.764]);
      const a2 = features.find((f) => f.properties.numero === '202400000002').properties;
      expect(a2).toMatchObject({ gravite: 'Tué', tues: 1, deux_roues_motorise: 'oui', velo: 'non', lumiere: 'Nuit avec éclairage' });
      // Aucune commune retenue : rien, sans lire les autres fichiers
      expect(await fetchBaacYear(2024, { caract: 'mock://caract', usagers: 'mock://usagers', vehicules: 'mock://vehicules' }, ['00000'])).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('0.59.2 - La couche d\'accidents est une référence colorée par gravité, nommée d\'après les années lues', () => {
    const cfg = baacLayerCfg([2020, 2021, 2022, 2023, 2024], 'Lyon');
    expect(cfg.label).toBe('Accidents corporels 2020 à 2024 · Lyon');
    expect(cfg.kind).toBe('reference');
    expect(cfg.style.category_field).toBe('gravite');
    expect(cfg.style.cat_colors['Tué']).toBe(GRAVITE_COLORS['Tué']);
    expect(cfg.metrics.map((m) => m.field)).toEqual(['tues', 'blesses_hospitalises', 'blesses_legers', 'usagers']);
    expect(baacLayerCfg([2024], 'Lyon').label).toBe('Accidents corporels 2024 · Lyon');
    // Des années qui manquent ne sont jamais couvertes par « à » : le nom dit ce qui a été lu.
    const gap = baacLayerCfg([2020, 2023, 2024], 'Lyon');
    expect(gap.label).toBe('Accidents corporels 2020, 2023 et 2024 · Lyon');
    expect(gap.ai_context).toContain('années 2020, 2023 et 2024');
    expect(baacLayerCfg([2024], 'Lyon').ai_context).toContain('année 2024');
  });

  test('0.59.3 - Les titres réels du catalogue data.gouv donnent toutes les années publiées', () => {
    // Titres relevés le 23 septembre 2026 sur le jeu 53698f4ca3a729239d2036df.
    const resources = [
      { title: 'vehicules-immatricule-baac-2024.csv', url: 'immat-2024' },
      { title: 'Caract_2024.csv', url: 'caract-2024' },
      { title: 'Lieux_2024.csv', url: 'lieux-2024' },
      { title: 'Vehicules_2024.csv', url: 'vehicules-2024' },
      { title: 'Usagers_2024.csv', url: 'usagers-2024' },
      { title: 'vehicules-immatricules-baac-2023.csv', url: 'immat-2023' },
      { title: 'usagers-2023.csv', url: 'usagers-2023' },
      { title: 'vehicules-2023.csv', url: 'vehicules-2023' },
      { title: 'caract-2023.csv', url: 'caract-2023' },
      { title: 'usagers-2022.csv', url: 'usagers-2022' },
      { title: 'vehicules-2022.csv', url: 'vehicules-2022' },
      { title: 'carcteristiques-2022.csv', url: 'caract-2022' },
      { title: 'usagers-2021.csv', url: 'usagers-2021' },
      { title: 'vehicules-2021.csv', url: 'vehicules-2021' },
      { title: 'carcteristiques-2021.csv', url: 'caract-2021' },
      { title: 'caracteristiques-2020.csv', url: 'caract-2020' },
      { title: 'usagers-2020.csv', url: 'usagers-2020' },
      { title: 'vehicules-2020.csv', url: 'vehicules-2020' },
      { title: 'caracteristiques-2019.csv', url: 'caract-2019' },
      { title: 'usagers-2019.csv', url: 'usagers-2019' },
      { title: 'vehicules-2019.csv', url: 'vehicules-2019' },
      { title: 'caracteristiques_2016.csv', url: 'caract-2016' },
    ];
    const years = baacFilesByYear(resources);
    expect([...years.keys()].sort()).toEqual([2019, 2020, 2021, 2022, 2023, 2024]);
    expect(years.get(2022)).toEqual({ caract: 'caract-2022', usagers: 'usagers-2022', vehicules: 'vehicules-2022' });
    expect(years.get(2021).caract).toBe('caract-2021');
    // La table des véhicules immatriculés n'est jamais prise pour celle des véhicules.
    expect(years.get(2024).vehicules).toBe('vehicules-2024');
    // Une année dont une table manque n'est pas proposée.
    expect(baacFilesByYear([{ title: 'caracteristiques-2019.csv', url: 'x' }]).size).toBe(0);
  });

  test('0.59.4 - Le fichier 2022 nomme l\'identifiant « Accident_Id » : ses accidents sont lus et rattachés', async () => {
    const fixtures = {
      caract: readFileSync('tests/fixtures/baac-2022-caract.csv', 'utf8'),
      usagers: readFileSync('tests/fixtures/baac-2022-usagers.csv', 'utf8'),
      vehicules: readFileSync('tests/fixtures/baac-2022-vehicules.csv', 'utf8'),
    };
    expect(fixtures.caract.split('\n')[0]).toContain('"Accident_Id"');
    const features = await withFetch(async (url) => new Response(fixtures[String(url).replace('mock://', '')], { status: 200 }),
      () => fetchBaacYear(2022, { caract: 'mock://caract', usagers: 'mock://usagers', vehicules: 'mock://vehicules' }, ['69123']));
    expect(features.map((f) => f.properties.numero).sort()).toEqual(['202200000011', '202200000012']);
    const a = features.find((f) => f.properties.numero === '202200000011').properties;
    expect(a).toMatchObject({ annee: 2022, date: '03/02/2022', gravite: 'Blessé hospitalisé', usagers: 2, blesses_hospitalises: 1, blesses_legers: 1, velo: 'oui', voiture: 'oui', adresse: 'Rue de la Guillotière' });
    expect(features.find((f) => f.properties.numero === '202200000012').properties).toMatchObject({ gravite: 'Blessé léger', trottinette: 'oui', lumiere: 'Nuit avec éclairage' });
    // Un fichier sans aucun des noms connus de l'identifiant est signalé, pas lu à vide.
    const broken = { ...fixtures, caract: fixtures.caract.replace('"Accident_Id"', '"Identifiant"') };
    await withFetch(async (url) => new Response(broken[String(url).replace('mock://', '')], { status: 200 }),
      () => expect(fetchBaacYear(2022, { caract: 'mock://caract', usagers: 'mock://usagers', vehicules: 'mock://vehicules' }, ['69123'])).rejects.toThrow(/identifiant des accidents/));
  });

  test('0.59.5 - Les périodes proposées suivent les années réellement publiées', () => {
    expect(yearsLabel([2024])).toBe('2024');
    expect(yearsLabel([2024, 2023])).toBe('2023 et 2024');
    expect(yearsLabel([2022, 2020, 2021])).toBe('2020 à 2022');
    expect(yearsLabel([2019, 2020, 2023, 2024])).toBe('2019, 2020, 2023 et 2024');
    // Les six années publiées
    const full = baacPeriods([2019, 2020, 2021, 2022, 2023, 2024]);
    expect(full.periods.map((p) => p.label)).toEqual([
      'Dernière année disponible (2024)',
      'Les trois dernières années disponibles (2022 à 2024)',
      'Les cinq dernières années disponibles (2020 à 2024)',
      'Toutes les années disponibles (2019 à 2024)',
    ]);
    expect(full.periods.find((p) => p.key === full.defaultKey).years).toEqual([2020, 2021, 2022, 2023, 2024]);
    // Des années manquantes : « trois ans » prend les trois dernières publiées, pas 2022 à 2024.
    const gaps = baacPeriods([2019, 2020, 2023, 2024]);
    expect(gaps.periods.map((p) => p.years)).toEqual([[2024], [2020, 2023, 2024], [2019, 2020, 2023, 2024]]);
    expect(gaps.periods[1].label).toBe('Les trois dernières années disponibles (2020, 2023 et 2024)');
    expect(gaps.periods.find((p) => p.key === gaps.defaultKey).years).toEqual([2019, 2020, 2023, 2024]);
    expect(baacPeriods([2024]).periods).toHaveLength(1);
  });
});

test.describe('0.60 - Diagnostic : flux Waze', () => {
  const feed = JSON.parse(readFileSync('tests/fixtures/waze-feed.json', 'utf8'));

  test('0.60.1 - Les alertes deviennent des points traduits, sans position elles sont écartées', () => {
    const fc = alertsToGeoJSON(feed);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ type: 'Accident', precision: 'Accident léger', rue: 'Rue Garibaldi', confirmations: 3, fiabilite: 8 });
    expect(fc.features[0].properties.signale_le).toMatch(/^2026-/);
    expect(fc.features[1].properties).toMatchObject({ type: 'Danger sur la route', precision: 'Nid-de-poule' });
    expect(alertsToGeoJSON({}).features).toEqual([]);
  });

  test('0.60.2 - Les ralentissements deviennent des lignes chiffrées, un seul point ne fait pas une ligne', () => {
    const fc = jamsToGeoJSON(feed);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toHaveLength(3);
    expect(fc.features[0].properties).toMatchObject({ rue: 'Quai Perrache', vitesse_kmh: 9.5, retard_s: 240, longueur_m: 820, niveau: 4 });
  });

  test('0.60.3 - Seuls les flux partenaires Waze sont acceptés', () => {
    expect(isAllowedFeedUrl('https://www.waze.com/partnerhub-api/partners/123/waze-feeds/abc?format=JSON')).toBe(true);
    expect(isAllowedFeedUrl('https://www.waze.com/row-rtserver/web/TGeoRSS?format=JSON')).toBe(true);
    expect(isAllowedFeedUrl('http://www.waze.com/partnerhub-api/x')).toBe(false);
    expect(isAllowedFeedUrl('https://evil.example/partnerhub-api/x')).toBe(false);
    expect(isAllowedFeedUrl('https://waze.com.evil.example/partnerhub-api/x')).toBe(false);
    expect(isAllowedFeedUrl('pas une url')).toBe(false);
  });

  test('0.60.4 - Un flux donne deux couches synchronisées, relayées par nos fonctions', () => {
    const layers = wazeLayerCfgs('https://www.waze.com/partnerhub-api/partners/1/waze-feeds/t?format=JSON');
    expect(layers.map((l) => l.part)).toEqual(['alerts', 'jams']);
    for (const l of layers) {
      expect(l.source_ref.startsWith('/api/sources/waze?')).toBe(true);
      expect(l.source_ref).toContain('feed=https%3A%2F%2Fwww.waze.com');
      expect(l.cfg.kind).toBe('reference');
    }
    expect(layers[1].cfg.style.mode).toBe('graduated');
    // La ville est celle de l'import, pas celle affichée au moment de l'enregistrement.
    expect(wazeLayerCfgs('https://www.waze.com/partnerhub-api/x', 'grenoble')[0].source_ref).toContain('ville=grenoble');
  });

  test('0.60.5 - Chaque chiffre de zone Waze a un libellé et une unité, et la longueur coupée à la zone n\'est plus additionnée', () => {
    const [alerts, jams] = wazeLayerCfgs('https://www.waze.com/partnerhub-api/partners/1/waze-feeds/t?format=JSON');
    for (const m of [...alerts.cfg.metrics, ...jams.cfg.metrics]) {
      expect(m.label, m.field).toBeTruthy();
      expect(m.unit, m.field).toBeTruthy();
    }
    expect(jams.cfg.metrics.map((m) => [m.field, m.label, m.unit])).toEqual([['retard_s', 'Retard moyen', 'secondes'], ['vitesse_kmh', 'Vitesse moyenne', 'km/h']]);
    expect(jams.cfg.metrics.find((m) => m.field === 'retard_s').min).toBe(0);
    expect(jams.cfg.metrics.some((m) => m.field === 'longueur_m')).toBe(false);
    expect(WAZE_METRICS.alerts[0]).toMatchObject({ field: 'confirmations', label: 'Confirmations des conducteurs', unit: 'confirmations' });
    // Une couche enregistrée avant la correction (base de Grenoble, 9 septembre 2026) est lue corrigée, sans migration.
    const old = { source_ref: '/api/sources/waze?ville=grenoble&feed=x&part=jams', popup: { source: 'waze', metrics: [{ agg: 'mean', field: 'retard_s' }, { agg: 'mean', field: 'vitesse_kmh' }, { agg: 'sum', field: 'longueur_m' }] } };
    expect(upgradeWazeMetrics(old)).toEqual([
      { agg: 'mean', field: 'retard_s', label: 'Retard moyen', unit: 'secondes', min: 0 },
      { agg: 'mean', field: 'vitesse_kmh', label: 'Vitesse moyenne', unit: 'km/h' },
    ]);
    // Un libellé saisi par l'administrateur est conservé.
    const renamed = { source_ref: '/api/sources/waze?part=alerts', popup: { metrics: [{ agg: 'sum', field: 'confirmations', label: 'Votes' }] } };
    expect(upgradeWazeMetrics(renamed)[0]).toMatchObject({ label: 'Votes', unit: 'confirmations' });
  });

  test('0.60.6 - La fenêtre d\'un bouchon bloqué dit « Circulation bloquée », jamais « -1 s de retard », et son texte est masqué des enregistrements', () => {
    const layer = { label: 'Ralentissements Waze', source_type: 'url', source_ref: '/api/sources/waze?ville=x&feed=y&part=jams', popup: { source: 'waze', kind: 'reference' } };
    const blocked = renderPopup(layer, { rue: 'Quai Perrache', retard_s: -1, vitesse_kmh: 0, longueur_m: 400, niveau: 5 });
    expect(blocked).toContain('Circulation bloquée');
    expect(blocked).not.toContain('-1');
    expect(blocked).toMatch(/^<div class="dgp" data-op-mask/);
    const slowed = renderPopup(layer, { rue: 'Quai Perrache', retard_s: '240', vitesse_kmh: 9.5, longueur_m: 820, niveau: 4 });
    expect(slowed).toContain('4 min');
    expect(slowed).not.toContain('Circulation bloquée');
    // Compteur : le chiffre figé à l'ajout n'est pas « hier ».
    const counter = renderPopup({ label: 'Compteurs vélo', source_type: 'storage', popup: { source: 'comptages' } }, { nom: 'Pont Raymond Barre', moyenne_journaliere: 3550, hier: 4120, releve_le: '2026-09-16' });
    expect(counter).toContain('la veille du relevé');
    expect(counter).not.toMatch(/>hier</);
    // Une couche importée garde, elle aussi, son texte hors des enregistrements.
    expect(renderPopup({ label: 'Doléances', popup: { title_field: 'titre', fields: ['texte'] } }, { titre: 'A', texte: 'Un habitant raconte' })).toContain('data-op-mask');
  });

  test('0.60.7 - Une session expirée se dit en français, et une couche qui ne charge plus donne le message du serveur', async () => {
    const unauthorized = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    await withFetch(unauthorized, async () => {
      await expect(checkWazeFeed('https://www.waze.com/partnerhub-api/x')).rejects.toThrow('Votre session a expiré. Reconnectez-vous, puis rouvrez cette source.');
      await expect(listFubDatasets({ communeCode: '69123' })).rejects.toThrow('Votre session a expiré. Reconnectez-vous, puis rouvrez cette source.');
      await expect(loadLayerData({ source_type: 'url', source_ref: '/api/sources/waze?part=alerts' })).rejects.toThrow(/Votre session a expiré/);
    });
    const relayError = async () => new Response(JSON.stringify({ error: 'Waze a répondu 403 : vérifiez que le lien est complet et toujours actif.' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    await withFetch(relayError, () => expect(loadLayerData({ source_type: 'url', source_ref: '/api/sources/waze?part=jams' })).rejects.toThrow('Waze a répondu 403 : vérifiez que le lien est complet et toujours actif.'));
    // Le message technique d'une autre adresse ne s'affiche pas tel quel.
    const internal = async () => new Response(JSON.stringify({ error: 'Supabase 500: {"code":"XX000"}' }), { status: 502 });
    await withFetch(internal, () => expect(loadLayerData({ source_type: 'url', source_ref: 'https://opendata.example/pistes.geojson' })).rejects.toThrow(/ne répond pas pour le moment \(erreur 502\)/));
    const missing = async () => new Response('', { status: 404 });
    await withFetch(missing, () => expect(loadLayerData({ source_type: 'storage', source_ref: 'https://wqqsuybmyqemhojsamgq.supabase.co/storage/v1/object/public/uploads/diagnostic/test-e2e/x.geojson.gz' })).rejects.toThrow(/introuvables/));
    // Une ancienne couche déposée (adresse publique, fichier compressé) se relit comme avant.
    const gz = new Response(new Blob([JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [4.83, 45.76] }, properties: { n: 1 } }] })]).stream().pipeThrough(new CompressionStream('gzip')));
    const bytes = new Uint8Array(await gz.arrayBuffer());
    const old = await withFetch(async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/gzip' } }),
      () => loadLayerData({ source_type: 'storage', source_ref: 'https://wqqsuybmyqemhojsamgq.supabase.co/storage/v1/object/public/uploads/diagnostic/test-e2e/x.geojson.gz' }));
    expect(old.map((f) => f.properties.n)).toEqual([1]);
  });
});

/* ── Compteurs vélo (pages publiques Eco-Compteur) ───────────── */

import { bboxIntersects, organismesFor, insideTerritory, counterToFeature, countersLayerCfg } from '../admin/sections/diagnostic/sources/counters.js';
import { ECO_VISIO_ORGANISMES, NATIONAL_ORGANISME } from '../admin/sections/diagnostic/sources/eco-visio-organismes.js';

test.describe('0.61 - Diagnostic : compteurs vélo', () => {
  // Un carré autour du centre de Lyon
  const contours = { rings: [[[4.80, 45.72], [4.90, 45.72], [4.90, 45.80], [4.80, 45.80], [4.80, 45.72]]], bbox: [4.80, 45.72, 4.90, 45.80] };
  const list = JSON.parse(readFileSync('tests/fixtures/eco-visio-list.json', 'utf8'));

  test('0.61.1 - Le réseau national est toujours consulté, les observatoires seulement s\'ils touchent le territoire', () => {
    const orgs = organismesFor(contours.bbox);
    expect(orgs[0].id).toBe(NATIONAL_ORGANISME);
    expect(orgs.some((o) => o.nom === 'Grand Lyon')).toBe(true);
    expect(orgs.some((o) => o.nom === 'Observatoire des mobilités')).toBe(false); // Grenoble
    expect(bboxIntersects([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true);
    expect(bboxIntersects([0, 0, 1, 1], [1.1, 1.1, 2, 2])).toBe(false);
    for (const o of ECO_VISIO_ORGANISMES) expect(o.bbox).toHaveLength(4);
  });

  test('0.61.2 - Un compteur devient un point chiffré s\'il est dans les contours, sinon rien', () => {
    const f = counterToFeature(list[0], contours, 'x');
    expect(f.geometry.coordinates).toEqual([4.821243, 45.732002]);
    expect(f.properties).toMatchObject({ nom: 'Lyon 7 - Pont Raymond Barre', type: 'vélos', moyenne_journaliere: 3550, hier: 4120, total_depuis_la_pose: 1036081, installe_le: '01/01/2019', organisme: 'Réseau vélo et marche', id_compteur: 200000535 });
    expect(counterToFeature(list[1], contours, 'x').properties.type).toBe('mixte');
    expect(counterToFeature(list[2], contours, 'x')).toBeNull(); // Grenoble
    expect(counterToFeature(list[3], contours, 'x')).toBeNull(); // sans position
    expect(insideTerritory(4.85, 45.75, contours)).toBe(true);
    expect(insideTerritory(5.72, 45.19, contours)).toBe(false);
  });

  test('0.61.3 - La couche de compteurs est graduée sur la moyenne journalière, jamais cumulée', () => {
    const cfg = countersLayerCfg('Lyon');
    expect(cfg.label).toBe('Compteurs vélo · Lyon');
    expect(cfg.kind).toBe('reference');
    expect(cfg.style).toMatchObject({ mode: 'graduated', value_field: 'moyenne_journaliere' });
    // Les passages de plusieurs compteurs ne s'additionnent pas : aucun total.
    expect(cfg.metrics.some((m) => m.agg === 'sum')).toBe(false);
    expect(cfg.metrics[0]).toMatchObject({ field: 'moyenne_journaliere', agg: 'max', unit: 'passages par jour' });
    expect(cfg.ai_context).toContain('la veille du relevé');
  });
});

/* ── Lecture chiffrée d'une zone (dossier) ───────────────────── */

import { lengthKm, median, stravaInsights, accidentsInsights, cyclewaysInsights } from '../admin/sections/diagnostic/insights.js';

test.describe('0.62 - Diagnostic : lecture chiffrée d\'une zone', () => {
  const P = (lng, lat, layerId, props = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props, __pt: [lng, lat], __layerId: layerId });

  test('0.62.1 - Longueurs et médiane', () => {
    expect(lengthKm({ type: 'LineString', coordinates: [[4.83, 45.76], [4.84, 45.76]] })).toBeCloseTo(0.78, 1);
    expect(lengthKm(null)).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('0.62.4 - Strava : l\'axe le plus fréquenté par jour, la part pendulaire, jamais une somme de tronçons', () => {
    const s = stravaInsights([
      P(0, 0, 'S', { total_trip_count: 3650, forward_trip_count: 2000, reverse_trip_count: 1650, forward_commute_trip_count: 500, reverse_commute_trip_count: 230, forward_average_speed_meters_per_second: 5, reverse_average_speed_meters_per_second: 5, ebike_ride_count: 365 }),
      P(0, 0, 'S', { total_trip_count: 365, forward_commute_trip_count: 0, reverse_commute_trip_count: 0, ebike_ride_count: 0 }),
    ]);
    expect(s.busiestPerDay).toBe(10);
    expect(s.medianPerDay).toBe(6);
    expect(s.commuteShare).toBe(18);
    expect(s.ebikeShare).toBe(9);
    expect(s.speedKmh).toBe(18);
    expect(stravaInsights([])).toBeNull();
  });

  test('0.62.5 - Accidents : victimes, usagers vulnérables, nuit, intersections, par année', () => {
    const a = accidentsInsights([
      P(0, 0, 'A', { annee: 2023, gravite: 'Tué', tues: 1, blesses_hospitalises: 0, blesses_legers: 0, velo: 'oui', pieton: 'non', lumiere: 'Nuit avec éclairage', intersection: 'Intersection en T' }),
      P(0, 0, 'A', { annee: 2024, gravite: 'Blessé léger', tues: 0, blesses_hospitalises: 0, blesses_legers: 2, velo: 'non', pieton: 'non', lumiere: 'Plein jour', intersection: 'Hors intersection' }),
    ]);
    expect(a).toMatchObject({ count: 2, tues: 1, legers: 2, velo: 1, vulnerableShare: 50, nightShare: 50, intersectionShare: 50, severeShare: 50 });
    expect(a.byYear).toEqual([{ year: 2023, count: 1 }, { year: 2024, count: 1 }]);
  });

  test('0.62.6 - Aménagements : kilomètres par type', () => {
    const c = cyclewaysInsights([
      { geometry: { type: 'LineString', coordinates: [[4.83, 45.76], [4.84, 45.76]] }, properties: { type: 'Piste cyclable' } },
      { geometry: { type: 'LineString', coordinates: [[4.83, 45.76], [4.835, 45.76]] }, properties: { type: 'Bande cyclable' } },
    ]);
    expect(c.segments).toBe(2);
    expect(c.km).toBeCloseTo(1.2, 0);
    expect(c.byType[0].type).toBe('Piste cyclable');
  });

  test('0.62.9 - Strava : une zone de 100 000 tronçons se lit sans erreur', () => {
    // Math.max(...totaux) levait « Maximum call stack size exceeded » au-delà d'environ 65 000 tronçons.
    const many = Array.from({ length: 100000 }, (_, i) => P(0, 0, 'S', { total_trip_count: i }));
    const s = stravaInsights(many);
    expect(s.segments).toBe(100000);
    expect(s.busiestPerDay).toBe(Math.round(99999 / 365));
    expect(s.busiest.properties.total_trip_count).toBe(99999);
  });
});
