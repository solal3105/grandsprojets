/* ============================================================================
   EDGE FUNCTION - Les adresses courtes : /l/{code}

   Renvoie le visiteur vers l'adresse marquée enregistrée par la page /lien
   (table share_links). Les marqueurs utm_* voyagent dans la redirection, donc
   PostHog voit arriver la visite avec sa campagne, comme si le lien long avait
   été cliqué directement.

   Redirection temporaire, jamais permanente : un 301 se grave dans le cache
   des navigateurs et interdirait de corriger une cible mal saisie.

   Adresse inconnue : une page brève qui dit quoi faire, hors des moteurs.
   ============================================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../cartes/catalogue.js';

const CODE_VALIDE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function pageInconnue(code) {
  const propre = String(code || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Ce lien n'existe pas | Open Projets</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
         font-family: Inter, system-ui, sans-serif; color: #111; background: #FAFAFA; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 12px; }
  p { color: #555; line-height: 1.6; margin: 0 0 24px; }
  a { display: inline-block; background: #C4002A; color: #fff; text-decoration: none;
      padding: 12px 24px; border-radius: 999px; font-weight: 500; }
</style>
</head>
<body>
<main>
  <h1>Ce lien n'existe pas</h1>
  <p>L'adresse openprojets.com/l/${propre} ne mène nulle part. Elle a peut-être été recopiée avec une lettre en moins, ou n'a jamais été créée.</p>
  <a href="https://openprojets.com/">Voir la page d'accueil</a>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
}

export default async (request) => {
  const url = new URL(request.url);
  const code = decodeURIComponent(url.pathname.replace(/^\/l\//, '').replace(/\/$/, '')).toLowerCase();
  if (!CODE_VALIDE.test(code)) return pageInconnue(code);

  let cible = '';
  try {
    const api = new URL(`${SUPABASE_URL}/rest/v1/share_links`);
    api.searchParams.set('select', 'target_url');
    api.searchParams.set('code', `eq.${code}`);
    api.searchParams.set('limit', '1');
    const r = await fetch(api.toString(), {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) {
      const rows = await r.json();
      cible = Array.isArray(rows) && rows.length ? String(rows[0].target_url || '') : '';
    }
  } catch {
    cible = '';
  }

  if (!cible.startsWith('https://')) return pageInconnue(code);

  return new Response(null, {
    status: 302,
    headers: {
      location: cible,
      // Assez court pour qu'une correction se propage dans la journée.
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};

export const config = { path: '/l/*' };
