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
