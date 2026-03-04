var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/openai-generate.js
var openai_generate_exports = {};
__export(openai_generate_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(openai_generate_exports);
async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }
  try {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      console.error("OPENAI_API_KEY manquante dans les variables d environnement");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Configuration serveur incompl\xE8te (OPENAI_API_KEY manquante)" })
      };
    }
    const { text = "", mode = "article", context = {} } = JSON.parse(event.body || "{}");
    const { city = "global", theme = "light" } = context || {};
    console.log(`[OpenAI] G\xE9n\xE9ration pour ville: ${city}, th\xE8me: ${theme}, mode: ${mode}`);
    const RAW = text || "";
    const source = mode === "article" ? RAW.slice(0, 35e3) : RAW.slice(0, 16e3);
    console.log(`[OpenAI] Mode: ${mode}, Input size: ${source.length} chars (~${Math.ceil(source.length / 4)} tokens)`);
    let sys = "";
    let userPrompt = "";
    let temperature = 0.5;
    let maxTokens = 12e3;
    if (mode === "meta") {
      sys = 'Tu es un expert SEO francophone. SORTIE STRICTE en JSON: {\\"meta\\": string <=150 chars (sans emoji)}. Aucune autre cl\xE9 ni texte.';
      userPrompt = "G\xE9n\xE8re une m\xE9ta description percutante en moins de 150 caract\xE8res, claire et informative, sans emoji, bas\xE9e sur le texte source ci-dessous.";
      temperature = 0.5;
      maxTokens = 320;
    } else if (mode === "description") {
      sys = 'Tu es un r\xE9dacteur francophone. SORTIE STRICTE en JSON: {\\"description\\": string entre 300 et 450 chars (texte clair, sans markdown)}. Aucune autre cl\xE9 ni texte.';
      userPrompt = "\xC9cris une description concise (300\u2013450 caract\xE8res), fluide et accessible, sans markdown, bas\xE9e sur le texte source ci-dessous.";
      temperature = 0.5;
      maxTokens = 800;
    } else {
      const cityContext = city !== "global" && city ? `

**CONTEXTE LOCAL IMPORTANT**: Tu r\xE9diges sp\xE9cifiquement pour la ville de ${city.charAt(0).toUpperCase() + city.slice(1)}. Mentionne des r\xE9f\xE9rences locales pertinentes quand possible.` : "";
      sys = `Tu es un journaliste francophone sp\xE9cialis\xE9 en urbanisme. Style: clair, factuel, mesur\xE9, analytique. N'invente rien. SORTIE STRICTE en JSON: {\\"article\\": string en Markdown}. Interdiction absolue d'ajouter autre chose que l'objet JSON final.`;
      userPrompt = `Tu es un journaliste francophone sp\xE9cialis\xE9 en urbanisme, mobilit\xE9 et grands projets.
Ta mission: r\xE9diger un article narratif concis de 800-1200 mots, structur\xE9 en chapitres clairs.${cityContext}

Contraintes:
- Structure en 4-6 chapitres coh\xE9rents maximum.
- Narration chronologique: gen\xE8se \u2192 d\xE9bats \u2192 officialisation \u2192 trac\xE9 \u2192 proc\xE9dures \u2192 impacts \u2192 perspectives.
- Style clair et factuel, va \xE0 l'essentiel.
- Chapitres d\xE9velopp\xE9s mais concis (2-3 paragraphes par chapitre).
- Privil\xE9gie la qualit\xE9 \xE0 la longueur.
- Sois pertinent pour le contexte local de ${city || "la zone concern\xE9e"}.`;
      temperature = 0.5;
      maxTokens = 2e3;
    }
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
        { role: "user", content: "Texte source (extraits agr\xE9g\xE9s) :\n\n" + source }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    const outHeaders = {
      rate_limit_requests: resp.headers.get("x-ratelimit-limit-requests"),
      rate_remaining_requests: resp.headers.get("x-ratelimit-remaining-requests"),
      rate_limit_tokens: resp.headers.get("x-ratelimit-limit-tokens"),
      rate_remaining_tokens: resp.headers.get("x-ratelimit-remaining-tokens"),
      processing_ms: resp.headers.get("openai-processing-ms"),
      model: resp.headers.get("openai-model")
    };
    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      return {
        statusCode: resp.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "OpenAI HTTP " + resp.status, details: msg.slice(0, 500), headers: outHeaders })
      };
    }
    const data = await resp.json();
    const choice = data?.choices?.[0] || {};
    const finish_reason = choice?.finish_reason || null;
    let content = choice?.message?.content || "";
    const stripCodeFences = (s) => {
      return (s || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    };
    content = stripCodeFences(content);
    let meta = "";
    let description = "";
    let article = "";
    try {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const jsonRaw = content.slice(start, end + 1);
        const json = JSON.parse(stripCodeFences(jsonRaw));
        if (typeof json.meta === "string") meta = json.meta;
        if (typeof json.description === "string") description = json.description;
        if (typeof json.article === "string") article = json.article;
        if (!article && typeof json.article_markdown === "string") article = json.article_markdown;
        if (!article && typeof json.markdown === "string") article = json.markdown;
      }
    } catch (_) {
    }
    const usage = {
      version: "v2-diag-2025-09-08T10:48:00+02:00",
      // temporaire pour vérifier la version déployée
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
      mode
    };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ meta, description, article, usage })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Unhandled error", details: String(e).slice(0, 500) })
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=openai-generate.js.map
