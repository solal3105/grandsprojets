# Travaux – Récap clair (city-aware)

Ce module affiche les chantiers « travaux » pour la ville active et propose un sous-menu avec filtres synchronisés avec la carte.

## Quand le menu Travaux apparaît

- **Condition ville**: le bouton/sous-menu « Travaux » est créé uniquement si, pour la ville active:
  - il existe une couche `travaux` dans `layers` (config filtrée par ville), ou
  - il existe des contributions `contribution_uploads` de catégorie `travaux`.
- Références:
  - `main.js` → construction des catégories actives à partir des contributions et de `layersConfig` (l.160–165), création des boutons/sous-menus (l.216–239).
  - `modules/supabaseservice.js` → `fetchLayersConfig()` filtre strictement par ville active.

## D’où viennent les données

- **Par ville**: l’URL de la couche `travaux` est définie dans `layers` pour la ville active et chargée par `DataModule.loadLayer('travaux')`.
- **Exemple (Métropole de Lyon)**: Open Data tabulaire `lyv_lyvia.lyvchantier` (JSON) via `https://data.grandlyon.com/.../lyv_lyvia.lyvchantier.json`.

### Champs utilisés (par enregistrement)
- `numero`, `gid`, `intervenant`
- `nature_chantier`, `nature_travaux`, `etat`
- `date_debut`, `date_fin`, `last_update`, `mesures_police`
- `adresse`, `commune`, `code_insee`, `contact_tel`, `contact_mail`, `contact_url`

## Ce que fait l’UI « Travaux »

- **Sous-menu dédié**: `SubmenuManager` appelle `TravauxModule.renderTravauxProjects()` qui rend:
  - Header (fermer / réduire), démarrage en mode étendu.
  - Exclusivité des couches: retire les couches non liées à `travaux` (via `categoryLayersMap`).
  - Panneau de filtres (liste uniquement les contrôles; pas de « liste de travaux » dans le panneau).
- **Filtres disponibles**: `nature_travaux`, `nature_chantier`, `commune`, `etat`, `date_debut` (>=), `date_fin` (<=), + « Exclure les réseaux » (mots-clés: gaz, réseau, eau, branchement, télécom/telecom, électricité/electricite, assainissement, hydraulique, sondage).
- **Synchronisation carte**: les changements appellent `UIModule.applyFilter('travaux', criteria)`; compteur et badges reflètent l’état des filtres.
- **Interaction carte**: clic sur un chantier → modale riche (dates, avancement, adresses, etc.). Styles/tooltip dans `styles/05-map.css`.

## Chargement et synchronisation

- `supabaseService.initAllData(city)` charge `layersConfig` filtré par ville (URL/style de la couche `travaux` si présente).
- `DataModule.loadLayer('travaux')` charge les données de la ville active et peuple `DataModule.layerData['travaux']`.
- `TravauxModule.renderTravauxProjects()` lit/attend ces données, construit les filtres et synchronise avec la carte.

## Extension multi‑villes (proposition)

- **Distinction Global vs Villes**
  - Ville = `NULL` (mode Global): on lit l’URL « travaux » depuis `layers` (config globale) comme aujourd’hui.
  - Ville spécifique (ex. `lyon`, `besancon`): on lit d’abord la table dédiée `city_travaux` pour cette ville.

- **Table dédiée**: `public.city_travaux` (canonique, city‑aware)
  - Colonnes essentielles: `id` (pk), `ville` (text), `geojson_url` (text), `name` (text), `nature` (text), `etat` (text), `date_debut` (date), `date_fin` (date), `last_update` (timestamptz), `localisation` (text), `approved` (bool), `created_at` (timestamptz), `description` (text).
  - Champs obligatoires: `id`, `ville`, `name`, `geojson_url`, `created_at`.
  - Mode recommandé: 1 ligne par ville avec `geojson_url` pointant vers un FeatureCollection complet (performant et simple).

- **Intégration service** (`modules/supabaseservice.js`)
  - Ajouter `fetchCityTravaux(city)` → retourne la ligne pour la ville (ou vide si pas de donnée spécifique).
  - Brancher selon contexte: si `city === null` → utiliser l’URL de `layers`; sinon → utiliser `city_travaux`.
  - Si dataset complet: exposer l’`url` au `DataModule` et normaliser les propriétés au chargement.
  - Si lignes par chantier (option ultérieure): agréger en un FeatureCollection en injectant les propriétés canoniques.

- **Activation du menu** (`main.js`)
  - Si `fetchCityTravaux(city)` retourne des données, ajouter `travaux` à `categoriesWithData` (même logique que pour `layersConfig`).
  - Les boutons/sous‑menus seront créés automatiquement (logique existante).

- **Chargement** (`modules/datamodule.js`)
  - `loadLayer('travaux')` lit l’URL issue de `city_travaux` (prioritaire) ou de `layers`.
  - Normaliser les propriétés pour l’UI: `nature_travaux`, `nature_chantier`, `etat`, `date_debut`, `date_fin`, `commune`, `adresse`, `code_insee`.

- **Sécurité/RLS**
  - Lecture publique (SELECT) en anon; écriture restreinte (admins/partenaires villes) si nécessaire.

- **Roadmap courte**
  - Créer `city_travaux` (schéma ci‑dessus).
  - Implémenter `fetchCityTravaux(city)` et la normalisation côté service.
  - Brancher `main.js` pour activer la catégorie si données présentes.
  - Tester avec une nouvelle ville (dataset Open Data ou fichier stocké en Storage).

## Ajout via l’UI sur la carte — Prochaines étapes

- **Phase 1 — Données & sécurité**
  - Créer `public.city_travaux` avec champs obligatoires: `id`, `ville`, `name`, `geojson_url`, `created_at`.
  - RLS: `anon` lecture seule; écriture réservée (admin de la ville). Bucket Storage public `travaux-geojson/`.

- **Phase 2 — Service & chargement**
  - `supabaseservice.js`: `fetchCityTravaux(city)` + branchement Global (`ville=null` → `layers`) vs Ville (`city_travaux`).
  - `datamodule.js`: prioriser `city_travaux.geojson_url` pour `loadLayer('travaux')`, normaliser propriétés canoniques.
  - `main.js`: si données présentes, ajouter `travaux` à `categoriesWithData`.

- **Phase 3 — UI d’admin**
  - Formulaire créer/éditer/supprimer une entrée `city_travaux` (champs requis + optionnels), prévisualisation du GeoJSON.

- **Phase 4 — Édition sur carte**
  - Éditeur (point/ligne/polygone) → générer FeatureCollection, envoyer en Storage, enregistrer `geojson_url` dans `city_travaux`.

- **Phase 5 — Validation & publication**
  - Validation client (JSON, dates, enum `etat`), contraintes serveur. Workflow `approved` (publication contrôlée).

- **Phase 6 — Tests**
  - Seed 1–2 villes pilotes, vérifier apparition du menu, chargement, filtres, modale, routing, perfs.
