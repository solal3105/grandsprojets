/* ============================================================================
   Helpers partagés des edge functions de pré-rendu SEO (fiche-ssr, ville-hub).

   Ces deux fonctions partageaient 46 lignes significatives strictement
   identiques : échappement, troncature, humanisation d'un slug, nettoyage
   markdown, validation d'URL et de couleur, constantes Supabase, et l'accès
   PostgREST. ville-hub avait introduit un `fetchRows` générique que fiche-ssr
   n'avait jamais repris - il est ici pour les deux.

   Ce fichier est dans un sous-dossier : Netlify n'enregistre comme edge function
   que les fichiers à la racine de netlify/edge-functions/, et les routes de ce
   projet sont de toute façon déclarées explicitement dans netlify.toml.
   ============================================================================ */

export const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
export const BASE_ORIGIN = 'https://openprojets.com';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };

/** Échappement pour contenu HTML. */
export function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ESC_MAP[c]);
}

/**
 * Échappement pour valeur d'attribut. Identique à escHtml (l'apostrophe comprise :
 * sans elle, un attribut en guillemets simples serait vulnérable au breakout).
 * Conservé séparé comme marqueur d'intention sur les sinks d'attribut.
 */
export function escAttr(str) {
  return escHtml(str);
}

/** Tronque un texte à ~maxLen caractères sur une coupure de mot. */
export function truncate(text, maxLen = 160) {
  if (!text || text.length <= maxLen) return text || '';
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '…';
}

/** Transforme un slug en label lisible : "sport-culture" → "Sport Culture". */
export function humanize(slug) {
  if (!slug) return '';
  return String(slug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Supprime les marqueurs markdown pour obtenir du texte brut. */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')         // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // liens → texte seul
    .replace(/#{1,6}\s*/g, '')                // titres
    .replace(/(\*\*|__)(.*?)\1/g, '$2')       // gras
    .replace(/(\*|_)(.*?)\1/g, '$2')          // italique
    .replace(/`{1,3}[^`]*`{1,3}/g, '')        // code inline/bloc
    .replace(/>\s*/g, '')                     // blockquotes
    .replace(/[-*+]\s+/g, '')                 // listes
    .replace(/\n{2,}/g, ' ')                  // sauts de ligne multiples
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valide une URL avant injection en href/src. Bloque javascript:, data:, //host. */
export function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:|mailto:|#)/i.test(u)) return u;
  // Chemins relatifs au site - mais pas les URLs protocol-relative (//host)
  if (u.startsWith('/') && !/^\/[/\\]/.test(u)) return u;
  return '';
}

/** URL absolue http(s) - pour og:image (les scrapers ignorent le relatif). */
export function absUrl(url) {
  const u = safeUrl(url);
  if (!u) return '';
  if (/^https?:/i.test(u)) return u;
  return u.startsWith('/') ? `${BASE_ORIGIN}${u}` : '';
}

/** Valide une couleur hex venant de la base. */
export function safeHexColor(color) {
  const c = String(color || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(c) ? c : '';
}

/** Même règle que SecurityUtils.isValidCityCode côté navigateur. */
export function isValidCityCode(code) {
  return /^[a-z0-9-]+$/i.test(String(code ?? '').trim());
}

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

/**
 * Lecture PostgREST. Retourne toujours un tableau : une erreur réseau ou RLS
 * doit dégrader le rendu SEO, jamais le faire échouer.
 * @param {string} path - nom de la table
 * @param {Object} params - paramètres PostgREST (select, eq, order, limit…)
 * @returns {Promise<Array>}
 */
export async function fetchRows(path, params) {
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}
