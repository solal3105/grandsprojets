/* Les lots de la roue du stand (/roue).
 *
 * `parts` : le nombre de cases que le lot occupe sur la roue. Toutes les cases
 * ont la même taille, la chance de gagner un lot est donc sa part de la roue.
 * `stock` : le nombre d'exemplaires apportés au salon, `null` quand on ne les
 * compte pas. Un lot dont le stock tombe à zéro quitte la roue.
 * Les deux se règlent aussi sur la tablette, dans les réglages de la page ; ce
 * fichier donne les valeurs d'origine.
 *
 * `libelle` : le nom écrit sur la case, une ligne par élément. `gain` complète
 * « Vous avez gagné ». `picto` : des tracés SVG dans un carré de 24, au trait. */
export const lotsRoue = [
  {
    key: 'serre-pantalon',
    nom: 'Un serre-pantalon',
    libelle: ['Serre-', 'pantalon'],
    gain: 'un serre-pantalon',
    remise: 'Nous vous le remettons tout de suite, ici sur le stand.',
    teinte: '#C4002A',
    parts: 3,
    stock: null,
    picto: [
      'M7 3h10l1.5 18h-4.9L12 9.5 10.4 21H5.5z',
      'M7 6.2h10',
      'M13.2 16.4h4.8',
      'M13.4 18.6h4.9',
    ],
  },
  {
    key: 'couvre-selle',
    nom: 'Un couvre-selle',
    libelle: ['Couvre-', 'selle'],
    gain: 'un couvre-selle',
    remise: 'Nous vous le remettons tout de suite, ici sur le stand.',
    teinte: '#B45309',
    parts: 3,
    stock: null,
    picto: [
      'M2.5 9.8c1.7-1.5 4.6-2 7.2-1.6 1.7.3 2.9 1 4.6 1 2.1 0 3.6-1.4 5.5-1 1.5.3 2.1 1.4 1.8 2.6-.4 1.6-2.4 2.6-5 2.6H9c-2.5 0-4.7-.7-6.3-1.8-.6-.5-.7-1.3-.2-1.8z',
      'M13 13.4v6.6',
      'M10.3 20.5h5.4',
    ],
  },
  {
    key: 'carte-postale',
    nom: 'Une carte postale de votre commune',
    libelle: ['Carte', 'postale'],
    gain: 'une carte postale de votre commune',
    remise: 'Nous la préparons pour votre commune, ici sur le stand.',
    teinte: '#0B7A4A',
    parts: 3,
    stock: null,
    picto: [
      'M2.5 5.5h19v13h-19z',
      'M15 8h4v4.5h-4z',
      'M5.5 9.5h6',
      'M5.5 12.5h5',
      'M5.5 15.5h7',
    ],
  },
  {
    /* Le lot numérique : la carte des projets que la démo construit pour
       n'importe quelle commune. Rien à préparer, et le visiteur repart avec sa
       carte sur son téléphone. */
    key: 'carte-commune',
    nom: 'La carte des projets de votre commune',
    libelle: ['Carte de', 'votre commune'],
    gain: 'la carte des projets de votre commune',
    remise: "Nous la construisons avec vous sur cette tablette, en quelques minutes, et vous l'emportez sur votre téléphone.",
    action: 'Construire la carte de ma commune',
    teinte: '#1B5FA8',
    parts: 3,
    stock: null,
    picto: [
      'M3 6.5l6-3 6 3 6-3v14l-6 3-6-3-6 3z',
      'M9 3.5v14',
      'M15 6.5v14',
    ],
  },
]
