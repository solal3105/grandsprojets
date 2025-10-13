/**
 * Helpers d'authentification pour les tests Playwright
 */

import { request } from '@playwright/test';

// URL de votre projet Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Se connecter via l'API REST Supabase (méthode recommandée pour les tests)
 * Bypass le magic link en utilisant email/password
 * @param {import('@playwright/test').Page} page
 * @param {Object} credentials - { email, password }
 */
export async function loginViaAPI(page, credentials) {
  const { email, password } = credentials;
  
  // 1. S'authentifier via l'API Supabase
  const requestContext = await request.newContext();
  
  const response = await requestContext.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    data: {
      email,
      password,
    },
  });

  if (!response.ok()) {
    const error = await response.text();
    throw new Error(`Échec de l'authentification via API: ${response.status()} - ${error}`);
  }

  const session = await response.json();
  
  // 2. Injecter la session dans le localStorage du navigateur
  // Note: On suppose que la page est déjà chargée (via beforeEach)
  await page.evaluate((data) => {
    // Supabase stocke la session dans localStorage avec cette clé
    const key = `sb-${data.projectId}-auth-token`;
    localStorage.setItem(key, JSON.stringify(data.session));
  }, {
    projectId: SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1],
    session: session,
  });
  
  // 3. Recharger la page pour que Supabase détecte la session
  await page.reload({ waitUntil: 'domcontentloaded' });
  
  // 4. Attendre que la carte soit de nouveau visible
  await page.waitForSelector('#map', { state: 'visible', timeout: 15000 });
  
  // 5. Vérifier que l'utilisateur est bien connecté
  await page.waitForSelector('#nav-contribute', { state: 'visible', timeout: 10000 });
}

/**
 * Se connecter avec un utilisateur de test (méthode UI - si vous avez email/password)
 * @param {import('@playwright/test').Page} page
 * @param {Object} credentials - { email, password }
 */
export async function login(page, credentials) {
  // Utiliser la méthode API par défaut (plus rapide et fiable)
  return loginViaAPI(page, credentials);
}

/**
 * Se connecter avec un magic link
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 */
export async function loginWithMagicLink(page, email) {
  await page.goto('/login/');
  
  // Remplir l'email
  await page.fill('input[type="email"]', email);
  
  // Cliquer sur le bouton magic link
  await page.click('button:has-text("Envoyer un lien")');
  
  // Attendre le message de confirmation
  await page.waitForSelector('text=Email envoyé', { timeout: 10000 });
}

/**
 * Se déconnecter
 * @param {import('@playwright/test').Page} page
 */
export async function logout(page) {
  // Aller sur la page de logout
  await page.goto('/logout/');
  
  // Attendre la redirection
  await page.waitForURL('/', { timeout: 10000 });
  
  // Vérifier que le bouton contribuer n'est plus visible
  await page.waitForSelector('#nav-contribute', { state: 'hidden', timeout: 5000 });
}

/**
 * Vérifier si l'utilisateur est connecté
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn(page) {
  try {
    await page.waitForSelector('#nav-contribute', { state: 'visible', timeout: 2000 });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Configuration des utilisateurs de test
 */
export const TEST_USERS = {
  // Admin global (accès complet à toutes les villes)
  admin: {
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
    role: 'admin',
    cities: ['global']
  },
  
  // Alias pour admin global
  adminGlobal: {
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
    role: 'admin',
    cities: ['global']
  },
  
  // Invited (accès limité à Lyon)
  invited: {
    email: process.env.TEST_INVITED_EMAIL,
    password: process.env.TEST_INVITED_PASSWORD,
    role: 'invited',
    cities: ['lyon']
  },
  
  // User standard (accès à Lyon)
  user: {
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
    role: 'invited',
    cities: ['lyon']
  }
};
