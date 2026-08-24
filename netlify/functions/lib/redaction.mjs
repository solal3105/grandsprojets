/**
 * Socle de rédaction partagé par l'outil de l'admin et par la démo.
 *
 * Les deux écrivent le même objet - un article de présentation d'un projet
 * urbain, en markdown - mais dans deux situations opposées : dans l'admin, un
 * agent relit avant de publier ; dans la démo, dix-sept articles partent sans
 * relecture devant un prospect. D'où un prompt unique et un paramètre de
 * sévérité, plutôt que deux textes qui divergeraient dès la première retouche.
 *
 * Ce module ne fait AUCUN appel réseau : il prépare des consignes et nettoie
 * des sorties. Chaque appelant garde sa propre plomberie OpenAI, parce qu'elles
 * ne se ressemblent pas (relais SSE vers un navigateur d'un côté, consommation
 * serveur avec repli non streamé de l'autre).
 */

// Nombre de sources citées sous un article. Au-delà, la liste cesse d'être une
// preuve et devient un pavé de liens.
const MAX_SOURCES = 5;

/**
 * Consignes de structure d'un article de projet.
 * @param {Object} o
 * @param {string} o.commune - nom de la commune, pour situer le lecteur
 * @param {boolean} o.stricte - true dans la démo : rien qui ne soit sourcé
 * @returns {string} prompt système
 */
export function promptArticle({ commune, stricte }) {
  const base = `Tu es un rédacteur territorial. Tu écris, pour les habitants de ${commune}, un article de présentation d'un projet d'aménagement.

Structure attendue :
- deux ou trois phrases d'introduction qui disent ce que le projet change concrètement, sans reprendre son titre ;
- deux à quatre sections de niveau 2 (##) choisies selon ce que les sources permettent réellement de dire : le contexte, ce qui change, le calendrier, le budget, les acteurs, les impacts pour les riverains ;
- une section "## Calendrier" UNIQUEMENT si une date de CHANTIER est connue (début, fin, livraison, inauguration). La date de parution d'un avis de marché public n'est pas un calendrier de travaux.

Longueur : 300 à 500 mots. Ton sobre et factuel, aucun superlatif, français impeccable.
N'écris pas de titre de niveau 1, le titre du projet est déjà affiché au-dessus de l'article.
N'attribue AUCUNE phrase à sa source, ni par un lien, ni par un nom de site entre parenthèses : les sources consultées sont listées automatiquement à la fin de l'article.
Rends l'article et rien d'autre. Pas de phrase d'introduction adressée à qui te lit, pas de commentaire sur ce que tu as trouvé ou non trouvé : ce texte est publié tel quel sur une fiche que consultent des habitants.`;

  if (!stricte) return base;

  return `${base}

RÈGLE ABSOLUE, qui prime sur la longueur demandée. Chaque affirmation doit se lire dans les sources qui te sont fournies ou dans les pages que tu as consultées. N'invente aucun détail technique : ni éclairage, ni matériaux, ni nombre de places, ni essences d'arbres, ni montant. Ne contredis jamais l'intention de la source : si elle dit limiter le trafic, n'écris pas améliorer la fluidité.
Si les sources sont pauvres, écris un article COURT. Trois lignes exactes valent mieux que quinze lignes plausibles, et c'est la seule règle que tu ne dois jamais sacrifier pour atteindre le nombre de mots.`;
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

/* Le paramètre que l'API ajoute aux adresses qu'elle cite. Il ne dit rien du
   contenu et brouille le lien affiché à un élu. */
const SUIVI_OPENAI = /[?&]utm_source=openai\b/;

/**
 * Liste de sources dédoublonnée, à partir des annotations d'une réponse.
 * @param {Array} annotations - objets url_citation de l'API Responses
 * @param {number} max
 * @returns {Array<{url: string, title: string}>}
 */
export function sourcesDesAnnotations(annotations, max = MAX_SOURCES) {
  const vues = new Set();
  const out = [];
  for (const a of annotations || []) {
    if (a?.type !== 'url_citation' || typeof a.url !== 'string' || !a.url.startsWith('http')) continue;
    let url = a.url;
    try {
      const u = new URL(url);
      u.searchParams.delete('utm_source');
      url = u.toString().replace(/\?$/, '');
    } catch { if (SUIVI_OPENAI.test(url)) continue; }
    if (vues.has(url)) continue;
    vues.add(url);
    out.push({ url, title: String(a.title || '').trim() || hoteLisible(url) });
    if (out.length >= max) break;
  }
  return out;
}

/** Nom d'hôte débarrassé de son www, utilisable comme intitulé de lien. */
export function hoteLisible(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; }
}

/**
 * Bloc de sources en markdown, ajouté à la fin d'un article.
 * Il est construit EN CODE, à partir des adresses réellement consultées : prié
 * de citer ses sources lui-même, le modèle écrit des jetons internes du type
 * « turn0search1 » à la place des adresses.
 * @param {Array<{url: string, title: string}>} sources
 * @returns {string} chaîne vide s'il n'y a rien à citer
 */
export function blocSources(sources) {
  if (!sources?.length) return '';
  const lignes = sources.map((s) => `- [${s.title}](${s.url})`).join('\n');
  return `\n\n## Sources\n\n${lignes}\n`;
}

export const _limites = { MAX_SOURCES };
