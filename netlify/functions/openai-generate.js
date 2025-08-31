// Netlify Function: openai-generate
// - Lit OPENAI_API_KEY depuis les variables d'environnement
// - Attend un body JSON: { text: string }
// - Retourne { meta, markdown }

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

    // Safety limit to avoid very long payloads
    const source = (text || '').slice(0, 12000);

    const sys = "Tu es un assistant éditorial francophone expert en SEO et rédaction. Exigences strictes de sortie en JSON: {\"meta\": string <=150 chars optimisée SEO (sans emoji), \"description\": string entre 300 et 450 chars (texte clair, engageant, sans markdown), \"article\": string en Markdown long et exhaustif (titres, listes, tableaux si utile), concret, sourcé si possible, sans bullshit, inclure anecdotes/historique pertinents si disponibles). Vise au moins ~800 mots pour l'article si la matière le permet. Aucune autre clé, aucune explication hors JSON.";
    const user = 'Voici le texte source (extraits agrégés). Respecte strictement meta <150 et description 300–450. Pour l\'article, sois long et utile (>= ~800 mots si pertinent). Texte source:\n\n' + source;

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: 3000,
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
    const content = data?.choices?.[0]?.message?.content || '';

    // Try to extract JSON from the content
    let meta = '';
    let description = '';
    let article = '';
    try {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const json = JSON.parse(content.slice(start, end + 1));
        meta = (json.meta || '').slice(0, 150);
        description = (json.description || '').slice(0, 450);
        article = json.article || json.article_markdown || json.markdown || '';
      }
    } catch (_) {}

    if (!meta && !description && !article) {
      // Fallback: put everything as article (markdown)
      article = content || '';
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ meta, description, article }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Unhandled error', details: String(e).slice(0, 500) }),
    };
  }
}
