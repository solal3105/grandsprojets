// @ts-check
import { test, expect } from '@playwright/test';
import { _internals } from '../admin/sections/diagnostic/analysis.js';
import { dg, MAX_ANALYSIS_POINTS } from '../admin/sections/diagnostic/state.js';

/**
 * Diagnostic terrain : les chiffres du rapport.
 *
 * L'en-tête du module le dit : « Les nombres sont calculés ici, l'IA ne fait
 * que restituer ». C'est le module vendu en supplément, et il était couvert à
 * 8 %. Un décompte faux ne se voit pas : le rapport reste beau et plausible.
 *
 * Tout ce fichier est du calcul pur, sans carte ni WebGL ni appel IA.
 */

const { textOf, titleOf, extraOf, breakdown, zoneStats, orderedPoints, mergeCouches } = _internals;

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

test.describe('0.50 - Diagnostic : lecture d\'un point', () => {

  test('0.50.1 - Le titre suit le champ configuré, sinon le libellé de la couche', () => {
    expect(titleOf(pt('L1', { titre: 'Nid-de-poule' }))).toBe('Nid-de-poule');
    expect(titleOf(pt('L1', { titre: '' }))).toBe('Signalements voirie');
    expect(titleOf(pt('L1', {}))).toBe('Signalements voirie');
    // Couche inconnue : jamais « undefined » dans un rapport
    expect(titleOf(pt('LX', { titre: 'x' }))).toBe('Point');
  });

  test('0.50.2 - Le texte descriptif est le PLUS LONG des champs, pas le premier', () => {
    // Un intitulé court passerait pour la description et le vrai texte finirait
    // tronqué dans le contexte, puis cité tronqué.
    const f = pt('L1', {
      titre: 'Signalement 12',
      rue: 'Rue Garibaldi',
      description: 'La chaussee est fortement degradee sur cinquante metres',
    });
    expect(textOf(f)).toBe('La chaussee est fortement degradee sur cinquante metres');
  });

  test('0.50.3 - Le champ titre ne peut jamais servir de texte descriptif', () => {
    const f = pt('L1', { titre: 'Un titre tres long qui depasse douze caracteres' });
    expect(textOf(f)).toBe('');
  });

  test('0.50.4 - Un texte de 12 caractères ou moins ne compte pas comme descriptif', () => {
    expect(textOf(pt('L1', { titre: 'T', description: 'douze cars.' }))).toBe('');
    expect(textOf(pt('L1', { titre: 'T', description: 'treize cars..' }))).toBe('treize cars..');
  });

  test('0.50.5 - Une valeur non textuelle ne devient jamais une description', () => {
    for (const v of [42, true, null, undefined, { a: 1 }, ['x']]) {
      expect(textOf(pt('L1', { titre: 'T', description: v })), String(v)).toBe('');
    }
  });

  test('0.50.6 - Le contexte reprend la catégorie puis des repères courts', () => {
    const f = pt('L1', {
      titre: 'Signalement 12',
      type: 'Chaussee',
      rue: 'Rue Garibaldi',
      commune: 'Lyon',
      description: 'La chaussee est fortement degradee sur cinquante metres',
    });
    const extra = extraOf(f);
    expect(extra).toContain('Chaussee');
    expect(extra).toContain('Rue Garibaldi');
    // Le texte descriptif est fourni entier ailleurs : il ne se répète pas ici
    expect(extra).not.toContain('fortement degradee');
    expect(extra.split(' · ').length).toBeLessThanOrEqual(3);
  });

  test('0.50.7 - Une valeur de plus de 40 caractères ne devient pas un repère', () => {
    const f = pt('L1', { titre: 'T', type: 'Chaussee', rue: 'R'.repeat(41), commune: 'Lyon' });
    expect(extraOf(f)).not.toContain('RRRR');
    expect(extraOf(f)).toContain('Lyon');
  });

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

  test('0.51.4 - zoneStats annonce le total et le détail par couche', () => {
    const { text, rows } = zoneStats([pt('L1', { type: 'Chaussee' }), pt('L1', { type: 'Chaussee' }), pt('L2', {})]);
    expect(text).toContain('Signalements voirie : 2');
    expect(text).toContain('Comptages vélo : 1');
    expect(text).toContain('Total : 3 points.');
    expect(rows).toHaveLength(2);
  });

  test('0.51.5 - zoneStats relève les valeurs fréquentes du champ de catégorie', () => {
    const { text } = zoneStats([
      pt('L1', { type: 'Chaussee' }), pt('L1', { type: 'Chaussee' }),
      pt('L1', { type: 'Trottoir' }), pt('L1', { type: '' }), pt('L1', {}),
    ]);
    expect(text).toContain('Chaussee (2)');
    expect(text).toContain('Trottoir (1)');
    // Les valeurs vides ne deviennent pas une catégorie fantôme
    expect(text).not.toMatch(/ {2}\(\d+\)|«  »/);
  });

  test('0.51.6 - Une couche sans champ de catégorie ne produit aucune ligne de valeurs', () => {
    const { text } = zoneStats([pt('L2', { nom: 'Compteur A' }), pt('L2', { nom: 'Compteur B' })]);
    expect(text).toContain('Comptages vélo : 2');
    expect(text).not.toContain('Valeurs fréquentes');
  });

});

test.describe('0.52 - Diagnostic : sélection des points envoyés', () => {

  test('0.52.1 - Les points sont pris à la ronde entre couches', () => {
    const features = [
      ...Array.from({ length: 5 }, (_, i) => pt('L1', { titre: `A${i}` })),
      ...Array.from({ length: 5 }, (_, i) => pt('L2', { nom: `B${i}` })),
    ];
    const out = orderedPoints(features, 6);
    expect(out).toHaveLength(6);
    // Alternance : aucune couche n'est reléguée en fin de liste
    const couches = out.map((f) => f.__layerId);
    expect(new Set(couches).size).toBe(2);
    expect(couches.filter((c) => c === 'L1')).toHaveLength(3);
    expect(couches.filter((c) => c === 'L2')).toHaveLength(3);
  });

  test('0.52.2 - Les points porteurs de texte passent devant', () => {
    const features = [
      pt('L1', { titre: 'sans texte' }),
      pt('L1', { titre: 'T', description: 'Une description bien assez longue pour compter' }),
    ];
    const out = orderedPoints(features, 2);
    expect(textOf(out[0])).not.toBe('');
  });

  test('0.52.3 - Une couche épuisée ne bloque pas les autres', () => {
    const features = [pt('L1', {}), ...Array.from({ length: 4 }, () => pt('L2', {}))];
    const out = orderedPoints(features, 10);
    // Le plafond n'est pas atteint : tous les points sortent, sans boucle infinie
    expect(out).toHaveLength(5);
  });

  test('0.52.4 - Le plafond est respecté et vaut celui de la configuration', () => {
    expect(MAX_ANALYSIS_POINTS).toBeGreaterThan(0);
    const features = Array.from({ length: MAX_ANALYSIS_POINTS + 50 }, () => pt('L1', {}));
    expect(orderedPoints(features, MAX_ANALYSIS_POINTS)).toHaveLength(MAX_ANALYSIS_POINTS);
  });

  test('0.52.5 - Une zone vide ne renvoie rien', () => {
    expect(orderedPoints([], 10)).toEqual([]);
  });

});

test.describe('0.53 - Diagnostic : recalage du résultat IA sur les données', () => {

  /** Trois points L1 puis deux points L2, indices IA 1..5. */
  const echantillon = [
    pt('L1', { titre: 'S1', description: 'La chaussee est degradee sur cinquante metres' }),
    pt('L1', { titre: 'S2', description: 'Le trottoir est affaisse devant le numero 12' }),
    pt('L1', { titre: 'S3' }),
    pt('L2', { nom: 'C1', commentaire: 'Comptage en hausse continue sur ce point' }),
    pt('L2', { nom: 'C2' }),
  ];
  const codeOf = new Map([['L1', 'S1'], ['L2', 'S2']]);
  const lignes = () => breakdown(echantillon);

  test('0.53.1 - Toute couche présente figure au rapport, même ignorée par l\'IA', () => {
    // L'IA ne parle que de S1 : S2 doit quand même apparaître avec son compte.
    const out = mergeCouches(
      { couches: [{ couche: 'S1', synthese: 'Des degradations de voirie.', sujets: [] }] },
      lignes(), echantillon, codeOf,
    );
    expect(out.map((c) => c.id)).toEqual(['L1', 'L2']);
    expect(out.find((c) => c.id === 'L2').count).toBe(2);
    expect(out.find((c) => c.id === 'L2').synthese).toBe('');
  });

  test('0.53.2 - Un sujet est rattaché à la couche qui possède la majorité des points cités', () => {
    // Le modèle déclare le sujet sous S2, mais 2 de ses 3 points sont à L1.
    const out = mergeCouches(
      { couches: [{ couche: 'S2', synthese: '', sujets: [{ sujet: 'Voirie', refs: [1, 2, 4], verbatims: [] }] }] },
      lignes(), echantillon, codeOf,
    );
    const l1 = out.find((c) => c.id === 'L1');
    expect(l1.sujets.map((s) => s.sujet)).toEqual(['Voirie']);
    // Et le sujet ne garde que SES points, pas celui de l'autre couche
    expect(l1.sujets[0].refs).toEqual([1, 2]);
    expect(out.find((c) => c.id === 'L2').sujets).toEqual([]);
  });

  test('0.53.3 - Les références inexistantes sont écartées', () => {
    const out = mergeCouches(
      { couches: [{ couche: 'S1', sujets: [{ sujet: 'Voirie', refs: [1, 99, 1000, -3], verbatims: [] }] }] },
      lignes(), echantillon, codeOf,
    );
    expect(out.find((c) => c.id === 'L1').sujets[0].refs).toEqual([1]);
  });

  test('0.53.4 - Un sujet sans aucune référence valable est supprimé', () => {
    const out = mergeCouches(
      { couches: [{ couche: 'S1', sujets: [{ sujet: 'Invente', refs: [42, 77], verbatims: ['x'] }] }] },
      lignes(), echantillon, codeOf,
    );
    for (const c of out) expect(c.sujets).toEqual([]);
  });

  test('0.53.5 - Les références en double ne gonflent pas le décompte', () => {
    const out = mergeCouches(
      { couches: [{ couche: 'S1', sujets: [{ sujet: 'Voirie', refs: [1, 1, 1, 2], verbatims: [] }] }] },
      lignes(), echantillon, codeOf,
    );
    expect(out.find((c) => c.id === 'L1').sujets[0].refs).toEqual([1, 2]);
  });

  test('0.53.6 - Deux synthèses pour une même source sont cumulées, pas perdues', () => {
    const out = mergeCouches(
      {
        couches: [
          { couche: 'S1', synthese: 'Premier constat.', sujets: [] },
          { couche: 'S1', synthese: 'Second constat.', sujets: [] },
        ],
      },
      lignes(), echantillon, codeOf,
    );
    expect(out.find((c) => c.id === 'L1').synthese).toBe('Premier constat. Second constat.');
  });

  test('0.53.7 - hasText est calculé sur les données, jamais déduit des sujets', () => {
    // C'est ce qui permet de dire la vérité sur une source laissée de côté.
    const out = mergeCouches({ couches: [] }, lignes(), echantillon, codeOf);
    expect(out.find((c) => c.id === 'L1').hasText).toBe(true);
    expect(out.find((c) => c.id === 'L2').hasText).toBe(true);

    const sansTexte = [pt('L1', { titre: 'S1' }), pt('L1', { titre: 'S2' })];
    const out2 = mergeCouches({ couches: [] }, breakdown(sansTexte), sansTexte, codeOf);
    expect(out2[0].hasText).toBe(false);
    expect(out2[0].apercu).toEqual([]);
  });

  test('0.53.8 - Un aperçu déterministe existe même sans sujet, plafonné à 8', () => {
    const beaucoup = Array.from({ length: 12 }, (_, i) =>
      pt('L1', { titre: `S${i}`, description: `Une description numero ${i} bien assez longue` }));
    const out = mergeCouches({ couches: [] }, breakdown(beaucoup), beaucoup, codeOf);
    expect(out[0].apercu).toHaveLength(8);
    expect(out[0].apercu[0]).toHaveProperty('label');
    expect(out[0].apercu[0]).toHaveProperty('texte');
  });

  test('0.53.9 - Les verbatims sont nettoyés et plafonnés à trois', () => {
    const out = mergeCouches(
      {
        couches: [{
          couche: 'S1',
          sujets: [{ sujet: 'Voirie', refs: [1], verbatims: ['  un  ', '', '   ', 'deux', 'trois', 'quatre'] }],
        }],
      },
      lignes(), echantillon, codeOf,
    );
    expect(out.find((c) => c.id === 'L1').sujets[0].verbatims).toEqual(['un', 'deux', 'trois']);
  });

  test('0.53.10 - Une réponse IA absurde ne fait jamais planter la fusion', () => {
    for (const absurde of [null, undefined, {}, { couches: null }, { couches: 'x' }, { couches: [null, 42, {}] }]) {
      const out = mergeCouches(absurde, lignes(), echantillon, codeOf);
      expect(out.map((c) => c.id), JSON.stringify(absurde)).toEqual(['L1', 'L2']);
      for (const c of out) expect(c.sujets).toEqual([]);
    }
  });

  test('0.53.11 - Les sujets sont classés du plus étayé au moins étayé', () => {
    const out = mergeCouches(
      {
        couches: [{
          couche: 'S1',
          sujets: [
            { sujet: 'Peu etaye', refs: [1], verbatims: [] },
            { sujet: 'Bien etaye', refs: [1, 2, 3], verbatims: [] },
          ],
        }],
      },
      lignes(), echantillon, codeOf,
    );
    expect(out.find((c) => c.id === 'L1').sujets.map((s) => s.sujet)).toEqual(['Bien etaye', 'Peu etaye']);
  });

  test('0.53.12 - La couleur du rapport est toujours une couleur valide', () => {
    dg.layers = [{ id: 'L1', label: 'X', style: { color: '#DC2626; background:url(x)' }, popup: {} }];
    const pts = [pt('L1', {})];
    const out = mergeCouches({ couches: [] }, breakdown(pts), pts, new Map([['L1', 'S1']]));
    expect(out[0].color).not.toContain('url(');
    expect(out[0].color === '' || /^#[0-9A-Fa-f]{3,8}$/.test(out[0].color)).toBe(true);
  });

});

/* ── Données de référence, jointure, style gradué ─────────────── */

import {
  CsvParser, parseCsv, numericFields, guessKind, quantileStops, aggregateMetrics,
  joinKey, applyJoin, guessJoinColumns, restrictProps, typedValue,
} from '../admin/sections/diagnostic/data.js';
import { colorExpression, lineWidthExpression, colorRamp } from '../admin/sections/diagnostic/map.js';
import { layerKind, layerMetrics } from '../admin/sections/diagnostic/state.js';

const { partitionSelection, contextStats } = _internals;

const feat = (props, geometry = { type: 'Point', coordinates: [5.7, 45.2] }) => ({ type: 'Feature', geometry, properties: props, __pt: [5.7, 45.2] });

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

  test('0.55.3 - Les chiffres de zone sont calculés par couche de référence, du plus fourni au moins fourni', () => {
    dg.layers.push({ id: 'R2', label: 'Accidents', style: { color: '#000' }, popup: { kind: 'reference' } });
    const rows = contextStats([
      pt('R2', { gravite: 2 }),
      pt('R1', { total: 100, vitesse: 4 }),
      pt('R1', { total: 300, vitesse: 6 }),
      pt('R1', { total: 'x', vitesse: '' }),
      pt('RX', { total: 5 }), // couche inconnue : ignorée
    ]);
    expect(rows.map((r) => r.id)).toEqual(['R1', 'R2']);
    expect(rows[0]).toMatchObject({ label: 'Flux cyclistes 2025', count: 3, ai_context: 'Passages Strava' });
    expect(rows[0].metrics).toEqual([
      { field: 'total', agg: 'sum', value: 400, n: 2 },
      { field: 'vitesse', agg: 'mean', value: 5, n: 2 },
    ]);
    expect(rows[1]).toMatchObject({ count: 1, metrics: [] });
    expect(contextStats([])).toEqual([]);
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
    }
  });
});

/* ── Catalogue de sources et moteur d'import ─────────────────────── */

import { SOURCES, FAMILIES, sourceOfLayer } from '../admin/sections/diagnostic/sources.js';
import { cfgFromRecipe, joinColumnsFor } from '../admin/sections/diagnostic/engine.js';
import { cyclewayType, waysToGeoJSON } from '../admin/sections/diagnostic/sources/osm.js';
import { FUB_LAYERS, fubLayerCfg } from '../admin/sections/diagnostic/sources/fub.js';
import { scopeLabel } from '../admin/sections/diagnostic/sources/territory.js';

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
      const txt = [s.name, s.description, s.sentence || ''].join(' ').toLowerCase();
      for (const mot of ['geojson', 'jointure', 'popup', 'shapefile']) expect(txt).not.toContain(mot);
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

import { fetchBaacYear, baacLayerCfg, GRAVITE_COLORS } from '../admin/sections/diagnostic/sources/baac.js';
import { alertsToGeoJSON, jamsToGeoJSON, isAllowedFeedUrl } from '../netlify/functions/lib/waze-feed.mjs';
import { wazeLayerCfgs } from '../admin/sections/diagnostic/sources/waze.js';

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

  test('0.59.2 - La couche d\'accidents est une référence colorée par gravité, chiffrée en victimes', () => {
    const cfg = baacLayerCfg([2020, 2024], 'Lyon');
    expect(cfg.label).toBe('Accidents corporels 2020 à 2024 · Lyon');
    expect(cfg.kind).toBe('reference');
    expect(cfg.style.category_field).toBe('gravite');
    expect(cfg.style.cat_colors['Tué']).toBe(GRAVITE_COLORS['Tué']);
    expect(cfg.metrics.map((m) => m.field)).toEqual(['tues', 'blesses_hospitalises', 'blesses_legers', 'usagers']);
    expect(baacLayerCfg([2024], 'Lyon').label).toBe('Accidents corporels 2024 · Lyon');
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

  test('0.61.3 - La couche de compteurs est graduée sur la moyenne journalière', () => {
    const cfg = countersLayerCfg('Lyon');
    expect(cfg.label).toBe('Compteurs vélo · Lyon');
    expect(cfg.kind).toBe('reference');
    expect(cfg.style).toMatchObject({ mode: 'graduated', value_field: 'moyenne_journaliere' });
    expect(cfg.metrics[0]).toEqual({ field: 'moyenne_journaliere', agg: 'sum' });
  });
});
