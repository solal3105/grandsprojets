import { Map as MapIcon, HardHat, Megaphone, ScanSearch } from 'lucide-vue-next'
import { spaceUrl } from '@/data/siteUrls.js'

/* Les quatre modules de la plateforme.
 *
 * Source unique : l'accueil, la page /modules et les pages /modules/:key lisent
 * toutes ce fichier. Chaque affirmation ici doit etre verifiable dans le code
 * du produit : une vitrine qui promet ce que le produit ne fait pas se retourne
 * contre nous au premier rendez-vous.
 *
 * `side` porte la distinction structurante : trois modules produisent une page
 * que l'habitant consulte, le quatrieme un rapport que seule l'equipe utilise.
 *
 * Les classes Tailwind sont ecrites en toutes lettres : le scanner ne sait pas
 * reconstruire `text-${accent}`. */

export const SIDE_PUBLIC = 'habitants'
export const SIDE_INTERNAL = 'collectivite'

export const modules = [
  {
    key: 'carte',
    name: 'Carte des projets',
    short: 'Carte',
    side: SIDE_PUBLIC,
    icon: MapIcon,
    teinte: '#FF0037',
    tone: { text: 'text-primary-ink', bg: 'bg-primary-10', dot: 'bg-primary', line: 'border-primary' },
    live: { url: spaceUrl('default', 'carte'), label: 'Ouvrir un espace en service' },
    showcase: 'carte',
    h1: "Vos projets d'aménagement deviennent une carte que vos habitants consultent",
    tagline: "Chaque projet a sa fiche publique, avec sa propre adresse, référencée sur les moteurs de recherche.",
    titres: { habitant: "Vos habitants trouvent un projet, et repartent avec son adresse", agent: "Votre agent publie un projet en trois champs", details: "La fiche projet fait le gros du travail", combine: "Il travaille avec les trois autres modules" },
    problem: "Vos projets existent dans des délibérations et des PDF. Vos habitants ne les trouvent pas.",
    produces: "Une carte publique, sans compte ni application. Chaque projet a sa fiche, avec sa propre adresse, référencée sur les moteurs de recherche.",
    habitant: [
      'Une navigation à trois niveaux : les modules, vos catégories, puis les projets en cartes illustrées',
      "La fiche d'un projet : photo, description, article illustré, carte de localisation, sommaire automatique, documents PDF et lien vers votre page officielle",
      'Huit fonds de carte, dont le satellite et deux orthophotos historiques qui montrent le même quartier en 1960 et en 1980',
      'Un mode relief avec les bâtiments à leur hauteur réelle, et un mode sombre qui suit le réglage de son téléphone',
      "Une recherche d'adresse sur la Base Adresse Nationale, et une géolocalisation qui affiche son cercle de précision réel",
    ],
    agent: "Trois champs suffisent à créer un projet : le nom, la catégorie et le tracé. Le reste enrichit la fiche quand vous avez le temps.",
    etapes: [
      { titre: 'Vous nommez le projet et choisissez sa catégorie', texte: 'Les catégories sont les vôtres, avec vos icônes et vos couleurs, définies une fois pour toutes.' },
      { titre: 'Vous dessinez ou vous importez le tracé', texte: 'Point, ligne ou zone, cumulables dans un même projet. Ou un fichier GeoJSON déposé par glisser-déposer.' },
      { titre: 'Vous rédigez', texte: "Un éditeur en français, sans syntaxe à apprendre. Un assistant peut proposer un premier jet en citant ses sources, et n'insère jamais rien sans votre accord." },
      { titre: 'Vous publiez', texte: "Un administrateur publie directement. La contribution d'un agent attend validation, et c'est la base de données qui l'impose, pas seulement l'écran." },
    ],
    settings: [
      'Vos catégories : nom, icône, couleur, épaisseur et style du tracé, remplissage, ordre par glisser-déposer',
      'Votre identité : nom affiché, logo clair, logo sombre, favicon, couleur principale, fond de carte par défaut',
      "Neuf contrôles de l'interface publique, que vous activez ou masquez un par un",
      'Vos agents et leurs rôles, par invitation email, sans mot de passe à gérer',
    ],
    details: [
      {
        titre: 'La fiche projet',
        texte: "C'est la page que vos habitants partagent et que les moteurs de recherche indexent. Elle a sa propre adresse, lisible et stable.",
        points: [
          'Photo, description, article illustré, et un sommaire qui se construit tout seul',
          'La carte du projet en fond, inclinée et en rotation lente',
          'Vos documents de concertation en PDF, consultables en ligne',
          'Les autres projets de la même catégorie, en fin de page',
        ],
      },
      {
        titre: 'Le référencement',
        texte: 'Chaque fiche est rendue côté serveur, donc lisible par un moteur même si le navigateur du visiteur ne charge aucun script.',
        points: [
          'Titre, description, aperçu de partage et données structurées générés par projet',
          "Une page d'atterrissage par collectivité, qui liste et filtre tous vos projets",
          'Un plan de site régénéré en continu, avec les photos de vos projets',
        ],
      },
      {
        titre: 'Les images',
        texte: "Déposez la photo telle qu'elle sort du téléphone : elle est redimensionnée, convertie et réorientée automatiquement. Si la compression devait dégrader le résultat, l'originale est conservée.",
      },
      {
        titre: 'La volumétrie',
        texte: "La carte charge jusqu'à mille projets par espace. Au-delà, c'est une conversation à avoir avec nous, pas un réglage.",
      },
    ],
    linkedTo: "Vos projets ne vivent pas seuls : ils partagent la carte avec les autres modules, et le Diagnostic sait les relire.",
    synergies: [
      { vers: 'participer', texte: "Les signalements de vos habitants s'affichent par-dessus vos projets, sur la même carte. Les deux couches coexistent, aucune ne remplace l'autre." },
      { vers: 'travaux', texte: "Les chantiers ont volontairement leur propre vue : un projet à dix ans et une rue barrée trois semaines ne se lisent pas de la même façon." },
      { vers: 'diagnostic', texte: "Vos projets publiés font partie des deux sources que le Diagnostic sait charger d'un clic, sans rien configurer." },
    ],
  },
  {
    key: 'travaux',
    name: 'Travaux du quotidien',
    short: 'Travaux',
    side: SIDE_PUBLIC,
    icon: HardHat,
    teinte: '#F2B327',
    tone: { text: 'text-amber-ink', bg: 'bg-amber/15', dot: 'bg-amber', line: 'border-amber' },
    live: { url: spaceUrl('default', 'travaux'), label: 'Ouvrir un espace en service' },
    showcase: 'travaux',
    h1: "Vos riverains savent enfin quand la rue rouvre",
    tagline: "Chaque chantier affiche son emprise, ses dates et son avancement, sans que personne n'appelle la mairie.",
    titres: { habitant: "Vos riverains remontent le temps avec un curseur", agent: "Votre agent ouvre un chantier avec un nom et un tracé", details: "Deux choix structurent le module", combine: "Il travaille avec les trois autres modules" },
    problem: "Vos services savent quand la rue rouvre. Les riverains, non. Alors ils appellent l'accueil.",
    produces: "Un espace distinct de la carte des projets : emprise, dates, état, et une chronologie que le riverain manipule lui-même.",
    habitant: [
      "Une chronologie qu'il fait glisser jour par jour : à chaque date, le nombre de chantiers ouverts et lesquels",
      "Un histogramme de la charge de chantiers sur la période, les pics et les creux d'un coup d'oeil",
      'Trois filtres croisables, nature des travaux, localisation et état, avec le nombre de chantiers par valeur',
      "La fiche d'un chantier : nature, état, dates de début et de fin, durée, description et adresses concernées",
      "L'emprise tracée sur la carte, dont la couleur évolue du rouge au vert au fil du calendrier",
    ],
    agent: "Un nom suffit pour créer un chantier. L'emprise se dessine directement sur la carte, en point, en ligne ou en zone, et vous pouvez en cumuler plusieurs sur un même chantier.",
    etapes: [
      { titre: 'Vous nommez le chantier', texte: 'Le seul champ obligatoire. Nature, adresse et description viennent ensuite, en texte libre.' },
      { titre: "Vous dessinez l'emprise", texte: "Point, ligne ou zone sur la carte, ou dépôt d'un fichier GeoJSON si vous en avez déjà un." },
      { titre: "Vous renseignez l'état et les dates", texte: 'En cours, Prévu, Terminé ou À venir. Les dates alimentent la chronologie et la couleur du tracé.' },
      { titre: 'Vous publiez', texte: "Un administrateur publie directement. La proposition d'un agent attend validation, et c'est la base de données qui l'impose, pas seulement l'écran." },
    ],
    settings: [
      "L'activation du module, ville par ville, sans intervention technique",
      'La source des données : saisie par vos agents, ou un flux GeoJSON externe',
      "L'icône du bouton et celle des chantiers",
      'Les couches de contexte affichées en même temps que le module',
    ],
    details: [
      {
        titre: 'Deux sources, au choix',
        texte: "Soit vos agents saisissent, soit vous branchez un flux GeoJSON existant. C'est l'un ou l'autre, jamais les deux, et le retour en arrière ne détruit rien : les chantiers saisis réapparaissent tels quels.",
        points: [
          'En saisie : circuit de validation, icône et description par chantier, données allégées et mises en cache',
          "En flux : mise à jour automatique, mais aucun circuit de validation et seuls les champs du standard sont exploités",
        ],
      },
      {
        titre: 'Le circuit de validation',
        texte: "Il est appliqué par la base, pas par l'interface : un compte non administrateur ne peut pas publier sans validation, même en contournant le navigateur.",
        points: [
          "L'administrateur voit le nombre de chantiers en attente sur son bouton",
          'Il valide ou supprime depuis la carte publique comme depuis le back-office',
          "Chaque écriture est vérifiée contre le périmètre de villes du compte",
        ],
      },
      {
        titre: 'La géométrie',
        texte: "Un chantier peut être un point, une ligne ou une zone, et cumuler plusieurs objets. Les tracés se colorent selon l'avancement du calendrier, sans avoir à ouvrir la fiche.",
      },
      {
        titre: 'La fraîcheur',
        texte: "Un chantier validé apparaît en quelques minutes pour un nouveau visiteur. Pour un onglet resté ouvert, comptez jusqu'à une heure.",
      },
    ],
    linkedTo: "Le module tient debout seul, mais il prend son sens avec les autres.",
    synergies: [
      { vers: 'carte', texte: "La vue des chantiers est séparée de celle des projets, et c'est délibéré : entrer dans Travaux nettoie la carte pour ne laisser que ce qui gêne aujourd'hui." },
      { vers: 'diagnostic', texte: "Vos chantiers sont l'une des deux sources que le Diagnostic charge d'un clic : vous pouvez analyser un secteur en tenant compte de ce qui y est ouvert." },
      { vers: 'participer', texte: "Un habitant qui signale un problème sur un chantier dépose au même endroit, sur la même carte." },
    ],
  },
  {
    key: 'participer',
    name: 'Participer',
    short: 'Participer',
    side: SIDE_PUBLIC,
    icon: Megaphone,
    teinte: '#5AAB7D',
    tone: { text: 'text-green-ink', bg: 'bg-green/15', dot: 'bg-green', line: 'border-green' },
    live: { url: spaceUrl('villedelyon', 'participer'), label: 'Ouvrir un espace en service' },
    showcase: 'participer',
    h1: "Vos habitants vous signalent ce qui ne va pas, et suivent votre réponse",
    tagline: "Un habitant dépose en deux minutes sans créer de compte, vous décidez de ce qui devient public.",
    titres: { habitant: "Vos habitants déposent, puis suivent leur signalement", agent: "Votre équipe traite les signalements dans une file", details: "La protection des données porte le module", combine: "Il travaille avec les trois autres modules" },
    problem: "Les besoins remontent par mail, par téléphone, en réunion. Rien n'est consolidé, et le déposant ne sait jamais ce qu'est devenue sa demande.",
    produces: "Un formulaire géolocalisé, la carte des signalements publiés et leur avancement, et un lien de suivi personnel pour chaque déposant.",
    habitant: [
      'Un formulaire en quatre temps : où, quoi, précisions, email. Trois champs obligatoires, aucun compte à créer',
      'La carte des signalements publiés, filtrable par statut',
      "Le détail d'un signalement : photo, description, adresse, et la frise de son traitement",
      "Une page de suivi personnelle, atteinte par un lien reçu par email, qui montre aussi ce qui n'est pas encore publié",
      'Un bouton de demande de retrait sur chaque signalement publié, ouvert à toute personne concernée',
    ],
    agent: "Vos agents traitent les signalements dans une file à quatre onglets, avec recherche et export. Un contributeur fait avancer les dossiers, un administrateur seul décide de ce qui devient public.",
    etapes: [
      { titre: "L'habitant dépose", texte: "Un point sur la carte, une catégorie, une adresse email. La photo est ré-encodée sur son téléphone, métadonnées supprimées, avant tout envoi." },
      { titre: 'Il confirme par email', texte: "Tant qu'il n'a pas cliqué, le signalement n'existe pour personne. Sans confirmation, il est détruit au bout de sept jours, photo comprise." },
      { titre: 'Votre équipe traite', texte: "Changement de statut, message à l'habitant, rapprochement des doublons. Le rejet exige un motif écrit et le niveau administrateur." },
      { titre: 'Un administrateur publie', texte: "Rien n'apparaît sur la carte sans cette décision. Une liste de vérification s'affiche avant : visages, plaques, données personnelles." },
    ],
    settings: [
      'Vos catégories : libellé, icône, couleur, ordre et texte d\'aide',
      'Les mots et les couleurs de chaque statut, et si son application prévient l\'habitant',
      'Les textes du formulaire et du message de confirmation',
      'La durée de conservation des données personnelles, de 1 à 60 mois',
      'Les quotas anti-abus et le délai du rappel à votre équipe',
      'La suspension des dépôts en un clic, avec votre propre message',
    ],
    details: [
      {
        titre: "Ce que devient l'adresse email",
        texte: "C'est la seule donnée personnelle demandée, et elle n'atteint jamais un navigateur.",
        points: [
          'Ni le public, ni vos agents ne peuvent la lire : la base elle-même refuse de la servir',
          "Elle ne figure dans aucun export : le fichier tableur circule, les données personnelles n'y ont pas leur place",
          "Elle est effacée automatiquement après le délai que vous avez fixé, avec l'empreinte de connexion",
          "Le formulaire annonce à l'habitant le délai que vous avez réglé, pas une valeur générique",
        ],
      },
      {
        titre: 'Les photos',
        points: [
          "Métadonnées supprimées sur l'appareil de l'habitant : l'original ne quitte jamais son téléphone",
          'Stockées dans un espace privé, servies par des liens signés valables dix minutes',
          "Une copie publique n'est créée qu'à la publication, et détruite au retrait",
        ],
      },
      {
        titre: 'Contre le module fantôme',
        texte: "Si des signalements stagnent au-delà du délai que vous avez fixé, votre équipe reçoit un rappel automatique. Un dispositif de participation qui ne répond plus fait plus de mal que pas de dispositif du tout.",
      },
      {
        titre: 'La trace',
        texte: "Chaque geste est horodaté et nominatif : dépôt, changement de statut, message, publication, retrait. La trace d'une suppression survit à la disparition du signalement.",
      },
    ],
    linkedTo: "Ce que vos habitants remontent ne reste pas dans une boîte à part.",
    synergies: [
      { vers: 'carte', texte: "Les signalements se superposent à vos projets sur la même carte : un habitant voit du même coup ce qu'il signale et ce que vous préparez." },
      { vers: 'diagnostic', texte: "Le Diagnostic ne charge pas les signalements d'un clic comme les projets et les chantiers, mais ceux qui sont publiés s'exposent en données ouvertes : on les lui ajoute comme n'importe quelle autre couche." },
      { vers: 'travaux', texte: "Un signalement qui concerne un chantier en cours se dépose sur la même carte que lui." },
    ],
  },
  {
    key: 'diagnostic',
    name: 'Diagnostic terrain',
    short: 'Diagnostic',
    side: SIDE_INTERNAL,
    icon: ScanSearch,
    teinte: '#0E7C86',
    tone: { text: 'text-teal', bg: 'bg-teal/10', dot: 'bg-teal', line: 'border-teal' },
    live: null,
    showcase: 'diagnostic',
    h1: "Vous entourez une zone, et vous savez ce que disent tous ses relevés",
    tagline: "L'IA lit chaque point de la zone et vous en rend une synthèse sourcée, source par source.",
    titres: { habitant: "Votre équipe reçoit une restitution, pas un avis", agent: "Vous branchez vos sources, puis vous entourez", details: "Trois points méritent d'être précisés", combine: "Il travaille avec les trois autres modules" },
    problem: "Des centaines de points sur un secteur. Personne n'a le temps de tout lire avant l'arbitrage.",
    produces: "Une synthèse source par source, où chaque ligne cite les points dont elle vient. Aucune note, aucun classement, aucune recommandation.",
    habitant: [
      'La composition de la zone : combien de points, de quelles sources, dans quelles proportions',
      'Une synthèse par source, et sous chacune les sujets qui y reviennent',
      'Chaque sujet renvoie aux points qui le justifient et cite leur texte mot pour mot',
      'Une annexe reprenant chaque point cité, tel qu\'il figure dans vos données',
      'Un rapport exportable en PDF, plan de la zone en couverture',
    ],
    agent: "Vous entourez une zone à main levée sur la carte, ou en maintenant la touche Maj. Seuls les points qui s'y trouvent sont analysés.",
    etapes: [
      { titre: 'Vous branchez vos sources', texte: "Un fichier GeoJSON ou CSV, un lien vers une API, ou vos propres données Open Projets : les projets publiés et les chantiers se chargent d'un clic." },
      { titre: 'Vous entourez une zone', texte: 'Le compteur de points se met à jour pendant le tracé, avant même de lancer quoi que ce soit.' },
      { titre: 'Vous lancez l\'analyse', texte: 'Tous les points de la zone sont lus, sans échantillonnage. Masquer une couche recalcule la sélection aussitôt.' },
      { titre: 'Vous générez le rapport', texte: "Il s'enregistre dans l'historique de la collectivité et s'exporte en PDF." },
    ],
    settings: [
      'Vos couches : fichier déposé, lien vers une API, ou vos projets et chantiers Open Projets en un clic',
      'Le style de chaque couche : couleur unique, ou une couleur par catégorie',
      'Le contenu des infobulles : quel champ en titre, quels champs affichés',
      'Une heatmap de densité et les bâtiments en relief, activables',
      "Rien n'apparaît côté public : le module est réservé à votre équipe",
    ],
    details: [
      {
        titre: 'Ce qui est calculé, ce qui est rédigé',
        texte: "La distinction compte pour un document qui sert à arbitrer.",
        points: [
          'Calculés à partir de vos données : le nombre de points, la répartition par source, les pourcentages, le nombre de points rattachés à chaque sujet',
          "Rédigés par le modèle : la vue d'ensemble, la synthèse de chaque source, l'intitulé des sujets",
          'Recopiées mot pour mot : les citations, sans correction ni reformulation',
        ],
      },
      {
        titre: 'Le plafond de 300 points',
        texte: "L'analyse lit l'intégralité des points de la zone, jamais un échantillon. C'est la raison du plafond : au-delà, resserrez la zone ou masquez une couche, le décompte se met à jour aussitôt.",
      },
      {
        titre: 'Ce que contient le rapport',
        points: [
          'Une couverture avec le plan de la zone analysée',
          'Quatre indicateurs : points lus, sources, sujets relevés, emprise',
          'La composition de la zone, puis la restitution source par source',
          "L'annexe des points cités, et une note de méthode et de limites",
        ],
      },
      {
        titre: "L'historique",
        texte: "Chaque diagnostic généré est conservé pour la collectivité et se rouvre depuis l'historique.",
      },
    ],
    linkedTo: "Le Diagnostic ne produit rien tout seul : il relit ce que les autres modules ont déjà recueilli.",
    synergies: [
      { vers: 'carte', texte: "Vos projets publiés se chargent d'un clic, sous le nom « Projets publiés ». Aucune configuration, aucun lien à copier." },
      { vers: 'travaux', texte: "Vos chantiers aussi, sous le nom « Travaux en cours », avec leur nature et leur état." },
      { vers: 'participer', texte: "Les signalements publiés ne sont pas dans ce raccourci, mais ils s'exposent en données ouvertes : on les ajoute par lien, comme une source externe." },
    ],
  },
]

export const moduleByKey = Object.fromEntries(modules.map((m) => [m.key, m]))
export const publicModules = modules.filter((m) => m.side === SIDE_PUBLIC)
export const internalModules = modules.filter((m) => m.side === SIDE_INTERNAL)
