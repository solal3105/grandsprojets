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
 *  - soon     : annoncée, pas encore disponible
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
    name: 'Travaux en cours',
    description: 'Module Travaux : les chantiers que vous avez déclarés.',
    icon: 'fa-solid fa-helmet-safety',
    tint: '#F59E0B',
    mode: 'internal',
    internalKey: 'travaux',
    sentence: 'Nous chargeons les chantiers de votre module Travaux. La couche reste synchronisée avec vos déclarations.',
    what: [
      ['Pour chaque chantier', 'son nom, sa nature, son état et sa description'],
      ['Dans l\'analyse', 'les chantiers présents dans la zone sont lus avec les autres témoignages'],
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
    sentence: 'Nous récupérons sur la plateforme open data de la FUB les contributions cartographiques du Baromètre vélo pour votre territoire : chaque point porte le commentaire laissé par le cycliste.',
    what: [
      ['Trois couches', 'points à améliorer en priorité, améliorations constatées, souhaits de stationnement'],
      ['Pour chaque point', 'le commentaire du cycliste, mot pour mot'],
      ['Dans l\'analyse', 'ces commentaires sont lus comme des témoignages et regroupés par sujet'],
      ['Licence', 'Open Database Licence (ODbL), FUB'],
    ],
    credit: 'Baromètre vélo, FUB, licence ODbL',
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
      ['Dans l\'analyse', 'le nombre de tronçons aménagés dans la zone, comme donnée de référence'],
      ['Licence', 'ODbL, contributeurs OpenStreetMap'],
    ],
    credit: 'OpenStreetMap, licence ODbL',
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
      ['Pour chaque accident', 'date, heure, gravité la plus élevée, nombre de victimes, présence d\'un vélo, d\'un piéton, d\'un deux-roues motorisé'],
      ['Sur la carte', 'un point par accident, coloré selon la gravité'],
      ['Dans l\'analyse', 'le nombre d\'accidents, de tués et de blessés dans chaque zone tracée, comme données de référence'],
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
    sentence: 'Nous lisons les pages publiques Eco-Compteur qui couvrent votre territoire, celle de la plateforme nationale des fréquentations et celles des observatoires locaux, et gardons les compteurs situés dans vos communes, avec leurs derniers chiffres.',
    what: [
      ['Pour chaque compteur', 'sa moyenne journalière de passages, le passage de la veille, le total depuis sa pose et sa date d\'installation'],
      ['Sur la carte', 'un point par compteur, d\'autant plus gros et chaud qu\'il voit passer de monde'],
      ['Dans l\'analyse', 'les passages journaliers cumulés des compteurs de la zone tracée, comme données de référence'],
      ['Source', 'pages publiques Eco-Visio des gestionnaires de compteurs ; les chiffres sont ceux affichés publiquement'],
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
      ['Dans chaque zone', 'le total des passages, la part de vélos électriques et la vitesse moyenne'],
      ['Licence', 'données réservées à votre collectivité (conditions Strava Metro)'],
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
      ['Ralentissements', 'tronçons ralentis avec vitesse, retard et longueur, en carte de chaleur'],
      ['Dans l\'analyse', 'le nombre d\'alertes et le retard moyen dans chaque zone tracée, comme données de référence'],
      ['Licence', 'données réservées à votre collectivité (accord Waze for Cities) ; le lien n\'est jamais partagé'],
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
