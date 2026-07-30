/**
 * Netlify Function: ai-generate
 * Proxy vers OpenAI - utilise l'API Responses avec le tool web_search_preview
 * pour chercher des informations réelles sur le projet avant de rédiger.
 * Supporte le streaming SSE.
 *
 * Variables d'environnement requises :
 *   OPENAI_API_KEY - clé API OpenAI
 *
 * Événements SSE émis vers le client :
 *   { status: 'searching' }         - recherche web en cours
 *   { content: '...' }              - chunk de texte
 *   { sources: [{url, title}] }     - sources consultées (fin de génération)
 *   [DONE]                          - fin du stream
 */

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
  getCorsHeaders,
  errResp,
  friendlyAIError,
  getAuthedUser,
  relayOpenAIStream,
} from './lib/ai-common.mjs';

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return errResp(405, 'Method not allowed', corsHeaders);

  const authed = await getAuthedUser(req);
  if (!authed) return errResp(401, 'Unauthorized', corsHeaders);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errResp(500, 'OPENAI_API_KEY not configured', corsHeaders);

  let body;
  try { body = await req.json(); }
  catch { return errResp(400, 'Invalid JSON', corsHeaders); }

  const { project_name, category, description, official_url, city, target, web_search } = body;
  const useWebSearch = web_search !== false;
  if (!project_name || !target) return errResp(400, 'project_name and target are required', corsHeaders);

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

    const openaiRes = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      signal: timeoutCtrl.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        ...(useWebSearch ? { tools: [{ type: 'web_search_preview' }] } : {}),
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_output_tokens: target === 'description' ? 300 : 800,
      }),
    });
    console.log(`[ai-generate] Réponse OpenAI reçue en ${Date.now() - t0}ms status=${openaiRes.status}`);

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[ai-generate] OpenAI error:', openaiRes.status, errText);
      clearTimeout(timeoutId);
      return errResp(502, friendlyAIError(openaiRes.status, errText), corsHeaders);
    }

    // Relais SSE : le squelette est partagé, seuls les événements propres à
    // la génération (recherche web, sources citées) sont traités ici.
    let chunkCount = 0;
    return relayOpenAIStream(openaiRes, {
      tag: 'ai-generate',
      corsHeaders,
      setReader: (r) => { _streamReader = r; },
      clearTimeoutFn: () => clearTimeout(timeoutId),
      onEvent: async (ev, emit) => {
        // Recherche web en cours
        if (ev.type === 'response.output_item.added' && ev.item?.type === 'web_search_call') {
          await emit({ status: 'searching' });
        }
        // Chunk de texte
        if (ev.type === 'response.output_text.delta' && ev.delta) {
          chunkCount++;
          await emit({ content: ev.delta });
        }
        // Sources consultées
        if (ev.type === 'response.output_text.done' && ev.annotations?.length) {
          const seen = new Set();
          const sources = ev.annotations
            .filter(a => a.type === 'url_citation' && a.url?.startsWith('http'))
            .map(a => ({ url: a.url, title: a.title || null }))
            .filter(x => { if (seen.has(x.url)) return false; seen.add(x.url); return true; })
            .slice(0, 5);
          if (sources.length) await emit({ sources });
        }
      },
      // Timeout sans aucun contenu généré : signaler plutôt qu'un silence
      // (avec du contenu partiel, le texte déjà reçu reste utilisable).
      onTimeoutMessage: () => (_timedOut && chunkCount === 0)
        ? 'Génération interrompue (délai dépassé) - réessayez.'
        : null,
    });

  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[ai-generate] Fatal:', err.name, err.message);
    const msg = err.name === 'AbortError'
      ? 'Génération interrompue (délai dépassé) - réessayez.'
      : 'Service IA injoignable - vérifiez la connexion puis réessayez.';
    return errResp(500, msg, corsHeaders);
  }
}

export const config = {
  path: '/api/ai-generate',
};
