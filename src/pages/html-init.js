import '/src/styles/style.css';

(function() {
  try {
    var theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();

try{
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);} 
    gtag('js', new Date());
    gtag('config', 'G-8LGDVJXTPK');
} catch(e) {
    console.error('Google Analytics initialization failed:', e);
}
