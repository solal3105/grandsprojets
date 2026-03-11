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
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Connexion, accès aux outils et navigation dans la modale d\'administration'),

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
        '. Si l\'onglet est resté en arrière-plan, la session est automatiquement rafraîchie au retour.'
      ]),
    ]),
    h('details', { class: 'mt-4' }, [
      h('summary', { class: 'text-sm font-semibold text-dark cursor-pointer select-none' }, '▸ Problèmes de connexion'),
      h('ul', { class: 'mt-2 text-sm text-gray-text list-disc pl-5 space-y-1' }, [
        h('li', {}, [h('strong', {}, 'Page blanche'), ' → Rechargez la page (F5) puis recliquez sur le lien dans l\'email']),
        h('li', {}, [h('strong', {}, 'Lien expiré'), ' → Demandez un nouveau lien depuis la page ', h('code', {}, '/login')]),
        h('li', {}, [h('strong', {}, 'Session expirée'), ' → Après une longue inactivité, rechargez simplement la page']),
      ]),
    ]),
  ], true),

  collapse('📋 Accéder aux outils d\'administration', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur le bouton ', h('strong', {}, '"Proposer une contribution"'), ' (', h('code', {}, '+'), ') en bas à droite de la carte']),
      h('li', {}, ['La modale s\'ouvre avec votre ', h('strong', {}, 'carte utilisateur'), ' (email, rôle, structures)']),
      h('li', {}, [h('strong', {}, 'Sélectionnez votre structure'), ' dans le menu déroulant']),
      h('li', {}, ['Les ', h('strong', {}, 'cartes d\'actions'), ' apparaissent en dessous']),
    ]),
    h('div', { class: 'tip mt-4' }, [
      h('p', {}, [h('strong', {}, 'Cartes visibles en tant qu\'administrateur :')]),
      h('ul', { class: 'mt-2 list-disc pl-5 space-y-1' }, [
        h('li', {}, ['📝 ', h('strong', {}, 'Modifier mes contributions'), ' — Liste, filtre, crée, édite et approuve les projets']),
        h('li', {}, ['🏷️ ', h('strong', {}, 'Gérer les catégories'), ' — Crée et modifie les catégories, tags et travaux']),
        h('li', {}, ['👥 ', h('strong', {}, 'Gérer les utilisateurs'), ' — Invite des membres, gère les rôles']),
        h('li', {}, ['🏢 ', h('strong', {}, 'Gérer ma structure'), ' — Modifie logos, carte par défaut et villes activées']),
      ]),
    ]),
  ]),

  collapse('🧭 Navigation dans la modale', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-2' }, [
      h('li', {}, [h('strong', {}, 'Sélecteur de structure'), ' — Toujours visible en haut, persiste en session (sessionStorage)']),
      h('li', {}, [h('strong', {}, 'Bouton Retour'), ' (← flèche) — Apparaît dans les sous-panneaux pour revenir aux cartes d\'action']),
      h('li', {}, [h('strong', {}, 'Bouton Fermer'), ' (×) — En haut à droite, ferme la modale']),
      h('li', {}, [h('strong', {}, 'Bouton Déconnexion'), ' — Icône en haut à droite de la carte utilisateur']),
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
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'En cliquant sur "Modifier mes contributions", vous accédez à la liste complète des projets de votre structure.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Chaque projet apparaît sous forme de ', h('strong', {}, 'carte'), ' avec image de couverture, titre, catégorie et date']),
      h('li', {}, ['Badges de statut : ', badge('En attente', '#F2B327'), ' ou ', badge('Approuvé', '#5AAB7D')]),
      h('li', {}, ['Badge ', badge('Votre contribution', '#2563eb'), ' sur vos propres projets']),
      h('li', {}, ['Défilement infini (10 projets chargés à la fois)']),
    ]),
  ], true),

  collapse('🔍 Rechercher et filtrer', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La barre d\'outils en haut de la liste offre plusieurs filtres combinables :'),
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
          h('td', { class: 'p-2' }, 'Rechercher un projet par nom'),
        ]),
        h('tr', { class: 'border-b border-gray-100' }, [
          h('td', { class: 'p-2', style: 'font-weight:500' }, '📂 Catégorie'),
          h('td', { class: 'p-2' }, 'Filtrer par catégorie (menu déroulant)'),
        ]),
        h('tr', { class: 'border-b border-gray-100' }, [
          h('td', { class: 'p-2', style: 'font-weight:500' }, '↕️ Tri'),
          h('td', { class: 'p-2' }, 'Plus récentes, plus anciennes, nom A→Z ou Z→A'),
        ]),
        h('tr', {}, [
          h('td', { class: 'p-2', style: 'font-weight:500' }, '👤 Mes contributions'),
          h('td', { class: 'p-2' }, 'Cocher pour ne voir que vos projets'),
        ]),
      ]),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Les filtres sont ', h('strong', {}, 'combinables'), ' : vous pouvez chercher par nom + filtrer par catégorie + trier simultanément.']),
    ]),
  ]),

  collapse('✅ Approuver / révoquer une contribution', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Repérez un projet avec le badge ', badge('En attente', '#F2B327')]),
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'coche'), ' (', h('code', {}, 'fa-circle-check'), ') sur la carte du projet']),
      h('li', {}, ['Le statut passe à ', badge('Approuvé', '#5AAB7D'), ' et le projet apparaît sur la carte publique']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['🔄 Cliquez à nouveau sur la coche pour ', h('strong', {}, 'révoquer'), ' l\'approbation. Le projet redevient invisible sur la carte.']),
    ]),
  ]),

  collapse('➕ Créer une contribution', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Le formulaire de création est organisé en 4 étapes avec un stepper visuel en haut.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, [h('strong', {}, 'Étape 1 — Informations'), h('br'), 'Titre (obligatoire), description, catégorie (obligatoire), tags, URL officielle, image de couverture (drag & drop)']),
      h('li', {}, [h('strong', {}, 'Étape 2 — Localisation'), h('br'), 'Deux modes : ', h('strong', {}, 'Fichier'), ' (upload GeoJSON par drag & drop) ou ', h('strong', {}, 'Dessin'), ' (tracez directement sur la carte : ligne, polygone ou point)']),
      h('li', {}, [h('strong', {}, 'Étape 3 — Style'), h('br'), 'Confirmez la catégorie, l\'icône FontAwesome et la couleur associées']),
      h('li', {}, [h('strong', {}, 'Étape 4 — Documents'), h('br'), 'Ajoutez des documents (fichiers PDF, images) avec un titre modifiable. Cliquez sur ', h('strong', {}, '"Enregistrer"')]),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Navigation libre : cliquez sur les ', h('strong', {}, 'onglets du stepper'), ' pour aller directement à une étape (la validation bloque si des champs obligatoires manquent).']),
    ]),
  ]),

  collapse('✏️ Modifier une contribution', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'crayon'), ' (', h('code', {}, 'fa-pen'), ') sur la carte du projet']),
      h('li', {}, ['Le même formulaire en 4 étapes s\'ouvre ', h('strong', {}, 'pré-rempli'), ' avec les données existantes']),
      h('li', {}, ['Modifiez ce que vous souhaitez et naviguez entre les étapes']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Enregistrer"'), ' à l\'étape 4']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['En tant qu\'admin, vous pouvez modifier ', h('strong', {}, 'toutes les contributions'), ' de votre structure, pas seulement les vôtres.']),
    ]),
  ]),

  collapse('🗑️ Supprimer une contribution', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'corbeille'), ' (', h('code', {}, 'fa-trash'), ') sur la carte du projet']),
      h('li', {}, ['Une modale de confirmation détaille exactement ce qui sera supprimé (contribution, fichiers, documents)']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Supprimer"'), ' pour confirmer']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ ', h('strong', {}, 'Action irréversible'), ' — La contribution, ses fichiers GeoJSON et tous les documents joints seront définitivement supprimés.']),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GÉRER LES CATÉGORIES                                           */
/* ======================================================================== */

export const AdminCategories = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🏷️'), ' Gérer les catégories']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Catégories, tags, icônes, layers et configuration des travaux'),

  collapse('📂 Créer ou modifier une catégorie', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Depuis les cartes d\'action, cliquez sur ', h('strong', {}, '"Gérer les catégories"')]),
      h('li', {}, ['La liste des catégories existantes s\'affiche pour la structure sélectionnée']),
      h('li', {}, ['Cliquez sur une catégorie pour la ', h('strong', {}, 'modifier'), ', ou sur ', h('strong', {}, '"Nouvelle catégorie"'), ' pour en créer une']),
      h('li', {}, ['Remplissez le formulaire :']),
    ]),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, 'Nom'), ' — Le nom affiché de la catégorie']),
      h('li', {}, [h('strong', {}, 'Icône FontAwesome'), ' — Choisissez via le sélecteur d\'icônes (bouton "Choisir") ou saisissez manuellement (ex: ', h('code', {}, 'fa-solid fa-bus'), ')']),
      h('li', {}, [h('strong', {}, 'Couleur'), ' — La couleur de la catégorie sur la carte']),
      h('li', {}, [h('strong', {}, 'Structure'), ' — Pré-sélectionnée depuis le landing']),
      h('li', {}, [h('strong', {}, 'Layers'), ' — Cochez les layers de la ville à associer (affichés en chips cliquables)']),
    ]),
  ], true),

  collapse('🔖 Gérer les tags', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Les tags sont attachés à une catégorie et permettent de sous-classer les projets.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Ajouter un tag'), ' — Renseignez le nom, l\'icône et la couleur, puis validez']),
      h('li', {}, [h('strong', {}, 'Modifier un tag'), ' — Cliquez sur le crayon, les champs deviennent éditables, cliquez sur "Enregistrer"']),
      h('li', {}, [h('strong', {}, 'Supprimer un tag'), ' — Cliquez sur la croix (×)']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['Les doublons de noms sont ', h('strong', {}, 'automatiquement vérifiés'), ' et bloqués.']),
    ]),
  ]),

  collapse('🔧 Configuration des travaux', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'La section travaux apparaît en bas du panneau catégories.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Activez ou désactivez les travaux avec l\'', h('strong', {}, 'interrupteur')]),
      h('li', {}, ['Configurez la ', h('strong', {}, 'source de données'), ' : données de la ville ou URL personnalisée']),
      h('li', {}, ['Définissez les ', h('strong', {}, 'types'), ' et les ', h('strong', {}, 'périodes'), ' à afficher']),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 La sauvegarde est ', h('strong', {}, 'automatique'), ' : le toggle est immédiat, les champs texte se sauvegardent après 800ms d\'inactivité.']),
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
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'En cliquant sur "Gérer les utilisateurs", la liste des membres de votre structure s\'affiche.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Chaque utilisateur est affiché en carte : ', h('strong', {}, 'email'), ', rôle (', badge('Admin', '#4E2BFF'), ' ou ', badge('Invited', '#555'), '), structures et date de création']),
      h('li', {}, ['Un badge ⚠️ apparaît si l\'utilisateur n\'a ', h('strong', {}, 'aucune structure assignée')]),
      h('li', {}, ['Barre de recherche par email en haut']),
      h('li', {}, ['Seuls les utilisateurs ', h('strong', {}, 'partageant vos structures'), ' sont visibles']),
    ]),
  ], true),

  collapse('📧 Inviter un nouvel utilisateur', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Inviter un utilisateur"'), ' en haut du panneau']),
      h('li', {}, ['Renseignez l\'', h('strong', {}, 'adresse email'), ' du nouvel utilisateur']),
      h('li', {}, ['Choisissez le ', h('strong', {}, 'rôle'), ' : ', h('code', {}, 'Admin'), ' ou ', h('code', {}, 'Invited')]),
      h('li', {}, ['La ', h('strong', {}, 'structure'), ' est automatiquement celle sélectionnée au landing']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Envoyer l\'invitation"')]),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['📧 L\'utilisateur recevra un ', h('strong', {}, 'email avec un lien magique'), ' pour se connecter instantanément.']),
    ]),
  ]),

  collapse('🔄 Promouvoir ou rétrograder', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-2' }, [
      h('li', {}, [h('strong', {}, 'Promouvoir'), ' un utilisateur "Invited" → bouton ', h('code', {}, '↑ Promouvoir en admin')]),
      h('li', {}, [h('strong', {}, 'Rétrograder'), ' un administrateur → bouton ', h('code', {}, '↓ Rétrograder en invited')]),
      h('li', {}, ['Une ', h('strong', {}, 'modale de confirmation'), ' résume le changement (email, structures, ancien/nouveau rôle)']),
      h('li', {}, ['L\'action est ', h('strong', {}, 'immédiate'), ' après confirmation']),
    ]),
  ]),

  collapse('🔐 Tableau des permissions', [
    h('table', { class: 'w-full text-sm border-collapse' }, [
      h('thead', {}, [
        h('tr', { class: 'bg-gray-50' }, [
          h('th', { class: 'text-left p-2 rounded-l-lg' }, 'Action'),
          h('th', { class: 'text-left p-2' }, 'Admin'),
          h('th', { class: 'text-left p-2 rounded-r-lg' }, 'Invited'),
        ]),
      ]),
      h('tbody', {}, [
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Voir les contributions'), h('td', { class: 'p-2' }, '✅ Toutes'), h('td', { class: 'p-2' }, '✅ Les siennes + approuvées')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Créer une contribution'), h('td', { class: 'p-2' }, '✅'), h('td', { class: 'p-2' }, '✅')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Modifier une contribution'), h('td', { class: 'p-2' }, '✅ Toutes'), h('td', { class: 'p-2' }, '⚠️ Les siennes uniquement')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Supprimer une contribution'), h('td', { class: 'p-2' }, '✅ Toutes'), h('td', { class: 'p-2' }, '⚠️ Les siennes uniquement')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Approuver / révoquer'), h('td', { class: 'p-2' }, '✅'), h('td', { class: 'p-2' }, '❌')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer les catégories'), h('td', { class: 'p-2' }, '✅'), h('td', { class: 'p-2' }, '❌')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer les utilisateurs'), h('td', { class: 'p-2' }, '✅'), h('td', { class: 'p-2' }, '❌')]),
        h('tr', {}, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer la structure'), h('td', { class: 'p-2' }, '✅'), h('td', { class: 'p-2' }, '❌')]),
      ]),
    ]),
  ]),
])

/* ======================================================================== */
/*  ADMIN — GÉRER MA STRUCTURE                                              */
/* ======================================================================== */

export const AdminStructure = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🏢'), ' Gérer ma structure']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Logos, carte par défaut et villes activées'),

  collapse('🚀 Accéder à la gestion de structure', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Depuis les cartes d\'action, cliquez sur ', h('strong', {}, '"Gérer ma structure"')]),
      h('li', {}, ['La modale d\'édition s\'ouvre avec les données de la ', h('strong', {}, 'ville sélectionnée au landing')]),
    ]),
  ], true),

  collapse('🖼️ Logos de la structure', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, [h('strong', {}, 'Logo principal'), ' (obligatoire) — Affiché dans la navigation et la page d\'accueil']),
      h('li', {}, [h('strong', {}, 'Logo mode sombre'), ' (optionnel) — Version alternative pour le thème sombre']),
      h('li', {}, [h('strong', {}, 'Favicon'), ' (optionnel) — Icône affichée dans l\'onglet du navigateur']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['Formats acceptés : ', h('strong', {}, 'SVG, PNG, JPG, WEBP'), '. Taille max : ', h('strong', {}, '2 Mo'), '. Upload par drag & drop ou clic sur la zone.']),
    ]),
  ]),

  collapse('🗺️ Carte par défaut', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Configurez le centre et le zoom par défaut de la carte pour votre ville.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Déplacez'), ' la carte pour définir le centre par défaut']),
      h('li', {}, [h('strong', {}, 'Zoomez'), ' pour définir le niveau de zoom par défaut']),
      h('li', {}, ['Les coordonnées (latitude, longitude, zoom) sont affichées en temps réel']),
    ]),
  ]),

  collapse('🌐 Villes activées', [
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, ['Liste des villes avec leurs logos et le ', h('strong', {}, 'nombre d\'administrateurs'), ' associés']),
      h('li', {}, ['Un badge ⚠️ apparaît si une ville a ', h('strong', {}, '0 administrateur')]),
      h('li', {}, ['Cochez/décochez pour activer ou désactiver une ville']),
    ]),
    h('div', { class: 'tip mt-3' }, [
      h('p', {}, ['💡 Le bouton ', h('strong', {}, '"Ajouter une structure"'), ' (+ dans le landing) est visible uniquement pour les ', h('strong', {}, 'administrateurs globaux'), ' (ceux dont la liste de villes contient "global").']),
    ]),
  ]),
])

/* ======================================================================== */
/*  CONTRIBUTEUR — GÉNÉRAL                                                  */
/* ======================================================================== */

export const ContribGeneral = D(() => [

  h('h2', {}, [h('span', { class: 'text-2xl' }, '🧭'), ' Général']),
  h('p', { class: 'text-sm text-gray-text mb-6' }, 'Connexion, accès aux outils et droits en tant que contributeur'),

  collapse('🔑 Se connecter', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Même système que pour les administrateurs : connexion par lien magique.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, [h('strong', {}, 'Ouvrez l\'email'), ' d\'invitation que vous avez reçu']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Se connecter"')]),
      h('li', {}, ['Vous êtes connecté — aucun mot de passe']),
    ]),
    h('div', { class: 'info mt-4' }, [
      h('p', {}, ['⏰ Session de ', h('strong', {}, '1 heure'), ', rafraîchissement automatique toutes les 4 minutes. Si la page ne répond plus, rechargez-la.']),
    ]),
  ], true),

  collapse('📂 Accéder à mes contributions', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur le bouton ', h('strong', {}, '"Proposer une contribution"'), ' (+) en bas à droite']),
      h('li', {}, [h('strong', {}, 'Sélectionnez votre structure'), ' dans le menu déroulant']),
      h('li', {}, ['Seule la carte ', h('strong', {}, '"Modifier mes contributions"'), ' est disponible']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['ℹ️ Vous voyez ', h('strong', {}, 'vos contributions'), ' et celles ', h('strong', {}, 'approuvées'), ' de votre équipe. Vous ne pouvez modifier et supprimer que ', h('strong', {}, 'les vôtres'), '.']),
    ]),
  ]),

  collapse('⚖️ Connaître mes droits', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'En tant que contributeur (rôle "invited"), voici ce que vous pouvez faire :'),
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
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Voir les contributions approuvées'), h('td', { class: 'p-2' }, '✅ Oui (lecture seule)')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Modifier les contributions d\'un autre'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Approuver / révoquer'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer les catégories'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', { class: 'border-b border-gray-100' }, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer les utilisateurs'), h('td', { class: 'p-2' }, '❌ Non')]),
        h('tr', {}, [h('td', { class: 'p-2', style: 'font-weight:500' }, 'Gérer la structure'), h('td', { class: 'p-2' }, '❌ Non')]),
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
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Vous voyez vos propres contributions et celles approuvées de votre équipe.'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1 mb-3' }, [
      h('li', {}, ['Vos projets sont identifiés par le badge ', badge('Votre contribution', '#2563eb')]),
      h('li', {}, ['Les boutons modifier (crayon) et supprimer (corbeille) n\'apparaissent que sur ', h('strong', {}, 'vos projets')]),
      h('li', {}, ['Les contributions des autres sont visibles en ', h('strong', {}, 'lecture seule'), ' si elles sont approuvées']),
    ]),
  ], true),

  collapse('🔍 Rechercher et filtrer', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Les mêmes outils de filtrage sont disponibles :'),
    h('ul', { class: 'text-sm text-gray-text list-disc pl-5 space-y-1' }, [
      h('li', {}, [h('strong', {}, 'Recherche'), ' par nom de projet']),
      h('li', {}, [h('strong', {}, 'Filtre'), ' par catégorie']),
      h('li', {}, [h('strong', {}, 'Tri'), ' : plus récentes, plus anciennes, nom A→Z ou Z→A']),
      h('li', {}, [h('strong', {}, '"Mes contributions uniquement"'), ' — Filtre rapide pour ne voir que les vôtres']),
    ]),
  ]),

  collapse('➕ Proposer un nouveau projet', [
    h('p', { class: 'text-sm text-gray-text mb-3' }, 'Le formulaire de création suit les mêmes 4 étapes que pour l\'administrateur.'),
    h('ol', { class: 'steps' }, [
      h('li', {}, [h('strong', {}, 'Étape 1 — Informations'), h('br'), 'Titre (obligatoire), description, catégorie (obligatoire), tags, URL officielle, image de couverture']),
      h('li', {}, [h('strong', {}, 'Étape 2 — Localisation'), h('br'), 'Upload d\'un fichier GeoJSON ou dessin sur la carte (ligne, polygone, point)']),
      h('li', {}, [h('strong', {}, 'Étape 3 — Style'), h('br'), 'Confirmation de la catégorie, icône et couleur']),
      h('li', {}, [h('strong', {}, 'Étape 4 — Documents'), h('br'), 'Ajout de fichiers (PDF, images) avec titre. Cliquez sur "Enregistrer"']),
    ]),
    h('div', { class: 'info mt-3' }, [
      h('p', {}, ['📌 Votre contribution sera en statut ', badge('En attente', '#F2B327'), ' jusqu\'à ce qu\'un administrateur l\'approuve.']),
    ]),
  ]),

  collapse('✏️ Modifier mon projet', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Repérez votre projet — il porte le badge ', badge('Votre contribution', '#2563eb')]),
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'crayon'), ' (', h('code', {}, 'fa-pen'), ')']),
      h('li', {}, ['Modifiez les informations souhaitées à travers les 4 étapes']),
      h('li', {}, ['Cliquez sur ', h('strong', {}, '"Enregistrer"'), ' à l\'étape 4']),
    ]),
  ]),

  collapse('🗑️ Supprimer mon projet', [
    h('ol', { class: 'steps' }, [
      h('li', {}, ['Cliquez sur l\'icône ', h('strong', {}, 'corbeille'), ' (', h('code', {}, 'fa-trash'), ') sur votre projet']),
      h('li', {}, ['Confirmez dans la modale de suppression']),
    ]),
    h('div', { class: 'warn mt-3' }, [
      h('p', {}, ['⚠️ ', h('strong', {}, 'Irréversible'), ' — Le projet et tous ses documents seront définitivement supprimés.']),
    ]),
  ]),
])
