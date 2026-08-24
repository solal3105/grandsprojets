/**
 * Mécanique d'exploration d'un site de mairie.
 *
 * Ce module ne fait AUCUN appel réseau et ne connaît rien à l'IA : il tient le
 * registre des pages déjà vues, la file de ce qu'il reste à ouvrir, et l'ordre
 * dans lequel les ouvrir. Tout ce qui s'y trouve est vérifiable sans allumer
 * quoi que ce soit, ce qui est précisément ce qui manquait à l'ancienne
 * collecte : elle décidait de son parcours à l'intérieur d'une fonction de
 * quatre-vingts lignes qui téléchargeait en même temps.
 *
 * Le modèle : on ne décide plus à l'avance combien de pages lire. On ouvre les
 * plus prometteuses, on regarde ce qu'elles donnent, et ce sont elles qui
 * indiquent la suite. Une page qui décrit des opérations et pointe vers leurs
 * fiches fait descendre l'exploration ; une page qui ne décrit rien l'arrête.
 */

/* Adresses d'une même page, écrites de plusieurs façons.
   Un CMS sert couramment la même page avec et sans barre oblique finale, avec
   un paramètre de suivi ajouté par une campagne, avec un ancrage vers un
   paragraphe, parfois avec une majuscule. Sans normalisation, un registre des
   pages vues laisse passer toutes ces variantes et on relit cinq fois la même
   chose en croyant explorer. */
const PARAMETRES_DE_SUIVI = /^(utm_|fbclid$|gclid$|mtm_|pk_|_ga$)/i;

export function normaliserUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.protocol = 'https:';
    url.host = url.host.toLowerCase().replace(/^www\./, '');
    // La liste est figée AVANT la boucle : on retire des clés pendant qu'on
    // les parcourt, et itérer directement sauterait une entrée sur deux.
    const cles = Array.from(url.searchParams.keys());
    for (const cle of cles) {
      if (PARAMETRES_DE_SUIVI.test(cle)) url.searchParams.delete(cle);
    }
    // Les paramètres restants sont triés : ?a=1&b=2 et ?b=2&a=1 sont la même page
    url.searchParams.sort();
    let chemin = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
    if (chemin.length > 1) chemin = chemin.replace(/\/+$/, '');
    url.pathname = chemin;
    return url.toString().replace(/\?$/, '');
  } catch { return String(u || ''); }
}

/* Fichiers qui ne sont pas des pages. Les PDF sont récoltés à part, ils ont
   leur propre lecture ; le reste n'a rien à dire à une exploration. */
const EXTENSION_NON_PAGE = /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp[34]|avi|mov|ics|css|js)$/i;

/* Chemins qui ne mènent jamais à une opération d'aménagement. C'est une
   économie, pas un filtre de pertinence : le jugement sur le fond appartient à
   la lecture de la page, celui-ci ne fait qu'éviter d'ouvrir un panier ou un
   formulaire de connexion. */
const CHEMIN_SANS_INTERET = /\/(wp-admin|wp-login|wp-json|admin|login|connexion|panier|cart|checkout|feed|rss|tag|tags|categorie|category|author|auteur|search|recherche|mentions-legales|cookies|plan-du-site|sitemap|newsletter|contact|annuaire|marches-publics|emploi|recrutement|etat-civil|demarches)(\/|\.|$)/i;

export function estUnePageExplorable(u, hote) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (hote && url.host.toLowerCase().replace(/^www\./, '') !== hote.toLowerCase().replace(/^www\./, '')) return false;
    if (EXTENSION_NON_PAGE.test(url.pathname)) return false;
    if (CHEMIN_SANS_INTERET.test(url.pathname)) return false;
    return true;
  } catch { return false; }
}

/* File d'exploration.
 *
 * Elle porte trois choses : ce qui reste à ouvrir, ce qui a déjà été vu, et le
 * nombre de pages distinctes qui pointent vers chaque adresse. Ce dernier
 * compte est un indice d'importance dans le site, et il départage les
 * candidates quand le budget de temps oblige à choisir.
 */
export class FileExploration {
  constructor({ hote, plafond = 400 } = {}) {
    this.hote = hote || '';
    this.plafond = plafond;
    this.vues = new Set();
    this.candidates = new Map();
    this.ouvertes = 0;
  }

  /** Une adresse a-t-elle déjà été ouverte, ou est-elle déjà en attente ? */
  connue(u) {
    const cle = normaliserUrl(u);
    return this.vues.has(cle) || this.candidates.has(cle);
  }

  /* A-t-elle déjà été LUE ? C'est la question qui compte pour décider si une
     page mérite d'être soumise au jugement d'une autre.
     Écarter tout ce qui est « connu » revenait à ne jamais proposer une page
     déjà versée par le sitemap : mesure sur Ploudalmézeau, la page sommaire
     « Projets » listait les trois fiches détaillées, mais comme le sitemap les
     avait déjà mises en file, elles n'étaient pas soumises, ne recevaient
     aucune priorité, et restaient noyées parmi trois cents adresses froides
     que l'exploration n'a jamais atteintes. */
  dejaOuverte(u) {
    return this.vues.has(normaliserUrl(u));
  }

  /**
   * Verse une adresse dans la file.
   * @param {string} url
   * @param {string} label - intitulé du lien, ce sur quoi on juge sans ouvrir
   * @param {number} priorite - remontée par la lecture de la page qui l'a citée
   * @returns {boolean} true si l'adresse est nouvelle
   */
  ajouter(url, label = '', priorite = 0) {
    if (!estUnePageExplorable(url, this.hote)) return false;
    const cle = normaliserUrl(url);
    if (this.vues.has(cle)) return false;
    const deja = this.candidates.get(cle);
    if (deja) {
      // Une page citée par plusieurs autres compte davantage
      deja.entrants++;
      deja.priorite = Math.max(deja.priorite, priorite);
      if (!deja.label && label) deja.label = label;
      return false;
    }
    if (this.candidates.size >= this.plafond) {
      /* File pleine. Refuser sechement fermait la porte aux recommandations
         CHAUDES : une fiche designee par un sommaire de projets etait perdue
         pendant que quatre cents adresses froides du sitemap gardaient leur
         place sans jamais etre ouvertes. On evince donc la moins bien classee,
         mais seulement si l'entrante la surclasse strictement : la file reste
         bornee, et le brouillon qui voyage en base ne grossit pas. */
      let pire = null;
      for (const c of this.candidates.values()) {
        if (!pire || c.priorite < pire.priorite || (c.priorite === pire.priorite && c.entrants < pire.entrants)) pire = c;
      }
      if (!pire || priorite <= pire.priorite) return false;
      this.candidates.delete(pire.cle);
    }
    this.candidates.set(cle, { url, cle, label: String(label || '').slice(0, 120), priorite, entrants: 1 });
    return true;
  }

  /** Marque une adresse comme ouverte : elle ne sera plus jamais reproposée. */
  marquerVue(url) {
    const cle = normaliserUrl(url);
    this.vues.add(cle);
    this.candidates.delete(cle);
  }

  /**
   * Remet en file une page dont la LECTURE a échoué : coupure réseau, service
   * saturé. Sans cela, une rafale de coupures perdait définitivement toute une
   * vague de pages. Une seule seconde chance par page, sinon une adresse
   * durablement en panne ferait tourner l'exploration en rond.
   * @returns {boolean} true si la page a été remise en attente
   */
  remettre(candidate) {
    if ((candidate.essais || 0) >= 1) return false;
    this.vues.delete(candidate.cle);
    this.candidates.set(candidate.cle, { ...candidate, essais: (candidate.essais || 0) + 1 });
    this.ouvertes--;
    return true;
  }

  /**
   * Prochaine vague de pages à ouvrir.
   *
   * L'ordre ne décide plus de ce qu'on lira, seulement de ce qu'on lira EN
   * PREMIER : la file est destinée à être vidée entièrement. Il n'y a donc plus
   * de pari à faire, et une page recommandée par une autre passe devant
   * simplement parce qu'elle a des chances de donner plus vite.
   */
  vague(taille) {
    const triees = [...this.candidates.values()].sort((a, b) =>
      (b.priorite - a.priorite) || (b.entrants - a.entrants));
    const lot = triees.slice(0, taille);
    for (const c of lot) this.marquerVue(c.url);
    this.ouvertes += lot.length;
    return lot;
  }

  get restantes() { return this.candidates.size; }

  /* L'exploration ne tient pas dans une seule invocation : elle travaille par
     tranches et son état voyage en base entre deux. Un Set et une Map ne
     survivent pas à un aller-retour JSON, d'où ces deux méthodes. */
  serialiser() {
    return {
      hote: this.hote,
      plafond: this.plafond,
      vues: [...this.vues],
      candidates: [...this.candidates.values()],
      ouvertes: this.ouvertes,
    };
  }

  static restaurer(brut) {
    const f = new FileExploration({ hote: brut?.hote, plafond: brut?.plafond });
    for (const v of brut?.vues || []) f.vues.add(v);
    for (const c of brut?.candidates || []) f.candidates.set(c.cle, c);
    f.ouvertes = brut?.ouvertes || 0;
    return f;
  }
}

/* Retrait du gabarit du site, à partir d'une page de RÉFÉRENCE.
 *
 * L'ancienne collecte reconnaissait le gabarit en comparant toutes les pages
 * entre elles, ce qui supposait de les avoir toutes lues avant d'en analyser
 * une seule. L'exploration analyse au fil de l'eau, donc ce n'est plus
 * possible. On se sert de l'accueil : il porte le menu, le pied de page et le
 * bandeau de cookies, c'est-à-dire tout ce qui se répète, et il est lu en
 * premier de toute façon.
 *
 * Un enchaînement de MOTS_GABARIT mots présent à la fois sur l'accueil et sur
 * la page courante n'est pas le contenu de cette page.
 */
const MOTS_GABARIT = 8;
// Ce qui reste apres retrait : en deca, si le texte brut etait substantiel,
// c'est le gabarit qui a tout mange, pas la page qui etait vide.
export const GABARIT_RESTE_MIN = 200;

/* L'empreinte se construit sur PLUSIEURS references : un enchainement n'est du
   gabarit que s'il apparait sur au moins deux d'entre elles. Construite sur le
   seul accueil, elle mangeait aussi les TEASERS : une commune qui presente ses
   projets en page d'accueil voyait le texte de la page projet, identique au
   teaser, retire comme du menu. Avec une seule reference disponible (premiere
   tranche, aucun echantillon encore), on ne retire rien : quelques pages lues
   avec leur menu coutent moins qu'un projet efface. */
export function empreinteGabarit(references) {
  const refs = (Array.isArray(references) ? references : [references]).filter(Boolean);
  if (refs.length < 2) return new Set();
  const compte = new Map();
  for (const ref of refs) {
    const mots = String(ref || '').split(/\s+/).filter(Boolean);
    const vus = new Set();
    for (let i = 0; i + MOTS_GABARIT <= mots.length; i++) {
      vus.add(mots.slice(i, i + MOTS_GABARIT).join(' ').toLowerCase());
    }
    for (const cle of vus) compte.set(cle, (compte.get(cle) || 0) + 1);
  }
  return new Set([...compte.entries()].filter(([, n]) => n >= 2).map(([cle]) => cle));
}

export function retirerGabaritConnu(texte, empreinte) {
  const brut = String(texte || '');
  if (!empreinte?.size) return brut;
  const mots = brut.split(/\s+/).filter(Boolean);
  const aRetirer = new Uint8Array(mots.length);
  for (let i = 0; i + MOTS_GABARIT <= mots.length; i++) {
    const cle = mots.slice(i, i + MOTS_GABARIT).join(' ').toLowerCase();
    if (empreinte.has(cle)) aRetirer.fill(1, i, i + MOTS_GABARIT);
  }
  const net = mots.filter((_, i) => !aRetirer[i]).join(' ').replace(/\s+/g, ' ').trim();
  /* Garde-fou herite de l'ancien modele : un retrait qui vide une page
     substantielle s'est trompe de cible, on lit alors le texte brut plutot que
     de sauter la page en silence. */
  if (net.length < GABARIT_RESTE_MIN && brut.trim().length >= GABARIT_RESTE_MIN * 3) return brut.trim();
  return net;
}

/* Rapprochement de deux projets décrits sur DEUX pages différentes.
 *
 * C'est la contrepartie de la lecture page par page : le même écoquartier est
 * décrit sur la rubrique « nos projets », sur l'actualité qui annonce le
 * chantier et dans l'avis de marché. Trois adresses distinctes, aucune lue deux
 * fois, et pourtant trois fois le même projet en sortie.
 *
 * Ce premier tri ne coûte rien et règle les cas nets. Ce qu'il laisse en doute
 * part ensuite à l'arbitrage, sur les seuls titres, ce qui est court et sûr.
 */
export function motsCaracteristiques(titre, motsVides) {
  return new Set(
    String(titre || '')
      // Les ligatures ne se decomposent pas par NFD : sans ce remplacement,
      // « cœur de ville » ne partage aucun mot avec « coeur de ville ».
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/Œ/g, 'oe').replace(/Æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length >= 5 && !motsVides.test(m))
  );
}

/**
 * Deux projets désignent-ils manifestement le même chantier ?
 * Rend 'oui', 'non', ou 'doute' quand seul un arbitrage peut trancher.
 */
export function rapprochement(a, b, motsVides) {
  const ma = motsCaracteristiques(a.title, motsVides);
  const mb = motsCaracteristiques(b.title, motsVides);
  const communs = [...ma].filter((m) => mb.has(m));

  const lieuA = String(a.geo_query || a.place || '').trim().toLowerCase();
  const lieuB = String(b.geo_query || b.place || '').trim().toLowerCase();
  const memeLieu = Boolean(lieuA) && lieuA === lieuB;
  const lieuxDifferents = Boolean(lieuA) && Boolean(lieuB) && lieuA !== lieuB;

  /* Des lieux EXPLICITEMENT differents interdisent la fusion d'office, quel que
     soit le nombre de mots partages : « requalification de la rue Jean Jaures »
     et « residence de la rue Jean Jaures » partagent deux mots et sont deux
     chantiers. L'arbitre tranchera, et son biais est de ne pas fondre :
     fusionner a tort fait DISPARAITRE un projet de la carte. */
  if (lieuxDifferents && communs.length) return 'doute';

  // Deux mots caractéristiques communs, ou un seul mais au même endroit : c'est
  // le même chantier, décrit deux fois.
  if (communs.length >= 2) return 'oui';
  if (communs.length === 1 && memeLieu) return 'oui';
  /* Un titre sans AUCUN mot caracteristique ne prouve rien, ni dans un sens ni
     dans l'autre : au meme lieu, seul l'arbitre peut trancher. */
  if (!ma.size || !mb.size) return memeLieu ? 'doute' : 'non';
  // Aucun mot en commun et des lieux différents : deux chantiers distincts.
  if (!communs.length && lieuxDifferents) return 'non';
  if (!communs.length && !memeLieu) return 'non';
  return 'doute';
}

/**
 * Regroupe une liste de projets bruts. Rend les groupes formés et les paires
 * restées en doute, que l'appelant fera trancher.
 * @returns {{groupes: Array<Array<Object>>, doutes: Array<[number, number]>}}
 */
export function regrouper(projets, motsVides) {
  const parent = projets.map((_, i) => i);
  const racine = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const unir = (i, j) => { const ri = racine(i); const rj = racine(j); if (ri !== rj) parent[rj] = ri; };
  const doutes = [];

  for (let i = 0; i < projets.length; i++) {
    for (let j = i + 1; j < projets.length; j++) {
      const verdict = rapprochement(projets[i], projets[j], motsVides);
      if (verdict === 'oui') unir(i, j);
      else if (verdict === 'doute') doutes.push([i, j]);
    }
  }

  const parRacine = new Map();
  for (let i = 0; i < projets.length; i++) {
    const r = racine(i);
    if (!parRacine.has(r)) parRacine.set(r, []);
    parRacine.get(r).push(projets[i]);
  }
  return { groupes: [...parRacine.values()], doutes };
}

/**
 * Fond un groupe de descriptions du même chantier en une seule fiche.
 * On garde le meilleur de chaque champ plutôt que la première occurrence : le
 * titre le plus court est en général le plus propre, la description la plus
 * longue la plus complète, et les sources s'additionnent, ce qui devient la
 * mesure de solidité du projet.
 * @param {Array<Object>} groupe - descriptions du même chantier
 * @param {RegExp} motsVides - vocabulaire d'aménagement, qui ne caractérise rien
 */
export function fondre(groupe, motsVides) {
  /* Le titre retenu est le plus INFORMATIF, pas le plus court.
     Mesure sur un cas réel : entre « Écoquartier secteur ancienne gare » et
     « Travaux écoquartier », le plus court est celui de l'avis de marché,
     c'est-à-dire le plus pauvre. On compte donc les mots qui désignent
     vraiment quelque chose, et le titre le plus court ne départage qu'à
     égalité. Un titre venu d'une page de la commune passe devant celui d'un
     avis de marché, qui est administratif par nature. */
  const valeur = (p) => (p.origine && p.origine !== 'marche' ? 100 : 0)
    + motsCaracteristiques(p.title, motsVides).size;
  const classes = [...groupe].sort((a, b) =>
    (valeur(b) - valeur(a)) || (String(a.title).length - String(b.title).length));
  const base = { ...classes[0] };

  const meilleur = (champ, mieux) => {
    for (const p of groupe) {
      const v = String(p[champ] || '').trim();
      if (v && mieux(v, String(base[champ] || '').trim())) base[champ] = v;
    }
  };
  meilleur('description', (v, actuel) => v.length > actuel.length);
  meilleur('address', (v, actuel) => !actuel || v.length > actuel.length);
  meilleur('geo_query', (v, actuel) => !actuel);
  meilleur('place', (v, actuel) => !actuel);
  /* La CITATION reste appariee a SA source. Prendre la plus longue du groupe
     detachait la preuve de sa provenance : la phrase d'un avis de marche se
     retrouvait presentee comme relevee sur le site de la commune. Si le membre
     porteur n'a pas de citation, on prend celle d'un autre membre ET son
     adresse avec, jamais l'une sans l'autre. */
  if (!String(base.evidence_quote || '').trim()) {
    const temoin = groupe.find((p) => String(p.evidence_quote || '').trim());
    if (temoin) {
      base.evidence_quote = temoin.evidence_quote;
      base.source_url = temoin.source_url;
    }
  }
  /* La date d'avis retenue est la plus RECENTE du groupe : c'est elle qui dit
     ou en est le chantier, et elle sert a classer la reserve des marches. */
  base.marcheDate = groupe.reduce((d, p) => (String(p.marcheDate || '') > d ? String(p.marcheDate) : d), String(base.marcheDate || ''));

  // Toutes les adresses qui attestent le projet, sans doublon. Celle du
  // porteur vient en premier : c'est elle que la fiche affiche comme source.
  const vues = new Set();
  base.sources = [];
  const ordonne = [classes[0], ...groupe.filter((p) => p !== classes[0])];
  for (const p of ordonne) {
    for (const s of p.sources || [{ url: p.source_url, type: p.origine || 'mairie' }]) {
      const cle = normaliserUrl(s.url);
      if (!s.url || vues.has(cle)) continue;
      vues.add(cle);
      base.sources.push(s);
    }
  }
  // source_url reste celle qui accompagne la citation, posee plus haut
  /* Nombre de sources DISTINCTES qui décrivent ce chantier. C'est ce qu'on ne
     savait pas mesurer quand une seule lecture voyait tout d'un coup : un
     projet vu par la mairie, la presse et un marché est manifestement plus
     consistant qu'un projet vu une seule fois. */
  base.attestations = base.sources.length;
  // Un projet décrit par une page de la commune n'est jamais « de marché »
  base.origine = groupe.some((p) => p.origine && p.origine !== 'marche') ? 'commune' : (groupe[0].origine || 'marche');
  return base;
}
