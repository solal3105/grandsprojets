# Espace de démonstration essai-haute-savoie

Carte des projets du Département de la Haute-Savoie, préparée à la main pour la démonstration du 28/11/2026 (pas le générateur de démo).

- `projets/` : pour chaque projet, son tracé (`.geojson`) et son article (`.md`), écrits depuis les communiqués du Département.
- `couvertures-secours/` : une vue aérienne IGN avec le tracé, pour chaque projet.
- `couvertures/` : les vraies photos retenues (même nom de fichier). Elles remplacent la vue aérienne au dépôt.
- `travaux/` : les tracés de la carte des travaux.
- `couches/departement.geojson` : la limite du département (IGN, simplifiée).
- `publier.mjs` : dépose tout dans le stockage (`npx netlify dev:exec node demo-data/essai-haute-savoie/publier.mjs`).

Quand une vraie photo remplace la vue aérienne, la dernière ligne de l'article (« Illustration : … ») est remplacée par son crédit.

Ce dossier ne doit pas être fusionné dans main.
