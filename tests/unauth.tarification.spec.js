// @ts-check
import { test, expect } from '@playwright/test';

/**
 * L'estimateur de prix du site (/tarification) : une page hors de
 * tout menu, dans une version du site en noindex. Les règles : prix de base
 * en puissance 0,5 de la population, un poids par module, une remise sur le
 * module le plus cher dès le deuxième, une remise d'engagement, une mise en
 * service de six mois (jamais offerte), et le total sur la durée mis en
 * regard des seuils des marchés publics. Grille validée par l'équipe
 * commerciale le 9 septembre 2026.
 *
 * Chantiers a sa propre grille, par espace de travail : les routes du
 * gestionnaire au kilomètre, ajustées à la densité, et les arrêtés de chaque
 * commune selon sa population. Il se chiffre par un parcours en fenêtre,
 * sur les données publiques du territoire (simulées ici).
 *
 * Tout le monde voit les montants exacts. Un visiteur peut recevoir son
 * estimation par e-mail : la demande part par /api/tarif-lead. `?commercial=1`
 * n'ouvre plus que le document à préparer pour une collectivité.
 *
 * Section : 0.39 - L'estimateur de prix
 */

const PAGE = '/tarification';

/* Les mêmes règles que home-src/src/v2/data/tarification.mjs, recalculées ici
 * à la main : le test vérifie la page, pas le fichier qui la nourrit. */
function attendu({ population, poids, annees }) {
  const unite = 200 * (population / 12000) ** 0.5;
  const prix = poids.map((p) => unite * p);
  const brut = prix.reduce((s, p) => s + p, 0);
  const remiseModules = Math.max(...prix) * 0.1 * (poids.length - 1);
  const remiseEngagement = { 1: 0, 2: 0.1, 3: 0.15, 4: 0.2 }[annees];
  const mensuel = (brut - remiseModules) * (1 - remiseEngagement);
  const setup = mensuel * 6;
  return { mensuel, annuel: mensuel * 12, setup, total: setup + mensuel * 12 * annees };
}

/* La grille de Chantiers, recalculée à la main elle aussi : prix annuel des
 * routes au kilomètre par tranche, coefficient de densité en racine carrée
 * (arrondi au centième), arrêtés selon la population de chaque commune */
const baremeRoutes = (km) => [[25, 30], [100, 20], [500, 12], [2500, 8], [Infinity, 5]]
  .reduce(([total, bas], [haut, prix]) => [total + Math.max(0, Math.min(km, haut) - bas) * prix, haut], [0, 0])[0];
const densite = (habitants, km) => Math.round(Math.sqrt(habitants / km / 78.3) * 100) / 100;
const arretes = (population) => (population < 500 ? 100 : population < 2000 ? 200 : 400);

/* Le même calcul que attendu(), quand une ligne a un prix mensuel donné */
function attenduAvecPrix({ population, poids, prix, annees }) {
  const unite = 200 * (population / 12000) ** 0.5;
  const lignes = [...poids.map((p) => unite * p), ...prix];
  const brut = lignes.reduce((s, p) => s + p, 0);
  const remiseModules = Math.max(...lignes) * 0.1 * (lignes.length - 1);
  const remiseEngagement = { 1: 0, 2: 0.1, 3: 0.15, 4: 0.2 }[annees];
  const mensuel = (brut - remiseModules) * (1 - remiseEngagement);
  return { mensuel, setup: mensuel * 6 };
}

const nombreDe = (texte) => Number(String(texte).replace(/[^\d]/g, ''));

/* Un montant tel que la page l'écrit */
const fr = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

test.describe('0.39 - L\'estimateur de prix', () => {
  test('0.39.0 - la page est ouverte aux moteurs, avec titre, description et canonical', async ({ request }) => {
    const r = await request.get(PAGE);
    expect(r.status()).toBe(200);
    expect(r.headers()['x-robots-tag'] || '').toContain('index, follow');
    const html = await r.text();
    expect(html).toMatch(/<meta\s+name="robots"\s+content="index, follow"/);
    expect(html).not.toContain('noindex');
    const titre = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
    expect(titre).toContain('prix');
    expect(titre.length).toBeLessThanOrEqual(60);
    const desc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] || '';
    expect(desc.length).toBeGreaterThan(40);
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(html).toContain('<link rel="canonical" href="https://openprojets.com/tarification">');
    expect(html).toContain('"@type":"BreadcrumbList"');
    // Le document d'estimation reste caché, par l'en-tête (le HTML servi est
    // le squelette du site, la balise robots de la page vient du routeur)
    const cache = await request.get(`${PAGE}/estimation?population=12000&modules=carte&annees=1`);
    expect(cache.headers()['x-robots-tag'] || '').toContain('noindex');
    // Et le plan du site la liste
    expect(await (await request.get('/sitemap-pages.xml')).text()).toContain('<loc>https://openprojets.com/tarification</loc>');
  });

  test('0.39.1 - la page est dans le menu et s\'ouvre sur une petite ville avec la carte seule', async ({ page }) => {
    await page.goto(`${PAGE}?commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Estimez le prix');
    // Le menu et le pied de page y mènent
    await expect(page.locator('header a[href="/tarification"]').first()).toHaveText('Tarification');
    await expect(page.locator('footer a[href="/tarification"]').first()).toHaveText('Tarification');
    await expect(page.locator('#tarif-population')).toHaveValue(/^12\D000$/);
    await expect(page.locator('[data-module="carte"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-module="travaux"]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('[data-annees="3"]')).toHaveAttribute('aria-checked', 'true');
    // Un seul module : aucune remise multi-modules annoncée
    await expect(page.locator('[data-module="carte"]')).not.toContainText('sur le plus cher');
    const { mensuel } = attendu({ population: 12000, poids: [1], annees: 3 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(mensuel));
  });

  test('0.39.2 - les modules, l\'engagement et la population changent le prix selon les règles', async ({ page }) => {
    await page.goto(`${PAGE}?population=50000&modules=carte,travaux,participer&annees=4&commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-population')).toHaveValue(/^50\D000$/);
    for (const cle of ['carte', 'travaux', 'participer']) {
      await expect(page.locator(`[data-module="${cle}"]`)).toHaveAttribute('aria-checked', 'true');
    }
    // Trois modules : -20 % sur le plus cher, le signalement
    await expect(page.locator('[data-module="participer"]')).toContainText('-20 % sur le plus cher');
    const a = attendu({ population: 50000, poids: [1, 0.6, 2], annees: 4 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(a.mensuel));
    await expect.poll(() => page.locator('#tarif-setup').textContent().then(nombreDe)).toBe(Math.round(a.setup));
    await expect.poll(() => page.locator('#tarif-total').textContent().then(nombreDe)).toBe(Math.round(a.total));

    // Par an : l'abonnement affiché est douze fois le mensuel
    await page.getByRole('radio', { name: 'Par an', exact: true }).click();
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(a.annuel));

    // Retirer un module et raccourcir l'engagement : l'adresse suit, le prix aussi
    await page.locator('[data-module="participer"]').click();
    await page.locator('[data-annees="1"]').click();
    // La virgule ressort parfois encodée dans l'adresse : on la compare décodée
    const adresse = () => decodeURIComponent(page.url());
    await expect.poll(adresse).toMatch(/modules=carte,travaux(&|$)/);
    await expect.poll(adresse).toMatch(/annees=1(&|$)/);
    const b = attendu({ population: 50000, poids: [1, 0.6], annees: 1 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(b.annuel));

    // Une population tapée à la main est prise telle quelle, et même un
    // village paie la mise en service
    await page.locator('#tarif-population').fill('800');
    await page.locator('#tarif-population').press('Enter');
    await expect.poll(adresse).toMatch(/population=800(&|$)/);
    const c = attendu({ population: 800, poids: [1, 0.6], annees: 1 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(c.annuel));
    await expect.poll(() => page.locator('#tarif-setup').textContent().then(nombreDe)).toBe(Math.round(c.setup));
    await expect.poll(() => page.locator('#tarif-total').textContent().then(nombreDe)).toBe(Math.round(c.total));
  });

  test('0.39.3 - le total sur la durée est mis en regard des seuils de la commande publique', async ({ page }) => {
    const tous = [1, 0.6, 2, 0.8];
    // Une petite ville, la carte seule, un an : loin sous 60 000 € HT
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=1&commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-seuil')).toContainText('sans publicité ni mise en concurrence');
    // Une ville moyenne, quatre modules, quatre ans : entre 60 000 et 90 000 €, procédure adaptée
    await page.goto(`${PAGE}?population=50000&modules=carte,travaux,participer,diagnostic&annees=4`, { waitUntil: 'domcontentloaded' });
    const a = attendu({ population: 50000, poids: tous, annees: 4 });
    expect(a.total).toBeGreaterThan(60000);
    expect(a.total).toBeLessThan(90000);
    await expect(page.locator('#tarif-seuil')).toContainText('procédure adaptée');
    await expect(page.locator('#tarif-seuil')).not.toContainText('BOAMP');
    // Une grande ville sur quatre ans : la publicité devient obligatoire
    await page.goto(`${PAGE}?population=150000&modules=carte,travaux,participer,diagnostic&annees=4`, { waitUntil: 'domcontentloaded' });
    const b = attendu({ population: 150000, poids: tous, annees: 4 });
    expect(b.total).toBeGreaterThan(90000);
    expect(b.total).toBeLessThan(216000);
    await expect(page.locator('#tarif-seuil')).toContainText('BOAMP');
    // Une très grande ville sur quatre ans : au-delà du seuil européen, procédure formalisée
    await page.goto(`${PAGE}?population=1000000&modules=carte,travaux,participer,diagnostic&annees=4`, { waitUntil: 'domcontentloaded' });
    expect(attendu({ population: 1000000, poids: tous, annees: 4 }).total).toBeGreaterThan(216000);
    await expect(page.locator('#tarif-seuil')).toContainText('procédure formalisée');
  });

  test('0.39.3b - le référencement UGAP est annoncé dès l\'ouverture, expliqué, et proposé quand le total dépasse les seuils', async ({ page }) => {
    // Sous les seuils, l'encart n'en parle pas : il n'y a rien à éviter
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ugap h2')).toHaveText("La suite Open Projets est disponible au catalogue multi-éditeurs de l'UGAP");
    await expect(page.locator('#ugap img')).toHaveAttribute('alt', 'Éditeur référencé UGAP-SCC');
    await expect(page.locator('#ugap li')).toHaveCount(3);
    await expect(page.locator('#tarif-seuil a')).toHaveCount(0);
    // La mention de l'ouverture mène au bloc sans perdre les réglages
    await page.locator('#tarif-ugap-lien').click();
    await expect(page).toHaveURL(/population=12000.*#ugap$/);
    await expect(page.locator('#ugap')).toBeInViewport();
    // Au-delà des seuils, l'encart y renvoie aussi
    await page.goto(`${PAGE}?population=150000&modules=carte,travaux,participer,diagnostic&annees=4`, { waitUntil: 'domcontentloaded' });
    const lien = page.locator('#tarif-seuil a');
    await expect(lien).toContainText("Passer par l'UGAP vous en dispense");
    await lien.click();
    await expect(page).toHaveURL(/population=150000.*#ugap$/);
    await expect(page.locator('#ugap')).toBeInViewport();
  });

  test('0.39.3c - la page À propos range le référencement UGAP dans la fiche de VAZY et renvoie au bloc des tarifs', async ({ page }) => {
    await page.goto('/a-propos', { waitUntil: 'domcontentloaded' });
    const bloc = page.locator('#apropos-ugap');
    await expect(bloc).toContainText("VAZY est référencée dans le catalogue multi-éditeurs de l'UGAP.");
    await expect(bloc.locator('img')).toHaveAttribute('alt', 'Éditeur référencé UGAP-SCC');
    await bloc.locator('a').click();
    // L'estimateur pose ses réglages dans l'adresse sans perdre l'ancre
    await expect(page).toHaveURL(/\/tarification\?population=.*#ugap$/);
    await expect(page.locator('#ugap')).toBeInViewport();
  });

  test('0.39.4 - l\'estimation à envoyer est un document sans en-tête de site, avec le destinataire et notre numéro de suivi', async ({ page }) => {
    await page.goto(`${PAGE}?population=12000&modules=carte,travaux&annees=3&commercial=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('#estimation-form input[type="text"]').nth(0).fill('Ville de Trifouillis');
    await page.locator('#estimation-form input[type="text"]').nth(1).fill('Camille Dupont, DGS');
    await page.locator('#estimation-form input[type="text"]').nth(2).fill('EST-2026-042');
    await page.locator('#estimation-form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/tarification\/estimation\?/);
    await expect(page.locator('#estimation-collectivite')).toHaveText('Ville de Trifouillis');
    await expect(page.locator('#estimation-suivi')).toHaveText('EST-2026-042');
    await expect(page.locator('#estimation')).toContainText('Camille Dupont, DGS');
    await expect(page.locator('#estimation')).toContainText('non contractuel');
    // Le document porte les mêmes montants que l'estimateur
    const a = attendu({ population: 12000, poids: [1, 0.6], annees: 3 });
    await expect.poll(() => page.locator('#estimation-total').textContent().then(nombreDe)).toBe(Math.round(a.total));
    // Ni menu du site, ni pied de page : le document se suffit
    expect(await page.locator('header nav').count()).toBe(0);
    expect(await page.locator('footer a[href]').count()).toBe(0);
    // Le retour ramène à l'estimateur avec les mêmes réglages
    await page.getByRole('link', { name: 'Modifier l\'estimation' }).click();
    await expect(page).toHaveURL(/\/tarification\?.*population=12000/);
  });

  test('0.39.5 - un visiteur voit les montants exacts et reçoit son estimation par e-mail', async ({ page }) => {
    const a = attendu({ population: 12000, poids: [1, 0.6], annees: 3 });
    await page.goto(`${PAGE}?population=12000&modules=carte,travaux&annees=3&commercial=0`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(a.mensuel));
    await expect.poll(() => page.locator('#tarif-total').textContent().then(nombreDe)).toBe(Math.round(a.total));
    await expect(page.locator('[data-module="carte"]')).toContainText('sur le plus cher');
    // Le document à préparer reste un outil de l'équipe
    await expect(page.locator('#estimation-form')).toHaveCount(0);

    // La demande part à la fonction (simulée ici) avec l'adresse et les réglages du moment
    let recu = null;
    await page.route('**/api/tarif-lead', async (route) => {
      recu = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stored: true, mailed: true }) });
    });
    await page.locator('#tarif-envoi-email').fill('dgs@trifouillis.fr');
    await page.locator('#tarif-envoi-tel').fill('04 72 00 00 00');
    await page.locator('#tarif-envoi-form button[type="submit"]').click();
    await expect(page.locator('#tarif-envoi-merci')).toContainText('envoyé à dgs@trifouillis.fr');
    expect(recu).toEqual({ email: 'dgs@trifouillis.fr', telephone: '04 72 00 00 00', population: 12000, modules: ['carte', 'travaux'], annees: 3 });
    await expect(page.locator('#tarif-envoi-form')).toHaveCount(0);

    // Le document dit d'abord qu'il n'est pas un devis, puis donne les montants exacts
    await page.goto(`${PAGE}/estimation?population=12000&modules=carte,travaux&annees=3`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#estimation-avertissement')).toContainText('n\'est pas un devis et ne vous engage pas');
    await expect.poll(() => page.locator('#estimation-total').textContent().then(nombreDe)).toBe(Math.round(a.total));
  });

  test('0.39.5b - quand la demande ne part pas, la page le dit et garde le formulaire', async ({ page }) => {
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3`, { waitUntil: 'domcontentloaded' });
    await page.route('**/api/tarif-lead', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Demande impossible à enregistrer' }) }));
    await page.locator('#tarif-envoi-email').fill('dgs@trifouillis.fr');
    await page.locator('#tarif-envoi-form button[type="submit"]').click();
    await expect(page.locator('#tarif-envoi-form [role="alert"]')).toContainText('pas pu envoyer');
    await expect(page.locator('#tarif-envoi-merci')).toHaveCount(0);
  });

  test('0.39.8 - /api/tarif-lead refuse une adresse ou des réglages invalides', async ({ request }) => {
    const bon = { email: 'dgs@trifouillis.fr', telephone: '', population: 12000, modules: ['carte'], annees: 3 };
    const essais = [
      { ...bon, email: 'pas-une-adresse' },
      { ...bon, modules: ['inconnu'] },
      { ...bon, modules: [] },
      { ...bon, annees: 7 },
      { ...bon, population: 12 },
      { ...bon, telephone: 'appelez-moi' },
      // Chantiers arrive toujours avec le prix calculé par la page
      { ...bon, modules: ['carte', 'chantiers'] },
      { ...bon, modules: ['chantiers'], chantiers: { mensuel: 10000000 } },
      { ...bon, territoire: { cle: 'ville-de-nulle-part', nom: 'X' } },
    ];
    for (const data of essais) {
      const resp = await request.post('/api/tarif-lead', { data });
      expect(resp.status(), JSON.stringify(data)).toBe(400);
    }
    expect((await request.get('/api/tarif-lead')).status()).toBe(405);
  });

  test('0.39.6 - ?commercial=1 ouvre le document à préparer, disparaît de l\'adresse et ne se transmet pas', async ({ page, browser }) => {
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3&commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#estimation-form')).toBeVisible();
    await expect.poll(() => page.url()).not.toContain('commercial');
    await expect.poll(() => page.url()).toContain('population=12000');

    // Le lien copié depuis ce navigateur ne transporte pas le mode commercial
    const autre = await browser.newContext();
    const prospect = await autre.newPage();
    await prospect.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await expect(prospect.locator('#tarif-abonnement')).toBeVisible();
    await expect(prospect.locator('#estimation-form')).toHaveCount(0);
    await autre.close();

    // ?commercial=0 le retire dans le navigateur de l'équipe, et tient au rechargement
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3&commercial=0`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#estimation-form')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-abonnement')).toBeVisible();
    await expect(page.locator('#estimation-form')).toHaveCount(0);
  });

  test('0.39.7 - changer un réglage ne fait pas défiler la page', async ({ page }) => {
    await page.goto(`${PAGE}?commercial=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-annees="1"]').scrollIntoViewIfNeeded();
    const avant = await page.evaluate(() => window.scrollY);
    expect(avant).toBeGreaterThan(200);
    await page.locator('[data-annees="1"]').click();
    await expect.poll(() => decodeURIComponent(page.url())).toMatch(/annees=1(&|$)/);
    await page.waitForTimeout(600);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - avant)).toBeLessThan(40);
  });

  test('0.39.9 - Chantiers se chiffre par un parcours en fenêtre, sur les données publiques du territoire, et se reparamètre', async ({ page }) => {
    // Une communauté de deux communes, absente de BANATIC : la page doit demander
    const reponse = (route, corps) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
    await page.route('https://geo.api.gouv.fr/**', (route) => {
      const url = route.request().url();
      if (url.includes('/epcis?nom=')) return reponse(route, [{ nom: 'CC Essai', code: '200000001', population: 1900 }]);
      if (url.includes('/epcis/200000001/communes')) return reponse(route, [{ nom: 'Alpha', code: '01001', population: 1500 }, { nom: 'Beta', code: '01002', population: 400 }]);
      if (url.includes('/epcis/200000001')) return reponse(route, { nom: 'CC Essai', code: '200000001', type: 'CC' });
      return reponse(route, []);
    });
    await page.route('https://data.ofgl.fr/**', (route) => reponse(route, [{ code_insee: '01001', valeur: 30000 }, { code_insee: '01002', valeur: 12000 }]));

    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3&commercial=1`, { waitUntil: 'domcontentloaded' });
    // Les mesures envoyées à PostHog, relevées au passage (le module est éteint sous Playwright)
    await page.waitForFunction(() => !!window.OPAnalytics, null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__mesures = [];
      const capture = window.OPAnalytics.capture;
      window.OPAnalytics.capture = (evenement, proprietes) => { window.__mesures.push({ evenement, proprietes }); return capture(evenement, proprietes); };
    });
    const mesure = (evenement) => page.evaluate((e) => window.__mesures.filter((m) => m.evenement === e).map((m) => m.proprietes), evenement);
    // Cocher Chantiers ouvre le parcours, qui demande d'abord la collectivité
    await page.locator('[data-module="chantiers"]').click();
    const boite = page.getByRole('dialog');
    await expect(boite).toBeVisible();
    await expect(page.locator('[data-module="chantiers"]')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#parcours-territoire').fill('CC Essai');
    await page.locator('[data-territoire="epci-200000001"]').dispatchEvent('mousedown');

    // 1. Ce que l'on veut faire, et au nom de qui : sans réponse pré-remplie, il faut choisir
    await expect(boite).toContainText('Que voulez-vous faire dans l\'outil ?');
    await expect(boite.locator('[data-choix-usage="les-deux"]')).toHaveAttribute('aria-checked', 'true');
    await expect(boite.locator('[data-parcours="suivante"]')).toBeDisabled();
    await boite.locator('[data-nom="interco"]').click();
    await boite.locator('[data-parcours="suivante"]').click();
    // 2. Les kilomètres, lus dans les critères de la DGF : 30 + 12
    await expect(page.locator('#parcours-km')).toHaveValue('42');
    await boite.locator('[data-parcours="suivante"]').click();
    // 3. Les communes, toutes incluses d'office
    await expect(boite).toContainText('2 sur 2 communes');
    await boite.locator('[data-parcours="suivante"]').click();
    // Le prix, avec son calcul : un territoire peu dense a sa réduction en pourcentage
    await expect(boite).toContainText('Permissions de voirie : 42 km de routes');
    await expect(boite).toContainText(`Territoire peu dense : -${Math.round((1 - densite(1900, 42)) * 100)} %`);
    const routes = baremeRoutes(42) * densite(1900, 42);
    const annuel = routes + arretes(1500) + arretes(400);
    await expect(boite).toContainText(fr(Math.round(annuel)));
    await boite.locator('[data-parcours="valider"]').click();
    await expect(boite).toHaveCount(0);

    // Le module est coché, son prix et son calcul sont sur la page
    await expect(page.locator('[data-module="chantiers"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#tarif-territoire')).toContainText('CC Essai');
    await expect.poll(() => decodeURIComponent(page.url())).toMatch(/territoire=epci-200000001.*nom=interco/);
    const a = attenduAvecPrix({ population: 1900, poids: [1], prix: [annuel / 12], annees: 3 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(a.mensuel));

    // Ce que la page a mesuré : l'ouverture du parcours, la collectivité, la configuration, puis l'état réglé
    expect((await mesure('pricing_chantiers_wizard_opened'))[0]).toMatchObject({ trigger: 'module_checked' });
    expect((await mesure('pricing_territory_selected'))[0]).toMatchObject({ territory_key: 'epci-200000001', population: 1900, source: 'wizard' });
    expect((await mesure('pricing_chantiers_configured'))[0]).toMatchObject({ usage: 'both', subscriber: 'interco', annual_price: Math.round(annuel) });
    await expect.poll(async () => (await mesure('pricing_settings_changed')).at(-1)?.modules, { timeout: 5000 }).toEqual(['carte', 'chantiers']);

    // Les permissions seules : la première question les choisit, les communes ne sont plus demandées
    await page.locator('#tarif-chantiers-parametrer').click();
    await boite.locator('[data-choix-usage="permissions"]').click();
    await boite.locator('[data-parcours="suivante"]').click();
    await boite.locator('[data-parcours="suivante"]').click();
    await boite.locator('[data-parcours="valider"]').click();
    await expect.poll(() => decodeURIComponent(page.url())).toMatch(/usage=permissions/);
    const seules = attenduAvecPrix({ population: 1900, poids: [1], prix: [routes / 12], annees: 3 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(seules.mensuel));

    // « Paramétrer » rouvre le parcours sur les réponses données
    await page.locator('#tarif-chantiers-parametrer').click();
    await expect(boite.locator('[data-nom="interco"]')).toHaveAttribute('aria-checked', 'true');
    await expect(boite.locator('[data-choix-usage="permissions"]')).toHaveAttribute('aria-checked', 'true');
    // Les deux usages, chaque commune abonnée : un espace par commune, plus de question des kilomètres
    await boite.locator('[data-choix-usage="les-deux"]').click();
    await boite.locator('[data-nom="communes"]').click();
    await boite.locator('[data-parcours="suivante"]').click();
    await expect(boite).toContainText('Quelles communes s\'équipent ?');
    await boite.locator('[data-parcours="suivante"]').click();
    await boite.locator('[data-parcours="valider"]').click();
    const parCommune = baremeRoutes(30) * densite(1500, 30) + arretes(1500) + baremeRoutes(12) * densite(400, 12) + arretes(400);
    const b = attenduAvecPrix({ population: 1900, poids: [1], prix: [parCommune / 12], annees: 3 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(b.mensuel));
    await expect(page.locator('[data-module="chantiers"]')).toContainText('2 espaces, un par commune');
  });
});
