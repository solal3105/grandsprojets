/* ============================================================================
   PRERENDER POST-BUILD - pages du site vitrine

   Après `vite build`, rend chaque page publique dans un Chromium headless et
   écrit le HTML complet dans /home/<page>.html. Netlify sert ces fichiers
   (règles de _redirects) avant le fallback SPA, ce qui donne aux crawlers
   (Google, mais surtout GPTBot/ClaudeBot/PerplexityBot qui ne rendent pas le
   JavaScript) un contenu texte complet dès le premier octet.

   Génère aussi /home/ressources/manifest.json (slug + metas des guides),
   consommé par l'edge function home-seo et par la fonction sitemap.

   Les requêtes externes (fonts, analytics, Supabase) sont bloquées pendant le
   rendu : le snapshot est déterministe et aucun hit analytics n'est émis.

   Échappatoire : SKIP_PRERENDER=1 npm run build (débogage uniquement).
   ============================================================================ */

import { createServer } from 'node:http'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { resolve, dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const HOME_DIR = resolve(REPO_ROOT, 'home')
const CONTENT_DIR = resolve(__dirname, '../src/content/ressources')

// Pages statiques à prerendre. Hors liste, donc servies par le fallback SPA :
// /helios, /aide/guide-* et /tarification/estimation (noindex), les
// redirections (/contact, /fonctionnalites, /tarifs, /modules).
const STATIC_ROUTES = [
  '/',
  '/carte',
  '/travaux',
  '/participer',
  '/diagnostic',
  '/chantiers',
  '/tarification',
  '/a-propos',
  '/aide',
  '/confidentialite',
  '/alternative-panneaupocket',
  '/alternative-cityall-lumiplan',
  '/alternative-neocity',
  '/ressources',
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
}

/* ─── Frontmatter des guides Ressources ─── */

function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  const meta = {}
  if (!m) return meta
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return meta
}

async function readArticles() {
  let files = []
  try {
    files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith('.md'))
  } catch {
    return [] // pas encore de contenu : rien à faire
  }
  const articles = []
  for (const file of files) {
    const src = await readFile(join(CONTENT_DIR, file), 'utf8')
    const meta = parseFrontmatter(src)
    articles.push({
      slug: file.replace(/\.md$/, ''),
      title: meta.title || '',
      description: meta.description || '',
      date: meta.date || '',
      updated: meta.updated || meta.date || '',
      tag: meta.tag || '',
      readingTime: meta.readingTime || '',
    })
  }
  articles.sort((a, b) => (a.date < b.date ? 1 : -1))
  return articles
}

/* ─── Serveur statique local : les mêmes règles que _redirects ───
   La racine du dépôt d'abord (images, modules), puis le dossier du build
   (/assets, /img, /audio), puis le fallback SPA sur l'index du build. */

function startServer() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    // La racine du dépôt porte l'index.html de la carte : `/` est le site,
    // jamais ce fichier (même règle forcée que dans _redirects)
    const candidates = pathname === '/' ? [] : [
      join(REPO_ROOT, pathname),
      join(REPO_ROOT, pathname, 'index.html'),
      join(HOME_DIR, pathname),
    ]
    for (const file of candidates) {
      // Un dossier n'est pas un fichier servable : readFile échoue, on passe
      try {
        const body = await readFile(file)
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
        return res.end(body)
      } catch { /* candidat suivant */ }
    }
    const body = await readFile(join(HOME_DIR, 'index.html'))
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    return res.end(body)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

/* ─── Chromium (installe le navigateur au premier run CI, cache ensuite) ─── */

async function launchChromium() {
  const { chromium } = await import('playwright')
  try {
    return await chromium.launch()
  } catch {
    console.log('[prerender] Chromium absent, installation...')
    execSync('npx playwright install chromium', { stdio: 'inherit', cwd: resolve(__dirname, '..') })
    return await chromium.launch()
  }
}

/* ─── Main ─── */

if (process.env.SKIP_PRERENDER === '1') {
  console.log('[prerender] SKIP_PRERENDER=1 : étape sautée')
  process.exit(0)
}

const articles = await readArticles()

// Manifest consommé par home-seo (metas par slug) et sitemap.mjs
await mkdir(join(HOME_DIR, 'ressources'), { recursive: true })
await writeFile(join(HOME_DIR, 'ressources', 'manifest.json'), JSON.stringify(articles, null, 2))
console.log(`[prerender] manifest.json : ${articles.length} guide(s)`)

const routes = [...STATIC_ROUTES, ...articles.map((a) => `/ressources/${a.slug}`)]

const server = await startServer()
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await launchChromium()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })

// Bloquer tout ce qui sort de localhost : déterminisme + zéro hit analytics
await context.route('**/*', (route) => {
  const { hostname } = new URL(route.request().url())
  return hostname === '127.0.0.1' || hostname === 'localhost' ? route.continue() : route.abort()
})

const snapshots = new Map()
let failed = false
for (const route of routes) {
  const page = await context.newPage()
  try {
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('#app > *', { timeout: 15000 })
    await page.waitForTimeout(250) // laisser les metas afterEach se poser
    snapshots.set(route, await page.content())
    console.log(`[prerender] OK  ${route}`)
  } catch (err) {
    failed = true
    console.error(`[prerender] ÉCHEC ${route} : ${err.message}`)
  } finally {
    await page.close()
  }
}

await browser.close()
server.close()

if (failed) {
  console.error('[prerender] Au moins une page a échoué : build interrompu')
  process.exit(1)
}

// Écriture en fin de run seulement : le fallback SPA du serveur local reste
// l'index.html brut de Vite pendant tout le rendu.
// Format FICHIER (tarification.html), pas dossier (tarification/index.html) :
// _redirects réécrit chaque adresse vers son fichier, et un dossier
// déclencherait une 301 Netlify vers l'adresse à barre finale, qui contredit
// les canonicals.
for (const [route, html] of snapshots) {
  const outFile = route === '/'
    ? join(HOME_DIR, 'index.html')
    : join(HOME_DIR, `${route.slice(1)}.html`)
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, html)
}
console.log(`[prerender] ${snapshots.size} page(s) écrites dans /home`)
