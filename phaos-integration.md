# Phaos x Grands Projets — Plan d'implémentation SSO iframe

## Contexte

**Helios** (helios-marquage.fr) est l'éditeur du logiciel **Phaos** — logiciel de gestion de chantiers / marquage au sol. Helios est déjà partenaire commercial de Grands Projets (landing page existante : `/home/helios`).

L'intégration technique consiste à embarquer Grands Projets dans une **iframe au sein de Phaos**. L'auth se fait via Azure AD B2C : Phaos envoie un `id_token` à l'iframe via `postMessage`, l'iframe l'échange contre un token Supabase, et charge l'app carte.

Le développement côté Phaos est piloté par **Arthur Combe (AXOPEN)** — `arthur.combe@axopen.com`.

---

## Schéma de séquence

```
① Init iframe
  Phaos  →  iframe  : postMessage { type: 'ID_TOKEN', idToken }
  iframe →  /api/auth/token : POST { idToken }
  Supabase API  →  iframe : { supabaseToken, expiresIn }
  → session active dans l'iframe ✓

② Renouvellement (quand supabaseToken expire)
  iframe  →  Phaos : postMessage { type: 'TOKEN_EXPIRED' }
  Phaos refresh son idToken si besoin
  Phaos  →  iframe : postMessage { type: 'ID_TOKEN', idToken }
  → même flow que ① ✓
```

---

## Environnements Azure B2C

| Env  | JWKS                                                                                             | `aud`                                  | `iss`                                                                          |
|------|--------------------------------------------------------------------------------------------------|----------------------------------------|--------------------------------------------------------------------------------|
| Prod | https://login.microsoftonline.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/discovery/v2.0/keys      | `74bf9434-d301-49a6-950b-24cde8047d95` | `https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/v2.0/` |
| QA   | https://login.microsoftonline.com/a5bf3fea-f831-426c-9892-1b8539d43023/discovery/v2.0/keys      | `b71c5170-bd1c-4e73-bbfc-ababa8eb0286` | `https://terrampqa.b2clogin.com/a5bf3fea-f831-426c-9892-1b8539d43023/v2.0/`   |
| Dev  | https://login.microsoftonline.com/6d6d1704-34d0-4b2f-9c5e-f624b4e2d0fc/discovery/v2.0/keys     | `f81ab73a-59ba-440a-bb80-87669c8f7f0a` | `https://terrampdev.b2clogin.com/6d6d1704-34d0-4b2f-9c5e-f624b4e2d0fc/v2.0/` |

---

## Étapes d'implémentation

### Étape 1 — Netlify Function `POST /api/auth/token`
**Fichier :** `netlify/functions/auth-token.mjs`

- [ ] Recevoir `{ idToken }` en POST
- [ ] Décoder le JWT sans vérification → lire `iss` pour détecter l'env (prod/qa/dev)
- [ ] Fetcher le JWKS de l'env correspondant (cache mémoire TTL 1h)
- [ ] Vérifier la signature RSA avec la clé matchant le `kid`
- [ ] Valider `exp` (token non expiré)
- [ ] Valider `aud` (correspond à l'env)
- [ ] Valider `iss` (correspond à l'env)
- [ ] Extraire l'identité : `email` (ou `preferred_username` / `sub`)
- [ ] Chercher l'utilisateur dans Supabase par email (via service role)
- [ ] Si trouvé → `supabase.auth.admin.createSession({ user_id })` → retourner `{ supabaseToken, expiresIn }`
- [ ] Si non trouvé → retourner `{ error: 'user_not_found' }` HTTP 404
- [ ] CORS : autoriser uniquement les origines Phaos connues

---

### Étape 2 — Page d'entrée iframe
**Fichiers :** `iframe/index.html` + `iframe/iframe.js`

- [ ] Page HTML minimale (loader, pas de UI visible)
- [ ] Écouter `window.addEventListener('message', ...)` en **validant `event.origin`** (whitelist Phaos)
- [ ] Sur `{ type: 'ID_TOKEN', idToken }` → appeler `POST /api/auth/token`
- [ ] Si succès → `supabase.auth.setSession({ access_token: supabaseToken })` → charger l'app carte
- [ ] Si `user_not_found` → afficher message "accès non autorisé" (pas d'onboarding autonome)
- [ ] Surveiller `expiresIn` → envoyer `postMessage({ type: 'TOKEN_EXPIRED' })` au parent **avant** expiry
- [ ] Sur réception d'un nouveau `ID_TOKEN` → renouveler la session silencieusement (reboucler sur étape 1)

---

### Étape 3 — Sécurité & configuration
- [ ] Ajouter `SUPABASE_SERVICE_ROLE_KEY` dans les variables d'env Netlify (jamais exposée côté client)
- [ ] Ajouter `PHAOS_ALLOWED_ORIGINS` dans les variables d'env Netlify (domaines Phaos whitelistés)
- [ ] Valider l'origin des `postMessage` (interdire `*`)
- [ ] Rate-limiting sur `/api/auth/token` (ex : 10 req/min par IP)
- [ ] Logs structurés : succès/échec validation JWT, résultat lookup user

---

### Étape 4 — Tests
- [ ] Fonction : token valide + user existant → `{ supabaseToken, expiresIn }` retourné
- [ ] Fonction : token expiré (`exp` dépassé) → 401
- [ ] Fonction : mauvais `aud` ou `iss` → 401
- [ ] Fonction : user inconnu dans Supabase → 404
- [ ] Iframe : `postMessage ID_TOKEN` → app carte chargée
- [ ] Iframe : flow `TOKEN_EXPIRED` → renewal → session renouvelée

---

## URL à communiquer à Arthur

Arthur demande 2 URLs :

| Cas | URL |
|-----|-----|
| **Client existant** (user trouvé dans Supabase) | À définir — chemin de la carte, ex : `https://openprojets.com/?city=<slug>` |
| **Client inconnu** (user non trouvé) | **`https://openprojets.com/home/helios`** — page existante, rien à créer |

La page `/home/helios` est déjà la landing commerciale Helios × Open Projets qui invite à activer le service. C'est exactement la bonne destination pour un utilisateur Phaos dont la collectivité n'est pas encore cliente.

---

## Questions ouvertes (à trancher avant de coder)

- [ ] **Quel est le domaine de l'app Phaos ?** Le domaine email Helios est `helios-marquage.fr` mais le domaine de l'app Phaos est inconnu (ex : `phaos.helios-marquage.fr` ?). Nécessaire pour valider `postMessage.origin`. À demander à Arthur.
- [ ] **L'email dans le token Azure B2C est-il identique à l'email enregistré dans Supabase ?** (si non, faut-il matcher sur `sub` ou `preferred_username` ?)
- [ ] **Quel slug de ville Phaos veut-il afficher ?** (ex : `metropole-lyon`) — à passer en `?city=<slug>` dans l'URL de l'iframe, `getActiveCity()` gère déjà ça nativement
- [ ] **`SUPABASE_SERVICE_ROLE_KEY` à configurer dans Netlify** — aucune fonction actuelle ne l'utilise, elle est absente. À ajouter manuellement dans le dashboard Netlify.

## Ce qui existe déjà (ne pas recréer)

- **`/home/helios`** — landing page commerciale Helios × Open Projets (`home-src/src/views/HeliosView.vue`). Page marketing complète, rien à modifier.
- **`getActiveCity()`** dans `supabaseservice.js` — lit déjà `?city=` via `CityManager`, pas de code à écrire pour ça.
- **Whitelist CORS HTTP** dans `ai-generate.mjs` — pattern réutilisable tel quel pour `auth-token.mjs`.
