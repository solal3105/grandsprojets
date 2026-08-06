/**
 * netlify/functions/lib/http.mjs
 *
 * Aides HTTP communes aux fonctions Netlify : CORS restreint aux origines du
 * site, réponses JSON d'erreur, préflight, et vérification du JWT Supabase.
 * Extraites de ai-common.mjs quand le module Participer en a eu besoin à son
 * tour - ai-common les ré-exporte pour ses propres consommateurs.
 */

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqqsuybmyqemhojsamgq.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

const ALLOWED_ORIGINS = [
  'https://openprojets.com',
  'http://localhost:3001',
  'http://localhost:8888',
];

/**
 * En-têtes CORS restreints aux origines du site.
 * @param {Request} req
 * @param {string} [methods] - méthodes annoncées au préflight
 */
export function getCorsHeaders(req, methods = 'POST, OPTIONS') {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
  };
}

export function errResp(status, error, corsHeaders) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Reponse au preflight CORS.
 * Le corps DOIT etre null : un statut 204 avec un corps, meme vide, fait lever
 * un TypeError au constructeur Response, et le preflight repond alors 500.
 */
export function preflightResp(corsHeaders) {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Vérifie le JWT Supabase de la requête.
 * @param {Request} req
 * @returns {Promise<{id: string, token: string}|null>} l'utilisateur, ou null
 */
export async function getAuthedUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id, token } : null;
  } catch { return null; }
}

/**
 * Charge le profil applicatif (table profiles) de l'utilisateur, sous RLS.
 * @returns {Promise<{role: string, villes: string[]}|null>}
 */
export async function getProfile(user) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,ville`,
      { headers: { 'Authorization': `Bearer ${user.token}`, 'apikey': SUPABASE_ANON_KEY } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile) return null;
    return { role: profile.role, villes: Array.isArray(profile.ville) ? profile.ville : [] };
  } catch { return null; }
}

/**
 * L'utilisateur est-il admin de cette ville (ou admin global) ?
 * Lecture de son propre profil sous RLS.
 */
export async function isAdminForVille(user, ville) {
  const profile = await getProfile(user);
  if (!profile || profile.role !== 'admin') return false;
  return profile.villes.includes('global') || profile.villes.includes(ville);
}
