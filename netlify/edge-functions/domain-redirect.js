/**
 * Edge function — redirection 301 des domaines alternatifs vers openprojets.com
 * Doit être listé AVANT fiche-ssr dans netlify.toml pour `/fiche/`
 */

const REDIRECT_HOSTS = new Set([
  'grandsprojets.com',
  'www.grandsprojets.com',
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

export const config = { path: '/*' };
