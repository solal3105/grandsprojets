// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Écran démo salon (/demo/) : boot, autocomplétion, validation de l'API,
 * récupération de l'adresse en fin de parcours.
 *
 * La génération complète (IA + écritures Supabase) n'est pas testée ici :
 * elle dépend de clés absentes du contexte local et crée des données réelles.
 * Sont donc testés le contrat d'entrée de l'API, le contrat d'entrée de
 * /api/demo-lead, et les états d'écran qui ne demandent aucune génération.
 *
 * Section : 0.32 - Démo salon
 */

test.describe('Démo salon - /demo/', () => {
  test('0.32.1 - la page se charge avec le champ commune', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('votre commune');
    await expect(page.locator('#commune-input')).toBeVisible();
    await expect(page.locator('#commune-input')).toBeFocused();
  });

  test('0.32.2 - l\'autocomplétion propose des communes réelles', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await page.locator('#commune-input').fill('Bourg-en-Br');
    const suggestions = page.locator('#suggestions li');
    await expect(suggestions.first()).toBeVisible({ timeout: 10000 });
    await expect(suggestions.first()).toContainText('Bourg-en-Bresse');
  });

  test('0.32.3 - l\'API refuse un code commune invalide', async ({ request }) => {
    const resp = await request.get('/api/demo-generate?commune=abc');
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('invalide');
  });

  /**
   * Non-régression : la lettre des codes corses est en DEUXIÈME position
   * (2A004), pas en troisième. L'ancien motif \d{2}[0-9AB]\d{2} renvoyait 400
   * pour les 360 communes de Corse, et l'écran enchaînait quatre reprises
   * identiques avant d'abandonner.
   *
   * Les codes utilisés ici ont la BONNE FORME mais ne désignent aucune commune :
   * la validation les laisse passer, puis l'annuaire officiel ne les reconnaît
   * pas et le flux se referme aussitôt. On teste ainsi le contrat d'entrée sans
   * déclencher de vraie génération.
   */
  test('0.32.4 - l\'API accepte la forme des codes commune de Corse', async ({ request }) => {
    for (const insee of ['2A999', '2B999']) {
      const resp = await request.get(`/api/demo-generate?commune=${insee}`);
      expect(resp.status(), `code ${insee} refusé par l'API`).toBe(200);
      expect(await resp.text(), `code ${insee} non transmis à l'annuaire`).toContain('introuvable');
    }
  });

  test('0.32.5 - l\'API accepte la forme métropole et outre-mer', async ({ request }) => {
    for (const insee of ['69999', '97499']) {
      const resp = await request.get(`/api/demo-generate?commune=${insee}`);
      expect(resp.status(), `code ${insee} refusé par l'API`).toBe(200);
      expect(await resp.text(), `code ${insee} non transmis à l'annuaire`).toContain('introuvable');
    }
  });

  test('0.32.6 - l\'écran reconnaît un code commune corse passé en lien', async ({ page }) => {
    await page.goto('/demo/?commune=2A004', { waitUntil: 'domcontentloaded' });
    // Sans `auto=1`, le code est seulement résolu et le nom pré-rempli : c'est
    // la preuve que le motif client accepte la forme corse.
    await expect(page.locator('#commune-input')).toHaveValue('Ajaccio', { timeout: 10000 });
  });

  test('0.32.11 - l\'API refuse un paramètre ville hors préfixe essai-', async ({ request }) => {
    const resp = await request.get('/api/demo-generate?phase=create&ville=metropole-lyon');
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('invalide');
  });
});

test.describe('Démo salon - récupération de l\'adresse', () => {
  test('0.32.7 - le formulaire d\'adresse est présent et sans échappatoire', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    // L'écran de fin est masqué tant qu'aucune génération n'a abouti, mais son
    // contenu doit exister dans le document.
    await expect(page.locator('#lead-form')).toHaveCount(1);
    await expect(page.locator('#lead-email')).toHaveCount(1);
    // L'adresse conditionne l'accès à l'espace : plus aucun bouton ne permet
    // de passer l'étape.
    await expect(page.locator('#lead-skip')).toHaveCount(0);
    // Le bouton de relance n'apparaît que sur une commune déjà générée
    await expect(page.locator('#btn-regen')).toBeHidden();
  });

  /**
   * Non-régression : `type="email"` sert au clavier des téléphones, mais sa
   * validation native bloque l'envoi avant notre code et affiche une bulle du
   * navigateur, hors charte et dans sa propre langue. `novalidate` rend la main
   * à notre message.
   */
  test('0.32.12 - le formulaire laisse notre propre message d\'erreur s\'afficher', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lead-form')).toHaveAttribute('novalidate', '');
  });

  /**
   * Non-régression visuelle : un seul appel à l'action rouge sur l'écran de fin.
   * Le bouton d'envoi de l'adresse en était un second, et les deux se
   * disputaient le regard au milieu de l'écran.
   */
  test('0.32.13 - l\'écran de fin n\'a qu\'un seul bouton d\'action principal', async ({ page }) => {
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#screen-done .btn--primary')).toHaveCount(1);
    await expect(page.locator('#screen-done .btn--primary')).toHaveId('btn-open');
  });
});

/**
 * Toute commune de la démo est un espace d'ESSAI : elle doit pouvoir être
 * refaite depuis zéro à tout moment. Le flux SSE est remplacé par un double
 * pour atteindre l'écran de fin sans lancer de vraie génération.
 *
 * Section : 0.33 - Relance d'une commune d'essai
 */
test.describe('Démo salon - relance depuis l\'écran', () => {
  const COMMUNE = { nom: 'Oyonnax', code: '01283', population: 22000, centre: { type: 'Point', coordinates: [5.655, 46.257] } };

  async function allerAuDone(page, done) {
    await page.addInitScript(() => {
      class FauxEventSource {
        constructor(url) {
          this.url = url;
          window.__sse = this;
          (window.__sseUrls = window.__sseUrls || []).push(url);
        }
        close() { /* le double ne tient aucune connexion */ }
      }
      window.EventSource = FauxEventSource;
      window.__envoyer = (o) => window.__sse?.onmessage?.({ data: JSON.stringify(o) });
    });
    await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('communes?nom=') ? [COMMUNE] : COMMUNE),
    }));
    await page.route('**/api.qrserver.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await page.locator('#commune-input').fill('Oyonnax');
    await page.locator('#suggestions li').first().click();
    await page.waitForFunction(() => window.__sse);
    await page.evaluate((m) => window.__envoyer(m), done);
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
  }

  const DONE_NEUF = {
    type: 'done', url: '/?city=essai-oyonnax', ville: 'essai-oyonnax',
    communeNom: 'Oyonnax', communeInsee: '01283', projectsCount: 12,
    stats: { sources: 20, verified: 12, precise: 10, illustrated: 6 },
  };

  /* L'adresse CONDITIONNE l'accès à l'espace : les actions ne sont découvertes
     qu'une fois une adresse valide envoyée. */
  test('0.33.0 - l\'adresse est exigée avant de donner accès à l\'espace', async ({ page }) => {
    await page.route('**/api/demo-lead', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"ok":true,"mailed":true}',
    }));
    await allerAuDone(page, DONE_NEUF);
    await expect(page.locator('#lead-form')).toBeVisible();
    await expect(page.locator('#done-suite')).toBeHidden();
    await expect(page.locator('#btn-open')).toBeHidden();

    // Champ vide puis adresse invalide : l'espace reste fermé dans les deux cas
    await page.locator('#lead-submit').click();
    await expect(page.locator('#lead-error')).toBeVisible();
    await expect(page.locator('#done-suite')).toBeHidden();
    await page.locator('#lead-email').fill('pas-une-adresse');
    await page.locator('#lead-submit').click();
    await expect(page.locator('#lead-error')).toBeVisible();
    await expect(page.locator('#done-suite')).toBeHidden();

    await page.locator('#lead-email').fill('maire@oyonnax.fr');
    await page.locator('#lead-submit').click();
    await expect(page.locator('#done-suite')).toBeVisible();
    await expect(page.locator('#btn-open')).toBeVisible();
  });

  /* Porte de service du stand : le code saisi dans le champ de l'adresse ouvre
     l'espace sans adresse et SANS enregistrer de lead. */
  test('0.33.4 - le code de service ouvre l\'espace sans enregistrer d\'adresse', async ({ page }) => {
    let appels = 0;
    await page.route('**/api/demo-lead', (route) => {
      appels += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await allerAuDone(page, DONE_NEUF);
    await page.locator('#lead-email').fill('VaZy');
    await page.locator('#lead-submit').click();
    await expect(page.locator('#done-suite')).toBeVisible();
    await expect(page.locator('#lead-form')).toBeHidden();
    // Pas de remerciement : rien n'a été envoyé, rien n'a été promis
    await expect(page.locator('#lead-thanks')).toBeHidden();
    expect(appels, 'le code de service ne doit rien enregistrer').toBe(0);
  });

  /* Refaire le recensement est la commande de celui qui tient le stand, pas une
     action de visiteur : elle ne doit PAS être derrière la question de
     l'adresse. */
  test('0.33.1 - le bouton de relance est accessible sans passer par l\'adresse', async ({ page }) => {
    await allerAuDone(page, DONE_NEUF);
    await expect(page.locator('#lead-form')).toBeVisible();
    await expect(page.locator('#done-suite')).toBeHidden();
    await expect(page.locator('#btn-regen')).toBeVisible();
  });

  test('0.33.2 - le bouton de relance reste là une fois l\'espace déverrouillé', async ({ page }) => {
    await allerAuDone(page, { ...DONE_NEUF, existing: true, projectsCount: undefined, stats: undefined });
    await expect(page.locator('#btn-regen')).toBeVisible();
    await page.locator('#lead-email').fill('vazy');
    await page.locator('#lead-submit').click();
    await expect(page.locator('#done-suite')).toBeVisible();
    await expect(page.locator('#btn-regen')).toBeVisible();
  });

  /**
   * Non-régression : sans `regen=1`, le serveur rouvre l'espace existant au lieu
   * de refaire le recensement, et le bouton ne sert à rien.
   */
  test('0.33.3 - la relance repart de zéro (regen=1 transmis au serveur)', async ({ page }) => {
    await allerAuDone(page, { ...DONE_NEUF, existing: true });
    await page.locator('#btn-regen').click();
    await expect(page.locator('#screen-progress')).toHaveClass(/is-active/);
    const urls = await page.evaluate(() => window.__sseUrls);
    expect(urls[urls.length - 1]).toContain('regen=1');
    expect(urls[urls.length - 1]).toContain('commune=01283');
  });
});

test.describe('Démo salon - endpoint d\'enregistrement de l\'adresse', () => {
  test('0.32.8 - /api/demo-lead refuse une adresse invalide', async ({ request }) => {
    const resp = await request.post('/api/demo-lead', {
      data: { email: 'pas-une-adresse', ville: 'essai-vannes' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('mail');
  });

  test('0.32.9 - /api/demo-lead refuse une ville hors préfixe essai-', async ({ request }) => {
    const resp = await request.post('/api/demo-lead', {
      data: { email: 'maire@ville.fr', ville: 'metropole-lyon' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('invalide');
  });

  test('0.32.10 - /api/demo-lead refuse une autre méthode que POST', async ({ request }) => {
    const resp = await request.get('/api/demo-lead');
    expect(resp.status()).toBe(405);
  });
});

/**
 * La rareté n'arrête plus la génération. Une carte d'un ou deux projets se
 * construit quand même, prévenue à l'avance, et une commune dont le web public
 * ne dit rien rejoint l'écran de fin au lieu de l'écran d'échec : c'était le
 * seul chemin qui laissait repartir un visiteur sans rien lui demander.
 *
 * Section : 0.34 - Cartes courtes et communes sans projet documenté
 */
test.describe('Démo salon - cartes courtes', () => {
  const COMMUNE = { nom: 'Oyonnax', code: '01283', population: 22000, centre: { type: 'Point', coordinates: [5.655, 46.257] } };
  const SANS_PROJET = {
    type: 'error',
    kind: 'sans-projet',
    message: "Les sources publiques ne documentent aujourd'hui aucun projet d'Oyonnax. Vos documents internes nous suffisent pour la construire en quelques jours.",
  };

  // Le flux SSE est remplacé par un double : aucun test ici ne lance de vraie
  // génération, ni n'appelle OpenAI.
  async function lancerFlux(page) {
    await page.addInitScript(() => {
      class FauxEventSource {
        constructor(url) {
          this.url = url;
          window.__sse = this;
          (window.__sseUrls = window.__sseUrls || []).push(url);
        }
        close() { /* le double ne tient aucune connexion */ }
      }
      window.EventSource = FauxEventSource;
      window.__envoyer = (o) => window.__sse?.onmessage?.({ data: JSON.stringify(o) });
    });
    await page.route('**/geo.api.gouv.fr/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('communes?nom=') ? [COMMUNE] : COMMUNE),
    }));
    await page.route('**/api.qrserver.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
    await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
    await page.locator('#commune-input').fill('Oyonnax');
    await page.locator('#suggestions li').first().click();
    await page.waitForFunction(() => window.__sse);
  }

  const envoyer = (page, msg) => page.evaluate((m) => window.__envoyer(m), msg);

  /* L'avertissement prévient AVANT l'arrivée : le dire seulement à l'écran de
     fin, où l'adresse e-mail est demandée, ferait payer une surprise. */
  test('0.34.1 - l\'avertissement de carte courte n\'interrompt pas la génération', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, { type: 'notice', message: "Nous n'avons trouvé que 2 projets documentés." });
    await expect(page.locator('#hud-notice')).toBeVisible();
    await expect(page.locator('#hud-notice')).toContainText('2 projets documentés');
    // Rien n'est interrompu : l'écran de fin n'est pas convoqué
    await expect(page.locator('#screen-done')).not.toHaveClass(/is-active/);
    await expect(page.locator('#screen-progress')).toHaveClass(/is-active/);
  });

  /* Sur une carte courte, « 2 projets recensés, vérifiés et publiés en 1 min 40 »
     sonnerait comme un aveu. */
  test('0.34.2 - l\'écran de fin d\'une carte courte remplace le compte rendu de performance', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, {
      type: 'done', url: '/?city=essai-oyonnax', ville: 'essai-oyonnax',
      communeNom: 'Oyonnax', communeInsee: '01283', projectsCount: 2, courte: true,
      stats: { sources: 38, verified: 2, precise: 2, illustrated: 1 },
    });
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await expect(page.locator('#done-detail')).toContainText('2 projets documentés dans les sources publiques');
    await expect(page.locator('#done-detail')).not.toContainText('publiés en');
    // La carte EXISTE : c'est une réussite, la coche et le titre ne changent pas
    await expect(page.locator('#done-card')).not.toHaveClass(/done--sans-espace/);
    await expect(page.locator('#embleme-carte')).toBeVisible();
    await expect(page.locator('#done-titre-apres')).toHaveText(' est prête');
  });

  test('0.34.3 - une carte fournie garde son compte rendu habituel', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, {
      type: 'done', url: '/?city=essai-oyonnax', ville: 'essai-oyonnax',
      communeNom: 'Oyonnax', communeInsee: '01283', projectsCount: 12,
      stats: { sources: 38, verified: 12, precise: 12, illustrated: 8 },
    });
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await expect(page.locator('#done-detail')).toContainText('12 projets recensés');
    await expect(page.locator('#done-detail')).not.toContainText('sources publiques de votre commune');
  });

  /* Aucun projet documenté n'est pas une panne : ni bandeau rouge, ni croix, ni
     « Recommencer » qui rejouerait la même recherche pour le même résultat. */
  test('0.34.4 - une commune sans projet documenté rejoint l\'écran de fin', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, SANS_PROJET);
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await expect(page.locator('#done-card')).toHaveClass(/done--sans-espace/);
    // La loupe dit qu'on a cherché, la coche verte ne conviendrait pas ici
    await expect(page.locator('#embleme-loupe')).toBeVisible();
    await expect(page.locator('#embleme-carte')).toBeHidden();
    await expect(page.locator('#done-detail')).toContainText('ne documentent aujourd\'hui aucun projet');
    await expect(page.locator('#done-titre-apres')).toHaveText(' ne sont pas encore documentés en ligne');
    await expect(page.locator('#done-commune')).toHaveText('Oyonnax');
  });

  /* Sans espace généré, promettre un accès serait mentir. Et comme rien
     n'attend derrière l'adresse, la sortie reste offerte d'emblée. */
  test('0.34.5 - sans espace, ni accès ni QR code, mais une sortie toujours ouverte', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, SANS_PROJET);
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await expect(page.locator('#btn-open')).toBeHidden();
    await expect(page.locator('#qr-img')).toBeHidden();
    // L'adresse est demandée, pas exigée : le formulaire et la sortie coexistent
    await expect(page.locator('#lead-form')).toBeVisible();
    await expect(page.locator('#done-suite')).toBeVisible();
    await expect(page.locator('#btn-again')).toBeVisible();
    await expect(page.locator('#done-stats')).toBeHidden();
  });

  /**
   * Non-régression : une panne rendait au visiteur une vignette rouge et un
   * bouton « Recommencer » qui ne recommençait rien, puisqu'il ramenait à la
   * saisie. Elle lui propose désormais deux actions réelles.
   */
  test('0.34.6 - une panne technique propose une reprise et une adresse', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, { type: 'error', message: 'Brouillon incomplet : relancez la génération.' });
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await expect(page.locator('#embleme-reprise')).toBeVisible();
    await expect(page.locator('#done-titre-apres')).toHaveText(" s'est interrompu");
    // Le jargon du serveur reste dans la console, il ne s'affiche pas
    await expect(page.locator('#done-detail')).not.toContainText('Brouillon');
    await expect(page.locator('#done-detail')).toContainText("n'a pas pu terminer la carte");
    // Deux actions réelles, plus un bouton qui ramenait à la case départ
    await expect(page.locator('#lead-form')).toBeVisible();
    await expect(page.locator('#btn-regen')).toHaveText('Réessayer cette commune');
    await expect(page.locator('#btn-again')).toHaveText('Essayer une autre commune');
    await expect(page.locator('#btn-open')).toBeHidden();
  });

  test('0.34.8 - le quota du jour propose de recevoir la carte demain', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, { type: 'error', kind: 'quota', message: 'Le quota de démonstrations du jour est atteint.' });
    await expect(page.locator('#screen-done')).toHaveClass(/is-active/, { timeout: 15000 });
    await expect(page.locator('#embleme-demain')).toBeVisible();
    await expect(page.locator('#done-titre-apres')).toHaveText(' attendra demain');
    await expect(page.locator('#done-detail')).toContainText('demain matin');
    await expect(page.locator('#lead-form')).toBeVisible();
  });

  /**
   * Non-régression : sans nettoyage, la commune suivante héritait du titre, de
   * la loupe et des libellés de la commune sans projet.
   */
  test('0.34.7 - la commune suivante retrouve un écran neuf', async ({ page }) => {
    await lancerFlux(page);
    await envoyer(page, { type: 'notice', message: 'Deux projets seulement.' });
    await envoyer(page, SANS_PROJET);
    await expect(page.locator('#done-card')).toHaveClass(/done--sans-espace/);
    await page.locator('#btn-again').click();
    await expect(page.locator('#screen-input')).toHaveClass(/is-active/);
    await expect(page.locator('#done-card')).not.toHaveClass(/done--sans-espace/);
    /* L'écran de fin est masqué à cet instant : c'est donc l'attribut qui fait
       foi, pas la visibilité, qui serait fausse pour ses quatre emblèmes. */
    await expect(page.locator('#embleme-carte')).not.toHaveAttribute('hidden', '');
    await expect(page.locator('#embleme-loupe')).toHaveAttribute('hidden', '');
    await expect(page.locator('#btn-again')).toHaveText('Autre commune');
    await expect(page.locator('#hud-notice')).toBeHidden();
    await expect(page.locator('#done-titre-apres')).toHaveText(' est prête');
    await expect(page.locator('#lead-submit')).toHaveText('Accéder');
  });
});
