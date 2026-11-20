/* ============================================================================
   FLUX PRODUITS POST-BUILD - le catalogue lu par ChatGPT

   Écrit /home/flux-produits.jsonl et /home/flux-produits.csv (servis à la
   racine par _redirects) à partir des données du site : les textes des pages
   de modules et la grille de tarification. Le format et les choix sont
   expliqués dans src/v2/data/flux-produits.mjs.

   data/modules.js importe des icônes Vue et l'alias `@` : seul Vite sait le
   charger, d'où le serveur Vite sans écoute, le temps d'un import.
   ============================================================================ */

import { writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const HOME_DIR = resolve(ROOT, '../home')

const vite = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { modules } = await vite.ssrLoadModule('/src/v2/data/modules.js')
  const { construireFlux, versJsonl, versCsv } = await vite.ssrLoadModule('/src/v2/data/flux-produits.mjs')
  const lignes = construireFlux(modules)
  await writeFile(join(HOME_DIR, 'flux-produits.jsonl'), versJsonl(lignes))
  await writeFile(join(HOME_DIR, 'flux-produits.csv'), versCsv(lignes))
  console.log(`[flux-produits] ${lignes.length} produit(s) écrits dans /home`)
} finally {
  await vite.close()
}
