// @ts-check
import { test, expect } from '@playwright/test';
import {
  escHtml, escAttr, truncate, humanize, stripMarkdown,
  safeUrl, absUrl, safeHexColor, isValidCityCode, fetchRows,
  BASE_ORIGIN,
} from '../netlify/edge-functions/_lib/seo.js';

/**
 * Socle d'échappement du pré-rendu SEO (fiche-ssr, ville-hub, home-seo).
 *
 * Ces fonctions n'avaient aucun test : elles tournent en Deno, hors de portée
 * de la couverture V8 de Node. Elles sont pourtant le point le plus exposé du
 * dépôt, puisque leur sortie est du HTML servi côté serveur, sans JavaScript,
 * et indexé. Le fichier n'utilise aucun global Deno : Node l'importe tel quel.
 */

/** Charges utiles hostiles, réutilisées d'un bloc à l'autre. */
const PIEGES = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "' onmouseover='alert(1)",
  '</title><meta http-equiv=refresh content=0>',
  '&lt;deja&gt;',
];

test.describe('0.46 - SEO : échappement HTML', () => {

  test('0.46.1 - escHtml neutralise les cinq caractères dangereux', async () => {
    expect(escHtml('<a href="x">&\'</a>'))
      .toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#x27;&lt;/a&gt;');
  });

  test("0.46.2 - RÉGRESSION : l'apostrophe est échappée", async () => {
    // Sans elle, un attribut délimité par des apostrophes se laisse casser.
    expect(escHtml("' onmouseover='alert(1)")).not.toContain("'");
    expect(escHtml("x'y")).toBe('x&#x27;y');
  });

  test('0.46.3 - escAttr applique exactement la même règle que escHtml', async () => {
    for (const p of PIEGES) expect(escAttr(p)).toBe(escHtml(p));
  });

  test('0.46.4 - Aucune charge hostile ne laisse de chevron ni de guillemet', async () => {
    for (const p of PIEGES) {
      const out = escHtml(p);
      expect(out, p).not.toMatch(/[<>"']/);
    }
  });

  test('0.46.5 - Les valeurs vides donnent une chaîne, jamais "null"', async () => {
    for (const v of [null, undefined, '', 0, false, NaN]) {
      expect(escHtml(v)).toBe('');
      expect(escAttr(v)).toBe('');
    }
  });

  test('0.46.6 - Un texte déjà échappé est ré-échappé, jamais dés-échappé', async () => {
    // Le rendu appelle escHtml une seule fois par sink : ce test fige la règle,
    // un double appel produirait &amp;lt; et se verrait à l'écran.
    expect(escHtml('&lt;a&gt;')).toBe('&amp;lt;a&amp;gt;');
  });

});

test.describe('0.47 - SEO : gardes sur les URLs et les couleurs', () => {

  test('0.47.1 - safeUrl laisse passer les schémas attendus', async () => {
    expect(safeUrl('https://openprojets.com/x')).toBe('https://openprojets.com/x');
    expect(safeUrl('http://exemple.fr')).toBe('http://exemple.fr');
    expect(safeUrl('mailto:contact@exemple.fr')).toBe('mailto:contact@exemple.fr');
    expect(safeUrl('#ancre')).toBe('#ancre');
    expect(safeUrl('/fiche/lyon/mobilite/t9')).toBe('/fiche/lyon/mobilite/t9');
    expect(safeUrl('  https://exemple.fr  ')).toBe('https://exemple.fr');
  });

  test('0.47.2 - safeUrl bloque tout ce qui exécute du code', async () => {
    const dangereux = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'jav\tascript:alert(1)',
      'jav\nascript:alert(1)',
    ];
    for (const u of dangereux) expect(safeUrl(u), u).toBe('');
  });

  test("0.47.3 - safeUrl bloque les URLs relatives au protocole (//hôte)", async () => {
    // `//evil.example` hérite du schéma de la page et sort du site sans le dire.
    for (const u of ['//evil.example', '/\\evil.example', '//evil.example/x', '/\\\\evil.example']) {
      expect(safeUrl(u), u).toBe('');
    }
  });

  test('0.47.4 - safeUrl rend une chaîne pour toute entrée absurde', async () => {
    for (const v of [null, undefined, 0, false, {}, [], NaN]) {
      expect(typeof safeUrl(v)).toBe('string');
    }
  });

  test('0.47.5 - absUrl ne rend que du http(s) absolu ou rien', async () => {
    expect(absUrl('/img/x.png')).toBe(`${BASE_ORIGIN}/img/x.png`);
    expect(absUrl('https://cdn.exemple.fr/x.png')).toBe('https://cdn.exemple.fr/x.png');
    // og:image n'a de sens qu'en absolu : le reste doit disparaître
    for (const u of ['mailto:x@y.fr', '#ancre', 'javascript:alert(1)', '//evil.example', '']) {
      const out = absUrl(u);
      expect(out === '' || /^https?:\/\//i.test(out), `${u} -> ${out}`).toBe(true);
    }
  });

  test('0.47.6 - safeHexColor ne rend jamais autre chose qu\'un hexa à 6 chiffres', async () => {
    // Cette valeur est injectée SANS échappement dans un attribut style=
    // (ville-hub renderCard). C'est la validation qui tient lieu de garde.
    expect(safeHexColor('#14AE5C')).toBe('#14AE5C');
    expect(safeHexColor('#14ae5c')).toBe('#14ae5c');
    expect(safeHexColor('  #FF0037  ')).toBe('#FF0037');
    const refuses = [
      '#FFF', '#14AE5', '#14AE5CC', 'red', 'rgb(1,2,3)', '14AE5C',
      '#14AE5C;background:url(javascript:alert(1))',
      '#14AE5C" onload="alert(1)',
      'var(--x)', null, undefined, 0, {},
    ];
    for (const c of refuses) expect(safeHexColor(c), String(c)).toBe('');
    for (const c of [...refuses, '#14AE5C', '#abcdef']) {
      const out = safeHexColor(c);
      expect(out === '' || /^#[0-9A-Fa-f]{6}$/.test(out), `${c} -> ${out}`).toBe(true);
    }
  });

});

test.describe('0.48 - SEO : mise en forme du texte', () => {

  test('0.48.1 - truncate coupe sur un mot et ajoute une ellipse', async () => {
    expect(truncate('court', 100)).toBe('court');
    const long = 'Le tramway T9 reliera Vaulx-en-Velin a La Doua en desservant huit stations nouvelles';
    const out = truncate(long, 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith('…')).toBe(true);
    // Coupure sur un espace : pas de mot tronqué en plein milieu
    expect(out.slice(0, -1).endsWith(' ')).toBe(false);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
  });

  test('0.48.2 - truncate coupe net quand aucun espace ne précède la limite', async () => {
    const sansEspace = 'a'.repeat(60);
    expect(truncate(sansEspace, 20)).toBe(`${'a'.repeat(20)}…`);
  });

  test('0.48.3 - truncate rend une chaîne sur une entrée vide', async () => {
    for (const v of [null, undefined, '']) expect(truncate(v, 50)).toBe('');
  });

  test('0.48.4 - humanize transforme un slug en libellé', async () => {
    expect(humanize('sport-culture')).toBe('Sport Culture');
    expect(humanize('mobilite')).toBe('Mobilite');
    expect(humanize('')).toBe('');
    expect(humanize(null)).toBe('');
  });

  test('0.48.5 - stripMarkdown retire les marqueurs et garde le texte', async () => {
    const md = [
      '# Titre',
      '',
      'Un **projet** _majeur_ avec un [lien](https://x.fr) et une ![image](https://y.fr/i.png).',
      '',
      '> Une citation',
      '- premier point',
      '- second point',
      '',
      'Du `code inline` aussi.',
    ].join('\n');
    const out = stripMarkdown(md);
    expect(out).toContain('Un projet majeur');
    expect(out).toContain('avec un lien et une');
    expect(out).toContain('Une citation');
    expect(out).toContain('premier point');
    expect(out).not.toMatch(/[#*_`>]/);
    expect(out).not.toContain('https://');
    // Espaces normalisés : une meta description ne contient pas de retour ligne
    expect(out).not.toMatch(/\n|\s{2,}/);
  });

  test("0.48.6 - stripMarkdown ne désarme PAS le HTML, l'appelant doit échapper", async () => {
    // Fige le contrat : la protection vient de escHtml au point d'injection,
    // pas d'ici. Tous les sinks du rendu composent escHtml(stripMarkdown(x)).
    const out = stripMarkdown('<img src=x onerror=alert(1)>');
    expect(out).toContain('<img');
    expect(escHtml(out)).not.toMatch(/[<>]/);
  });

  test('0.48.7 - stripMarkdown rend une chaîne sur une entrée vide', async () => {
    for (const v of [null, undefined, '']) expect(stripMarkdown(v)).toBe('');
  });

});

test.describe('0.49 - SEO : code ville et accès PostgREST', () => {

  test('0.49.1 - isValidCityCode applique la règle attendue', async () => {
    for (const ok of ['lyon', 'metropole-lyon', 'test-e2e', 'ABC', 'ville123', '  lyon  ']) {
      expect(isValidCityCode(ok), ok).toBe(true);
    }
    for (const ko of ['', '   ', 'lyon/../etc', 'lyon;drop', 'lyon lyon', 'lyon.', null, undefined, 'métropole']) {
      expect(isValidCityCode(ko), String(ko)).toBe(false);
    }
  });

  test('0.49.2 - La règle serveur et la règle navigateur ne divergent pas', async ({ page }) => {
    // Le commentaire du fichier annonce « même règle que SecurityUtils » :
    // ce test le vérifie au lieu de le croire.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SecurityUtils?.isValidCityCode, null, { timeout: 15000 });
    const corpus = [
      'lyon', 'metropole-lyon', 'ABC', 'a', '1', '-', 'a-b-c',
      '', '   ', ' lyon ', 'lyon/x', 'lyon;x', 'lyon x', 'lyon.', 'lyon_x',
      'métropole', 'LYON', '../etc/passwd', 'a'.repeat(200),
    ];
    const navigateur = await page.evaluate(
      (liste) => liste.map((c) => window.SecurityUtils.isValidCityCode(c)),
      corpus,
    );
    const serveur = corpus.map((c) => isValidCityCode(c));
    expect(serveur).toEqual(navigateur);
  });

  test('0.49.3 - fetchRows construit la requête PostgREST attendue', async () => {
    const vues = [];
    const vrai = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      vues.push({ url: String(url), headers: init?.headers });
      return { ok: true, json: async () => [{ id: 1 }] };
    };
    try {
      const rows = await fetchRows('city_projects', { select: 'id,name', ville: 'eq.lyon', limit: '5' });
      expect(rows).toEqual([{ id: 1 }]);
      const u = new URL(vues[0].url);
      expect(u.pathname).toBe('/rest/v1/city_projects');
      expect(u.searchParams.get('select')).toBe('id,name');
      expect(u.searchParams.get('ville')).toBe('eq.lyon');
      expect(u.searchParams.get('limit')).toBe('5');
      expect(vues[0].headers.apikey).toBeTruthy();
      expect(vues[0].headers.Authorization).toMatch(/^Bearer /);
    } finally {
      globalThis.fetch = vrai;
    }
  });

  test('0.49.4 - fetchRows dégrade en tableau vide au lieu de faire échouer le rendu', async () => {
    const vrai = globalThis.fetch;
    const cas = [
      { ok: false, json: async () => ({ message: 'RLS' }) },
      { ok: true, json: async () => ({ pas: 'un tableau' }) },
      { ok: true, json: async () => null },
    ];
    try {
      for (const reponse of cas) {
        globalThis.fetch = async () => reponse;
        expect(await fetchRows('city_projects', { select: '*' })).toEqual([]);
      }
    } finally {
      globalThis.fetch = vrai;
    }
  });

});
