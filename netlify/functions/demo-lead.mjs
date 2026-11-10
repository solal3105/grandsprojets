/* ============================================================================
   FONCTION DEMO-LEAD - route /api/demo-lead (POST)

   Recueille l'adresse laissée sur l'écran de fin de la démo salon. C'était le
   trou le plus cher du dispositif : le QR code emmenait le visiteur sur sa
   carte, et personne ne savait qui était venu.

   L'écriture passe par la clé de service : `demo_leads` est en RLS SANS
   politique publique, donc invisible derrière la clé anonyme. Une adresse
   laissée par un élu au salon n'a rien à faire dans une table lisible par
   n'importe qui (contrairement à `contact_requests`, qui expose aujourd'hui
   une politique de lecture publique).
   ============================================================================ */

import { envoyerMessageDemo } from './lib/demo-mail.mjs';
import { ipHashOf, reservePublicMail, mayKeep, maySend, heldMail } from './lib/public-mail.mjs';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';

/* Ce que le formulaire accepte en vingt-quatre heures, compté par la base
   (`lib/public-mail.mjs`). Par origine, en demandes : on borne l'abus sans
   gêner un salon, où une même connexion laisse légitimement des dizaines
   d'adresses. Par adresse, en messages : celle d'un tiers ne reçoit pas le lien
   à répétition. Pour le formulaire entier, en messages : trente fois la plus
   grosse journée connue (9 adresses). */
export const LIMITS = { ip: 40, recipient: 5, total: 300 };

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://openprojets.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

// Volontairement permissif : le but est de ne pas rejeter une adresse réelle
// mal formée à la marge, pas de valider la RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i;
const VILLE_RE = /^essai-[a-z0-9-]+$/;
const INSEE_RE = /^(?:\d{2}|2[AB])\d{3}$/i;

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

// Rattache l'adresse à la génération correspondante : sans ce lien, on sait
// qu'un élu a laissé son mail, mais pas ce qu'il a vu à l'écran.
async function findRunId(ville) {
  if (!ville) return null;
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/demo_runs`);
    url.searchParams.set('select', 'id');
    url.searchParams.set('ville', `eq.${ville}`);
    url.searchParams.set('order', 'started_at.desc');
    url.searchParams.set('limit', '1');
    const r = await fetch(url.toString(), { headers: serviceHeaders() });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}

export default async (req, context) => {
  // Corps null obligatoire : un 204 avec un corps fait lever le constructeur Response.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Corps de requête invalide' });
  }

  // La validation d'entrée passe AVANT le contrôle de configuration : une
  // requête mal formée est refusée pour ce qu'elle est, que la base soit
  // joignable ou non. C'est aussi ce qui rend le contrat testable sans clés.
  const email = String(body?.email || '').trim().slice(0, 180);
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Adresse e-mail invalide' });

  const ville = String(body?.ville || '').trim();
  if (ville && !VILLE_RE.test(ville)) return json(400, { error: 'Paramètre ville invalide' });

  const insee = String(body?.communeInsee || '').trim().toUpperCase();
  if (insee && !INSEE_RE.test(insee)) return json(400, { error: 'Paramètre commune invalide' });

  const projectsCount = Number.isFinite(Number(body?.projectsCount))
    ? Math.max(0, Math.min(999, Math.trunc(Number(body.projectsCount))))
    : null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[demo-lead] SUPABASE_SERVICE_ROLE_KEY absente : enregistrement impossible');
    return json(503, { error: 'Enregistrement indisponible' });
  }

  try {
    const ipHash = await ipHashOf(context?.ip);
    const reservation = await reservePublicMail({ kind: 'demo', ipHash, email, limits: LIMITS });
    if (!mayKeep(reservation)) {
      // Réponse volontairement neutre : l'écran remercie quand même, on ne va
      // pas afficher un message de quota à un visiteur de salon.
      console.warn(`[demo-lead] plafond des vingt-quatre heures atteint pour ${ipHash}`);
      return json(200, { ok: true, stored: false });
    }

    const runId = await findRunId(ville);
    const communeNom = String(body?.communeNom || '').trim().slice(0, 120);
    const spaceUrl = ville ? `https://openprojets.com/ville/${ville}/carte` : null;

    /* Le message part AVANT l'enregistrement, pour que son issue soit consignée
       avec l'adresse : une ligne « envoyé » ou « échec » vaut bien mieux qu'une
       ligne muette qu'il faudrait recouper avec les logs. L'expédition ne lève
       jamais, elle rend son état. Au plafond d'une adresse ou du formulaire,
       l'adresse est gardée sans message : l'écran dit alors qu'on l'a bien
       reçue, sans promettre un lien, et aucune relance ne suit. */
    const mail = maySend(reservation)
      ? await envoyerMessageDemo({ email, communeNom, spaceUrl, projectsCount })
      : heldMail(reservation);
    if (!maySend(reservation)) console.warn(`[demo-lead] adresse gardée sans message : plafond ${reservation}`);

    const r = await fetch(`${SUPABASE_URL}/rest/v1/demo_leads`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify([{
        email,
        ville: ville || null,
        commune_insee: insee,
        commune_nom: communeNom,
        projects_count: projectsCount,
        space_url: spaceUrl,
        ip_hash: ipHash,
        kiosk: body?.kiosk === true,
        run_id: runId,
        mail_status: mail.status,
        mail_error: mail.error || null,
        mail_sent_at: mail.status === 'envoye' ? new Date().toISOString() : null,
      }]),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error(`[demo-lead] insertion ${r.status} :: ${txt.slice(0, 200)}`);
      return json(502, { error: 'Enregistrement impossible' });
    }
    console.log(`[demo-lead] adresse enregistrée pour ${ville || insee || 'commune inconnue'} (message : ${mail.status})`);
    // `mailed` sert à l'écran : il ne promet un envoi que s'il a eu lieu.
    return json(200, { ok: true, stored: true, mailed: mail.status === 'envoye' });
  } catch (e) {
    console.error('[demo-lead] échec ::', e?.message);
    return json(500, { error: 'Enregistrement impossible' });
  }
};

export const config = { path: '/api/demo-lead' };
