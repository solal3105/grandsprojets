# Module Participer - signalements citoyens

Troisième module de la carte publique (avec `carte` et `travaux`) : les
habitants signalent un problème ou une idée en moins de 2 minutes, sans compte,
directement sur la carte de leur ville. La collectivité modère, traite et
répond ; l'habitant est tenu informé par email à chaque étape.

## Vue d'ensemble

```
Habitant (carte publique)                    Équipe (admin)
  formulaire 4 étapes                          /admin/participer/
  └→ POST /api/participer/submit               file de traitement
      email de confirmation (double opt-in)    └→ POST /api/participer/update
      sauf série en cours / navigateur reconnu     statut / publier / rejeter /
  └→ GET /api/participer/confirm?token=            doublon / supprimer
      transmet la série, un accusé groupé
  └→ carte : GET /api/participer/geojson           (JWT + rôle revérifiés serveur)
  └→ suivi : /?participer_suivi=<token>
```

Principe de sécurité central : les tables `participer_*` n'ont **aucune policy
anonyme**. Toute écriture publique passe par les fonctions Netlify avec la clé
de service (pattern `demo_runs`), la lecture équipe passe par la RLS
(`is_admin_for_ville` / `is_contributor_for_ville`). L'email du signaleur ne
sort JAMAIS vers le public (ni GeoJSON, ni détail, ni export CSV).

## Données (Supabase)

| Table | Rôle |
|---|---|
| `participer_categories` | Catégories par ville : label, icône, couleur, ordre, actif, texte d'aide |
| `participer_statuts` | Affichage des 7 statuts par ville : libellé, couleur, ordre, notification email |
| `participer_settings` | Réglages par ville : textes, email mairie, pause, quotas, alerte, rétention |
| `participer_signalements` | Les dépôts : position (lat/lng), catégorie, statut, email, jetons, publication |
| `participer_events` | Historique horodaté : création, statuts, publication, dépublication, suppression, demandes de retrait |
| `participer_compteurs` | Compteur de références par ville/année (`TES-2026-0042`) |

- **7 clés machine de statut FIXES** (CHECK en base) : `nouveau`,
  `pris_en_compte`, `en_cours`, `resolu`, `rejete`, `hors_competence`,
  `doublon`. Tout l'affichage est administrable, les clés jamais (leçon de
  l'incohérence des états travaux).
- Fonctions SQL : `participer_next_reference(ville)` (compteur atomique),
  `participer_seed_ville(ville)` (seed idempotent, appelé à l'activation).
- Storage : bucket privé `participer-photos` (aucune policy, clé service
  uniquement, URL signées) ; à la publication la photo est copiée dans le
  bucket public `uploads` sous `participer/<ville>/`.
- **Privilèges par colonne** (et pas seulement RLS) : `authenticated` n'a le
  droit de lire ni `email`, ni `ip_hash`, ni `confirm_token`, ni `suivi_token`
  sur `participer_signalements`, ni `contact_email`/`author_ip_hash` sur
  `participer_events`. La policy RLS laisse passer tout membre d'équipe d'une
  ville (`is_contributor_for_ville` ne teste aucun rôle) : sans ces grants, un
  compte contributeur pouvait lire le jeton de suivi, qui est un porteur
  permanent. Le serveur passe par la clé de service, non concernée.
- `participer_events.signalement_id` est nullable avec `ON DELETE SET NULL` :
  la trace de suppression survit à la suppression du signalement.
- `participer_signalements.appareil_hash` : empreinte salée de l'identifiant
  que le navigateur tire au hasard (voir « Une confirmation par navigateur »).
  Aucun grant de lecture pour `authenticated`, effacée par l'anonymisation.
- `participer_signalements.retour_url` : page du site de la collectivité où
  l'habitant suit un dépôt fait depuis ce site (voir « Dépôt depuis le site
  d'une collectivité »). Pas une donnée personnelle, donc gardée par
  l'anonymisation ; aucun grant de lecture pour `authenticated`. Migration
  `20261029120000_participer_retour_site.sql`, à appliquer avant de déployer
  le code qui la lit.

## Une confirmation par navigateur

Le navigateur tire au premier dépôt un UUID qu'il garde dans son stockage
local (`op.participer.appareil`) et joint à chaque dépôt (`appareil`). Le
serveur n'en garde que l'empreinte (`hashAppareil`, même sel que le hash
d'IP). `participer-submit` rend alors un `etat` :

| `etat` | Condition (même ville, même adresse, même empreinte) | Email |
|---|---|---|
| `transmis` | un signalement confirmé existe : l'adresse est déjà prouvée | accusé seulement, transmis tout de suite |
| `ajoute` | un dépôt de moins d'une heure (`LOT_FENETRE_MINUTES`) attend sa confirmation | aucun, le lien déjà envoyé le transmettra |
| `a_confirmer` | sinon, ou dépôt sans identifiant | email de confirmation, comme avant |

Un clic sur n'importe quel lien de confirmation transmet tous les dépôts en
attente du même navigateur avec la même adresse (`transmettreDepots`, partagé
par `participer-confirm` et le cas `transmis`) : un seul accusé qui liste les
références et leurs liens de suivi, une seule alerte mairie. L'UPDATE filtré
sur `email_confirmed=false` sérialise les clics concurrents. Si la
transmission directe échoue, le dépôt retombe sur l'email de confirmation.

La reconnaissance s'éteint d'elle-même : un signalement anonymisé n'a plus ni
adresse ni empreinte, un navigateur dont on efface les données tire un nouvel
identifiant. L'adresse saisie n'est rappelée que le temps de l'onglet
(`sessionStorage`), pour enchaîner les points sans la montrer au visiteur
suivant d'un appareil partagé. Après chaque envoi, le panneau propose
« Signaler un autre point ».

## Dépôt depuis le site d'une collectivité

Une collectivité qui a son propre site (module Sites, dépôt
`openprojets-sites`) peut y placer un formulaire de signalement. Le site
appelle les mêmes routes que la carte, depuis le navigateur du visiteur :
l'IP comptée par les quotas reste donc celle du visiteur, et tous les
garde-fous s'appliquent à l'identique (module actif, pause, quotas par IP et
par adresse, piège à robots, double confirmation, photo bornée). Le
signalement arrive dans la même file de traitement que ceux de la carte.

### Autoriser un site

La variable `PARTICIPER_ORIGINES_SITES` rattache chaque origine de site à une
ville, en entrées `ville=origine` séparées par des virgules :

```
PARTICIPER_ORIGINES_SITES=pays-ozon=https://www.pays-ozon.fr,pays-ozon=https://pays-ozon.fr,saint-symphorien=https://www.saint-symphorien.fr
```

- Une origine est exacte : schéma, hôte et port, sans chemin ni barre finale
  (la barre finale est tolérée). Un site qui répond à plusieurs adresses
  (avec et sans `www`) a une entrée par adresse.
- Hors développement, seules les origines `https` sont lues. Une entrée mal
  écrite est ignorée et signalée une fois dans les journaux de la fonction
  (`[participer-sites] entrée ignorée`), jamais devinée.
- En développement local (`netlify dev`, qui pose `NETLIFY_DEV=true`), trois
  formes de plus sont lues : une origine `http`, un motif d'un seul niveau de
  sous-domaine (`http://*.localhost:3000`) et la ville `*` (toutes les
  villes). Pour les sites locaux du module Sites :
  `PARTICIPER_ORIGINES_SITES=*=http://*.localhost:3000` dans le `.env` local.
  Partout ailleurs ces formes sont ignorées.
- La liste est relue à chaque appel : la changer demande un redéploiement
  sur Netlify (les variables y sont figées au déploiement), pas de code.

Le choix d'une variable plutôt que d'une table : les adresses des sites
vivent dans la base du module Sites (schéma `sites`, collection
`collectivites`), que l'API PostgREST de grandsprojets ne sert pas et dont la
forme suit les migrations de Payload. Une variable garde les deux projets
indépendants, au prix d'une saisie en double à la mise en ligne d'un site.
Si le nombre de sites grandit, la bonne suite est une vue publique en base
(`ville`, `origine`) alimentée par le module Sites, lue ici à la place de la
variable.

Le rattachement est garanti pour les navigateurs : le préflight CORS répond à
tout site de la liste (il ne porte pas le corps, donc pas la ville), puis le
dépôt est refusé en 403 si l'origine est celle d'un site rattaché à une autre
ville. Il ne protège pas d'un script qui forge son en-tête `Origin` : un tel
appel pouvait déjà déposer dans n'importe quelle ville, et ce sont les quotas,
le piège à robots et la confirmation par email qui l'arrêtent. Les origines
d'Open Projets (`https://openprojets.com`, ports locaux 3001 et 8888) servent
toutes les villes, comme avant.

### Lire la configuration

`GET /api/participer/config?ville=<ville>` (CORS ouvert) rend :

```json
{
  "enabled": true,
  "categories": [{ "category_key": "voirie", "label": "Voirie", "icon_class": "fa-solid fa-road",
                   "color": "#2563EB", "help_text": "Texte d'aide", "sort_order": 1, "enabled": true }],
  "statuts": [{ "statut_key": "nouveau", "label": "Nouveau", "color": "#6B7280", "sort_order": 1 }],
  "settings": { "intro_text": null, "success_text": null, "paused": false,
                "pause_message": null, "retention_mois": 12 }
}
```

`{ "enabled": false }` quand le module n'est pas activé pour la ville : le
site n'affiche alors pas le formulaire. `settings.paused` signale une pause,
avec son message ; un dépôt fait pendant la pause est refusé. La mention
légale du formulaire annonce `retention_mois`, jamais une durée écrite en dur.

### Déposer

`POST /api/participer/submit`, `Content-Type: application/json` :

| Champ | Obligatoire | Contenu |
|---|---|---|
| `ville` | oui | code de l'espace (`city_branding.ville`), celui auquel le site est rattaché |
| `email` | oui | adresse de l'habitant, 180 caractères au plus |
| `category_key` | oui | une catégorie active de la configuration |
| `lat`, `lng` | oui | position du point (nombres) |
| `description` | non | 1 000 caractères au plus |
| `adresse` | non | adresse lisible du point, 300 caractères au plus |
| `photo` | non | data URL `image/webp`, `image/jpeg` ou `image/png`, 4 Mo au plus ; à ré-encoder dans le navigateur pour en retirer les EXIF, comme la carte |
| `appareil` | non | UUID tiré au hasard par le navigateur et gardé dans son stockage local, pour la confirmation par navigateur (voir plus haut) |
| `retour` | non | page du site où l'habitant suit son signalement (voir ci-dessous) |
| `website` | non | piège à robots : champ caché, laissé vide |

Réponses, toujours en JSON :

| Statut | Corps | Sens |
|---|---|---|
| 200 | `{ ok: true, etat: 'a_confirmer' }` | email de confirmation envoyé |
| 200 | `{ ok: true, etat: 'ajoute', en_attente: n }` | rejoint une série en attente, aucun email |
| 200 | `{ ok: true, etat: 'transmis', reference }` | navigateur reconnu, transmis tout de suite |
| 200 | `{ ok: true }` | piège à robots rempli, rien n'est enregistré |
| 400 | `{ error }` | champ invalide, catégorie inconnue, adresse de retour refusée |
| 403 | `{ error }` | site rattaché à une autre ville, ou dépôts suspendus (le message de pause est rendu) |
| 404 | `{ error }` | module non actif pour la ville |
| 429 | `{ error }` | quota du jour atteint (par IP ou par adresse) |
| 502, 503, 500 | `{ error }` | email de confirmation impossible, service non configuré, erreur interne |

Les messages `error` sont écrits pour l'habitant et peuvent être affichés
tels quels.

### Ramener l'habitant sur le site

Le champ `retour` est l'adresse complète d'une page du site, par exemple
`https://www.pays-ozon.fr/signaler/suivi`. Elle n'est acceptée que si son
origine est celle d'un site rattaché à la ville du dépôt ; sinon le dépôt
est refusé en 400, jamais redirigé ailleurs. Elle est gardée avec le
signalement (`participer_signalements.retour_url`), fragment retiré.

Le lien de confirmation passe toujours par
`/api/participer/confirm?token=` (c'est lui qui prouve l'adresse), puis
redirige vers la page de retour avec le jeton de suivi :
`https://www.pays-ozon.fr/signaler/suivi?participer_suivi=<jeton>`. L'accusé
de réception et les emails de changement de statut mènent à la même adresse.
Si le module a été désactivé entre-temps, la redirection vise
`<retour>?participer=module-inactif`. La page du site lit le jeton, le
retire de sa barre d'adresse (c'est un porteur permanent) et affiche le suivi
avec `GET /api/participer/detail?token=<jeton>` (CORS ouvert), qui rend
`{ own, signalement, events }` sans aucune donnée personnelle.

L'adresse gardée est revalidée à chaque email : un site retiré de
`PARTICIPER_ORIGINES_SITES` ne reçoit plus de lien, l'habitant retombe sur la
carte de la ville. Sans `retour`, rien ne change : les liens mènent à la
carte.

La demande de retrait (`POST /api/participer/retrait`) n'accepte pas encore
l'origine des sites : un site qui affiche des signalements publiés renvoie
vers la carte pour cette demande.

## Fonctions Netlify (routes `/api/participer/*`)

| Fichier | Route | Accès |
|---|---|---|
| `participer-config.mjs` | GET `/config?ville=` | public (whitelist de réglages) |
| `participer-geojson.mjs` | GET `/geojson?ville=` | public (signalements PUBLIÉS, props whitelistées) |
| `participer-detail.mjs` | GET `/detail?token=` ou `?ville=&id=` | public (suivi personnel / détail publié) |
| `participer-submit.mjs` | POST `/submit` | public (honeypot, quotas, photo 4 Mo max) ; CORS : nos origines + sites de `PARTICIPER_ORIGINES_SITES` |
| `participer-confirm.mjs` | GET `/confirm?token=` | public (double opt-in, transmet toute la série du navigateur, redirige vers le suivi) |
| `participer-update.mjs` | POST `/update` | JWT + rôle revérifié serveur |
| `participer-retrait.mjs` | POST `/retrait` | public (droit d'effacement, consigné + email mairie) |
| `participer-scheduled.mjs` | planifiée `@daily` | purge non-confirmés (7 j, par lots de 100), anonymisation (rétention par ville, signalements + contacts de retrait), alerte anti « module fantôme » (jalonnée seulement si l'email part) |

Socle partagé : `lib/participer-common.mjs` (PostgREST/Storage clé service,
contexte ville, événements, hash d'IP salé, emails du module),
`lib/participer-sites.mjs` (origines des sites de collectivité, adresse de
retour),
`lib/http.mjs` (CORS, JWT - extrait de `ai-common.mjs`),
`lib/mail.mjs` (transport Resend/Brevo - extrait de `demo-mail.mjs`).

Répartition des droits dans `/update` : contributeur = `set_statut` (sauf
`rejete`) + `photo_url` ; admin = tout (`publish`, `unpublish`, `rejete` avec
motif obligatoire, `delete`).

## Emails (transport `lib/mail.mjs`, Resend ou Brevo)

1. **Confirmation** au dépôt (sans elle, purge après 7 jours) ; pas d'email
   pour un dépôt qui rejoint une série en cours ni depuis un navigateur
   reconnu ;
2. **Accusé** après confirmation : référence + lien de suivi, un seul message
   pour tous les signalements transmis ensemble ;
3. **Changement de statut** si `notify` est actif sur ce statut, avec le
   message public de l'agent ;
4. **Mairie** (`participer_settings.notify_email`) : nouveau signalement,
   demande de retrait, alerte « N signalements sans traitement depuis X jours »
   (au plus une par 6 jours, jalonnée par `last_alert_at`).

Expéditeur : domaine déjà vérifié (`bonjour@openprojets.com`), surchargeable
par `PARTICIPER_MAIL_FROM`. Réponses routées vers l'email de la mairie.
Pour un hébergement européen des emails citoyens, configurer `BREVO_API_KEY`
(sans `RESEND_API_KEY`).

## Carte publique

- `modules/participer/participer-views.js` : formulaire, explorateur, couche,
  modal détail (réutilise `#project-detail`), deep-link
  `?participer_suivi=<token>` (jeton retiré de l'URL au chargement et masqué
  dans les pageviews PostHog par `modules/analytics.js`).
- `modules/participer/participer-nav.js` : renderer NavPanel
  (`clearLayers: false` - les signalements se superposent aux projets).
  Sections L2 : Signaler, Explorer, + « Traitement » (badge compteur, lien vers
  l'admin) pour l'équipe.
- CSS : `styles/participer.css` (préfixe `pt-`).
- Photos : ré-encodées via canvas côté client (EXIF supprimés, 1600 px max,
  webp) AVANT envoi - jamais l'original.
- Événements PostHog : `participer_submitted`, `participer_detail_opened`,
  `participer_published`, `participer_status_changed` (+ `module_opened`
  automatique).

## Admin

- `admin/sections/participer.js` + `admin/sections/participer/` (modèle
  diagnostic) : `list.js` (file, onglets, recherche, export CSV **sans donnée
  personnelle**), `detail.js` (panneau latéral : photo signée, mini-carte,
  historique, actions), `config.js` (réglages, catégories, statuts).
- Accessible aux contributeurs (file + statuts) ; configuration et modération
  réservées aux admins (gate in-render + revérification serveur).
- Activation d'une ville : `/admin/modules/` (global admin) → le template
  `participer` de `MODULE_TEMPLATES` upsert `city_modules` puis seed les
  7 statuts et 6 catégories par défaut (orientées projets/chantiers, pas
  voirie générique : positionnement en complément des GRC existantes).

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | requis - toutes les écritures serveur |
| `RESEND_API_KEY` ou `BREVO_API_KEY` | requis - sans clé, le dépôt est refusé (l'habitant attendrait un email qui ne part pas) |
| `PARTICIPER_MAIL_FROM` | optionnel - expéditeur (défaut : `Open Projets <bonjour@openprojets.com>`) |
| `PARTICIPER_IP_SALT` | optionnel - sel du hash d'IP (défaut : dérivé de la clé de service) |
| `PARTICIPER_ORIGINES_SITES` | optionnel - sites de collectivité autorisés à déposer, `ville=origine` séparés par des virgules (voir « Dépôt depuis le site d'une collectivité ») |

## RGPD - engagements tenus par le code

- Email jamais public, jamais exporté, jamais servi à un navigateur (grants
  par colonne) ; effacé avec le hash d'IP et l'empreinte du navigateur N mois
  après clôture
  (`retention_mois`, défaut 12) par la fonction planifiée, de même que le
  contact laissé dans une demande de retrait.
- Rien de textuel ni photo n'est public avant modération (`published`).
- EXIF supprimés au dépôt ; photos privées jusqu'à publication.
- Bouton public « demander le retrait de ce contenu » sur chaque signalement
  publié (événement interne + email mairie).
- Jeton de suivi masqué dans PostHog et retiré de la barre d'adresse.
- Mention dédiée dans `/home/confidentialite` (section signalements).
- Mode pause administrable (congés, période électorale) ; pas de compteur
  public de performance par défaut.

## Tests

- `tests/unauth.participer.spec.js` (16.x) : bouton et panneau, garde-fous du
  formulaire, série de points avec serveur simulé (16.1.7 : même identifiant,
  adresse gardée, trois écrans de fin), contrats des endpoints, **test de
  fuite** (geojson sans email ni jetons). Ville dédiée `test-e2e` (module
  activé + seed).
- `tests/unauth.participer-sites.spec.js` (16.3) : dépôt depuis un site,
  sans serveur ni base (fonctions importées, `fetch` simulé) : rattachement
  d'une origine à sa ville, motifs réservés au développement, préflight,
  refus avant tout appel à la base, adresse de retour refusée hors des sites
  de la ville, retour gardé à l'insertion, accusé et redirection de
  confirmation vers le site, repli sur la carte quand le site est retiré.
- `tests/admin.participer.spec.js` (17.x) : file, réglages, CRUD catégories,
  édition statuts.
- `tests/invited.participer.spec.js` (18.x) : gating contributeur.

Non testable en E2E : placement du point au clic (WebGL ; 16.1.7 passe par
« Utiliser ma position »), parcours complet dépôt → confirmation → modération
(exige la boucle email réelle). La série a été vérifiée à la main le
30/09/2026 sur `test-e2e` avec l'adresse de test `delivered+...@resend.dev`
(aucune boîte réelle), lignes supprimées ensuite.

En local, `netlify dev` n'injecte pas `SUPABASE_SERVICE_ROLE_KEY` (même limite
que demo-generate) : les tests qui en dépendent SAUTENT explicitement au lieu
d'échouer. Pour les exécuter en local, ajouter la clé dans un fichier `.env` à
la racine (chargé par netlify dev, jamais commité).

## Reste à faire (V2, hors périmètre V1)

Soutiens « moi aussi », suggestion de doublons au dépôt, actions depuis
l'email de notification, floutage automatique visages/plaques, statistiques
avancées et transparence publique opt-in, routage par service, réouverture
par l'habitant. Kit juridique (DPA, modèle d'AIPD, charte de modération) :
livrables documentaires à produire hors code.
