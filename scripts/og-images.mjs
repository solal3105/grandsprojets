// Génère les images de partage (Open Graph) du site : une générale et une par
// module, en 1200 x 630, à partir des vraies captures du produit.
//   node scripts/og-images.mjs
// Sortie : home-src/public/img/og/*.jpg (servies sous /img/og/ après le build
// du site). Rendu par le Chromium de Playwright, polices Google Fonts.
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = resolve(ROOT, 'home-src/public')
const OUT = resolve(PUB, 'img/og')

const dataUrl = (rel) => {
  const buf = readFileSync(resolve(PUB, rel))
  const type = rel.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${type};base64,${buf.toString('base64')}`
}

// Même vocabulaire de formes que le site (SocleFormes.vue)
const etoile = Array.from({ length: 12 }, (_, i) => {
  const r = i % 2 === 0 ? 42 : 21
  const a = (Math.PI / 6) * i - Math.PI / 2
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`
}).join(' ')
const FORMES = {
  cercle: '<circle cx="50" cy="50" r="40"/>',
  barre: '<rect x="6" y="36" width="88" height="28" rx="14"/>',
  triangle: '<polygon points="50,14 88,80 12,80"/>',
  arche: '<path d="M12 78 A38 38 0 0 1 88 78 Z"/>',
  etoile: `<polygon points="${etoile}"/>`,
}
const forme = (f, cls) => `<svg class="${cls}" viewBox="0 0 100 100">${FORMES[f]}</svg>`

const MODULES = [
  {
    key: 'carte', name: 'Carte des projets urbains', forme: 'cercle', teinte: '#C4002A',
    side: 'Pour vos habitants',
    titre: 'Chaque projet de votre commune a sa fiche sur la carte',
    texte: 'Une carte à vos couleurs, consultée sans compte ni application.',
    capture: 'img/modules/carte.jpg',
  },
  {
    key: 'travaux', name: 'Travaux du quotidien', forme: 'barre', teinte: '#B45309',
    side: 'Pour vos habitants',
    titre: 'Les chantiers du quotidien, avec leurs dates',
    texte: "Sur une carte : les riverains savent ce qui se passe sans appeler la mairie.",
    capture: 'img/modules/travaux.jpg',
  },
  {
    key: 'participer', name: 'Signalement', forme: 'arche', teinte: '#1B5FA8',
    side: 'Pour vos habitants',
    titre: 'Vos habitants vous signalent un problème',
    texte: 'En deux minutes et sans compte. Vous décidez de ce qui devient public.',
    capture: 'img/modules/participer.jpg',
  },
  {
    key: 'chantiers', name: 'Chantiers et arrêtés', forme: 'triangle', teinte: '#0B7A4A',
    side: 'Pour vos services',
    titre: 'Les permissions de voirie et les arrêtés instruits en ligne',
    texte: "Les entreprises déposent, vos services instruisent dans un fil daté.",
    capture: 'img/chantiers/instruction.png',
  },
  {
    key: 'diagnostic', name: 'Diagnostic terrain', forme: 'etoile', teinte: '#7546CC',
    side: 'Pour vos services',
    titre: "Un secteur analysé par l'IA avant d'arbitrer",
    texte: 'Des constats appuyés sur les mots exacts de vos habitants.',
    capture: 'img/modules/diagnostic/zone.jpg', zoom: 'scale(1.16)', origine: '50% 62%',
  },
]

const LOGO = dataUrl('img/logos/classic_color.png')

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:Inter,sans-serif;color:#111;position:relative;
  background:
    radial-gradient(ellipse 70% 60% at 84% 10%, color-mix(in srgb, var(--t) 9%, transparent) 0%, transparent 62%),
    radial-gradient(ellipse 60% 55% at 8% 88%, color-mix(in srgb, var(--t) 6%, transparent) 0%, transparent 58%),
    linear-gradient(160deg,#FBFBFC 0%,#F6F7F9 45%,#FAF8F9 100%)}
h1{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-0.02em;line-height:1.06;color:#111}
.logo{height:62px;width:auto;display:block;align-self:flex-start}
.url{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:22px;color:#111}
.url span{color:var(--t)}
`

function moduleHtml(m) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=block" rel="stylesheet">
<style>${BASE_CSS}
body{--t:${m.teinte}}
.gauche{position:absolute;left:64px;top:56px;bottom:52px;width:500px;display:flex;flex-direction:column}
.pill{margin-top:44px;align-self:flex-start;display:inline-flex;align-items:center;gap:10px;
  color:var(--t);background:color-mix(in srgb,var(--t) 10%,white);border:1.5px solid color-mix(in srgb,var(--t) 30%,white);
  border-radius:999px;padding:8px 18px 8px 12px;font-weight:600;font-size:20px}
.pill svg{width:22px;height:22px;fill:var(--t);stroke:var(--t);stroke-width:12;stroke-linejoin:round}
h1{margin-top:22px;font-size:52px}
p{margin-top:20px;font-size:23px;line-height:1.4;color:#4A4A4A}
.url{margin-top:auto}
.socle{position:absolute;left:620px;top:70px;width:640px;height:500px;border-radius:32px;background:var(--t);overflow:hidden}
.socle svg{position:absolute;fill:rgba(255,255,255,.17);stroke:rgba(255,255,255,.17);stroke-width:12;stroke-linejoin:round}
.grande{top:-24%;right:-14%;width:76%}
.anneau{bottom:-16%;left:-9%;width:36%;fill:none!important}
.ecran{position:absolute;left:660px;top:128px;width:620px;border-radius:16px;overflow:hidden;
  box-shadow:0 30px 60px rgba(0,0,0,.28),0 0 0 6px rgba(255,255,255,.9)}
.ecran{height:388px}
.ecran img{display:block;width:100%;height:100%;object-fit:cover;object-position:left top}
.side{font-size:17px;font-weight:500;color:#666;margin-top:14px}
</style></head><body>
<div class="gauche">
  <img class="logo" src="${LOGO}" alt="">
  <span class="pill">${forme(m.forme, '')}${m.name}</span>
  <h1>${m.titre}</h1>
  <p>${m.texte}</p>
  <div class="url">openprojets.com<span>/${m.key}</span></div>
</div>
<div class="socle">${forme(m.forme, 'grande')}<svg class="anneau" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38"/></svg></div>
<div class="ecran"><img src="${dataUrl(m.capture)}" alt="" style="transform:${m.zoom || 'none'};transform-origin:${m.origine || '0 0'}"></div>
</body></html>`
}

function generalHtml() {
  const tuiles = MODULES.map((m) => `
  <div class="tuile" style="--t:${m.teinte}">
    <div class="vignette">${forme(m.forme, 'fond')}<img src="${dataUrl(m.capture)}" alt=""></div>
    <div class="nom">${forme(m.forme, 'mini')}${m.name}</div>
  </div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=block" rel="stylesheet">
<style>${BASE_CSS}
body{--t:#C4002A}
.haut{position:absolute;left:64px;right:64px;top:52px;display:flex;align-items:flex-start;justify-content:space-between}
h1{font-size:50px;max-width:820px}
.logo{height:56px;margin-top:6px}
.sous{position:absolute;left:64px;top:188px;font-size:22px;color:#4A4A4A}
.tuiles{position:absolute;left:64px;right:64px;top:252px;display:grid;grid-template-columns:repeat(5,1fr);gap:18px}
.vignette{position:relative;height:240px;border-radius:20px;background:var(--t);overflow:hidden}
.vignette .fond{position:absolute;top:-30%;right:-30%;width:110%;fill:rgba(255,255,255,.17);stroke:rgba(255,255,255,.17);stroke-width:12;stroke-linejoin:round}
.vignette img{position:absolute;left:18px;top:26px;height:230px;width:auto;border-radius:10px;
  box-shadow:0 14px 30px rgba(0,0,0,.28),0 0 0 4px rgba(255,255,255,.9)}
.nom{margin-top:14px;display:flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:19px;line-height:1.15;color:#111}
.nom .mini{flex:none;width:18px;height:18px;fill:var(--t);stroke:var(--t);stroke-width:12;stroke-linejoin:round}
.url{position:absolute;left:64px;bottom:40px}
</style></head><body>
<div class="haut"><h1>Tout ce qui se passe sur votre territoire tient sur une seule carte</h1><img class="logo" src="${LOGO}" alt=""></div>
<div class="sous">Cinq modules, vous n'activez que ce qui vous sert.</div>
<div class="tuiles">${tuiles}</div>
<div class="url">openprojets.com</div>
</body></html>`
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
const render = async (html, name) => {
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(OUT, `${name}.jpg`), type: 'jpeg', quality: 88 })
  console.log('img/og/' + name + '.jpg')
}
await render(generalHtml(), 'open-projets')
for (const m of MODULES) await render(moduleHtml(m), m.key)
await browser.close()
