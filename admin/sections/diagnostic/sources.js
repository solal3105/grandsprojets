/**
 * Diagnostic terrain - catalogue des sources de données.
 *
 * Une source est quelque chose qu'un chargé de mission reconnaît : des
 * signalements, le Baromètre vélo, Strava… Chaque entrée dit ce que c'est,
 * ce qu'elle demande (rien, un fichier, un compte) et ce que l'on verra.
 * Les modes :
 *  - internal : données de l'espace, chargées par une fonction interne
 *  - auto     : données publiques que nous allons chercher (FUB, OpenStreetMap)
 *  - file     : un export à déposer, reconnu par une recette (Strava Metro)
 *  - link     : un lien à coller, relu à chaque ouverture (Waze for Cities)
 *  - soon     : annoncée, pas encore disponible
 * Les phrases « what » ne promettent que ce que le dossier calcule vraiment
 * (dossier/model.js) : les rédiger à partir du code, pas de la source.
 * Le wizard complet (décrire soi-même un fichier) s'ouvre depuis la zone de
 * dépôt du catalogue, il n'est pas une source.
 * Le catalogue est technique (détection, recettes) ; il n'est propre à aucun
 * client. Ajouter une source = une entrée ici, une implémentation dans
 * sources/ le cas échéant.
 */

export const FAMILIES = [
  { key: 'habitants', label: 'Vos modules Open Projets' },
  { key: 'publiques', label: 'Données publiques sur votre territoire' },
  { key: 'compte', label: 'Données qui demandent un compte' },
];

export const SOURCES = [
  {
    id: 'participer',
    family: 'habitants',
    name: 'Signalements des habitants',
    description: 'Module Participer : ce que les habitants ont signalé depuis votre carte.',
    icon: 'fa-solid fa-comment-dots',
    tint: '#DC2626',
    mode: 'internal',
    internalKey: 'participer',
    sentence: 'Nous chargeons les signalements publiés par les habitants depuis votre carte. La couche reste synchronisée : un nouveau signalement apparaît ici sans rien faire.',
    what: [
      ['Pour chaque signalement', 'sa description, sa catégorie, son statut et sa date'],
      ['Dans l\'analyse', 'les signalements sont lus un par un et regroupés par sujet, avec leurs mots'],
    ],
  },
  {
    id: 'contributions',
    family: 'habitants',
    name: 'Projets publiés',
    description: 'Module Carte : les projets publiés sur votre carte.',
    icon: 'fa-solid fa-map-pin',
    tint: '#2563EB',
    mode: 'internal',
    internalKey: 'contributions',
    sentence: 'Nous chargeons les projets approuvés de votre carte. La couche reste synchronisée avec vos publications.',
    what: [
      ['Pour chaque projet', 'son nom, sa catégorie et sa description'],
      ['Dans l\'analyse', 'les projets présents dans la zone sont lus avec les autres témoignages'],
    ],
  },
  {
    id: 'travaux',
    family: 'habitants',
    name: 'Chantiers publiés',
    description: 'Module Travaux : tous vos chantiers publiés, terminés, en cours ou à venir.',
    icon: 'fa-solid fa-helmet-safety',
    tint: '#F59E0B',
    mode: 'internal',
    internalKey: 'travaux',
    sentence: 'Nous chargeons tous les chantiers publiés dans votre module Travaux, qu\'ils soient terminés, en cours ou à venir. La couche reste synchronisée avec vos déclarations.',
    what: [
      ['Pour chaque chantier', 'son nom, sa nature, son état, ses dates et sa description'],
      ['Dans l\'analyse', 'les chantiers présents dans la zone sont lus avec les autres témoignages, avec leur état et leurs dates'],
    ],
  },
  {
    id: 'fub',
    family: 'publiques',
    name: 'Baromètre vélo (FUB)',
    description: 'Lieux à améliorer et progrès constatés, signalés par les cyclistes.',
    icon: 'fa-solid fa-bicycle',
    tint: '#DC2626',
    mode: 'auto',
    sentence: 'Nous récupérons sur la plateforme open data de la FUB les contributions cartographiques du Baromètre vélo pour votre territoire. Chaque point marque un lieu désigné par un cycliste, avec son commentaire quand il en a laissé un.',
    what: [
      ['Jusqu\'à trois ensembles de points', 'les points à améliorer en priorité, les améliorations constatées et les souhaits de stationnement, selon ce que le Baromètre publie pour votre territoire'],
      ['Pour chaque point', 'le commentaire du cycliste, mot pour mot, quand il en a laissé un'],
      ['Dans l\'analyse', 'les commentaires sont lus comme des témoignages et regroupés par sujet'],
      ['Licence', 'Open Database Licence (ODbL), FUB'],
    ],
    credit: 'Baromètre vélo, FUB, licence ODbL',
    publicUrl: 'https://opendata.parlons-velo.fr/',
  },
  {
    id: 'osm-cycleways',
    family: 'publiques',
    name: 'Aménagements cyclables',
    description: 'Pistes, bandes et voies vertes, d\'après OpenStreetMap.',
    icon: 'fa-solid fa-road',
    tint: '#16A34A',
    mode: 'auto',
    sentence: 'Nous interrogeons OpenStreetMap pour les communes de votre territoire et gardons les voies qui portent un aménagement cyclable.',
    what: [
      ['Pour chaque tronçon', 'son type d\'aménagement, la rue, le sens et le revêtement'],
      ['Dans l\'analyse', 'la longueur aménagée dans la zone tracée, en kilomètres, au total et par type d\'aménagement'],
      ['Licence', 'ODbL, contributeurs OpenStreetMap'],
    ],
    credit: 'OpenStreetMap, licence ODbL',
    publicUrl: 'https://www.openstreetmap.org/',
  },
  {
    id: 'accidents',
    family: 'publiques',
    name: 'Accidents corporels',
    description: 'Fichier national de la sécurité routière, sur vos communes.',
    icon: 'fa-solid fa-triangle-exclamation',
    tint: '#F59E0B',
    mode: 'auto',
    sentence: 'Nous lisons le fichier national des accidents corporels (Observatoire de la sécurité routière, data.gouv.fr) et ne gardons que les accidents survenus sur les communes de votre territoire, avec leurs victimes et les véhicules impliqués.',
    what: [
      ['Pour chaque accident', 'sa date, son heure, sa gravité la plus élevée, le nombre de victimes et la présence d\'un vélo, d\'un piéton ou d\'un deux-roues motorisé'],
      ['Sur la carte', 'un point par accident, coloré selon la gravité'],
      ['Dans l\'analyse', 'Nous comptons les accidents de la zone tracée. À partir de cinq, nous donnons aussi les personnes tuées, les blessés hospitalisés et les accidents impliquant un vélo ou un piéton ; en dessous, nous décrivons chaque accident.'],
      ['Licence', 'Licence ouverte, Observatoire national interministériel de la sécurité routière'],
    ],
    credit: 'Fichier BAAC, ONISR, licence ouverte',
  },
  {
    id: 'comptages',
    family: 'publiques',
    name: 'Comptages vélo',
    description: 'Les compteurs de la plateforme nationale des fréquentations.',
    icon: 'fa-solid fa-hashtag',
    tint: '#0F766E',
    mode: 'auto',
    sentence: 'Nous lisons les pages publiques Eco-Compteur qui couvrent votre territoire, celle de la plateforme nationale des fréquentations et celles des observatoires locaux, et gardons les compteurs situés dans vos communes, avec les chiffres publiés le jour de l\'ajout.',
    what: [
      ['Pour chaque compteur', 'ce qu\'il compte (vélos, piétons ou les deux), sa moyenne journalière de passages, les passages de la veille du relevé, le total depuis sa pose et sa date d\'installation'],
      ['Sur la carte', 'un point par compteur, plus gros et plus rouge quand sa moyenne journalière est élevée'],
      ['Dans l\'analyse', 'Nous donnons la moyenne journalière de chaque compteur de la zone tracée, compteur par compteur : les passages de plusieurs compteurs ne sont jamais additionnés.'],
      ['Source', 'Les chiffres viennent des pages publiques Eco-Compteur des gestionnaires de compteurs, tels qu\'ils sont publiés le jour où vous ajoutez la source.'],
    ],
    credit: 'Compteurs publics Eco-Compteur, plateforme nationale des fréquentations',
  },
  {
    id: 'strava',
    family: 'compte',
    name: 'Flux cyclistes Strava Metro',
    description: 'Les passages de cyclistes rue par rue, comptés par Strava.',
    icon: 'fa-solid fa-fire',
    tint: '#DC2626',
    mode: 'file',
    recipeId: 'strava-metro-edges',
    sentence: 'Strava Metro compte les passages de cyclistes rue par rue à partir des trajets enregistrés par les utilisateurs de l\'application. L\'accès est gratuit pour les collectivités ; une fois l\'export téléchargé, déposez-le tel quel.',
    tutorial: [
      { title: 'Demandez l\'accès', text: 'Remplissez le formulaire avec votre adresse professionnelle. La réponse arrive en général sous une semaine.', link: 'https://metroview.strava.com/application', linkLabel: 'metroview.strava.com' },
      { title: 'Dessinez votre territoire', text: 'Dans Metroview, sélectionnez la zone qui vous intéresse, l\'activité « vélo » et les années voulues.' },
      { title: 'Téléchargez l\'export', text: 'Cliquez sur « Download » et gardez l\'archive telle quelle : inutile de la décompresser.' },
    ],
    what: [
      ['Sur la carte', 'une carte de chaleur des passages, du bleu au rouge'],
      ['Dans chaque zone', 'Nous donnons le tronçon le plus emprunté, sa moyenne de passages par jour et le nombre de tronçons. Les passages de plusieurs tronçons ne sont jamais additionnés.'],
      ['Licence', 'Ces données sont réservées à votre collectivité (conditions Strava Metro). Le fichier enregistré reste privé : seuls les administrateurs de votre espace et l\'équipe Open Projets peuvent le lire.'],
    ],
    dropHint: 'Déposez l\'archive téléchargée depuis Metroview, ou son dossier décompressé.',
  },
  {
    id: 'waze',
    family: 'compte',
    name: 'Alertes et bouchons Waze',
    description: 'Le flux Waze for Cities de votre collectivité.',
    icon: 'fa-solid fa-car',
    tint: '#0EA5E9',
    mode: 'link',
    sentence: 'Waze partage avec les collectivités partenaires un flux de ce que ses conducteurs signalent et subissent en temps réel. Collez le lien de votre flux : nous en faisons deux couches, les alertes et les ralentissements, relues à chaque ouverture du diagnostic.',
    tutorial: [
      { title: 'Rejoignez Waze for Cities', text: 'Le programme est gratuit pour les collectivités.', link: 'https://www.waze.com/wazeforcities', linkLabel: 'waze.com/wazeforcities' },
      { title: 'Récupérez le lien du flux', text: 'Dans le PartnerHub, section Toolbox, copiez l\'adresse complète de votre flux de données (format JSON).' },
      { title: 'Collez-le ci-dessous', text: 'Nous vérifions le lien et comptons ce qu\'il contient avant d\'ajouter les couches.' },
    ],
    what: [
      ['Alertes', 'accidents, dangers, routes fermées, embouteillages signalés par les conducteurs, avec la rue et le nombre de confirmations'],
      ['Ralentissements', 'Les tronçons ralentis s\'affichent avec leur vitesse, leur retard et leur longueur, colorés du bleu au rouge selon le retard. Une circulation bloquée est signalée comme telle.'],
      ['Dans l\'analyse', 'Nous donnons le total des confirmations des alertes, ainsi que le retard moyen et la vitesse moyenne des ralentissements de la zone tracée, tels qu\'au moment où vous ouvrez le diagnostic.'],
      ['Licence', 'Ces données sont réservées à votre collectivité (accord Waze for Cities), et le lien n\'est jamais partagé.'],
    ],
    linkPlaceholder: 'https://www.waze.com/partnerhub-api/partners/…/waze-feeds/…?format=JSON',
  },
];

export const sourceById = (id) => SOURCES.find((s) => s.id === id) || null;

/** Source d'une couche existante, si elle vient du catalogue. */
export function sourceOfLayer(layer) {
  if (layer?.source_type === 'internal') return SOURCES.find((s) => s.mode === 'internal' && s.internalKey === layer.source_ref) || null;
  return layer?.popup?.source ? sourceById(layer.popup.source) : null;
}
