import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { createReadStream } from 'fs'

/**
 * Mesure d'audience : le home partage le module de la racine du dépôt
 * (`modules/analytics.js`), servi par Netlify sur `/modules/analytics.js` comme
 * pour tous les autres espaces. Une copie propre au home divergerait au premier
 * changement de configuration PostHog.
 *
 * - build : la balise est injectée ici plutôt qu'écrite dans index.html, sinon
 *   Vite chercherait le fichier dans home-src/ et préfixerait l'URL par la base
 *   `/home/`.
 * - `head-prepend` est OBLIGATOIRE : les scripts différés s'exécutent dans
 *   l'ordre du document, et le bundle Vue déclenche sa navigation initiale dès
 *   son évaluation. Injectée en fin de <head>, la balise se chargeait après, et
 *   la page vue de /home/ - la plus consultée du site - n'était jamais comptée.
 * - dev : le serveur Vite (:5173) ne connaît pas la racine du dépôt, ce
 *   middleware lui sert le fichier pour que /modules/analytics.js réponde.
 */
const ANALYTICS_SOURCE = resolve(__dirname, '../modules/analytics.js')

function sharedAnalytics() {
  return {
    name: 'openprojets-shared-analytics',
    transformIndexHtml() {
      return [{
        tag: 'script',
        attrs: {
          defer: true,
          src: '/modules/analytics.js',
          'data-op-space': 'home',
          // SPA : les pages vues sont émises par le routeur (src/router/index.js)
          'data-op-pageview': 'manual',
        },
        injectTo: 'head-prepend',
      }]
    },
    configureServer(server) {
      server.middlewares.use('/modules/analytics.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        const flux = createReadStream(ANALYTICS_SOURCE)
        // Sans ce gestionnaire, un fichier absent leverait une exception non
        // capturee et tuerait le serveur de developpement.
        flux.on('error', () => { res.statusCode = 404; res.end('') })
        flux.pipe(res)
      })
    },
  }
}

export default defineConfig({
  base: '/home/',
  plugins: [vue(), sharedAnalytics()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../home'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
