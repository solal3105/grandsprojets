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

> ⚠️ **JWKS = endpoint B2C de la policy** (`b2clogin.com/{tenantId}/b2c_1_login/discovery/v2.0/keys`).
> NE PAS utiliser `login.microsoftonline.com/{tenant}/discovery/v2.0/keys` : il ne renvoie que les
> clés Entra génériques (mêmes clés pour tout tenant), jamais le `kid` des tokens B2C → 401
> "Clé de signature inconnue". Les clés B2C sont au niveau du tenant : toute policy valide expose
> le même JWKS, donc `b2c_1_login` couvre toutes les policies. (Env Dev supprimé — n'existe plus.)

| Env  | JWKS                                                                                              | `aud`                                  | `iss`                                                                          |
|------|--------------------------------------------------------------------------------------------------|----------------------------------------|--------------------------------------------------------------------------------|
| Prod | https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/b2c_1_login/discovery/v2.0/keys | `74bf9434-d301-49a6-950b-24cde8047d95` | `https://terrampprod.b2clogin.com/e49dda1d-3ac4-43db-ab0c-479cd0ba9d36/v2.0/` |
| QA   | https://terrampqa.b2clogin.com/a5bf3fea-f831-426c-9892-1b8539d43023/b2c_1_login/discovery/v2.0/keys   | `b71c5170-bd1c-4e73-bbfc-ababa8eb0286` | `https://terrampqa.b2clogin.com/a5bf3fea-f831-426c-9892-1b8539d43023/v2.0/`   |

---

## Étapes d'implémentation

### Étape 1 — Netlify Function `POST /api/auth/token` ✅
**Fichier :** `netlify/functions/auth-token.mjs`

- [x] Recevoir `{ idToken, city? }` en POST (`city` = slug de la collectivité, optionnel)
- [x] Décoder le JWT sans vérification → lire `iss` pour détecter l'env (prod/qa/dev)
- [x] Fetcher le JWKS de l'env correspondant (cache mémoire TTL 1h)
- [x] Vérifier la signature RSA avec la clé matchant le `kid` (Web Crypto API, pas de dépendance externe)
- [x] Valider `exp` (token non expiré) — avant les appels réseau
- [x] Valider `aud` (correspond à l'env)
- [x] Valider `iss` (match exact avec l'env)
- [x] Extraire l'identité : `payload.emails[0]` (array confirmé par Arthur le 15/05/2026)
- [x] Chercher l'utilisateur dans Supabase par email (via service role — `auth.admin.listUsers`)
- [x] Si trouvé → forger une session via `generateLink({ type:'magiclink', email })` (sans email) puis `verifyOtp({ token_hash, type:'email' })` → retourner `{ access_token, refresh_token, expires_in }`. ⚠️ `auth.admin.createSession()` n'existe PAS dans @supabase/supabase-js.
- [x] **Si non trouvé → auto-provisioning** : `auth.admin.createUser({ email, email_confirm: true })` puis session (acté avec Arthur le 08/04/2026 — **pas de 404, pas de redirect**)
- [x] **Création du profil** : après `createUser`, `INSERT INTO profiles (id, role, ville)` avec `role = 'admin'` et `ville = [citySlug]` (city lue depuis le body, fournie par `phaos-auth.js` via `?city=` de l'URL). Non-bloquant : si l'insert échoue, l'auth réussit quand même et l'erreur est loguée.
- [x] CORS : autorise `https://openprojets.com` + localhost dev (pas les domaines Phaos — ceux-ci ne font jamais d'appel direct à la fonction)
- [x] Redirect Netlify : `netlify.toml` route `/api/auth/token` → `/.netlify/functions/auth-token`
- [x] `@supabase/supabase-js` déplacé de `devDependencies` vers `dependencies` (requis pour le bundle Netlify prod)

**Inconnues / TODO avant prod :**
- [x] ~~☐ `SUPABASE_SERVICE_ROLE_KEY`~~ — **ajoutée dans Netlify le 15/05/2026** (Production + Deploy Previews + Branch deploys)
- [x] ~~☐ **Confirmer avec Arthur le claim email**~~ — **résolu le 15/05/2026** : claim `emails[0]` (array Azure B2C, une seule adresse en pratique)
- [ ] ☐ **`listUsers` sans filtre serveur** (perPage: 1000) — correct en V1 (B2B, base restreinte). À remplacer par une query directe sur `auth.users` si la base dépasse ~1000 entrées.

---

### Étape 2 — Module Phaos auth dans la page carte ✅
**Fichiers :** `modules/phaos-auth.js` + `main.js` Phase 0a + `index.html`

- [x] IIFE `window.PhaosAuth` — pattern carte (pas d'ES module)
- [x] Détecter si l'app tourne dans une iframe : `window.self !== window.top`
- [x] Si **hors iframe** → `waitForSession()` résout immédiatement — **zéro impact** sur la navigation directe
- [x] Si **iframe Phaos** → bloquer l'init normale (Phase 1+) jusqu'à réception du token
- [x] Écouter `window.addEventListener('message', ...)` en validant `event.origin` contre `PHAOS_ORIGINS`
- [x] Sur `{ type: 'ID_TOKEN', idToken }` → appeler `POST /api/auth/token` avec `{ idToken, city }` (`city` lu depuis `?city=` de l'URL courante)
- [x] Si succès → `supabase.auth.setSession({ access_token, refresh_token })` → débloquer l'init
- [x] Si échec de l'échange → résoudre quand même (carte chargée en état non connecté, pas d'écran blanc)
- [x] Timeout 15s — si Phaos ne répond pas, init débloquée en état non connecté
- [x] Surveiller `expires_in` → envoyer `postMessage({ type: 'TOKEN_EXPIRED' })` au parent ~60s avant expiry
- [x] Sur réception d'un nouveau `ID_TOKEN` (renouvellement) → session mise à jour silencieusement
- [x] `main.js` Phase 0a : `await win.PhaosAuth?.waitForSession()` — avant health check et Phase 1
- [x] `index.html` : `<script defer src="modules/phaos-auth.js">` inséré après `auth.js` et avant `main.js`

**Inconnues / TODO avant prod :**
- [x] ~~☐ **Domaine(s) de l'app Phaos**~~ — **reçus le 15/05/2026** :
  - Prod : `https://phaos.groupe-helios.com`
  - QA : `https://phaos-qa.groupe-helios.com`
  - Dev : `https://terramap-dev.apollossc.com`
- [x] ~~☐ **`_headers`**~~ — `frame-ancestors` mis à jour avec les 3 domaines Phaos.
- [ ] ☐ **`postMessage` target origin dans `scheduleRenewal()`** — pour l'instant envoie vers `PHAOS_ORIGINS[last]`. À affiner si Phaos a des domaines différents selon l'env (prod/qa/dev).

---

### Étape 3 — Sécurité & configuration ✅
- [x] `SUPABASE_SERVICE_ROLE_KEY` documentée (variable Netlify) — **☐ à créer dans le dashboard**
- [x] Validation de l'origin des `postMessage` implémentée (whitelist `PHAOS_ORIGINS`) — **☐ domaine réel à renseigner**
- [x] Logs structurés : succès/échec JWT, résultat lookup/create user
- [x] **Rate-limiting** : 10 req/min par IP, fenêtre glissante 60s, in-memory dans `auth-token.mjs` — retourne 429. Note : par instance Netlify (cold start = reset). Acceptable pour un usage B2B V1.
- [x] **`_headers` `frame-ancestors`** : `'none'` sur toutes les routes par défaut. `*` uniquement sur `/` et `/index.html` (la carte). **☐ Remplacer `*` par le domaine Phaos** une fois connu.

---

### Étape 4 — Tests ✅
**Fichiers :** `tests/unauth.phaos-function.spec.js` + `tests/unauth.phaos-iframe.spec.js` + `tests/fixtures/phaos-host.html`

**Section 0.3 — Fonction API (tests HTTP, pas de navigateur) :**
- [x] 0.3.1 — OPTIONS preflight → 204 + headers CORS corrects
- [x] 0.3.2 — POST sans body → 400
- [x] 0.3.2 — POST body non-JSON → 400
- [x] 0.3.2 — POST idToken manquant → 400
- [x] 0.3.2 — POST idToken sans points (non-JWT) → 400 "JWT malformé"
- [x] 0.3.3 — JWT avec `iss` inconnu → 401 "Émetteur non reconnu"
- [x] 0.3.3 — JWT expiré (env prod) → 401 "Token expiré"
- [x] 0.3.3 — JWT avec `aud` incorrect → 401 "Audience invalide"
- [x] 0.3.3 — JWT avec `iss` non conforme (match détection mais pas exact) → 401
- [x] 0.3.4 — GET → 405

**Section 0.4 — Module iframe (E2E Playwright) :**
- [x] 0.4.1.1 — Navigation directe : carte chargée normalement sans blocage PhaosAuth
- [x] 0.4.1.2 — `window.PhaosAuth.waitForSession()` résout immédiatement en navigation directe
- [x] 0.4.2.1 — Mode iframe + token invalide : échange échoué → carte chargée quand même (résilience)
- [x] 0.4.2.2 — Aucun loader infini après échec échange token
- [x] 0.4.2.3 — `window.PhaosAuth` exposé dans l'iframe avec `waitForSession`

**Non testables en E2E (raisons documentées) :**
- ✗ Fonction : token valide + user existant → session — nécessite un vrai token Azure B2C signé
- ✗ Fonction : auto-provisioning user inconnu → session — idem
- ✗ Fonction : `SUPABASE_SERVICE_ROLE_KEY` absente → 500 — nécessite de modifier les env vars en cours de test
- ✗ Iframe : timeout 15s (pas de message) → trop lent pour CI
- ✗ Flow `TOKEN_EXPIRED` → renewal complet → nécessite un vrai token Azure

---

## URL à communiquer à Arthur

Arthur demande 2 URLs :

| Cas | URL |
|-----|-----|
| **Tous les utilisateurs** | **`https://openprojets.com/?city=<slug>`** — la carte directement. Si l'utilisateur est inconnu, il est **auto-créé** (acté 08/04/2026). |

Phaos doit passer le slug de ville dans l'URL de l'iframe (`?city=metropole-lyon` par exemple). `getActiveCity()` le lit déjà nativement. Il n'y a plus de redirect vers `/home/helios` — tous les utilisateurs B2C valides accèdent à la carte.

> **Note :** `/home/helios` reste la landing commerciale Helios × Open Projets pour les visiteurs non-authentifiés. Elle n'est plus une destination de fallback du flow iframe.

---

## Questions ouvertes

- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** — ~~à créer dans le dashboard Netlify~~ **ajoutée le 15/05/2026**.
- [ ] **`postMessage` target origin dans `scheduleRenewal()`** — pour l'instant envoie vers `PHAOS_ORIGINS[last]` (= `localhost:8888` en dev). À affiner pour cibler l'env Phaos adéquat selon le contexte.

---

## Actions à faire après retour d'Arthur

### ① Domaine(s) de l'app Phaos reçus — 15/05/2026 ✅

- [x] `modules/phaos-auth.js` — `PHAOS_ORIGINS` mis à jour avec les 3 domaines (prod / QA / dev)
- [x] `_headers` — `frame-ancestors` restreint aux 3 domaines Phaos
- [x] `modules/phaos-auth.js` — `scheduleRenewal()` : `phaosOrigin` mémorisé au premier `ID_TOKEN` reçu, utilisé comme `targetOrigin` exact du `postMessage`
- [ ] Retirer les entrées localhost de `PHAOS_ORIGINS` si elles ne sont plus nécessaires en prod

### ② Claim email confirmé par Arthur — 15/05/2026 ✅

- [x] `netlify/functions/auth-token.mjs` — `extractEmail()` mis à jour : lit `payload.emails[0]`
- [x] Commentaire `TODO[ARTHUR]` supprimé

### ③ Avant premier test en QA (indépendant du retour Arthur)

- [x] Ajouter `SUPABASE_SERVICE_ROLE_KEY` dans le dashboard Netlify — **fait le 15/05/2026**
- [ ] Vérifier que `@supabase/supabase-js` est bien résolu dans le bundle Netlify Functions (`netlify build`)

## Ce qui existe déjà (ne pas recréer)

- **`/home/helios`** — landing page commerciale Helios × Open Projets (`home-src/src/views/HeliosView.vue`). Page marketing complète, rien à modifier.
- **`getActiveCity()`** dans `supabaseservice.js` — lit déjà `?city=` via `CityManager`, pas de code à écrire pour ça.
- **Whitelist CORS HTTP** dans `ai-generate.mjs` — pattern réutilisable tel quel pour `auth-token.mjs`.
