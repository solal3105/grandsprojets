/* ============================================================================
   ÉPOQUES DISPONIBLES - carte-postale/epoques.js

   Catalogue des fonds cartographiques de l'IGN, du XVIIIe siècle à aujourd'hui.
   Servis par la Géoplateforme (data.geopf.fr), sans clé d'API.

   Pourquoi ce catalogue vit dans le code et non en base : ce ne sont pas des
   données métier configurables par une collectivité, mais la description
   technique de services extérieurs (identifiant de couche, style, grille de
   tuiles, plage de zoom). Chaque ligne a été VÉRIFIÉE par un vrai appel de
   tuile : deux pièges se cachent ici.

   Piège 1 : les photographies historiques n'exposent PAS le style `normal`,
   seulement `BDORTHOHISTORIQUE`. Demander `normal` rend une erreur 400.
   Piège 2 : leur grille de tuiles n'est pas la même (`PM_0_18`, `PM_3_18`) que
   celle des couches courantes (`PM`).

   La couche 1980-1995 est déclarée par l'IGN mais ne sert aucune tuile :
   testée sur Bourgoin-Jallieu, Paris, Vannes et Montpellier, elle rend 404
   partout. Elle est donc absente de cette liste.
   ============================================================================ */
(() => {
  'use strict';

  const WMTS = 'https://data.geopf.fr/wmts';

  // Une tuile IGN, au format attendu par MapLibre
  const tuiles = ({ couche, style = 'normal', grille = 'PM', format = 'image/jpeg' }) => [
    `${WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0`
    + `&LAYER=${couche}&STYLE=${style}&TILEMATRIXSET=${grille}`
    + `&FORMAT=${encodeURIComponent(format)}`
    + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  ];

  /* `annee` sert à la phrase du bandeau (« Cette carte a XX ans »). Pour une
     couche qui couvre une période, c'est son milieu : une photographie de la
     campagne 1950-1965 date en moyenne de 1957, et l'annoncer ainsi est plus
     honnête que de prendre une borne. `annee: null` désigne le présent. */
  const EPOQUES = [
    {
      id: 'cassini',
      titre: 'Carte de Cassini',
      periode: 'XVIIIe siècle',
      annee: 1760,
      zoomMax: 14,
      nature: 'dessin',
      tiles: tuiles({ couche: 'BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI', format: 'image/png' }),
    },
    {
      id: 'etat-major',
      titre: "Carte de l'état-major",
      periode: '1820 - 1866',
      annee: 1843,
      zoomMax: 15,
      nature: 'dessin',
      tiles: tuiles({ couche: 'GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40' }),
    },
    {
      id: 'scan50',
      titre: 'Carte de 1950',
      periode: '1950',
      annee: 1950,
      zoomMax: 15,
      nature: 'dessin',
      tiles: tuiles({ couche: 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950' }),
    },
    {
      id: 'photo-1950',
      titre: 'Vue aérienne',
      periode: '1950 - 1965',
      annee: 1957,
      zoomMax: 18,
      nature: 'photo',
      tiles: tuiles({
        couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965',
        style: 'BDORTHOHISTORIQUE',
        grille: 'PM_0_18',
        format: 'image/png',
      }),
    },
    {
      id: 'photo-1965',
      titre: 'Vue aérienne',
      periode: '1965 - 1980',
      annee: 1972,
      zoomMax: 18,
      nature: 'photo',
      tiles: tuiles({
        couche: 'ORTHOIMAGERY.ORTHOPHOTOS.1965-1980',
        style: 'BDORTHOHISTORIQUE',
        grille: 'PM_3_18',
        format: 'image/png',
      }),
    },
    {
      id: 'photo-2000',
      titre: 'Vue aérienne',
      periode: '2000 - 2005',
      annee: 2002,
      zoomMax: 18,
      nature: 'photo',
      tiles: tuiles({ couche: 'ORTHOIMAGERY.ORTHOPHOTOS2000-2005' }),
    },
    {
      id: 'photo-2011',
      titre: 'Vue aérienne',
      periode: '2011 - 2015',
      annee: 2013,
      zoomMax: 18,
      nature: 'photo',
      tiles: tuiles({ couche: 'ORTHOIMAGERY.ORTHOPHOTOS2011-2015' }),
    },
    {
      id: 'photo-2021',
      titre: 'Vue aérienne',
      periode: '2021 - 2023',
      annee: 2022,
      zoomMax: 19,
      nature: 'photo',
      tiles: tuiles({ couche: 'ORTHOIMAGERY.ORTHOPHOTOS2021-2023' }),
    },
    {
      id: 'aujourdhui',
      titre: "Aujourd'hui",
      periode: 'vue actuelle',
      annee: null,
      zoomMax: 19,
      nature: 'photo',
      tiles: tuiles({ couche: 'ORTHOIMAGERY.ORTHOPHOTOS' }),
    },
  ];

  /* La phrase du bandeau, calculée depuis l'époque choisie.
     Le présent n'a pas d'âge : « cette carte a 0 an » n'aurait aucun sens, la
     formule bascule. */
  function punchline(epoque, anneeCourante) {
    if (!epoque?.annee) return "Voilà votre commune aujourd'hui.\nÀ vous d'écrire la suite.";
    const ans = Math.max(1, anneeCourante - epoque.annee);
    return `Cette carte a ${ans} ans.\nÀ vous d'écrire la suite.`;
  }

  // Légendes proposées pour l'inscription du recto, dans l'ordre d'utilité
  function legendes(communeNom, epoque) {
    const nom = communeNom || 'Votre commune';
    if (!epoque) return [nom];
    const p = epoque.periode;
    return epoque.annee
      ? [
        `${nom}, ${p}`,
        `${nom} vue du ciel, ${p}`,
        `${nom}, il y a ${new Date().getFullYear() - epoque.annee} ans`,
        `Souvenir de ${nom}, ${p}`,
        nom,
      ]
      : [
        `${nom}, aujourd'hui`,
        `${nom} vue du ciel`,
        nom,
      ];
  }

  window.Epoques = { liste: EPOQUES, punchline, legendes };
})();
