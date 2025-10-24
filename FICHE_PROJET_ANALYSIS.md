# 📊 ANALYSE COMPLÈTE : FICHE PROJET

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Dépendances](#dépendances)
4. [Logique JavaScript](#logique-javascript)
5. [Styles CSS](#styles-css)
6. [Composants UI](#composants-ui)
7. [Points forts et faiblesses](#points-forts-et-faiblesses)

---

## 🎯 Vue d'ensemble

La **Fiche Projet** est une page dédiée à l'affichage détaillé d'un projet.

**URL** : `/fiche/?project=nom-du-projet&cat=categorie&city=ville`

**Layout** : Sidebar fixe (droite) + Article scrollable (gauche) + Carte sticky

**Responsive** : 3 breakpoints
- Mobile < 768px
- Tablet 768-1199px  
- Desktop ≥ 1200px

**Contenu** : Cover, description, liens, documents PDF, carte Leaflet, markdown

---

## 🏗️ Architecture

### Fichiers principaux

```
grandsprojets/
├── fiche/
│   └── index.html                    # Structure HTML
├── modules/
│   └── ficheprojet.js                # Logique (685 lignes)
└── styles/
    ├── 09-ficheprojet.css            # Styles (544 lignes)
    ├── gp-card-system.css            # Cards (282 lignes)
    └── gp-markdown-content.css       # Markdown (289 lignes)
```

### Structure HTML générée

```html
<div class="fiche-projet">
  <header class="fiche-projet-header">
    <a href="/" class="btn-secondary">Retour</a>
    <h1>{projectName}</h1>
  </header>

  <div class="fiche-projet-main">
    <aside class="fiche-projet-sidebar">
      <!-- GP-Cards -->
    </aside>

    <article class="fiche-projet-article">
      <div class="fiche-projet-map">
        <div id="project-map"></div>
      </div>
      <div id="project-markdown-content"></div>
    </article>
  </div>
</div>
```

---

## 🔗 Dépendances

### Bibliothèques externes

| Bibliothèque | Usage |
|-------------|-------|
| Leaflet 1.9.3 | Carte interactive |
| Font Awesome 6.x | Icônes |
| Supabase | Base de données |
| Marked.js | Parser markdown |

### Modules internes

```javascript
window.supabaseService      // Fetch données
window.MarkdownUtils        // Parser markdown
window.ThemeManager         // Thème dark/light
window.CityBrandingModule   // Couleur ville
window.ModalHelper          // Modales
window.CameraMarkers        // Markers images
window.getFeatureStyle      // Styles GeoJSON
```

### Variables CSS

```css
--primary                   /* Couleur primaire */
--surface-base              /* Fond base */
--surface-elevated          /* Fond élevé */
--text-primary              /* Texte principal */
--border-light              /* Bordures */
--fp-sidebar-width-desktop  /* 500px */
--fp-map-height-desktop     /* 45vh */
--fp-header-height          /* 56px */
```

---

## 💻 Logique JavaScript

### Flux d'initialisation

```javascript
async function initFicheProjet() {
  // 1. Init thème
  ThemeManager.init();
  
  // 2. Charger MarkdownUtils
  await MarkdownUtils.loadDeps();
  
  // 3. Récupérer params URL
  const { projectName, category, city } = getURLParams();
  
  // 4. Charger données Supabase
  const projectData = await supabaseService
    .fetchProjectByCategoryAndName(category, projectName);
  
  // 5. Appliquer city branding
  await CityBrandingModule.loadAndApplyBranding(city);
  
  // 6. Générer HTML
  article.innerHTML = generateFicheHTML(projectName);
  
  // 7. Générer GP-Cards
  sidebar.innerHTML = [
    createCoverCard(),
    createDescriptionCard(),
    createOfficialLinkCard(),
    await createDocumentsCards()
  ].join('');
  
  // 8. Charger markdown
  await renderMarkdown(projectData.markdown_url);
  
  // 9. Init carte
  await initProjectMap('project-map', projectName, category);
  
  // 10. Bind events
  bindEvents();
}
```

### Fonctions clés

**createCoverCard()** - Génère card cover avec image
**createDocumentsCards()** - Charge PDFs depuis Supabase
**initProjectMap()** - Init carte Leaflet + GeoJSON
**openLightbox()** - Ouvre lightbox image
**openPDFPreview()** - Ouvre preview PDF

---

## 🎨 Styles CSS

### Layout Grid

**Desktop (≥1200px)**
```css
.fiche-projet-main {
  display: grid;
  grid-template-columns: 1fr 500px;
  height: calc(100vh - 56px);
}
```

**Mobile (<768px)**
```css
.fiche-projet-main {
  display: flex;
  flex-direction: column;
}
```

### Carte sticky

```css
@media (min-width: 768px) {
  .fiche-projet-map {
    position: sticky;
    top: 0;
    height: 45vh;
    border-radius: 16px;
  }
}
```

### GP-Cards

```css
.gp-card {
  padding: 20px;
  background: var(--surface-elevated);
  border-radius: 16px;
  box-shadow: 0 2px 8px var(--black-alpha-04);
  transition: all 0.3s;
}

.gp-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px var(--black-alpha-08);
}
```

---

## 🧩 Composants UI

### Header
- Position sticky
- Height 56px
- Backdrop blur

### Sidebar Cards
- Cover (image + expand)
- Description
- Official link
- Documents PDF

### Article
- Carte Leaflet sticky
- Contenu markdown

### Modales
- Lightbox image
- PDF preview

---

## ✅ Points forts

✅ Architecture modulaire
✅ Responsive 3 breakpoints
✅ Design moderne (glassmorphism)
✅ Async/await propre
✅ Error handling
✅ Système GP-Cards réutilisable
✅ SEO (meta tags)
✅ Accessibilité (ARIA)

## ❌ Faiblesses

❌ Pas de lazy loading images
❌ Pas de cache GeoJSON
❌ Logs console en production
❌ Pas de loading states
❌ Dépendance window globals
❌ Pas de tests unitaires

---

**Voir FICHE_PROJET_TAILWIND.md pour la refonte Tailwind**
