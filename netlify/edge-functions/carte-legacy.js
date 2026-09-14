/* ============================================================================
   EDGE FUNCTION - Les anciennes adresses de la carte portées par la racine

   La carte d'une collectivité vivait sur `/?city={ville}`, avec ses
   paramètres de projet (?cat=&project=) et de module (?module=). Depuis la
   mise en ligne du site vitrine à la racine, elle vit sur
   /ville/{ville}/{module}. Ces adresses ont été partagées (Phaos, courriels,
   cartes d'essai) : on répond par une redirection permanente qui conserve les
   autres paramètres.

   Sans ?city= mais avec ?cat=&project= : c'était la carte de la Métropole de
   Lyon, l'espace servi par la racine à l'époque. Sans aucun de ces
   paramètres, la requête est l'accueil du site : on passe la main.
   ============================================================================ */

const PUBLIC_MODULES = new Set(['carte', 'travaux', 'participer']);
const SLUG = /^[a-z0-9-]{1,60}$/;

export default async (request) => {
  const url = new URL(request.url);
  const sp = url.searchParams;

  const rawCity = String(sp.get('city') || '').toLowerCase().trim();
  const legacyProject = sp.has('cat') || sp.has('project') || sp.has('participer_suivi');
  if (!rawCity && !legacyProject) return; // l'accueil du site

  // `default` était l'alias de l'espace de démonstration
  const city = rawCity && rawCity !== 'default' ? rawCity : 'metropole-lyon';
  if (!SLUG.test(city)) return; // adresse forgée : l'accueil, jamais une 500

  const askedModule = String(sp.get('module') || '').toLowerCase().trim();
  const module = PUBLIC_MODULES.has(askedModule) ? askedModule : 'carte';

  sp.delete('city');
  sp.delete('module');
  const rest = sp.toString();
  const destination = `${url.origin}/ville/${city}/${module}${rest ? `?${rest}` : ''}${url.hash}`;
  return Response.redirect(destination, 301);
};

export const config = { path: '/' };
