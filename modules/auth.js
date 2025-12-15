// modules/auth.js
;(function(win){
  if (!win.supabase) {
    console.error('[AuthModule] Supabase CDN not loaded. Load @supabase/supabase-js before auth.js');
    return;
  }

  // Réutiliser le client Supabase existant (créé par supabaseservice.js)
  // Évite le warning "Multiple GoTrueClient instances"
  const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  
  // Réutiliser le client existant s'il existe déjà
  // Configuration identique à supabaseservice.js pour cohérence
  const client = win.__supabaseClient || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'grandsprojets-auth'
    }
  });
  if (!win.__supabaseClient) {
    win.__supabaseClient = client;
  }

  // Cache pour la session (mis à jour par onAuthStateChange)
  let cachedSession = null;
  let sessionCheckInterval = null;
  
  // Initialiser le cache avec la session actuelle et tenter un refresh si nécessaire
  (async function initSession() {
    try {
      const { data, error } = await client.auth.getSession();
      
      if (error) {
        console.warn('[AuthModule] Erreur getSession au démarrage:', error.message);
      }
      
      let session = data?.session || null;
      
      // Si pas de session mais des données dans localStorage, tenter un refresh
      if (!session) {
        const storageKey = 'grandsprojets-auth';
        const storedData = localStorage.getItem(storageKey);
        
        if (storedData) {
          console.log('[AuthModule] Tentative de refresh de la session au démarrage...');
          try {
            const refreshResult = await client.auth.refreshSession();
            if (refreshResult.data?.session) {
              session = refreshResult.data.session;
              console.log('[AuthModule] Session rafraîchie avec succès au démarrage');
            } else {
              console.warn('[AuthModule] Refresh échoué au démarrage:', refreshResult.error?.message);
            }
          } catch (refreshErr) {
            console.warn('[AuthModule] Erreur refresh au démarrage:', refreshErr.message);
          }
        }
      }
      
      cachedSession = session;
      
      // Démarrer la surveillance si une session existe
      if (cachedSession) {
        startSessionMonitoring();
      }
    } catch (e) {
      console.error('[AuthModule] Erreur initialisation session:', e);
      cachedSession = null;
    }
  })();
  
  /**
   * Surveillance proactive de la session
   * Vérifie toutes les 5 minutes si la session est valide et la rafraîchit si nécessaire
   */
  function startSessionMonitoring() {
    // Éviter les doublons
    if (sessionCheckInterval) return;
    
    const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
    
    sessionCheckInterval = setInterval(async () => {
      try {
        const { data, error } = await client.auth.getSession();
        
        if (error || !data?.session) {
          // Session invalide, tenter un refresh
          console.log('[AuthModule] Session expirée détectée, tentative de refresh...');
          const refreshResult = await client.auth.refreshSession();
          
          if (refreshResult.error || !refreshResult.data?.session) {
            console.warn('[AuthModule] Refresh échoué, session perdue');
            stopSessionMonitoring();
            cachedSession = null;
          } else {
            console.log('[AuthModule] Session rafraîchie avec succès');
            cachedSession = refreshResult.data.session;
          }
        } else {
          // Session valide, vérifier si proche de l'expiration
          const session = data.session;
          const expiresAt = session.expires_at * 1000; // Convertir en ms
          const now = Date.now();
          const timeUntilExpiry = expiresAt - now;
          
          // Si moins de 10 minutes avant expiration, rafraîchir proactivement
          if (timeUntilExpiry < 10 * 60 * 1000) {
            console.log('[AuthModule] Session proche de l\'expiration, refresh proactif...');
            const refreshResult = await client.auth.refreshSession();
            if (refreshResult.data?.session) {
              cachedSession = refreshResult.data.session;
              console.log('[AuthModule] Refresh proactif réussi');
            }
          }
        }
      } catch (err) {
        console.warn('[AuthModule] Erreur lors de la vérification de session:', err);
      }
    }, CHECK_INTERVAL);
  }
  
  function stopSessionMonitoring() {
    if (sessionCheckInterval) {
      clearInterval(sessionCheckInterval);
      sessionCheckInterval = null;
    }
  }
  
  /**
   * Gestion de la reconnexion réseau
   * Tente de rafraîchir la session quand la connexion revient
   */
  function setupNetworkListeners() {
    if (typeof win.addEventListener !== 'function') return;
    
    // Quand la connexion revient
    win.addEventListener('online', async () => {
      if (cachedSession) {
        console.log('[AuthModule] Connexion rétablie, vérification de la session...');
        try {
          const { data, error } = await client.auth.getSession();
          if (error || !data?.session) {
            // Tenter un refresh
            const refreshResult = await client.auth.refreshSession();
            if (refreshResult.data?.session) {
              cachedSession = refreshResult.data.session;
              console.log('[AuthModule] Session restaurée après reconnexion');
            }
          }
        } catch (err) {
          console.warn('[AuthModule] Erreur lors de la restauration de session:', err);
        }
      }
    });
    
    // Quand l'onglet redevient visible (l'utilisateur revient sur la page)
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && cachedSession) {
        try {
          const { data } = await client.auth.getSession();
          if (!data?.session) {
            // Session perdue pendant l'absence, tenter un refresh
            console.log('[AuthModule] Onglet redevenu visible, refresh de session...');
            const refreshResult = await client.auth.refreshSession();
            if (refreshResult.data?.session) {
              cachedSession = refreshResult.data.session;
            }
          }
        } catch (err) {
          // Ignorer silencieusement
        }
      }
    });
  }
  
  // Initialiser les listeners réseau
  setupNetworkListeners();
  
  // Écouter les changements pour maintenir le cache à jour
  client.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
    
    // Gérer les différents événements
    switch (event) {
      case 'INITIAL_SESSION':
        // Session initiale au chargement de l'app
        // Si session = null mais il y avait des données auth dans localStorage,
        // cela signifie que le refresh token a expiré
        if (!session) {
          const storageKey = 'grandsprojets-auth';
          const storedData = localStorage.getItem(storageKey);
          
          if (storedData) {
            console.warn('[AuthModule] Session expirée détectée au démarrage - nettoyage du localStorage');
            // Nettoyer les données de session corrompues
            localStorage.removeItem(storageKey);
            
            // Recharger la page pour avoir un état propre
            // Utiliser un flag pour éviter une boucle infinie
            const reloadFlag = 'auth-session-cleaned';
            if (!sessionStorage.getItem(reloadFlag)) {
              sessionStorage.setItem(reloadFlag, 'true');
              console.log('[AuthModule] Rechargement pour appliquer le nettoyage...');
              setTimeout(() => location.reload(), 100);
            } else {
              // Flag déjà présent = on a déjà rechargé, ne pas boucler
              sessionStorage.removeItem(reloadFlag);
            }
          }
        } else {
          // Session valide, démarrer la surveillance
          startSessionMonitoring();
        }
        break;
      case 'SIGNED_IN':
      case 'TOKEN_REFRESHED':
        // Démarrer/continuer la surveillance
        startSessionMonitoring();
        break;
      case 'SIGNED_OUT':
        // Arrêter la surveillance
        stopSessionMonitoring();
        break;
    }
  });

  const AuthModule = {
    getClient: function() { return client; },

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

    getSession: async function() {
      try {
        const result = await client.auth.getSession();
        // Mettre à jour le cache
        cachedSession = result.data?.session || null;
        return result;
      } catch (e) {
        console.warn('[AuthModule] getSession error:', e);
        return { data: { session: null }, error: e };
      }
    },

    /**
     * Récupère la session avec refresh automatique si expirée
     * Ne redirige JAMAIS - retourne simplement la session ou null
     * @returns {Promise<{session: Object|null, refreshed: boolean}>}
     */
    getSessionWithRefresh: async function() {
      try {
        // 1. Essayer de récupérer la session actuelle
        let result = await client.auth.getSession();
        let session = result.data?.session;
        
        // 2. Si pas de session ou token expiré, tenter un refresh
        if (!session) {
          try {
            const refreshResult = await client.auth.refreshSession();
            if (refreshResult.data?.session) {
              session = refreshResult.data.session;
              cachedSession = session;
              return { session, refreshed: true };
            }
          } catch (refreshErr) {
            // Refresh échoué silencieusement
          }
        }
        
        cachedSession = session || null;
        return { session: session || null, refreshed: false };
      } catch (e) {
        console.warn('[AuthModule] getSessionWithRefresh error:', e);
        return { session: null, refreshed: false };
      }
    },

    onAuthStateChange: function(callback) {
      try {
        return client.auth.onAuthStateChange((event, session) => callback && callback(event, session));
      } catch (e) {
        console.warn('[AuthModule] onAuthStateChange error:', e);
        return { data: { subscription: null }, error: e };
      }
    },

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
        console.warn('[AuthModule] signInWithGitHub error:', e);
        return { error: e };
      }
    },

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
        console.warn('[AuthModule] signInWithMagicLink error:', e);
        return { error: e };
      }
    },

    signOut: async function() {
      try {
        return await client.auth.signOut();
      } catch (e) {
        console.warn('[AuthModule] signOut error:', e);
        return { error: e };
      }
    },

    requireAuthOrRedirect: async function(loginUrl) {
      try {
        const { data: { session } } = await AuthModule.getSession();
        if (!session || !session.user) {
          win.location.href = loginUrl || '/login/';
          return null;
        }
        return session;
      } catch (_) {
        win.location.href = loginUrl || '/login/';
        return null;
      }
    }
  };

  win.AuthModule = AuthModule;
})(window);
