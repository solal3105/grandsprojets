import { Map as MapIcon, HardHat, ClipboardCheck, Megaphone, ScanSearch } from 'lucide-vue-next'
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

/* Chantiers est un module de la suite au meme titre que les autres, mais son
 * espace de travail est servi par un autre domaine. L'adresse vit donc ici,
 * avec le module qui s'en sert, et nulle part ailleurs. */
export const CHANTIERS_URL = 'https://openprojets-chantiers.com/'
export const ARRETE_URL = 'https://openprojets-chantiers.com/arrete/'
/* L'espace de travail lui-meme. Son ecran d'accueil porte « Essayer la démo » :
 * sans compte, avec un jeu de donnees deja rempli, et rien qui sorte de
 * l'appareil du visiteur. C'est ce que la vitrine embarque. */
export const CHANTIERS_APP_URL = 'https://openprojets-chantiers.com/app/'

/* Les noms, arrêtés le 10 septembre 2026 : `name` est le nom complet (titres
 * de page, menus, document d'estimation, messages), `short` le nom d'usage
 * (boutons, pastilles étroites, phrases qui renvoient d'un module à l'autre).
 * La clé `participer` reste l'adresse du module Signalement : les liens déjà
 * partagés continuent de fonctionner. */
export const modules = [
  {
    key: 'carte',
    forme: 'cercle',
    name: 'Carte des projets urbains',
    short: 'Carte',
    side: SIDE_PUBLIC,
    icon: MapIcon,
    teinte: '#C4002A',
    tone: { text: 'text-mod-carte', bg: 'bg-mod-carte-soft', socle: 'bg-mod-carte' },
    capture: {
      src: 'img/modules/carte.jpg',
      largeur: 1800,
      hauteur: 1125,
      alt: "La carte de la Métropole de Lyon ouverte sur la catégorie urbanisme : les projets en cartes illustrées à gauche, l'emprise de l'un d'eux tracée sur la carte.",
    },
    live: { url: spaceUrl('default', 'carte'), label: 'Ouvrir un espace en service' },
    showcase: 'carte',
    h1: "Vos projets d'aménagement deviennent une carte que vos habitants consultent",
    tagline: "Chaque projet a sa fiche publique, avec sa propre adresse, référencée sur les moteurs de recherche.",
    titres: { combine: "Ce module travaille avec les autres" },
    problem: "Vos projets existent dans des délibérations et des PDF. Vos habitants ne les trouvent pas.",
    produces: "Vous publiez une carte que vos habitants consultent sans compte ni application. Chaque projet y a sa fiche, avec sa propre adresse, référencée sur les moteurs de recherche.",
    /* Les fonctions du module, une par planche, chacune montree par une
     * capture prise sur l'espace de demonstration. Ce que la page ne peut pas
     * montrer, elle ne le raconte pas : ces affirmations sont toutes visibles
     * a l'ecran d'a cote. */
    features: [
      {
        titre: "Vos habitants trouvent un projet sans qu'on leur explique",
        texte: "La navigation tient en trois niveaux : les modules, puis vos catégories, puis les projets en cartes illustrées. Un clic sur une carte, et l'emprise s'affiche sur le plan.",
        points: [
          "Vos catégories portent vos icônes et vos couleurs, que vous définissez une fois pour toutes.",
          "Chaque projet apparaît en carte illustrée, avec sa photo.",
          "Le tracé d'un projet est un point, une ligne ou une zone, selon ce qu'il est sur le terrain.",
        ],
        capture: {
          src: 'img/modules/carte/navigation.jpg', largeur: 1800, hauteur: 1125,
          alt: "La carte ouverte sur la catégorie urbanisme : les projets en cartes illustrées à gauche, l'emprise de l'un d'eux tracée sur le plan.",
        },
      },
      {
        titre: 'Chaque projet a sa page, avec sa propre adresse',
        texte: "C'est la page que vos habitants partagent et que les moteurs de recherche indexent. Elle est rendue côté serveur, donc lisible même par un navigateur qui ne charge aucun script.",
        points: [
          "La page porte la photo, la description et l'article illustré, et son sommaire se construit tout seul.",
          "Vos documents de concertation en PDF se consultent en ligne, sans téléchargement.",
          "La fin de page propose les autres projets de la même catégorie.",
        ],
        capture: {
          src: 'img/modules/carte/fiche.jpg', largeur: 1800, hauteur: 1125,
          alt: "La fiche d'un projet : sa photo, son titre, sa description, et la carte de sa localisation en fond.",
        },
      },
      {
        titre: "Le fond de carte se change, jusqu'aux photos aériennes de 1960 et 1980",
        texte: "Le plan, le satellite, et deux photographies aériennes qui montrent le même quartier en 1960 et en 1980. De quoi expliquer un projet en montrant ce qu'il y avait avant.",
        points: [
          "Huit fonds sont disponibles : claire, sombre, couleur, bleu nuit, satellite, 1960, 1980 et transports.",
          "Vous réglez le fond par défaut de votre espace, et le visiteur en change quand il veut.",
        ],
        capture: {
          src: 'img/modules/carte/fonds.jpg', largeur: 1800, hauteur: 1125,
          alt: 'Le sélecteur de fond de carte ouvert, avec ses vignettes.',
        },
      },
      {
        titre: 'Un bouton passe la carte en relief, et les bâtiments sortent à leur hauteur réelle',
        texte: "Un bouton bascule la carte en relief : le terrain prend son épaisseur et les bâtiments sortent du plan, à la hauteur qu'ils ont vraiment. Un projet de tour ou de percée se comprend d'un coup d'oeil.",
        points: [
          "Un seul bouton commande le relief du terrain comme celui des bâtiments.",
          "La carte se tourne et s'incline, et la boussole la ramène au nord.",
        ],
        capture: {
          src: 'img/modules/carte/relief.jpg', largeur: 1800, hauteur: 1125,
          alt: 'Un quartier vu en relief : les bâtiments sortent du plan à leur hauteur réelle.',
        },
      },
      {
        titre: "La carte passe en sombre quand le téléphone du visiteur l'est",
        texte: "La carte bascule d'elle-même si le visiteur a réglé son téléphone en sombre, et il peut forcer l'un ou l'autre depuis la barre latérale.",
        points: [
          "Votre logo sombre prend le relais du logo clair.",
          "Le fond de carte bascule lui aussi, pas seulement l'interface autour.",
        ],
        capture: {
          src: 'img/modules/carte/sombre.jpg', largeur: 1800, hauteur: 1125,
          alt: 'La même carte en mode sombre, fond de plan compris.',
        },
      },
      {
        titre: 'Le visiteur cherche une adresse ou se situe sur la carte',
        texte: "La recherche interroge la Base Adresse Nationale, le référentiel public des adresses françaises. La géolocalisation, elle, affiche le cercle de précision réel plutôt qu'un point qui ment.",
        points: [
          "La recherche s'appuie sur la Base Adresse Nationale, le référentiel public des adresses.",
          "La position affiche son cercle de précision réel, sans faire croire à mieux.",
        ],
        capture: {
          src: 'img/modules/carte/recherche.jpg', largeur: 1800, hauteur: 1125,
          alt: "La recherche d'adresse ouverte, avec ses propositions sous le champ.",
        },
      },
      {
        titre: 'Vos projets tiennent dans une liste, pas dans un tableur',
        texte: "Tous les projets de votre espace au même endroit, avec leur vignette, leur catégorie, leur date et leur état. Vous cherchez, vous filtrez, vous triez.",
        points: [
          "Trois onglets séparent toutes les contributions, celles en attente et celles approuvées.",
          "Une recherche, un filtre par catégorie et un tri surmontent la liste.",
        ],
        capture: {
          src: 'img/modules/carte/gestion.jpg', largeur: 1800, hauteur: 1125,
          alt: "La liste des projets d'un espace dans l'administration, avec leur vignette, leur catégorie et leur état.",
        },
      },
      {
        titre: 'Un projet se crée avec trois champs',
        texte: "Un projet demande son nom, sa catégorie et son tracé. Tout le reste est marqué facultatif et s'ajoute quand vous avez le temps.",
        points: [
          "La catégorie détermine l'icône et la couleur du projet sur la carte",
          'Description, image de couverture et documents viennent après, ou jamais',
        ],
        capture: {
          src: 'img/modules/carte/creation.jpg', largeur: 1800, hauteur: 1125,
          alt: "Le formulaire de création d'un projet : son nom, ses catégories en pastilles, sa description courte.",
        },
      },
      {
        titre: 'Un assistant écrit le premier jet, vous gardez la main',
        texte: "Il mesure d'abord ce qui manque au dossier, puis propose une description ou un article entier. Il cite ses sources et n'insère jamais rien sans votre accord.",
        points: [
          "L'assistant mesure ce qui manque au dossier, champ par champ.",
          "Vous activez la recherche web pour qu'il s'appuie sur des sources plutôt que sur rien.",
          "Il propose au choix la description courte ou l'article complet.",
        ],
        capture: {
          src: 'img/modules/carte/assistant.jpg', largeur: 1800, hauteur: 1125,
          alt: "Le panneau de l'assistant de rédaction : la complétion du dossier à 40%, la recherche web activée, et les deux boutons de génération.",
        },
      },
      {
        titre: 'Votre espace porte votre identité, pas la nôtre',
        texte: "Le nom affiché, vos deux logos, votre favicon, votre couleur principale et votre fond de carte par défaut. Vous les changez vous-même, la carte publique suit.",
        points: [
          "Vous déposez un logo pour le thème clair et un autre pour le thème sombre.",
          "Le code de votre espace devient l'adresse de votre carte.",
        ],
        capture: {
          src: 'img/modules/carte/marque.jpg', largeur: 1800, hauteur: 1125,
          alt: "L'écran d'identité de l'espace : le nom affiché, le code de la ville, et les deux logos clair et sombre.",
        },
      },
    ],
    habitant: [
      "La navigation descend en trois niveaux : les modules, vos catégories, puis les projets en cartes illustrées.",
      "La fiche d'un projet réunit sa photo, sa description, son article illustré, sa carte de localisation, son sommaire, vos documents PDF et le lien vers votre page officielle.",
      "Huit fonds de carte sont proposés, dont le satellite et deux photographies aériennes du même quartier en 1960 et en 1980.",
      "Le mode relief sort les bâtiments à leur hauteur réelle, et le mode sombre suit le réglage de son téléphone.",
      "Il cherche une adresse dans la Base Adresse Nationale, et sa géolocalisation affiche son cercle de précision réel.",
    ],
    linkedTo: "Vos projets ne vivent pas seuls : ils partagent la carte avec les autres modules, et le Diagnostic sait les relire.",
    synergies: [
      { vers: 'participer', texte: "Les signalements de vos habitants s'affichent par-dessus vos projets, sur la même carte. Les deux couches coexistent, aucune ne remplace l'autre." },
      { vers: 'travaux', texte: "Les chantiers ont volontairement leur propre vue : un projet à dix ans et une rue barrée trois semaines ne se lisent pas de la même façon." },
      { vers: 'diagnostic', texte: "Vos projets publiés font partie des deux sources que le Diagnostic sait charger d'un clic, sans rien configurer." },
      { vers: 'chantiers', texte: "Une permission de voirie n'a rien à faire dans la carte des projets : elle s'instruit en amont, dans Chantiers, avec vos communes et les entreprises." },
    ],
  },
  {
    key: 'travaux',
    forme: 'barre',
    name: 'Travaux du quotidien',
    short: 'Travaux',
    side: SIDE_PUBLIC,
    icon: HardHat,
    teinte: '#B45309',
    tone: { text: 'text-mod-travaux', bg: 'bg-mod-travaux-soft', socle: 'bg-mod-travaux' },
    capture: {
      src: 'img/modules/travaux.jpg',
      largeur: 1800,
      hauteur: 1125,
      alt: "Les chantiers d'une métropole entière sur une seule carte, chaque emprise colorée selon son avancement.",
    },
    live: { url: spaceUrl('default', 'travaux'), label: 'Ouvrir un espace en service' },
    showcase: 'travaux',
    h1: "Vos riverains savent enfin quand la rue rouvre",
    tagline: "Chaque chantier affiche son emprise, ses dates et son avancement, sans que personne n'appelle la mairie.",
    titres: { combine: "Ce module travaille avec les autres" },
    problem: "Vos services savent quand la rue rouvre, mais les riverains l'ignorent, alors ils appellent l'accueil.",
    produces: "Les chantiers ont leur propre espace, distinct de la carte des projets. Chacun y porte son emprise, ses dates et son état, et le riverain manipule lui-même la chronologie.",
    /* Les fonctions du module, une par planche, chacune montree par une
     * capture prise sur l'espace de demonstration, ou dans son administration.
     * Ce que la page ne peut pas montrer, elle ne le raconte pas. */
    features: [
      {
        titre: 'Tous les chantiers du territoire tiennent sur une seule carte',
        texte: "Chaque chantier porte son emprise réelle, et sa couleur dit où il en est : du rouge au vert au fil de son calendrier. Le riverain voit d'un coup d'oeil ce qui est ouvert autour de lui.",
        points: [
          "L'emprise se trace en point, en ligne ou en zone, selon ce qu'occupe le chantier.",
          "Entrer dans Travaux nettoie la carte, qui ne montre plus que les chantiers.",
        ],
        capture: {
          src: 'img/modules/travaux/ensemble.jpg', largeur: 1800, hauteur: 1125,
          alt: "Les chantiers d'une métropole entière sur une seule carte, chaque emprise colorée selon son avancement.",
        },
      },
      {
        titre: 'Vos riverains remontent le temps avec un curseur',
        texte: "À chaque date, le curseur affiche le nombre de chantiers ouverts ce jour-là. L'histogramme montre les pics et les creux de la période, et un bouton ramène sur aujourd'hui.",
        points: [
          "Le compteur se met à jour à mesure que le curseur glisse.",
          "La période couvre tout ce que contiennent vos données, le passé comme les chantiers à venir.",
        ],
        capture: {
          src: 'img/modules/travaux/chronologie.jpg', largeur: 1800, hauteur: 1125,
          alt: "La chronologie ouverte : le nombre de chantiers en cours à la date choisie, l'histogramme de la période et le curseur.",
        },
      },
      {
        titre: 'Trois filtres se croisent, et chaque valeur annonce son nombre de chantiers',
        texte: "Les trois filtres portent sur la nature des travaux, la commune et l'état. Chaque valeur affiche le nombre de chantiers qu'elle contient, donc on sait ce qu'on va trouver avant même de cliquer.",
        points: [
          "Chaque valeur annonce, en face d'elle, le nombre de chantiers qu'elle contient.",
          "Les trois filtres se croisent, et se relâchent un par un.",
        ],
        capture: {
          src: 'img/modules/travaux/filtres.jpg', largeur: 1800, hauteur: 1125,
          alt: 'Le panneau des filtres : la nature des travaux, avec le nombre de chantiers en face de chaque valeur.',
        },
      },
      {
        titre: "Un clic sur l'emprise, et le riverain sait tout",
        texte: "La fiche donne la nature des travaux, la commune, l'état, la période avec son avancement en pourcentage et en jours, et l'adresse concernée.",
        points: [
          "L'avancement se lit sur une barre datée, du début à la fin annoncée.",
          "L'adresse exacte du chantier s'affiche quand vos données la portent.",
        ],
        capture: {
          src: 'img/modules/travaux/fiche.jpg', largeur: 1800, hauteur: 1125,
          alt: "La fiche d'un chantier ouverte sur la carte : sa nature, son état, sa période et son adresse.",
        },
      },
      {
        titre: 'Vos agents saisissent, ou vous branchez un flux existant',
        texte: "Soit vos équipes créent les chantiers dans l'administration, soit vous collez l'adresse d'un flux GeoJSON et le module se remplit tout seul. C'est l'un ou l'autre, et le retour en arrière ne détruit rien.",
        points: [
          "Quand vous branchez un flux, la saisie manuelle se désactive et les chantiers déjà créés sont conservés.",
          "L'espace de démonstration est branché sur les données ouvertes de la métropole.",
        ],
        capture: {
          src: 'img/modules/travaux/configuration.jpg', largeur: 1800, hauteur: 1125,
          alt: "La configuration du module : l'activation, puis le choix entre la base interne et un flux GeoJSON externe.",
        },
      },
      {
        titre: 'Le module s\'allume et s\'éteint sans nous appeler',
        texte: "Chaque module de votre espace a son interrupteur. Vous activez Travaux quand vous êtes prêt, et la carte publique suit.",
        points: [
          "Chaque module de votre espace a son propre interrupteur.",
          "Son état, actif ou désactivé, se lit dans la liste.",
        ],
        capture: {
          src: 'img/modules/travaux/activation.jpg', largeur: 1800, hauteur: 1125,
          alt: "La liste des modules d'un espace, chacun avec son interrupteur et son état.",
        },
      },
    ],
    habitant: [
      "Il fait glisser une chronologie jour par jour, et lit à chaque date combien de chantiers sont ouverts, et lesquels.",
      "Un histogramme montre la charge de chantiers sur la période, ses pics et ses creux.",
      "Trois filtres se croisent, la nature des travaux, la localisation et l'état, et chacun annonce son nombre de chantiers.",
      "La fiche d'un chantier donne sa nature, son état, ses dates de début et de fin, sa durée, sa description et les adresses concernées.",
      "L'emprise tracée sur la carte change de couleur, du rouge au vert, au fil du calendrier.",
    ],
    linkedTo: "Le module fonctionne seul, et se complète avec les autres.",
    synergies: [
      { vers: 'carte', texte: "La vue des chantiers est séparée de celle des projets, et c'est délibéré : entrer dans Travaux nettoie la carte pour ne laisser que ce qui gêne aujourd'hui." },
      { vers: 'diagnostic', texte: "Vos chantiers sont l'une des deux sources que le Diagnostic charge d'un clic : vous pouvez analyser un secteur en tenant compte de ce qui y est ouvert." },
      { vers: 'participer', texte: "Un habitant qui signale un problème sur un chantier dépose au même endroit, sur la même carte." },
      { vers: 'chantiers', texte: "En amont, le module Chantiers instruit les permissions et les arrêtés. Travaux sait afficher un flux de chantiers extérieur : c'est le point de raccordement prévu entre les deux." },
    ],
  },
  {
    /* Ce module a son propre espace de travail, sur son propre domaine. C'est
     * la seule difference avec les quatre autres, et elle est dite sur la page
     * plutot que rattrapee par une section a part sur l'accueil.
     *
     * Source des affirmations : le produit lui-meme (openprojets_chantiers,
     * README et landing/llms.txt). Deux choses annoncees ailleurs ne figurent
     * pas ici faute d'avoir ete retrouvees dans le code : la page publique par
     * QR code, et la reprise automatique des chantiers autorises par le module
     * Travaux. */
    key: 'chantiers',
    forme: 'triangle',
    name: 'Chantiers et arrêtés',
    short: 'Chantiers',
    side: SIDE_INTERNAL,
    icon: ClipboardCheck,
    teinte: '#0B7A4A',
    tone: { text: 'text-mod-chantiers', bg: 'bg-mod-chantiers-soft', socle: 'bg-mod-chantiers' },
    capture: {
      src: 'img/chantiers/instruction.png',
      largeur: 1440,
      hauteur: 900,
      alt: "L'écran d'instruction : le gestionnaire de voirie lit une demande de permission et choisit de l'approuver, de demander une modification ou de la refuser.",
    },
    live: { url: CHANTIERS_URL, label: 'Ouvrir le site du module' },
    aussi: { url: ARRETE_URL, label: 'Générer un arrêté, sans compte' },
    note: "Ce module a son propre espace de travail et son propre abonnement. Vos services y travaillent avec vos communes et les entreprises, vos habitants n'y entrent pas.",
    showcase: 'chantiers',
    h1: "Vos permissions de voirie et vos arrêtés de circulation s'instruisent en ligne",
    tagline: "Les entreprises déposent, vos services et vos communes instruisent dans un fil daté, et chaque chantier est suivi jusqu'à la réouverture de la rue.",
    titres: { combine: 'Ce module travaille avec les autres', },
    problem: "Une demande de voirie circule en pièces jointes, entre le gestionnaire, la commune et l'entreprise. Personne ne sait où en est le dossier, et l'arrêté se retape à chaque fois.",
    produces: "Chaque demande devient un dossier unique et horodaté, que partagent tous ceux qui le traitent. Les permissions et les arrêtés en sortent rédigés, au modèle Cerfa, avec le plan de l'emprise.",
    /* Les fonctions du module, une par planche, photographiees dans sa
     * demonstration publique, celle qui s'ouvre sans compte. */
    features: [
      {
        titre: "Un même dossier porte la permission, l'arrêté et le suivi de chantier",
        texte: "Permission de voirie, arrêté de circulation, suivi de chantier : le même dossier porte les trois, et tous ceux qui le traitent lisent le même fil.",
        points: [
          "La demande porte sa période, sa description et son emprise dessinée sur une carte.",
          "Le bas du dossier propose trois décisions : approuver, demander une modification ou refuser.",
        ],
        capture: {
          src: 'img/modules/chantiers/instruction.jpg', largeur: 1800, hauteur: 1125,
          alt: "Un dossier ouvert : ses trois volets, le fil daté de la demande, et les trois décisions possibles.",
        },
      },
      {
        titre: "L'entreprise dépose et suit ses dossiers elle-même",
        texte: "Elle choisit au nom de qui elle dépose, retrouve ses demandes avec leur état, et voit à quelle étape chacune se trouve.",
        points: [
          "Une invitation par courriel suffit à ouvrir l'accès, sans mot de passe à gérer.",
          "Une entreprise invitée par plusieurs collectivités retrouve tout dans le même portail.",
        ],
        capture: {
          src: 'img/modules/chantiers/demandeur.jpg', largeur: 1800, hauteur: 1125,
          alt: "Le portail d'un demandeur : ses demandes, leur référence, leur date et leur état.",
        },
      },
      {
        titre: 'Tous les chantiers autorisés se rangent sur un même fond',
        texte: "Chaque dossier prend la couleur de l'étape où il en est, et la carte se filtre par date comme par état.",
        points: [
          "Une légende donne chaque état, de la décision attendue à la fin définitive.",
          "Deux onglets séparent les dossiers en instruction et ceux autorisés, et un filtre les trie par date.",
        ],
        capture: {
          src: 'img/modules/chantiers/carte.jpg', largeur: 1800, hauteur: 1125,
          alt: 'La carte des chantiers du territoire, avec la légende de leurs états.',
        },
      },
      {
        titre: 'Une partie du module est ouverte à tous, sans compte',
        texte: "Vous dites votre situation, vous donnez une adresse, et l'acte arrive rédigé : visas, considérants, articles et signalisation.",
        points: [
          "Neuf situations sont couvertes, de la tranchée au tournage de film.",
          "Le dossier sort en huit pièces, avec des textes de loi datés du jour.",
        ],
        capture: {
          src: 'img/modules/chantiers/generateur.jpg', largeur: 1800, hauteur: 1125,
          alt: "Le générateur d'arrêtés : le choix de la situation, de la tranchée à la manifestation.",
        },
      },
    ],
    habitant: [
      "Elle dépose en ligne sur invitation par courriel, sans mot de passe à retenir.",
      "Elle dessine son emprise sur une carte, au lieu de joindre un plan en pièce.",
      "Un fil daté, tenu comme une messagerie, réunit les réponses du gestionnaire et de la commune sous les yeux de tous ceux qui traitent le dossier.",
      "Vous contre-proposez une emprise ou une période, que l'entreprise corrige et resoumet sans repartir de zéro.",
      "Un portail unique pour une entreprise invitée par plusieurs collectivités",
      "Un courriel prévient à chaque étape.",
    ],
    linkedTo: "Ce module travaille en amont de la carte, et ce qu'il autorise a vocation à s'afficher du côté des habitants.",
    synergies: [
      { vers: 'travaux', texte: "Travaux montre aux riverains ce que Chantiers a autorisé. Le module sait afficher un flux de chantiers extérieur : c'est le point de raccordement prévu entre les deux." },
      { vers: 'carte', texte: "Une rue barrée trois semaines et un projet d'aménagement à dix ans ne se lisent pas de la même façon. Ils gardent donc deux vues distinctes." },
      { vers: 'participer', texte: "Un riverain gêné par un chantier vous le signale au même endroit que le reste, sur la carte publique." },
      { vers: 'diagnostic', texte: "Le Diagnostic ne lit pas les dossiers de voirie. Il analyse les chantiers une fois qu'ils sont publiés par le module Travaux." },
    ],
  },
  {
    key: 'participer',
    forme: 'arche',
    name: 'Signalement',
    short: 'Signalement',
    side: SIDE_PUBLIC,
    icon: Megaphone,
    teinte: '#1B5FA8',
    tone: { text: 'text-mod-participer', bg: 'bg-mod-participer-soft', socle: 'bg-mod-participer' },
    capture: {
      src: 'img/modules/participer.jpg',
      largeur: 1800,
      hauteur: 1125,
      alt: "Les signalements publiés d'une ville, listés avec leur statut à gauche et posés sur la carte à droite.",
    },
    live: { url: spaceUrl('villedelyon', 'participer'), label: 'Ouvrir un espace en service' },
    showcase: 'participer',
    h1: "Vos habitants vous signalent ce qui ne va pas, et suivent votre réponse",
    tagline: "Un habitant dépose en deux minutes sans créer de compte, vous décidez de ce qui devient public.",
    titres: { combine: "Ce module travaille avec les autres" },
    problem: "Les besoins remontent par mail, par téléphone, en réunion. Rien n'est consolidé, et le déposant ne sait jamais ce qu'est devenue sa demande.",
    produces: "Vos habitants déposent sur un formulaire géolocalisé, consultent la carte des signalements publiés avec leur avancement, et suivent le leur par un lien personnel.",
    /* Les fonctions du module, une par planche, montrees sur l'espace de la
     * Ville de Lyon et dans son administration. */
    features: [
      {
        titre: 'Un habitant dépose en deux minutes, sans créer de compte',
        texte: "Le formulaire demande où, quoi, quelques précisions et une adresse e-mail. L'habitant touche la carte pour placer le point, choisit une catégorie, et c'est parti.",
        points: [
          "Vos catégories s'affichent avec leurs icônes et leur texte d'aide.",
          "Le point se place au doigt, ou par la position du téléphone.",
        ],
        capture: {
          src: 'img/modules/participer/formulaire.jpg', largeur: 1800, hauteur: 1125,
          alt: 'Le formulaire de signalement : où placer le point, puis la catégorie du problème.',
        },
      },
      {
        titre: 'Les signalements que vous publiez montrent leur avancement',
        texte: "Ce que vous avez décidé de rendre public s'affiche sur la carte et dans une liste que le visiteur filtre par statut.",
        points: [
          "Un filtre par statut sépare ce qui est pris en compte, en cours de traitement, résolu ou hors compétence.",
          "La tête de liste annonce combien de signalements sont affichés.",
        ],
        capture: {
          src: 'img/modules/participer/explorer.jpg', largeur: 1800, hauteur: 1125,
          alt: 'La liste des signalements publiés avec leur statut, et leurs points sur la carte.',
        },
      },
      {
        titre: 'Le déposant voit ce que vous en avez fait',
        texte: "Chaque signalement porte sa référence, sa date, son adresse, sa description, et la frise de son traitement avec vos messages.",
        points: [
          "Une frise datée retrace le parcours : déposé, publié sur la carte, pris en compte.",
          "Chaque signalement publié porte un bouton de demande de retrait.",
        ],
        capture: {
          src: 'img/modules/participer/detail.jpg', largeur: 1800, hauteur: 1125,
          alt: "Le détail d'un signalement : sa référence, son adresse, sa description et la frise de son traitement.",
        },
      },
      {
        titre: 'Vos agents traitent dans une file à quatre onglets',
        texte: "Les quatre onglets sont à traiter, en cours, clos et tous. Chaque ligne porte sa référence, sa date, son adresse, son état, et indique si le signalement est publié.",
        points: [
          "La recherche porte sur la référence, la description ou l'adresse.",
          "Un export sort la file entière, et les catégories comme les statuts se règlent juste à côté.",
        ],
        capture: {
          src: 'img/modules/participer/file.jpg', largeur: 1800, hauteur: 1125,
          alt: "La file de traitement des signalements dans l'administration, avec ses quatre onglets.",
        },
      },
      {
        titre: 'Vous écrivez les textes que lisent vos habitants',
        texte: "Vous écrivez l'introduction du formulaire, le message affiché juste après l'envoi, et vous donnez l'adresse de la collectivité qui reçoit tout.",
        points: [
          "Laissez un texte vide, et celui par défaut reprend sa place.",
          "Cette adresse reçoit chaque dépôt, les rappels de non-traitement et les demandes de retrait.",
        ],
        capture: {
          src: 'img/modules/participer/reglages.jpg', largeur: 1800, hauteur: 1125,
          alt: "Les réglages du module : les textes vus par l'habitant et l'adresse qui reçoit les notifications.",
        },
      },
    ],
    habitant: [
      "Il remplit un formulaire en quatre temps, où, quoi, quelques précisions et son adresse, avec trois champs obligatoires et aucun compte à créer.",
      "Il consulte la carte des signalements publiés, qu'il filtre par statut.",
      "Le détail d'un signalement donne sa photo, sa description, son adresse et la frise de son traitement.",
      "Une page de suivi personnelle, ouverte par un lien reçu par courriel, lui montre aussi ce qui n'est pas encore publié.",
      "Toute personne concernée peut demander le retrait d'un signalement publié, depuis un bouton sur sa page.",
    ],
    linkedTo: "Ce que vos habitants remontent rejoint les autres modules, au lieu de rester dans une boîte à part.",
    synergies: [
      { vers: 'carte', texte: "Les signalements se superposent à vos projets sur la même carte : un habitant voit du même coup ce qu'il signale et ce que vous préparez." },
      { vers: 'diagnostic', texte: "Le Diagnostic ne charge pas les signalements d'un clic comme les projets et les chantiers, mais ceux qui sont publiés s'exposent en données ouvertes : on les lui ajoute comme n'importe quelle autre couche." },
      { vers: 'travaux', texte: "Un signalement qui concerne un chantier en cours se dépose sur la même carte que lui." },
      { vers: 'chantiers', texte: "Ce que vos habitants signalent sur un chantier vous parvient ici. L'autorisation de ce chantier, elle, se traite dans Chantiers." },
    ],
  },
  {
    key: 'diagnostic',
    forme: 'etoile',
    name: 'Diagnostic terrain',
    short: 'Diagnostic',
    side: SIDE_INTERNAL,
    icon: ScanSearch,
    teinte: '#7546CC',
    tone: { text: 'text-mod-diagnostic', bg: 'bg-mod-diagnostic-soft', socle: 'bg-mod-diagnostic' },
    capture: {
      src: 'img/modules/diagnostic.jpg',
      largeur: 1800,
      hauteur: 899,
      alt: "Une zone entourée à main levée sur la carte, et la synthèse qui en sort : 182 points lus, 5 sources, 12 sujets, chaque sujet cité.",
    },
    live: null,
    showcase: 'diagnostic',
    h1: "Vous entourez une zone, et vous savez ce que disent tous ses relevés",
    tagline: "L'IA lit chaque point de la zone et vous en rend une synthèse sourcée, source par source.",
    titres: { combine: "Ce module travaille avec les autres" },
    problem: "Un secteur porte des centaines de points, et personne n'a le temps de tout lire avant l'arbitrage.",
    produces: "Le rapport résume la zone source par source, et chaque ligne cite les points dont elle vient. Il ne note rien, ne classe rien et ne recommande rien.",
    /* Les fonctions du module, une par planche, montrees sur un espace qui
     * s'en sert vraiment : neuf couches branchees et dix-huit rapports deja
     * produits. */
    features: [
      {
        titre: 'Vous branchez toutes vos sources sur le même fond',
        texte: "Vous branchez les remontées de vos agents, vos données ouvertes, les fichiers que vous déposez et les flux de services tiers. Chaque couche s'allume et s'éteint d'un interrupteur.",
        points: [
          "Les couches se rangent par famille, et chacune annonce son nombre de points.",
          "Une carte de densité s'active par-dessus, quand les points se chevauchent.",
        ],
        capture: {
          src: 'img/modules/diagnostic/couches.jpg', largeur: 1800, hauteur: 1125,
          alt: "Le panneau des couches : les sources rangées par famille avec leur nombre de points, et leurs points sur la carte.",
        },
      },
      {
        titre: "Vous entourez, et vous savez ce qu'il y a dedans",
        texte: "Le tracé se fait à main levée. Le compteur donne aussitôt le nombre de points retenus et leur répartition par source, avant même de lancer l'analyse.",
        points: [
          "L'analyse lit tous les points de la zone, dans la limite de trois cents.",
          "Masquer une couche recalcule la sélection sur-le-champ.",
        ],
        capture: {
          src: 'img/modules/diagnostic/zone.jpg', largeur: 1800, hauteur: 1125,
          alt: "Une zone entourée à main levée : 282 points retenus, leur répartition par source, et le bouton pour lancer l'analyse.",
        },
      },
      {
        titre: 'Le rapport résume chaque source et cite les points qui le justifient',
        texte: "Le rapport donne quatre indicateurs calculés sur vos données, la composition de la zone, une vue d'ensemble rédigée, puis ce que dit chaque source avec les citations qui le justifient.",
        points: [
          "La tête du rapport donne les points lus, les sources, les sujets relevés et l'emprise.",
          "Le rapport ne note rien, ne classe rien et ne recommande rien.",
          "Le document s'exporte en PDF.",
        ],
        capture: {
          src: 'img/modules/diagnostic/rapport.jpg', largeur: 1800, hauteur: 1125,
          alt: "Un rapport de diagnostic : ses quatre indicateurs, la composition de la zone, la vue d'ensemble et la restitution source par source.",
        },
      },
      {
        titre: 'Chaque diagnostic est conservé et se rouvre',
        texte: "Les analyses produites restent disponibles pour la collectivité, avec leur date, le nombre de points lus et le nombre de sujets relevés.",
        points: [
          "Un diagnostic se rouvre tel qu'il a été produit.",
          "Il se supprime quand il ne sert plus.",
        ],
        capture: {
          src: 'img/modules/diagnostic/historique.jpg', largeur: 1800, hauteur: 1125,
          alt: "L'historique des diagnostics : chaque analyse avec sa date, son nombre de points et ses sujets.",
        },
      },
    ],
    habitant: [
      "La composition de la zone dit combien de points elle contient, de quelles sources, et dans quelles proportions.",
      "Une synthèse reprend chaque source, et liste sous elle les sujets qui y reviennent.",
      "Chaque sujet renvoie aux points qui le justifient et cite leur texte mot pour mot.",
      "Une annexe reprend chaque point cité, tel qu'il figure dans vos données.",
      "Le rapport s'exporte en PDF, avec le plan de la zone en couverture.",
    ],
    linkedTo: "Le Diagnostic ne produit rien tout seul, il relit ce que les autres modules ont déjà recueilli.",
    synergies: [
      { vers: 'carte', texte: "Vos projets publiés se chargent d'un clic, sous le nom « Projets publiés ». Aucune configuration, aucun lien à copier." },
      { vers: 'travaux', texte: "Vos chantiers aussi, sous le nom « Travaux en cours », avec leur nature et leur état." },
      { vers: 'participer', texte: "Les signalements publiés ne sont pas dans ce raccourci, mais ils s'exposent en données ouvertes : on les ajoute par lien, comme une source externe." },
      { vers: 'chantiers', texte: "Les dossiers de voirie ne sont pas une source du Diagnostic : ce sont les chantiers publiés par le module Travaux qu'il charge d'un clic." },
    ],
  },
]

export const moduleByKey = Object.fromEntries(modules.map((m) => [m.key, m]))

/* Les titres disent le nombre de modules en toutes lettres. Le derivant du
 * tableau, en ajouter un ne laisse pas trois pages annoncer l'ancien compte. */
const EN_LETTRES = ['Aucun', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit']
export const compteEnLettres = EN_LETTRES[modules.length] || String(modules.length)
export const publicModules = modules.filter((m) => m.side === SIDE_PUBLIC)
export const internalModules = modules.filter((m) => m.side === SIDE_INTERNAL)
