// modules/phaos-auth.js
// SSO Phaos → Open Projets via iframe + postMessage
//
// Rôle : intercepter l'init de la carte quand elle tourne dans une iframe Phaos,
// attendre le token Azure B2C envoyé par Phaos via postMessage, l'échanger contre
// une session Supabase via /api/auth/token, puis débloquer l'init normale.
//
// Utilisé uniquement quand window.self !== window.top (iframe Phaos).
// En navigation directe (hors iframe), ce module n'a aucun effet.
//
// Intégration :
//   - Chargé dans index.html juste avant main.js (defer)
//   - main.js Phase 0 : await win.PhaosAuth?.waitForSession()
//

;(function (win) {
  'use strict';

  // ── Origines autorisées pour postMessage ────────────────────────────────────
  // Domaines confirmés par Arthur (AXOPEN) le 15/05/2026
  const PHAOS_ORIGINS = [
    'https://phaos.groupe-helios.com',       // prod
    'https://phaos-qa.groupe-helios.com',    // QA
    'https://terramap-dev.apollossc.com',    // dev
    'http://localhost:3001',                 // dev local
    'http://localhost:8888',                 // dev local (netlify dev)
  ];

  const AUTH_TOKEN_URL = '/api/auth/token';

  // Timeout d'attente du premier ID_TOKEN (15s) — évite un loader infini si
  // Phaos ne répond pas (ex : bug côté Phaos, mauvaise URL)
  const INIT_TIMEOUT_MS = 15_000;

  // ── Détection iframe ────────────────────────────────────────────────────────
  // En navigation directe, on expose waitForSession() qui résout immédiatement.
  const isInPhaosIframe = win.self !== win.top;

  if (!isInPhaosIframe) {
    win.PhaosAuth = { waitForSession: () => Promise.resolve() };
    return;
  }

  console.log('[PhaosAuth] Mode iframe Phaos détecté — init suspendue en attente du token');

  // ── Promise de débloquage ────────────────────────────────────────────────────
  // main.js attend cette Promise. Elle est résolue quand la session Supabase est prête.
  let resolveSession, rejectSession;
  const sessionReady = new Promise((res, rej) => {
    resolveSession = res;
    rejectSession  = rej;
  });

  // Timeout de sécurité — évite un loader infini côté utilisateur
  const initTimeoutId = setTimeout(() => {
    console.error('[PhaosAuth] Timeout : aucun ID_TOKEN reçu de Phaos en', INIT_TIMEOUT_MS, 'ms');
    rejectSession(new Error('Phaos init timeout'));
  }, INIT_TIMEOUT_MS);

  // ── Gestion du renouvellement ────────────────────────────────────────────────
  // Timer qui envoie TOKEN_EXPIRED ~60s avant que la session Supabase expire.
  // Phaos rafraîchit son token Azure si besoin et renvoie un ID_TOKEN → on reboucle.
  let renewalTimerId = null;
  let phaosOrigin = null; // domaine Phaos mémorisé à la première réception d'un ID_TOKEN

  function scheduleRenewal(expiresIn) {
    if (renewalTimerId) clearTimeout(renewalTimerId);
    const delayMs = Math.max((expiresIn - 60) * 1000, 0);
    renewalTimerId = setTimeout(() => {
      console.log('[PhaosAuth] Session Supabase bientôt expirée — notification Phaos');
      try {
        win.parent.postMessage({ type: 'TOKEN_EXPIRED' }, phaosOrigin ?? PHAOS_ORIGINS[0]);
      } catch (err) {
        console.error('[PhaosAuth] Impossible de notifier Phaos :', err.message);
      }
    }, delayMs);
  }

  // ── Échange de token ─────────────────────────────────────────────────────────
  async function exchangeToken(idToken, city) {
    const res = await fetch(AUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, city: city || null }),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(`auth-token HTTP ${res.status}: ${error ?? 'inconnu'}`);
    }

    return res.json(); // { access_token, refresh_token, expires_in }
  }

  // ── Initialisation de la session Supabase ────────────────────────────────────
  async function applySession(idToken) {
    const city = new URLSearchParams(win.location.search).get('city') || null;
    const { access_token, refresh_token, expires_in } = await exchangeToken(idToken, city);

    // win.__supabaseClient est initialisé par auth.js, chargé avant phaos-auth.js
    const client = win.__supabaseClient;
    if (!client) throw new Error('__supabaseClient introuvable — auth.js non chargé ?');

    const { error } = await client.auth.setSession({ access_token, refresh_token });
    if (error) throw error;

    console.log('[PhaosAuth] Session Supabase active');
    scheduleRenewal(expires_in);
    return true;
  }

  // ── Listener postMessage ─────────────────────────────────────────────────────
  let sessionEstablished = false;

  win.addEventListener('message', async (event) => {
    // ① Valider l'origine
    if (PHAOS_ORIGINS.length > 0 && !PHAOS_ORIGINS.includes(event.origin)) {
      // Log silencieux — des messages légitimes d'autres origines existent (extensions, etc.)
      return;
    }

    if (!event.data || event.data.type !== 'ID_TOKEN') return;
    if (typeof event.data.idToken !== 'string' || !event.data.idToken) return;

    console.log('[PhaosAuth] ID_TOKEN reçu depuis', event.origin);
    phaosOrigin = event.origin;
    try {
      await applySession(event.data.idToken);

      if (!sessionEstablished) {
        // Première connexion — débloquer l'init de la carte
        sessionEstablished = true;
        clearTimeout(initTimeoutId);
        resolveSession();
      }
      // Reconnexion silencieuse (renouvellement) — session déjà active, rien à débloquer
    } catch (err) {
      console.error('[PhaosAuth] Échec échange token :', err.message);
      if (!sessionEstablished) {
        clearTimeout(initTimeoutId);
        // On résout quand même (pas reject) — la carte se chargera sans session.
        // L'utilisateur verra l'état non connecté plutôt qu'un écran vide.
        resolveSession();
      }
    }
  });

  // ── API publique ─────────────────────────────────────────────────────────────
  win.PhaosAuth = {
    /**
     * Appelé par main.js Phase 0.
     * Résout quand la session Supabase est prête (ou après timeout/erreur).
     */
    waitForSession: () => sessionReady,
  };

}(window));
