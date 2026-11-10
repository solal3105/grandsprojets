// @ts-check
import { test, expect } from '@playwright/test';
import { handler as contributions } from '../netlify/functions/contributions-geojson.mjs';
import { handler as travaux } from '../netlify/functions/travaux-geojson.mjs';
import { isStoredFile } from '../netlify/functions/lib/geojson-aggregate.mjs';

/**
 * Les deux fonctions publiques qui rassemblent les tracés d'une ville
 * (/.netlify/functions/contributions-geojson et travaux-geojson).
 *
 * Elles téléchargent, côté serveur, le fichier désigné par chaque ligne
 * approuvée. Ces essais tournent en Node avec un faux `fetch` : la base et le
 * stockage sont simulés, aucune requête réelle ne part.
 */

const BASE = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const STOCKAGE = `${BASE}/storage/v1/object/public`;
const TRACE = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [4.85, 45.75] } }] };

test.describe('0.97 - Tracés publics : la fonction ne lit que notre stockage', () => {

  const fetchReel = globalThis.fetch;
  let appels;
  let lignes;
  let base;

  test.beforeEach(() => {
    appels = [];
    lignes = [];
    base = { status: 200, corps: null };
    globalThis.fetch = async (url) => {
      const adresse = String(url);
      appels.push(adresse);
      if (adresse.startsWith(`${BASE}/rest/v1/`)) {
        return new Response(base.corps ?? JSON.stringify(lignes), { status: base.status });
      }
      if (adresse.startsWith(`${STOCKAGE}/`)) return new Response(JSON.stringify(TRACE), { status: 200 });
      throw new Error(`appel inattendu : ${adresse}`);
    };
  });
  test.afterEach(() => { globalThis.fetch = fetchReel; });

  const appel = async (fonction, ville = 'metropole-lyon') => {
    const r = await fonction({ httpMethod: 'GET', queryStringParameters: { ville } });
    return { status: r.statusCode, json: JSON.parse(r.body) };
  };
  const telecharges = () => appels.filter((a) => !a.startsWith(`${BASE}/rest/v1/`));

  test('0.97.1 - Seul un fichier public de notre stockage est une adresse de tracé', () => {
    expect([
      `${STOCKAGE}/uploads/geojson/projects/metropole-lyon/voie-lyonnaise-1.geojson`,
      `${STOCKAGE}/travaux-geojson/metropole-lyon/rue-de-la-paix.geojson?v=3`,
    ].map(isStoredFile)).toEqual([true, true]);

    expect([
      'https://exemple.invalid/trace.geojson',
      // Un nom d'hôte qui commence comme le nôtre
      `${BASE}.exemple.invalid/storage/v1/object/public/uploads/x.geojson`,
      // Notre hôte en guise d'identifiant, un autre hôte derrière
      `https://wqqsuybmyqemhojsamgq.supabase.co@exemple.invalid/storage/v1/object/public/uploads/x.geojson`,
      // Notre hôte, mais pas ses fichiers publics
      `${BASE}/rest/v1/profiles?select=*`,
      `${BASE}/storage/v1/object/sign/diagnostic/x.geojson`,
      `${BASE}/storage/v1/object/authenticated/uploads/x.geojson`,
      // Un chemin qui ressort du dossier public une fois résolu
      `${STOCKAGE}/../../../../rest/v1/profiles`,
      `${STOCKAGE}/%2e%2e/%2e%2e/sign/diagnostic/x.geojson`,
      // Autre protocole, adresses internes, valeurs vides
      'http://wqqsuybmyqemhojsamgq.supabase.co/storage/v1/object/public/uploads/x.geojson',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3001/admin/',
      'file:///etc/passwd',
      '/storage/v1/object/public/uploads/x.geojson',
      '', null, undefined, 42,
    ].map(isStoredFile)).toEqual(Array(17).fill(false));
  });

  test('0.97.2 - Une ligne qui désigne une autre adresse est ignorée, sans téléchargement', async () => {
    lignes = [
      { id: 1, project_name: 'Voie lyonnaise 1', category: 'velo', cover_url: null, geojson_url: `${STOCKAGE}/uploads/geojson/projects/a.geojson` },
      { id: 2, project_name: 'Ailleurs', category: 'velo', cover_url: null, geojson_url: 'https://exemple.invalid/trace.geojson' },
      { id: 3, project_name: 'Interne', category: 'velo', cover_url: null, geojson_url: 'http://169.254.169.254/latest/meta-data/' },
      { id: 4, project_name: 'Sans tracé', category: 'velo', cover_url: null, geojson_url: null },
    ];
    const r = await appel(contributions);
    expect(r.status).toBe(200);
    expect(telecharges()).toEqual([`${STOCKAGE}/uploads/geojson/projects/a.geojson`]);
    expect(r.json.features).toHaveLength(1);
    expect(r.json.features[0].properties.project_name).toBe('Voie lyonnaise 1');
  });

  test('0.97.3 - Même règle pour les chantiers', async () => {
    lignes = [
      { id: 'a', name: 'Rue de la Paix', approved: true, geojson_url: `${STOCKAGE}/travaux-geojson/metropole-lyon/a.geojson` },
      { id: 'b', name: 'Ailleurs', approved: true, geojson_url: 'https://exemple.invalid/b.geojson' },
    ];
    const r = await appel(travaux);
    expect(telecharges()).toEqual([`${STOCKAGE}/travaux-geojson/metropole-lyon/a.geojson`]);
    expect(r.json.features).toHaveLength(1);
  });

  test('0.97.4 - Une erreur de la base ne ressort pas dans la réponse publique', async () => {
    base = { status: 400, corps: JSON.stringify({ code: '42703', message: 'column contribution_uploads.secret does not exist', hint: 'Perhaps you meant created_by' }) };
    const r = await appel(contributions);
    expect(r).toEqual({ status: 502, json: { error: 'Données indisponibles' } });

    // Une panne en cours de route non plus
    globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED 10.0.0.12:5432'); };
    const panne = await appel(contributions);
    expect(panne).toEqual({ status: 500, json: { error: 'Erreur interne' } });
  });

  test('0.97.5 - Un code de ville mal formé est refusé avant toute lecture', async () => {
    const r = await appel(contributions, 'lyon&select=*');
    expect(r.status).toBe(400);
    expect(appels).toEqual([]);
  });

});
