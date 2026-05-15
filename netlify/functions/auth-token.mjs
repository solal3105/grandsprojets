/**
 * Netlify Function: auth-token
 * Échange un id_token Azure AD B2C contre une session Supabase.
 * Utilisé pour le SSO Phaos → Open Projets via iframe.
 *
 * POST /api/auth/token
 * Body    : { idToken: string }
 * Réponse : { access_token, refresh_token, expires_in }
 *
 * Variables d'environnement requises (Netlify Dashboard) :
 *   SUPABASE_SERVICE_ROLE_KEY — clé service role Supabase, jamais exposée côté client
 *
 * Checkboxes à valider avant mise en production :
 *   ☐ SUPABASE_SERVICE_ROLE_KEY configurée dans le dashboard Netlify
 *   ☐ Confirmer avec Arthur le claim email dans le token B2C (voir extractEmail())
 *   ☐ Tester en local avec un vrai token Azure Dev (npm run dev)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';

// ── Config Azure AD B2C — 3 environnements ──────────────────────────────────
// Détection automatique via le claim `iss` du token
const AZURE_ENVS = {
  prod: {
    jwksUrl: 'https://login.microsoftonline.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/discovery/v2.0/keys',
    aud: '74bf9434-d301-49a6-950b-24cde8047d95',
    iss: 'https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/v2.0/',
  },
  qa: {
    jwksUrl: 'https://login.microsoftonline.com/a5bf3fea-f831-426c-9892-1b8539d43023/discovery/v2.0/keys',
    aud: 'b71c5170-bd1c-4e73-bbfc-ababa8eb0286',
    iss: 'https://terrampqa.b2clogin.com/a5bf3fea-f831-426c-9892-1b8539d43023/v2.0/',
  },
  dev: {
    jwksUrl: 'https://login.microsoftonline.com/6d6d1704-34d0-4b2f-9c5e-f624b4e2d0fc/discovery/v2.0/keys',
    aud: 'f81ab73a-59ba-440a-bb80-87669c8f7f0a',
    iss: 'https://terrampdev.b2clogin.com/6d6d1704-34d0-4b2f-9c5e-f624b4e2d0fc/v2.0/',
  },
};

// ── Cache JWKS — TTL 1h ──────────────────────────────────────────────────────
// Survit aux warm instances Netlify. Recalculé sur cold start (acceptable).
const jwksCache = new Map(); // jwksUrl → { keys: JWK[], fetchedAt: number }
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(jwksUrl) {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch échoué : HTTP ${res.status}`);
  const { keys } = await res.json();
  jwksCache.set(jwksUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

// ── Helpers JWT (Web Crypto API — Node 18+) ──────────────────────────────────
function base64urlToBuffer(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  return Buffer.from(padded, 'base64');
}

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT malformé : 3 segments attendus');
  const header  = JSON.parse(base64urlToBuffer(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64urlToBuffer(parts[1]).toString('utf8'));
  return { header, payload, parts };
}

async function verifyJwtSignature(token, jwk) {
  const { parts } = decodeJwt(token);
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature    = base64urlToBuffer(parts[2]);

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    signature,
    new TextEncoder().encode(signingInput)
  );
  if (!valid) throw new Error('Signature RSA invalide');
}

// ── Détection de l'environnement Azure depuis iss ────────────────────────────
function detectAzureEnv(iss = '') {
  if (iss.includes('terrampprod')) return AZURE_ENVS.prod;
  if (iss.includes('terrampqa'))  return AZURE_ENVS.qa;
  if (iss.includes('terrampdev')) return AZURE_ENVS.dev;
  return null;
}

// ── Extraction de l'email depuis le payload du token ─────────────────────────
// Confirmé par Arthur (AXOPEN) le 15/05/2026 : claim `emails` (array)
function extractEmail(payload) {
  return Array.isArray(payload.emails) ? payload.emails[0] ?? null : null;
}

// ── Rate-limiting en mémoire ─────────────────────────────────────────────────
// Limite à 10 requêtes par IP par fenêtre glissante de 60s.
// Note : par instance Netlify Function (cold start = reset). Acceptable en B2B V1
// avec un nombre d'utilisateurs limité. Si plusieurs instances tournent simultanément,
// la limite effective est N×10 req/min (N = instances actives).
const rateLimitMap = new Map(); // ip → number[] (timestamps ms)
const RATE_LIMIT_MAX        = 10;
const RATE_LIMIT_WINDOW_MS  = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  const hits = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, hits); // ne pas ajouter le nouveau hit
    return false;
  }
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return true;
}

// ── CORS ─────────────────────────────────────────────────────────────────────
// Cette fonction est appelée par phaos-auth.js qui tourne sur openprojets.com.
// Les domaines Phaos n'appellent jamais cette fonction directement —
// ils communiquent uniquement via postMessage (validé côté client dans phaos-auth.js).
const CORS_ORIGINS = [
  'https://openprojets.com',
  'http://localhost:3001',
  'http://localhost:8888',
];

function getCorsHeaders(req) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function errResp(status, msg, corsHeaders) {
  console.error(`[auth-token] ${status}: ${msg}`);
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST')    return errResp(405, 'Méthode non autorisée', corsHeaders);

  // Rate-limiting : 10 req/min par IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    console.warn(`[auth-token] Rate limit dépassé pour IP : ${ip}`);
    return errResp(429, 'Trop de requêtes — réessayer dans 1 minute', corsHeaders);
  }

  // ① Lire le body
  let idToken, city;
  try {
    ({ idToken, city } = await req.json());
  } catch {
    return errResp(400, 'JSON invalide', corsHeaders);
  }
  if (!idToken || typeof idToken !== 'string') {
    return errResp(400, 'idToken manquant ou invalide', corsHeaders);
  }
  // city est optionnelle — si absente, le profil sera créé sans ville
  const citySlug = (typeof city === 'string' && /^[a-z0-9-]+$/i.test(city)) ? city : null;

  // ② Décoder le JWT sans vérification pour lire iss (détection env) et kid (sélection clé)
  let header, payload;
  try {
    ({ header, payload } = decodeJwt(idToken));
  } catch {
    return errResp(400, 'JWT malformé', corsHeaders);
  }

  // ③ Détecter l'environnement Azure B2C via iss
  const azureEnv = detectAzureEnv(payload.iss);
  if (!azureEnv) {
    console.error(`[auth-token] iss non reconnu : ${payload.iss}`);
    return errResp(401, 'Émetteur non reconnu', corsHeaders);
  }

  // ④ Valider exp AVANT les appels réseau (évite des requêtes inutiles)
  if (!payload.exp || Date.now() / 1000 > payload.exp) {
    return errResp(401, 'Token expiré', corsHeaders);
  }

  // ⑤ Valider aud
  if (payload.aud !== azureEnv.aud) {
    console.error(`[auth-token] aud invalide : attendu ${azureEnv.aud}, reçu ${payload.aud}`);
    return errResp(401, 'Audience invalide', corsHeaders);
  }

  // ⑥ Valider iss (match exact)
  if (payload.iss !== azureEnv.iss) {
    console.error(`[auth-token] iss invalide : attendu ${azureEnv.iss}, reçu ${payload.iss}`);
    return errResp(401, 'Émetteur invalide', corsHeaders);
  }

  // ⑦ Récupérer les clés publiques Azure (JWKS) et vérifier la signature RSA
  let jwks;
  try {
    jwks = await fetchJwks(azureEnv.jwksUrl);
  } catch (err) {
    console.error('[auth-token] Erreur fetch JWKS :', err.message);
    return errResp(502, 'Impossible de récupérer les clés Azure', corsHeaders);
  }

  const jwk = jwks.find(k => k.kid === header.kid);
  if (!jwk) {
    console.error(`[auth-token] kid introuvable dans le JWKS : ${header.kid}`);
    return errResp(401, 'Clé de signature inconnue', corsHeaders);
  }

  try {
    await verifyJwtSignature(idToken, jwk);
  } catch (err) {
    console.error('[auth-token] Signature JWT invalide :', err.message);
    return errResp(401, 'Signature invalide', corsHeaders);
  }

  // ⑧ Extraire l'email
  const email = extractEmail(payload);
  if (!email || !email.includes('@')) {
    console.error('[auth-token] Email introuvable dans le token. Claims reçus :', Object.keys(payload).join(', '));
    return errResp(401, 'Identité utilisateur introuvable dans le token', corsHeaders);
  }

  // ⑨ Lookup + auto-provisioning dans Supabase (service role requis)
  // Vérifié ici (après toutes les validations) pour permettre les tests unitaires
  // de validation JWT/CORS sans avoir besoin de SUPABASE_SERVICE_ROLE_KEY en local.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('[auth-token] SUPABASE_SERVICE_ROLE_KEY absente — à configurer dans le dashboard Netlify');
    return errResp(500, 'Configuration serveur incomplète', corsHeaders);
  }

  // Client instancié à chaque requête — pas de persistance de session inter-requêtes
  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId;
  try {
    // TODO[PERF] : listUsers sans filtre serveur — correct en V1 (B2B, < quelques centaines d'users)
    // Si la base dépasse ~1000 entrées, remplacer par une requête directe sur auth.users via REST admin
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;

    const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existing) {
      userId = existing.id;
      console.log(`[auth-token] Utilisateur existant trouvé : ${userId}`);
    } else {
      // Auto-provisioning — acté avec Arthur le 08/04/2026
      const { data: { user: created }, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = created.id;
      console.log(`[auth-token] Nouvel utilisateur créé : ${userId} (${email})`);

      // Créer le profil avec role admin et la ville fournie
      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({ id: userId, role: 'admin', ville: citySlug ? [citySlug] : [] });
      if (profileErr) {
        // Non-bloquant : l'auth réussit quand même, profil à compléter manuellement
        console.error(`[auth-token] Impossible de créer le profil pour ${userId} :`, profileErr.message);
      } else {
        console.log(`[auth-token] Profil créé : role=admin, ville=${citySlug ?? '(vide)'}`);
      }
    }
  } catch (err) {
    console.error('[auth-token] Erreur Supabase lookup/create :', err.message);
    return errResp(502, 'Erreur lors de la gestion utilisateur', corsHeaders);
  }

  // ⑩ Créer la session Supabase
  try {
    const { data: { session }, error: sessionErr } = await supabase.auth.admin.createSession({ user_id: userId });
    if (sessionErr) throw sessionErr;

    console.log(`[auth-token] Session créée pour userId : ${userId}`);

    return new Response(
      JSON.stringify({
        access_token:  session.access_token,
        refresh_token: session.refresh_token,
        expires_in:    session.expires_in,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[auth-token] Erreur création session :', err.message);
    return errResp(502, 'Erreur lors de la création de session', corsHeaders);
  }
}

// Netlify Functions v2 : bind direct à /api/auth/token (sans redirect)
export const config = { path: '/api/auth/token' };
