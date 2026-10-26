/**
 * Netlify Function: ai-assistant
 * Assistant « Demander » du diagnostic terrain (admin) : une question libre sur un
 * lieu du territoire. Le navigateur résout le lieu et calcule les chiffres sur les
 * couches de la structure ; ce relais ne fait que deux appels au modèle par question
 * (comprendre la demande, rédiger la réponse), réservés puis soldés dans le budget en
 * base. Le détail vit dans lib/diagnostic-assistant.mjs.
 *
 * Variables d'environnement requises :
 *   OPENAI_DIRECT_KEY, sinon OPENAI_API_KEY - clé du compte OpenAI
 *   SUPABASE_SERVICE_ROLE_KEY - suivi du budget
 */
import { OPENAI_KEY, getCorsHeaders, errResp, preflightResp, getAuthedUser, isAdminForVille } from './lib/ai-common.mjs';
import { answerAssistant } from './lib/diagnostic-assistant.mjs';

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
  if (!(await isAdminForVille(user, ville))) return errResp(403, 'Réservé aux administrateurs de cette structure', corsHeaders);
  if (!OPENAI_KEY) return errResp(500, 'OPENAI_API_KEY not configured', corsHeaders);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(req.url).hostname);
  return answerAssistant({ ...body, ville }, OPENAI_KEY, corsHeaders, { user, local });
}

export const config = {
  path: '/api/ai-assistant',
};
