# 📁 Architecture CSS Modulaire - GrandsProjets

Cette architecture **réunifie tous les CSS** dans le dossier `/styles/` pour une maintenance facilitée.

## 📊 Structure complète des fichiers

```
styles/
├── 00-colors.css            (~360 lignes) - Variables de couleurs + dark mode
├── 01-base.css              (~150 lignes) - Reset, utilitaires, animations
├── 02-layout.css            (~200 lignes) - Structure globale, containers
├── 03-navigation.css        (~850 lignes) - Navigation, sous-menus, listes projets
├── 04-components.css        (~1100 lignes) - Filtres, badges, covers, CTA, basemap
├── 05-map.css               (~700 lignes) - Leaflet, tooltips, popups, markers
├── 06-modals.css            (~730 lignes) - Composants UI spécifiques contrib
├── 07-admin.css             (~400 lignes) - Admin (villes, users, branding)
├── 08-responsive.css        (~200 lignes) - Media queries
├── 09-ficheprojet.css       (~515 lignes) - Page de détail des projets
├── 10-about-modal.css       (~950 lignes) - Modale À propos
├── 11-toggles.css           (~250 lignes) - Boutons de basculement
├── 12-contrib-branding.css  (~80 lignes) - Gestion branding contributions
└── 13-modal-system.css      (~410 lignes) - Système unifié pour toutes les modales ⭐
```

## 🎯 Description des modules

### **00-colors.css** - Variables de couleurs
- Variables CSS (couleurs primaires, danger, info, warning)
- Variations par transparence (alpha)
- Échelle de gris
- Alias sémantiques (texte, borders, surfaces)
- Mode sombre (dark mode)

### **01-base.css** - Fondations
- Reset HTML/body
- Classes utilitaires (`.hidden`, `.visually-hidden`)
- Animations globales (`fadeInScale`, `gp-fade-in`)
- Styles markdown
- Préférences de mouvement réduit

### **02-layout.css** - Structure
- Container principal (`#container`, `#map`)
- Zone de filtres (`#filters-container`)
- Modal de filtrage
- Panneau de détails
- Z-index Leaflet

### **03-navigation.css** - Navigation
- Barre de navigation (`#left-nav`)
- Boutons de catégories (`.nav-category`)
- Sous-menus (`.submenu`)
- Headers de détails
- Boutons génériques (`.gp-btn`)
- Liste de projets (`.project-item`)

### **04-components.css** - Composants réutilisables
- Filtres (`.filter-item`, `.filter-badge`)
- Checkbox Travaux (`.travaux-checkbox`)
- Champs de formulaire
- Badges & Pills (`.chip`, `.badge`, `.etat-pill`)
- Covers (`.project-cover`, `.cover-lightbox`)
- Bouton CTA (`.detail-fullpage-btn`)
- Legend card
- Basemap menu
- Project detail styles

### **05-map.css** - Carte Leaflet
- Tooltip Travaux (`.travaux-tooltip`)
- Tooltip Projet (`.gp-project-tooltip`)
- Camera markers (`.camera-marker`)
- Popups et variants
- Cards pour tooltips

### **06-modals.css** - Modales et overlays
- Modal générique (`.gp-modal-overlay`)
- Contribution modal (`#contrib-overlay`)
- Stepper, tabs, forms
- Draw panel
- File dropzone
- Landing cards
- Step 4 cards (documents)
- Travaux Bento (`.gp-travaux`, `.gp-bento`)
- City menu (`#city-menu`)
- Contribution lists
- Skeletons

### **07-admin.css** - Administration
- City cards (`.city-card`)
- User info card (`.user-info-card`)
- Branding management (`.branding-management`)
- User management (`.user-card`)

### **08-responsive.css** - Media Queries
- Tablet (≤ 1024px) : Navigation en bas
- Mobile (≤ 640px) : Ajustements visuels
- Desktop (≥ 768px) : CTA optimisés
- Compact (≤ 400px) : Ultra-minimaliste
- Préférences de mouvement

### **09-ficheprojet.css** - Page de détail des projets
- Layout mobile-first avec carte + article
- Topbar fixe avec logo et navigation
- Carte responsive (collapsible en mobile)
- Documents de concertation (cards grid)
- PDF lightbox
- Theme toggle intégré

### **10-about-modal.css** - Modale À propos
- Hero section avec animation
- Stats cards
- Features list
- CTA section
- Values cards
- Contact cards
- Formulaire de contact
- Mode clair/sombre

### **11-toggles.css** - Boutons de basculement
- Theme toggle (clair/sombre)
- Boutons de configuration
- Animations de transition

### **12-contrib-branding.css** - Gestion branding
- Styles pour la gestion du branding des contributions
- Customisation des couleurs par ville
- Interface admin pour le branding

### **13-modal-system.css** - Système de modales unifié ⭐ NOUVEAU
- **Système de design cohérent** pour toutes les modales de la plateforme
- Structure BEM : `.gp-modal-overlay` > `.gp-modal` > (header, body, footer)
- **Variants de taille** : compact, default, large, xlarge, fullscreen
- **Variants de style** : glassmorphism, minimal, centered
- **Variants de comportement** : no-padding, no-scroll, sticky header/footer
- Animations et transitions fluides
- Support dark mode complet
- Accessibilité intégrée (ARIA, focus-visible)
- Styles spécifiques pour search modal

## 🚀 Utilisation

### Dans `index.html` :
```html
<!-- Le fichier style.css importe automatiquement tous les modules -->
<link rel="stylesheet" href="style.css">
```

Le fichier `style.css` a été réorganisé et importe maintenant tous les modules depuis `/styles/` dans le bon ordre.

## ✅ Avantages

- **Maintenance facilitée** : un fichier par domaine fonctionnel
- **Debugging rapide** : savoir immédiatement où chercher
- **Collaboration simplifiée** : moins de conflits Git
- **Performance** : possibilité de lazy-load certains modules
- **Clarté** : structure logique et prévisible

## 📝 Conventions

- **Nommage BEM** : `.block__element--modifier`
- **Préfixes** : 
  - `.gp-` pour les composants globaux GrandsProjets
  - `.contrib-` pour les éléments de contribution
  - `.city-` pour les éléments de ville
- **Variables CSS** : définies dans `styles/00-colors.css`

## 🔄 Migration et organisation

### Fichiers déplacés
- ✅ `modules/ui/colors.css` → `styles/00-colors.css`
- ✅ `ficheprojet.css` → `styles/09-ficheprojet.css`
- ✅ `modules/ui/about-modal.css` → `styles/10-about-modal.css`
- ✅ `modules/ui/toggles.css` → `styles/11-toggles.css`
- ✅ `modules/contrib/contrib-branding.css` → `styles/12-contrib-branding.css`

### Fichiers créés par extraction
- ✅ Modules 01-08 : extraits et réorganisés depuis l'ancien `style.css` monolithique

### Fichiers fusionnés
- ✅ `04-components-part2.css` → fusionné dans `04-components.css` (~1100 lignes)
- ✅ `06-modals-part2.css` → fusionné dans `06-modals.css` (~830 lignes)

### Résultat
**Tous les CSS sont maintenant réunifiés dans `/styles/`** avec une architecture cohérente et maintenable.
- **13 fichiers CSS modulaires** au lieu de multiples fichiers dispersés
- **Architecture simplifiée** : plus de fichiers "-part2"
- **Imports optimisés** dans `style.css`
- **Système de modales unifié** (13-modal-system.css)

---

## 🎨 Système de Modales Unifié (13-modal-system.css)

### Utilisation

Toutes les modales de la plateforme utilisent maintenant la même structure :

```html
<!-- Structure HTML standard -->
<div id="my-modal-overlay" 
     class="gp-modal-overlay [variants]" 
     role="dialog" 
     aria-modal="true" 
     style="display:none">
  <div class="gp-modal">
    <div class="gp-modal-header">
      <div class="gp-modal-title">Titre</div>
      <button class="gp-modal-close">×</button>
    </div>
    <div class="gp-modal-body">
      Contenu
    </div>
    <div class="gp-modal-footer">
      <!-- Boutons optionnels -->
    </div>
  </div>
</div>
```

### Variants disponibles

**Tailles :**
- `gp-modal--compact` : 420px max (alertes, confirmations)
- `gp-modal--default` : 720px max (par défaut)
- `gp-modal--large` : 960px max
- `gp-modal--xlarge` : 1200px max
- `gp-modal--fullscreen` : plein écran

**Styles :**
- `gp-modal--glass` : effet glassmorphism
- `gp-modal--minimal` : bordures légères
- `gp-modal--centered` : centrage vertical strict

**Comportements :**
- `gp-modal--no-padding` : pas de padding dans le body
- `gp-modal--no-scroll` : désactive le scroll
- `gp-modal--no-header-border` / `gp-modal--no-footer-border`

### JavaScript

```javascript
// Ouvrir une modale
const overlay = document.getElementById('my-modal-overlay');
const modal = overlay.querySelector('.gp-modal');

overlay.style.display = 'flex';
overlay.setAttribute('aria-hidden', 'false');
setTimeout(() => modal.classList.add('is-open'), 10);

// Fermer une modale
modal.classList.remove('is-open');
setTimeout(() => {
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
}, 200);
```

---

**Dernière mise à jour** : Octobre 2025
