// @ts-check
import { test, expect } from '@playwright/test';
import { envoyerMessageDemo } from '../netlify/functions/lib/demo-mail.mjs';

/**
 * Composition du message envoyé au visiteur de la démo salon.
 *
 * Ni navigateur ni serveur : le module est importé directement et `fetch` est
 * remplacé, donc AUCUN message ne part réellement pendant ces tests. C'est le
 * seul angle possible - un envoi réel dépend d'une clé de fournisseur absente
 * du contexte local et arriverait dans une vraie boîte.
 *
 * Ce qui est vérifié ici est précisément ce qui a cassé : `DEMO_MAIL_REPLY_TO`
 * accepte plusieurs adresses, et une chaîne unique « a@x,b@y » envoyée telle
 * quelle à Resend fait échouer l'expédition. Le message invite le visiteur à
 * répondre pour ne plus être contacté, et le domaine d'expédition n'a pas
 * d'enregistrement MX : si le reply-to est malformé, la sortie d'opposition
 * promise n'existe plus.
 *
 * Section : 0.34 - Démo salon / message au visiteur
 */

const DONNEES = {
  email: 'elu@exemple-commune.fr',
  communeNom: 'Saint-Genis-Laval',
  spaceUrl: 'https://openprojets.com/?city=essai-saint-genis-laval',
  projectsCount: 12,
};

const fetchReel = globalThis.fetch;
const envReel = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  DEMO_MAIL_REPLY_TO: process.env.DEMO_MAIL_REPLY_TO,
  DEMO_MAIL_FROM: process.env.DEMO_MAIL_FROM,
};

/** Remplace `fetch` et rend les appels captés, corps déjà décodé. */
function interceptor({ ok = true } = {}) {
  const appels = [];
  globalThis.fetch = async (url, init) => {
    appels.push({ url: String(url), corps: JSON.parse(init.body), entetes: init.headers });
    return {
      ok,
      status: ok ? 200 : 422,
      text: async () => (ok ? '{"id":"faux"}' : '{"message":"refuse"}'),
    };
  };
  return appels;
}

test.beforeEach(() => {
  delete process.env.BREVO_API_KEY;
  delete process.env.DEMO_MAIL_FROM;
  process.env.RESEND_API_KEY = 'cle-de-test';
});

test.afterEach(() => {
  globalThis.fetch = fetchReel;
  for (const [cle, valeur] of Object.entries(envReel)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
});

test.describe('Démo salon - message au visiteur', () => {
  test('0.34.1 - les adresses de réponse multiples partent en liste, pas en chaîne', async () => {
    process.env.DEMO_MAIL_REPLY_TO = 'solal.gendrin@gmail.com,loic@vazy.app,arnaud@vazy.app';
    const appels = interceptor();

    const res = await envoyerMessageDemo(DONNEES);

    expect(res.status).toBe('envoye');
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe('https://api.resend.com/emails');
    // Le point de non-régression : un tableau, jamais une chaîne collée.
    expect(Array.isArray(appels[0].corps.reply_to)).toBe(true);
    expect(appels[0].corps.reply_to).toEqual([
      'solal.gendrin@gmail.com',
      'loic@vazy.app',
      'arnaud@vazy.app',
    ]);
  });

  test('0.34.2 - les espaces et la virgule finale ne créent pas d\'adresse vide', async () => {
    process.env.DEMO_MAIL_REPLY_TO = ' solal.gendrin@gmail.com , loic@vazy.app ,';
    const appels = interceptor();

    await envoyerMessageDemo(DONNEES);

    expect(appels[0].corps.reply_to).toEqual(['solal.gendrin@gmail.com', 'loic@vazy.app']);
  });

  test('0.34.3 - sans adresse de réponse, le champ est absent du message', async () => {
    delete process.env.DEMO_MAIL_REPLY_TO;
    const appels = interceptor();

    await envoyerMessageDemo(DONNEES);

    // Un `reply_to` vide ou nul serait refusé par le fournisseur : on l'omet.
    expect(appels[0].corps).not.toHaveProperty('reply_to');
  });

  test('0.34.4 - l\'expéditeur par défaut reste le domaine vérifié', async () => {
    const appels = interceptor();

    await envoyerMessageDemo(DONNEES);

    expect(appels[0].corps.from).toBe('Open Projets <bonjour@openprojets.com>');
    expect(appels[0].corps.to).toEqual(['elu@exemple-commune.fr']);
    expect(appels[0].corps.subject).toBe('La carte des projets de Saint-Genis-Laval');
  });

  test('0.34.5 - le lien promis figure dans les deux versions du message', async () => {
    const appels = interceptor();

    await envoyerMessageDemo(DONNEES);

    expect(appels[0].corps.text).toContain(DONNEES.spaceUrl);
    expect(appels[0].corps.html).toContain(DONNEES.spaceUrl);
    // La mention d'opposition doit accompagner tout envoi non sollicité.
    expect(appels[0].corps.text).toContain('ne plus');
    expect(appels[0].corps.html).toContain('ne plus');
  });

  test('0.34.6 - sans clé de fournisseur, rien ne part et l\'état le dit', async () => {
    delete process.env.RESEND_API_KEY;
    const appels = interceptor();

    const res = await envoyerMessageDemo(DONNEES);

    // Le garde-fou : jamais de promesse de lien qui ne partira pas.
    expect(res.status).toBe('non_configure');
    expect(appels).toHaveLength(0);
  });

  test('0.34.7 - un refus du fournisseur est rendu en échec, sans lever', async () => {
    const appels = interceptor({ ok: false });

    const res = await envoyerMessageDemo(DONNEES);

    expect(res.status).toBe('echec');
    expect(res.error).toContain('Resend 422');
    expect(appels).toHaveLength(1);
  });

  test('0.34.8 - sans adresse d\'espace, aucun message n\'est tenté', async () => {
    const appels = interceptor();

    const res = await envoyerMessageDemo({ ...DONNEES, spaceUrl: null });

    expect(res.status).toBe('echec');
    expect(appels).toHaveLength(0);
  });
});
