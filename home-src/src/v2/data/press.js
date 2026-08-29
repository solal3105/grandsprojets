/* Ce que la presse a dit d'Open Projets, pour la version 2.
 *
 * Trois passages en avril 2026, verifies un par un sur le web : une emission
 * de television, une matinale de radio doublee d'un article, et un webinaire
 * pour les collectivites. Rien d'autre n'existe : la maison mere VAZY a sa
 * propre revue de presse, elle ne parle pas d'Open Projets et n'a donc pas sa
 * place ici.
 *
 * La v1 garde sa propre section avec ses citations longues et son lecteur
 * audio. Quand la v2 remplacera la v1, les deux se consolideront ici. */

export const bfm = {
  media: 'BFM Lyon',
  logo: 'img/press/logo-bfm-lyon.svg',
  logoAlt: 'BFM Lyon',
  type: 'Télévision',
  date: '22 avril 2026',
  citation: "Une carte des travaux et projets urbains de la Métropole de Lyon… et demain, peut-être, de toute la France ?",
  cta: 'Voir le reportage',
  url: 'https://www.linkedin.com/posts/solal-gendrin_une-carte-des-travaux-et-projets-urbains-activity-7453065663713046528-suBc',
}

export const lyonDemain = {
  media: 'Lyon Demain',
  logo: 'img/press/lyon-demain-radio.png',
  logoAlt: 'Lyon Demain Radio',
  type: 'Radio',
  date: '17 avril 2026',
  citation: "Les travaux en ville, tout le monde les subit. Mais les comprendre, c'est une autre histoire. La start-up villeurbannaise Vazy s'attaque à ce problème avec un outil cartographique interactif baptisé Open Projets.",
  signature: 'Gérald Bouchon, Lyon Demain',
  cta: "Lire l'article",
  url: 'https://www.lyondemain.fr/open-projets-cartographie-chantier-projets-vazy/',
  // Le passage a l'antenne, hebergé chez nous : la page reste lisible meme si
  // le lecteur du diffuseur change d'adresse.
  audio: {
    src: 'audio/lyon-demain-open-projets.mp3',
    emission: 'Le Quart d\'heure lyonnais',
    date: '14 avril 2026',
    invites: 'Solal Gendrin et Loïc Robbiani',
  },
}

export const gazette = {
  media: 'La Gazette des Communes',
  logo: 'img/press/logo-gazette-live-nj.png',
  logoAlt: 'La Gazette des Communes',
  type: 'Webinaire',
  date: '28 avril 2026',
  titre: 'Travaux et projets urbains : comment mieux informer pour réduire les tensions ?',
  citation: "Informer avec rigueur, en répondant aux attentes d'accès continu à l'information de manière centralisée et interactive.",
  cta: 'Voir le replay',
  url: 'https://www.youtube.com/watch?v=dNOvVS3G-Ts',
}
