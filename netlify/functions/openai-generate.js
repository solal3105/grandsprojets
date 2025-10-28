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
      console.error('OPENAI_API_KEY manquante dans les variables d environnement');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Configuration serveur incomplète (OPENAI_API_KEY manquante)' }),
      };
    }

    const { text = '', mode = 'article', context = {} } = JSON.parse(event.body || '{}');
    
    // Récupérer le contexte de ville et thème
    const { city = 'global', theme = 'light' } = context || {};
    console.log(`[OpenAI] Génération pour ville: ${city}, thème: ${theme}, mode: ${mode}`);

    // Safety limit selon le mode: meta/description n'ont pas besoin de tout le contexte
    // OPTIMISATION TIMEOUT: Limite drastique pour éviter les timeouts Netlify (30s max)
    const RAW = text || '';
    const source = mode === 'article'
      ? RAW.slice(0, 35000)  // Réduit de 100K à 35K (~8-9K tokens au lieu de 25K)
      : RAW.slice(0, 16000);
    
    console.log(`[OpenAI] Mode: ${mode}, Input size: ${source.length} chars (~${Math.ceil(source.length/4)} tokens)`);

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
      // article - OPTIMISÉ POUR ÉVITER TIMEOUT AVEC CONTEXTE VILLE
      const cityContext = city !== 'global' && city ? `
\n**CONTEXTE LOCAL IMPORTANT**: Tu rédiges spécifiquement pour la ville de ${city.charAt(0).toUpperCase() + city.slice(1)}. Mentionne des références locales pertinentes quand possible.` : '';
      
      sys = `Tu es un journaliste francophone spécialisé en urbanisme. Style: clair, factuel, mesuré, analytique. N'invente rien. SORTIE STRICTE en JSON: {\\\"article\\\": string en Markdown}. Interdiction absolue d'ajouter autre chose que l'objet JSON final.`;
      userPrompt = `Tu es un journaliste francophone spécialisé en urbanisme, mobilité et grands projets.
Ta mission: rédiger un article narratif concis de 800-1200 mots, structuré en chapitres clairs.${cityContext}

Contraintes:
- Structure en 4-6 chapitres cohérents maximum.
- Narration chronologique: genèse → débats → officialisation → tracé → procédures → impacts → perspectives.
- Style clair et factuel, va à l'essentiel.
- Chapitres développés mais concis (2-3 paragraphes par chapitre).
- Privilégie la qualité à la longueur.
- Sois pertinent pour le contexte local de ${city || 'la zone concernée'}.`;
      temperature = 0.5;
      maxTokens = 2000;  // Réduit de 4000 à 2000 pour accélérer la génération
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
