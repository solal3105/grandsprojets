/* ============================================================================
   EDGE FUNCTION - Les cartes des communes : /cartes/

   Pré-rend la page qui montre toutes les cartes construites par la démo (et
   l'espace de démonstration de la Métropole de Lyon) : titre et description
   avec les vrais comptes, la liste des communes avec un lien vers chaque page
   ville, les points sur le contour de la France, la commune vedette, le
   JSON-LD, et le catalogue complet embarqué en JSON pour la mise en scène
   côté client (stand). Le rendu vient de cartes/catalogue.js : le navigateur
   et cette fonction produisent exactement le même HTML.

   Sans catalogue (base injoignable), la coquille est servie telle quelle et
   sans cache : la page se remplit alors elle-même côté client.

   ⚠️  Toujours passer une FONCTION à html.replace() quand le remplacement
   contient du contenu venant de la base : une chaîne y ferait interpréter
   les séquences $ ($&, $`, $') comme motifs de remplacement JavaScript.
   ============================================================================ */

import {
  chargerCatalogue, villeVedette, renderCommune, renderPoint, renderVille, renderCompte, renderJsonLd,
  escHtml, escAttr, nombre, urlFrance,
} from '../../cartes/catalogue.js';

const CANONICAL = 'https://openprojets.com/cartes/';

function truncate(text, maxLen = 160) {
  const t = String(text || '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).replace(/\s+\S*$/, '')}…`;
}

/** Headers de la coquille privés de leurs validateurs : on sert un corps
    réécrit, son ETag ne doit pas fuiter (sinon un 304 rendrait une page vide) */
function safeShellHeaders(response) {
  const h = Object.fromEntries(response.headers.entries());
  delete h.etag;
  delete h['last-modified'];
  delete h.age;
  delete h['cache-control'];
  delete h['content-type'];
  return h;
}

function injecter(html, catalogue) {
  const { villes, lyon, totaux } = catalogue;
  const n = totaux.communes;
  const exemples = [...villes]
    .filter((v) => v.vitrine)
    .sort((a, b) => b.illustrees - a.illustrees)
    .slice(0, 4)
    .map((v) => v.nom)
    .join(', ');
  const title = `Les cartes des projets de ${nombre(n)} communes, construites depuis le web public | Open Projets`;
  const description = truncate(
    `${exemples} : ${nombre(n)} communes ont déjà leur carte des projets, construite en trois minutes depuis leur site, la presse locale et les marchés publics. Tapez le nom de la vôtre.`,
    160,
  );
  const vedette = villeVedette(catalogue);
  const image = vedette?.fiches.find((f) => f.image)?.image || '';

  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escHtml(title)}</title>`);
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(description)}"`);
  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(title.replace(/ \| Open Projets$/, ''))}"`);
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(description)}"`);
  if (image) html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*"/, (_, p1) => `${p1}${escAttr(image)}"`);

  const liste = [lyon, ...villes].filter(Boolean);
  // La France vue du ciel arrive avec la page, sans attendre le script
  html = html.replace(/(<img class="ciel__image" id="ciel-france-image" src=")[^"]*"/, (_, p1) => `${p1}${escAttr(urlFrance('paysage'))}"`);
  html = html.replace('<!-- cartes:points -->', () => liste.map(renderPoint).join(''));
  html = html.replace('<!-- cartes:communes -->', () => liste.map(renderCommune).join('\n'));
  html = html.replace('<!-- cartes:vedette -->', () => (vedette ? renderVille(vedette) : ''));
  html = html.replace('<!-- cartes:lyon -->', () => (lyon ? renderVille(lyon, { lyon: true }) : ''));
  const compte = renderCompte(totaux);
  if (compte) {
    html = html.replace(
      /<p id="compte" class="scene__compte" hidden><!-- cartes:compte --><\/p>/,
      () => `<p id="compte" class="scene__compte">${compte}</p>`,
    );
  }
  html = html.replace('<!-- cartes:catalogue -->', () => JSON.stringify(catalogue).replace(/</g, '\\u003c'));
  html = html.replace('<!-- cartes:jsonld -->', () => renderJsonLd(catalogue, CANONICAL, description));
  return html;
}

export default async (_request, context) => {
  // La coquille part tout de suite : elle ne dépend d'aucune donnée
  const responsePromise = context.next();

  let catalogue = null;
  try {
    catalogue = await chargerCatalogue();
  } catch (e) {
    console.error('[cartes] catalogue indisponible :', e?.message || e);
  }

  const response = await responsePromise;
  let html = '';
  try {
    html = await response.text();
  } catch {
    html = '';
  }

  // Origin sans corps (304, vide) : servir tel quel plutôt qu'une page blanche
  if (!html) {
    return new Response(response.body, {
      status: response.status === 304 ? 200 : response.status,
      headers: safeShellHeaders(response),
    });
  }

  if (!catalogue || !catalogue.villes.length) {
    return new Response(html, {
      status: 200,
      headers: {
        ...safeShellHeaders(response),
        'Content-Type': 'text/html; charset=utf-8',
        // Jamais de cache sur une page vide : le prochain passage retentera
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(injecter(html, catalogue), {
    status: 200,
    headers: {
      ...safeShellHeaders(response),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, max-age=60, stale-while-revalidate=600',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1',
    },
  });
};

export const config = {
  path: '/cartes/',
  // Honore le Cache-Control retourné : sans cela, chaque visite relirait
  // toute la base et referait le rendu
  cache: 'manual',
};
