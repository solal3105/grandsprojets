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

    const { text = '' } = JSON.parse(event.body || '{}');

    // Safety limit to avoid very long payloads (augmente pour permettre plus de contexte narratif)
    const source = (text || '').slice(0, 100000);

    const sys = "Tu es un journaliste francophone spécialisé en urbanisme. Style: clair, factuel, mesuré et analytique. Priorité à la précision, à la vérification et à la clarté. Évite le lyrisme, les métaphores appuyées, les scènes romancées et toute dramatisation. N'invente rien et appuie-toi uniquement sur la matière fournie. SORTIE STRICTE en JSON: {\\\"meta\\\": string <=150 chars (sans emoji), \\\"description\\\": string entre 300 et 450 chars (texte clair, sans markdown), \\\"article\\\": string en Markdown}. Interdiction absolue d'ajouter autre chose que l'objet JSON final (pas de balises de code, pas de commentaires).";

    // Prompt utilisateur mot pour mot
    const userPrompt = `Tu es un journaliste francophone spécialisé en urbanisme, transport, mobilité et grands projets.
Ta mission : rédiger un article narratif, immersif et détaillé sur un projet de transport ou d’aménagement, sous forme de chapitres progressifs.

Contraintes :
- **Structure en chapitres** : Chaque chapitre doit être un bloc narratif autonome, mais l’ensemble doit former une histoire continue.
- **Narration chronologique** : déroule l’histoire du projet en respectant la temporalité (genèse → débats → officialisation → tracé → procédures → impacts → perspectives) (C'est une indication, pas un ordre).
- **Style immersif** : écris comme un grand reportage. Décris les lieux, les controverses, les anecdotes, les choix politiques et techniques, sans inventer mais en donnant de la densité.
- **Profondeur factuelle** : chaque fait doit être replacé dans son contexte (pourquoi il est apparu, qui l’a soutenu ou contesté, ce que cela a changé concrètement).
- **Fluidité** : transitions naturelles, pas de listes ni d’énumérations à puces.
- **Longueur** : viser ≥ 4000 mots si la matière le permet.
- **Neutralité engagée** : tu racontes, tu analyses, mais tu ne fais pas de slogans.`;

    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userPrompt },
        { role: 'user', content: 'Texte source (extraits agrégés) :\n\n' + source },
      ],
      temperature: 0.6,
      max_tokens: 8000,
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => '');
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'OpenAI HTTP ' + resp.status, details: msg.slice(0, 500) }),
      };
    }

    const data = await resp.json();
    let content = data?.choices?.[0]?.message?.content || '';

    // Helper: retirer balises de code éventuelles
    const stripCodeFences = (s) => {
      return (s || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    };
    content = stripCodeFences(content);

    // Try to extract JSON from the content (robuste même si du texte entoure)
    let meta = '';
    let description = '';
    let article = '';
    try {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const jsonRaw = content.slice(start, end + 1);
        const json = JSON.parse(stripCodeFences(jsonRaw));
        meta = (json.meta || '').slice(0, 150);
        description = (json.description || '').slice(0, 450);
        article = json.article || json.article_markdown || json.markdown || '';
      }
    } catch (_) {}

    if (!meta && !description && !article) {
      // Fallback: mettre le contenu en article après avoir retiré d'éventuels blocs JSON
      // Supprimer blocs ```json ... ```
      let cleaned = content.replace(/```json[\s\S]*?```/gi, '');
      // Supprimer tout premier objet JSON isolé
      cleaned = cleaned.replace(/\{[\s\S]*?\}/, '').trim();
      article = cleaned || content || '';
    }

    // Fallback description: synthétiser à partir de l'article s'il est présent
    if (!description && article) {
      const plain = (article || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/^\s{0,3}[-*+]\s+/gm, '')
        .replace(/^\s{0,3}\d+\.\s+/gm, '')
        .replace(/[#>*_~`]|\[|\]|\(|\)|!|>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      description = (plain || '').slice(0, 450);
    }

    // Fallback meta: dérivée de la description ou de l'article
    if (!meta) {
      const base = (description || article || '').replace(/\s+/g, ' ').trim();
      meta = (base || '').slice(0, 150);
      // garder une coupure propre si possible
      if (meta.length === 150) {
        const lastSpace = meta.lastIndexOf(' ');
        if (lastSpace > 90) meta = meta.slice(0, lastSpace);
      }
    }

    // Usage tokens et métriques
    const usage = {
      prompt_tokens: data?.usage?.prompt_tokens ?? null,
      completion_tokens: data?.usage?.completion_tokens ?? null,
      total_tokens: data?.usage?.total_tokens ?? null,
      max_tokens: body.max_tokens,
      source_chars: source.length,
      // estimation grossière ~ 4 caractères/token
      source_est_tokens: Math.ceil(source.length / 4),
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
