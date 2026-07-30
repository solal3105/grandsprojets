// @ts-check
import { test, expect } from '@playwright/test';
import { _internals } from '../netlify/functions/auth-token.mjs';

/**
 * SSO Phaos : les gardes de auth-token, au-delà de la validation des champs.
 *
 * unauth.phaos-function.spec.js couvre déjà le décodage et les rejets iss/aud/exp.
 * Restaient sans filet : la sélection de clé dans le JWKS, la confusion
 * d'algorithme, l'extraction d'identité, et la limite de débit.
 *
 * Avec PHAOS_ORIGINS côté navigateur, cette fonction est l'unique barrière du SSO.
 */

const {
  decodeJwt, base64urlToBuffer, detectAzureEnv, extractEmail,
  checkRateLimit, rateLimitMap, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, AZURE_ENVS,
} = _internals;

const ENDPOINT = '/api/auth/token';
const PROD = AZURE_ENVS.prod;

/** Forge un JWT non signé : en-tête et charge utile réels, signature bidon. */
function forger(header, payload, signature = 'signature-bidon') {
  const b = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${b(header)}.${b(payload)}.${signature}`;
}

const futur = () => Math.floor(Date.now() / 1000) + 3600;

test.describe("0.54 - Phaos : sélection de la clé et algorithme", () => {

  test('0.54.1 - Un kid absent du JWKS Azure est refusé', async ({ request }) => {
    // Atteint réellement le JWKS Azure : couvre fetchJwks et la recherche de clé.
    const res = await request.post(ENDPOINT, {
      data: { idToken: forger({ alg: 'RS256', kid: 'kid-inexistant-0000' }, { iss: PROD.iss, aud: PROD.aud, exp: futur(), emails: ['a@b.fr'] }) },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('Clé de signature inconnue');
  });

  test("0.54.2 - RÉGRESSION : alg 'none' ne contourne pas la vérification", async ({ request }) => {
    // La vérification impose RSASSA-PKCS1-v1_5 quel que soit l'en-tête : la
    // confusion d'algorithme est impossible par construction. Ce test fige la règle.
    for (const alg of ['none', 'HS256', 'RS512', '']) {
      const res = await request.post(ENDPOINT, {
        data: { idToken: forger({ alg }, { iss: PROD.iss, aud: PROD.aud, exp: futur(), emails: ['a@b.fr'] }) },
      });
      expect(res.status(), alg).toBe(401);
    }
  });

  test('0.54.3 - Un kid volé à un autre tenant ne passe pas', async ({ request }) => {
    // Le JWKS interrogé est celui déduit de iss : un kid valide ailleurs reste
    // introuvable ici.
    const res = await request.post(ENDPOINT, {
      data: { idToken: forger({ alg: 'RS256', kid: 'X5eXk4xyojNFum1kl2Ytv8dlNP4-c57dO6QGTVBwaNk' }, { iss: PROD.iss, aud: PROD.aud, exp: futur(), emails: ['a@b.fr'] }) },
    });
    expect(res.status()).toBe(401);
  });

  test('0.54.4 - Une origine hors allowlist ne se voit jamais renvoyée', async ({ request }) => {
    const res = await request.fetch(ENDPOINT, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(res.headers()['access-control-allow-origin']).toBe('https://openprojets.com');
  });

});

test.describe('0.55 - Phaos : décodage du jeton', () => {

  test('0.55.1 - decodeJwt exige exactement trois segments', () => {
    for (const mauvais of ['', 'a', 'a.b', 'a.b.c.d', '....']) {
      expect(() => decodeJwt(mauvais), mauvais).toThrow();
    }
  });

  test('0.55.2 - decodeJwt lit un en-tête et une charge utile base64url', () => {
    const { header, payload } = decodeJwt(forger({ alg: 'RS256', kid: 'k1' }, { iss: PROD.iss, sub: 'u1' }));
    expect(header).toEqual({ alg: 'RS256', kid: 'k1' });
    expect(payload.sub).toBe('u1');
  });

  test('0.55.3 - decodeJwt refuse une charge utile qui n\'est pas du JSON', () => {
    const b = Buffer.from('pas du json').toString('base64url');
    expect(() => decodeJwt(`${b}.${b}.sig`)).toThrow();
  });

  test('0.55.4 - base64urlToBuffer restitue les octets, padding compris', () => {
    for (const texte of ['a', 'ab', 'abc', 'abcd', 'accentué à côté', '']) {
      const encode = Buffer.from(texte, 'utf8').toString('base64url');
      expect(base64urlToBuffer(encode).toString('utf8'), texte).toBe(texte);
    }
  });

  test('0.55.5 - Les caractères base64url sont bien retraduits', () => {
    // - et _ remplacent + et / : les confondre corromprait la signature.
    const octets = Buffer.from([0xfb, 0xff, 0xbe]);
    expect(base64urlToBuffer(octets.toString('base64url')).equals(octets)).toBe(true);
  });

});

test.describe("0.56 - Phaos : émetteur et identité", () => {

  test('0.56.1 - detectAzureEnv reconnaît les deux environnements', () => {
    expect(detectAzureEnv(PROD.iss)).toBe(AZURE_ENVS.prod);
    expect(detectAzureEnv(AZURE_ENVS.qa.iss)).toBe(AZURE_ENVS.qa);
  });

  test("0.56.2 - detectAzureEnv ne reconnaît rien d'autre", () => {
    for (const iss of ['', 'https://login.microsoftonline.com/x/v2.0/', 'https://evil.example/', undefined]) {
      expect(detectAzureEnv(iss), String(iss)).toBeNull();
    }
  });

  test("0.56.3 - La détection est large, mais la comparaison finale est exacte", () => {
    // Un émetteur en trompe-l'œil passe la détection : c'est la comparaison
    // stricte du handler qui le rejette. Ce test décrit ce partage des rôles.
    const sosie = 'https://terrampprod.b2clogin.com.attaquant.example/e49dda1d/v2.0/';
    expect(detectAzureEnv(sosie)).toBe(AZURE_ENVS.prod);
    expect(sosie).not.toBe(PROD.iss);
  });

  test("0.56.4 - RÉGRESSION : un émetteur en trompe-l'œil est refusé par le handler", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        idToken: forger(
          { alg: 'RS256', kid: 'k1' },
          { iss: 'https://terrampprod.b2clogin.com.attaquant.example/e49dda1d/v2.0/', aud: PROD.aud, exp: futur(), emails: ['a@b.fr'] },
        ),
      },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('Émetteur invalide');
  });

  test("0.56.5 - extractEmail ne lit que le claim `emails`, en tableau", () => {
    expect(extractEmail({ emails: ['a@b.fr', 'c@d.fr'] })).toBe('a@b.fr');
    expect(extractEmail({ emails: [] })).toBeNull();
    expect(extractEmail({ emails: 'a@b.fr' })).toBeNull();
    expect(extractEmail({ email: 'a@b.fr' })).toBeNull();
    expect(extractEmail({ upn: 'a@b.fr', preferred_username: 'a@b.fr' })).toBeNull();
    expect(extractEmail({})).toBeNull();
  });

});

test.describe('0.57 - Phaos : limite de débit', () => {

  // La limite n'est pas observable via netlify dev (module rechargé à chaque
  // requête, compteur remis à zéro). Elle se vérifie donc sur la fonction même,
  // avec une horloge pilotée pour éprouver le glissement de la fenêtre.
  let vraiNow;
  let horloge;

  test.beforeEach(() => {
    rateLimitMap.clear();
    horloge = 1_000_000;
    vraiNow = Date.now;
    Date.now = () => horloge;
  });

  test.afterEach(() => {
    Date.now = vraiNow;
    rateLimitMap.clear();
  });

  test('0.57.1 - Les dix premières requêtes passent, la onzième non', () => {
    for (let i = 1; i <= RATE_LIMIT_MAX; i++) {
      expect(checkRateLimit('1.2.3.4'), `requête ${i}`).toBe(true);
    }
    expect(checkRateLimit('1.2.3.4')).toBe(false);
  });

  test("0.57.2 - RÉGRESSION : une requête refusée n'allonge pas la punition", () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('1.2.3.4');
    // Cinq tentatives refusées : si elles étaient enregistrées, la fenêtre
    // glisserait sans fin et l'IP resterait bloquée bien au-delà d'une minute.
    for (let i = 0; i < 5; i++) expect(checkRateLimit('1.2.3.4')).toBe(false);
    horloge += RATE_LIMIT_WINDOW_MS + 1;
    expect(checkRateLimit('1.2.3.4')).toBe(true);
  });

  test('0.57.3 - La fenêtre glisse : les anciennes requêtes sortent du décompte', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('5.6.7.8');
    expect(checkRateLimit('5.6.7.8')).toBe(false);
    // Juste avant l'expiration : toujours bloqué
    horloge += RATE_LIMIT_WINDOW_MS - 10;
    expect(checkRateLimit('5.6.7.8')).toBe(false);
    // Juste après : la fenêtre est vide, tout repart
    horloge += 20;
    expect(checkRateLimit('5.6.7.8')).toBe(true);
  });

  test('0.57.4 - Une adresse saturée ne bloque pas les autres', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit('1.1.1.1');
    expect(checkRateLimit('1.1.1.1')).toBe(false);
    expect(checkRateLimit('2.2.2.2')).toBe(true);
    expect(checkRateLimit('unknown')).toBe(true);
  });

  test('0.57.5 - Une requête toutes les six secondes ne déclenche jamais la limite', () => {
    for (let i = 0; i < 50; i++) {
      expect(checkRateLimit('9.9.9.9'), `minute ${i}`).toBe(true);
      horloge += 6_100;
    }
  });

});
