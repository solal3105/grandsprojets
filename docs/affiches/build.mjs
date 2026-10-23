// Fabrique les affiches imprimables : un PDF A4 vectoriel et un aperçu PNG.
// Usage : node docs/affiches/build.mjs
//
// Le QR code de chaque affiche est régénéré depuis son attribut data-qr et
// réécrit dans le HTML, qui reste ainsi lisible seul dans un navigateur.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import qrcode from '../../home-src/node_modules/qrcode-generator/dist/qrcode.mjs';

const dir = path.dirname(new URL(import.meta.url).pathname);

const AFFICHES = [
  { src: 'affiche-linkedin.html', out: 'Open-Projets-Affiche-LinkedIn' },
];

// Correction Q : l'adresse LinkedIn tient dans la même version 4 (33 modules)
// qu'en correction M, et le code supporte mieux reflets, pliures et salissures.
// Les modules sombres contigus d'une ligne forment un seul rectangle : pas de
// jointure visible entre deux carrés, quelle que soit la visionneuse PDF.
function qrSvg(url) {
  const qr = qrcode(0, 'Q');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const marge = 4; // zone de silence exigée par la norme, de chaque côté
  let d = '';
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c += 1; continue; }
      const debut = c;
      while (c < n && qr.isDark(r, c)) c += 1;
      d += `M${debut + marge} ${r + marge}h${c - debut}v1h-${c - debut}z`;
    }
  }
  const cote = n + marge * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${cote}" height="${cote}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

const browser = await chromium.launch();

for (const affiche of AFFICHES) {
  const src = path.join(dir, affiche.src);
  const html = await readFile(src, 'utf8');
  const url = html.match(/data-qr="([^"]+)"/)?.[1];
  if (!url) throw new Error(`${affiche.src} : attribut data-qr introuvable`);

  const avecQr = html.replace(/(<!-- qr:debut -->)[\s\S]*?(<!-- qr:fin -->)/, `$1${qrSvg(url)}$2`);
  if (avecQr !== html) await writeFile(src, avecQr);

  // 794 x 1123 pixels CSS = une page A4 ; la densité 2,5 donne un PNG d'environ 240 points par pouce.
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2.5 });
  const page = await context.newPage();
  await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  // Sans les polices de marque, l'affiche partirait en police système sans prévenir.
  const polices = await page.evaluate(async () => {
    await document.fonts.load('700 58pt "Space Grotesk"', 'Suivez');
    await document.fonts.load('400 16pt Inter', 'Vous');
    await document.fonts.ready;
    const chargee = (famille) => [...document.fonts].some((f) => f.family.replace(/"/g, '') === famille && f.status === 'loaded');
    return chargee('Space Grotesk') && chargee('Inter');
  });
  if (!polices) throw new Error('Polices Space Grotesk et Inter non chargées : la fabrication a besoin du réseau (Google Fonts).');

  await page.pdf({ path: path.join(dir, `${affiche.out}.pdf`), preferCSSPageSize: true, printBackground: true });
  await page.locator('.page').screenshot({ path: path.join(dir, `${affiche.out}.png`) });
  await context.close();
  console.log(`${affiche.out} : PDF et PNG écrits (QR vers ${url})`);
}

await browser.close();
