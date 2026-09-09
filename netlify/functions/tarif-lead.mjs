/* ============================================================================
   FONCTION TARIF-LEAD - route /api/tarif-lead (POST)

   Recueille la demande de tarif laissée sur l'estimateur (/home2/tarification) :
   une adresse e-mail, un téléphone si l'on veut, et les réglages du moment
   (population, modules, engagement).

   Elle fait deux choses, dans cet ordre : elle envoie au demandeur le message
   de `lib/tarif-mail.mjs`, l'équipe en copie invisible (c'est la
   notification), puis elle range la demande dans `contact_requests` avec les
   autres demandes de contact, via la clé de service. Le tarif exact n'est
   jamais donné ici : c'est l'équipe qui le communique.

   La validation passe avant tout contrôle de configuration : une requête mal
   formée est refusée pour ce qu'elle est, et le contrat se teste sans clés.
   ============================================================================ */

import { envoyerMessageTarif, NOMS_MODULES } from './lib/tarif-mail.mjs';
import { POIDS, POPULATION, ENGAGEMENTS, borner, euros, estimer, nombre } from '../../home-src/src/v2/data/tarification.mjs';

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';

/* Au-delà de ce nombre de demandes par adresse et par jour, on n'envoie plus
   de message : une adresse tapée par un tiers ne doit pas être inondée. */
const MAX_DEMANDES_PAR_EMAIL_PAR_JOUR = 3;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://openprojets.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

// Volontairement permissif : ne pas rejeter une adresse réelle mal formée à
// la marge, pas valider la RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i;
const TELEPHONE_RE = /^[\d\s().+-]{6,30}$/;

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function demandesDuJour(email) {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(`${SUPABASE_URL}/rest/v1/contact_requests`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('referrer', 'eq.tarification');
  url.searchParams.set('email', `eq.${email}`);
  url.searchParams.set('created_at', `gte.${today}`);
  const r = await fetch(url.toString(), {
    headers: { ...serviceHeaders(), Prefer: 'count=exact', Range: '0-0' },
  });
  return parseInt((r.headers.get('content-range') || '0/0').split('/')[1] || '0', 10);
}

/* Lit et borne les réglages envoyés par la page. Rend null si l'un d'eux est
   hors de ce que la page elle-même propose. */
export function lireReglages(body) {
  const population = Number(body?.population);
  if (!Number.isFinite(population) || population < POPULATION.min || population > POPULATION.max) return null;
  const modules = Array.isArray(body?.modules) ? body.modules.map(String) : [];
  if (!modules.length || modules.length > Object.keys(POIDS).length) return null;
  if (modules.some((m) => POIDS[m] == null) || new Set(modules).size !== modules.length) return null;
  const annees = Number(body?.annees);
  if (!ENGAGEMENTS.some((e) => e.annees === annees)) return null;
  return { population: borner(population), modules, annees };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Corps de requête invalide' });
  }

  const email = String(body?.email || '').trim().slice(0, 180);
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Adresse e-mail invalide' });

  const telephone = String(body?.telephone || '').trim().slice(0, 30);
  if (telephone && !TELEPHONE_RE.test(telephone)) return json(400, { error: 'Numéro de téléphone invalide' });

  const reglages = lireReglages(body);
  if (!reglages) return json(400, { error: 'Réglages de l\'estimation invalides' });

  const serviceDisponible = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceDisponible) console.warn('[tarif-lead] SUPABASE_SERVICE_ROLE_KEY absente : la demande ne sera pas enregistrée');

  try {
    if (serviceDisponible) {
      const deja = await demandesDuJour(email).catch(() => 0);
      if (deja >= MAX_DEMANDES_PAR_EMAIL_PAR_JOUR) {
        // Réponse neutre : l'écran remercie, on n'annonce pas un quota
        console.warn(`[tarif-lead] plafond journalier atteint pour une adresse`);
        return json(200, { ok: true, stored: false, mailed: false });
      }
    }

    const mail = await envoyerMessageTarif({ email, telephone, ...reglages });

    let stored = false;
    if (serviceDisponible) {
      // Le message interne : ce que l'équipe lit dans la liste des demandes,
      // avec le tarif exact cette fois, puisqu'il ne sort pas d'ici.
      const e = estimer(reglages);
      const message = `Tarif demandé sur l'estimateur : ${nombre(e.population)} habitants, `
        + `${reglages.modules.map((k) => NOMS_MODULES[k] || k).join(', ')}, engagement ${e.annees} ${e.annees > 1 ? 'ans' : 'an'}. `
        + `Grille : ${euros(e.mensuel)} HT par mois, mise en service ${euros(e.setup)}, total ${euros(e.total)} HT sur la durée. `
        + `Message au demandeur : ${mail.status}${mail.error ? ` (${mail.error})` : ''}.`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/contact_requests`, {
        method: 'POST',
        headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify([{
          full_name: '',
          email,
          phone: telephone || null,
          organization: '',
          message,
          referrer: 'tarification',
        }]),
      });
      stored = r.ok;
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        console.error(`[tarif-lead] insertion ${r.status} :: ${txt.slice(0, 200)}`);
      }
    }

    console.log(`[tarif-lead] demande reçue (${reglages.population} habitants, ${reglages.modules.length} module(s), message : ${mail.status}, enregistrée : ${stored})`);
    // `mailed` sert à l'écran : il ne promet un message que s'il est parti.
    return json(200, { ok: true, stored, mailed: mail.status === 'envoye' });
  } catch (e) {
    console.error('[tarif-lead] échec ::', e?.message);
    return json(500, { error: 'Demande impossible à enregistrer' });
  }
};

export const config = { path: '/api/tarif-lead' };
