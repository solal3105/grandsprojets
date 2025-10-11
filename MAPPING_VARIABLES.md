# 🔗 Mapping des Variables CSS Manquantes

## Objectif
Remplacer les variables non définies dans `colors.css` par celles **déjà existantes**.

---

## ✅ Variables Existantes dans colors.css

### **Couleurs de Base**
- `--primary`, `--primary-hover`, `--primary-active`, `--primary-light`, `--primary-lighter`
- `--danger`, `--danger-hover`, `--danger-active`, `--danger-light`, `--danger-lighter`
- `--info`, `--info-hover`, `--info-light`, `--info-lighter`
- `--warning`, `--warning-hover`, `--warning-light`, `--warning-lighter`
- Toutes les variantes alpha (ex: `--primary-alpha-10`, `--danger-alpha-20`, etc.)

### **Gris**
- `--gray-50` à `--gray-900`

### **Alias Sémantiques**
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled`
- `--border-light`, `--border-medium`, `--border-strong`
- `--surface-base`, `--surface-raised`, `--surface-overlay`

### **Opacités**
- `--white-alpha-XX` (04, 05, 06, 08, 10, 12, 18, 20, 25, 28, 35, 40, 45, 50, 55, 60, 65, 72, 75, 80, 90, 95)
- `--black-alpha-XX` (04, 06, 08, 10, 12, 15, 16, 18, 20, 30, 35, 40, 45, 50, 55, 66, 95)

---

## 🔄 MAPPING COMPLET

### **1. Alias Principaux**

| Variable Manquante | ➜ | Variable Existante | Action |
|-------------------|---|-------------------|--------|
| `--text` | ➜ | `--text-primary` | Remplacer dans CSS |
| `--border` | ➜ | `--border-medium` | Remplacer dans CSS |
| `--surface` | ➜ | `--surface-base` | Remplacer dans CSS |
| `--accent` | ➜ | `--primary` | Remplacer dans CSS |
| `--on-accent` | ➜ | `white` (light) / `var(--gray-50)` (dark) | Remplacer dans CSS |
| `--on-danger` | ➜ | `white` | Remplacer dans CSS |

---

### **2. Surfaces avec Opacités**

| Variable Manquante | ➜ | Formule avec Variables Existantes |
|-------------------|---|-----------------------------------|
| `--surface-30` | ➜ | Remplacer par `var(--white-alpha-30)` en light, `var(--white-alpha-06)` en dark |
| `--surface-60` | ➜ | Remplacer par `var(--white-alpha-60)` en light, `var(--white-alpha-10)` en dark |
| `--surface-70` | ➜ | Remplacer par `var(--white-alpha-72)` en light, `var(--white-alpha-12)` en dark |
| `--surface-80` | ➜ | Remplacer par `var(--white-alpha-80)` en light, `var(--white-alpha-18)` en dark |
| `--surface-90` | ➜ | Remplacer par `var(--white-alpha-90)` en light, `var(--white-alpha-20)` en dark |
| `--surface-92` | ➜ | Remplacer par `var(--white-alpha-95)` en light, `var(--white-alpha-25)` en dark |
| `--surface-95` | ➜ | Remplacer par `var(--white-alpha-95)` en light, `var(--white-alpha-28)` en dark |

---

### **3. Panels & Overlays**

| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--panel-solid` | ➜ | `var(--surface-base)` |
| `--panel-translucent` | ➜ | `var(--white-alpha-80)` (light) / `var(--white-alpha-18)` (dark) |
| `--overlay-strong` | ➜ | `var(--black-alpha-66)` |
| `--overlay-weak` | ➜ | `var(--black-alpha-20)` |
| `--glass-topbar-bg` | ➜ | `var(--white-alpha-80)` (light) / `var(--black-alpha-66)` (dark) |
| `--tooltip-bg` | ➜ | `var(--white-alpha-95)` (light) / `var(--white-alpha-25)` (dark) |

---

### **4. Chips & Cards**

| Variable Manquante | ➜ | Variable Existante (Light) | Variable Existante (Dark) |
|-------------------|---|---------------------------|--------------------------|
| `--chip-bg` | ➜ | `var(--gray-100)` | `var(--gray-200)` |
| `--chip-hover-bg` | ➜ | `var(--gray-200)` | `var(--gray-300)` |

---

### **5. Ombres & Effets**

| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--text-shadow-bright` | ➜ | `var(--white-alpha-60)` |

---

### **6. Couleurs par Catégorie (Project Colors)**

#### **Light Mode**
| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--pc-bus-bg` | ➜ | `var(--warning-lighter)` |
| `--pc-bus-icon` | ➜ | `var(--warning)` |
| `--pc-tram-bg` | ➜ | `var(--info-lighter)` |
| `--pc-tram-icon` | ➜ | `var(--info)` |
| `--pc-velo-bg` | ➜ | `var(--primary-lighter)` |
| `--pc-velo-icon` | ➜ | `var(--primary)` |
| `--pc-urbanisme-bg` | ➜ | `var(--gray-100)` |
| `--pc-urbanisme-icon` | ➜ | `var(--gray-600)` |
| `--pc-default-bg` | ➜ | `var(--gray-100)` |
| `--pc-default-icon` | ➜ | `var(--gray-500)` |

#### **Dark Mode**
| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--pc-bus-bg` | ➜ | `var(--warning-alpha-22)` |
| `--pc-bus-icon` | ➜ | `var(--warning-light)` |
| `--pc-tram-bg` | ➜ | `var(--info-alpha-22)` |
| `--pc-tram-icon` | ➜ | `var(--info-light)` |
| `--pc-velo-bg` | ➜ | `var(--primary-alpha-22)` |
| `--pc-velo-icon` | ➜ | `var(--primary-light)` |
| `--pc-urbanisme-bg` | ➜ | `var(--gray-200)` |
| `--pc-urbanisme-icon` | ➜ | `var(--gray-500)` |
| `--pc-default-bg` | ➜ | `var(--gray-200)` |
| `--pc-default-icon` | ➜ | `var(--gray-400)` |

---

### **7. Couleurs Accentuées (Cards Colorées)**

#### **Light Mode**
| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--accent-blue` | ➜ | `var(--info)` |
| `--accent-red` | ➜ | `var(--danger)` |
| `--accent-green` | ➜ | `var(--primary)` |
| `--blue-card-bg` | ➜ | `var(--info-alpha-08)` |
| `--blue-card-hover-bg` | ➜ | `var(--info-alpha-12)` |
| `--red-card-bg` | ➜ | `var(--danger-alpha-08)` |
| `--red-card-hover-bg` | ➜ | `var(--danger-alpha-16)` |
| `--green-card-bg` | ➜ | `var(--primary-alpha-06)` |
| `--green-card-hover-bg` | ➜ | `var(--primary-alpha-12)` |

#### **Dark Mode**
| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--accent-blue` | ➜ | `var(--info-light)` |
| `--accent-red` | ➜ | `var(--danger)` |
| `--accent-green` | ➜ | `var(--primary)` |
| `--blue-card-bg` | ➜ | `var(--info-alpha-18)` |
| `--blue-card-hover-bg` | ➜ | `var(--info-alpha-25)` |
| `--red-card-bg` | ➜ | `var(--danger-alpha-20)` |
| `--red-card-hover-bg` | ➜ | `var(--danger-alpha-3)` |
| `--green-card-bg` | ➜ | `var(--primary-alpha-18)` |
| `--green-card-hover-bg` | ➜ | `var(--primary-alpha-25)` |

---

### **8. Variables DM (Dark Mode Legacy)**

| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--dm-toggle-bg` | ➜ | `var(--black-alpha-66)` |
| `--dm-text` | ➜ | `var(--text-primary)` |
| `--dm-menu-border` | ➜ | `var(--border-medium)` |
| `--dm-panel-bg` | ➜ | `var(--surface-raised)` |
| `--dm-tile-bg` | ➜ | `var(--black-alpha-40)` |
| `--dm-muted-text` | ➜ | `var(--text-tertiary)` |
| `--dm-menu-shadow-1` | ➜ | `var(--black-alpha-45)` |
| `--dm-menu-shadow-2` | ➜ | `var(--black-alpha-20)` |
| `--dm-body-bg` | ➜ | `var(--gray-900)` |
| `--dm-leftnav-bg` | ➜ | `var(--black-alpha-66)` |
| `--dm-filters-bg` | ➜ | `var(--gray-900)` |
| `--dm-toggle-border` | ➜ | `var(--gray-700)` |
| `--dm-shadow-weak` | ➜ | `var(--black-alpha-35)` |
| `--dm-menu-bg-start` | ➜ | `var(--black-alpha-95)` |
| `--dm-menu-bg-end` | ➜ | `var(--black-alpha-95)` |
| `--dm-chip-bg` | ➜ | `var(--gray-700)` |

---

### **9. Autres**

| Variable Manquante | ➜ | Variable Existante |
|-------------------|---|-------------------|
| `--gray-alpha-10` | ➜ | Utiliser `var(--black-alpha-10)` ou `var(--gray-400)` selon contexte |

---

## 🎯 Plan d'Action

### **Étape 1 : Rechercher & Remplacer dans `style.css`**

Exemples de remplacement global :

```bash
# Alias principaux
var(--text) → var(--text-primary)
var(--border) → var(--border-medium)
var(--surface) → var(--surface-base)
var(--accent) → var(--primary)
var(--on-accent) → white (en light), var(--gray-50) (en dark)

# Surfaces
var(--surface-80) → var(--white-alpha-80) (en light)
var(--panel-translucent) → var(--white-alpha-80) (en light)
var(--tooltip-bg) → var(--white-alpha-95) (en light)

# DM Variables
var(--dm-text) → var(--text-primary)
var(--dm-panel-bg) → var(--surface-raised)
var(--dm-tile-bg) → var(--black-alpha-40)

# Project colors
var(--pc-bus-bg) → var(--warning-lighter)
var(--pc-velo-icon) → var(--primary)
```

### **Étape 2 : Rechercher & Remplacer dans `ficheprojet.css`**

Idem pour les mêmes variables.

### **Étape 3 : Rechercher & Remplacer dans `toggles.css`**

Vérifier les variables `--dm-*` et les remplacer.

### **Étape 4 : Rechercher & Remplacer dans `about-modal.css`**

Vérifier et remplacer si nécessaire.

---

## ✅ Résultat Final

Après remplacement :
- ✅ **0 variable manquante**
- ✅ **Utilisation uniquement des variables de colors.css**
- ✅ **Code plus maintenable**
- ✅ **Pas de duplication**

---

## 🛠️ Script de Remplacement Automatique

Voulez-vous que je génère un script PowerShell pour faire tous ces remplacements automatiquement ?
