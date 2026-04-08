import { defineComponent, h } from 'vue'
import HelpDetailArticle from '../HelpDetailArticle.vue'

/* ── Helpers ── */
const D = (fn) => defineComponent({
  setup() {
    return () => h(HelpDetailArticle, null, { default: fn })
  }
})

const badge = (text, color) => h('span', {
  class: `inline-block text-xs font-semibold px-2 py-0.5 rounded`,
  style: `background: ${color}15; color: ${color};`
}, text)

const collapse = (title, children, defaultOpen = false) =>
  h('details', {
    class: 'collapse-section group border border-gray-200 rounded-xl mb-3 overflow-hidden bg-white',
    open: defaultOpen || undefined
  }, [
    h('summary', {
      class: 'collapse-header flex items-center gap-2 px-5 py-4 cursor-pointer select-none text-[15px] font-semibold text-dark hover:bg-gray-50/60 transition-colors list-none [&::-webkit-details-marker]:hidden'
    }, [
      h('span', { class: 'flex-1' }, title),
      h('span', { class: 'text-gray-300 text-xs transition-transform group-open:rotate-90' }, '▶')
    ]),
    h('div', { class: 'collapse-body px-5 pb-5' }, children)
  ])

/* ======================================================================== */
/*  ADMIN — GÉNÉRAL                                                         */
/* ======================================================================== */

export const AdminGeneral = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🧭'), ' Général']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Connexion, navigation dans l\'interface d\'administration et rôles'),

  collapse('🔑 Se connecter', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La plateforme utilise un système de connexion par lien magique — aucun mot de passe à retenir.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, [h('strong', {}, 'Ouvrez l\'email'), ' d\'invitation que vous avez reçu de la plateforme']),
      h('li', {}, ['Cliquez sur le bouton ', h('strong', {}, '"Se connecter"'), ' dans l\'email']),
      h('li', {}, ['Vous êtes ', h('strong', {}, 'directement connecté'), ' — aucun mot de passe nécessaire']),
    ]),
    h('div', { class: 'info mt-4' }, [
      h('p', {}, [
        '⏰ ', h('strong', {}, 'Gestion de la session :'), ' Le token expire après ', h('strong', {}, '1 heure'),
        '. Un rafraîchissement automatique a lieu toutes les ', h('strong', {}, '4 minutes'),
        '. Si l\'onglet est resté en arrière-plan, la session est rafraîchie automatiquement au retour.',
      ]),
    ]),
    h('details', { class: 'mt-4' }, [
      h('summary', { class: 'text-sm font-semibold text-dark cursor-pointer select-none' }, '▸ Problèmes de connexion'),
      h('ul', { class: 'mt-2 text-sm text-gray-text list-disc pl-5 space-y-1' }, [
        h('li', {}, [h('strong', {}, 'Page blanche'), ' → Rechargez la page (F5) puis recliquez sur le lien dans l\'email']),
        h('li', {}, [h('strong', {}, 'Lien expiré'), ' → Demandez un nouveau lien depuis la page de connexion']),
        h('li', {}, [h('strong', {}, 'Session perdue'), ' → Vous serez redirigé automatiquement vers la page de connexion']),
      ]),
    ]),
  ], true),

  collapse('🧭 Naviguer dans l\'administration', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'L\'interface d\'administration est accessible à l\'adresse /admin/. Elle se compose d\'une barre latérale à gauche et d\'un contenu principal à droite.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-2' }, [
      h('li', {}, [h('strong', {}, 'Logo'), ' — En haut de la barre latérale, cliquez dessus pour revenir à la carte publique']),
      h('li', {}, [h('strong', {}, 'Sélecteur de structure'), ' — Menu déroulant sous le logo. Permet de changer la ville/structure active. Le choix est mémorisé d\'une session à l\'autre.']),
      h('li', {}, [h('strong', {}, 'Menu de navigation'), ' — Liens vers les différentes sections : Contributions, Travaux, Catégories, Utilisateurs, Structure, Villes']),
      h('li', {}, [h('strong', {}, 'Carte "Voir la carte"'), ' — Lien flottant vers la carte publique de la ville active']),
      h('li', {}, [h('strong', {}, 'Infos utilisateur'), ' — En bas de la barre : votre email, votre badge de rôle et le bouton de déconnexion']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, [
        '📱 ', h('strong', {}, 'Sur mobile'), ', la barre latérale est masquée par défaut. Cliquez sur l\'icône ☰ dans l\'en-tête pour l\'ouvrir. Cliquez sur un lien ou sur le fond sombre pour la refermer.',
      ]),
    ]),
  ]),

  collapse('👥 Comprendre les rôles', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Trois rôles existent, chacun avec des accès différents dans la barre latérale :'),
    h('table', { class: 'w-full text-sm border-collapse mb-4' }, [
      h('thead', {}, [
        h('tr', { class: 'bg-gray-50' }, [
          h('th', { class: 'text-left p-2 rounded-l-lg' }, 'Rôle'),
          h('th', { class: 'text-left p-2' }, 'Sections accessibles'),
          h('th', { class: 'text-left p-2 rounded-r-lg' }, 'Description'),
        ]),
      ]),
      h('tbody', {}, [
        h('tr', { class: 'border-b border-gray-100' }, [
          h('td', { class: 'p-2' }, badge('Contributeur', '#555')),
          h('td', { class: 'p-2' }, 'Contributions'),
          h('td', { class: 'p-2' }, 'Peut créer des contributions et gérer les siennes'),
        ]),
        h('tr', { class: 'border-b border-gray-100' }, [
          h('td', { class: 'p-2' }, badge('Admin', '#4E2BFF')),
          h('td', { class: 'p-2' }, 'Contributions, Travaux, Catégories, Utilisateurs, Structure'),
          h('td', { class: 'p-2' }, 'Gestion complète de la structure'),
        ]),
        h('tr', {}, [
          h('td', { class: 'p-2' }, badge('Global Admin', '#4E2BFF')),
          h('td', { class: 'p-2' }, 'Toutes les sections + Villes'),
          h('td', { class: 'p-2' }, 'Administration multi-villes'),
        ]),
      ]),
    ]),
  ]),

  collapse('🏙️ Changer de structure', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Si vous avez accès à plusieurs structures (villes), vous pouvez changer de contexte à tout moment.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Ouvrez le ', h('strong', {}, 'sélecteur de structure'), ' en haut de la barre latérale']),
      h('li', {}, ['Choisissez la ville souhaitée dans la liste déroulante']),
      h('li', {}, ['Le contenu de la section active est ', h('strong', {}, 'rechargé automatiquement'), ' pour afficher les données de la nouvelle ville']),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Votre choix de structure est ', h('strong', {}, 'mémorisé'), ' dans le navigateur. À votre prochaine visite, vous retrouverez la dernière ville sélectionnée.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GÉRER LES CONTRIBUTIONS                                        */
/* ======================================================================== */

export const AdminContributions = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '📝'), ' Gérer les contributions']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Créer, modifier, approuver, supprimer et rechercher des projets'),

  collapse('📋 La liste des contributions', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La section Contributions affiche la liste paginée de tous les projets de votre structure (20 par page).'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Chaque projet apparaît avec son ', h('strong', {}, 'image de couverture'), ' (ou une icône par défaut), son titre, sa catégorie, sa date relative et son statut']),
      h('li', {}, ['Badges de statut : ', badge('Approuvée', '#5AAB7D'), ' (coche verte) ou ', badge('En attente', '#F2B327'), ' (horloge orange)']),
      h('li', {}, ['Pagination en bas de liste : format ', h('strong', {}, '"1–20 sur 150"'), ' avec boutons Précédent / Suivant']),
    ]),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-4 mb-2' }, 'Onglets de statut'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, '"Toutes"'), ' — Affiche toutes les contributions (par défaut)']),
      h('li', {}, [h('strong', {}, '"En attente"'), ' — Uniquement les contributions non approuvées']),
      h('li', {}, [h('strong', {}, '"Approuvées"'), ' — Uniquement les contributions approuvées']),
    ]),
  ], true),

  collapse('🔍 Rechercher et filtrer', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La barre d\'outils sous les onglets propose plusieurs filtres combinables :'),
    h('table', { class: 'w-full text-sm border-collapse mb-4' }, [
      h('thead', {}, [
        h('tr', { class: 'bg-gray-50' }, [
          h('th', { class: 'text-left p-2 rounded-l-lg' }, 'Outil'),
          h('th', { class: 'text-left p-2 rounded-r-lg' }, 'Description'),
        ]),
      ]),
      h('tbody', {}, [
        h('tr', { class: 'border-b border-gray-100' }, [
          h('td', { class: 'p-2', style: 'font-weight:500' }, '🔎 Recherche'),
          h('td', { class: 'p-2' }, 'Rechercher un projet par nom (recherche en temps réel)'),
        ]),
        h('tr', { class: 'border-b border-gray-100' }, [
          h('td', { class: 'p-2', style: 'font-weight:500' }, '📂 Catégorie'),
          h('td', { class: 'p-2' }, 'Filtrer par catégorie (menu déroulant)'),
        ]),
        h('tr', {}, [
          h('td', { class: 'p-2', style: 'font-weight:500' }, '↕️ Tri'),
          h('td', { class: 'p-2' }, 'Plus récent (défaut), plus ancien, nom A→Z'),
        ]),
      ]),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Les filtres sont ', h('strong', {}, 'combinables'), ' entre eux. En tant que contributeur, un filtre supplémentaire ', h('strong', {}, '"Mes contributions"'), ' est disponible.']),
    ]),
  ]),

  collapse('👁️ Consulter le détail d\'une contribution', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Cliquez sur une ligne de la liste ou sur l\'icône œil pour ouvrir le panneau de détail latéral.'),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Le panneau affiche :'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Image de couverture'), ' en pleine largeur']),
      h('li', {}, [h('strong', {}, 'Badges'), ' — Statut (approuvée/en attente), catégorie, tags']),
      h('li', {}, [h('strong', {}, 'Métadonnées'), ' — Date de création, ville, lien officiel']),
      h('li', {}, [h('strong', {}, 'Description'), ' courte']),
      h('li', {}, [h('strong', {}, 'Carte'), ' — Aperçu interactif des tracés GeoJSON du projet']),
      h('li', {}, [h('strong', {}, 'Article'), ' — Contenu markdown mis en forme']),
      h('li', {}, [h('strong', {}, 'Documents'), ' — Liste des PDFs avec icône et lien de téléchargement']),
    ]),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Actions en bas du panneau :'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, ['🗑️ ', h('strong', {}, 'Supprimer'), ' — Bouton rouge à gauche']),
      h('li', {}, ['✏️ ', h('strong', {}, 'Modifier'), ' — Ouvre le formulaire d\'édition']),
      h('li', {}, ['✅ ', h('strong', {}, 'Approuver / Révoquer'), ' — Bouton vert (admin uniquement)']),
    ]),
  ]),

  collapse('✅ Approuver / révoquer une contribution', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Repérez un projet avec le badge ', badge('En attente', '#F2B327')]),
      h('li', {}, ['Cliquez sur le bouton ', h('strong', {}, 'coche verte'), ' dans la ligne ou dans le panneau de détail']),
      h('li', {}, ['Le statut passe à ', badge('Approuvée', '#5AAB7D'), ' et le projet apparaît sur la carte publique']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['🔄 Pour ', h('strong', {}, 'révoquer'), ' l\'approbation, cliquez sur l\'icône flèche arrière sur une contribution approuvée. Elle redevient invisible sur la carte publique.']),
    ]),
  ]),

  collapse('➕ Créer une contribution', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur le bouton ', h('strong', {}, '"+ Nouvelle contribution"'), ' en haut de la liste. Le formulaire de création s\'affiche avec les sections suivantes :'
    ]),
    h('ol', { class: 'steps' }, [
      h('li', {}, [
        h('strong', {}, '1. Informations'), h('br'),
        h('strong', {}, 'Nom du projet'), ' (obligatoire, 120 car. max), ',
        h('strong', {}, 'Catégorie'), ' (obligatoire), ',
        'Lien officiel (URL), Description courte (500 car.), Tags',
      ]),
      h('li', {}, [
        h('strong', {}, '2. Localisation'), h('br'),
        'Deux modes au choix :', h('br'),
        '• ', h('strong', {}, '"Dessiner sur la carte"'), ' — Outils Point, Ligne ou Zone. Double-cliquez ou cliquez sur le bouton pour terminer un tracé.', h('br'),
        '• ', h('strong', {}, '"Importer un fichier"'), ' — Glissez-déposez un fichier .geojson ou .json',
      ]),
      h('li', {}, [
        h('strong', {}, '3. Couverture'), h('br'),
        'Glissez-déposez une image (PNG, JPG, WebP, SVG). Aperçu avec options de remplacement et suppression.',
      ]),
      h('li', {}, [
        h('strong', {}, '4. Article'), h('br'),
        'Éditeur Markdown riche (Toast UI Editor) avec barre d\'outils : titres, gras, italique, listes, tableau, images inline, liens, code. Les images sont uploadées directement vers le stockage.',
      ]),
      h('li', {}, [
        h('strong', {}, '5. Documents'), h('br'),
        'Ajoutez des fichiers PDF via le bouton d\'ajout. Chaque document affiche son icône, un champ de titre modifiable et un bouton de suppression.',
      ]),
      h('li', {}, [
        h('strong', {}, '6. Assistant de rédaction (IA)'), h('br'),
        'Bouton flottant ', h('strong', {}, '"Assistant"'), ' en bas à droite. Ouvre un panneau avec la complétion du projet et des suggestions de génération automatique (description, article). Voir section dédiée ci-dessous.',
      ]),
    ]),
    h('p', { class: 'text-sm text-gray-text mt-4' }, [
      'Cliquez sur ', h('strong', {}, '"Créer"'), ' en bas du formulaire pour enregistrer la contribution.'
    ]),
  ]),

  collapse('🤖 Assistant de rédaction (IA)', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Disponible dans le formulaire de création/modification. Le bouton "Assistant" en bas à droite affiche un badge indiquant le nombre de suggestions disponibles.'),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Fonctionnement :'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, 'Jauge de complétion'), ' — Barre de progression + pourcentage + checklist des champs remplis (nom, catégorie, URL, description, PDF, couverture, article)']),
      h('li', {}, [h('strong', {}, 'Recherche web'), ' — Activez l\'option pour enrichir la génération avec des résultats de recherche en ligne']),
      h('li', {}, [h('strong', {}, 'Suggestions'), ' — Boutons "Générer la description" et "Générer l\'article" (disponibles si suffisamment de champs sont remplis)']),
      h('li', {}, [h('strong', {}, 'Génération'), ' — Le texte apparaît en temps réel (streaming). Les sources web sont listées en bas.']),
      h('li', {}, [h('strong', {}, 'Actions post-génération'), ' — Boutons "Copier" et "Insérer" pour intégrer le texte dans le formulaire']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['ℹ️ Vous pouvez ', h('strong', {}, 'arrêter'), ' la génération en cours avec le bouton Stop. Cliquez sur "Regénérer" pour relancer avec un nouveau résultat.']),
    ]),
  ]),

  collapse('✏️ Modifier une contribution', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'crayon'), ' dans la ligne du projet ou dans le panneau de détail']),
      h('li', {}, ['Le même formulaire s\'ouvre ', h('strong', {}, 'pré-rempli'), ' avec les données existantes']),
      h('li', {}, ['Modifiez les sections souhaitées']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Enregistrer"'), ' en bas du formulaire']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['En tant qu\'admin, vous pouvez modifier ', h('strong', {}, 'toutes les contributions'), ' de votre structure.']),
    ]),
  ]),

  collapse('🗑️ Supprimer une contribution', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'corbeille'), ' (rouge) dans la ligne ou le panneau de détail']),
      h('li', {}, ['Une boîte de dialogue demande confirmation : le nom du projet et les conséquences (suppression définitive + fichiers) sont affichés']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Supprimer"'), ' pour confirmer']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ ', h('strong', {}, 'Action irréversible'), ' — La contribution et tous les fichiers associés (GeoJSON, documents, images) seront définitivement supprimés.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — TRAVAUX                                                         */
/* ======================================================================== */

export const AdminTravaux = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🚧'), ' Travaux']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Gérer les chantiers, configurer la source de données et l\'affichage sur la carte'),

  collapse('⚙️ Configurer le module', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur l\'icône ', h('strong', {}, 'engrenage'), ' en haut de la section Travaux pour accéder à la page de configuration.'
    ]),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Activation'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, 'Interrupteur d\'activation'), ' — Active ou masque le module Travaux sur la carte publique']),
      h('li', {}, ['Quand désactivé, le filtre "Travaux" n\'apparaît pas dans les filtres de la carte']),
    ]),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Source des données'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, '"Base interne"'), ' — Créez et gérez vos chantiers directement dans l\'interface (mode par défaut)']),
      h('li', {}, [h('strong', {}, '"Flux externe (open data)"'), ' — Importez automatiquement les chantiers via une URL GeoJSON externe']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['ℹ️ En mode "Flux externe", la liste des chantiers est en ', h('strong', {}, 'lecture seule'), '. Vous ne pouvez pas créer ni modifier de chantiers manuellement.']),
    ]),
  ], true),

  collapse('📋 Liste des chantiers', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La liste affiche tous les chantiers de la structure active avec leur icône de statut colorée.'),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Statuts des chantiers'),
    h('table', { class: 'w-full text-sm border-collapse mb-4' }, [
      h('thead', {}, [
        h('tr', { class: 'bg-gray-50' }, [
          h('th', { class: 'text-left p-2 rounded-l-lg' }, 'État'),
          h('th', { class: 'text-left p-2' }, 'Couleur'),
          h('th', { class: 'text-left p-2 rounded-r-lg' }, 'Icône'),
        ]),
      ]),
      h('tbody', {}, [
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'En cours'), h('td', { class: 'p-2' }, badge('Vert', '#5AAB7D')), h('td', { class: 'p-2' }, 'Marteau')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Prévu'), h('td', { class: 'p-2' }, badge('Bleu', '#2563EB')), h('td', { class: 'p-2' }, 'Calendrier')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Terminé'), h('td', { class: 'p-2' }, badge('Neutre', '#555')), h('td', { class: 'p-2' }, 'Coche')]),
        h('tr', {}, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'À venir'), h('td', { class: 'p-2' }, badge('Orange', '#F2B327')), h('td', { class: 'p-2' }, 'Horloge')]),
      ]),
    ]),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Onglets de filtre'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, '"Tous"'), ' — Tous les chantiers']),
      h('li', {}, [h('strong', {}, '"En attente"'), ' — Chantiers non approuvés']),
      h('li', {}, [h('strong', {}, '"Approuvés"'), ' — Chantiers visibles sur la carte publique']),
    ]),
    h('p', { class: 'text-sm text-gray-text mb-2' }, ['Barre d\'outils : recherche par nom/nature/localisation et tri (récent, ancien, A→Z).']),
    h('p', { class: 'text-sm text-gray-text mb-2' }, [
      'Actions par chantier : ', h('strong', {}, 'Approuver'), ' (coche verte, si en attente), ',
      h('strong', {}, 'Modifier'), ' (crayon), ',
      h('strong', {}, 'Supprimer'), ' (corbeille rouge).',
    ]),
  ]),

  collapse('➕ Créer un chantier', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur ', h('strong', {}, '"+ Nouveau chantier"'), ' en haut de la liste. Le formulaire se compose de 4 sections :'
    ]),
    h('ol', { class: 'steps' }, [
      h('li', {}, [
        h('strong', {}, '1. Identité'), h('br'),
        h('strong', {}, 'Nom'), ' (obligatoire, 120 car. max), Nature (ex : "Voirie, Réseaux"), Adresse/Localisation, Description (impact sur la circulation).',
      ]),
      h('li', {}, [
        h('strong', {}, '2. État & Planning'), h('br'),
        'Sélection de l\'état via un ', h('strong', {}, 'sélecteur visuel'), ' (En cours, Prévu, Terminé, À venir). Dates de début et de fin (côte à côte).',
      ]),
      h('li', {}, [
        h('strong', {}, '3. Localisation'), h('br'),
        'Même système que pour les contributions : dessin sur la carte (Point, Ligne, Zone) ou import de fichier GeoJSON.',
      ]),
      h('li', {}, [
        h('strong', {}, '4. Affichage'), h('br'),
        'Choix de l\'icône du chantier via le sélecteur d\'icônes (par défaut : casque de chantier).',
      ]),
    ]),
    h('p', { class: 'text-sm text-gray-text mt-4' }, [
      'Cliquez sur ', h('strong', {}, '"Créer le chantier"'), ' pour enregistrer.'
    ]),
  ]),

  collapse('✏️ Modifier un chantier', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'crayon'), ' dans la ligne du chantier']),
      h('li', {}, ['Le formulaire s\'ouvre pré-rempli avec les données existantes']),
      h('li', {}, ['Les tracés GeoJSON existants sont chargés et la carte se centre automatiquement dessus']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Enregistrer les modifications"'), ' pour valider']),
    ]),
  ]),

  collapse('📡 Mode flux externe (open data)', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Quand la source est configurée sur "Flux externe" :'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Une bannière bleue indique ', h('strong', {}, '"Source open data active"'), ' avec l\'URL du flux']),
      h('li', {}, ['La liste est en ', h('strong', {}, 'lecture seule'), ' — pas de boutons créer/modifier/supprimer']),
      h('li', {}, ['Les chantiers importés portent un badge ', badge('Legacy', '#555')]),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ Si l\'URL du flux n\'est pas définie, une bannière orange avertit : ', h('strong', {}, '"URL du flux non définie"'), '. Cliquez sur "Configurer" pour la renseigner.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GÉRER LES CATÉGORIES                                           */
/* ======================================================================== */

export const AdminCategories = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🏷️'), ' Gérer les catégories']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Catégories de projets, couleurs, styles de tracés et couches associées'),

  collapse('📂 Liste des catégories', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La section affiche les catégories de la structure active sous forme de grille de cartes.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Chaque carte affiche un ', h('strong', {}, 'point coloré'), ', l\'icône de la catégorie et son nom']),
      h('li', {}, ['Actions sur chaque carte : ', h('strong', {}, 'Modifier'), ' (crayon) et ', h('strong', {}, 'Supprimer'), ' (corbeille rouge)']),
      h('li', {}, ['Les catégories sont ', h('strong', {}, 'réordonnables par glisser-déposer'), ' — l\'ordre détermine l\'affichage dans les filtres de la carte publique']),
    ]),
  ], true),

  collapse('➕ Créer / modifier une catégorie', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur ', h('strong', {}, '"+ Nouvelle catégorie"'), ' ou sur le crayon d\'une catégorie existante. Le formulaire se compose de 4 sections :'
    ]),
    h('ol', { class: 'steps' }, [
      h('li', {}, [
        h('strong', {}, '1. Informations'), h('br'),
        h('strong', {}, 'Nom'), ' (obligatoire) et ', h('strong', {}, 'Icône'), ' — Choisissez via le sélecteur d\'icônes qui propose 150+ icônes classées par catégorie (Travaux, Transport, Mobilité, Bâtiments, Infrastructure, Nature, Général). Vous pouvez aussi saisir une classe manuellement.',
      ]),
      h('li', {}, [
        h('strong', {}, '2. Couleur'), h('br'),
        'Sélecteur de couleur + champ hexadécimal. Un ', h('strong', {}, 'aperçu en temps réel'), ' montre le rendu du marqueur avec l\'icône et la couleur choisies.',
      ]),
      h('li', {}, [
        h('strong', {}, '3. Style des tracés'), ' (optionnel)', h('br'),
        'Configuration avancée avec aperçu SVG en direct (ligne + polygone) :', h('br'),
        '• ', h('strong', {}, 'Épaisseur'), ' — Curseur 1 à 12 px', h('br'),
        '• ', h('strong', {}, 'Style du tracé'), ' — Continu, tirets ou pointillés', h('br'),
        '• ', h('strong', {}, 'Opacité du tracé'), ' — Curseur 10 % à 100 %', h('br'),
        '• ', h('strong', {}, 'Remplissage du polygone'), ' — Activez puis choisissez couleur et opacité du fond',
      ]),
      h('li', {}, [
        h('strong', {}, '4. Couches associées'), ' (optionnel)', h('br'),
        'Sélectionnez les couches de la ville à associer à cette catégorie en cliquant sur les éléments de la grille. Si aucune couche n\'est configurée pour la ville, un message l\'indique.',
      ]),
    ]),
    h('p', { class: 'text-sm text-gray-text mt-4' }, [
      'Cliquez sur ', h('strong', {}, '"Créer"'), ' ou ', h('strong', {}, '"Enregistrer"'), ' en bas du formulaire.'
    ]),
  ]),

  collapse('🗑️ Supprimer une catégorie', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'corbeille'), ' (rouge) de la catégorie']),
      h('li', {}, ['Une boîte de dialogue demande confirmation avec le nom de la catégorie']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Supprimer"'), ' pour confirmer']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ ', h('strong', {}, 'Action irréversible'), ' — La catégorie sera définitivement supprimée.']),
    ]),
  ]),

  collapse('↕️ Réordonner les catégories', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'L\'ordre des catégories détermine leur position dans les filtres de la carte publique.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Maintenez le clic sur une carte de catégorie']),
      h('li', {}, ['Glissez-la vers la position souhaitée']),
      h('li', {}, ['Relâchez — l\'ordre est ', h('strong', {}, 'sauvegardé automatiquement')]),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GÉRER LES UTILISATEURS                                         */
/* ======================================================================== */

export const AdminUsers = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '👥'), ' Gérer les utilisateurs']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Inviter des membres, gérer les rôles et permissions'),

  collapse('📋 Liste des utilisateurs', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La section Utilisateurs liste les membres de la structure active.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Chaque ligne affiche l\'', h('strong', {}, 'email'), ', le badge de rôle (', badge('Admin', '#4E2BFF'), ' avec icône bouclier ou ', badge('Contributeur', '#555'), ' avec icône utilisateur), les villes accessibles et la date d\'inscription']),
      h('li', {}, ['Bouton d\'action : ', h('strong', {}, '"Promouvoir"'), ' (flèche haut) ou ', h('strong', {}, '"Rétrograder"'), ' (flèche bas)']),
    ]),
    h('p', { class: 'text-sm text-gray-text font-semibold mt-3 mb-2' }, 'Filtres'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Onglets de rôle'), ' — "Tous", "Admins" (bouclier), "Contributeurs" (utilisateur)']),
      h('li', {}, [h('strong', {}, 'Recherche'), ' — Par email, en temps réel']),
    ]),
  ], true),

  collapse('📧 Inviter un nouvel utilisateur', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur le bouton ', h('strong', {}, '"Inviter"'), ' (icône enveloppe) en haut de la section.'
    ]),
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Renseignez l\'', h('strong', {}, 'adresse email'), ' du nouvel utilisateur']),
      h('li', {}, [
        'Choisissez le ', h('strong', {}, 'rôle'), ' :', h('br'),
        '• ', h('strong', {}, 'Contributeur'), ' — Peut ajouter du contenu', h('br'),
        '• ', h('strong', {}, 'Admin'), ' — Peut aussi gérer les utilisateurs, catégories et la structure',
      ]),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Envoyer l\'invitation"')]),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 L\'utilisateur recevra un email avec un ', h('strong', {}, 'lien magique'), ' pour se connecter. Si l\'email est déjà rattaché à la structure, un message d\'erreur l\'indique.']),
    ]),
  ]),

  collapse('🔄 Promouvoir ou rétrograder', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Promouvoir"'), ' (flèche ↑) ou ', h('strong', {}, '"Rétrograder"'), ' (flèche ↓) sur la ligne de l\'utilisateur']),
      h('li', {}, ['Une boîte de dialogue résume le changement : email, rôle actuel → nouveau rôle']),
      h('li', {}, ['Confirmez pour appliquer le changement immédiatement']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['ℹ️ Le changement de rôle prend effet ', h('strong', {}, 'immédiatement'), '. L\'utilisateur verra ses accès mis à jour à son prochain chargement de page.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GÉRER MA STRUCTURE                                              */
/* ======================================================================== */

export const AdminStructure = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🏢'), ' Gérer ma structure']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Personnaliser le branding, les logos, la couleur et les contrôles de la carte publique'),

  collapse('🏷️ Identité', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Nom affiché'), ' — Le nom public de votre structure, affiché dans l\'en-tête de la carte (80 car. max)']),
      h('li', {}, [h('strong', {}, 'Code ville'), ' — Identifiant technique (lecture seule, non modifiable)']),
    ]),
  ], true),

  collapse('🖼️ Logos & Favicon', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, 'Logo — thème clair'), ' — Le logo principal de votre structure']),
      h('li', {}, [h('strong', {}, 'Logo — thème sombre'), ' — Version alternative pour le mode sombre (optionnel)']),
      h('li', {}, [h('strong', {}, 'Favicon'), ' — Petite icône affichée dans l\'onglet du navigateur (optionnel)']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['📁 Formats acceptés : ', h('strong', {}, 'PNG, SVG, WebP'), '. Upload par glisser-déposer ou clic sur la zone. Aperçu avec options de remplacement et suppression.']),
    ]),
  ]),

  collapse('🎨 Couleur primaire', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, 'Sélecteur de couleur'), ' — Cliquez pour ouvrir le color picker natif du navigateur']),
      h('li', {}, [h('strong', {}, 'Champ hexadécimal'), ' — Saisissez directement un code #RRGGBB']),
      h('li', {}, ['Un ', h('strong', {}, 'aperçu'), ' montre le rendu de la couleur sur un badge et un bouton']),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Cette couleur est appliquée comme ', h('strong', {}, 'couleur d\'accentuation'), ' sur l\'interface d\'administration et la carte publique de votre ville.']),
    ]),
  ]),

  collapse('🗺️ Fond de carte', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Choisissez le fond de carte affiché par défaut sur la carte publique.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, '"Défaut global"'), ' — Utilise le fond de carte par défaut de la plateforme']),
      h('li', {}, ['Sinon, sélectionnez un fond de carte parmi ceux disponibles dans la liste déroulante']),
    ]),
  ]),

  collapse('🎛️ Contrôles de la carte', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Activez ou désactivez individuellement chaque contrôle visible sur la carte publique :'),
    h('table', { class: 'w-full text-sm border-collapse mb-4' }, [
      h('thead', {}, [
        h('tr', { class: 'bg-gray-50' }, [
          h('th', { class: 'text-left p-2 rounded-l-lg' }, 'Contrôle'),
          h('th', { class: 'text-left p-2 rounded-r-lg' }, 'Description'),
        ]),
      ]),
      h('tbody', {}, [
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Filtres'), h('td', { class: 'p-2' }, 'Affichage des filtres par catégorie')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Fond de carte'), h('td', { class: 'p-2' }, 'Sélecteur de fond de carte')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Thème'), h('td', { class: 'p-2' }, 'Bascule thème clair / sombre')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Recherche'), h('td', { class: 'p-2' }, 'Barre de recherche d\'adresse')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Ma position'), h('td', { class: 'p-2' }, 'Bouton de géolocalisation')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Sélecteur d\'espace'), h('td', { class: 'p-2' }, 'Changement de ville sur la carte')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Informations'), h('td', { class: 'p-2' }, 'Bouton "À propos"')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Connexion'), h('td', { class: 'p-2' }, 'Bouton de connexion')]),
        h('tr', {}, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Mode 3D'), h('td', { class: 'p-2' }, 'Relief et bâtiments 3D')]),
      ]),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['ℹ️ Le "Sélecteur d\'espace" est automatiquement désactivé si aucune ville n\'est configurée dans la section "Espaces activés" ci-dessous.']),
    ]),
  ]),

  collapse('🌐 Espaces activés', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Gérez les espaces (villes) accessibles depuis le sélecteur d\'espace sur la carte publique.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Les espaces actifs sont affichés sous forme de ', h('strong', {}, 'badges'), ' avec un bouton de suppression (×)']),
      h('li', {}, ['Pour ajouter un espace : saisissez le code (identifiant en minuscules) et cliquez sur ', h('strong', {}, '"Ajouter"')]),
      h('li', {}, ['Format attendu : lettres minuscules, chiffres et tirets uniquement']),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Chaque code doit correspondre à un ', h('strong', {}, 'espace existant'), ' dans la plateforme.']),
    ]),
  ]),

  collapse('💾 Enregistrer', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur le bouton ', h('strong', {}, '"Enregistrer les modifications"'), ' en bas de page (fixé en bas de l\'écran). Les logos en attente sont uploadés et toutes les modifications sont sauvegardées.'
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['La couleur doit être au format ', h('strong', {}, '#RRGGBB'), '. En cas d\'erreur de validation, un message toast s\'affiche et le champ concerné est mis en surbrillance.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GESTION DES VILLES                                             */
/* ======================================================================== */

export const AdminVilles = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🏙️'), ' Gestion des villes']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Créer, modifier et supprimer les structures (réservé aux administrateurs globaux)'),

  collapse('📋 Liste des villes', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La section affiche toutes les structures enregistrées sur la plateforme.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Chaque ville affiche son ', h('strong', {}, 'logo'), ', son nom, un point de couleur primaire et des badges d\'information (code, nombre d\'admins, nombre de toggles, fond de carte)']),
      h('li', {}, ['Recherche par code ou nom (en temps réel)']),
      h('li', {}, ['Actions : ', h('strong', {}, '"Sélectionner"'), ' (flèche → change la ville active dans l\'admin) et ', h('strong', {}, '"Supprimer"'), ' (corbeille rouge)']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ Cette section est réservée aux ', h('strong', {}, 'administrateurs globaux'), '. Elle n\'apparaît pas dans la barre latérale pour les autres rôles.']),
    ]),
  ], true),

  collapse('➕ Créer une ville', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, [
      'Cliquez sur ', h('strong', {}, '"+ Nouvelle ville"'), ' en haut de la liste. Le formulaire se compose de 3 sections :'
    ]),
    h('ol', { class: 'steps' }, [
      h('li', {}, [
        h('strong', {}, '1. Identifiant'), h('br'),
        h('strong', {}, 'Code ville'), ' (obligatoire) — Identifiant unique en minuscules, sans espaces. ', h('strong', {}, 'Non modifiable'), ' après création.', h('br'),
        h('strong', {}, 'Nom affiché'), ' (obligatoire) — Le nom public de la structure.',
      ]),
      h('li', {}, [
        h('strong', {}, '2. Apparence'), ' (optionnel)', h('br'),
        'Logo (thème clair), logo (thème sombre), favicon et couleur primaire. Même fonctionnement que dans la section Structure.',
      ]),
      h('li', {}, [
        h('strong', {}, '3. Position sur la carte'), h('br'),
        '• ', h('strong', {}, 'Recherche d\'adresse'), ' — Barre de recherche avec géocodage (résultats OpenStreetMap). Cliquez sur un résultat pour centrer la carte.', h('br'),
        '• ', h('strong', {}, 'Carte interactive'), ' — Déplacez et zoomez pour définir le centre et le zoom par défaut. Le zoom est verrouillé initialement (cliquez sur l\'overlay pour l\'activer).', h('br'),
        '• ', h('strong', {}, 'Coordonnées'), ' — Latitude, longitude et zoom affichés en temps réel (lecture seule).',
      ]),
    ]),
    h('p', { class: 'text-sm text-gray-text mt-4' }, [
      'Cliquez sur ', h('strong', {}, '"Créer la ville"'), ' pour enregistrer.'
    ]),
  ]),

  collapse('✏️ Modifier une ville', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur une ville dans la liste']),
      h('li', {}, ['Le formulaire s\'ouvre pré-rempli (le code ville est en lecture seule)']),
      h('li', {}, ['Modifiez les champs souhaités']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Enregistrer"'), ' pour valider']),
    ]),
  ]),

  collapse('🗑️ Supprimer une ville', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'corbeille'), ' (rouge) sur la ligne de la ville']),
      h('li', {}, ['Confirmez dans la boîte de dialogue']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ ', h('strong', {}, 'Action irréversible'), ' — La ville et ses données de branding seront définitivement supprimées.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  CONTRIBUTEUR — GÉNÉRAL                                                  */
/* ======================================================================== */

export const ContribGeneral = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🧭'), ' Général']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Connexion, navigation et droits en tant que contributeur'),

  collapse('🔑 Se connecter', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Même système que pour les administrateurs : connexion par lien magique.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, [h('strong', {}, 'Ouvrez l\'email'), ' d\'invitation que vous avez reçu']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Se connecter"')]),
      h('li', {}, ['Vous êtes connecté — aucun mot de passe']),
    ]),
    h('div', { class: 'info mt-4' }, [
      h('p', {}, ['⏰ Session de ', h('strong', {}, '1 heure'), ', rafraîchissement automatique toutes les 4 minutes. Si la session expire, vous serez redirigé vers la page de connexion.']),
    ]),
  ], true),

  collapse('🧭 Naviguer dans l\'interface', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'En tant que contributeur, vous accédez à l\'interface d\'administration via /admin/.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-2' }, [
      h('li', {}, [h('strong', {}, 'Barre latérale'), ' — Seule la section ', h('strong', {}, '"Contributions"'), ' est visible']),
      h('li', {}, [h('strong', {}, 'Sélecteur de structure'), ' — Vous ne voyez que les structures auxquelles vous êtes rattaché']),
      h('li', {}, [h('strong', {}, 'Lien "Voir la carte"'), ' — Accès rapide à la carte publique']),
      h('li', {}, [h('strong', {}, 'Déconnexion'), ' — En bas de la barre latérale']),
    ]),
  ]),

  collapse('⚖️ Connaître mes droits', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'En tant que contributeur, voici ce que vous pouvez faire :'),
    h('table', { class: 'w-full text-sm border-collapse' }, [
      h('thead', {}, [
        h('tr', { class: 'bg-gray-50' }, [
          h('th', { class: 'text-left p-2 rounded-l-lg' }, 'Action'),
          h('th', { class: 'text-left p-2 rounded-r-lg' }, 'Disponible'),
        ]),
      ]),
      h('tbody', {}, [
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Créer une contribution'), h('td', { class: 'p-2' }, '✅ Oui')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Modifier mes contributions'), h('td', { class: 'p-2' }, '✅ Oui')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Supprimer mes contributions'), h('td', { class: 'p-2' }, '✅ Oui')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Voir les contributions approuvées'), h('td', { class: 'p-2' }, '✅ Lecture seule')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Modifier les contributions d\'un autre'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Approuver / révoquer'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer les catégories'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer les utilisateurs'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer la structure'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', {}, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Travaux'), h('td', { class: 'p-2' }, '❌ Non')]),
      ]),
    ]),
  ]),
])

/* ======================================================================== */
/*  CONTRIBUTEUR — GÉRER MES CONTRIBUTIONS                                 */
/* ======================================================================== */

export const ContribContributions = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '📝'), ' Gérer mes contributions']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Créer, modifier, supprimer et rechercher vos projets'),

  collapse('📋 Mes contributions', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La section Contributions affiche vos projets et ceux de votre équipe qui sont approuvés.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Même interface de liste que pour les administrateurs : image, titre, catégorie, date et statut']),
      h('li', {}, ['Filtrez avec le ', h('strong', {}, 'checkbox "Mes contributions"'), ' pour ne voir que les vôtres']),
      h('li', {}, ['Les boutons modifier (crayon) et supprimer (corbeille) n\'apparaissent que sur ', h('strong', {}, 'vos projets')]),
      h('li', {}, ['Les contributions des autres sont visibles en ', h('strong', {}, 'lecture seule'), ' si elles sont approuvées']),
    ]),
  ], true),

  collapse('🔍 Rechercher et filtrer', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Les mêmes outils de filtrage sont disponibles :'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Recherche'), ' par nom de projet']),
      h('li', {}, [h('strong', {}, 'Filtre'), ' par catégorie']),
      h('li', {}, [h('strong', {}, 'Tri'), ' : plus récent, plus ancien, nom A→Z']),
      h('li', {}, [h('strong', {}, '"Mes contributions"'), ' — Filtre rapide pour ne voir que les vôtres']),
    ]),
  ]),

  collapse('➕ Proposer un nouveau projet', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Le formulaire de création est le même que pour l\'administrateur (6 sections).'),
    h('ol', { class: 'steps' }, [
      h('li', {}, [h('strong', {}, 'Informations'), ' — Titre (obligatoire), catégorie (obligatoire), description, tags, URL, etc.']),
      h('li', {}, [h('strong', {}, 'Localisation'), ' — Dessin sur la carte ou import GeoJSON']),
      h('li', {}, [h('strong', {}, 'Couverture'), ' — Image par glisser-déposer']),
      h('li', {}, [h('strong', {}, 'Article'), ' — Éditeur Markdown riche']),
      h('li', {}, [h('strong', {}, 'Documents'), ' — Ajout de fichiers PDF']),
      h('li', {}, [h('strong', {}, 'Assistant IA'), ' — Génération auto de description et article']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['📌 Votre contribution sera en statut ', badge('En attente', '#F2B327'), ' jusqu\'à ce qu\'un administrateur l\'approuve.']),
    ]),
  ]),

  collapse('✏️ Modifier mon projet', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Repérez votre projet dans la liste']),
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'crayon')]),
      h('li', {}, ['Modifiez les informations souhaitées dans le formulaire']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Enregistrer"')]),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['ℹ️ Vous ne pouvez modifier que ', h('strong', {}, 'vos propres contributions'), '.']),
    ]),
  ]),

  collapse('🗑️ Supprimer mon projet', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'corbeille'), ' sur votre projet']),
      h('li', {}, ['Confirmez dans la boîte de dialogue de suppression']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ ', h('strong', {}, 'Irréversible'), ' — Le projet et tous ses documents seront définitivement supprimés.']),
    ]),
  ]),
])
