// @ts-check
import { test, expect } from '@playwright/test';
import { envoyerMessageTarif, resumer } from '../netlify/functions/lib/tarif-mail.mjs';
import { estimer, euros } from '../home-src/src/v2/data/tarification.mjs';

/**
 * Composition du message envoyé à qui demande le tarif exact sur l'estimateur.
 *
 * Ni navigateur ni serveur : le module est importé directement et `fetch` est
 * remplacé, donc AUCUN message ne part réellement pendant ces tests.
 *
 * Ce qui compte : le demandeur est seul destinataire, l'équipe est en copie
 * invisible (c'est sa notification), le message rappelle la fourchette vue à
 * l'écran et ne donne jamais le tarif exact, que l'équipe annonce elle-même.
 *
 * Section : 0.40 - Estimateur de prix / message au demandeur
 */

const DEMANDE = {
  email: 'dgs@trifouillis.fr',
  telephone: '',
  population: 12000,
  modules: ['carte', 'travaux'],
  annees: 3,
};

const fetchReel = globalThis.fetch;
const envReel = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  TARIF_MAIL_BCC: process.env.TARIF_MAIL_BCC,
  TARIF_MAIL_REPLY_TO: process.env.TARIF_MAIL_REPLY_TO,
  DEMO_MAIL_REPLY_TO: process.env.DEMO_MAIL_REPLY_TO,
};

/** Remplace `fetch` et rend les appels captés, corps déjà décodé. */
function interceptor({ ok = true } = {}) {
  const appels = [];
  globalThis.fetch = async (url, init) => {
    appels.push({ url: String(url), corps: JSON.parse(init.body) });
    return { ok, status: ok ? 200 : 422, text: async () => (ok ? '{"id":"faux"}' : '{"message":"refuse"}') };
  };
  return appels;
}

test.beforeEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.TARIF_MAIL_BCC;
  delete process.env.TARIF_MAIL_REPLY_TO;
  delete process.env.DEMO_MAIL_REPLY_TO;
  process.env.RESEND_API_KEY = 'cle-de-test';
});

test.afterEach(() => {
  globalThis.fetch = fetchReel;
  for (const [k, v] of Object.entries(envReel)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test.describe('0.40 - L\'estimateur de prix : le message au demandeur', () => {
  test('0.40.1 - le demandeur est seul destinataire, l\'équipe en copie invisible', async () => {
    const appels = interceptor();
    const r = await envoyerMessageTarif(DEMANDE);
    expect(r.status).toBe('envoye');
    expect(appels).toHaveLength(1);
    expect(appels[0].corps.to).toEqual(['dgs@trifouillis.fr']);
    expect(appels[0].corps.bcc).toEqual(['loic@vazy.app', 'solal@vazy.app', 'arnaud@vazy.app']);
    expect(appels[0].corps.subject).toBe('Votre demande de tarif Open Projets');
  });

  test('0.40.2 - le message rappelle les réglages et la fourchette, jamais le tarif exact', async () => {
    const appels = interceptor();
    await envoyerMessageTarif(DEMANDE);
    const { text, html } = appels[0].corps;
    const e = estimer(DEMANDE);
    const resume = resumer(DEMANDE);
    for (const corps of [text, html]) {
      expect(corps).toMatch(/12\D000 habitants/);
      expect(corps).toContain('Carte des projets urbains, Travaux du quotidien');
      expect(corps).toContain('3 ans');
      expect(corps).toContain(resume.mensuel);
      expect(corps).toContain(resume.total);
      expect(corps).not.toContain(euros(e.mensuel));
      expect(corps).not.toContain(euros(e.total));
      // En HTML, l'esperluette du lien est échappée
      expect(corps).toMatch(/population=12000&(amp;)?modules=carte,travaux&(amp;)?annees=3/);
      expect(corps).toContain('Répondez simplement à ce message');
    }
  });

  test('0.40.3 - le téléphone figure quand il est donné, et seulement alors', async () => {
    let appels = interceptor();
    await envoyerMessageTarif({ ...DEMANDE, telephone: '04 72 00 00 00' });
    expect(appels[0].corps.text).toContain('04 72 00 00 00');
    expect(appels[0].corps.html).toContain('04 72 00 00 00');
    appels = interceptor();
    await envoyerMessageTarif(DEMANDE);
    expect(appels[0].corps.text).not.toContain('appellerons');
  });

  test('0.40.4 - les réponses tombent devant l\'équipe, comme pour la démo si rien de spécifique n\'est réglé', async () => {
    process.env.DEMO_MAIL_REPLY_TO = 'solal@vazy.app, loic@vazy.app';
    let appels = interceptor();
    await envoyerMessageTarif(DEMANDE);
    expect(appels[0].corps.reply_to).toEqual(['solal@vazy.app', 'loic@vazy.app']);
    process.env.TARIF_MAIL_REPLY_TO = 'ventes@vazy.app';
    appels = interceptor();
    await envoyerMessageTarif(DEMANDE);
    expect(appels[0].corps.reply_to).toEqual(['ventes@vazy.app']);
  });

  test('0.40.5 - sans clé de fournisseur, rien ne part et l\'état le dit', async () => {
    delete process.env.RESEND_API_KEY;
    const appels = interceptor();
    const r = await envoyerMessageTarif(DEMANDE);
    expect(r.status).toBe('non_configure');
    expect(appels).toHaveLength(0);
  });

  test('0.40.6 - un refus du fournisseur est rendu en échec, sans lever', async () => {
    interceptor({ ok: false });
    const r = await envoyerMessageTarif(DEMANDE);
    expect(r.status).toBe('echec');
    expect(r.error).toBeTruthy();
  });

  test('0.40.7 - sans module retenu, aucun message n\'est tenté', async () => {
    const appels = interceptor();
    const r = await envoyerMessageTarif({ ...DEMANDE, modules: ['inconnu'] });
    expect(r.status).toBe('echec');
    expect(appels).toHaveLength(0);
  });
});
