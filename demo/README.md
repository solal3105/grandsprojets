# Démo salon : génération en direct de la carte d'une commune

Écran plein format (« Tapez le nom de votre commune ») qui génère en direct
l'espace Open Projets d'une commune à partir de sources publiques : site de la
mairie (logo, couleur, pages projets), presse locale (Google News, articles
lus en entier), marchés publics (BOAMP). Sélection par IA en deux passes avec
citations obligatoires, localisation hybride (emprises réelles OSM/Nominatim,
adresses BAN, repli centre commune), création de l'espace complet.

## URLs

- `/demo/` : écran de saisie (autocomplétion officielle geo.api.gouv.fr)
- `/demo/?commune=<INSEE>&nom=<Nom>&auto=1` : lancement direct (liens de prospection)
- Espaces créés : `/?city=essai-<commune>` (préfixe `essai-` systématique)

## Garde-fous

- Idempotence : une commune déjà générée redirige vers l'espace existant
- Quotas : 80 générations/jour au global, 15 par IP (constantes en tête de
  `netlify/functions/demo-generate.mjs`)
- Qualité : projet rejeté si sa source n'a pas été réellement collectée, si la
  confiance est basse, ou s'il géocode hors du contour de la commune ;
  moins de 3 projets vérifiés = message d'orientation vers un contact humain
- SEO : villes `essai-*` exclues du sitemap et du llms.txt, hubs et fiches en
  noindex
- Modèle IA : `gpt-4o` (surchargable via la variable d'env `DEMO_OPENAI_MODEL`)

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
