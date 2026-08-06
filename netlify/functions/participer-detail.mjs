/* ============================================================================
   FONCTION PARTICIPER-DETAIL - route /api/participer/detail (GET, public)

   Détail d'un signalement + historique de ses événements, en deux modes :
     - ?token=<suivi_token>   : vue du signaleur (son propre dépôt, même non
                                publié ; photo privée servie en URL signée)
     - ?ville=&id=            : vue publique, uniquement si publié

   Dans les deux cas : whitelist stricte (publicProps), événements limités aux
   types publics, jamais d'email ni de jeton dans la réponse.
   ============================================================================ */

import {
  VILLE_RE, PUBLIC_GET_CORS, PUBLIC_EVENT_TYPES, BUCKET_PHOTOS,
  jsonResp, hasServiceKey,
  svcSelect, loadContext, loadCategories, loadStatuts, publicProps, storageSignedUrl,
} from './lib/participer-common.mjs';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = 'id,ville,reference,category_key,statut_key,description,photo_path,photo_url,lat,lng,adresse,published,email_confirmed,created_at,updated_at';

async function loadEvents(row, statuts) {
  const events = await svcSelect('participer_events', {
    select: 'type,new_statut,message_public,created_at',
    signalement_id: `eq.${row.id}`,
    order: 'created_at.asc',
  });
  return events
    .filter((ev) => PUBLIC_EVENT_TYPES.has(ev.type))
    .map((ev) => ({
      type: ev.type,
      new_statut: ev.new_statut,
      statut_label: statuts.find((s) => s.statut_key === ev.new_statut)?.label || null,
      message_public: ev.message_public,
      created_at: ev.created_at,
    }));
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: PUBLIC_GET_CORS });
  if (req.method !== 'GET') return jsonResp(405, { error: 'Méthode non autorisée' });
  if (!hasServiceKey()) return jsonResp(503, { error: 'Service indisponible' });

  const params = new URL(req.url).searchParams;
  const token = params.get('token') || '';

  try {
    let row;
    let own = false;
    if (token) {
      if (!TOKEN_RE.test(token)) return jsonResp(400, { error: 'Lien de suivi invalide' });
      [row] = await svcSelect('participer_signalements', { select: SELECT, suivi_token: `eq.${token}`, limit: '1' });
      own = true;
    } else {
      const ville = params.get('ville') || '';
      const id = params.get('id') || '';
      if (!VILLE_RE.test(ville) || !TOKEN_RE.test(id)) return jsonResp(400, { error: 'Paramètres invalides' });
      [row] = await svcSelect('participer_signalements', {
        select: SELECT, ville: `eq.${ville}`, id: `eq.${id}`, published: 'eq.true', limit: '1',
      });
    }
    if (!row) return jsonResp(404, { error: 'Signalement introuvable' });

    // Module désactivé : plus aucun contenu servi, y compris par lien de suivi
    const ctx = await loadContext(row.ville);
    if (!ctx.enabled) return jsonResp(404, { error: 'Signalement introuvable' });

    const [categories, statuts] = await Promise.all([loadCategories(row.ville), loadStatuts(row.ville)]);
    const signalement = {
      ...publicProps(row, categories, statuts),
      lat: row.lat,
      lng: row.lng,
      published: row.published,
    };
    // Vue du signaleur : sa propre photo, même avant publication (URL signée
    // courte sur le bucket privé)
    if (own && !row.photo_url && row.photo_path) {
      signalement.photo_url = await storageSignedUrl(BUCKET_PHOTOS, row.photo_path, 600);
    }
    if (own) signalement.email_confirmed = row.email_confirmed;

    return jsonResp(200, { own, signalement, events: await loadEvents(row, statuts) });
  } catch (e) {
    console.error('[participer-detail] ::', e?.message);
    return jsonResp(500, { error: 'Erreur interne' });
  }
};

export const config = { path: '/api/participer/detail' };
