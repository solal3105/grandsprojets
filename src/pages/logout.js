import { AuthModule } from '/src/modules/auth.js';

(async function(){
    const statusEl = document.getElementById('status');
    const fallback = document.getElementById('fallback-link');
    try {
      if (!AuthModule) throw new Error('AuthModule indisponible');
      await AuthModule.signOut();
      statusEl.textContent = 'Déconnecté. Redirection…';
      // Petite pause pour l’UX puis redirection
      setTimeout(() => { window.location.replace('/'); }, 300);
    } catch (e) {
      console.warn('Erreur de déconnexion:', e);
      statusEl.textContent = "Impossible de vous déconnecter automatiquement. Utilisez le bouton ci-dessous.";
      fallback.style.display = 'inline-flex';
    }
})();