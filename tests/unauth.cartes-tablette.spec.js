// @ts-check
import { test, expect } from '@playwright/test';

test.use({ hasTouch: true, reducedMotion: 'reduce' });

async function openKiosk(page, viewport) {
  await page.setViewportSize(viewport);
  // Les vues aériennes n'influencent pas les dimensions des contrôles.
  await page.route('**/data.geopf.fr/**', (route) => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path fill="#345" d="M0 0h10v10H0z"/></svg>',
  }));
  await page.goto('/cartes/?kiosk=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cartes);
  await page.evaluate(async () => {
    window.__cartes.arreter();
    await document.fonts.ready;
  });
}

for (const [width, height] of [[800, 480], [960, 600], [1280, 800], [600, 960], [800, 1280], [1920, 1080]]) {
  test(`0.39.1 - Le kiosque garde ses zones accessibles à ${width} x ${height}`, async ({ page }, testInfo) => {
    await openKiosk(page, { width, height });
    const longestCity = await page.evaluate(() => JSON.parse(document.getElementById('catalogue').textContent).villes
      .filter((city) => city.vitrine).sort((a, b) => b.nom.length - a.nom.length)[0]?.slug);
    for (const [scene, slug] of [['accueil'], ['ville'], ['ville', longestCity], ['comment']]) {
      await page.evaluate(({ type, slug }) => window.__cartes.montrer(type, slug), { type: scene, slug });
      await expect(page.locator(`#scene-${scene}`)).toHaveClass(/is-active/);
      // Attendre la fin du fondu : une scène transparente est encore présente
      // durant sa transition de visibilité, notamment en mouvement réduit.
      await expect.poll(() => page.locator('.scene:not(.is-active)').evaluateAll((scenes) =>
        scenes.every((element) => getComputedStyle(element).visibility === 'hidden'))).toBe(true);
      await page.locator(`#scene-${scene}`).evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true })
          .filter((animation) => animation.effect.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})));
      });
      const layout = await page.evaluate(() => {
        const rect = (element) => {
          const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        };
        const header = rect(document.querySelector('.entete'));
        const search = rect(document.getElementById('recherche'));
        const scene = document.querySelector('.scene.is-active');
        const input = document.getElementById('recherche-champ');
        const style = getComputedStyle(input);
        const canvas = document.createElement('canvas').getContext('2d');
        canvas.font = `${getComputedStyle(input, '::placeholder').fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return {
          header, search,
          inputSpace: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          placeholderWidth: canvas.measureText(input.placeholder).width,
          controls: [...document.querySelectorAll('.commandes button:not([hidden]), #recherche button')].map((button) => {
            const box = rect(button);
            return { id: button.id || button.textContent, ...box,
              accessible: button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)) };
          }),
          content: [...scene.querySelectorAll('.scene__texte, .tirage')].map(rect),
          logo: rect(document.querySelector('.entete__logo')),
          ribbon: rect(document.querySelector('.communes')),
        };
      });
      if ([960, 600].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`kiosk-${scene}${slug ? '-nom-long' : ''}-${width}.png`) });
      }
      for (const control of layout.controls) {
        expect.soft(control.accessible, `${scene} : ${control.id} reste cliquable`).toBe(true);
        expect.soft(control.width).toBeGreaterThanOrEqual(44);
        expect.soft(control.height).toBeGreaterThanOrEqual(44);
      }
      expect.soft(layout.placeholderWidth, `${scene} : le texte du champ tient en entier`).toBeLessThanOrEqual(layout.inputSpace);
      expect.soft(layout.logo.top).toBeGreaterThanOrEqual(0);
      expect.soft(layout.logo.bottom).toBeLessThanOrEqual(layout.header.bottom);
      expect.soft(layout.ribbon.bottom).toBeLessThanOrEqual(height);
      for (const box of layout.content) {
        expect.soft(box.top, `${scene} : le contenu reste sous l’en-tête`).toBeGreaterThanOrEqual(layout.header.bottom - 1);
        expect.soft(box.bottom, `${scene} : le contenu reste au-dessus de la recherche`).toBeLessThanOrEqual(layout.search.top + 1);
        expect.soft(box.left).toBeGreaterThanOrEqual(-1);
        expect.soft(box.right).toBeLessThanOrEqual(width + 1);
      }
    }
    await page.getByRole('button', { name: 'Passer en mode clair', exact: true }).tap();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Passer en mode sombre', exact: true }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#recherche-champ').tap();
    await expect(page.locator('#saisie')).toBeVisible();
    await expect(page.locator('#saisie-champ')).toBeFocused();
    await page.getByRole('button', { name: "Revenir à l'accueil", exact: true }).tap();
    await expect(page.locator('#saisie')).toBeHidden();
  });
}

test('0.39.2 - Le bouton de plein écran reste disponible pour revenir à la fenêtre', async ({ page }) => {
  // Le passage natif dépend du navigateur : on vérifie ici le contrat de l’API.
  await page.addInitScript(() => {
    let active = null;
    Object.defineProperty(document, 'fullscreenEnabled', { value: true });
    Object.defineProperty(document, 'fullscreenElement', { get: () => active });
    Element.prototype.requestFullscreen = async function () {
      active = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      active = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });
  await openKiosk(page, { width: 960, height: 600 });
  await page.getByRole('button', { name: 'Passer en plein écran', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Quitter le plein écran', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Quitter le plein écran', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Passer en plein écran', exact: true })).toBeVisible();
});
