import { marked } from 'marked'

// Articles de la section Ressources.
// Un article = un fichier markdown avec frontmatter dans src/content/ressources/,
// le slug est le nom du fichier. Déposer le fichier suffit : liste, route,
// manifest (home-seo, sitemap) et prerender le prennent en compte au build.
const files = import.meta.glob('../content/ressources/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  const meta = {}
  if (!m) return { meta, body: src }
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { meta, body: src.slice(m[0].length) }
}

export const articles = Object.entries(files)
  .map(([path, src]) => {
    const slug = path.split('/').pop().replace(/\.md$/, '')
    const { meta, body } = parseFrontmatter(src)
    return {
      slug,
      title: meta.title || slug,
      description: meta.description || '',
      date: meta.date || '',
      updated: meta.updated || meta.date || '',
      tag: meta.tag || '',
      readingTime: meta.readingTime || '',
      // Bloc solution contextualisé (SolutionShowcase) : intro libre +
      // points séparés par « | » dans le frontmatter
      solutionHeading: meta.solutionHeading || '',
      solutionIntro: meta.solutionIntro || '',
      solutionPoints: meta.solutionPoints
        ? meta.solutionPoints.split('|').map((p) => p.trim()).filter(Boolean)
        : [],
      html: '',
      sommaire: [],
      _body: body,
    }
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1))

/* Ancres et sommaire.
 *
 * marked ne pose plus d'identifiant sur les titres depuis la version 5. On les
 * ajoute donc ici, dans l'ordre des `##` du markdown : c'est le meme ordre que
 * celui des `<h2>` du HTML produit, et aucun de nos articles n'ecrit de `##`
 * dans un bloc de code. Le sommaire de l'article en decoule. */
function ancre(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

for (const a of articles) {
  const titres = [...a._body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim())
  const vus = new Map()
  a.sommaire = titres.map((texte) => {
    const base = ancre(texte)
    const n = (vus.get(base) || 0) + 1
    vus.set(base, n)
    return { id: n > 1 ? `${base}-${n}` : base, texte }
  })

  let i = 0
  a.html = marked.parse(a._body).replace(/<h2>/g, () => {
    const s = a.sommaire[i++]
    return s ? `<h2 id="${s.id}">` : '<h2>'
  })
  delete a._body
}

export const articleBySlug = Object.fromEntries(articles.map((a) => [a.slug, a]))

/* Les guides proches : d'abord ceux qui portent le meme tag, puis les plus
 * recents, pour que l'encart de fin d'article soit toujours rempli. */
export function articlesLies(slug, nombre = 3) {
  const courant = articleBySlug[slug]
  if (!courant) return []
  const autres = articles.filter((a) => a.slug !== slug)
  const memeTag = autres.filter((a) => a.tag && a.tag === courant.tag)
  return [...memeTag, ...autres.filter((a) => !memeTag.includes(a))].slice(0, nombre)
}

export function formatDateFr(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

/* Les couvertures d'articles : chaque guide s'illustre de son propre titre,
 * pose sur un aplat de couleur. Rien a dessiner, rien a choisir quand on ecrit,
 * il suffit de deposer le markdown.
 *
 * Les cinq tons sont ceux des modules. Les tags se repartissent dessus par
 * ordre alphabetique : une empreinte les entassait sur deux couleurs et la
 * page virait au violet. Un tag inedit prend sa place tout seul. */
export const TEINTES = [
  { fond: 'bg-mod-carte', accent: 'text-mod-carte' },
  { fond: 'bg-mod-travaux', accent: 'text-mod-travaux' },
  { fond: 'bg-mod-chantiers', accent: 'text-mod-chantiers' },
  { fond: 'bg-mod-participer', accent: 'text-mod-participer' },
  { fond: 'bg-mod-diagnostic', accent: 'text-mod-diagnostic' },
]

const tagsTries = [...new Set(articles.map((a) => a.tag).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'fr'))

export function teintePourArticle({ tag, slug }) {
  const rang = tag ? tagsTries.indexOf(tag) : -1
  if (rang >= 0) return TEINTES[rang % TEINTES.length]
  // Sans tag, le slug decide : deux articles voisins ne prennent pas le meme ton.
  let h = 0
  for (const c of slug || '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TEINTES[h % TEINTES.length]
}
