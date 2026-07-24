// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Tests de non-régression sécurité - helpers d'échappement/URL de l'admin.
 *
 * Contexte : audit de sécurité (2026-07). Deux failles corrigées ici :
 *  - #4 (HIGH) : `esc()` n'échappait PAS les guillemets → breakout d'attribut
 *    (XSS stocké zéro-clic via cover_url : `x" onerror="…`).
 *  - #5/#11 (HIGH/MED) : `href`/`src` construits depuis la base sans filtrage de
 *    schéma → `javascript:` exécutable. `sanitizeUrl()` bloque désormais.
 *
 * Le module `admin/components/ui.js` est importé tel quel dans la page (son
 * top-level ne touche pas le DOM), donc on teste le code RÉELLEMENT livré.
 * Aucun accès base : ces assertions portent sur des fonctions pures.
 */

/** Charge les helpers depuis le module admin réel, dans le contexte navigateur. */
async function loadUi(page) {
  await page.goto('/admin/', { waitUntil: 'domcontentloaded' });
  return page.evaluate(async () => {
    const m = await import('/admin/components/ui.js');
    const { esc, escAttr, sanitizeUrl } = m;
    return {
      escDouble: esc('x" onerror="alert(1)'),
      escSingle: esc("a'b"),
      escAngleAmp: esc('<script>&'),
      escAttrDouble: escAttr('x" onerror="y'),
      imgHasBreakout: /onerror="/.test(`<img src="${esc('x" onerror="alert(1)')}" alt="">`),
      urlJs: sanitizeUrl('javascript:alert(1)'),
      urlJsCase: sanitizeUrl('JaVaScRiPt:alert(1)'),
      urlJsTrim: sanitizeUrl('  javascript:alert(1) '),
      urlData: sanitizeUrl('data:text/html,<script>x</script>'),
      urlHttps: sanitizeUrl('https://o.com/x?a=1&b=2'),
      urlRel: sanitizeUrl('/fiche/x'),
      urlMailto: sanitizeUrl('mailto:a@b.c'),
      urlEmpty: sanitizeUrl(''),
    };
  });
}

test.describe('0.6 - SecurityUtils admin (échappement + URL)', () => {
  // 0.6.1 - esc() échappe les guillemets (cœur du fix #4)
  test('0.6.1 esc() échappe " et \' (pas de breakout d\'attribut)', async ({ page }) => {
    const r = await loadUi(page);
    expect(r.escDouble).toBe('x&quot; onerror=&quot;alert(1)');
    expect(r.escSingle).toBe('a&#39;b');
    expect(r.escAngleAmp).toBe('&lt;script&gt;&amp;');
    expect(r.escAttrDouble).toBe('x&quot; onerror=&quot;y');
    // Preuve directe : plus aucun onerror=" injectable dans un <img src="…">
    expect(r.imgHasBreakout).toBe(false);
  });

  // 0.6.2 - sanitizeUrl() bloque les schémas dangereux
  test('0.6.2 sanitizeUrl() bloque javascript:/data: (fix #5/#11)', async ({ page }) => {
    const r = await loadUi(page);
    expect(r.urlJs).toBe('');
    expect(r.urlJsCase).toBe('');
    expect(r.urlJsTrim).toBe('');
    expect(r.urlData).toBe('');
  });

  // 0.6.3 - sanitizeUrl() préserve les URLs légitimes
  test('0.6.3 sanitizeUrl() garde http(s)/relatif/mailto', async ({ page }) => {
    const r = await loadUi(page);
    expect(r.urlHttps).toBe('https://o.com/x?a=1&b=2');
    expect(r.urlRel).toBe('/fiche/x');
    expect(r.urlMailto).toBe('mailto:a@b.c');
    expect(r.urlEmpty).toBe('');
  });
});
