/* ============================================================================
   FONCTION LIEN-COURT - route /api/lien-court (POST)

   Enregistre une adresse courte openprojets.com/l/{code} demandée depuis la
   page /lien, et rend l'adresse à copier.

   Deux garde-fous, parce que la page n'est pas protégée par un compte :
   la cible doit être une de nos pages (sans quoi notre domaine servirait de
   redirection vers n'importe où), et la création est plafonnée sur une courte
   fenêtre pour qu'un script ne remplisse pas la table.

   Un code déjà pris est refusé, sauf s'il pointe déjà exactement là : dans ce
   cas la même adresse est rendue, ce qui permet de refaire le même lien sans
   se poser de question.
   ============================================================================ */

import { validerCible, CODE_VALIDE } from '../../home-src/src/lib/utm.mjs';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SITE = 'https://openprojets.com';

// Les débuts d'adresse déjà pris par le site : une adresse courte ne doit
// jamais masquer une page existante.
const CODES_RESERVES = new Set([
  'admin', 'api', 'aide', 'assets', 'carte', 'cartes', 'chantiers', 'confidentialite',
  'demo', 'diagnostic', 'fiche', 'helios', 'img', 'lien', 'login', 'logout',
  'participer', 'ph', 'ressources', 'tarification', 'travaux', 'ville',
]);

// Au-delà, on suppose un script plutôt qu'une équipe commerciale.
const MAX_CREATIONS = 40;
const FENETRE_MINUTES = 10;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

/** Le lien déjà enregistré sous ce code, s'il existe. */
async function lienExistant(code) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/share_links`);
  url.searchParams.set('select', 'code,target_url');
  url.searchParams.set('code', `eq.${code}`);
  const r = await fetch(url.toString(), { headers: serviceHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Combien d'adresses courtes viennent d'être créées ? */
async function creationsRecentes() {
  const depuis = new Date(Date.now() - FENETRE_MINUTES * 60_000).toISOString();
  const url = new URL(`${SUPABASE_URL}/rest/v1/share_links`);
  url.searchParams.set('select', 'code');
  url.searchParams.set('created_at', `gte.${depuis}`);
  const r = await fetch(url.toString(), {
    headers: { ...serviceHeaders(), Prefer: 'count=exact', Range: '0-0' },
  });
  return parseInt((r.headers.get('content-range') || '0/0').split('/')[1] || '0', 10);
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Requête illisible' });
  }

  const code = String(body?.code || '').trim().toLowerCase();
  if (!CODE_VALIDE.test(code)) {
    return json(400, { error: 'La fin de l’adresse doit faire deux caractères au moins, en minuscules, sans accent ni espace.' });
  }
  if (CODES_RESERVES.has(code)) {
    return json(409, { error: 'Cette fin d’adresse est déjà celle d’une page du site. Choisissez-en une autre.' });
  }

  // validerCible, pas analyserCible : la cible arrive déjà marquée et ses
  // marqueurs doivent arriver intacts au bout de la redirection.
  const { url: cible, erreur } = validerCible(body?.target_url);
  if (!cible) return json(400, { error: erreur || 'Le lien à raccourcir manque.' });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { error: 'Les adresses courtes ne sont pas configurées sur ce serveur.' });
  }

  const deja = await lienExistant(code);
  if (deja) {
    if (deja.target_url === cible.toString()) return json(200, { url: `${SITE}/l/${code}`, code, existant: true });
    return json(409, { error: 'Cette fin d’adresse mène déjà ailleurs. Choisissez-en une autre.' });
  }

  if (await creationsRecentes() >= MAX_CREATIONS) {
    return json(429, { error: 'Trop d’adresses courtes viennent d’être créées. Réessayez dans quelques minutes.' });
  }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/share_links`, {
    method: 'POST',
    headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      code,
      target_url: cible.toString(),
      label: String(body?.label || '').trim().slice(0, 120) || null,
      author: String(body?.author || '').trim().slice(0, 80) || null,
    }),
  });

  if (!r.ok) {
    // 23505 : deux demandes simultanées sur le même code.
    const detail = await r.text();
    const conflit = r.status === 409 || detail.includes('23505');
    return json(conflit ? 409 : 502, {
      error: conflit
        ? 'Cette fin d’adresse vient d’être prise. Choisissez-en une autre.'
        : 'L’adresse courte n’a pas pu être enregistrée.',
    });
  }

  return json(201, { url: `${SITE}/l/${code}`, code });
};

export const config = { path: '/api/lien-court' };
