/* ============================================================================
   FONCTION LIEN-CONNEXION - route /api/lien-connexion (POST { email })

   Envoie le lien de connexion demandé sur /login/. La logique est dans
   `lib/lien-connexion.mjs` (testée sans réseau) ; ce fichier branche les vrais
   services : la réservation des e-mails publics, la recherche du compte
   (`compte_par_email`, clé de service), le jeton fabriqué par Supabase Auth
   sans envoi (`/auth/v1/admin/generate_link`) et l'envoi par Resend.
   ============================================================================ */

import { demanderLienConnexion, LIMITS } from './lib/lien-connexion.mjs';
import { ipHashOf, reservePublicMail } from './lib/public-mail.mjs';
import { envoyerEmail } from './lib/mail.mjs';
import { SUPABASE_URL, getCorsHeaders, preflightResp } from './lib/http.mjs';

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function trouverCompte(email) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/compte_par_email`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ p_email: email }),
  });
  if (!r.ok) throw new Error(`recherche du compte ${r.status}`);
  const data = await r.json();
  const c = Array.isArray(data) ? data[0] : data;
  return c ? { confirme: Boolean(c.email_confirmed_at) } : null;
}

async function fabriquerJeton(email, type) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ type, email }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.hashed_token) throw new Error(`generate_link ${r.status} ${String(data?.msg || data?.error_description || '').slice(0, 120)}`);
  return { jeton: data.hashed_token, type: data.verification_type || type };
}

export default async (req, context) => {
  const cors = { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return preflightResp(cors);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: cors });
  if (req.method !== 'POST') return json(405, { issue: 'invalide' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[lien-connexion] SUPABASE_SERVICE_ROLE_KEY absente : aucun lien ne peut partir');
    return json(503, { issue: 'echec' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { issue: 'invalide' }); }

  try {
    const ipHash = await ipHashOf(context?.ip);
    const r = await demanderLienConnexion(
      { email: body?.email, origine: req.headers.get('origin') || '' },
      {
        reserver: (email) => reservePublicMail({ kind: 'connexion', ipHash, email, limits: LIMITS }),
        trouverCompte,
        fabriquerJeton,
        envoyer: ({ a, objet, texte, html }) => envoyerEmail({ to: a, subject: objet, text: texte, html }),
      },
    );
    if (r.issue === 'echec') console.error(`[lien-connexion] échec :: ${r.detail}`);
    else console.log(`[lien-connexion] ${r.issue}`);
    const statut = { envoye: 200, inconnu: 404, plafond: 429, invalide: 400, echec: 502 }[r.issue];
    return json(statut, { issue: r.issue });
  } catch (e) {
    console.error('[lien-connexion] erreur inattendue ::', e?.message);
    return json(502, { issue: 'echec' });
  }
};

export const config = { path: '/api/lien-connexion' };
