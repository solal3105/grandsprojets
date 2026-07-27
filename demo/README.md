# Démo salon : génération en direct de la carte d'une commune

Écran plein format (« Tapez le nom de votre commune ») qui génère en direct
l'espace Open Projets d'une commune à partir de sources publiques : site de la
mairie (logo, couleur, pages projets, texte des PDF officiels), presse locale
(Google News), marchés publics de travaux (BOAMP, avis complet). Sélection par
IA en une passe avec citation obligatoire, puis **fusion multi-sources** :
chaque projet agrège toutes les sources qui le mentionnent, ce qui lui donne
l'adresse officielle de l'avis de marché, le récit et les visuels de la page de
la mairie, et le contexte de la presse. Durée : 2 à 4 minutes par commune.

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
- Espaces créés : `/?city=essai-<commune>` (préfixe `essai-` systématique)

## Garde-fous

- Idempotence : une commune déjà générée redirige vers l'espace existant
- Quotas : 80 générations/jour au global, 15 par IP (constantes en tête de
  `netlify/functions/demo-generate.mjs`). Pour le salon : définir la variable
  d'env `DEMO_KIOSK_KEY` et ouvrir `/demo/?kiosk=1&k=<clé>` : le quota par IP
  est levé pour cet écran (le plafond global reste)
- Diagnostic : `DEMO_DEBUG=1` en variable d'env renvoie le détail technique
  des erreurs au navigateur (désactivé par défaut)
- Génération en 4 invocations SSE courtes (sources → ai → locate → redact →
  create), état dans `demo_instances.status/payload`, reprise automatique
  côté client en cas de coupure ; échec « sources insuffisantes » mémorisé
  en statut `failed` 7 jours (aucun re-coût IA)
- Qualité : projet rejeté si sa source n'a pas été réellement collectée, si la
  confiance est basse, s'il géocode hors du contour de la commune, ou si aucun
  emplacement n'est identifiable ; deux fiches dont les points sont à moins de
  250 m et dont les titres partagent un mot distinctif sont fusionnées ;
  moins de 3 projets situés = message d'orientation vers un contact humain
- SEO : villes `essai-*` exclues du sitemap et du llms.txt, hubs et fiches en
  noindex
- Modèle IA : `gpt-4o` (surchargable via `DEMO_OPENAI_MODEL`). Les appels de
  vision ont leur propre variable `DEMO_OPENAI_VISION_MODEL`, qui pointe par
  défaut sur le même modèle : **ne pas y mettre un modèle léger**, mesure faite
  le juge d'image y passe de 953 à 13 565 tokens d'entrée par appel, ces
  modèles facturant les images à un tarif de tokens bien plus élevé
- Coût IA : chaque appel journalise ses tokens (`[demo-tokens] <schéma> input= output= total=`)
  et le cumul remonte dans `stats.tokens_in` / `tokens_out`. Ordre de grandeur :
  environ 3 500 tokens par projet publié

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
2. Supprimer `netlify/functions/demo-generate.mjs` (la route `/api/demo-generate`
   est déclarée dans ce fichier, rien dans netlify.toml)
3. Retirer les 4 garde-fous marqués « essai- » : deux dans
   `netlify/functions/sitemap.mjs`, un dans `netlify/functions/llms-txt.mjs`,
   un dans `netlify/edge-functions/ville-hub.js`, un dans
   `netlify/edge-functions/fiche-ssr.js` (rechercher `essai-`)
4. Données : `delete from contribution_uploads where ville like 'essai-%';`
   `delete from city_modules where ville like 'essai-%';`
   `delete from city_branding where ville like 'essai-%';`
   `drop table demo_instances;` et vider le dossier `uploads/demo/` +
   `uploads/branding/essai-*` du storage
5. Supprimer le spec `tests/unauth.demo.spec.js`

## Dépendance externe

Le QR code de l'écran final est rendu par `api.qrserver.com` (gratuit, sans
clé). En cas d'indisponibilité, seul le QR manque : le bouton et la
redirection automatique fonctionnent.
