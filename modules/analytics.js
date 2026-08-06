// modules/analytics.js
// Mesure d'audience PostHog - module PARTAGÉ par tous les espaces Open Projets
// (carte, admin, fiche, ville, demo, carte postale, login, home).
//
// Chargement : une seule balise dans le <head> de chaque espace, AVANT tout
// script applicatif qui appelle window.OPAnalytics.
//   <script defer src="/modules/analytics.js" data-op-space="carte"></script>
//
// Attributs reconnus sur la balise :
//   data-op-space    obligatoire - identifiant de l'espace (super-propriété `space`)
//   data-op-pageview "manual" pour les SPA qui envoient elles-mêmes leurs pages
//   data-op-replay   "off" pour désactiver l'enregistrement de session sur cet espace
//
// Aucun bandeau de consentement : la configuration reste en mesure d'audience
// première-partie (pas de suivi inter-sites, pas de partage publicitaire), le
// Do Not Track et le Global Privacy Control du navigateur sont respectés, et le
// refus est accessible en un clic depuis /home/confidentialite (ou en ajoutant
// ?tracking=off à n'importe quelle URL du site).

;(function (win, doc) {
  'use strict';

  // ── Configuration projet ───────────────────────────────────────────────────
  // SEUL endroit à modifier pour changer de projet PostHog.
  // La clé de projet est publique par nature (elle transite dans le navigateur),
  // au même titre que la clé anon Supabase.
  const POSTHOG_KEY = 'phc_mXx7nJL33iCDhNGLrRJhnRLJ2aRLY9Vpr6dVuEip9jep';

  // Les requêtes passent par un proxy inverse Netlify (`/ph/*` → PostHog, voir
  // le fichier `_redirects`). Première partie : les bloqueurs de traceurs ne
  // coupent pas la mesure, et aucun domaine tiers n'apparaît dans les requêtes.
  const API_HOST = '/ph';
  const UI_HOST = 'https://eu.posthog.com'; // région du projet - us.posthog.com si projet US

  // Google Analytics 4 tourne en parallèle sur une partie des espaces. Le refus
  // du visiteur doit couper les DEUX outils, sinon la page de confidentialité
  // promet un arrêt qui n'a pas lieu.
  const GA_MEASUREMENT_ID = 'G-8LGDVJXTPK';

  const OPTOUT_KEY = 'op_analytics_optout';

  // ── État interne ───────────────────────────────────────────────────────────
  let enabled = false;
  let loading = false;
  let ph = null;                 // window.posthog une fois la librairie chargée
  const queue = [];              // appels émis avant la fin du chargement
  let space = 'inconnu';
  let disabledReason = '';
  let initConfig = null;         // config passée à posthog.init, rejouable

  // ── Refus de la mesure ─────────────────────────────────────────────────────
  function readStoredOptOut() {
    try { return win.localStorage.getItem(OPTOUT_KEY) === '1'; } catch { return false; }
  }

  function writeStoredOptOut(value) {
    try {
      if (value) win.localStorage.setItem(OPTOUT_KEY, '1');
      else win.localStorage.removeItem(OPTOUT_KEY);
    } catch { /* stockage indisponible : le refus ne survivra pas à la session */ }
  }

  // Google Analytics lit ce drapeau à chaque envoi : le poser suffit à le taire,
  // que gtag.js soit déjà chargé ou non.
  function setGoogleAnalyticsOptOut(value) {
    try { win['ga-disable-' + GA_MEASUREMENT_ID] = !!value; } catch { /* no-op */ }
  }

  // ?tracking=off / ?tracking=on : permet de refuser (ou de revenir en arrière)
  // depuis n'importe quelle page, y compris par un lien envoyé par courriel.
  function applyUrlPreference() {
    let value = null;
    try { value = new URLSearchParams(win.location.search).get('tracking'); } catch { return; }
    if (value === 'off') writeStoredOptOut(true);
    else if (value === 'on') writeStoredOptOut(false);
  }

  function browserRefusesTracking() {
    if (win.navigator && win.navigator.globalPrivacyControl === true) return true;
    const dnt = win.navigator?.doNotTrack || win.doNotTrack || win.navigator?.msDoNotTrack;
    return dnt === '1' || dnt === 'yes';
  }

  /**
   * Dans quelle situation d'iframe sommes-nous ?
   * - 'aucune'  : page de premier niveau
   * - 'interne' : iframe d'une page du site (vitrines du home) - décorative,
   *               la compter reviendrait à inventer des visites de la carte
   * - 'externe' : intégration chez un client (portail Phaos) - à mesurer, mais
   *               sans enregistrement de session : le stockage y est cloisonné,
   *               le visiteur ne peut ni consulter ni exprimer son refus
   */
  function frameContext() {
    if (win.self === win.top) return 'aucune';
    try {
      return win.top.location.origin === win.location.origin ? 'interne' : 'externe';
    } catch {
      return 'externe'; // accès refusé = origine différente
    }
  }

  // ── Garde-fous : ce qui ne doit jamais produire d'événement ─────────────────
  function resolveDisabledReason() {
    // Playwright (tests E2E) et le prérendu du home pilotent un navigateur :
    // leurs visites ne doivent jamais polluer les statistiques. Ce test passe
    // EN PREMIER pour rester le motif observable par la suite E2E, quelle que
    // soit la configuration du reste.
    if (win.navigator?.webdriver) return 'navigateur piloté (tests ou prérendu)';
    if (/Chrome-Lighthouse|HeadlessChrome/i.test(win.navigator?.userAgent || '')) return 'audit Lighthouse';

    if (!POSTHOG_KEY || POSTHOG_KEY.indexOf('phc_') !== 0 || POSTHOG_KEY.indexOf('REMPLACER') !== -1) {
      return 'clé de projet PostHog non renseignée';
    }
    if (readStoredOptOut()) return 'refus enregistré par le visiteur';
    if (browserRefusesTracking()) return 'Do Not Track / Global Privacy Control actif';
    if (frameContext() === 'interne') return 'aperçu intégré dans une page du site';

    const host = win.location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
    // Les aperçus de déploiement Netlify ne doivent pas se mélanger à la production.
    const preview = host.endsWith('.netlify.app');
    let debug = false;
    try { debug = new URLSearchParams(win.location.search).get('ph_debug') === '1'; } catch { /* URL exotique */ }
    if ((local || preview) && !debug) return 'environnement hors production (forcer avec ?ph_debug=1)';

    return '';
  }

  // ── Nettoyage des propriétés ───────────────────────────────────────────────
  // Un lien de connexion Supabase revient avec le jeton d'accès dans le
  // fragment (#access_token=...). PostHog enregistrerait l'URL complète : ce
  // jeton ne doit jamais sortir du navigateur. Même règle pour le jeton de
  // suivi personnel d'un signalement (?participer_suivi=) : le paramètre est
  // conservé (utile aux analyses) mais sa valeur est masquée.
  const URL_PROPS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'];
  const MASKED_PARAMS = ['participer_suivi'];

  function sanitizeProperties(properties) {
    for (const key of URL_PROPS) {
      let value = properties[key];
      if (typeof value !== 'string' || !value) continue;
      value = value.split('#')[0];
      for (const param of MASKED_PARAMS) {
        value = value.replace(new RegExp('([?&]' + param + '=)[^&]*'), '$1masque');
      }
      properties[key] = value;
    }
    return properties;
  }

  /**
   * Ville lue au plus tôt, sans attendre la résolution complète de
   * l'application. La première page vue part quelques millisecondes après
   * l'init : sans cette lecture, elle ne porterait jamais la ville. La valeur
   * fait autorité jusqu'à ce que l'application appelle setCity().
   */
  function earlyCity() {
    try {
      const fromUrl = new URLSearchParams(win.location.search).get('city');
      const value = fromUrl || win.localStorage.getItem('activeCity');
      return value && /^[a-z0-9-]+$/i.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  // ── Chargement de la librairie ─────────────────────────────────────────────
  function flushQueue() {
    while (queue.length) {
      const [method, args] = queue.shift();
      try { ph[method].apply(ph, args); } catch (e) { console.debug('[Analytics]', method, e); }
    }
  }

  function loadLibrary(config) {
    if (loading) return;
    loading = true;
    const script = doc.createElement('script');
    script.src = API_HOST + '/static/array.js';
    script.async = true;
    script.onload = () => {
      // Le visiteur a pu refuser pendant le chargement : sans ce garde-fou,
      // `init` enverrait quand même une page vue juste après son refus.
      if (!enabled) return;
      try {
        ph = win.posthog;
        ph.init(POSTHOG_KEY, config);
        flushQueue();
      } catch (e) {
        enabled = false;
        console.debug('[Analytics] initialisation PostHog impossible', e);
      }
    };
    // Bloqueur de contenu, coupure réseau : la page continue, la file est vidée.
    script.onerror = () => { enabled = false; loading = false; queue.length = 0; };
    doc.head.appendChild(script);
  }

  function call(method) {
    if (!enabled) return;
    const args = Array.prototype.slice.call(arguments, 1);
    if (ph) {
      try { ph[method].apply(ph, args); } catch (e) { console.debug('[Analytics]', method, e); }
    } else {
      queue.push([method, args]);
    }
  }

  // ── API publique ───────────────────────────────────────────────────────────
  const OPAnalytics = {
    /** La mesure tourne-t-elle réellement ? */
    isEnabled() { return enabled; },

    /** Raison de la désactivation (chaîne vide si active). */
    disabledReason() { return disabledReason; },

    /** Espace courant (carte, admin, home...). */
    space() { return space; },

    /**
     * Enregistre un événement.
     * @param {string} event nom en anglais, snake_case (ex. `demo_generation_completed`)
     * @param {object} [props] propriétés, sans donnée personnelle non nécessaire
     */
    capture(event, props) {
      if (!event) return;
      call('capture', event, props || {});
    },

    /** Page vue - à appeler manuellement dans les SPA, à chaque navigation. */
    pageview(props) {
      call('capture', '$pageview', props || {});
    },

    /** Associe les événements suivants à un utilisateur connu (admin, contributeur). */
    identify(userId, props) {
      if (!userId) return;
      call('identify', String(userId), props || {});
    },

    /** Fin de session utilisateur : repart d'un visiteur anonyme. */
    reset() { call('reset'); },

    /** Ville active : rattachée à tous les événements suivants. */
    setCity(city) {
      if (!city) return;
      call('register', { city: String(city) });
    },

    /** Super-propriétés arbitraires, rattachées à tous les événements suivants. */
    register(props) {
      if (props) call('register', props);
    },

    /** Le visiteur refuse la mesure - effet immédiat, persistant, tous outils. */
    optOut() {
      writeStoredOptOut(true);
      setGoogleAnalyticsOptOut(true);
      enabled = false;
      disabledReason = 'refus enregistré par le visiteur';
      queue.length = 0;
      if (ph) { try { ph.opt_out_capturing(); } catch { /* déjà arrêté */ } }
    },

    /** Le visiteur revient sur son refus - effet immédiat lui aussi. */
    optIn() {
      writeStoredOptOut(false);
      setGoogleAnalyticsOptOut(false);
      disabledReason = resolveDisabledReason();
      enabled = !disabledReason;
      if (!enabled) return;
      if (ph) { try { ph.opt_in_capturing(); } catch { /* pas encore chargé */ } }
      else if (initConfig) loadLibrary(initConfig);
    },

    /** Le refus est-il enregistré sur ce navigateur ? */
    isOptedOut() { return readStoredOptOut(); },
  };

  // ── Démarrage ──────────────────────────────────────────────────────────────
  function boot() {
    applyUrlPreference();

    const tag = doc.currentScript || doc.querySelector('script[data-op-space]');
    space = tag?.dataset?.opSpace || 'inconnu';
    const manualPageview = tag?.dataset?.opPageview === 'manual';
    const replayOff = tag?.dataset?.opReplay === 'off';
    const embedded = frameContext() === 'externe';

    // Un refus exprimé dans un autre onglet doit couper celui-ci sans attendre
    // un rechargement.
    win.addEventListener('storage', (e) => {
      if (e.key === OPTOUT_KEY && e.newValue === '1' && enabled) OPAnalytics.optOut();
    });

    disabledReason = resolveDisabledReason();
    if (disabledReason) {
      // Même désactivé, le refus doit être propagé à Google Analytics.
      if (readStoredOptOut()) setGoogleAnalyticsOptOut(true);
      return;
    }
    enabled = true;

    initConfig = {
      api_host: API_HOST,
      ui_host: UI_HOST,
      // Pas de profil pour les visiteurs anonymes : les pages vues restent
      // comptées, mais aucune fiche personne n'est créée sans identification.
      person_profiles: 'identified_only',
      // Un cookie première partie sur ce domaine uniquement, jamais partagé
      // avec un sous-domaine ou un tiers.
      persistence: 'localStorage+cookie',
      cross_subdomain_cookie: false,
      capture_pageview: !manualPageview,
      capture_pageleave: true,
      autocapture: true,
      // Remplace les cartes de chaleur de Hotjar, retiré au profit de PostHog.
      capture_heatmaps: true,
      // Identifiants publicitaires (gclid, fbclid...) retirés des URL captées.
      mask_personal_data_properties: true,
      // La console n'est jamais enregistrée. Le réglage du projet PostHog
      // l'autorise, mais nos `console.error` transportent des objets d'erreur
      // Supabase qui contiennent parfois l'adresse saisie : ils atterriraient
      // dans les enregistrements de session, en contradiction directe avec ce
      // que promet /home/confidentialite. Ce choix est fixé ici pour ne pas
      // dépendre d'un interrupteur d'interface.
      enable_recording_console_log: false,
      sanitize_properties: sanitizeProperties,
      // Pas d'enregistrement dans une iframe cliente : le stockage y est
      // cloisonné, le visiteur ne peut pas y exprimer son refus.
      disable_session_recording: replayOff || embedded,
      session_recording: {
        // Aucune saisie n'est enregistrée telle quelle : ni les champs de
        // formulaire, ni le presse-papiers. `data-op-mask` masque en plus le
        // texte d'un bloc, `data-op-noreplay` l'exclut complètement.
        maskAllInputs: true,
        maskTextSelector: '[data-op-mask]',
        blockSelector: '[data-op-noreplay]',
      },
      loaded(instance) {
        // Ces super-propriétés sont PERSISTANTES côté PostHog : les réécrire à
        // chaque chargement empêche la ville d'un espace de contaminer le
        // suivant (carte d'une ville, puis site vitrine).
        instance.register({ space, city: earlyCity(), embedded });
      },
    };

    loadLibrary(initConfig);
  }

  win.OPAnalytics = OPAnalytics;

  try { boot(); } catch (e) {
    // Une panne de la mesure d'audience ne doit jamais casser une page.
    enabled = false;
    console.debug('[Analytics] démarrage impossible', e);
  }

})(window, document);
