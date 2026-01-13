// modules/auth.js
// Gestion de l'authentification Supabase avec refresh proactif robuste
// 
// PROBLÈME RÉSOLU : Écran blanc après ~1h d'inactivité
// CAUSE : Le token JWT Supabase expire après 1h. Le refresh automatique de Supabase
//         ne fonctionne PAS quand l'onglet est en arrière-plan (par design, pour économiser les ressources).
//         Quand l'utilisateur revient sur l'onglet avec un token expiré, l'app crashait.
//
// SOLUTION : 
// 1. Refresh proactif toutes les 4 minutes (le timer peut être throttled en arrière-plan)
// 2. Refresh IMMÉDIAT quand l'onglet redevient visible (visibilitychange)
// 3. Gestion gracieuse de l'expiration : basculement en mode non-connecté sans crash

;(function(win){
  'use strict';
  
  if (!win.supabase) {
    console.error('[AuthModule] Supabase CDN not loaded');
    return;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  const STORAGE_KEY = 'grandsprojets-auth';
  
  // Timing du refresh proactif
  const CHECK_INTERVAL_MS = 4 * 60 * 1000;      // Vérifier toutes les 4 min
  const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // Refresh 10 min avant expiration
  const MAX_REFRESH_FAILURES = 3;               // Abandonner après 3 échecs consécutifs
  
  // ============================================================================
  // CLIENT SUPABASE (singleton partagé avec supabaseservice.js)
  // ============================================================================
  
  const client = win.__supabaseClient || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: true,      // Supabase gère le refresh quand l'onglet est actif
      persistSession: true,        // Stocker la session dans localStorage
      detectSessionInUrl: true,    // Détecter les magic links
      storageKey: STORAGE_KEY
    }
  });
  
  if (!win.__supabaseClient) {
    win.__supabaseClient = client;
  }

  // ============================================================================
  // ÉTAT INTERNE
  // ============================================================================
  
  let cachedSession = null;
  let refreshInterval = null;
  let refreshFailCount = 0;
  let isRefreshing = false; // Éviter les refreshs concurrents

  // ============================================================================
  // FONCTIONS DE REFRESH
  // ============================================================================
  
  /**
   * Tente de rafraîchir la session
   * @returns {Promise<boolean>} true si le refresh a réussi
   */
  async function refreshSession() {
    // Éviter les appels concurrents
    if (isRefreshing) {
      return cachedSession !== null;
    }
    
    isRefreshing = true;
    
    try {
      const { data, error } = await client.auth.refreshSession();
      
      if (error || !data?.session) {
        refreshFailCount++;
        console.warn('[Auth] Refresh échoué (' + refreshFailCount + '/' + MAX_REFRESH_FAILURES + '):', error?.message || 'No session');
        
        if (refreshFailCount >= MAX_REFRESH_FAILURES) {
          console.error('[Auth] Trop d\'échecs de refresh, abandon');
          cachedSession = null;
          stopRefreshTimer();
          handleSessionLost();
          return false;
        }
        return false;
      }
      
      // Succès
      cachedSession = data.session;
      refreshFailCount = 0;
      console.log('[Auth] Session rafraîchie, expire à', new Date(data.session.expires_at * 1000).toLocaleTimeString());
      return true;
      
    } catch (err) {
      console.warn('[Auth] Erreur refresh:', err.message);
      refreshFailCount++;
      return false;
    } finally {
      isRefreshing = false;
    }
  }
  
  /**
   * Vérifie si la session doit être rafraîchie et le fait si nécessaire
   */
  async function checkAndRefresh() {
    if (!cachedSession) return;
    
    try {
      // Récupérer la session actuelle
      const { data } = await client.auth.getSession();
      
      if (!data?.session) {
        // Pas de session, tenter un refresh
        console.log('[Auth] Session perdue, tentative de récupération...');
        await refreshSession();
        return;
      }
      
      // Vérifier le temps restant avant expiration
      const expiresAt = data.session.expires_at * 1000;
      const now = Date.now();
      const timeLeft = expiresAt - now;
      
      if (timeLeft < REFRESH_BEFORE_EXPIRY_MS) {
        console.log('[Auth] Session expire dans', Math.round(timeLeft / 60000), 'min, refresh proactif...');
        await refreshSession();
      } else {
        // Mettre à jour le cache
        cachedSession = data.session;
      }
      
    } catch (err) {
      console.warn('[Auth] Erreur vérification session:', err.message);
    }
  }
  
  // ============================================================================
  // TIMER DE REFRESH PÉRIODIQUE
  // ============================================================================
  
  function startRefreshTimer() {
    if (refreshInterval) return;
    
    // Vérification immédiate
    checkAndRefresh();
    
    // Puis toutes les CHECK_INTERVAL_MS
    // Note: Ce timer peut être throttled par le navigateur en arrière-plan,
    // c'est pourquoi on utilise aussi visibilitychange
    refreshInterval = setInterval(checkAndRefresh, CHECK_INTERVAL_MS);
    
    console.log('[Auth] Timer de refresh démarré (toutes les', CHECK_INTERVAL_MS / 60000, 'min)');
  }
  
  function stopRefreshTimer() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
      console.log('[Auth] Timer de refresh arrêté');
    }
  }

  // ============================================================================
  // GESTION DE LA PERTE DE SESSION
  // ============================================================================
  
  /**
   * Gère gracieusement la perte de session (expiration ou déconnexion)
   * Évite l'écran blanc en basculant proprement en mode non-connecté
   */
  function handleSessionLost() {
    console.log('[Auth] Basculement en mode non-connecté...');
    
    try {
      // Réinitialiser les variables globales
      win.__CONTRIB_ROLE = '';
      win.__CONTRIB_IS_ADMIN = false;
      win.__CONTRIB_VILLES = null;
      
      // Masquer le bouton de contribution
      const contributeToggle = document.getElementById('contribute-toggle');
      if (contributeToggle) {
        contributeToggle.style.display = 'none';
      }
      
      // Fermer les modales de contribution
      const contribModal = document.getElementById('contrib-modal-container');
      if (contribModal) {
        contribModal.innerHTML = '';
      }
      
      // Mettre à jour la visibilité des éléments
      if (win.ContribModule?.applyContribVisibility) {
        win.ContribModule.applyContribVisibility(null);
      }
      
      // Rafraîchir les toggles
      if (win.CityBrandingModule?.applyTogglesConfig && win._cityBranding?.enabled_toggles) {
        win.CityBrandingModule.applyTogglesConfig(win._cityBranding.enabled_toggles, null);
      }
      
    } catch (err) {
      console.warn('[Auth] Erreur basculement mode non-connecté:', err);
    }
  }

  // ============================================================================
  // LISTENERS D'ÉVÉNEMENTS
  // ============================================================================
  
  /**
   * Gestionnaire pour le retour sur l'onglet (CRITIQUE pour éviter l'écran blanc)
   */
  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    
    console.log('[Auth] Onglet redevenu visible, vérification session...');
    
    // Vérification immédiate avec refresh si nécessaire
    (async () => {
      try {
        const { data } = await client.auth.getSession();
        
        if (!data?.session) {
          // Pas de session valide
          if (cachedSession) {
            // On avait une session avant, tenter un refresh
            console.log('[Auth] Session perdue pendant l\'absence, tentative de récupération...');
            const refreshed = await refreshSession();
            
            if (!refreshed) {
              // Refresh échoué, la session est vraiment perdue
              handleSessionLost();
            } else {
              // Refresh réussi, redémarrer le timer
              startRefreshTimer();
            }
          }
          // Si on n'avait pas de session, rien à faire
        } else {
          // Session valide
          cachedSession = data.session;
          
          // Vérifier si proche de l'expiration
          const timeLeft = (data.session.expires_at * 1000) - Date.now();
          if (timeLeft < REFRESH_BEFORE_EXPIRY_MS) {
            console.log('[Auth] Session proche de l\'expiration, refresh...');
            await refreshSession();
          }
          
          // S'assurer que le timer tourne
          startRefreshTimer();
        }
      } catch (err) {
        console.warn('[Auth] Erreur vérification au retour:', err);
      }
    })();
  }
  
  /**
   * Gestionnaire pour le retour de connexion réseau
   */
  function handleOnline() {
    if (!cachedSession) return;
    
    console.log('[Auth] Connexion rétablie, vérification session...');
    checkAndRefresh();
  }
  
  // Enregistrer les listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  win.addEventListener('online', handleOnline);

  // ============================================================================
  // LISTENER SUPABASE AUTH STATE
  // ============================================================================
  
  client.auth.onAuthStateChange((event, session) => {
    console.log('[Auth] Event:', event, session ? '(session présente)' : '(pas de session)');
    
    switch (event) {
      case 'INITIAL_SESSION':
        cachedSession = session;
        if (session) {
          startRefreshTimer();
        } else {
          // Vérifier s'il y a des données corrompues dans le storage
          const storedData = localStorage.getItem(STORAGE_KEY);
          if (storedData) {
            console.log('[Auth] Données auth présentes mais pas de session, tentative de refresh...');
            refreshSession().then(success => {
              if (success) {
                startRefreshTimer();
              } else {
                // Nettoyer les données corrompues
                localStorage.removeItem(STORAGE_KEY);
              }
            });
          }
        }
        break;
        
      case 'SIGNED_IN':
        cachedSession = session;
        refreshFailCount = 0;
        startRefreshTimer();
        break;
        
      case 'TOKEN_REFRESHED':
        cachedSession = session;
        refreshFailCount = 0;
        // Le timer continue de tourner
        break;
        
      case 'SIGNED_OUT':
        cachedSession = null;
        stopRefreshTimer();
        handleSessionLost();
        break;
    }
  });

  // ============================================================================
  // API PUBLIQUE
  // ============================================================================
  
  const AuthModule = {
    getClient: function() { 
      return client; 
    },

    /**
     * Vérifie si l'utilisateur est connecté (synchrone - utilise le cache)
     * @returns {boolean}
     */
    isAuthenticated: function() {
      return !!(cachedSession?.user);
    },
    
    /**
     * Retourne la session en cache (synchrone)
     * @returns {Object|null}
     */
    getCachedSession: function() {
      return cachedSession;
    },

    /**
     * Récupère la session depuis Supabase (async)
     * @returns {Promise<{data: {session: Object|null}, error: Error|null}>}
     */
    getSession: async function() {
      try {
        const result = await client.auth.getSession();
        cachedSession = result.data?.session || null;
        return result;
      } catch (e) {
        console.warn('[Auth] getSession error:', e);
        return { data: { session: null }, error: e };
      }
    },

    /**
     * Récupère la session avec refresh automatique si nécessaire
     * Ne redirige JAMAIS - retourne simplement la session ou null
     * @returns {Promise<{session: Object|null, refreshed: boolean}>}
     */
    getSessionWithRefresh: async function() {
      try {
        const { data } = await client.auth.getSession();
        
        if (data?.session) {
          cachedSession = data.session;
          return { session: data.session, refreshed: false };
        }
        
        // Pas de session, tenter un refresh
        const refreshed = await refreshSession();
        return { 
          session: cachedSession, 
          refreshed: refreshed 
        };
      } catch (e) {
        console.warn('[Auth] getSessionWithRefresh error:', e);
        return { session: null, refreshed: false };
      }
    },

    /**
     * S'abonner aux changements d'état d'authentification
     */
    onAuthStateChange: function(callback) {
      try {
        return client.auth.onAuthStateChange((event, session) => {
          if (callback) callback(event, session);
        });
      } catch (e) {
        console.warn('[Auth] onAuthStateChange error:', e);
        return { data: { subscription: null }, error: e };
      }
    },

    /**
     * Connexion via GitHub OAuth
     */
    signInWithGitHub: async function(redirectTo) {
      try {
        return await client.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: redirectTo || (win.location.origin + '/'),
            scopes: 'read:user,user:email'
          }
        });
      } catch (e) {
        console.warn('[Auth] signInWithGitHub error:', e);
        return { error: e };
      }
    },

    /**
     * Connexion via Magic Link (email)
     */
    signInWithMagicLink: async function(email, redirectTo) {
      try {
        if (!email || typeof email !== 'string') {
          throw new Error('Email invalide');
        }
        return await client.auth.signInWithOtp({
          email,
          options: { 
            emailRedirectTo: redirectTo || (win.location.origin + '/login/'),
            shouldCreateUser: false
          }
        });
      } catch (e) {
        console.warn('[Auth] signInWithMagicLink error:', e);
        return { error: e };
      }
    },

    /**
     * Déconnexion
     */
    signOut: async function() {
      try {
        return await client.auth.signOut();
      } catch (e) {
        console.warn('[Auth] signOut error:', e);
        return { error: e };
      }
    },

    /**
     * Vérifie l'authentification et redirige vers login si non connecté
     */
    requireAuthOrRedirect: async function(loginUrl) {
      try {
        const { data: { session } } = await this.getSession();
        if (!session?.user) {
          win.location.href = loginUrl || '/login/';
          return null;
        }
        return session;
      } catch (_) {
        win.location.href = loginUrl || '/login/';
        return null;
      }
    },
    
    /**
     * Force un refresh de la session (utile pour les tests)
     */
    forceRefresh: async function() {
      return await refreshSession();
    }
  };

  win.AuthModule = AuthModule;
  
})(window);
