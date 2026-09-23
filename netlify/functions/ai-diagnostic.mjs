/**
 * Netlify Function: ai-diagnostic
 * Analyse IA du dossier d'une zone (module « Diagnostic terrain », admin) :
 * lecture des textes par lots, relecture, rapprochement par couche, synthèse.
 * Chaque étape est un appel distinct, réservé puis soldé dans le budget en base
 * (plafond d'un dollar et de 160 appels par génération). Le détail des étapes,
 * des prompts et des contrôles vit dans lib/diagnostic-dossier.mjs.
 *
 * L'ancienne analyse de zone en un seul appel (flux SSE, points échantillonnés)
 * a été retirée le 23/09/2026 : plus aucun écran ne l'appelait et elle
 * échappait au plafond de dépense.
 *
 * Variables d'environnement requises :
 *   OPENAI_DIRECT_KEY, sinon OPENAI_API_KEY - clé du compte OpenAI
 */

// Socle partagé avec ai-generate.mjs : CORS, auth JWT et vérification du rôle admin.
import {
  OPENAI_KEY,
  getCorsHeaders,
  errResp,
  preflightResp,
  getAuthedUser,
  isAdminForVille,
} from './lib/ai-common.mjs';
import { analyzeDossier } from './lib/diagnostic-dossier.mjs';

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') return preflightResp(corsHeaders);
  if (req.method !== 'POST') return errResp(405, 'Method not allowed', corsHeaders);

  const user = await getAuthedUser(req);
  if (!user) return errResp(401, 'Unauthorized', corsHeaders);

  let body;
  try { body = await req.json(); }
  catch { return errResp(400, 'Invalid JSON', corsHeaders); }

  const ville = String(body.ville || '');
  if (!/^[a-z0-9-]+$/i.test(ville)) return errResp(400, 'Paramètre ville invalide', corsHeaders);

  const allowed = await isAdminForVille(user, ville);
  if (!allowed) return errResp(403, 'Réservé aux administrateurs de cette structure', corsHeaders);
  const apiKey = OPENAI_KEY;
  if (!apiKey) return errResp(500, 'OPENAI_API_KEY not configured', corsHeaders);
  // Le serveur local de Netlify coupe une fonction à 30 secondes, la production à 60 :
  // le relais règle son propre délai d'attente en conséquence.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(req.url).hostname);
  // Seul le dossier est proposé : une demande sans ce mode vient d'un ancien écran ou d'un script.
  if (body.mode !== 'dossier') return errResp(400, 'Seule l’analyse du dossier d’une zone est proposée', corsHeaders);
  return analyzeDossier(body, apiKey, corsHeaders, { user, local });
}

export const config = {
  path: '/api/ai-diagnostic',
};
