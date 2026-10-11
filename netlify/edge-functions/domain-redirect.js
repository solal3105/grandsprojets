/**
 * Edge function - redirection 301 des domaines alternatifs vers openprojets.com
 * Doit être listé AVANT fiche-ssr dans netlify.toml pour `/fiche/`
 *
 * Les appels d'API (/api/*) sont exclus. Nos pages les appellent toujours sur
 * openprojets.com, une redirection n'y a rien à faire (un 301 sur un POST
 * perdrait d'ailleurs le corps), et rien ne doit s'intercaler entre le
 * navigateur et une fonction qui lit `context.ip`. Tant que cette edge function
 * couvrait /api/*, /api/demo-lead (POST) recevait l'adresse d'un intermédiaire,
 * la même pour des visiteurs sans rapport pendant des heures ou des jours
 * (`demo_leads` du 29/07 au 11/10/2026), alors que /api/demo-generate (GET),
 * derrière la même edge function, voyait celle du visiteur. Les plafonds par
 * adresse de /api/demo-lead et de /api/participer/* reposent sur `context.ip`.
 */

const REDIRECT_HOSTS = new Set([
  'grandsprojets.com',
  'www.grandsprojets.com',
  'www.openprojets.com',
  'openprojet.com',
  'www.openprojet.com',
  'openprojet.fr',
  'www.openprojet.fr',
  'openprojets.fr',
  'www.openprojets.fr',
]);

export default async (request) => {
  const url = new URL(request.url);
  if (!REDIRECT_HOSTS.has(url.hostname)) return; // openprojets.com → pas de redirection

  const destination = `https://openprojets.com${url.pathname}${url.search}${url.hash}`;
  return Response.redirect(destination, 301);
};

export const config = { path: '/*', excludedPath: ['/api/*'] };
