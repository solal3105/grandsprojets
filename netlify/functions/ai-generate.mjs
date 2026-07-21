/**
 * Netlify Function: ai-generate
 * Proxy vers OpenAI — utilise l'API Responses avec le tool web_search_preview
 * pour chercher des informations réelles sur le projet avant de rédiger.
 * Supporte le streaming SSE.
 *
 * Variables d'environnement requises :
 *   OPENAI_API_KEY — clé API OpenAI
 *
 * Événements SSE émis vers le client :
 *   { status: 'searching' }         — recherche web en cours
 *   { content: '...' }              — chunk de texte
 *   { sources: [{url, title}] }     — sources consultées (fin de génération)
 *   [DONE]                          — fin du stream
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
IMPORTANT : Ne commence JAMAIS l'article par un lien seul ou une citation — commence directement par le contenu structuré (titre H2 puis introduction).
IMPORTANT : N'inclus AUCUN lien hypertexte inline [texte](url) dans le corps du texte. Texte Markdown pur, sans liens.`;

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

// Passerelle IA Netlify : quand elle est active, OPENAI_API_KEY est un jeton
// de passerelle valable uniquement sur OPENAI_BASE_URL (jamais api.openai.com).
const OPENAI_RESPONSES_URL = (process.env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com') + '/v1/responses';

async function verifyAuth(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    });
    return res.ok;
  } catch { return false; }
}

function errResp(status, error, corsHeaders) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Message utilisateur (français) pour une erreur du service IA.
 * @param {number} status - Statut HTTP OpenAI/passerelle (0 si inconnu)
 * @param {string} raw - Corps d'erreur brut (JSON OpenAI ou texte)
 */
function friendlyAIError(status, raw) {
  let code = '';
  let msg = '';
  try {
    const parsed = JSON.parse(raw);
    code = parsed.error?.code || parsed.error?.type || '';
    msg = parsed.error?.message || '';
  } catch { msg = String(raw || ''); }
  const s = Number(status) || 0;
  if (code === 'insufficient_quota' || /quota|billing|credit/i.test(`${code} ${msg}`)) {
    return 'Crédits du service IA épuisés — vérifiez la facturation OpenAI ou les crédits de la passerelle IA Netlify.';
  }
  if (s === 429 || code === 'rate_limit_exceeded') return 'Service IA saturé (limite de débit atteinte) — réessayez dans quelques instants.';
  if (s === 401 || s === 403) return 'Authentification au service IA refusée — clé API ou jeton de passerelle IA Netlify invalide ou expiré.';
  if (s === 402) return 'Crédits du service IA épuisés — vérifiez la facturation.';
  if (s === 404 || code === 'model_not_found') return 'Modèle IA indisponible — vérifiez la configuration.';
  if (s === 400) return 'Requête refusée par le service IA — réessayez.';
  if (s >= 500) return 'Service IA temporairement indisponible — réessayez dans quelques instants.';
  return `Service IA indisponible${s ? ` (HTTP ${s})` : ''} — réessayez.`;
}

const ALLOWED_ORIGINS = [
  'https://openprojets.com',
  'http://localhost:3001',
  'http://localhost:8888',
];

function getCorsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return errResp(405, 'Method not allowed', corsHeaders);

  const authed = await verifyAuth(req);
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
    console.warn('[ai-generate] Timeout 25s — annulation stream');
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

    // ── Traduction des événements Responses API → notre format SSE ──
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = (s) => new TextEncoder().encode(s);

    (async () => {
      const reader = openaiRes.body.getReader();
      _streamReader = reader; // expose pour le timeout
      const decoder = new TextDecoder();
      let buffer = '';
      let doneSent = false;
      let searchCount = 0;
      let chunkCount = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            if (data === '[DONE]') {
              if (!doneSent) { await writer.write(enc('data: [DONE]\n\n')); doneSent = true; }
              continue;
            }

            try {
              const ev = JSON.parse(data);

              // Recherche web en cours
              if (ev.type === 'response.output_item.added' && ev.item?.type === 'web_search_call') {
                await writer.write(enc(`data: ${JSON.stringify({ status: 'searching' })}\n\n`));
              }

              // Chunk de texte
              if (ev.type === 'response.output_text.delta' && ev.delta) {
                chunkCount++;
                await writer.write(enc(`data: ${JSON.stringify({ content: ev.delta })}\n\n`));
              }

              // Sources
              if (ev.type === 'response.output_text.done' && ev.annotations?.length) {
                const seen = new Set();
                const sources = ev.annotations
                  .filter(a => a.type === 'url_citation' && a.url?.startsWith('http'))
                  .map(a => ({ url: a.url, title: a.title || null }))
                  .filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; })
                  .slice(0, 5);
                if (sources.length) await writer.write(enc(`data: ${JSON.stringify({ sources })}\n\n`));
              }

              // Erreur API OpenAI (ex: quota dépassé)
              if (ev.type === 'error') {
                console.error('[ai-generate] OpenAI stream error:', JSON.stringify(ev.error || {}));
                const msg = friendlyAIError(0, JSON.stringify({ error: ev.error }));
                await writer.write(enc(`data: ${JSON.stringify({ error: msg })}\n\n`));
                if (!doneSent) { await writer.write(enc('data: [DONE]\n\n')); doneSent = true; }
                return;
              }

              // Fin
              if ((ev.type === 'response.completed' || ev.type === 'response.failed') && !doneSent) {
                console.log(`[ai-generate] Terminé — type=${ev.type} searches=${searchCount} chunks=${chunkCount}`);
                clearTimeout(timeoutId);
                await writer.write(enc('data: [DONE]\n\n'));
                doneSent = true;
              }

            } catch (parseErr) {
              console.warn('[ai-generate] Erreur parse event:', parseErr.message, '| data:', data.slice(0, 200));
            }
          }
        }
      } catch (err) {
        console.error('[ai-generate] Stream error:', err.name, err.message);
      } finally {
        clearTimeout(timeoutId);
        _streamReader = null;
        try {
          // Timeout sans aucun contenu généré : signaler plutôt qu'un silence
          // (avec du contenu partiel, le texte déjà reçu reste utilisable).
          if (_timedOut && chunkCount === 0 && !doneSent) {
            await writer.write(enc(`data: ${JSON.stringify({ error: 'Génération interrompue (délai dépassé) — réessayez.' })}\n\n`));
          }
          if (!doneSent) await writer.write(enc('data: [DONE]\n\n'));
          await writer.close();
        } catch { /* writer déjà fermé */ }
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[ai-generate] Fatal:', err.name, err.message);
    const msg = err.name === 'AbortError'
      ? 'Génération interrompue (délai dépassé) — réessayez.'
      : 'Service IA injoignable — vérifiez la connexion puis réessayez.';
    return errResp(500, msg, corsHeaders);
  }
}

export const config = {
  path: '/api/ai-generate',
};
