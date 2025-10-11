# Mapping des variables CSS à remplacer

## Variables à remplacer par des existantes

### Toggle variables
```css
--toggle-bg → --white-alpha-60
--toggle-bg-hover → --white-alpha-90 (ou --white-alpha-85 n'existe pas, utiliser --white-alpha-90)
--toggle-color → --gray-700
--toggle-color-active → --primary
```

### Surface variables
```css
--surface → --white (ou --surface-base en dark)
--surface-95 → --white-alpha-95
--surface-92 → --white-alpha-90
--surface-90 → --white-alpha-90
--surface-80 → --white-alpha-80
--surface-70 → --white-alpha-72
--surface-60 → --white-alpha-60
--surface-50 → --white-alpha-50
--surface-35 → --white-alpha-35
--surface-30 → --white-alpha-28
```

### On-accent variables
```css
--on-accent → --white
--on-danger → --white
--text-shadow-bright → --white
```

### Alias sémantiques
```css
--text → --text-primary
--panel-solid → --surface-base
--panel-translucent → --white-alpha-80
--border → --border-light
--chip-bg → --primary-lighter
--chip-hover-bg → --primary-light
--accent → --primary
--accent-contrast → --white
--overlay-strong → --white-alpha-60
--overlay-weak → --white-alpha-18
--glass-topbar-bg → --white-alpha-72
--tooltip-bg → --white-alpha-72
```

### Accent colors
```css
--accent-blue → --info
--accent-red → --danger
--accent-green → --primary
```

### Card backgrounds
```css
--blue-card-bg → --info-lighter
--blue-card-hover-bg → --info-light
--red-card-bg → --danger-lighter
--red-card-hover-bg → --danger-light
--green-card-bg → --primary-lighter
--green-card-hover-bg → --primary-light
```

### Project colors
```css
--pc-bus-bg → --info-alpha-22
--pc-bus-icon → --info-light
--pc-default-bg → --warning-alpha-22
--pc-default-icon → --warning
--pc-tram-bg → --info-alpha-22
--pc-tram-icon → --info
--pc-urbanisme-bg → --info-alpha-22
--pc-urbanisme-icon → --info
--pc-velo-bg → --primary-alpha-22
--pc-velo-icon → --primary
```

## Fichiers à modifier

1. **style.css** - Remplacer toutes les utilisations
2. **ficheprojet.css** - Vérifier les utilisations
3. **toggles.css** - Remplacer les toggle-* variables
4. **about-modal.css** - Vérifier les utilisations

## Note sur le dark mode

En dark mode, utilisez directement les variables de couleurs de `colors.css` qui sont déjà définies dans `html[data-theme='dark']` :
- Les gray sont inversés automatiquement
- Les couleurs primaires sont plus douces
- Les alpha transparencies fonctionnent automatiquement
