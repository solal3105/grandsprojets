/* ============================================================================
   THÈME DU KIOSQUE /demo/ - clair par défaut, sombre en option (window.DemoTheme)

   Chargé en synchrone dans <head> : l'attribut data-theme est posé AVANT le
   premier rendu, aucun éclair de mauvais thème. Le clair est le défaut, le
   sombre s'obtient par l'interrupteur de la page. Le choix appartient à celui
   qui tient le stand : il est retenu par écran (localStorage), et la carte
   (MapFX) est prévenue pour changer de fond en direct.
   ============================================================================ */
(() => {
  'use strict';

  const KEY = 'demo-theme';
  const root = document.documentElement;

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* stockage indisponible : défaut */ }
  let theme = saved === 'dark' ? 'dark' : 'light';

  // Le libellé annonce la destination, pas l'état : c'est ce que fait le bouton
  function apply(next) {
    theme = next;
    if (next === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-label', next === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
  }

  apply(theme);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* stockage indisponible : non retenu */ }
    window.MapFX?.setTheme?.(next);
    window.OPAnalytics?.capture?.('demo_theme_toggled', { theme: next });
  }

  /* Écoute DÉLÉGUÉE, posée dès maintenant : DOMContentLoaded attend les
     scripts synchrones de fin de body, dont maplibre-gl.js depuis unpkg. Sur
     le réseau d'un salon, le bouton serait visible mais inerte plusieurs
     secondes. Ici, il répond dès qu'il est peint. */
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('#theme-toggle')) toggle();
  });

  // Le script vit dans <head> : le bouton n'existe pas encore, son libellé
  // est posé une fois le document construit.
  document.addEventListener('DOMContentLoaded', () => apply(theme));

  window.DemoTheme = { current: () => theme, toggle };
})();
