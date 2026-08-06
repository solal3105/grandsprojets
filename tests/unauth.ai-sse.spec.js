// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Contrat du relais SSE partagé par /api/ai-generate et /api/ai-diagnostic.
 *
 * Contexte : audit DRY (2026-07). Les deux fonctions partageaient 88 lignes
 * significatives identiques, dont la boucle de relais SSE (~90 lignes) recopiée
 * mot pour mot. Elles s'appuient désormais sur
 * netlify/functions/lib/ai-common.mjs.
 *
 * Le flux réel n'est pas testable de bout en bout (il faudrait une vraie réponse
 * OpenAI), et admin.copilot.spec.js mocke l'endpoint côté navigateur : le code
 * serveur n'était donc couvert par rien. Ici on alimente le relais avec un flux
 * OpenAI synthétique et on vérifie les événements produits, événement par
 * événement, pour les deux appelants.
 *
 * Ces tests tournent en Node (pas de navigateur) : le projet `unauth` fournit
 * juste un contexte d'exécution.
 */

/** Fabrique une fausse réponse OpenAI en streaming à partir de lignes SSE. */
function fauxFluxOpenAI(evenements) {
  const corps = evenements.map(e => (e === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(e)}\n\n`)).join('');
  const octets = new TextEncoder().encode(corps);
  return {
    body: new ReadableStream({
      start(controller) {
        // Découpage en petits morceaux : force le relais à gérer les lignes
        // coupées au milieu, comme le fait un vrai flux réseau.
        for (let i = 0; i < octets.length; i += 7) controller.enqueue(octets.slice(i, i + 7));
        controller.close();
      },
    }),
  };
}

/** Consomme la réponse SSE produite par le relais et retourne les événements. */
async function lireSSE(response) {
  const texte = await response.text();
  return texte
    .split('\n\n')
    .map(b => b.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map(d => (d === '[DONE]' ? '[DONE]' : JSON.parse(d)));
}

/** Reproduit le câblage de ai-generate.mjs autour du relais partagé. */
function relaisGeneration(relay, flux) {
  let chunkCount = 0;
  let timedOut = false;
  return {
    resultat: relay(flux, {
      tag: 'test-generate',
      corsHeaders: {},
      setReader: () => {},
      clearTimeoutFn: () => {},
      onEvent: async (ev, emit) => {
        if (ev.type === 'response.output_item.added' && ev.item?.type === 'web_search_call') {
          await emit({ status: 'searching' });
        }
        if (ev.type === 'response.output_text.delta' && ev.delta) {
          chunkCount++;
          await emit({ content: ev.delta });
        }
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
      onTimeoutMessage: () => (timedOut && chunkCount === 0) ? 'Génération interrompue (délai dépassé) - réessayez.' : null,
    }),
    marquerTimeout: () => { timedOut = true; },
  };
}

/** Reproduit le câblage de ai-diagnostic.mjs autour du relais partagé. */
function relaisDiagnostic(relay, flux, { timedOut = false } = {}) {
  return relay(flux, {
    tag: 'test-diagnostic',
    corsHeaders: {},
    setReader: () => {},
    clearTimeoutFn: () => {},
    onEvent: async (ev, emit) => {
      if (ev.type === 'response.output_text.delta' && ev.delta) await emit({ content: ev.delta });
      if (ev.type === 'response.incomplete') {
        await emit({ error: 'Analyse incomplète (réponse tronquée). Réduisez la zone et réessayez.' });
        return 'stop';
      }
    },
    onTimeoutMessage: () => timedOut ? 'Analyse interrompue (délai dépassé). Réduisez la zone et réessayez.' : null,
  });
}

/* Import STATIQUE volontaire (pattern de unauth.demo-mail.spec.js) : depuis
   que ai-common importe lib/http.mjs, l'import dynamique en beforeAll fait
   échouer le transformateur de Playwright (« exports is not defined in ES
   module scope »), alors que le graphe statique se compile correctement. */
import { relayOpenAIStream as relay, friendlyAIError } from '../netlify/functions/lib/ai-common.mjs';

test.describe('0.30 - Relais SSE partagé des fonctions IA', () => {

  test('0.30.1 - ai-generate : recherche, texte, sources, fin', async () => {
    const flux = fauxFluxOpenAI([
      { type: 'response.output_item.added', item: { type: 'web_search_call' } },
      { type: 'response.output_text.delta', delta: 'Bonjour ' },
      { type: 'response.output_text.delta', delta: 'le monde' },
      { type: 'response.output_text.done', annotations: [
        { type: 'url_citation', url: 'https://a.fr', title: 'A' },
        { type: 'url_citation', url: 'https://a.fr', title: 'doublon' },
        { type: 'url_citation', url: 'https://b.fr', title: null },
      ] },
      { type: 'response.completed' },
    ]);

    const evts = await lireSSE(relaisGeneration(relay, flux).resultat);

    expect(evts).toEqual([
      { status: 'searching' },
      { content: 'Bonjour ' },
      { content: 'le monde' },
      { sources: [{ url: 'https://a.fr', title: 'A' }, { url: 'https://b.fr', title: null }] },
      '[DONE]',
    ]);
  });

  test('0.30.2 - ai-diagnostic : chunks JSON puis fin', async () => {
    const flux = fauxFluxOpenAI([
      { type: 'response.output_text.delta', delta: '{"resume":' },
      { type: 'response.output_text.delta', delta: '"ok"}' },
      { type: 'response.completed' },
    ]);

    const evts = await lireSSE(relaisDiagnostic(relay, flux));

    expect(evts).toEqual([{ content: '{"resume":' }, { content: '"ok"}' }, '[DONE]']);
    // Le JSON reconstitué doit être parsable : c'est ce qu'attend analysis.js
    const json = evts.filter(e => e.content).map(e => e.content).join('');
    expect(JSON.parse(json)).toEqual({ resume: 'ok' });
  });

  test('0.30.3 - ai-diagnostic : réponse tronquée arrête le relais', async () => {
    const flux = fauxFluxOpenAI([
      { type: 'response.output_text.delta', delta: '{"resume":' },
      { type: 'response.incomplete' },
      // Ne doit jamais être relayé : le relais s'arrête à response.incomplete
      { type: 'response.output_text.delta', delta: 'JAMAIS' },
    ]);

    const evts = await lireSSE(relaisDiagnostic(relay, flux));

    expect(evts).toEqual([
      { content: '{"resume":' },
      { error: 'Analyse incomplète (réponse tronquée). Réduisez la zone et réessayez.' },
      '[DONE]',
    ]);
    expect(JSON.stringify(evts)).not.toContain('JAMAIS');
  });

  test('0.30.4 - Une erreur OpenAI en cours de flux est traduite en français', async () => {
    const flux = fauxFluxOpenAI([
      { type: 'response.output_text.delta', delta: 'debut' },
      { type: 'error', error: { code: 'insufficient_quota', message: 'You exceeded your quota' } },
      { type: 'response.output_text.delta', delta: 'JAMAIS' },
    ]);

    const evts = await lireSSE(relaisDiagnostic(relay, flux));

    expect(evts[0]).toEqual({ content: 'debut' });
    expect(evts[1].error).toContain('Crédits du service IA épuisés');
    expect(evts[2]).toBe('[DONE]');
    expect(JSON.stringify(evts)).not.toContain('JAMAIS');
  });

  test('0.30.5 - [DONE] n\'est jamais émis deux fois', async () => {
    const flux = fauxFluxOpenAI([
      { type: 'response.output_text.delta', delta: 'x' },
      { type: 'response.completed' },
      '[DONE]',
    ]);
    const evts = await lireSSE(relaisDiagnostic(relay, flux));
    expect(evts.filter(e => e === '[DONE]')).toHaveLength(1);
  });

  test('0.30.6 - Timeout sans contenu : le client est prévenu, pas laissé en silence', async () => {
    const vide = fauxFluxOpenAI([]);
    const evts = await lireSSE(relaisDiagnostic(relay, vide, { timedOut: true }));
    expect(evts[0].error).toContain('délai dépassé');
    expect(evts[evts.length - 1]).toBe('[DONE]');
  });

  test('0.30.7 - friendlyAIError couvre les cas des deux appelants', async () => {
    expect(friendlyAIError(429, '{}')).toContain('saturé');
    expect(friendlyAIError(401, '{}')).toContain('Authentification');
    expect(friendlyAIError(404, '{}')).toContain('indisponible');
    expect(friendlyAIError(503, '{}')).toContain('temporairement indisponible');
    expect(friendlyAIError(0, JSON.stringify({ error: { code: 'insufficient_quota' } }))).toContain('Crédits');
    // Le conseil du cas 400 est propre à l'appelant : ai-diagnostic le fournit
    expect(friendlyAIError(400, '{}')).toBe('Requête refusée par le service IA - réessayez.');
    expect(friendlyAIError(400, '{}', 'si le problème persiste, réduisez la zone'))
      .toBe('Requête refusée par le service IA - réessayez ; si le problème persiste, réduisez la zone.');
  });
});
