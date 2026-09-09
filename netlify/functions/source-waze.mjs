/**
 * Netlify Function: source-waze
 * Relais du flux Waze for Cities d'une collectivité pour le Diagnostic
 * terrain. Le flux partenaire n'autorise pas les appels depuis un navigateur ;
 * ce relais le lit et le rend en GeoJSON.
 *   ?ville=&feed=<url>&part=alerts|jams   → FeatureCollection (couche « url », rechargée à chaque ouverture)
 *   ?ville=&feed=<url>&mode=check         → { alerts, jams } : validation du lien
 * Réservé aux administrateurs de l'espace (JWT Supabase) ; seuls les hôtes
 * Waze sont acceptés, le lien (qui porte le jeton partenaire) n'est jamais
 * journalisé.
 */

import { getCorsHeaders, errResp, preflightResp, getAuthedUser, isAdminForVille } from './lib/http.mjs';
import { isAllowedFeedUrl, alertsToGeoJSON, jamsToGeoJSON } from './lib/waze-feed.mjs';

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return preflightResp(corsHeaders);
  if (req.method !== 'GET') return errResp(405, 'Method not allowed', corsHeaders);

  const url = new URL(req.url);
  const ville = String(url.searchParams.get('ville') || '');
  if (!/^[a-z0-9-]+$/i.test(ville)) return errResp(400, 'Paramètre ville invalide', corsHeaders);
  const user = await getAuthedUser(req);
  if (!user) return errResp(401, 'Unauthorized', corsHeaders);
  if (!(await isAdminForVille(user, ville))) return errResp(403, 'Réservé aux administrateurs de cette structure', corsHeaders);

  const feed = String(url.searchParams.get('feed') || '');
  if (!isAllowedFeedUrl(feed)) return errResp(400, 'Ce lien n\'est pas un flux Waze for Cities (adresse attendue sur waze.com, section PartnerHub).', corsHeaders);

  let data;
  try {
    const res = await fetch(feed, { headers: { 'User-Agent': 'OpenProjets/1.0 (+https://openprojets.com)' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return errResp(502, `Waze a répondu ${res.status} : vérifiez que le lien est complet et toujours actif.`, corsHeaders);
    data = await res.json();
  } catch (err) {
    console.error('[source-waze]', err?.name || err);
    return errResp(502, 'Le flux Waze ne répond pas. Réessayez dans quelques instants.', corsHeaders);
  }

  const mode = url.searchParams.get('mode');
  const headers = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=120' };
  if (mode === 'check') {
    return new Response(JSON.stringify({
      alerts: alertsToGeoJSON(data).features.length,
      jams: jamsToGeoJSON(data).features.length,
    }), { status: 200, headers });
  }
  const part = url.searchParams.get('part') === 'jams' ? 'jams' : 'alerts';
  const fc = part === 'jams' ? jamsToGeoJSON(data) : alertsToGeoJSON(data);
  return new Response(JSON.stringify(fc), { status: 200, headers });
}

export const config = { path: '/api/sources/waze' };
