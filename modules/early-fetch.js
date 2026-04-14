/**
 * Prefetch critique Supabase — déclenché pendant le parsing HTML,
 * avant le chargement des modules JS, pour superposer les appels réseau
 * avec l'exécution JS (~2 s de gain potentiel sur le chemin critique LCP).
 */
;(function() {
  var SB  = 'https://wqqsuybmyqemhojsamgq.supabase.co/rest/v1';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
  var hdrs = { apikey: KEY, Authorization: 'Bearer ' + KEY };

  /* --- Détection ville (même logique simplifiée que main.js Phase 2) --- */
  var sp   = new URLSearchParams(location.search);
  var city = sp.get('city');
  if (!city || city === 'default') {
    try { city = localStorage.getItem('activeCity'); } catch { /* noop */ }
  }
  city = city || 'metropole-lyon';

  function get(url) {
    return fetch(url, { headers: hdrs }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
  }

  window.__earlyFetches = {
    basemaps:    get(SB + '/basemaps_v2?select=*&active=eq.true&order=sort_order.asc'),
    branding:    get(SB + '/city_branding?select=*&ville=eq.' + encodeURIComponent(city) + '&limit=1'),
    cityModules: get(SB + '/city_modules?select=*&ville=eq.' + encodeURIComponent(city) + '&order=sort_order.asc')
  };
  window.__earlyCity = city;
})();
