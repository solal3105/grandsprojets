import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { renameSync, existsSync, createReadStream } from 'fs'

/* Build temporaire de la refonte du home, servi sous /home2/.
 *
 * Même arborescence source que le build principal : les composants partagés
 * (MapShowcase, PressSection, LogoSvg, DiagnosticShowcase) restent à un seul
 * endroit, seule la version 2 de la page vit dans src/v2/.
 *
 * POUR RETIRER LA REFONTE, six points, le premier en priorité car son oubli
 * casse le déploiement :
 *   1. netlify.toml  : retirer `&& { npm run build:v2 || ... }` de la commande
 *   2. _redirects    : les deux lignes /home2
 *   3. package.json  : les scripts dev:v2 et build:v2
 *   4. .oxlintrc.json: l'entrée home2/assets/**
 *   5. .gitignore    : l'entrée home2
 *   6. les fichiers  : src/v2/, index-v2.html, ce fichier, le dossier home2/
 *
 * La mesure d'audience part sur l'espace « home2 » : sans ça les pages vues des
 * deux versions se mélangeraient et la comparaison ne voudrait rien dire. */
const ANALYTICS_SPACE = 'home2'
const BASE = '/home2/'

const ANALYTICS_SOURCE = resolve(__dirname, '../modules/analytics.js')

function sharedAnalytics() {
  return {
    name: 'openprojets-shared-analytics-v2',
    transformIndexHtml() {
      return [{
        tag: 'script',
        attrs: {
          defer: true,
          src: '/modules/analytics.js',
          'data-op-space': ANALYTICS_SPACE,
          'data-op-pageview': 'manual',
        },
        // Obligatoire : les scripts différés s'exécutent dans l'ordre du
        // document et le bundle Vue navigue dès son évaluation.
        injectTo: 'head-prepend',
      }]
    },
    // Le serveur de dev ne connait pas la racine du depot : sans ce
    // middleware, /modules/analytics.js repond 404 en local.
    configureServer(server) {
      server.middlewares.use('/modules/analytics.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        const flux = createReadStream(ANALYTICS_SOURCE)
        flux.on('error', () => { res.statusCode = 404; res.end('') })
        flux.pipe(res)
      })
    },
  }
}

/* Serveur de dev : `rollupOptions.input` ne vaut que pour le build. Sans ce
 * middleware, Vite sert home-src/index.html, c'est-a-dire l'application v1 sur
 * l'URL de la v2. Toute navigation est donc aiguillee vers l'entree v2, les
 * requetes d'assets (qui portent une extension) passent leur chemin. */
function devEntry() {
  return {
    name: 'openprojets-dev-entry-v2',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // Seule une navigation de document doit recevoir l'entree v2. Le
        // discriminant fiable est l'en-tete Accept : un import de module
        // demande */*, jamais text/html. Se fier a l'extension rewritait
        // /@vite/client et cassait le montage de l'application.
        const accept = req.headers.accept || ''
        const [path = '/'] = (req.url || '/').split('?')
        const route = path.replace(BASE.replace(/\/$/, ''), '') || '/'
        const internal = route.startsWith('/@') || route.startsWith('/node_modules')
        // Reecrire en gardant la base : Vite refuse les URL qui n'en partent
        // pas et repond 404 avec un message d'aide.
        if (accept.includes('text/html') && !internal) req.url = `${BASE}index-v2.html`
        next()
      })
    },
  }
}

/* Vite nomme le HTML de sortie d'après son entrée : sans ce renommage,
 * /home2/ servirait index-v2.html et la racine du dossier serait vide. */
function renameEntry(outDir) {
  return {
    name: 'openprojets-rename-entry',
    closeBundle() {
      const built = resolve(outDir, 'index-v2.html')
      if (existsSync(built)) renameSync(built, resolve(outDir, 'index.html'))
    },
  }
}

const OUT_DIR = resolve(__dirname, '../home2')

export default defineConfig({
  base: BASE,
  plugins: [vue(), sharedAnalytics(), devEntry(), renameEntry(OUT_DIR)],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'index-v2.html') },
  },
  server: { port: 5174 },
})
