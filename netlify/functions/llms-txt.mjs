const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
const BASE_ORIGIN = 'https://openprojets.com';

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json'
};

// Mêmes exclusions que sitemap.mjs
const isTestEntry = (name, cat) => {
  const lower = name.toLowerCase();
  return lower.startsWith('e2e-') || lower.startsWith('e2e_') ||
    lower.startsWith('test ') || lower === 'test' ||
    cat.startsWith('e2e-') || cat.startsWith('e2e_');
};

async function fetchProjects() {
  const url = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
  url.searchParams.set('select', 'project_name,category,category_slug,slug,description,ville,created_at');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('approved', 'eq.true');
  url.searchParams.set('markdown_url', 'not.is.null');
  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) throw new Error(`Supabase contribution_uploads ${resp.status}`);
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchCityNames() {
  const url = new URL('/rest/v1/city_branding', SUPABASE_URL);
  url.searchParams.set('select', 'ville,brand_name');
  const resp = await fetch(url.toString(), { headers: supaHeaders });
  if (!resp.ok) return new Map();
  const rows = await resp.json();
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.ville && r?.brand_name) map.set(String(r.ville).toLowerCase(), r.brand_name);
  }
  return map;
}

// Nettoie une description pour tenir sur une ligne de liste markdown
const oneLine = (s, max = 160) => {
  const flat = String(s || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export default async (_request, _context) => {
  try {
    const [items, cityNames] = await Promise.all([fetchProjects(), fetchCityNames()]);

    // Regrouper les fiches par ville
    const byVille = new Map();
    for (const it of items) {
      const name = it?.project_name || '';
      const cat = String(it?.category || '').toLowerCase();
      const ville = String(it?.ville || '').toLowerCase();
      const catSlug = it?.category_slug || '';
      const projSlug = it?.slug || '';
      if (!name || !cat || !ville || !catSlug || !projSlug) continue;
      if (isTestEntry(name, cat)) continue;
      if (!byVille.has(ville)) byVille.set(ville, []);
      byVille.get(ville).push({
        name,
        url: `${BASE_ORIGIN}/fiche/${encodeURIComponent(ville)}/${encodeURIComponent(catSlug)}/${encodeURIComponent(projSlug)}`,
        description: oneLine(it?.description)
      });
    }

    const lines = [
      '# Open Projets',
      '',
      '> Open Projets (openprojets.com) est une plateforme de cartographie interactive des grands projets urbains et de mobilité des collectivités françaises : tramways, aménagements cyclables, espaces publics, travaux en cours. Chaque projet dispose d\'une fiche détaillée (description, calendrier, budget, liens officiels, concertations) rendue côté serveur et librement accessible.',
      '',
      'Le site s\'adresse aux habitants qui veulent suivre les projets de leur territoire et aux collectivités qui souhaitent publier leurs projets sur une carte sans développement.',
      '',
      '## Pages principales',
      '',
      `- [Carte interactive](${BASE_ORIGIN}/) : carte des grands projets urbains (application, contenu par ville)`,
      `- [Présentation](${BASE_ORIGIN}/home/) : Open Projets pour les collectivités - publier ses projets urbains sur une carte interactive`,
      `- [Fonctionnalités](${BASE_ORIGIN}/home/fonctionnalites) : détail des fonctionnalités de la plateforme`,
      `- [À propos](${BASE_ORIGIN}/home/a-propos) : qui est derrière Open Projets`,
      `- [Aide](${BASE_ORIGIN}/home/aide) : centre d'aide et questions fréquentes`,
      `- [Contact](${BASE_ORIGIN}/home/contact) : contacter l'équipe`,
    ];

    // Une section par ville, fiches en ordre alphabétique
    const villes = [...byVille.keys()].sort();
    for (const ville of villes) {
      const label = cityNames.get(ville) || ville.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      lines.push('', `## Projets - ${label}`, '');
      lines.push(`- [Tous les projets - ${label}](${BASE_ORIGIN}/ville/${encodeURIComponent(ville)}) : hub de la ville (liste, catégories et carte)`);
      const fiches = byVille.get(ville).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      for (const f of fiches) {
        lines.push(f.description ? `- [${f.name}](${f.url}) : ${f.description}` : `- [${f.name}](${f.url})`);
      }
    }

    lines.push('', '## Ressources', '', `- [Plan du site](${BASE_ORIGIN}/sitemap.xml) : liste complète des URLs indexables`);

    return new Response(lines.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch (e) {
    return new Response(`llms.txt generation failed: ${e?.message || e}`, { status: 500 });
  }
};

export const config = {
  path: '/llms.txt',
};
