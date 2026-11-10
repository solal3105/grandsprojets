/**
 * Consignes et nettoyage des articles de la démo.
 *
 * Un article de la démo s'écrit à partir d'une liste de faits déjà retrouvés
 * dans les sources du projet (voir redigerArticle dans demo-generate.mjs). Le
 * rédacteur n'a ni recherche web ni texte source brut : il relie et met en
 * français ce que la liste établit.
 *
 * Ce module ne fait AUCUN appel réseau : il prépare des consignes et nettoie
 * des sorties.
 */

// Nombre de sources citées sous un article. Au-delà, la liste cesse d'être une
// preuve et devient un pavé de liens.
const MAX_SOURCES = 5;

/**
 * Consignes du rédacteur, qui écrit à partir des faits vérifiés.
 * @param {Object} o
 * @param {string} o.commune - nom de la commune, pour situer le lecteur
 * @param {string} o.aujourdhui - date du jour en toutes lettres
 * @returns {string} prompt système
 */
export function promptArticle({ commune, aujourdhui = '' }) {
  return `Tu es un rédacteur territorial. Tu écris, pour les habitants de ${commune}, l'article de présentation d'un projet d'aménagement, à partir de la liste de faits vérifiés qui t'est fournie, et d'elle seule. Chaque fait est un passage recopié mot pour mot d'une source officielle du projet (« la_source_dit »), avec ce dont il parle (« objet »), sa rubrique et la date de sa source.

Ce que tu dois faire :
- Emploie TOUS les faits de la liste qui portent sur ce projet : chaque chiffre, chaque date, chaque acteur, chaque montant. Laisse de côté tout fait dont l'objet est un autre chantier ou un autre équipement, même voisin ou cité sur la même page : il a sa propre fiche. Un habitant cherche d'abord le programme en chiffres, le calendrier, les acteurs et les financements, et où en est le projet.
- Relie-les, ordonne-les, mets-les en bon français. N'ajoute rien que la liste ne dise : ni cause, ni intention, ni appréciation, ni phrase générale du type « les riverains constateront un changement » ou « ce projet s'inscrit dans une volonté de ». Ne parle jamais de ce que la liste ne dit pas (pas de « le montant n'est pas précisé »).
- Lis chaque passage exactement : un montant finance ce que dit son passage, et rien de plus (le total d'un budget communal n'est pas le coût du projet) ; ce qui existe déjà n'est pas en cours ; ce qui est prévu n'est pas fait.
- Si deux faits se contredisent, le plus récent (date de publication de sa source) l'emporte, et l'ancien n'est pas présenté comme vrai.
${aujourdhui ? `- Nous sommes le ${aujourdhui}. ` : '- '}Accorde les temps à cette date : ce qui est daté avant aujourd'hui se raconte au passé, ce qui vient au futur. Chaque fait porte la date et l'ancienneté de sa source, et une source décrit SON présent, pas le nôtre : ce qu'une page d'il y a deux ans dit « en cours » ou « à venir » ne l'est plus forcément. Raconte-le au passé et daté (« en novembre 2023, la commune annonçait de nouveaux aménagements »), jamais au présent. N'ajoute jamais une année qu'aucun fait ni aucune date de publication ne donne.

Forme :
- La longueur suit la matière : quelques faits font un court paragraphe, beaucoup de faits font un article plus long. Aucune phrase de remplissage.
- Commence par ce que le projet est ou change, sans recopier son titre.
- Dès que l'article dépasse deux paragraphes (environ 150 mots), découpe-le en sections de niveau 2 (##), par sujet : ce qui est fait, le calendrier, les acteurs et les financements, ce qui change pour les habitants. Chaque intertitre est une phrase complète avec un verbe conjugué, qu'on pourrait dire à voix haute (« Les travaux durent jusqu'à l'été 2026 »), jamais « Calendrier » ni « Contexte ». Un intertitre ne nomme que des acteurs présents dans les faits. Un article de quelques phrases n'a pas d'intertitre.
- N'utilise jamais de tiret cadratin ni demi-cadratin : une virgule, un deux-points ou deux phrases font le travail. N'écris aucun mot en capitales, hors sigles, même si la source le fait.
- Ton sobre et factuel, aucun superlatif, français impeccable.
- Pas de titre de niveau 1. N'attribue aucune phrase à sa source, ni lien, ni nom de site, ni identifiant de fait : les sources sont listées automatiquement à la fin.
- Rends l'article et rien d'autre, et dans « faits_utilises » les identifiants des faits employés.`;
}

/* Les modèles posent des liens en clair dans le corps du texte malgré la
   consigne, sous trois formes : le lien markdown, l'adresse nue, et la citation
   entre parenthèses qui suit une affirmation. On les retire côté serveur plutôt
   que d'espérer que la consigne tienne. Ces trois expressions viennent du
   nettoyage qui existait côté navigateur dans le copilote de l'admin. */
const LIEN_MARKDOWN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
const ADRESSE_NUE = /(?:^|\s)\(?https?:\/\/[^\s)]+\)?/g;
// « (source : https://... ) », mais aussi « (source : lyon.fr) », sans adresse.
const CITATION_PARENTHESE = /\s*\((?:source|voir|cf\.?)\s*:?[^)]*\)/gi;
/* Parenthèse ne contenant qu'un nom de site, du type « (metropole.nantes.fr) ».
   Elle s'applique APRÈS le retrait des liens markdown, sinon elle ne verrait
   que les noms déjà nus et laisserait passer la forme la plus courante, où le
   nom est encore enveloppé dans son lien. Un texte français ordinaire n'est pas
   touché : le motif n'admet ni espace ni chiffre en fin, donc ni
   « (env. 160 hectares) » ni « (n°2021-1104) ». */
const PARENTHESE_NOM_DE_SITE = /\s*\((?:[a-z0-9-]+\.)+[a-z]{2,}\)/gi;

/**
 * Retire les liens et les attributions du corps d'un article, en gardant le
 * texte qu'ils portaient.
 * @param {string} markdown
 * @returns {string}
 */
export function retirerLesLiens(markdown) {
  return String(markdown || '')
    .replace(CITATION_PARENTHESE, '')
    .replace(LIEN_MARKDOWN, '$1')
    .replace(PARENTHESE_NOM_DE_SITE, '')
    .replace(ADRESSE_NUE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Nom d'hôte débarrassé de son www, utilisable comme intitulé de lien. */
export function hoteLisible(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; }
}

/**
 * Bloc de sources en markdown, ajouté à la fin d'un article.
 * Il est construit EN CODE, à partir des sources des faits employés : prié de
 * citer ses sources lui-même, un modèle écrit des jetons internes du type
 * « turn0search1 » à la place des adresses.
 * @param {Array<{url: string, title: string}>} sources
 * @returns {string} chaîne vide s'il n'y a rien à citer
 */
export function blocSources(sources) {
  if (!sources?.length) return '';
  const lignes = sources.slice(0, MAX_SOURCES).map((s) => `- [${s.title}](${s.url})`).join('\n');
  return `\n\n## Sources\n\n${lignes}\n`;
}

export const _limites = { MAX_SOURCES };
