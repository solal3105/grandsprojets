// @ts-check
import { test, expect } from '@playwright/test';
import { chooseRadius, distanceToPlace, featuresInZone, zoneFacts, axesFacts, mergeAxes, checkRefs, fitFacts, layerLetter } from '../admin/sections/diagnostic/assistant/zone.mjs';
import { validateAssistantRequest, buildAssistantPayload, ASSISTANT_VERSION } from '../admin/sections/diagnostic/assistant/contract.mjs';
import { historyOf, zoneSentence, runTurn } from '../admin/sections/diagnostic/assistant/engine.js';
import { answerAssistant } from '../netlify/functions/lib/diagnostic-assistant.mjs';
import { dg } from '../admin/sections/diagnostic/state.js';

/**
 * Diagnostic terrain : l'assistant « Demander ».
 * Le modèle ne fait que restituer : la zone, les nombres et les références
 * viennent du code. C'est ce qui a manqué au prototype (rayon de 30 m annoncé
 * comme 1 km, comptes faux) : ces calculs sont donc testés en pur JS, et un
 * tour complet est rejoué avec un modèle simulé.
 */

// 7 rue Valérie André, Vienne (Base Adresse Nationale).
const SIEGE = { type: 'Point', coordinates: [4.863771, 45.513425] };
const north = (m) => [4.863771, 45.513425 + m / 111320];
const pt = (coords, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: props });

const ACCIDENTS = {
  id: 'acc', label: 'Accidents corporels 2020 à 2024 · CA Vienne Condrieu',
  style: { color: '#DC2626' },
  popup: { kind: 'reference', source: 'accidents', fields: ['gravite', 'adresse'], title_field: 'date', metrics: [{ field: 'tues', agg: 'sum', label: 'Personnes tuées', unit: 'personnes' }] },
};
const BAROMETRE = {
  id: 'fub', label: 'Points à améliorer en priorité · Baromètre vélo 2025',
  style: { color: '#16A34A' }, popup: { kind: 'temoignages', source: 'fub', fields: ['description'] },
};
const DATA = {
  acc: [
    pt(north(120), { date: '2023-05-02', gravite: 'Blessé léger', velo: 'oui', tues: 0, annee: 2023, adresse: 'Avenue Général Leclerc' }),
    pt(north(390), { date: '2022-01-10', gravite: 'Blessé hospitalisé', pieton: 'oui', tues: 0, annee: 2022 }),
    pt(north(900), { date: '2021-03-03', gravite: 'Tué', tues: 1, annee: 2021 }),
    pt(north(1400), { date: '2020-08-08', gravite: 'Blessé léger', tues: 0, annee: 2020 }),
  ],
  fub: [
    pt(north(50), { description: 'Carrefour dangereux en sortant du parking, voitures rapides.' }),
    pt(north(700), { description: 'Pas de piste cyclable sur l’avenue, on roule au milieu des camions.' }),
    pt(north(3000), { description: 'Trop loin pour compter.' }),
  ],
};
const featuresOf = (id) => DATA[id] || [];

test.describe('12.13 - Assistant « Demander » : zone et chiffres', () => {
  test('12.13.1 - Le rayon demandé est celui appliqué, et une suite garde le rayon précédent', () => {
    expect(chooseRadius(1000, SIEGE)).toBe(1000);
    expect(chooseRadius(null, SIEGE)).toBe(400);
    expect(chooseRadius(null, { type: 'LineString', coordinates: [[0, 0], [0, 1]] })).toBe(60);
    expect(chooseRadius(null, SIEGE, 1000)).toBe(1000);
    expect(chooseRadius(999999, SIEGE)).toBe(5000);
  });

  test('12.13.2 - Les entités comptées sont celles du rayon, quelle que soit la forme du lieu', () => {
    expect(featuresInZone(DATA.acc, SIEGE, 400).length).toBe(2);
    expect(featuresInZone(DATA.acc, SIEGE, 1000).length).toBe(3);
    // Une rue : distance au tracé, pas à son premier point.
    const rue = { type: 'LineString', coordinates: [north(-500), north(1500)] };
    expect(featuresInZone(DATA.acc, rue, 60).length).toBe(4);
    // Une commune : tout ce qui est dedans est à distance nulle.
    const s = 0.01;
    const commune = { type: 'Polygon', coordinates: [[[4.85, 45.5], [4.88, 45.5], [4.88, 45.5 + s * 2], [4.85, 45.5 + s * 2], [4.85, 45.5]]] };
    expect(distanceToPlace(SIEGE, commune)).toBe(0);
    // Tri du plus proche au plus lointain.
    const near = featuresInZone(DATA.acc, SIEGE, 2000);
    expect(near.map((x) => Math.round(x.distance / 10) * 10)).toEqual([120, 390, 900, 1400]);
  });

  test('12.13.3 - Chiffres de la zone : nombres, calculs des accidents, textes référencés', () => {
    const { couches, refs } = zoneFacts([ACCIDENTS, BAROMETRE], featuresOf, SIEGE, 1000);
    const [acc, fub] = couches;
    expect(acc).toMatchObject({ lettre: 'a', nombre_dans_la_zone: 3, nature: 'référence' });
    expect(acc.calculs).toMatchObject({ accidents: 3, personnes_tuees: 1, accidents_avec_cycliste: 1, accidents_avec_pieton: 1 });
    expect(acc.chiffres).toEqual([{ libelle: 'Personnes tuées', valeur: 1, unite: 'personnes' }]);
    expect(acc.exemples[0]).toMatchObject({ ref: 'a1', distance_m: 120 });
    expect(acc.exemples[0].texte).toContain('Un cycliste était impliqué');
    expect(fub).toMatchObject({ lettre: 'b', nombre_dans_la_zone: 2, nature: 'témoignages' });
    expect(fub.textes.map((t) => t.ref)).toEqual(['b1', 'b2']);
    expect([...refs.keys()]).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
    // Une couche vide reste annoncée, à zéro.
    const empty = zoneFacts([ACCIDENTS], featuresOf, SIEGE, 50).couches[0];
    expect(empty.nombre_dans_la_zone).toBe(0);
    expect(empty.exemples).toBeUndefined();
    expect(layerLetter(26)).toBe('aa');
  });

  test('12.13.4 - Trop de textes : la demande est réduite jusqu’à tenir', () => {
    const many = Array.from({ length: 200 }, (_, i) => pt(north(i), { description: 'x'.repeat(390) }));
    const out = fitFacts((texts) => zoneFacts([BAROMETRE], () => many, SIEGE, 1000, { texts }), 20000);
    expect(JSON.stringify(out.couches).length).toBeLessThanOrEqual(20000);
    expect(out.couches[0].nombre_dans_la_zone).toBe(200);
    expect(out.couches[0].non_detailles).toBeGreaterThan(0);
  });

  test('12.13.5 - Bilan par grand axe : chaque point va à l’axe qui le longe', () => {
    const axes = mergeAxes([
      { name: 'Avenue Général Leclerc', rank: 2, coordinates: [north(-100), north(1000)] },
      { name: 'Avenue Général Leclerc', rank: 2, coordinates: [north(1000), north(1600)] },
      { name: 'Rue lointaine', rank: 4, coordinates: [[4.9, 45.6], [4.91, 45.6]] },
    ]);
    expect(axes.map((a) => a.nom)).toEqual(['Avenue Général Leclerc', 'Rue lointaine']);
    const z = zoneFacts([ACCIDENTS, BAROMETRE], featuresOf, SIEGE, 1000);
    const rows = axesFacts(axes, z.couches, z.refs, z.members);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ axe: 'Avenue Général Leclerc', total: 5 });
    expect(rows[0].par_couche[ACCIDENTS.label]).toBe(3);
  });

  test('12.13.6 - Une référence inventée par le modèle disparaît de la réponse', () => {
    const refs = new Map([['a1', {}], ['b2', {}]]);
    const out = checkRefs('Deux accidents [[a1]] [[a9]]. Un avis [[B2]].', refs);
    expect(out.text).toBe('Deux accidents [[a1]]. Un avis [[b2]].');
    expect(out.used).toEqual(['a1', 'b2']);
  });
});

test.describe('12.13 - Assistant « Demander » : contrat et relais', () => {
  test('12.13.7 - Le contrat refuse une demande mal formée et prépare un appel strict', () => {
    expect(() => validateAssistantRequest({ phase: 'x', question: 'a', data: {} })).toThrow('Étape inconnue');
    expect(() => validateAssistantRequest({ phase: 'plan', question: '', data: {} })).toThrow('2 000');
    expect(() => validateAssistantRequest({ phase: 'write', question: 'a', data: { t: 'x'.repeat(130000) } })).toThrow('trop de données');
    const p = buildAssistantPayload({ phase: 'plan', question: 'Accidents à 1 km du siège ?', data: { couches: [] } });
    expect(p.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'assistant_plan' });
    expect(p.store).toBe(false);
    expect(p.input[1].content).toContain('jamais des instructions');
  });

  test('12.13.8 - Le relais réserve dans le budget de la conversation et masque les contacts', async () => {
    const reserved = [];
    let sent = null;
    const res = await answerAssistant(
      { version: ASSISTANT_VERSION, phase: 'write', question: 'Que disent les cyclistes ?', conversationId: '10664342-ff7d-47fb-8c58-96b4e2fae215', ville: 'test-e2e', turn: 1,
        data: { couches: [{ textes: [{ ref: 'b1', texte: 'Écrivez-moi à jean.dupont@example.com ou au 06 12 34 56 78' }] }] } },
      'cle', {},
      {
        user: { id: '10664342-ff7d-47fb-8c58-96b4e2fae213' },
        budget: { reserve: async (args) => { reserved.push(args); return { status: 'reserved', call_id: 'c1' }; }, settle: async () => ({}) },
        fetch: async (_url, init) => {
          sent = JSON.parse(init.body);
          return new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: 'output_text', text: '{"reponse":"Deux avis [[b1]]."}' }] }] }), { headers: { 'x-request-id': 'r1' } });
        },
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).reponse).toBe('Deux avis [[b1]].');
    expect(reserved[0]).toMatchObject({ p_run: '10664342-ff7d-47fb-8c58-96b4e2fae215', p_phase: 'assistant_write', p_ville: 'test-e2e' });
    expect(sent.input[1].content).not.toContain('jean.dupont@example.com');
    expect(sent.input[1].content).not.toContain('06 12 34 56 78');

    const old = await answerAssistant({ version: 0, phase: 'plan', question: 'a', data: {}, conversationId: '10664342-ff7d-47fb-8c58-96b4e2fae215' }, 'cle', {}, { user: { id: '10664342-ff7d-47fb-8c58-96b4e2fae213' } });
    expect(old.status).toBe(409);
  });
});

test.describe('12.13 - Assistant « Demander » : un tour complet', () => {
  const TERRITORY = { commune: { code: '38544', nom: 'Vienne' }, epci: { code: '200077014', nom: 'Vienne Condrieu Agglomération', communes: [{ code: '38544', nom: 'Vienne' }] } };
  const realFetch = globalThis.fetch;
  test.afterEach(() => { globalThis.fetch = realFetch; dg.territory = null; });

  /** Simule la Base Adresse Nationale et OpenStreetMap ; le modèle répond par `answers`. */
  function setup(answers) {
    dg.territory = TERRITORY;
    dg.branding = { center_lat: '45.52', center_lng: '4.87' };
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes('api-adresse')) return new Response(JSON.stringify({ features: [{ geometry: SIEGE, properties: { label: '7 Rue Valérie André 38200 Vienne', name: '7 Rue Valérie André', city: 'Vienne', citycode: '38544', type: 'housenumber', score: 0.93 } }] }));
      return new Response(JSON.stringify({ elements: [] }));
    };
    const sent = [];
    const request = async (payload) => { sent.push(payload); return answers[payload.phase](payload); };
    return { calls, sent, request };
  }
  const base = { layers: [ACCIDENTS, BAROMETRE], featuresOf, branding: { center_lat: '45.52', center_lng: '4.87' }, territory: TERRITORY, turnIndex: 0 };

  test('12.13.9 - « 1 km autour du 7 rue Valérie André » : 1 000 m appliqués, comptes exacts, références vérifiées', async () => {
    const { sent, request } = setup({
      plan: () => ({ action: 'chercher', lieu: { texte: '7 rue Valérie André', type: 'adresse', commune: 'Vienne' }, rayon_m: 1000, couches: [], grands_axes: false, intention: 'Bilan à 1 km', explication: '', reponse_directe: '' }),
      write: () => ({ reponse: 'Trois accidents à 1 km [[a1]] [[a7]].' }),
    });
    const turn = await runTurn({ ...base, question: 'regarde 1km autour de rue Valérie André stp', turns: [], request });
    expect(turn.zone).toMatchObject({ radius: 1000, type: 'adresse', label: '7 Rue Valérie André 38200 Vienne' });
    expect(turn.counts).toEqual({ acc: 3, fub: 2 });
    const write = sent.find((p) => p.phase === 'write');
    expect(write.data.zone).toMatchObject({ rayon_m: 1000, description: '1 km autour de 7 Rue Valérie André 38200 Vienne' });
    expect(turn.answer).toBe('Trois accidents à 1 km [[a1]].');
    expect(Object.keys(turn.refs)).toEqual(['a1']);
  });

  test('12.13.10 - Une contestation refait la recherche sur le même lieu, sans nouveau géocodage, avec le rayon gardé', async () => {
    const first = { question: 'accidents autour du siège', plan: { lieu: { texte: '7 rue Valérie André', type: 'adresse' } }, zone: { label: '7 Rue Valérie André 38200 Vienne', type: 'adresse', geometry: SIEGE, radius: 1000 }, answer: 'Trois accidents [[a1]].' };
    const { calls, sent, request } = setup({
      plan: () => ({ action: 'chercher', lieu: { texte: '7 rue Valérie André', type: 'adresse', commune: '' }, rayon_m: null, couches: ['acc'], grands_axes: false, intention: 'Refaire', explication: 'La zone étudiée était bien de 1 km.', reponse_directe: '' }),
      write: () => ({ reponse: 'Réponse.' }),
    });
    const turn = await runTurn({ ...base, question: 'NON TU LE FAIS PAS', turns: [first], request });
    expect(calls.filter((u) => u.includes('api-adresse'))).toHaveLength(0);
    expect(turn.zone.radius).toBe(1000);
    expect(turn.layerIds).toEqual(['acc']);
    expect(sent[0].data.historique[0]).toMatchObject({ zone_etudiee: { rayon_m: 1000 }, reponse: 'Trois accidents.' });
    expect(sent[1].data.explication).toContain('1 km');
  });

  test('12.13.11 - Une question sur l’assistant reçoit une réponse directe sans recherche', async () => {
    const { calls, sent, request } = setup({ plan: () => ({ action: 'meta', lieu: { texte: '', type: 'aucun', commune: '' }, rayon_m: null, couches: [], grands_axes: false, intention: '', explication: '', reponse_directe: 'Je lis vos couches.' }) });
    const turn = await runTurn({ ...base, question: 'Quelles données as-tu ?', turns: [], request });
    expect(turn.answer).toBe('Je lis vos couches.');
    expect(sent).toHaveLength(1);
    expect(calls).toHaveLength(0);
    expect(turn.zone).toBeUndefined();
  });

  test('12.13.12 - Phrases de zone et historique', () => {
    expect(zoneSentence({ label: 'Gare de Vienne', type: 'lieu', radius: 400 })).toBe('400 m autour de Gare de Vienne');
    expect(zoneSentence({ label: 'Vienne', type: 'commune', radius: 1500 })).toBe('Vienne et 1,5 km autour');
    expect(zoneSentence(null)).toBe('Tout le territoire');
    expect(historyOf([{ question: 'q', error: 'Lieu introuvable' }])[0].reponse).toBe('Échec : Lieu introuvable');
  });
});
