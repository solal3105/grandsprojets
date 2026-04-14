/**
 * Google Analytics — chargé après requestIdleCallback pour ne pas impacter le LCP.
 * Le dataLayer est prêt immédiatement (les events sont mis en file).
 */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-8LGDVJXTPK');

(function() {
  function loadGtm() {
    var s = document.createElement('script');
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-8LGDVJXTPK';
    s.async = true;
    document.head.appendChild(s);
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadGtm, { timeout: 3000 });
  } else {
    setTimeout(loadGtm, 2000);
  }
})();
