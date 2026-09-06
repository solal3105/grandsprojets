/**
 * netlify/functions/lib/projects-index.mjs
 *
 * Inventaire des fiches et des villes référençables, partagé par le sitemap
 * (/sitemap.xml) et le plan pour les IA (/llms.txt). Les deux doivent lister
 * exactement les mêmes pages : une fiche absente du sitemap mais citée dans
 * llms.txt (ou l'inverse) est une incohérence que les moteurs remarquent.
 *
 * Pourquoi une lecture par pages : PostgREST plafonne chaque réponse à 1 000
 * lignes, silencieusement. Les fiches sont triées de la plus récente à la plus
 * ancienne, et les cartes d'essai générées depuis l'été 2026 occupent à elles
 * seules le premier millier : en production, le sitemap ne contenait plus une
 * seule fiche ni une seule page ville des collectivités réelles.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './http.mjs';

export const BASE_ORIGIN = 'https://openprojets.com';

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

/** Entrées créées par la suite de tests E2E : jamais référencées. */
export function isTestEntry(name, cat) {
  const lower = String(name || '').toLowerCase();
  const c = String(cat || '').toLowerCase();
  return lower.startsWith('e2e-') || lower.startsWith('e2e_') ||
    lower.startsWith('test ') || lower === 'test' ||
    c.startsWith('e2e-') || c.startsWith('e2e_');
}

/**
 * Lit une table PostgREST en entier, page par page (limit/offset).
 * Lève en cas d'erreur HTTP : l'appelant doit répondre 500 plutôt que servir
 * un inventaire tronqué, que Google prendrait pour la vérité.
 */
export async function fetchAllRows(table, params) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(page * PAGE_SIZE));
    const resp = await fetch(url.toString(), { headers: supaHeaders });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Supabase ${table} ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const chunk = await resp.json();
    if (!Array.isArray(chunk)) break;
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

/** URL canonique d'une fiche, la même que celle posée par l'edge fiche-ssr. */
export function ficheUrl(p) {
  return `${BASE_ORIGIN}/fiche/${encodeURIComponent(p.ville)}/${encodeURIComponent(p.category_slug)}/${encodeURIComponent(p.slug)}`;
}

export function villeUrl(ville) {
  return `${BASE_ORIGIN}/ville/${encodeURIComponent(ville)}`;
}

/**
 * Clé de doublon : même ville, même nom (casse et espaces ignorés), même
 * catégorie. Le hub national « france » contient des centaines de projets
 * saisis deux fois avec un suffixe numérique de slug ; une seule des deux pages
 * est référencée, la plus ancienne, et l'edge fiche-ssr pose la même canonical.
 */
export function duplicateKey(p) {
  return [
    String(p.ville || '').toLowerCase(),
    String(p.project_name || '').trim().toLowerCase().replace(/\s+/g, ' '),
    String(p.category_slug || '').toLowerCase(),
  ].join('|');
}

/**
 * Toutes les fiches référençables, de la plus récente à la plus ancienne :
 * approuvées, avec une adresse complète (ville, catégorie, slug), un contenu
 * (article ou description), hors entrées de test, sans doublon.
 *
 * @param {string} [select] colonnes PostgREST (les colonnes de filtrage sont
 *   toujours ajoutées)
 */
export async function fetchIndexableProjects(select = '') {
  const REQUIRED = ['project_name', 'category', 'category_slug', 'slug', 'ville', 'markdown_url', 'description', 'created_at'];
  const cols = [...new Set([...REQUIRED, ...select.split(',').map((c) => c.trim()).filter(Boolean)])];
  const rows = await fetchAllRows('contribution_uploads', {
    select: cols.join(','),
    approved: 'eq.true',
    ville: 'not.is.null',
    slug: 'not.is.null',
    category_slug: 'not.is.null',
    // Tri stable : created_at puis id, sinon deux pages pourraient se chevaucher
    order: 'created_at.desc,id.desc',
  });

  const eligible = rows.filter((p) =>
    p?.project_name && p?.category && p?.ville && p?.category_slug && p?.slug &&
    !isTestEntry(p.project_name, p.category) &&
    (p.markdown_url || String(p.description || '').trim())
  );

  // Le plus ancien de chaque groupe de doublons est la page de référence :
  // on parcourt du plus ancien au plus récent et on ne garde que le premier vu
  const seen = new Set();
  const kept = [];
  for (let i = eligible.length - 1; i >= 0; i--) {
    const key = duplicateKey(eligible[i]);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(eligible[i]);
  }
  kept.reverse();
  return kept;
}

/**
 * Villes ayant au moins une fiche référençable, avec la date de leur fiche la
 * plus récente. Entrée : la liste renvoyée par fetchIndexableProjects (triée
 * de la plus récente à la plus ancienne).
 * @returns {Map<string, {lastmod: string|null, count: number}>}
 */
export function groupByVille(projects) {
  const villes = new Map();
  for (const p of projects) {
    const ville = String(p.ville).toLowerCase();
    if (!villes.has(ville)) villes.set(ville, { lastmod: toDay(p.created_at), count: 0 });
    villes.get(ville).count += 1;
  }
  return villes;
}

/** Noms d'affichage des villes (city_branding.brand_name), clé en minuscules. */
export async function fetchCityNames() {
  try {
    const rows = await fetchAllRows('city_branding', { select: 'ville,brand_name', order: 'ville.asc' });
    const map = new Map();
    for (const r of rows) {
      if (r?.ville && r?.brand_name) map.set(String(r.ville).toLowerCase(), String(r.brand_name).trim());
    }
    return map;
  } catch {
    return new Map(); // le libellé retombe sur le slug humanisé
  }
}

/** « saint-genis-laval » → « Saint Genis Laval » (repli quand la ville n'a pas de marque). */
export function humanizeVille(slug) {
  return String(slug || '').split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Date ISO (AAAA-MM-JJ) ou null si la valeur est illisible. */
export function toDay(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
