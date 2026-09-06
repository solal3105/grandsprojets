# Mesure d'audience PostHog

Un seul module, `modules/analytics.js`, sert les huit espaces Open Projets. Il
est chargé par une balise `<script>` dans chaque page, expose `window.OPAnalytics`
et n'a besoin d'aucun build.

## Mise en service

1. Ouvrir `modules/analytics.js` et remplacer `POSTHOG_KEY` par la clé de projet
   (`phc_...`). C'est le SEUL endroit à modifier. La clé est publique par nature,
   comme la clé anon Supabase : ce sont les réglages du projet PostHog qui
   protègent les données.
2. Si le projet est en région **US** et non EU, changer quatre valeurs :
   - `UI_HOST` dans `modules/analytics.js` → `https://us.posthog.com`
   - les trois destinations `/ph/*` dans **`_redirects`** → `us-assets.i.posthog.com`
     (deux fois) et `us.i.posthog.com`
3. Dans les réglages du projet PostHog, activer **Discard client IP data** si
   vous voulez vous passer de la géolocalisation, ou l'anonymisation d'IP si vous
   voulez garder le pays. La collecte d'IP se règle côté serveur, pas ici.

Tant que la clé n'est pas renseignée, le module se charge, expose son API et ne
capte rien : aucune page n'est cassée pendant l'attente.

## Espaces branchés

| Espace | Fichier de la balise | `data-op-space` | Pages vues |
|---|---|---|---|
| Carte publique | `index.html` | `carte` | automatiques |
| Administration | `admin/index.html` | `admin` | manuelles (`admin/router.js`) |
| Fiche projet | `fiche/index.html` | `fiche` | automatiques |
| Hub ville | `ville/index.html` | `ville` | automatiques |
| Démo salon | `demo/index.html` | `demo` | automatiques |
| Les cartes des communes (stand) | `cartes/index.html` | `cartes` | automatiques |
| Carte postale | `carte-postale/index.html` | `carte-postale` | automatiques |
| Connexion | `login/index.html` | `login` | automatiques |
| Déconnexion | `logout/index.html` | `logout` | automatiques |
| Site vitrine (Vue) | `home-src/vite.config.js` | `home` | manuelles (`src/router/index.js`) |

Le home n'écrit pas la balise dans son `index.html` : le plugin `sharedAnalytics`
de `vite.config.js` l'injecte au build et sert le fichier de la racine en dev.
Sans cela, Vite préfixerait l'URL par la base `/home/` et le home chargerait une
copie divergente du module. L'injection se fait en `head-prepend` : les scripts
différés s'exécutent dans l'ordre du document, et le bundle Vue déclenche sa
navigation initiale dès son évaluation. Injectée après lui, la balise arrivait
trop tard et la page vue de `/home/` n'était jamais comptée.

## Attributs de la balise

| Attribut | Effet |
|---|---|
| `data-op-space` | Identifiant de l'espace, rattaché à tous les événements (obligatoire) |
| `data-op-pageview="manual"` | La page ne compte pas ses vues elle-même : c'est le routeur SPA qui les émet |
| `data-op-replay="off"` | Coupe l'enregistrement de session sur cet espace uniquement |

## API

```js
window.OPAnalytics.capture('demo_lead_submitted', { municipality: 'Gex' });
window.OPAnalytics.pageview({ route: 'contact' });   // SPA uniquement
window.OPAnalytics.identify(userId, { role, city }); // comptes connectés
window.OPAnalytics.reset();                          // déconnexion
window.OPAnalytics.setCity('metropole-lyon');        // super-propriété `city`
window.OPAnalytics.register({ embedded: true });     // super-propriétés libres
window.OPAnalytics.optOut() / optIn() / isOptedOut();
window.OPAnalytics.isEnabled() / disabledReason() / space();
```

Toujours appeler en optional chaining depuis le code applicatif
(`window.OPAnalytics?.capture(...)`) : un bloqueur de traceurs peut empêcher le
module de se charger, et aucune fonctionnalité ne doit en dépendre.

Les appels émis avant la fin du chargement de la librairie sont mis en file et
rejoués. Il n'y a donc pas d'ordre d'initialisation à respecter.

## Événements en place

| Événement | Espace | Ce qu'il sert à décider |
|---|---|---|
| `project_opened` | carte | Quels projets une ville doit mettre en avant |
| `module_opened` | carte | Quels modules (carte, travaux) vivent réellement |
| `category_opened` | carte | Quelles catégories méritent d'exister |
| `project_page_viewed` | fiche | Le référencement des fiches rapporte-t-il du trafic |
| `city_project_clicked` | ville | Le hub ville convertit-il vers les fiches |
| `demo_generation_started` | demo | Combien de communes sont testées en salon |
| `demo_generation_completed` | demo | Taux de réussite et durée réelle de génération |
| `demo_generation_failed` | demo | Où le tunnel casse, et à quelle phase |
| `demo_lead_submitted` | demo | La conversion de la démo salon |
| `demo_space_opened` | demo | Le visiteur ouvre-t-il l'espace généré |
| `demo_theme_toggled` | demo | Le stand préfère-t-il montrer la démo en clair ou en sombre |
| `cartes_ville_ouverte` | cartes | Quelles cartes déjà construites les passants ouvrent (scène, ruban, recherche ou retour de génération) |
| `cartes_generation_lancee` | cartes | Combien de passants demandent la carte d'une commune qui n'en a pas encore |
| `cartes_adresse_laissee` | cartes | La conversion d'une carte déjà construite (lien envoyé ou non) |
| `cartes_retour_veille` | cartes | Combien de cartes sont refermées par la veille, sans geste du visiteur |
| `contact_request_submitted` | home | La conversion du site vitrine, par `referrer` |
| `contact_request_failed` | home | Les demandes perdues sur erreur technique |
| `login_link_sent` | login | Les connexions demandées |
| `login_link_failed` | login | Les comptes bloqués à l'entrée |
| `login_github_started` | login | L'usage réel de la connexion GitHub |
| `contribution_created` | admin | La métrique d'activation d'un compte client |
| `contribution_approved` | admin | La modération est-elle suivie |

Convention : nom en anglais `snake_case`, propriétés en anglais `snake_case`.
Aucune adresse électronique, aucun nom de personne dans les propriétés
d'événement. Les seules données nominatives sont celles de `identify()`, réservé
aux comptes connectés de l'espace d'administration.

## Vie privée

Aucun bandeau de consentement. Les garde-fous qui rendent ce choix tenable :

- **Refus en un clic** sur `/home/confidentialite` (lien dans le pied de page du
  site vitrine), et `?tracking=off` ajouté à n'importe quelle URL du site produit
  le même effet depuis n'importe quel espace.
- **Do Not Track et Global Privacy Control respectés** : si le navigateur envoie
  l'un des deux signaux, rien n'est capté.
- **Proxy inverse `/ph/*`** (`_redirects`) : aucune requête vers un domaine
  tiers, cookie strictement première partie, `cross_subdomain_cookie: false`.
- **Le refus coupe aussi Google Analytics** (drapeau `ga-disable-<ID>`), sinon la
  page de confidentialité promettrait un arrêt qui n'a pas lieu.
- **Jeton d'authentification retiré des URL** (`sanitize_properties`) : un lien de
  connexion Supabase revient avec le jeton dans le fragment, il ne doit jamais
  partir vers PostHog.
- **Rien n'est mesuré dans les iframes du site** (vitrines du home) : les compter
  inventerait des visites de la carte. Dans une iframe cliente (portail Phaos),
  la visite est comptée mais l'enregistrement de session est coupé, faute de
  pouvoir y proposer le refus.
- **Pas de profil pour les visiteurs anonymes** (`person_profiles: 'identified_only'`).
- **Saisies masquées dans les enregistrements de session** (`maskAllInputs`).
  `data-op-mask` masque le texte d'un bloc entier, `data-op-noreplay` l'exclut
  complètement de l'enregistrement.

### Point à trancher côté juridique

L'enregistrement de session (session replay) n'entre pas dans l'exemption de
consentement que la CNIL accorde à la mesure d'audience anonyme. Il est
actuellement actif sur tous les espaces. Deux réponses possibles :

- le couper là où il n'est pas indispensable, en ajoutant `data-op-replay="off"`
  sur la balise de l'espace concerné (la carte publique en premier lieu, c'est
  celle que voient les administrés de nos clients) ;
- ou l'assumer, le documenter dans le registre des traitements et le mentionner
  explicitement sur `/home/confidentialite`.

Note commerciale : `home-src/src/views/AboutView.vue` annonce « sans traceurs » et
« Zéro traceur ». Cette promesse et la mesure sur la carte publique ne peuvent pas
coexister telles quelles.

## Ce qui n'émet jamais d'événement

Le module se désactive de lui-même, et l'expose via `disabledReason()` :

- navigateur piloté (`navigator.webdriver`) : toute la suite Playwright et le
  prérendu du home ;
- audit Lighthouse ou Chrome headless ;
- `localhost` et les aperçus `*.netlify.app` (forcer avec `?ph_debug=1`) ;
- iframe d'une page du site (vitrines du home) ;
- refus enregistré par le visiteur ;
- Do Not Track ou Global Privacy Control actif ;
- clé de projet non renseignée.

Le garde-fou `navigator.webdriver` est évalué **en premier**, et le test 15.2.2 de
`tests/unauth.analytics.spec.js` assère le motif exact : le retirer ferait tomber
le test au lieu de le laisser vert par accident. Sans lui, chaque exécution de la
suite polluerait les statistiques de production.

## Coexistence avec Google Analytics 4

GA4 (`G-8LGDVJXTPK`) reste en place sur le home, la fiche, le hub ville et la
carte (`modules/ga-init.js`). Les deux outils tournent en parallèle et comptent
séparément : leurs chiffres ne seront jamais identiques, GA4 étant bloqué par une
partie des bloqueurs de traceurs que le proxy `/ph/*` contourne.

Hotjar a été retiré : PostHog couvre les enregistrements de session et les cartes
de chaleur.
