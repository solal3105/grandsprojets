/* ============================================================================
   FONCTION PARTICIPER-RETRAIT - route /api/participer/retrait (POST)

   Bouton public « demander le retrait de ce contenu » : exigence du droit
   d'effacement (la personne photographiée ou visée n'a ni compte ni lien de
   suivi). La demande est consignée en événement INTERNE (jamais montré au
   public) et transmise à la mairie, qui doit répondre sous un mois.
   ============================================================================ */

import { getCorsHeaders, preflightResp } from './lib/http.mjs';
import {
  VILLE_RE, EMAIL_RE, UUID_RE, jsonResp, hasServiceKey, hashIp,
  svcSelect, svcCount, insertEvent, loadContext, mailMairie,
} from './lib/participer-common.mjs';

// Borne par signalement et par jour : de quoi exercer un droit, pas de quoi inonder
const MAX_PER_REPORT_PER_DAY = 5;
/* Borne par demandeur : les identifiants des signalements publiés sont
   énumérables via /geojson, donc le plafond par signalement ne suffit pas -
   sans celui-ci, un script transforme la route en relais de courrier vers la
   mairie depuis notre domaine d'expédition. */
const MAX_PER_IP_PER_DAY = 10;

export default async (req, context) => {
  const cors = { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return preflightResp(cors);
  if (req.method !== 'POST') return jsonResp(405, { error: 'Méthode non autorisée' }, cors);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: 'Corps de requête invalide' }, cors);
  }

  // Honeypot : invisible pour un humain, rempli par un robot
  if (String(body?.website || '').trim()) return jsonResp(200, { ok: true }, cors);

  const ville = String(body?.ville || '').trim();
  const id = String(body?.id || '').trim();
  const motif = String(body?.motif || '').trim().slice(0, 500);
  const contact = String(body?.email || '').trim().slice(0, 180);
  if (!VILLE_RE.test(ville) || !UUID_RE.test(id)) return jsonResp(400, { error: 'Paramètres invalides' }, cors);
  if (!motif) return jsonResp(400, { error: 'Précisez le motif de la demande' }, cors);
  if (contact && !EMAIL_RE.test(contact)) return jsonResp(400, { error: 'Adresse e-mail invalide' }, cors);
  if (!hasServiceKey()) return jsonResp(503, { error: 'Service indisponible' }, cors);

  try {
    const [row] = await svcSelect('participer_signalements', {
      select: 'id,ville,reference,published',
      id: `eq.${id}`, ville: `eq.${ville}`, published: 'eq.true', limit: '1',
    });
    if (!row) return jsonResp(404, { error: 'Signalement introuvable' }, cors);

    const today = new Date().toISOString().slice(0, 10);
    const ipHash = await hashIp(context?.ip);
    const [onSameReport, byIp] = await Promise.all([
      svcCount('participer_events', { signalement_id: `eq.${id}`, type: 'eq.retrait_demande', created_at: `gte.${today}` }),
      svcCount('participer_events', { ville: `eq.${ville}`, type: 'eq.retrait_demande', author_ip_hash: `eq.${ipHash}`, created_at: `gte.${today}` }),
    ]);
    if (onSameReport >= MAX_PER_REPORT_PER_DAY || byIp >= MAX_PER_IP_PER_DAY) {
      return jsonResp(429, { error: 'Demande déjà transmise' }, cors);
    }

    /* Le motif reste interne (le type retrait_demande n'est jamais servi au
       public) et le contact du demandeur va dans sa colonne dédiée : c'est une
       donnée personnelle de tiers, soumise à la même rétention. */
    await insertEvent({
      signalementId: id, ville, type: 'retrait_demande',
      messagePublic: motif,
      contactEmail: contact || null,
      authorIpHash: ipHash,
    });

    const ctx = await loadContext(ville);
    if (ctx.settings?.notify_email) {
      await mailMairie({
        to: ctx.settings.notify_email,
        subject: `Demande de retrait - signalement ${row.reference}`,
        lignes: [
          `Une demande de retrait de contenu a été déposée sur le signalement ${row.reference}.`,
          `Motif : ${motif}`,
          contact ? `Contact laissé : ${contact}` : 'Aucun contact laissé.',
          `Le droit d'effacement impose une réponse sous un mois.`,
        ],
      });
    }

    console.log(`[participer-retrait] demande consignée sur ${row.reference} (${ville})`);
    return jsonResp(200, { ok: true }, cors);
  } catch (e) {
    console.error('[participer-retrait] ::', e?.message);
    return jsonResp(500, { error: 'Demande impossible' }, cors);
  }
};

export const config = { path: '/api/participer/retrait' };
