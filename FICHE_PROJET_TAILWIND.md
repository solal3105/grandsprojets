# 🎨 REFONTE FICHE PROJET AVEC TAILWIND CSS

## 📋 Objectif

Reconstruire complètement le design de la fiche projet avec **Tailwind CSS** tout en conservant la logique JavaScript identique.

---

## 🎯 Stratégie de migration

### Phase 1 : Setup Tailwind
### Phase 2 : Conversion des composants
### Phase 3 : Responsive & animations
### Phase 4 : Dark mode
### Phase 5 : Optimisation

---

## 📦 Phase 1 : Setup Tailwind

### Installation

```bash
npm install -D tailwindcss@latest
npx tailwindcss init
```

### Configuration `tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./fiche/**/*.html",
    "./modules/ficheprojet.js"
  ],
  darkMode: 'class', // Support dark mode via classe
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          50: 'color-mix(in srgb, var(--primary) 5%, white)',
          100: 'color-mix(in srgb, var(--primary) 10%, white)',
          200: 'color-mix(in srgb, var(--primary) 20%, white)',
          500: 'var(--primary)',
          600: 'color-mix(in srgb, var(--primary) 80%, black)',
          700: 'color-mix(in srgb, var(--primary) 70%, black)',
        },
        surface: {
          base: 'var(--surface-base)',
          elevated: 'var(--surface-elevated)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        border: {
          light: 'var(--border-light)',
        }
      },
      spacing: {
        'sidebar-desktop': '500px',
        'sidebar-tablet': '420px',
        'header': '56px',
      },
      height: {
        'map-desktop': '45vh',
        'map-tablet': '40vh',
        'map-mobile': '30vh',
      },
      backdropBlur: {
        'xs': '2px',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 12px 24px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.1)',
        'lightbox': '0 8px 32px rgba(0, 0, 0, 0.5)',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'), // Pour markdown
  ],
}
```

### Build CSS

```bash
npx tailwindcss -i ./styles/tailwind-input.css -o ./styles/tailwind-output.css --watch
```

---

## 🏗️ Phase 2 : Conversion des composants

### 1. Structure principale

#### Avant (CSS custom)
```html
<div class="fiche-projet">
  <header class="fiche-projet-header">...</header>
  <div class="fiche-projet-main">
    <aside class="fiche-projet-sidebar">...</aside>
    <article class="fiche-projet-article">...</article>
  </div>
</div>
```

#### Après (Tailwind)
```html
<div class="min-h-screen bg-surface-base">
  <!-- Header -->
  <header class="sticky top-0 z-50 h-header px-5 flex items-center gap-4 
                 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl 
                 border-b border-border-light">
    <a href="/" class="inline-flex items-center gap-2 px-4 py-2 
                       bg-surface-elevated hover:bg-gray-100 
                       dark:hover:bg-gray-800 rounded-lg 
                       transition-colors duration-200">
      <i class="fa fa-arrow-left"></i>
      <span>Retour</span>
    </a>
    <h1 class="flex-1 text-xl font-bold text-text-primary 
               truncate">{projectName}</h1>
  </header>

  <!-- Layout principal -->
  <div class="lg:grid lg:grid-cols-[1fr_500px] xl:grid-cols-[1fr_500px] 
              lg:h-[calc(100vh-56px)]
              md:grid md:grid-cols-[1fr_420px] md:h-[calc(100vh-56px)]
              flex flex-col">
    
    <!-- Article (gauche) -->
    <article class="overflow-y-auto p-5 lg:order-1 order-3">
      <!-- Carte sticky -->
      <div class="sticky top-0 z-10 mb-5 
                  h-map-mobile md:h-map-tablet lg:h-map-desktop
                  rounded-2xl overflow-hidden
                  shadow-card-hover">
        <div id="project-map" class="w-full h-full"></div>
      </div>
      
      <!-- Markdown -->
      <div id="project-markdown-content" 
           class="prose prose-lg dark:prose-invert max-w-none">
      </div>
    </article>

    <!-- Sidebar (droite) -->
    <aside class="overflow-y-auto p-5 
                  lg:border-l md:border-l border-border-light
                  bg-primary-50 dark:bg-gray-800/50
                  lg:order-2 md:order-2 order-2">
      <!-- GP-Cards -->
    </aside>
  </div>
</div>
```

---

### 2. GP-Cards avec Tailwind

#### Base Card

```javascript
function createBaseCard(icon, title, body) {
  return `
    <div class="w-full max-w-lg mx-auto my-3 p-5 
                bg-surface-elevated dark:bg-gray-800 
                border border-border-light dark:border-gray-700 
                rounded-2xl 
                shadow-card hover:shadow-card-hover 
                hover:-translate-y-1 
                transition-all duration-300 ease-smooth">
      
      <!-- Header -->
      <div class="flex items-center gap-3 mb-3">
        <i class="${icon} text-lg text-primary-500"></i>
        <h3 class="text-sm font-bold uppercase tracking-wider 
                   text-text-primary dark:text-gray-100">
          ${title}
        </h3>
      </div>
      
      <!-- Body -->
      <div class="text-text-secondary dark:text-gray-300 leading-relaxed">
        ${body}
      </div>
    </div>
  `;
}
```

#### Cover Card

```javascript
function createCoverCard(coverUrl, projectName) {
  if (!coverUrl) return '';
  
  const absoluteUrl = toAbsoluteURL(coverUrl);
  
  return `
    <div class="w-full max-w-lg mx-auto my-3 
                bg-surface-elevated dark:bg-gray-800 
                rounded-2xl overflow-hidden 
                shadow-card">
      
      <div class="relative w-full h-[300px] bg-gray-100 dark:bg-gray-700 
                  group">
        
        <!-- Image -->
        <img src="${absoluteUrl}" 
             alt="${projectName}"
             loading="lazy"
             class="w-full h-full object-cover object-center">
        
        <!-- Bouton expand -->
        <button class="absolute bottom-3 right-3 
                       w-11 h-11 
                       flex items-center justify-center 
                       bg-white/95 dark:bg-gray-800/95 
                       backdrop-blur-lg 
                       border border-border-light dark:border-gray-600 
                       rounded-full 
                       opacity-0 group-hover:opacity-100 
                       hover:scale-110 active:scale-95 
                       transition-all duration-200 
                       shadow-lg hover:shadow-xl 
                       cursor-pointer"
                data-lightbox-image="${absoluteUrl}"
                aria-label="Agrandir l'image">
          <i class="fa fa-expand text-gray-700 dark:text-gray-200 text-sm"></i>
        </button>
      </div>
    </div>
  `;
}
```

#### Description Card

```javascript
function createDescriptionCard(description) {
  if (!description) return '';
  
  return `
    <div class="w-full max-w-lg mx-auto my-3 p-5 
                bg-surface-elevated dark:bg-gray-800 
                border border-border-light dark:border-gray-700 
                rounded-2xl shadow-card">
      
      <div class="flex items-center gap-3 mb-3">
        <i class="fa-solid fa-info-circle text-lg text-blue-500"></i>
        <h3 class="text-sm font-bold uppercase tracking-wider 
                   text-text-primary dark:text-gray-100">
          Description du projet
        </h3>
      </div>
      
      <div class="text-text-secondary dark:text-gray-300 leading-relaxed">
        <p class="m-0">${description}</p>
      </div>
    </div>
  `;
}
```

#### Official Link Card

```javascript
function createOfficialLinkCard(url) {
  if (!url) return '';
  
  let domain = '';
  try {
    const urlObj = new URL(url);
    domain = urlObj.hostname.replace('www.', '');
  } catch (e) {
    domain = url;
  }
  
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  
  return `
    <div class="w-full max-w-lg mx-auto my-3 p-5 
                bg-surface-elevated dark:bg-gray-800 
                border border-border-light dark:border-gray-700 
                rounded-2xl shadow-card">
      
      <div class="flex items-center gap-3 mb-3">
        <i class="fa-solid fa-bookmark text-lg text-primary-500"></i>
        <h3 class="text-sm font-bold uppercase tracking-wider 
                   text-text-primary dark:text-gray-100">
          Site de référence
        </h3>
      </div>
      
      <div class="flex items-center gap-3 p-3 
                  bg-surface-elevated dark:bg-gray-700/50 
                  border border-border-light dark:border-gray-600 
                  rounded-lg">
        
        <img src="${faviconUrl}" 
             alt="" 
             class="w-8 h-8 flex-shrink-0"
             onerror="this.style.display='none'">
        
        <span class="flex-1 font-semibold text-text-primary dark:text-gray-100 
                     break-words">
          ${domain}
        </span>
        
        <a href="${url}" 
           target="_blank" 
           rel="noopener"
           class="inline-flex items-center justify-center 
                  w-10 h-10 
                  bg-primary-500 hover:bg-primary-600 
                  text-white rounded-lg 
                  transition-colors duration-200"
           aria-label="Ouvrir le site">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </a>
      </div>
    </div>
  `;
}
```

#### Documents Card

```javascript
async function createDocumentsCards(projectName) {
  try {
    const dossiers = await window.supabaseService
      .getConsultationDossiersByProject(projectName);
    
    if (!Array.isArray(dossiers) || dossiers.length === 0) return '';
    
    const uniq = new Map();
    dossiers.forEach(d => {
      if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
    });
    const docs = Array.from(uniq.values());
    
    if (docs.length === 0) return '';
    
    const docItems = docs.map(doc => {
      const title = doc.title || doc.pdf_url.split('/').pop();
      const pdfUrl = toAbsoluteURL(doc.pdf_url);
      
      return `
        <div class="flex flex-col gap-3 p-4 
                    bg-surface-elevated dark:bg-gray-700/50 
                    border border-border-light dark:border-gray-600 
                    rounded-xl 
                    hover:bg-surface-base dark:hover:bg-gray-700 
                    hover:border-primary-200 dark:hover:border-primary-500 
                    hover:-translate-y-0.5 
                    transition-all duration-200 
                    cursor-pointer">
          
          <!-- Header -->
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 flex-shrink-0 
                        flex items-center justify-center 
                        bg-gradient-to-br from-red-100 to-red-200 
                        dark:from-red-900/30 dark:to-red-800/30 
                        text-red-600 dark:text-red-400 
                        rounded-lg">
              <i class="fa-solid fa-file-pdf text-lg"></i>
            </div>
            
            <div class="flex-1 min-w-0">
              <h4 class="text-base font-semibold text-text-primary 
                         dark:text-gray-100 
                         break-words leading-snug">
                ${title}
              </h4>
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex gap-2">
            <button type="button" 
                    class="flex-1 inline-flex items-center justify-center gap-2 
                           px-4 py-2 
                           bg-primary-500 hover:bg-primary-600 
                           text-white text-sm font-medium 
                           rounded-lg 
                           transition-colors duration-200"
                    data-pdf-preview="${pdfUrl}" 
                    data-pdf-title="${title}">
              <i class="fa-solid fa-eye"></i>
              Prévisualiser
            </button>
            
            <a href="${pdfUrl}" 
               target="_blank" 
               rel="noopener" 
               download
               class="inline-flex items-center justify-center 
                      w-10 h-10 
                      bg-gray-100 hover:bg-gray-200 
                      dark:bg-gray-700 dark:hover:bg-gray-600 
                      text-gray-700 dark:text-gray-200 
                      rounded-lg 
                      transition-colors duration-200"
               title="Télécharger"
               aria-label="Télécharger ${title}">
              <i class="fa-solid fa-download"></i>
            </a>
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="w-full max-w-lg mx-auto my-3 p-5 
                  bg-surface-elevated dark:bg-gray-800 
                  border border-border-light dark:border-gray-700 
                  rounded-2xl shadow-card">
        
        <div class="flex items-center gap-3 mb-3">
          <i class="fa-solid fa-file-pdf text-lg text-red-500"></i>
          <h3 class="text-sm font-bold uppercase tracking-wider 
                     text-text-primary dark:text-gray-100">
            Documents de concertation
          </h3>
        </div>
        
        <div class="grid grid-cols-1 gap-3">
          ${docItems}
        </div>
      </div>
    `;
  } catch (e) {
    console.warn('[Documents] Erreur chargement:', e);
    return '';
  }
}
```

---

### 3. Lightbox avec Tailwind

```javascript
function openLightbox(imageUrl) {
  let overlay = document.getElementById('image-lightbox-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'image-lightbox-overlay';
    overlay.className = `
      hidden fixed inset-0 z-[10000] 
      bg-black/95 
      items-center justify-center 
      cursor-zoom-out
    `;
    
    overlay.innerHTML = `
      <img class="max-w-[90vw] max-h-[90vh] object-contain 
                  rounded-lg shadow-lightbox" 
           src="" 
           alt="Image agrandie">
      
      <button class="absolute top-5 right-5 
                     w-11 h-11 
                     flex items-center justify-center 
                     bg-white/90 dark:bg-gray-800/90 
                     backdrop-blur-lg 
                     rounded-full 
                     text-text-primary dark:text-gray-100 text-2xl 
                     hover:bg-white dark:hover:bg-gray-800 
                     hover:scale-110 
                     transition-all duration-200"
              aria-label="Fermer">
        ×
      </button>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.tagName === 'BUTTON') {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('flex')) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
      }
    });
  }
  
  overlay.querySelector('img').src = imageUrl;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
}
```

---

### 4. Markdown avec Tailwind Typography

```html
<div id="project-markdown-content" 
     class="prose prose-lg 
            dark:prose-invert 
            max-w-none
            prose-headings:font-bold 
            prose-headings:text-text-primary
            prose-h1:text-3xl prose-h1:border-b prose-h1:border-border-light prose-h1:pb-3
            prose-h2:text-2xl prose-h2:border-b prose-h2:border-border-light prose-h2:pb-2
            prose-p:text-text-secondary prose-p:leading-relaxed
            prose-a:text-primary-500 prose-a:no-underline prose-a:border-b prose-a:border-primary-200
            hover:prose-a:border-primary-500 hover:prose-a:bg-primary-50
            prose-code:bg-surface-elevated prose-code:border prose-code:border-border-light prose-code:rounded prose-code:px-1.5 prose-code:py-0.5
            prose-pre:bg-surface-elevated prose-pre:border prose-pre:border-border-light prose-pre:rounded-lg
            prose-blockquote:border-l-4 prose-blockquote:border-primary-500 prose-blockquote:bg-primary-50 prose-blockquote:rounded-r-lg
            prose-img:rounded-lg prose-img:my-4
            prose-table:border prose-table:border-border-light prose-table:rounded-lg
            prose-th:bg-surface-elevated prose-th:font-bold
            prose-tr:even:bg-surface-elevated">
</div>
```

---

## 📱 Phase 3 : Responsive

### Breakpoints Tailwind

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',   // Tablet
      'lg': '1200px',  // Desktop
      'xl': '1536px',
    }
  }
}
```

### Classes responsive

```html
<!-- Mobile-first approach -->
<div class="flex flex-col          <!-- Mobile: stack vertical -->
            md:grid md:grid-cols-[1fr_420px]  <!-- Tablet: grid -->
            lg:grid-cols-[1fr_500px]">        <!-- Desktop: grid plus large -->
  
  <!-- Ordre mobile -->
  <div class="order-3 lg:order-1">Article</div>
  <div class="order-2">Sidebar</div>
</div>

<!-- Hauteurs responsive -->
<div class="h-map-mobile           <!-- Mobile: 30vh -->
            md:h-map-tablet        <!-- Tablet: 40vh -->
            lg:h-map-desktop">     <!-- Desktop: 45vh -->
</div>

<!-- Padding responsive -->
<div class="p-3 md:p-5 lg:p-5">
</div>
```

---

## 🌙 Phase 4 : Dark Mode

### Activation

```javascript
// ThemeManager déjà existant
// Ajoute/retire la classe 'dark' sur <html>

if (theme === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}
```

### Classes dark mode

```html
<!-- Backgrounds -->
<div class="bg-white dark:bg-gray-900">
<div class="bg-gray-50 dark:bg-gray-800">
<div class="bg-surface-elevated dark:bg-gray-800">

<!-- Text -->
<p class="text-gray-900 dark:text-gray-100">
<p class="text-gray-600 dark:text-gray-300">

<!-- Borders -->
<div class="border-gray-200 dark:border-gray-700">

<!-- Hover states -->
<button class="hover:bg-gray-100 dark:hover:bg-gray-800">
```

---

## ⚡ Phase 5 : Optimisation

### 1. Purge CSS

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./fiche/**/*.html",
    "./modules/ficheprojet.js"
  ],
  // Tailwind va automatiquement purger les classes inutilisées
}
```

### 2. Lazy loading images

```html
<img src="${url}" 
     loading="lazy" 
     class="w-full h-full object-cover">
```

### 3. Transitions optimisées

```html
<!-- Utiliser transform au lieu de top/left -->
<div class="hover:-translate-y-1 transition-transform duration-200">

<!-- GPU acceleration -->
<div class="will-change-transform">
```

---

## 📊 Comparaison avant/après

### Taille CSS

| Fichier | Avant | Après (Tailwind) |
|---------|-------|------------------|
| 09-ficheprojet.css | 544 lignes | 0 (supprimé) |
| gp-card-system.css | 282 lignes | 0 (supprimé) |
| gp-markdown-content.css | 289 lignes | 0 (supprimé) |
| **Total custom CSS** | **1115 lignes** | **0 lignes** |
| tailwind-output.css | - | ~50KB (purgé) |

### Avantages Tailwind

✅ **Moins de CSS custom** : 0 ligne vs 1115 lignes
✅ **Cohérence** : Système de design unifié
✅ **Responsive** : Classes utilitaires
✅ **Dark mode** : Intégré nativement
✅ **Maintenance** : Plus facile à modifier
✅ **Performance** : CSS purgé automatiquement
✅ **Lisibilité** : Classes descriptives dans le HTML

### Inconvénients

❌ **HTML plus verbeux** : Classes longues
❌ **Courbe d'apprentissage** : Syntaxe Tailwind
❌ **Build step** : Nécessite compilation

---

## 🚀 Migration progressive

### Étape 1 : Ajouter Tailwind sans toucher au CSS existant
### Étape 2 : Convertir les GP-Cards
### Étape 3 : Convertir le layout
### Étape 4 : Convertir le markdown
### Étape 5 : Supprimer l'ancien CSS

---

## 📝 Checklist de migration

- [ ] Installer Tailwind + config
- [ ] Créer tailwind-input.css
- [ ] Configurer build process
- [ ] Convertir structure principale
- [ ] Convertir GP-Cards
- [ ] Convertir lightbox
- [ ] Convertir markdown (prose)
- [ ] Tester responsive (3 breakpoints)
- [ ] Tester dark mode
- [ ] Optimiser (purge + lazy loading)
- [ ] Supprimer ancien CSS
- [ ] Tests cross-browser

---

**La logique JavaScript reste 100% identique. Seul le HTML et le CSS changent.**
