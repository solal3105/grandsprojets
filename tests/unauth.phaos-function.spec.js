// @ts-check
// Tests de la Netlify Function POST /api/auth/token
// Utilise le request fixture Playwright (pas de navigateur, appels HTTP directs).
//
// Couverture : toutes les rejections possibles AVANT l'appel JWKS (pas de dépendance réseau Azure).
// Les chemins qui nécessitent un vrai token Azure B2C signé ne sont PAS testés en E2E.
//
// Section : 0.3 - SSO Phaos / Fonction auth-token

import { test, expect } from '@playwright/test';

const ENDPOINT = '/api/auth/token';

// ── Helper : construit un JWT base64url fake (non signé) ────────────────────
// Permet de tester les validations qui se font AVANT la vérification de signature.
function makeFakeJwt(payload) {
  const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const header = enc({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' });
  const body   = enc(payload);
  return `${header}.${body}.fakesig`;
}

// ── Payloads de test ─────────────────────────────────────────────────────────
const NOW = Math.floor(Date.now() / 1000);

const JWT_EXPIRED_PROD = makeFakeJwt({
  iss: 'https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/v2.0/',
  aud: '74bf9434-d301-49a6-950b-24cde8047d95',
  exp: NOW - 3600, // expiré il y a 1h
});

const JWT_UNKNOWN_ISS = makeFakeJwt({
  iss: 'https://unknown-issuer.example.com/v2.0/',
  aud: 'some-audience',
  exp: NOW + 3600,
});

const JWT_WRONG_AUD = makeFakeJwt({
  iss: 'https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/v2.0/',
  aud: 'wrong-audience-value',
  exp: NOW + 3600,
});

const JWT_WRONG_ISS_EXACT = makeFakeJwt({
  // iss correspond au domaine prod (détecté) mais pas au match exact iss string
  iss: 'https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/v2.0/extra',
  aud: '74bf9434-d301-49a6-950b-24cde8047d95',
  exp: NOW + 3600,
});

// ─────────────────────────────────────────────────────────
// 0.3.1 - Preflight CORS
// ─────────────────────────────────────────────────────────
test.describe('0.3.1 - auth-token : preflight CORS', () => {

  test('OPTIONS → 204 avec headers CORS', async ({ request }) => {
    const res = await request.fetch(ENDPOINT, {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://localhost:3001', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status()).toBe(204);
    const headers = res.headers();
    expect(headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(headers['access-control-allow-methods']).toContain('POST');
  });

});

// ─────────────────────────────────────────────────────────
// 0.3.2 - Validation des inputs
// ─────────────────────────────────────────────────────────
test.describe('0.3.2 - auth-token : validation des inputs', () => {

  test('POST sans body → 400', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: '',
    });
    expect(res.status()).toBe(400);
  });

  test('POST body non-JSON → 400', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: 'pas du json{',
    });
    expect(res.status()).toBe(400);
  });

  test('POST idToken manquant → 400', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: { autreChamp: 'valeur' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST idToken = string sans points → 400 JWT malformé', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: { idToken: 'pas-un-jwt-du-tout' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/malform|malformé|invalide/i);
  });

});

// ─────────────────────────────────────────────────────────
// 0.3.3 - Validation du JWT (sans appel JWKS)
// ─────────────────────────────────────────────────────────
test.describe('0.3.3 - auth-token : validation JWT (sans JWKS)', () => {

  test('JWT avec iss non reconnu → 401 émetteur non reconnu', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: { idToken: JWT_UNKNOWN_ISS },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/émetteur|issuer|reconnu/i);
  });

  test('JWT expiré (prod env) → 401 token expiré', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: { idToken: JWT_EXPIRED_PROD },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/expiré|expired/i);
  });

  test('JWT avec aud incorrect → 401 audience invalide', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: { idToken: JWT_WRONG_AUD },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/audience|aud/i);
  });

  test('JWT avec iss non conforme (match détection mais pas exact) → 401', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3001' },
      data: { idToken: JWT_WRONG_ISS_EXACT },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/émetteur|issuer|invalide/i);
  });

});

// ─────────────────────────────────────────────────────────
// 0.3.4 - Méthodes HTTP non autorisées
// ─────────────────────────────────────────────────────────
test.describe('0.3.4 - auth-token : méthodes non autorisées', () => {

  test('GET → 405', async ({ request }) => {
    const res = await request.get(ENDPOINT, {
      headers: { 'Origin': 'http://localhost:3001' },
    });
    expect(res.status()).toBe(405);
  });

});
