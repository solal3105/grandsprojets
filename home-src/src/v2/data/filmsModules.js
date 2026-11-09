/* Les films des cinq modules, un par module, voix de Victoria (ElevenLabs).
 * Ils ont été tournés dans l'atelier ~/Developer/Open-Projets/open-projets-videos/films-modules
 * (maquette three.js, hors dépôt) ; les fichiers du site sont à la racine,
 * sous /video/modules/ (voir video/README.md). Le nom, la couleur et l'ordre
 * viennent de data/modules.js : ici, seulement ce qui est propre au film.
 * `duree` est en secondes, pour l'affichage avant le chargement. */
export const filmsModules = {
  carte: { fichier: '/video/modules/carte.mp4', affiche: '/video/modules/carte.webp', sousTitres: '/video/modules/carte.vtt', duree: 113 },
  travaux: { fichier: '/video/modules/travaux.mp4', affiche: '/video/modules/travaux.webp', sousTitres: '/video/modules/travaux.vtt', duree: 80 },
  chantiers: { fichier: '/video/modules/chantiers.mp4', affiche: '/video/modules/chantiers.webp', sousTitres: '/video/modules/chantiers.vtt', duree: 168 },
  participer: { fichier: '/video/modules/participer.mp4', affiche: '/video/modules/participer.webp', sousTitres: '/video/modules/participer.vtt', duree: 124 },
  diagnostic: { fichier: '/video/modules/diagnostic.mp4', affiche: '/video/modules/diagnostic.webp', sousTitres: '/video/modules/diagnostic.vtt', duree: 116 },
}
