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
IMPORTANT : Utilise impérativement la recherche web pour trouver des informations récentes et précises sur ce projet avant de rédiger. Cite des faits vérifiables.`;

const SYSTEM_PROMPT_ARTICLE = `Tu es un rédacteur expert en urbanisme et projets de territoire.
Tu rédiges des articles de présentation en Markdown pour des fiches de projets urbains.
Structure attendue :
- Un titre H2 avec le nom du projet
- Un paragraphe d'introduction (contexte, porteur du projet, état d'avancement)
- 2-3 sections H3 (ex : Contexte, Objectifs, Calendrier & Budget, Impacts attendus)
- Style factuel, institutionnel, accessible au grand public
- Longueur : 400-800 mots
Tu dois écrire en français. Ne mets pas de titre H1.
IMPORTANT : Utilise impérativement la recherche web pour trouver des informations récentes et précises sur ce projet. Intègre des données chiffrées, des dates, des acteurs impliqués si disponibles.`;

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';

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

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

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
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
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
        max_output_tokens: target === 'description' ? 300 : 2000,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('[ai-generate] OpenAI error:', errText);
      return errResp(502, 'OpenAI API error', corsHeaders);
    }

    // ── Traduction des événements Responses API → notre format SSE ──
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = (s) => new TextEncoder().encode(s);

    (async () => {
      const reader = openaiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneSent = false;

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
                const msg = ev.error?.message || ev.error?.code || 'OpenAI error';
                await writer.write(enc(`data: ${JSON.stringify({ error: msg })}\n\n`));
                if (!doneSent) { await writer.write(enc('data: [DONE]\n\n')); doneSent = true; }
                return;
              }

              // Fin
              if ((ev.type === 'response.completed' || ev.type === 'response.failed') && !doneSent) {
                await writer.write(enc('data: [DONE]\n\n'));
                doneSent = true;
              }

            } catch (parseErr) {
              console.warn('[ai-generate] Erreur parse event:', parseErr.message, '| data:', data.slice(0, 200));
            }
          }
        }
      } catch (err) {
        console.error('[ai-generate] Stream error:', err);
      } finally {
        if (!doneSent) await writer.write(enc('data: [DONE]\n\n'));
        await writer.close();
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
    console.error('[ai-generate] Fatal:', err);
    return errResp(500, err.message, corsHeaders);
  }
}

export const config = {
  path: '/api/ai-generate',
};
