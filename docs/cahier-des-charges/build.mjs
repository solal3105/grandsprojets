// Rend le cahier des charges fonctionnel en PDF A4.
// Usage : node docs/cahier-des-charges/build.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(dir, 'cahier-des-charges-fonctionnel.html');
const out = path.join(dir, 'Open-Projets-Cahier-des-charges-fonctionnel.pdf');

const foot = (align, html) =>
  `<span style="flex:1;text-align:${align}">${html}</span>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });

await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  margin: { top: '17mm', bottom: '18mm', left: '20mm', right: '20mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#9A9FA8;
      padding:0 20mm;display:flex;align-items:center">
      ${foot('left', 'Open Projets &middot; Cahier des charges fonctionnel')}
      ${foot('right', '<span class="pageNumber"></span>')}
    </div>`,
});

await browser.close();
console.log('PDF ecrit :', out);
