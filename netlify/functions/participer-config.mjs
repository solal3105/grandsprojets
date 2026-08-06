/* ============================================================================
   FONCTION PARTICIPER-CONFIG - route /api/participer/config (GET, public)

   Configuration publique du module pour une ville : activation, catégories
   actives, affichage des statuts, textes du formulaire. C'est la seule source
   du formulaire côté carte : les tables participer_* n'ont aucune policy anon,
   la whitelist de champs est donc appliquée ici.
   ============================================================================ */

import {
  VILLE_RE, PUBLIC_GET_CORS, jsonResp, hasServiceKey,
  loadContext, loadCategories, loadStatuts, publicSettings,
} from './lib/participer-common.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: PUBLIC_GET_CORS });
  if (req.method !== 'GET') return jsonResp(405, { error: 'Méthode non autorisée' });

  const ville = new URL(req.url).searchParams.get('ville') || '';
  if (!VILLE_RE.test(ville)) return jsonResp(400, { error: 'Paramètre ville invalide' });
  if (!hasServiceKey()) return jsonResp(503, { error: 'Service indisponible' });

  try {
    const ctx = await loadContext(ville);
    if (!ctx.enabled) return jsonResp(200, { enabled: false });

    const [categories, statuts] = await Promise.all([
      loadCategories(ville, { enabledOnly: true }),
      loadStatuts(ville),
    ]);
    return jsonResp(200, {
      enabled: true,
      categories,
      statuts: statuts.map(({ statut_key, label, color, sort_order }) => ({ statut_key, label, color, sort_order })),
      settings: publicSettings(ctx.settings),
    });
  } catch (e) {
    console.error('[participer-config] ::', e?.message);
    return jsonResp(500, { error: 'Erreur interne' });
  }
};

export const config = { path: '/api/participer/config' };
