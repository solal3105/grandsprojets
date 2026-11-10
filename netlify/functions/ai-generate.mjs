/**
 * Netlify Function: ai-generate
 * Proxy vers OpenAI - utilise l'API Responses avec le tool web_search_preview
 * pour chercher des informations réelles sur le projet avant de rédiger.
 * Supporte le streaming SSE.
 *
 * Qui l'appelle : l'équipe de la ville du projet, administrateurs et
 * contributeurs invités (isMemberOfVille). Un compte sans ville n'y a pas accès.
 * Ce qu'elle dépense : chaque appel est réservé puis réglé en base, dans
 * l'enveloppe du jour de ce compte pour cette ville (lib/redaction-budget.mjs).
 *
 * Variables d'environnement requises :
 *   OPENAI_DIRECT_KEY, sinon OPENAI_API_KEY - clé du compte OpenAI
 *   SUPABASE_SERVICE_ROLE_KEY - suivi du budget, comme ai-diagnostic
 *
 * Événements SSE émis vers le client :
 *   { status: 'searching' }         - recherche web en cours
 *   { content: '...' }              - chunk de texte
 *   { sources: [{url, title}] }     - sources consultées (fin de génération)
 *   [DONE]                          - fin du stream
 */

// Nombre de sources affichées sous un texte généré : au-delà, la liste cesse
// d'être une preuve et devient un pavé de liens.
const MAX_SOURCES_CITEES = 5;

const SYSTEM_PROMPT_DESC = `Tu es un rédacteur expert en urbanisme et projets de territoire.
Tu rédiges des descriptions courtes (2-3 phrases, max 450 caractères) pour des fiches de projets urbains.
Style : factuel, concis, institutionnel mais accessible. Pas de superlatifs. Pas de bullet points.
Tu dois écrire en français.
IMPORTANT : Utilise impérativement la recherche web pour trouver des informations récentes et précises sur ce projet avant de rédiger. Cite des faits vérifiables.
IMPORTANT : N'inclus AUCUN lien hypertexte, AUCUNE URL et AUCUNE citation Markdown [texte](url) dans ta réponse. Texte brut uniquement.`;

const SYSTEM_PROMPT_ARTICLE = `Tu es un rédacteur expert en urbanisme et projets de territoire.
Tu rédiges des articles de présentation en Markdown pour des fiches de projets urbains.
Structure attendue :
- Un titre H2 avec le nom du projet
- Un paragraphe d'introduction (contexte, porteur du projet, état d'avancement)
- 2-3 sections H3 (ex : Contexte, Objectifs, Calendrier & Budget, Impacts attendus)
- Style factuel, institutionnel, accessible au grand public
- Longueur : 300-500 mots
Tu dois écrire en français. Ne mets pas de titre H1.
IMPORTANT : Utilise impérativement la recherche web pour trouver des informations récentes et précises sur ce projet. Intègre des données chiffrées, des dates, des acteurs impliqués si disponibles.
IMPORTANT : Ne commence JAMAIS l'article par un lien seul ou une citation - commence directement par le contenu structuré (titre H2 puis introduction).
IMPORTANT : N'inclus AUCUN lien hypertexte inline [texte](url) dans le corps du texte. Texte Markdown pur, sans liens.`;

// Socle partagé avec ai-diagnostic.mjs : CORS, auth JWT, messages d'erreur IA,
// et le relais SSE. Voir netlify/functions/lib/ai-common.mjs.
import {
  OPENAI_RESPONSES_URL,
  OPENAI_KEY,
  getCorsHeaders,
  errResp,
  preflightResp,
  friendlyAIError,
  getAuthedUser,
  isMemberOfVille,
  relayOpenAIStream,
} from './lib/ai-common.mjs';
import { isValidCityCode } from './lib/http.mjs';
import { createBudgetStore } from './lib/diagnostic-budget.mjs';
import { MODEL, MAX_OUTPUT_TOKENS, dailyEnvelope, reserveFor, costOf } from './lib/redaction-budget.mjs';
import { randomUUID } from 'node:crypto';

// Longueur maximale de chaque champ reçu, en caractères : au-dessus de ce que
// le formulaire laisse saisir (120 pour le nom, 500 pour la description), et
// assez bas pour qu'une demande ne coûte jamais plus que sa réserve.
const MAX_CHARS = { project_name: 200, category: 120, description: 1000, official_url: 500 };

/**
 * Lit et borne la demande du formulaire.
 * @returns {{project_name, category, description, official_url, city, target, useWebSearch}}
 * @throws {Error} dont le message dit ce qui manque
 */
export function readRequest(body) {
  const text = (key) => (typeof body?.[key] === 'string' ? body[key].trim() : '');
  const request = {
    project_name: text('project_name'), category: text('category'), description: text('description'),
    official_url: text('official_url'), city: text('city'), target: text('target'),
    useWebSearch: body?.web_search !== false,
  };
  if (!request.project_name || !request.target) throw new Error('project_name and target are required');
  if (!(request.target in MAX_OUTPUT_TOKENS)) throw new Error('Paramètre target invalide');
  // Le compte sans ville voit cette phrase dans le panneau : celle de la console.
  if (!request.city) throw new Error('Aucune structure sélectionnée');
  if (!isValidCityCode(request.city)) throw new Error('Paramètre city invalide');
  for (const [key, max] of Object.entries(MAX_CHARS)) {
    if (request[key].length > max) throw new Error(`Le champ ${key} dépasse ${max} caractères`);
  }
  if (request.official_url && !/^https?:\/\//i.test(request.official_url)) throw new Error('Paramètre official_url invalide');
  return request;
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') return preflightResp(corsHeaders);
  if (req.method !== 'POST') return errResp(405, 'Method not allowed', corsHeaders);

  const user = await getAuthedUser(req);
  if (!user) return errResp(401, 'Unauthorized', corsHeaders);

  let body;
  try { body = await req.json(); }
  catch { return errResp(400, 'Invalid JSON', corsHeaders); }

  let request;
  try { request = readRequest(body); }
  catch (error) { return errResp(400, error.message, corsHeaders); }

  if (!(await isMemberOfVille(user, request.city))) return errResp(403, 'Réservé à l’équipe de cette structure', corsHeaders);

  const apiKey = OPENAI_KEY;
  if (!apiKey) return errResp(500, 'OPENAI_API_KEY not configured', corsHeaders);

  return generate(request, { apiKey, corsHeaders, user });
}

/**
 * Réserve, appelle le service, relaie le texte, puis règle.
 * @param {ReturnType<typeof readRequest>} request
 * @param {Object} options
 * @param {{id: string}} options.user
 * @param {Object} [options.budget] - { reserve, settle } ; la base par défaut
 * @param {Function} [options.fetch] - appel du service ; fetch par défaut
 * @param {Date} [options.now]
 */
export async function generate(request, { apiKey, corsHeaders, user, budget, fetch: fetchAI = globalThis.fetch, now = new Date() }) {
  const { project_name, category, description, official_url, city, target, useWebSearch } = request;

  // ── Prompt construction ──────────────────────────────────────────
  let userPrompt = `Projet : "${project_name}"`;
  if (category)    userPrompt += `\nCatégorie : ${category}`;
  if (city)        userPrompt += `\nVille/Structure : ${city}`;
  if (description && target === 'article') userPrompt += `\nDescription existante : ${description}`;
  if (official_url) userPrompt += `\nURL officielle : ${official_url}`;

  userPrompt += target === 'description'
    ? (useWebSearch
        ? '\n\nEffectue une recherche web sur ce projet et rédige une description courte (2-3 phrases, max 450 caractères).'
        : '\n\nRédige une description courte (2-3 phrases, max 450 caractères) à partir des informations fournies.')
    : (useWebSearch
        ? '\n\nEffectue une recherche web approfondie sur ce projet et rédige un article de présentation complet en Markdown.'
        : '\n\nRédige un article de présentation complet en Markdown à partir des informations fournies.');

  const systemPrompt = target === 'description' ? SYSTEM_PROMPT_DESC : SYSTEM_PROMPT_ARTICLE;

  // ── Budget : réserver avant d'appeler ────────────────────────────
  // Une demande n'est jamais servie de mémoire : son empreinte est unique.
  let reservation;
  try {
    budget = budget || createBudgetStore();
    const envelope = dailyEnvelope(user.id, city, now);
    reservation = await budget.reserve({
      p_run: envelope, p_family: envelope, p_user: user.id, p_ville: city, p_hash: randomUUID(),
      p_phase: `redaction-${target}`, p_model: MODEL,
      p_reserve: reserveFor(target, [systemPrompt, userPrompt], useWebSearch), p_floor: 0,
    });
  } catch (error) {
    console.error('[ai-generate] Budget:', error.name, error.message);
    return errResp(503, 'Le suivi du budget de la rédaction assistée est indisponible. Réessayez plus tard.', corsHeaders);
  }
  if (reservation.status === 'budget') {
    return errResp(429, 'Vous avez atteint la limite du jour de la rédaction assistée pour cette structure. Elle se renouvelle demain.', corsHeaders);
  }
  if (reservation.status !== 'reserved' || !reservation.call_id) {
    console.error('[ai-generate] Budget: réservation refusée', reservation.status);
    return errResp(503, 'Le suivi du budget de la rédaction assistée est indisponible. Réessayez plus tard.', corsHeaders);
  }
  /* Réglé UNE seule fois, quelle que soit l'issue. `uncertain` débite toute la
     réserve : c'est le sort d'un appel dont on ne sait pas ce qu'il a coûté. */
  let settled = false;
  const settle = async (status, charge = 0, usage = null, requestId = '') => {
    if (settled) return;
    settled = true;
    try {
      await budget.settle({ p_call: reservation.call_id, p_status: status, p_charge: charge, p_usage: usage, p_result: null, p_request_id: requestId });
    } catch (error) {
      // La réserve reste comptée dans l'enveloppe du jour : le plafond tient.
      console.error('[ai-generate] Règlement:', error.name, error.message);
    }
  };

  // ── OpenAI Responses API avec web_search_preview ─────────────────
  const TIMEOUT_MS = 25_000;
  let _streamReader = null; // référence pour annulation depuis le timeout
  let _timedOut = false; // signalé au client s'il n'a encore rien reçu
  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn('[ai-generate] Timeout 25s - annulation stream');
    _timedOut = true;
    _streamReader?.cancel().catch(() => {});
    timeoutCtrl.abort();
  }, TIMEOUT_MS);

  try {
    console.log(`[ai-generate] Début génération target=${target} webSearch=${useWebSearch}`);
    const t0 = Date.now();

    const openaiRes = await fetchAI(OPENAI_RESPONSES_URL, {
      method: 'POST',
      signal: timeoutCtrl.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        ...(useWebSearch ? { tools: [{ type: 'web_search_preview' }] } : {}),
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_output_tokens: MAX_OUTPUT_TOKENS[target],
      }),
    });
    console.log(`[ai-generate] Réponse OpenAI reçue en ${Date.now() - t0}ms status=${openaiRes.status}`);

    const requestId = openaiRes.headers.get('x-request-id') || '';
    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[ai-generate] OpenAI error:', openaiRes.status, errText);
      clearTimeout(timeoutId);
      // Une erreur serveur peut arriver après une génération facturable.
      await settle(openaiRes.status >= 500 || openaiRes.status === 408 ? 'uncertain' : 'failed', 0, null, requestId);
      return errResp(502, friendlyAIError(openaiRes.status, errText), corsHeaders);
    }

    // Relais SSE : le squelette est partagé, seuls les événements propres à
    // la génération (recherche web, sources citées) sont traités ici.
    let chunkCount = 0;
    // Ce que le règlement lira : les recherches lancées, et le décompte de
    // jetons que le service joint à son dernier événement.
    let searches = 0;
    let finalUsage = null;
    let finalStatus = '';
    /* Citations relevées au fil du flux.
       Elles étaient lues sur `response.output_text.done`, qui ne les porte pas :
       mesuré sur la requête exacte de cet outil, cet événement rend zéro
       annotation quand `response.output_text.annotation.added` en rend huit. Le
       bloc « Sources » du copilote ne s'est donc jamais affiché, alors que le
       modèle citait bel et bien ses sources. On accumule ici, et on émet à la
       fin ; l'ancienne lecture est conservée en second filet, elle ne coûte rien
       et couvrira le jour où l'API remettra les annotations à cet endroit. */
    const citations = [];
    const ajouterCitations = (annotations) => {
      for (const a of annotations || []) {
        if (a?.type === 'url_citation' && typeof a.url === 'string' && a.url.startsWith('http')) {
          citations.push({ url: a.url, title: a.title || null });
        }
      }
    };
    /* Émises UNE seule fois, quel que soit le chemin de sortie : plusieurs
       événements terminaux peuvent se succéder, et le relais appelle aussi ce
       point d'accroche à la fermeture du flux. */
    let sourcesEmises = false;
    const emettreSources = async (emit) => {
      if (sourcesEmises) return;
      sourcesEmises = true;
      const vues = new Set();
      const sources = citations
        .filter((x) => { if (vues.has(x.url)) return false; vues.add(x.url); return true; })
        .slice(0, MAX_SOURCES_CITEES);
      if (sources.length) await emit({ sources });
    };

    return relayOpenAIStream(openaiRes, {
      tag: 'ai-generate',
      corsHeaders,
      setReader: (r) => { _streamReader = r; },
      clearTimeoutFn: () => clearTimeout(timeoutId),
      onEvent: async (ev, emit) => {
        // Recherche web en cours
        if (ev.type === 'response.output_item.added' && ev.item?.type === 'web_search_call') {
          searches++;
          await emit({ status: 'searching' });
        }
        // Chunk de texte
        if (ev.type === 'response.output_text.delta' && ev.delta) {
          chunkCount++;
          await emit({ content: ev.delta });
        }
        // Sources consultées : l'événement qui les porte réellement
        if (ev.type === 'response.output_text.annotation.added' && ev.annotation) {
          ajouterCitations([ev.annotation]);
        }
        if (ev.type === 'response.output_text.done' && ev.annotations?.length) {
          ajouterCitations(ev.annotations);
        }
        if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
          finalUsage = ev.response?.usage || null;
          finalStatus = ev.type === 'response.completed' ? 'complete' : 'failed';
          await emettreSources(emit);
        }
      },
      /* Le règlement : le coût réel quand le service a rendu son décompte, la
         réserve entière sinon (flux coupé, délai dépassé). */
      onClose: async () => {
        const cost = costOf(finalUsage, searches);
        if (cost === null) await settle('uncertain', 0, null, requestId);
        else await settle(finalStatus, cost, finalUsage, requestId);
        console.info('[ai-generate] Usage', { target, costMicro: cost, searches, requestId });
      },
      /* Filet : une génération arrêtée à son plafond de sortie, ou un flux
         coupé, n'émet aucun événement terminal. Les citations déjà relevées
         partaient alors à la poubelle. */
      onFin: emettreSources,
      // Timeout sans aucun contenu généré : signaler plutôt qu'un silence
      // (avec du contenu partiel, le texte déjà reçu reste utilisable).
      onTimeoutMessage: () => (_timedOut && chunkCount === 0)
        ? 'Génération interrompue (délai dépassé) - réessayez.'
        : null,
    });

  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[ai-generate] Fatal:', err.name, err.message);
    // L'appel est peut-être parti : sa réserve reste due.
    await settle('uncertain');
    const msg = err.name === 'AbortError'
      ? 'Génération interrompue (délai dépassé) - réessayez.'
      : 'Service IA injoignable - vérifiez la connexion puis réessayez.';
    return errResp(500, msg, corsHeaders);
  }
}

export const config = {
  path: '/api/ai-generate',
};
