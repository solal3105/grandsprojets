// Use shared AuthModule
import { AuthModule } from '/src/modules/auth.js';

const statusEl = document.getElementById('status');
const githubBtn = document.getElementById('github-btn');
const emailInput = document.getElementById('email-input');
const magicBtn = document.getElementById('magic-btn');

function setStatus(msg) { statusEl.textContent = msg || ''; }

async function initAuthUI() {
  try {
    const { data: { session } } = await AuthModule.getSession();
    if (session?.user) {
      setStatus(`Connecté en tant que ${session.user.user_metadata?.user_name || session.user.email || 'utilisateur'}.`);
      githubBtn.style.display = 'none';
      if (magicBtn) magicBtn.style.display = 'none';
      if (emailInput) emailInput.style.display = 'none';
    } else {
      setStatus('');
      githubBtn.style.display = 'inline-flex';
      if (magicBtn) magicBtn.style.display = 'inline-flex';
      if (emailInput) emailInput.style.display = 'block';
      console.log('Not authenticated.', data);
    }
  } catch (e) {
    setStatus('');
  }
}

githubBtn.addEventListener('click', async () => {
  try {
    setStatus('Redirection vers GitHub…');
    const redirectUrl = window.location.origin + '/';
    const { error } = await AuthModule.signInWithGitHub(redirectUrl);
    if (error) {
      console.error('OAuth error:', error);
      setStatus("Impossible de démarrer l'authentification GitHub.");
    }
  } catch (e) {
    console.error(e);
    setStatus('Erreur inattendue.');
  }
});

function isValidEmail(v){
  return typeof v === 'string' && /.+@.+\..+/.test(v);
}

magicBtn.addEventListener('click', async () => {
  try {
    const email = (emailInput?.value || '').trim();
    if (!isValidEmail(email)) {
      setStatus('Veuillez saisir un email valide.');
      emailInput?.focus();
      return;
    }
    setStatus('Envoi du lien magique…');
    magicBtn.disabled = true;
    githubBtn.disabled = true;
    const redirectUrl = window.location.origin + '/login/';
    let error = null;
    if (typeof AuthModule.signInWithMagicLink === 'function') {
      ({ error } = await AuthModule.signInWithMagicLink(email, redirectUrl));
    } else {
      // Fallback si l'ancienne version de auth.js est en cache
      const client = AuthModule.getClient && AuthModule.getClient();
      if (client && client.auth && typeof client.auth.signInWithOtp === 'function') {
        ({ error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } }));
      } else {
        error = new Error('Méthode de magic link indisponible.');
      }
    }
    if (error) {
      console.error('Magic link error:', error);
      setStatus("Échec de l'envoi du lien magique. Réessayez plus tard.");
    } else {
      setStatus('Email envoyé. Vérifiez votre boîte de réception.');
    }
  } catch (e) {
    console.error(e);
    setStatus('Erreur inattendue.');
  } finally {
    setTimeout(() => {
      magicBtn.disabled = false;
      githubBtn.disabled = false;
    }, 2000);
  }
});

// Handle redirects back to /login with a hash (GitHub or Magic Link)
AuthModule.onAuthStateChange((_event, _session) => {
  // If a session appears, go home.
  if (_session?.user) {
    window.location.replace('/');
  }
});

// Display human-friendly error if Supabase returns an error hash
(function handleHashError(){
  try {
    const h = window.location.hash || '';
    if (!h) return;
    const params = new URLSearchParams(h.replace(/^#/, ''));
    const err = params.get('error');
    const code = params.get('error_code');
    if (err) {
      if (code === 'otp_expired') {
        setStatus("Le lien a expiré ou n'est plus valide. Veuillez redemander un nouveau lien magique.");
      } else {
        setStatus('Erreur de connexion: ' + (code || err));
      }
    }
  } catch(_) {}
})();

initAuthUI();