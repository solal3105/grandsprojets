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
      html: marked.parse(body),
    }
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1))

export const articleBySlug = Object.fromEntries(articles.map((a) => [a.slug, a]))

export function formatDateFr(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}
