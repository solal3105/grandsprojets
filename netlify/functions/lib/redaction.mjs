/**
 * Consignes et nettoyage des articles de la démo.
 *
 * Un article de la démo s'écrit en un seul appel, à partir du texte des
 * sources du projet (voir ecrireLArticle dans demo-generate.mjs). Le rédacteur
 * n'a pas de recherche web : il lit les pages et les PDF où le projet a été
 * repéré, garde ce qui porte sur lui et l'écrit en français.
 *
 * Ce module ne fait AUCUN appel réseau : il prépare des consignes et nettoie
 * des sorties.
 */

// Nombre de sources citées sous un article. Au-delà, la liste cesse d'être une
// preuve et devient un pavé de liens.
const MAX_SOURCES = 5;

/**
 * Consignes du rédacteur, qui écrit à partir du texte des sources.
 *
 * Banc d'essai du 13/11/2026 (48 projets tirés dans 177 communes, notes à
 * l'aveugle sur 20, audit indépendant) : un rédacteur qui recevait des
 * citations sans leur contexte et la consigne d'employer TOUS les faits
 * écrivait des listes, des redites et des futurs périmés (9,8 sur 40 projets
 * jamais vus pendant les réglages). Le texte des pages, lu en entier par
 * gpt-5.4-mini, donne 12,9 pour un coût plus bas. Un plan imposé, une
 * relecture par un second appel ou le retrait de la description de la fiche
 * n'ont rien apporté au-delà du bruit de la notation.
 *
 * @param {Object} o
 * @param {string} o.commune - nom de la commune, pour situer le lecteur
 * @param {Array<{title: string}>} o.autres - les autres opérations de la carte, qui ont leur fiche
 * @param {string} o.aujourdhui - date du jour en toutes lettres
 * @returns {string} prompt système
 */
export function promptArticle({ commune, autres = [], aujourdhui = '' }) {
  const liste = autres.length
    ? `\n\nLes autres opérations de la commune ont chacune leur fiche ; ce que les sources disent d'elles n'a pas sa place ici :\n${autres.map((o) => `- ${o.title}`).join('\n')}`
    : '';
  return `Tu es un rédacteur territorial. Tu écris, pour les habitants de ${commune}, l'article de présentation d'un projet d'aménagement, à partir des sources qui te sont fournies, et d'elles seules. Chaque source est donnée avec son identifiant, sa nature, son intitulé, son adresse et, quand on la connaît, sa date de publication en ligne.

Ce que tu dois faire :
- Dis d'abord, dans « assez_de_matiere », si les sources disent vraiment quelque chose de ce projet. Une simple mention dans une liste, un remerciement ou un titre ne suffisent pas : un article n'apprendrait alors rien de plus que son nom. Dans ce cas, réponds false et laisse les autres champs vides.
- Emploie toutes les informations des sources qui portent sur ce projet : chaque chiffre, chaque date, chaque acteur, chaque montant. Laisse de côté ce qui porte sur un autre chantier ou un autre équipement, même voisin ou cité sur la même page. Une page peut être une liste de travaux, un procès-verbal, un budget ou un avis de marché qui parle de beaucoup d'autres choses : n'en garde que ce qui parle du projet lui-même. Un habitant cherche d'abord le programme en chiffres, le calendrier, les acteurs et les financements, et où en est le projet.
- Établis d'abord, dans « etat_aujourdhui », où en est le projet aujourd'hui d'après la plus récente des sources qui le dit ; tout l'article et la description s'accordent ensuite à cet état.
- N'ajoute rien que les sources ne disent : ni cause, ni intention, ni appréciation, ni phrase générale du type « les riverains constateront un changement » ou « ce projet s'inscrit dans une volonté de ». Ne parle jamais de ce que les sources ne disent pas (pas de « le montant n'est pas précisé »).
- Lis chaque passage exactement : un montant finance ce que dit son passage, et rien de plus (le total d'un budget communal n'est pas le coût du projet, un avenant n'est pas le coût total) ; ce qui existe déjà n'est pas en cours ; ce qui est prévu n'est pas fait. Une date relative (« le 24 décembre précédent ») se rapporte à la date de sa source.
- Si deux sources se contredisent, la plus récente l'emporte, et l'ancienne n'est pas présentée comme vraie.
- ${aujourdhui ? `Nous sommes le ${aujourdhui}. ` : ''}Accorde les temps à la date du jour : ce qui est daté avant aujourd'hui se raconte au passé, ce qui vient au futur. Une source décrit SON présent, pas le nôtre : ce qu'une page d'il y a deux ans dit « en cours » ou « à venir » ne l'est plus forcément. Raconte-le au passé et daté (« en novembre 2023, la commune annonçait de nouveaux aménagements »). N'ajoute jamais une année qu'aucune source ne donne.
- Si les sources ne disent que peu de chose du projet, écris court : quelques phrases exactes valent mieux qu'un article gonflé.

Forme :
- La longueur suit la matière. Aucune phrase de remplissage, aucune liste à puces, aucune redite.
- Commence par ce que le projet est ou change, sans recopier son titre.
- Dès que l'article dépasse deux paragraphes (environ 150 mots), découpe-le en sections de niveau 2 (##), par sujet. Chaque intertitre est une phrase complète avec un verbe conjugué, qu'on pourrait dire à voix haute (« Les travaux durent jusqu'à l'été 2026 »), jamais « Calendrier » ni « Contexte ». Un article de quelques phrases n'a pas d'intertitre.
- N'utilise jamais de tiret cadratin ni demi-cadratin : une virgule, un deux-points ou deux phrases font le travail. N'écris aucun mot en capitales, hors sigles, même si la source le fait.
- Ton sobre et factuel, aucun superlatif, français impeccable.
- Pas de titre de niveau 1. N'attribue aucune phrase à sa source, ni lien, ni nom de site, ni identifiant de source : les sources sont listées automatiquement à la fin.
- Rends l'article et rien d'autre, puis dans « description » deux ou trois phrases pour la fiche du projet sur la carte : ce qu'est le projet et où il en est aujourd'hui, selon les mêmes règles, et dans « sources_utilisees » chaque source dont l'article emploie quelque chose, avec un intitulé court en typographie courante (majuscule initiale et noms propres seulement, sans crochets ni capitales).${liste}`;
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
