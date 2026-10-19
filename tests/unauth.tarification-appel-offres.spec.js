// @ts-check
import { test, expect } from '@playwright/test';

/**
 * L'estimateur pour un candidat à un appel d'offres
 * (/tarification/appel-offres) : la grille de /tarification, avec le montant
 * estimé du marché à la place du nombre d'habitants, à raison de 12 000
 * habitants pour un million d'euros HT. Poids des modules, remise sur le plus
 * cher, remise sur la durée et mise en service de six mois sont ceux des
 * collectivités. Une journée de formation est comprise, chaque journée en
 * plus coûte 800 € HT, hors des remises. Chantiers n'y figure pas. Page hors
 * des moteurs, hors menu.
 *
 * Section : 0.86 - L'estimateur pour les appels d'offres
 */

const PAGE = '/tarification/appel-offres';

/* Les règles de home-src/src/v2/data/tarification.mjs, recalculées à la main :
 * le test vérifie la page, pas le fichier qui la nourrit. */
function attendu({ montant, poids, annees, jours = 0 }) {
  const population = montant * 0.012;
  const unite = 200 * (population / 12000) ** 0.5;
  const prix = poids.map((p) => unite * p);
  const brut = prix.reduce((s, p) => s + p, 0);
  const remiseModules = Math.max(...prix) * 0.1 * (poids.length - 1);
  const remiseDuree = { 1: 0, 2: 0.1, 3: 0.15, 4: 0.2 }[annees];
  const mensuel = (brut - remiseModules) * (1 - remiseDuree);
  return { mensuel, total: mensuel * 6 + mensuel * 12 * annees + jours * 800 };
}

const nombreDe = (texte) => Number(String(texte).replace(/[^\d]/g, ''));

test.describe('0.86 - L\'estimateur pour les appels d\'offres', () => {
  test('0.86.1 - la page est hors des moteurs et s\'ouvre sur un marché d\'un million, carte et travaux, deux ans', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('appel d\'offres');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('#marche-montant')).toHaveValue(/^1\D000\D000$/);
    await expect(page.locator('[data-module="carte"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-module="travaux"]')).toHaveAttribute('aria-checked', 'true');
    // Chantiers se paie par le gestionnaire des routes : il n'est pas proposé
    await expect(page.locator('[data-module="chantiers"]')).toHaveCount(0);
    const { mensuel, total } = attendu({ montant: 1000000, poids: [1, 0.6], annees: 2 });
    await expect.poll(() => page.locator('#marche-mensuel').textContent().then(nombreDe)).toBe(Math.round(mensuel));
    await expect.poll(() => page.locator('#marche-total').textContent().then(nombreDe)).toBe(Math.round(total));
  });

  test('0.86.2 - le montant, les modules et la durée changent le prix selon la grille des collectivités', async ({ page }) => {
    await page.goto(`${PAGE}?montant=80000000&modules=carte,travaux,participer&annees=4`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#marche-montant')).toHaveValue(/^80\D000\D000$/);
    let att = attendu({ montant: 80000000, poids: [1, 0.6, 2], annees: 4 });
    await expect.poll(() => page.locator('#marche-mensuel').textContent().then(nombreDe)).toBe(Math.round(att.mensuel));
    await expect(page.locator('[data-module="participer"]')).toContainText('-20 % sur le plus cher');

    // Un montant tapé au clavier, puis un module retiré et une durée plus courte
    await page.locator('#marche-montant').fill('250000');
    await page.locator('#marche-montant').press('Enter');
    await page.locator('[data-module="participer"]').click();
    await page.locator('[data-annees="1"]').click();
    att = attendu({ montant: 250000, poids: [1, 0.6], annees: 1 });
    await expect.poll(() => page.locator('#marche-total').textContent().then(nombreDe)).toBe(Math.round(att.total));
    // L'adresse porte le chiffrage : il se partage en copiant le lien
    await expect(page).toHaveURL(/montant=250000&modules=carte(,|%2C)travaux&annees=1/);
  });

  test('0.86.3 - une journée de formation est comprise, chaque journée en plus ajoute 800 € au total', async ({ page }) => {
    await page.goto(`${PAGE}?montant=1000000&modules=carte,travaux&annees=2`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#marche-formation-jours')).toHaveText('0');
    await expect(page.locator('#marche-formation-moins')).toBeDisabled();
    await expect(page.locator('aside')).toContainText('Une journée de formation');
    await expect(page.locator('#marche-formation')).toHaveCount(0);

    await page.locator('#marche-formation-plus').click();
    await page.locator('#marche-formation-plus').click();
    await expect(page.locator('#marche-formation-jours')).toHaveText('2');
    await expect.poll(() => page.locator('#marche-formation').textContent().then(nombreDe)).toBe(1600);
    const att = attendu({ montant: 1000000, poids: [1, 0.6], annees: 2, jours: 2 });
    await expect.poll(() => page.locator('#marche-total').textContent().then(nombreDe)).toBe(Math.round(att.total));
    // Le nombre de journées voyage dans l'adresse
    await expect(page).toHaveURL(/formation=2/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#marche-formation-jours')).toHaveText('2');
  });
});
