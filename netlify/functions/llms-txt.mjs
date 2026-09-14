/**
 * /llms.txt - plan du site pour les assistants IA (standard llmstxt.org).
 *
 * Même inventaire que /sitemap.xml (lib/projects-index.mjs) : les fiches y
 * sont regroupées par ville, chaque ligne porte le nom, l'URL canonique et la
 * description sur une ligne.
 */

import {
  BASE_ORIGIN,
  fetchIndexableProjects,
  fetchCityNames,
  ficheUrl,
  villeUrl,
  humanizeVille,
} from './lib/projects-index.mjs';

// Nettoie une description pour tenir sur une ligne de liste markdown
const oneLine = (s, max = 160) => {
  const flat = String(s || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** Guides de la section Ressources : manifest écrit par le prerender du home. */
async function fetchRessources() {
  try {
    const resp = await fetch(`${BASE_ORIGIN}/ressources/manifest.json`);
    if (!resp.ok) return [];
    const list = await resp.json();
    return Array.isArray(list) ? list.filter((a) => a?.slug) : [];
  } catch {
    return []; // pas de manifest : llms.txt sans les guides
  }
}

export default async (_request, _context) => {
  try {
    const [projects, cityNames, guides] = await Promise.all([
      fetchIndexableProjects(),
      fetchCityNames(),
      fetchRessources(),
    ]);

    // Regrouper les fiches par ville
    const byVille = new Map();
    for (const p of projects) {
      const ville = String(p.ville).toLowerCase();
      if (!byVille.has(ville)) byVille.set(ville, []);
      byVille.get(ville).push({
        name: p.project_name,
        url: ficheUrl(p),
        description: oneLine(p.description),
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
      `- [Présentation](${BASE_ORIGIN}/) : Open Projets pour les collectivités - publier ses projets urbains sur une carte interactive`,
      `- [Carte des projets urbains](${BASE_ORIGIN}/carte) : le module qui publie les projets d'aménagement d'une collectivité`,
      `- [Travaux du quotidien](${BASE_ORIGIN}/travaux) : le module qui affiche les chantiers en cours, leurs dates et leur emprise`,
      `- [Signalement](${BASE_ORIGIN}/participer) : le module par lequel les habitants signalent un problème sur l'espace public`,
      `- [Chantiers et arrêtés](${BASE_ORIGIN}/chantiers) : le module qui instruit les demandes de chantier et les arrêtés de voirie`,
      `- [Diagnostic terrain](${BASE_ORIGIN}/diagnostic) : le module d'analyse d'une zone par l'IA, pour les services`,
      `- [Tarification](${BASE_ORIGIN}/tarification) : estimer le prix pour une collectivité`,
      `- [À propos](${BASE_ORIGIN}/a-propos) : qui est derrière Open Projets`,
      `- [Aide](${BASE_ORIGIN}/aide) : centre d'aide et guides d'utilisation`,
      `- [Carte de la Métropole de Lyon](${BASE_ORIGIN}/ville/metropole-lyon/carte) : l'application, sur l'espace de démonstration`,
      `- [Projets urbains par ville](${BASE_ORIGIN}/ville/) : toutes les villes qui ont une page de projets`,
      `- [Les cartes des communes](${BASE_ORIGIN}/cartes/) : cartes construites depuis le web public pour des dizaines de communes`,
    ];

    if (guides.length) {
      lines.push('', '## Guides pour les collectivités', '');
      lines.push(`- [Toutes les ressources](${BASE_ORIGIN}/ressources) : guides pratiques pour communiquer sur les projets et travaux de sa commune`);
      for (const g of guides) {
        lines.push(`- [${g.title}](${BASE_ORIGIN}/ressources/${encodeURIComponent(g.slug)}) : ${g.description || ''}`.trimEnd());
      }
    }

    // Une section par ville, fiches en ordre alphabétique
    const villes = [...byVille.keys()].sort();
    for (const ville of villes) {
      const label = cityNames.get(ville) || humanizeVille(ville);
      lines.push('', `## Projets - ${label}`, '');
      lines.push(`- [Tous les projets - ${label}](${villeUrl(ville)}) : hub de la ville (liste, catégories et carte)`);
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
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (e) {
    return new Response(`llms.txt generation failed: ${e?.message || e}`, { status: 500 });
  }
};

export const config = {
  path: '/llms.txt',
};
