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
  └→ GET /api/participer/confirm?token=            statut / publier / rejeter /
      accusé + lien de suivi                       doublon / supprimer
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
| `participer_events` | Historique horodaté : création, statuts, publication, demandes de retrait |
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

## Fonctions Netlify (routes `/api/participer/*`)

| Fichier | Route | Accès |
|---|---|---|
| `participer-config.mjs` | GET `/config?ville=` | public (whitelist de réglages) |
| `participer-geojson.mjs` | GET `/geojson?ville=` | public (signalements PUBLIÉS, props whitelistées) |
| `participer-detail.mjs` | GET `/detail?token=` ou `?ville=&id=` | public (suivi personnel / détail publié) |
| `participer-submit.mjs` | POST `/submit` | public (honeypot, quotas, photo 4 Mo max) |
| `participer-confirm.mjs` | GET `/confirm?token=` | public (double opt-in, redirige vers le suivi) |
| `participer-update.mjs` | POST `/update` | JWT + rôle revérifié serveur |
| `participer-retrait.mjs` | POST `/retrait` | public (droit d'effacement, consigné + email mairie) |
| `participer-scheduled.mjs` | planifiée `@daily` | purge non-confirmés (7 j), anonymisation (rétention par ville), alerte anti « module fantôme » |

Socle partagé : `lib/participer-common.mjs` (PostgREST/Storage clé service,
contexte ville, événements, hash d'IP salé, emails du module),
`lib/http.mjs` (CORS, JWT - extrait de `ai-common.mjs`),
`lib/mail.mjs` (transport Resend/Brevo - extrait de `demo-mail.mjs`).

Répartition des droits dans `/update` : contributeur = `set_statut` (sauf
`rejete`) + `photo_url` ; admin = tout (`publish`, `unpublish`, `rejete` avec
motif obligatoire, `delete`).

## Emails (transport `lib/mail.mjs`, Resend ou Brevo)

1. **Confirmation** au dépôt (sans elle, purge après 7 jours) ;
2. **Accusé** après confirmation : référence + lien de suivi ;
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

## RGPD - engagements tenus par le code

- Email jamais public, jamais exporté ; effacé (avec le hash d'IP) N mois
  après clôture (`retention_mois`, défaut 12) par la fonction planifiée.
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
  formulaire, contrats des endpoints, **test de fuite** (geojson sans email ni
  jetons). Ville dédiée `test-e2e` (module activé + seed).
- `tests/admin.participer.spec.js` (17.x) : file, réglages, CRUD catégories,
  édition statuts.
- `tests/invited.participer.spec.js` (18.x) : gating contributeur.

Non testable en E2E : placement du point (WebGL), parcours complet
dépôt → confirmation → modération (exige la boucle email réelle) - le contrat
serveur de chaque étape est couvert unitairement à défaut.

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
