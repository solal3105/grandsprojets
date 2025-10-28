# Guide de Sécurité

## 🔒 Protection contre les attaques XSS

Ce projet utilise le module `SecurityUtils` pour prévenir les injections de code malveillant.

### ✅ Bonnes pratiques

#### 1. **Toujours échapper les données utilisateur**

```javascript
// ❌ DANGEREUX - Ne jamais faire ça
element.innerHTML = `<p>${userInput}</p>`;

// ✅ SÉCURISÉ - Toujours échapper
element.innerHTML = `<p>${SecurityUtils.escapeHtml(userInput)}</p>`;
```

#### 2. **Échapper les attributs HTML**

```javascript
// ❌ DANGEREUX
element.innerHTML = `<img alt="${data.name}" src="${data.url}">`;

// ✅ SÉCURISÉ
const safeName = SecurityUtils.escapeAttribute(data.name);
const safeUrl = SecurityUtils.sanitizeUrl(data.url);
element.innerHTML = `<img alt="${safeName}" src="${safeUrl}">`;
```

#### 3. **Valider les URLs**

```javascript
// ✅ Bloque javascript:, data:text/html, vbscript:
const safeUrl = SecurityUtils.sanitizeUrl(userProvidedUrl);
if (safeUrl) {
  window.location.href = safeUrl;
}
```

#### 4. **Alternative sécurisée à innerHTML**

```javascript
// Au lieu de innerHTML, créer des éléments DOM
const paragraph = SecurityUtils.createSafeElement('p', userText, 'my-class');
container.appendChild(paragraph);
```

---

## 📋 API SecurityUtils

### `SecurityUtils.escapeHtml(text)`
Échappe `<`, `>`, `&`, `"`, `'` pour insertion dans HTML.

**Utiliser pour :** Contenu texte dans innerHTML

### `SecurityUtils.escapeAttribute(text)`
Échappe les caractères pour attributs HTML.

**Utiliser pour :** Valeurs d'attributs (alt, title, data-*, etc.)

### `SecurityUtils.sanitizeUrl(url)`
Valide une URL et bloque les schemes dangereux.

**Utiliser pour :** src, href provenant de sources externes

### `SecurityUtils.createSafeElement(tag, text, className)`
Crée un élément DOM avec textContent (échappement automatique).

**Utiliser pour :** Création d'éléments sans innerHTML

---

## 🚫 Fonctions dangereuses à éviter

### ❌ `eval()`
**Ne JAMAIS utiliser** - Permet l'exécution de code arbitraire.

```javascript
// ❌ INTERDIT
eval(userInput);

// ✅ Alternative
const parts = callbackName.split('.');
let fn = window;
for (const part of parts) fn = fn?.[part];
if (typeof fn === 'function') fn();
```

### ⚠️ `innerHTML` sans échappement
**Toujours échapper** les données avant insertion.

### ⚠️ `document.write()`
**Éviter** - Peut écraser le document entier.

---

## 🛡️ Headers de sécurité (Netlify)

Le fichier `_headers` configure :
- **CSP** : Limite les sources de scripts/styles
- **X-Frame-Options** : Empêche le clickjacking
- **X-Content-Type-Options** : Empêche le MIME sniffing

---

## ✅ Checklist avant commit

- [ ] Les données utilisateur sont échappées avec `SecurityUtils.escapeHtml()`
- [ ] Les URLs externes sont validées avec `SecurityUtils.sanitizeUrl()`
- [ ] Aucun `eval()` dans le code
- [ ] Les attributs HTML sont échappés avec `SecurityUtils.escapeAttribute()`
- [ ] Les nouvelles fonctionnalités ne créent pas de vulnérabilités XSS

---

## 📚 Ressources

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
