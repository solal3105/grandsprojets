// @ts-check
import { test, expect } from '@playwright/test';

/**
 * L'estimateur de prix de la refonte (/home2/tarification) : une page hors de
 * tout menu, dans une version du site en noindex. Les règles : prix de base
 * en puissance 0,5 de la population, un poids par module (chantiers à
 * demi-poids sous 5 000 habitants), une remise sur le module le plus cher dès
 * le deuxième, une remise d'engagement, une mise en service de six mois
 * (jamais offerte), et le total sur la durée mis en regard des seuils des
 * marchés publics. Grille validée par l'équipe commerciale le 9 septembre
 * 2026.
 *
 * Un visiteur voit une fourchette (plus ou moins 20 %, arrondie vers
 * l'extérieur) et demande le tarif exact en laissant son adresse : la demande
 * part par /api/tarif-lead, la fourchette reste. Seul `?commercial=1` ouvre le
 * tarif exact, pour l'équipe. Les tests qui vérifient des montants passent par
 * ce paramètre.
 *
 * /home2/ est un artefact de build (home-src `npm run build:v2`) qui n'est pas
 * versionné : sans lui, la section est passée, pas échouée.
 *
 * Section : 0.39 - L'estimateur de prix
 */

const PAGE = '/home2/tarification';

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

/* Le poids du module chantiers : la moitié sous 5 000 habitants, plein à
 * partir de 20 000, en pente logarithmique entre les deux */
const chantiers = (population) => {
  if (population <= 5000) return 1.5;
  if (population >= 20000) return 3;
  return 3 * (0.5 + 0.5 * (Math.log(population) - Math.log(5000)) / (Math.log(20000) - Math.log(5000)));
};

const nombreDe = (texte) => Number(String(texte).replace(/[^\d]/g, ''));

/* La fourchette telle que la page l'écrit : plus ou moins 20 %, le bas
 * arrondi vers le bas et le haut vers le haut, au pas du montant */
const fr = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
const fourchette = (v) => {
  const pas = v < 1000 ? 10 : v < 10000 ? 100 : v < 100000 ? 1000 : 10000;
  return `${fr(Math.floor((v * 0.8) / pas) * pas)} à ${fr(Math.ceil((v * 1.2) / pas) * pas)} €`;
};

test.describe('0.39 - L\'estimateur de prix', () => {
  test.beforeEach(async ({ request }) => {
    const r = await request.get('/home2/');
    test.skip(r.status() !== 200, 'la refonte /home2 n\'est pas construite ici');
  });

  test('0.39.0 - la page est ouverte aux moteurs, seule de la refonte, avec titre, description et canonical', async ({ request }) => {
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
    expect(html).toContain('<link rel="canonical" href="https://openprojets.com/home2/tarification">');
    expect(html).toContain('"@type":"BreadcrumbList"');
    // Le document d'estimation et le reste de la refonte restent cachés
    for (const path of [`${PAGE}/estimation?population=12000&modules=carte&annees=1`, '/home2/', '/home2/a-propos']) {
      const cache = await request.get(path);
      expect(await cache.text(), path).toMatch(/<meta\s+name="robots"\s+content="noindex, nofollow"/);
      expect(cache.headers()['x-robots-tag'] || '', path).not.toContain('index, follow');
    }
    // Et le plan du site la liste
    expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://openprojets.com/home2/tarification</loc>');
  });

  test('0.39.1 - la page est dans le menu et s\'ouvre sur une petite ville avec la carte seule', async ({ page }) => {
    await page.goto(`${PAGE}?commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Estimez le prix');
    // Le menu et le pied de page y mènent
    await expect(page.locator('header a[href="/home2/tarification"]').first()).toHaveText('Tarification');
    await expect(page.locator('footer a[href="/home2/tarification"]').first()).toHaveText('Tarification');
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
    await page.goto(`${PAGE}?population=50000&modules=carte,travaux,chantiers&annees=4&commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-population')).toHaveValue(/^50\D000$/);
    for (const cle of ['carte', 'travaux', 'chantiers']) {
      await expect(page.locator(`[data-module="${cle}"]`)).toHaveAttribute('aria-checked', 'true');
    }
    // Trois modules : -20 % sur le plus cher, les chantiers
    await expect(page.locator('[data-module="chantiers"]')).toContainText('-20 % sur le plus cher');
    const a = attendu({ population: 50000, poids: [1, 0.6, 3], annees: 4 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(a.mensuel));
    await expect.poll(() => page.locator('#tarif-setup').textContent().then(nombreDe)).toBe(Math.round(a.setup));
    await expect.poll(() => page.locator('#tarif-total').textContent().then(nombreDe)).toBe(Math.round(a.total));

    // Par an : l'abonnement affiché est douze fois le mensuel
    await page.getByRole('radio', { name: 'Par an', exact: true }).click();
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(a.annuel));

    // Retirer un module et raccourcir l'engagement : l'adresse suit, le prix aussi
    await page.locator('[data-module="chantiers"]').click();
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

    // Le module chantiers est à demi-poids pour un bourg
    await page.locator('#tarif-population').fill('3000');
    await page.locator('#tarif-population').press('Enter');
    await page.locator('[data-module="chantiers"]').click();
    const d = attendu({ population: 3000, poids: [1, 0.6, chantiers(3000)], annees: 1 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(d.annuel));
  });

  test('0.39.3 - le total sur la durée est mis en regard des seuils de la commande publique', async ({ page }) => {
    const tous = (p) => [1, 0.6, chantiers(p), 2, 0.8];
    // Une petite ville, la carte seule, un an : loin sous 60 000 € HT
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=1&commercial=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-seuil')).toContainText('sans publicité ni mise en concurrence');
    // Une ville moyenne, tous les modules, deux ans : entre 60 000 et 90 000 €, procédure adaptée
    await page.goto(`${PAGE}?population=50000&modules=carte,travaux,chantiers,participer,diagnostic&annees=2`, { waitUntil: 'domcontentloaded' });
    const a = attendu({ population: 50000, poids: tous(50000), annees: 2 });
    expect(a.total).toBeGreaterThan(60000);
    expect(a.total).toBeLessThan(90000);
    await expect(page.locator('#tarif-seuil')).toContainText('procédure adaptée');
    await expect(page.locator('#tarif-seuil')).not.toContainText('BOAMP');
    // Une grande ville sur quatre ans : la publicité devient obligatoire
    await page.goto(`${PAGE}?population=150000&modules=carte,travaux,chantiers,participer,diagnostic&annees=4`, { waitUntil: 'domcontentloaded' });
    const b = attendu({ population: 150000, poids: tous(150000), annees: 4 });
    expect(b.total).toBeGreaterThan(90000);
    expect(b.total).toBeLessThan(216000);
    await expect(page.locator('#tarif-seuil')).toContainText('BOAMP');
    // Une métropole sur quatre ans : au-delà du seuil européen, procédure formalisée
    await page.goto(`${PAGE}?population=500000&modules=carte,travaux,chantiers,participer,diagnostic&annees=4`, { waitUntil: 'domcontentloaded' });
    expect(attendu({ population: 500000, poids: tous(500000), annees: 4 }).total).toBeGreaterThan(216000);
    await expect(page.locator('#tarif-seuil')).toContainText('procédure formalisée');
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

  test('0.39.5 - un visiteur voit une fourchette, et sa demande de tarif part à l\'équipe sans rien déverrouiller', async ({ page }) => {
    const a = attendu({ population: 12000, poids: [1, 0.6], annees: 3 });

    // Le document : des fourchettes et leur mention
    await page.goto(`${PAGE}/estimation?population=12000&modules=carte,travaux&annees=3&collectivite=Ville%20de%20Trifouillis`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#estimation-fourchette')).toBeVisible();
    await expect(page.locator('#estimation-total')).toContainText(fourchette(a.total));
    await expect(page.locator('#estimation-abonnement')).toContainText(fourchette(a.mensuel));

    // La page : la fourchette de l'abonnement, le prix exact dedans, l'encart
    // de la mise en service, et le formulaire. Ni détail, ni total, ni seuils.
    await page.goto(`${PAGE}?population=12000&modules=carte,travaux&annees=3`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-principal')).toContainText(`de ${fourchette(a.mensuel)}`);
    const [bas, haut] = (await page.locator('#tarif-principal').textContent()).replace(/^de /, '').split(' à ').map(nombreDe);
    expect(bas).toBeLessThanOrEqual(a.mensuel);
    expect(haut).toBeGreaterThanOrEqual(a.mensuel);
    await expect(page.locator('#tarif-mise-en-service')).toContainText('Mise en service et formation des équipes');
    await expect(page.locator('#tarif-mise-en-service')).toContainText(fourchette(a.setup));
    for (const id of ['#tarif-abonnement', '#tarif-setup', '#tarif-total', '#tarif-seuil', '#estimation-form']) {
      await expect(page.locator(id)).toHaveCount(0);
    }
    expect(await page.locator('aside dl').count()).toBe(0);
    // Aucun prix par module, et la remise (portée par la carte, le plus cher
    // des deux) se nomme sans désigner ce module
    await expect(page.locator('[data-module="carte"]')).not.toContainText('€');
    await expect(page.locator('[data-module="travaux"]')).not.toContainText('€');
    await expect(page.locator('[data-module="carte"]')).toContainText('Remise multi-modules');
    await expect(page.locator('[data-module="carte"]')).not.toContainText('sur le plus cher');

    // La demande part à la fonction (simulée ici) avec l'adresse et les réglages du moment
    let recu = null;
    await page.route('**/api/tarif-lead', async (route) => {
      recu = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stored: true, mailed: true }) });
    });
    await page.locator('#tarif-exact-email').fill('dgs@trifouillis.fr');
    await page.locator('#tarif-exact-tel').fill('04 72 00 00 00');
    await page.locator('#tarif-exact-form button[type="submit"]').click();
    await expect(page.locator('#tarif-exact-merci')).toBeVisible();
    await expect(page.locator('#tarif-exact-merci')).toContainText('dgs@trifouillis.fr');
    await expect(page.locator('#tarif-exact-merci')).toContainText('message de confirmation');
    expect(recu).toEqual({ email: 'dgs@trifouillis.fr', telephone: '04 72 00 00 00', population: 12000, modules: ['carte', 'travaux'], annees: 3 });
    await expect(page.locator('#tarif-exact-form')).toHaveCount(0);

    // Rien ne s'est déverrouillé : la fourchette reste, ici comme sur le document
    await expect(page.locator('#tarif-principal')).toContainText(`de ${fourchette(a.mensuel)}`);
    await expect(page.locator('#tarif-abonnement')).toHaveCount(0);
    await page.goto(`${PAGE}/estimation?population=12000&modules=carte,travaux&annees=3`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#estimation-fourchette')).toBeVisible();
    await expect(page.locator('#estimation-total')).toContainText(fourchette(a.total));
  });

  test('0.39.5b - quand la demande ne part pas, la page le dit et garde le formulaire', async ({ page }) => {
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3`, { waitUntil: 'domcontentloaded' });
    await page.route('**/api/tarif-lead', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Demande impossible à enregistrer' }) }));
    await page.locator('#tarif-exact-email').fill('dgs@trifouillis.fr');
    await page.locator('#tarif-exact-form button[type="submit"]').click();
    await expect(page.locator('#tarif-exact-form [role="alert"]')).toContainText('pas pu envoyer');
    await expect(page.locator('#tarif-exact-merci')).toHaveCount(0);
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
    ];
    for (const data of essais) {
      const resp = await request.post('/api/tarif-lead', { data });
      expect(resp.status(), JSON.stringify(data)).toBe(400);
    }
    expect((await request.get('/api/tarif-lead')).status()).toBe(405);
  });

  test('0.39.6 - l\'équipe commerciale ouvre le tarif exact par ?commercial=1, qui disparaît de l\'adresse sans se transmettre', async ({ page, browser }) => {
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3&commercial=1`, { waitUntil: 'domcontentloaded' });
    const { mensuel } = attendu({ population: 12000, poids: [1], annees: 3 });
    await expect.poll(() => page.locator('#tarif-abonnement').textContent().then(nombreDe)).toBe(Math.round(mensuel));
    await expect(page.locator('#tarif-exact-form')).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain('commercial');
    await expect.poll(() => page.url()).toContain('population=12000');

    // Le lien copié depuis ce navigateur ramène un prospect à la fourchette
    const autre = await browser.newContext();
    const prospect = await autre.newPage();
    await prospect.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await expect(prospect.locator('#tarif-mise-en-service')).toBeVisible();
    await expect(prospect.locator('#tarif-principal')).toContainText(`de ${fourchette(mensuel)}`);
    await autre.close();

    // ?commercial=0 rend la vue publique dans le navigateur de l'équipe, et tient au rechargement
    await page.goto(`${PAGE}?population=12000&modules=carte&annees=3&commercial=0`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-mise-en-service')).toBeVisible();
    await expect.poll(() => page.url()).not.toContain('commercial');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tarif-mise-en-service')).toBeVisible();
    await expect(page.locator('#tarif-principal')).toContainText(`de ${fourchette(mensuel)}`);
    await expect(page.locator('#tarif-abonnement')).toHaveCount(0);
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
});
