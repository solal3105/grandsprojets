# Démo salon : génération en direct de la carte d'une commune

Écran plein format (« Tapez le nom de votre commune ») qui génère en direct
l'espace Open Projets d'une commune à partir de sources publiques : site de la
mairie (logo, couleur, pages projets, texte des PDF officiels), presse locale
(Google News), marchés publics de travaux (BOAMP, avis complet). Sélection par
IA en une passe avec citation obligatoire, puis **fusion multi-sources** :
chaque projet agrège toutes les sources qui le mentionnent, ce qui lui donne
l'adresse officielle de l'avis de marché, le récit et les visuels de la page de
la mairie, et le contexte de la presse.

**Aucun plafond sur le nombre de projets.** Les anciens plafonds (12 puis 18)
bridaient le résultat exactement là où le prospect est le plus gros : sur les 22
premières communes générées, Bordeaux rendait 7 fiches et Montpellier 5, quand
une métropole a des dizaines d'opérations en cours. Ce n'était pas la preuve qui
manquait, c'était la place. Conséquence assumée : une petite commune se génère
toujours en 2 à 3 minutes, une métropole peut demander 5 à 6 minutes.

## Deux règles de fond

**Aucune position inventée.** Un projet qu'on ne sait pas situer, au moins à la
maille du quartier, est retiré de la carte. La localisation procède par étages :
adresse postale (BAN), emprise ou tracé réels (Nominatim), quartier statistique
IRIS, puis en dernier recours une requête IA qui propose un lieu géocodable.
Une carte qui invente des emplacements devant un élu qui connaît sa commune
coûte plus cher qu'une carte moins fournie.

**Aucune affirmation hors source.** Le rédacteur ne reçoit que l'extrait des
sources réellement collectées, avec consigne de préférer trois lignes exactes à
quinze lignes plausibles. Une illustration n'est retenue que si elle provient du
bloc de page consacré au projet ; à défaut, une photo générique du type
d'ouvrage est proposée, explicitement créditée comme telle.

## URLs

- `/demo/` : écran de saisie (autocomplétion officielle geo.api.gouv.fr)
- `/demo/?commune=<INSEE>&nom=<Nom>&auto=1` : lancement direct (liens de prospection)
- `/demo/?commune=<INSEE>&regen=1` : **refait** le recensement d'une commune déjà
  générée au lieu d'ouvrir son espace. L'adresse de l'espace ne change pas, ses
  fiches sont remplacées : un lien de prospection déjà envoyé reste valide.
  Le même geste est proposé à l'écran (bouton « Refaire le recensement »)
  lorsqu'on retombe sur une commune déjà générée.
- Espaces créés : `/?city=essai-<commune>` (préfixe `essai-` systématique)
- Codes INSEE acceptés : métropole (`69244`), **Corse (`2A004`, `2B033`)**,
  outre-mer (`97411`). La lettre corse est en deuxième position, pas en
  troisième : c'est le piège qui rendait la Corse indémontrable.

## Ce qu'on récolte

- **Adresse en fin de parcours** : l'écran de fin propose de recevoir le lien de
  la carte, avec une échappatoire discrète (« Continuer sans laisser
  d'adresse »). Le compte à rebours de redirection ne démarre qu'une fois
  l'étape tranchée, avec un filet de 45 s pour qu'un écran de salon ne reste
  jamais bloqué. Route `POST /api/demo-lead`, table `demo_leads`.
- **Journal des générations** : table `demo_runs`, une ligne par tentative,
  ouverte en `running` puis close en `ready` ou `failed`, avec l'étape atteinte,
  le motif d'échec, la durée RÉELLE (de la première invocation à la dernière) et
  les tokens consommés. Une ligne restée `running` est une information : le
  visiteur a fermé l'onglet en route. Avant, `demo_instances` ne gardait que les
  succès et effaçait tout le reste.

Les deux tables sont en RLS **sans aucune politique** : elles ne sont lisibles
que par la clé de service, côté serveur. Une adresse laissée par un élu n'a rien
à faire derrière la clé publique.

### Le message envoyé au visiteur

`netlify/functions/lib/demo-mail.mjs` compose et expédie le message. Ce n'est
pas une route : le fichier vit dans `lib/` précisément pour que Netlify ne le
prenne pas pour une fonction.

**Deux variables d'environnement à poser pour que l'envoi ait lieu**, l'une ou
l'autre selon le fournisseur retenu :

| Variable | Fournisseur |
|---|---|
| `RESEND_API_KEY` | Resend (`api.resend.com`) |
| `BREVO_API_KEY` | Brevo (`api.brevo.com`, hébergement européen) |

Deux réglages facultatifs : `DEMO_MAIL_FROM` (par défaut
`Open Projets <bonjour@openprojets.com>`) et `DEMO_MAIL_REPLY_TO`.

**Sans clé, rien n'est envoyé** : le lead est enregistré avec
`mail_status = 'non_configure'`, l'écran remercie sans promettre de lien, et un
avertissement part dans les logs. Jamais de promesse non tenue à un visiteur.

Le **domaine d'expédition doit être vérifié chez le fournisseur** (SPF, DKIM),
sinon les messages partent en indésirable ou sont refusés. C'est la seule étape
que le code ne peut pas faire à votre place.

Le contenu dit franchement que la carte a été construite **sans la
collectivité**, à partir des seules sources publiques, et qu'elle est donc
incomplète. Ce n'est pas de la modestie : un élu qui y trouve une erreur nous
l'imputerait, et ce qui manque est précisément ce que la collectivité
apporterait. Le message porte aussi la mention d'où vient l'adresse et comment
ne plus être contacté.

Suivi : `select mail_status, count(*) from demo_leads group by 1;`

## Garde-fous

- Idempotence : une commune déjà générée redirige vers l'espace existant, sauf
  `regen=1` qui refait le recensement
- Quotas : 80 générations/jour au global, 15 par IP (constantes en tête de
  `netlify/functions/demo-generate.mjs`). Pour le salon : définir la variable
  d'env `DEMO_KIOSK_KEY` et ouvrir `/demo/?kiosk=1&k=<clé>` : le quota par IP
  est levé pour cet écran (le plafond global reste)
- Diagnostic : `DEMO_DEBUG=1` en variable d'env renvoie le détail technique
  des erreurs au navigateur (désactivé par défaut)
- Génération en 6 invocations SSE courtes (sources → ai → locate → media →
  redact → create), état dans `demo_instances.status/payload`, reprise
  automatique côté client en cas de coupure ; échec « sources insuffisantes »
  mémorisé en statut `failed` (aucun re-coût IA)
- **Phases découpées en tranches** : `locate` et `media` travaillent pendant un
  budget borné (22 s) puis rendent la main en redemandant LA MÊME phase, qui
  reprend à son curseur. Sans cela, le déplafonnement du nombre de projets
  ferait perdre tous les projets au-delà du budget. Filet anti-boucle : 14
  tranches maximum, après quoi on finalise avec ce qu'on a
- **Reprises bornées** : 4 par phase, et 12 au total pour une génération, ce
  second compteur n'étant jamais rechargé. Le compteur par phase seul rendait
  possible une boucle sans fin qui repayait l'IA à chaque tour
- Qualité : projet rejeté si sa source n'a pas été réellement collectée, si la
  confiance est basse, s'il géocode hors du contour de la commune, ou si aucun
  emplacement n'est identifiable ; deux fiches sont fusionnées si elles sont à
  moins de 250 m ET partagent deux mots distinctifs, ou à moins de 80 m et un
  seul (un seul mot à 250 m supprimait des projets réels : « avenue Berthelot »
  et « résidence Berthelot ») ; une position DÉJÀ OCCUPÉE écarte le projet, car
  un emplacement partagé par plusieurs fiches n'est celui d'aucune (mesuré sur
  Saint-Denis : cinq avis de marché sans lieu propre rabattus sur le même
  polygone) ; moins de 3 projets situés = message d'orientation vers un contact
  humain
- L'écran distingue ce qui est écarté faute d'emplacement vérifiable de ce qui
  est fusionné pour cause de doublon : les confondre revenait à mentir sur le
  motif du rejet
- SEO : villes `essai-*` exclues du sitemap et du llms.txt, hubs et fiches en
  noindex
- Modèle IA : `gpt-4o` (surchargable via `DEMO_OPENAI_MODEL`). Les appels de
  vision ont leur propre variable `DEMO_OPENAI_VISION_MODEL`, qui pointe par
  défaut sur le même modèle : **ne pas y mettre un modèle léger**, mesure faite
  le juge d'image y passe de 953 à 13 565 tokens d'entrée par appel, ces
  modèles facturant les images à un tarif de tokens bien plus élevé
- Coût IA : chaque appel journalise ses tokens (`[demo-tokens] <schéma> input= output= total=`)
  et le cumul est persisté dans `demo_runs.tokens_in` / `tokens_out`. Le
  compteur est remis à zéro en tête de chaque invocation : sans cela, un
  conteneur de fonction réutilisé cumulait depuis son démarrage et annonçait
  deux à quatre fois la dépense réelle

## Appels IA

| Appel | Quand | Ordre de grandeur |
|---|---|---|
| `projets` | une fois, le gros morceau | ~35 000 tokens d'entrée |
| `articles_projets` | un lot de 3 fiches | ~2 500 entrée / 1 000 sortie |
| `choix_image` | un par projet, images en `detail: 'low'` | ~950 tokens |
| `logo_commune` | une fois, jusqu'à 4 candidats en `detail: 'low'` | ~400 tokens |
| `lieux_projets` | une fois, seulement s'il reste des projets à situer | ~1 000 tokens |
| `themes_illustration` | une fois, seulement s'il reste des fiches sans photo | ~700 tokens |
| `tri_boamp` | **conditionnel** : seulement si les avis dépassent le plafond | ~4 500 tokens |

Trois de ces appels ont remplacé des règles écrites en dur :

- `logo_commune` remplace 60 lignes de score et deux listes de mots relevées
  commune par commune. Un modèle qui REGARDE l'image voit qu'un logo est en
  version blanche, donc invisible sur l'interface ; un motif textuel ne le peut
  pas. Il coûte moins que l'ancien appel couleur, qui envoyait une image en
  pleine résolution.

### Installation du logo

Le logo est tenté sur **tous** les candidats retenus, dans l'ordre, jusqu'à ce
que l'un se télécharge. Une seule tentative, sans repli et sans trace, faisait
perdre le logo sur un simple délai dépassé : relevé en base, 7 espaces sur 27
sans logo, dont deux communes dont le logo se télécharge parfaitement quand on
rejoue la séquence. Trois corrections :

- **cascade** sur les candidats du scoring puis l'icône déclarée du site ;
- **délai propre de 15 s** au lieu des 8 s du moissonnage : c'est un fichier
  unique et petit, pas une page de site à parcourir ;
- **type lu dans les octets**, pas dans l'en-tête déclaré. Un serveur qui rend
  une page d'erreur en annonçant `image/png`, ou une image en annonçant
  `text/plain`, trompait le contrôle dans un sens comme dans l'autre.

Chaque échec est désormais journalisé avec son motif. Auparavant le `catch`
était muet : l'espace prenait le logo Open Projets et personne ne savait que la
commune en avait un.
- `themes_illustration` remplace 18 familles d'ouvrages écrites en dur, dont les
  requêtes étaient en français alors que Wikimedia Commons est indexé en
  anglais.
- `tri_boamp` remplace un tri par récence pure qui évinçait une ZAC majeure
  derrière vingt réfections de trottoir récentes.

À l'inverse, trois endroits restent volontairement SANS IA, parce qu'un appel y
serait du gaspillage : le classement des liens du site de la mairie, le
nettoyage des menus de page, et l'extraction du texte des PDF.

## Collecte sur le site de la commune

**C'est la source la plus précieuse**, loin devant les marchés publics : elle
seule raconte les projets. Trois défauts la bridaient, tous corrigés et mesurés
sur un panel de 18 communes réelles.

| | Avant | Après |
|---|---|---|
| Liens de projet repérés depuis l'accueil | 252 | **303** |
| Pages filles atteintes au second niveau | 60 | **392** |
| Part de menu retirée du texte envoyé à l'IA | 0 % | **jusqu'à 40 %** |

1. **Extraction des liens.** Le libellé était borné à 120 caractères *dans le
   motif*, ce qui faisait échouer le motif entier dès qu'un lien contenait du
   balisage imbriqué. Sur Bourgoin-Jallieu, 108 liens sur 169 étaient perdus,
   dont la rubrique « Les grands projets » qui regroupe tout le contenu utile.
   Les adresses contenant une ancre étaient également rejetées en bloc.
2. **Déclenchement du second niveau.** Il exigeait 45 points de score de
   libellé. Le barème n'accorde 60 points qu'à « grands projets » et 40 à
   « ZAC » : une page nommée « Travaux », le nom le plus courant pour la page
   qui recense les chantiers, plafonne à 23 et n'était donc **jamais dépliée**.
   Un sommaire se reconnaît désormais à ce qu'il expose : plusieurs liens de
   projet encore inconnus. L'ancien score reste en second déclencheur, pour ne
   pas reculer sur les communes où il fonctionnait.
3. **Menus et bandeaux.** `stripHtml` ne retire que `<nav>` et `<footer>` ;
   les CMS de mairie construisent leurs menus autrement. Comme le texte était
   coupé aux premiers caractères, l'IA recevait surtout de la navigation. Un
   enchaînement de 8 mots présent sur la majorité des pages d'un même site est
   désormais retiré : déterministe, sans dépendance, sans appel IA. La
   troncature n'intervient qu'après, donc sur du contenu réel.

### Limite connue : les sites protégés contre la lecture automatique

Quelques sites de communes ne servent pas leur contenu à un client automatique.
Ils renvoient une page de 220 octets qui déplace le navigateur par script vers
une adresse à jeton en posant un cookie ; cette adresse répond `307` **avec un
nouveau cookie** ; et la vraie page n'est rendue qu'à qui présente ce second
cookie. Sans cookie du tout : `403 Attack detected`.

Passer ce contrôle demanderait de reproduire le bocal à cookies d'un navigateur
dans le seul but de franchir un garde-barrière que la collectivité a
délibérément installé, et son `robots.txt` (le seul endroit où elle dirait ce
qu'elle autorise) est lui-même derrière ce garde-barrière. **On ne le franchit
donc pas.** On le détecte, on l'écrit dans les logs, on l'affiche à l'écran et
on le consigne dans `demo_runs` : une carte maigre sur une grande commune
s'explique alors d'un coup d'œil. Le recensement se poursuit sur la presse et
les marchés publics.

Mesure sur 160 communes (les 80 plus grandes, plus 80 moyennes tirées
régulièrement entre 5 000 et 50 000 habitants) : **2 sites concernés**, Reims et
Boulogne-Billancourt. Pour ces communes-là, le bon chemin est celui que la démo
propose déjà en cas de sources insuffisantes : préparer la carte avec la
collectivité, à partir de ses documents.

## Développer en local

`netlify dev` injecte dans les fonctions la **passerelle IA de Netlify**
(`OPENAI_BASE_URL=<site>/.netlify/ai` + un jeton de passerelle **à la place** de
la clé du compte). Si cette passerelle n'est pas provisionnée, tous les appels
IA échouent en local (`UND_ERR_CONNECT_TIMEOUT`) alors que la production
fonctionne. Deux variables permettent de viser l'API OpenAI directe :

```bash
DEMO_OPENAI_KEY="$OPENAI_API_KEY" \
DEMO_DUMP=1 \
netlify dev --port 3001
```

- `DEMO_OPENAI_KEY` : clé utilisée à la place de celle injectée ; bascule aussi
  l'URL sur `https://api.openai.com` (surchargeable par `DEMO_OPENAI_BASE_URL`)
- `DEMO_DUMP=1` : déverse les artefacts complets (projets localisés,
  illustrations, articles) dans les logs sous `[demo-dump]`, seule façon de les
  inspecter quand la clé service Supabase manque et que la phase de création
  est court-circuitée

## Désinstallation complète

1. Supprimer le dossier `demo/`
2. Supprimer `netlify/functions/demo-generate.mjs`,
   `netlify/functions/demo-lead.mjs` et `netlify/functions/lib/demo-mail.mjs`
   (les routes `/api/demo-generate` et `/api/demo-lead` sont déclarées dans ces
   fichiers, rien dans netlify.toml), ainsi que la règle d'en-têtes `/demo/*`
   de netlify.toml
3. Retirer les 5 garde-fous marqués « essai- » : deux dans
   `netlify/functions/sitemap.mjs`, un dans `netlify/functions/llms-txt.mjs`,
   un dans `netlify/edge-functions/ville-hub.js`, un dans
   `netlify/edge-functions/fiche-ssr.js` (rechercher `essai-`)
4. Données : `delete from contribution_uploads where ville like 'essai-%';`
   `delete from city_modules where ville like 'essai-%';`
   `delete from city_branding where ville like 'essai-%';`
   `delete from category_icons where ville like 'essai-%';`
   `drop table demo_leads;` (référence demo_runs), `drop table demo_runs;`,
   `drop table demo_instances;` et vider le dossier `uploads/demo/` +
   `uploads/branding/essai-*` du storage
5. Supprimer le spec `tests/unauth.demo.spec.js` et la migration
   `supabase/migrations/20260728000000_demo_runs_et_leads.sql`

## Dépendance externe

Le QR code de l'écran final est rendu par `api.qrserver.com` (gratuit, sans
clé). En cas d'indisponibilité, seul le QR manque : le bouton et la
redirection automatique fonctionnent.
