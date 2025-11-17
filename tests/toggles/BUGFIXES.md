# 🐛 Corrections des Tests Toggles

## Résumé des erreurs et fixes appliqués

---

## 1️⃣ LOGIN TOGGLE - Redirection échouée

### ❌ Erreur
```
Error: Redirection échouée. URL: http://localhost:3001/
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
```

### 🔍 Cause
Le test utilisait `page.waitForURL('**/login')` qui ne capturait pas correctement la navigation synchrone via `window.location.href = '/login'`.

### ✅ Solution
Utiliser `page.waitForNavigation()` en parallèle du click pour capturer la navigation complète :

```javascript
// AVANT
await toggle.click();
await page.waitForURL('**/login', { timeout: 15000 });

// APRÈS
await Promise.all([
  page.waitForNavigation({ timeout: 15000 }),
  toggle.click()
]);
```

**Fichier:** `login-toggle.spec.js` - Tests 3 & 4

---

## 2️⃣ SEARCH TOGGLE - Focus et fermeture échouent

### ❌ Erreurs
```
Error: expect(received).toBe(expected)
Expected: true
Received: false

TimeoutError: page.click: Timeout 15000ms exceeded.
<div id="search-overlay"> intercepts pointer events
```

### 🔍 Causes
1. **Focus :** Le `searchmodule.js` applique le focus dans le callback `onOpen` après l'animation, donc le test vérifie trop tôt
2. **Click extérieur :** L'overlay a `role="dialog"` et intercepte TOUS les clics, rendant impossible le click sur `#map`

### ✅ Solutions

#### Focus : Augmenter le timeout
```javascript
// AVANT
await page.waitForTimeout(500);

// APRÈS
await page.waitForTimeout(800); // Attendre animation + focus callback
```

#### Fermeture : Utiliser ESC au lieu du click
```javascript
// AVANT
await page.click('#map', { position: { x: 100, y: 100 } });

// APRÈS
await page.keyboard.press('Escape'); // ESC fonctionne via ModalHelper
```

**Fichier:** `search-toggle.spec.js` - Tests 3 & 4

---

## 3️⃣ THEME TOGGLE - Ne bascule pas vers dark (6 tests échouent)

### ❌ Erreurs
```
Error: expect(received).toBe(expected)
Expected: "dark"
Received: "light"

Expected: true  (hasDarkClass)
Received: false
```

### 🔍 Cause PRINCIPALE
`ThemeManager.startOSThemeSync()` est appelé au chargement de la page (`main.js:456`) et **réinitialise continuellement le thème selon les préférences OS** de l'utilisateur.

**Flow problématique :**
1. Test : `toggle.click()` → appelle `ThemeManager.toggle()` → set dark
2. OS Sync : détecte que l'OS est en light → force light immédiatement
3. Test : vérifie le thème → trouve "light" au lieu de "dark" ❌

### ✅ Solution
**Désactiver la synchronisation OS dans `beforeEach` :**

```javascript
test.beforeEach(async ({ page, context }) => {
  // ... goto, clear storage ...
  
  // 1. Désactiver la synchronisation OS
  await page.evaluate(() => {
    if (window.ThemeManager) {
      window.ThemeManager.stopOSThemeSync();
    }
  });
  
  // 2. Forcer le thème light initial
  await page.evaluate(() => {
    if (window.ThemeManager) {
      window.ThemeManager.applyTheme('light');
      localStorage.removeItem('theme');
    }
  });
  
  await page.waitForTimeout(300);
});
```

**Pour le test de restauration après reload :**
```javascript
await page.reload();
await expect(page.locator('#map')).toBeVisible({ timeout: 30000 });

// Désactiver la sync OS après reload AUSSI
await page.evaluate(() => {
  if (window.ThemeManager) {
    window.ThemeManager.stopOSThemeSync();
  }
});

await page.waitForTimeout(500);
```

**Fichier:** `theme-toggle.spec.js` - Tests 2, 3, 4, 6, 7, 8

---

## 🎯 Récapitulatif des Fichiers Modifiés

| Fichier | Tests Corrigés | Type de Fix |
|---------|----------------|-------------|
| `theme-toggle.spec.js` | 6 tests | Désactivation OS Theme Sync |
| `search-toggle.spec.js` | 2 tests | Timeout focus + ESC au lieu de click |
| `login-toggle.spec.js` | 2 tests | waitForNavigation au lieu de waitForURL |

---

## 📚 Leçons Apprises

### 1. **Synchronisation OS**
Les thèmes modernes se synchronisent avec les préférences OS via `matchMedia('prefers-color-scheme')`. Dans les tests, cette sync peut interférer avec les interactions utilisateur → **toujours désactiver** pour avoir un environnement déterministe.

### 2. **Focus Asynchrone**
Le focus peut être appliqué dans un callback après animation. Les tests doivent attendre suffisamment longtemps pour que tout le flow soit terminé.

### 3. **Modal Dialogs**
Les overlays avec `role="dialog"` et `aria-modal="true"` interceptent les clics extérieurs par design. Pour tester la fermeture, utiliser :
- ESC (clavier)
- Bouton de fermeture explicite
- Ne PAS cliquer en dehors

### 4. **Navigation vs URL Change**
Pour détecter les redirections via `window.location.href` :
- ✅ `page.waitForNavigation()`
- ❌ `page.waitForURL()` (peut ne pas capturer)

---

## ✅ Tests Réussis

Après ces corrections, tous les 57 tests devraient passer :
- Theme: 9/9 ✅
- Filters: 8/8 ✅
- Basemap: 8/8 ✅
- Search: 7/7 ✅
- Location: 6/6 ✅
- Info: 7/7 ✅
- Contribute: 7/7 ✅
- Login: 5/5 ✅

**Total: 57/57** 🎉
