# Tests Playwright - Guide Simple

## 🚀 Lancer les tests

```bash
npm run test:ui
```

Cela ouvre l'interface Playwright UI où vous pouvez :
- Sélectionner les tests à exécuter
- Voir les résultats en temps réel
- Débugger visuellement

## 📊 Rapports générés automatiquement

**IMPORTANT** : Le rapport JSON est généré **MÊME quand vous utilisez l'UI** !

Après chaque exécution de tests (UI ou CLI), deux rapports sont créés dans `test-results/` :

### 1. Rapport HTML (pour vous)
- **Emplacement** : `test-results/html/index.html`
- **Voir** : `npm run test:report`
- Interface visuelle avec screenshots, vidéos, traces

### 2. Rapport JSON (pour l'IA)
- **Emplacement** : `test-results/results.json`
- **Généré automatiquement** : Même en mode UI ✅
- Format structuré avec tous les détails des tests
- Parfait pour faire analyser par une IA

## 🤖 Donner le rapport à une IA

1. Lancez vos tests via `npm run test:ui`
2. **Générez le rapport JSON** : `npm run test:json`
3. Copiez le contenu de `test-results/results.json`
4. Donnez-le à l'IA avec cette instruction :

```
Voici le rapport de mes tests Playwright. Analyse les erreurs et corrige mes tests :

[Collez le contenu du fichier results.json ici]
```

## 📁 Structure des rapports

```
test-results/
├── html/              # Rapport HTML interactif
│   └── index.html
└── results.json       # Rapport JSON pour l'IA
```

## ⚙️ Configuration

Tout est configuré dans `playwright.config.js` :
- Les deux reporters sont activés automatiquement
- Pas besoin de scripts complexes
- Pas de fichiers .bat nécessaires

## 🧠 Prompt recommandé pour analyser les tests avec l'IA

Utilisez ce prompt pour obtenir une analyse complète (erreurs, pertinence du test, décision test vs code, correctifs concrets) :

```
Contexte:
- Execute la commande suivante : `npm run test:json -- --failed-only`.

Tâches à effectuer:
1) Lis et résume les tests en échec (noms, messages d’erreur clés).
2) Pour chaque échec, explique la cause probable (synchro, sélecteur, données, logique appli).
3) Évalue la pertinence du test: le test vérifie-t-il le bon comportement produit ? Si non, propose l’ajustement du test.
4) Décide s’il faut corriger le TEST ou le CODE applicatif. Justifie.
5) Propose des correctifs concrets et minimalement intrusifs:
   - Pour les tests: attentes Playwright à ajouter, sélecteurs à corriger, sérialisation, timeouts, etc.
   - Pour le code: points précis à modifier (fichiers, sections, conditions d’attente, attributs ARIA, IDs).
6) Donne les commandes/actions pour revalider (et le cas échéant, régénérer un rapport échecs-only).

Contraintes:
- Préfère des attentes conditionnelles (toHaveAttribute / waitForSelector) plutôt que des `waitForTimeout`.
- Ne change pas l’UX métier sans justification.
- Propose des patches ciblés, étape par étape.

Verifie le rapport JSON Playwright C:\Users\Maline\Documents\grandsprojets\test-results\results.json
```
