import { createHash } from 'node:crypto';
import { SUPABASE_URL } from './http.mjs';

// Tarifs standards OpenAI du 18/09/2026, en millionièmes de dollar par token.
// Le budget prévu (0,24 $, annoncé à la sélection de la zone) et le plafond
// d'arrêt (1 $, valeur par défaut de `diagnostic_ai_runs.limit_micro`) sont
// définis dans le contrat partagé `dossier/contract.mjs`.
export const PRICES = { 'gpt-5.4-mini': { input: .75, cached: .075, output: 4.5 }, 'gpt-5.4': { input: 2.5, cached: .25, output: 15 } };
// Part du plafond gardée pour la synthèse finale (gpt-5.4, 6 000 jetons de
// sortie) : une lecture ne doit jamais consommer ce qui permet de conclure.
export const FINAL_RESERVE_MICRO = 120000;
export const requestHash = (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
export function usageCost(model, usage) {
  const price = PRICES[model];
  if (!usage || !Number.isInteger(usage.input_tokens) || !Number.isInteger(usage.output_tokens) || usage.input_tokens < 0 || usage.output_tokens < 0) return null;
  const cached = Math.max(0, Math.min(usage.input_tokens, usage.input_tokens_details?.cached_tokens || 0));
  return Math.ceil((usage.input_tokens - cached) * price.input + cached * price.cached + usage.output_tokens * price.output);
}
export function reservedCost(model, tokens, maximum) {
  // Petite marge sur le comptage exact ; aucune remise de cache n'est présumée.
  return Math.ceil((tokens + 64) * PRICES[model].input + maximum * PRICES[model].output);
}
export function createBudgetStore() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Object.assign(new Error('Le suivi du budget IA doit être configuré avant de lancer l’analyse. Contactez l’administrateur.'), { code: 'configuration', retryable: false });
  const rpc = async (name, body) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw Object.assign(new Error('Le suivi du budget IA est indisponible. Les étapes terminées sont conservées. Réessayez plus tard.'), { code: 'accounting', retryable: false });
    return response.json();
  };
  return { reserve: (body) => rpc('reserve_diagnostic_ai', body), settle: (body) => rpc('settle_diagnostic_ai', body) };
}
