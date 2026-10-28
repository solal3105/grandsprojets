/* ============================================================================
   SITES DES COLLECTIVITÉS AUTORISÉS À DÉPOSER UN SIGNALEMENT

   Pas de route : importé par participer-submit, participer-confirm et le socle
   participer-common. Une collectivité qui a son propre site (module Sites,
   dépôt openprojets-sites) y place un formulaire qui appelle
   /api/participer/submit depuis le navigateur du visiteur. Ce fichier dit
   quelles origines de site sont acceptées, pour quelle ville, et vers quelle
   page de ce site les liens des emails peuvent pointer.

   La liste vient de la variable PARTICIPER_ORIGINES_SITES, des entrées
   `ville=origine` séparées par des virgules :

     pays-ozon=https://www.pays-ozon.fr,pays-ozon=https://pays-ozon.fr

   Chaque origine est rattachée à UNE ville : un site ne dépose que dans
   l'espace de sa collectivité. Deux formes ne sont lues qu'en développement
   local (netlify dev pose NETLIFY_DEV=true) et ignorées partout ailleurs :
   une ville `*` (toutes les villes) et un motif `http://*.localhost:3000`
   (un seul niveau de sous-domaine). En dehors du développement, seules les
   origines https exactes comptent.

   La liste est relue à chaque appel : le coût est négligeable et les essais
   peuvent changer la variable sans recharger le module.
   ============================================================================ */

import { isValidCityCode } from './http.mjs';

export const ENV_ORIGINES_SITES = 'PARTICIPER_ORIGINES_SITES';

// Paramètre d'adresse qui porte le jeton de suivi, le même que sur la carte
export const PARAM_SUIVI = 'participer_suivi';

// Une adresse de retour plus longue n'a rien d'une page de site
const RETOUR_MAX = 500;

const MOTIF_RE = /^(https?):\/\/\*\.([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i;
const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const enDeveloppement = () => process.env.NETLIFY_DEV === 'true';

// Une entrée mal écrite n'est signalée qu'une fois par instance, pas à chaque requête
const dejaSignalees = new Set();
function ignorer(raison, entree) {
  const cle = `${raison}|${entree}`;
  if (dejaSignalees.has(cle)) return;
  dejaSignalees.add(cle);
  console.warn(`[participer-sites] entrée ignorée, ${raison} : ${entree}`);
}

/** Origine exacte (schéma, hôte, port) d'une adresse sans chemin, ou null. */
function origineExacte(valeur) {
  let u;
  try { u = new URL(valeur); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
  return u.origin;
}

/**
 * Entrées valides de PARTICIPER_ORIGINES_SITES. Une entrée mal écrite est
 * ignorée avec un avertissement dans les journaux, jamais devinée. Une
 * origine http exacte n'est lue qu'en développement local.
 * @returns {Array<{ville: string, origine?: string, motif?: {protocole: string, suffixe: string, port: string}}>}
 */
export function sitesAutorises() {
  const brut = process.env[ENV_ORIGINES_SITES] || '';
  const dev = enDeveloppement();
  const sites = [];
  for (const morceau of brut.split(',')) {
    const entree = morceau.trim();
    if (!entree) continue;
    const egal = entree.indexOf('=');
    const ville = egal > 0 ? entree.slice(0, egal).trim().toLowerCase() : '';
    const adresse = egal > 0 ? entree.slice(egal + 1).trim().replace(/\/$/, '') : '';
    const toutesVilles = ville === '*';
    if (!toutesVilles && !isValidCityCode(ville)) {
      ignorer('ville manquante ou invalide', entree);
      continue;
    }
    if (toutesVilles && !dev) {
      ignorer('ville * hors développement', entree);
      continue;
    }
    const m = MOTIF_RE.exec(adresse);
    if (m) {
      if (!dev) {
        ignorer('motif hors développement', entree);
        continue;
      }
      sites.push({ ville, motif: { protocole: `${m[1].toLowerCase()}:`, suffixe: m[2].toLowerCase(), port: m[3] || '' } });
      continue;
    }
    const origine = origineExacte(adresse);
    if (!origine || (!dev && !origine.startsWith('https://'))) {
      ignorer('origine invalide', entree);
      continue;
    }
    sites.push({ ville, origine });
  }
  return sites;
}

function correspond(site, u) {
  if (site.origine) return site.origine === u.origin;
  const { protocole, suffixe, port } = site.motif;
  if (u.protocol !== protocole || u.port !== port) return false;
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(`.${suffixe}`)) return false;
  return LABEL_RE.test(host.slice(0, -suffixe.length - 1));
}

/**
 * Villes auxquelles une origine de navigateur est rattachée.
 * @param {string} origine - en-tête Origin de la requête
 * @returns {Set<string>} vide si ce n'est pas un site autorisé ; contient `*`
 *   pour une entrée de développement valable pour toutes les villes
 */
export function villesDuSite(origine) {
  const villes = new Set();
  if (!origine) return villes;
  let u;
  try { u = new URL(origine); } catch { return villes; }
  for (const site of sitesAutorises()) {
    if (correspond(site, u)) villes.add(site.ville);
  }
  return villes;
}

export function estSiteAutorise(origine) {
  return villesDuSite(origine).size > 0;
}

/** L'origine est-elle celle d'un site rattaché à cette ville ? */
export function siteDeLaVille(origine, ville) {
  const villes = villesDuSite(origine);
  return villes.has('*') || villes.has(String(ville).toLowerCase());
}

/**
 * Adresse de retour acceptée pour une ville, normalisée, ou null. Elle doit
 * être une page d'un site rattaché à cette ville : c'est ce qui empêche le
 * lien d'un email de mener ailleurs (pas de redirection ouverte). Le fragment
 * est retiré, le jeton de suivi y sera posé au moment d'écrire le lien.
 */
export function retourDuSite(retour, ville) {
  const valeur = String(retour ?? '').trim();
  if (!valeur || valeur.length > RETOUR_MAX) return null;
  let u;
  try { u = new URL(valeur); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (!siteDeLaVille(u.origin, ville)) return null;
  u.hash = '';
  u.searchParams.delete(PARAM_SUIVI);
  return u.href;
}

/** Ajoute (ou remplace) un paramètre d'adresse sur une adresse de retour déjà validée. */
export function avecParametre(adresse, nom, valeur) {
  const u = new URL(adresse);
  u.searchParams.set(nom, valeur);
  return u.href;
}
