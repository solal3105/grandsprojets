# Démo salon : génération en direct de la carte d'une commune

Écran plein format (« Tapez le nom de votre commune ») qui génère en direct
l'espace Open Projets d'une commune à partir de sources publiques : site de la
mairie (logo, couleur, pages projets, PDFs officiels), presse locale (Google
News, articles lus en entier), marchés publics (BOAMP). Sélection par IA en
deux passes avec citations obligatoires, localisation hybride (emprises
réelles OSM/Nominatim, adresses BAN, repli centre commune), illustrations
libres de droits (Wikimedia Commons, geosearch à l'emplacement du projet,
crédit ajouté dans la fiche), article de présentation rédigé par fiche
(mention d'auto-génération et source citée), dossiers PDF rattachés aux
fiches (consultation_dossiers). Durée totale : 2 à 4 minutes par commune.

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
  confiance est basse, ou s'il géocode hors du contour de la commune ;
  moins de 3 projets vérifiés = message d'orientation vers un contact humain
- SEO : villes `essai-*` exclues du sitemap et du llms.txt, hubs et fiches en
  noindex
- Modèle IA : `gpt-4o` (surchargable via la variable d'env `DEMO_OPENAI_MODEL`)
- Coût IA : chaque appel journalise ses tokens (`[demo-tokens] <schéma> input= output= total=`).
  Une génération complète coûte environ 60 000 tokens pour 12 projets

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
