// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Garde d'accès des endpoints IA (/api/ai-generate, /api/ai-diagnostic).
 *
 * Ces deux fonctions étaient couvertes à 0 % : les specs copilot et diagnostic
 * interceptent le réseau, donc le préflight, le contrôle de méthode et la
 * vérification du JWT ne s'exécutaient dans aucun test.
 *
 * Tout ce fichier s'arrête avant l'appel à OpenAI : aucun jeton n'est consommé.
 */

const AI_ENDPOINTS = ['/api/ai-generate', '/api/ai-diagnostic'];

test.describe('0.37 - Endpoints IA : préflight CORS', () => {

  for (const path of AI_ENDPOINTS) {
    test(`0.37.1 - RÉGRESSION : OPTIONS ${path} répond 204, pas 500`, async ({ request }) => {
      // Un 204 construit avec un corps, même vide, fait lever le constructeur
      // Response ("Invalid response status code 204") et le préflight partait en 500.
      const res = await request.fetch(path, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3001' },
      });
      expect(res.status()).toBe(204);
      expect(await res.text()).toBe('');
    });

    test(`0.37.2 - OPTIONS ${path} renvoie les en-têtes CORS`, async ({ request }) => {
      const res = await request.fetch(path, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3001' },
      });
      const h = res.headers();
      expect(h['access-control-allow-origin']).toBe('http://localhost:3001');
      expect(h['access-control-allow-headers']).toContain('Authorization');
      expect(h['access-control-allow-methods']).toContain('POST');
    });

    test(`0.37.3 - ${path} : une origine hors allowlist ne se voit jamais renvoyée`, async ({ request }) => {
      const res = await request.fetch(path, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      });
      expect(res.headers()['access-control-allow-origin']).toBe('https://openprojets.com');
    });
  }

  test('0.37.4 - RÉGRESSION : OPTIONS /api/demo-lead répond 204, pas 500', async ({ request }) => {
    const res = await request.fetch('/api/demo-lead', { method: 'OPTIONS' });
    expect(res.status()).toBe(204);
  });

});

test.describe('0.38 - Endpoints IA : méthode et authentification', () => {

  for (const path of AI_ENDPOINTS) {
    test(`0.38.1 - GET ${path} → 405`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(405);
      expect((await res.json()).error).toBe('Method not allowed');
    });

    test(`0.38.2 - POST ${path} sans en-tête Authorization → 401`, async ({ request }) => {
      const res = await request.post(path, { data: {} });
      expect(res.status()).toBe(401);
      expect((await res.json()).error).toBe('Unauthorized');
    });

    test(`0.38.3 - POST ${path} avec un jeton invalide → 401`, async ({ request }) => {
      const res = await request.post(path, {
        headers: { Authorization: 'Bearer pas-un-vrai-jeton' },
        data: {},
      });
      expect(res.status()).toBe(401);
    });

    test(`0.38.4 - POST ${path} avec un JWT bien formé mais non signé par Supabase → 401`, async ({ request }) => {
      // En-tête et charge utile valides en base64url, signature bidon : le
      // rejet doit venir de Supabase, pas d'un parsing local permissif.
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: '00000000-0000-0000-0000-000000000000',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url');
      const res = await request.post(path, {
        headers: { Authorization: `Bearer ${header}.${payload}.signature-forgee` },
        data: {},
      });
      expect(res.status()).toBe(401);
    });

    test(`0.38.5 - ${path} : le corps d'erreur ne fuite jamais de détail interne`, async ({ request }) => {
      const res = await request.post(path, { data: {} });
      const raw = await res.text();
      expect(raw).not.toMatch(/supabase\.co|apikey|Bearer|OPENAI|at Object\.|\.mjs:/i);
    });
  }

});
