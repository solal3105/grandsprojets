/**
 * Budget de la rédaction assistée (ai-generate) : ce qu'un compte peut dépenser
 * par jour pour une ville.
 *
 * Le mécanisme est celui du diagnostic (reserve_diagnostic_ai puis
 * settle_diagnostic_ai, clé de service, lib/diagnostic-budget.mjs) : chaque
 * appel réserve son coût maximal avant de partir, puis règle son coût réel.
 * Seule l'enveloppe diffère. Une analyse de zone a la sienne ; ici, c'est une
 * enveloppe par compte, par ville et par jour, dont l'identifiant se déduit de
 * ces trois valeurs : le navigateur ne la choisit pas. Elle a le plafond par
 * défaut d'une enveloppe (un dollar, `diagnostic_ai_runs.limit_micro`).
 *
 * Ce module ne fait aucun appel réseau.
 */
import { createHash } from 'node:crypto';
import { reservedCost, usageCost } from './diagnostic-budget.mjs';

export const MODEL = 'gpt-4o';

// Tarifs standards d'OpenAI relevés le 10/11/2026, en millionièmes de dollar :
// par jeton pour le modèle, par appel pour la recherche web (outil
// `web_search_preview` d'un modèle sans raisonnement ; ce qu'il lit sur le web
// n'est pas facturé).
const PRICE = { input: 2.5, cached: 1.25, output: 10 };
export const SEARCH_MICRO = 25000;

// Le modèle décide du nombre de recherches. La réserve en couvre quatre ; le
// règlement compte celles qui ont eu lieu.
const SEARCHES_RESERVED = 4;

export const MAX_OUTPUT_TOKENS = { description: 300, article: 800 };

const parisDay = (date) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(date);

/**
 * L'enveloppe du jour d'un compte pour une ville. Le même trio rend toujours
 * le même identifiant, et il change à minuit, heure de Paris.
 * @returns {string} un identifiant au format uuid
 */
export function dailyEnvelope(userId, ville, date = new Date()) {
  const h = createHash('sha256').update(`redaction:${userId}:${ville}:${parisDay(date)}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Ce qu'un appel peut coûter au plus : ses consignes comptées en octets (un
 * jeton pèse au moins un octet), sa sortie au plafond, ses recherches.
 */
export function reserveFor(target, prompts, webSearch) {
  const bytes = new TextEncoder().encode(prompts.join('\n')).length;
  return reservedCost(MODEL, bytes, MAX_OUTPUT_TOKENS[target], PRICE) + (webSearch ? SEARCHES_RESERVED * SEARCH_MICRO : 0);
}

/**
 * Ce qu'un appel a coûté : les jetons que le service déclare, et ses recherches.
 * @returns {number|null} nul si le service n'a pas rendu son décompte
 */
export function costOf(usage, searches) {
  const tokens = usageCost(MODEL, usage, PRICE);
  return tokens === null ? null : tokens + searches * SEARCH_MICRO;
}
