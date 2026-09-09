/**
 * Netlify Function: source-fub
 * Relais vers la plateforme open data de la FUB (Baromètre vélo) pour le
 * module Diagnostic terrain. Deux modes :
 *   ?mode=list&commune=38185&epci=200040715  → jeux du Baromètre disponibles (JSON)
 *   ?mode=download&uid=…                     → l'archive zip du jeu, relayée en flux
 * L'archive n'est pas lisible depuis le navigateur (pas de CORS chez la FUB) :
 * le relais est indispensable, et il ne fait rien d'autre. Réservé aux
 * administrateurs de l'espace (JWT Supabase), comme les autres sources.
 * Licence des données : ODbL (FUB), à citer sur les couches produites.
 */

import { getCorsHeaders, errResp, preflightResp, getAuthedUser, isAdminForVille } from './lib/http.mjs';

const FUB_API = 'https://opendata.parlons-velo.fr/api';
// Jeton public de la plateforme (celui de sa page d'accueil, sans compte).
const FUB_PUBLIC_TOKEN = '4cds56c4sdc4c56ds4cre84c13ez8c4ezc6eza9c84ze16464cdsc1591cdzf8ez';
const UA = 'OpenProjets/1.0 (+https://openprojets.com)';

async function fubFind(search) {
  const form = new FormData();
  form.set('search', search);
  const res = await fetch(`${FUB_API}/${FUB_PUBLIC_TOKEN}/datasets/find`, {
    method: 'POST', body: form, headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`FUB ${res.status}`);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(data.message || 'recherche FUB refusée');
  return Array.isArray(data.result) ? data.result : [];
}

/** Ne garde que les jeux cartographiques publics du Baromètre, décrits simplement. */
function describe(results, scope) {
  const out = [];
  for (const e of results) {
    const j = e?.jdata || {};
    const id = String(j.id || '');
    const m = id.match(/^barometre-(\d{4})-(commune|epci)?-?(\w+)$/);
    if (!m || /sociologie/.test(id) || j['Accès'] !== 'public') continue;
    const hasMap = (Array.isArray(j.Contenu) ? j.Contenu : []).some((c) =>
      (c.Formats || []).some((f) => String(f.Extension).toLowerCase() === 'geojson'));
    if (!hasMap) continue;
    out.push({ uid: e.uid, id, year: Number(m[1]), scope, title: String(j.Titre || ''), licence: String(j.Licence || '') });
  }
  return out;
}

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

  const mode = url.searchParams.get('mode') || 'list';
  try {
    if (mode === 'list') {
      const commune = String(url.searchParams.get('commune') || '').replace(/[^0-9A-Z]/gi, '');
      const epci = String(url.searchParams.get('epci') || '').replace(/[^0-9]/g, '');
      const datasets = [];
      if (commune) datasets.push(...describe(await fubFind(commune), 'commune').filter((d) => d.id.endsWith(`-${commune}`)));
      if (epci) datasets.push(...describe(await fubFind(epci), 'epci').filter((d) => d.id.endsWith(`-${epci}`)));
      datasets.sort((a, b) => b.year - a.year);
      return new Response(JSON.stringify({ datasets }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=600' },
      });
    }
    if (mode === 'download') {
      const uid = String(url.searchParams.get('uid') || '');
      if (!/^[0-9a-f-]{36}$/i.test(uid)) return errResp(400, 'Identifiant de jeu invalide', corsHeaders);
      const prep = await fetch(`${FUB_API}/${FUB_PUBLIC_TOKEN}/datasets/prepare/${uid}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000),
      });
      const info = await prep.json().catch(() => ({}));
      const link = info?.result?.link;
      if (!prep.ok || info.status !== 'OK' || !String(link).startsWith('https://opendata.parlons-velo.fr/download/')) {
        return errResp(502, 'La plateforme FUB n\'a pas pu préparer ce jeu de données', corsHeaders);
      }
      const zip = await fetch(link, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (!zip.ok || !zip.body) return errResp(502, 'Téléchargement impossible depuis la plateforme FUB', corsHeaders);
      // Relais en flux : aucune limite de taille côté fonction.
      return new Response(zip.body, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/zip', 'Cache-Control': 'private, max-age=3600' },
      });
    }
    return errResp(400, 'Mode inconnu', corsHeaders);
  } catch (err) {
    console.error('[source-fub]', err?.message || err);
    return errResp(502, 'La plateforme open data de la FUB ne répond pas. Réessayez dans quelques minutes.', corsHeaders);
  }
}

export const config = { path: '/api/sources/fub' };
