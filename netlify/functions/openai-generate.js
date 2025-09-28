// Netlify Function: openai-generate
// - Lit OPENAI_API_KEY depuis les variables d'environnement
// - Attend un body JSON: { text: string }
// - Retourne { meta, description, article }

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }),
      };
    }

    const { text = '', mode = 'article' } = JSON.parse(event.body || '{}');

    // Safety limit selon le mode: meta/description n'ont pas besoin de tout le contexte
    const RAW = text || '';
    const source = mode === 'article'
      ? RAW.slice(0, 100000)
      : RAW.slice(0, 16000);

    // Construire prompts et limites selon le mode
    let sys = '';
    let userPrompt = '';
    let temperature = 0.5;
    let maxTokens = 12000;

    if (mode === 'meta') {
      sys = "Tu es un expert SEO francophone. SORTIE STRICTE en JSON: {\\\"meta\\\": string <=150 chars (sans emoji)}. Aucune autre clé ni texte.";
      userPrompt = "Génère une méta description percutante en moins de 150 caractères, claire et informative, sans emoji, basée sur le texte source ci-dessous.";
      temperature = 0.5;
      maxTokens = 320;
    } else if (mode === 'description') {
      sys = "Tu es un rédacteur francophone. SORTIE STRICTE en JSON: {\\\"description\\\": string entre 300 et 450 chars (texte clair, sans markdown)}. Aucune autre clé ni texte.";
      userPrompt = "Écris une description concise (300–450 caractères), fluide et accessible, sans markdown, basée sur le texte source ci-dessous.";
      temperature = 0.5;
      maxTokens = 800;
    } else {
      // article
      sys = "Tu es un journaliste francophone spécialisé en urbanisme. Style: clair, factuel, mesuré, analytique. N'invente rien. SORTIE STRICTE en JSON: {\\\"article\\\": string en Markdown (peut être TRÈS long)}. Interdiction absolue d'ajouter autre chose que l'objet JSON final.";
      userPrompt = `Tu es un journaliste francophone spécialisé en urbanisme, mobilité et grands projets.
Ta mission: rédiger un article narratif d'environ 2000 mots (objectif: ~2000), en chapitres progressifs, sans dépasser inutilement.

Contraintes:
- Structure en chapitres cohérents, histoire continue.
- Narration chronologique (indicative): genèse → débats → officialisation → tracé → procédures → impacts → perspectives.
- Style immersif, factualité et précision; pas de lyrisme ni scènes romancées.
- Développe chaque chapitre en profondeur, sans listes à puces.
- Ne t'arrête pas tant que tous les chapitres ne sont pas pleinement développés.
`;
      temperature = 0.5;
      maxTokens = 4000;
    }

    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userPrompt },
        { role: 'user', content: 'Texte source (extraits agrégés) :\n\n' + source },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    // Collecter des en-têtes utiles pour diagnostiquer d'éventuelles limites
    const outHeaders = {
      rate_limit_requests: resp.headers.get('x-ratelimit-limit-requests'),
      rate_remaining_requests: resp.headers.get('x-ratelimit-remaining-requests'),
      rate_limit_tokens: resp.headers.get('x-ratelimit-limit-tokens'),
      rate_remaining_tokens: resp.headers.get('x-ratelimit-remaining-tokens'),
      processing_ms: resp.headers.get('openai-processing-ms'),
      model: resp.headers.get('openai-model'),
    };

    if (!resp.ok) {
      const msg = await resp.text().catch(() => '');
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'OpenAI HTTP ' + resp.status, details: msg.slice(0, 500), headers: outHeaders }),
      };
    }

    const data = await resp.json();
    const choice = data?.choices?.[0] || {};
    const finish_reason = choice?.finish_reason || null;
    let content = choice?.message?.content || '';

    // Helper: retirer balises de code éventuelles
    const stripCodeFences = (s) => {
      return (s || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    };
    content = stripCodeFences(content);

    // Extraction simple des champs sans troncature ni fallback
    let meta = '';
    let description = '';
    let article = '';
    try {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const jsonRaw = content.slice(start, end + 1);
        const json = JSON.parse(stripCodeFences(jsonRaw));
        if (typeof json.meta === 'string') meta = json.meta;
        if (typeof json.description === 'string') description = json.description;
        if (typeof json.article === 'string') article = json.article;
        if (!article && typeof json.article_markdown === 'string') article = json.article_markdown;
        if (!article && typeof json.markdown === 'string') article = json.markdown;
      }
    } catch (_) {}

    // Usage tokens et métriques
    const usage = {
      version: 'v2-diag-2025-09-08T10:48:00+02:00', // temporaire pour vérifier la version déployée
      prompt_tokens: data?.usage?.prompt_tokens ?? null,
      completion_tokens: data?.usage?.completion_tokens ?? null,
      total_tokens: data?.usage?.total_tokens ?? null,
      max_tokens: body.max_tokens,
      body_max_tokens: body.max_tokens,
      source_chars: source.length,
      // estimation grossière ~ 4 caractères/token
      source_est_tokens: Math.ceil(source.length / 4),
      // Diagnostics temporaires
      finish_reason,
      headers: outHeaders,
      mode,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ meta, description, article, usage }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Unhandled error', details: String(e).slice(0, 500) }),
    };
  }
}
