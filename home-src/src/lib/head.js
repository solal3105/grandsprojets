/* Écriture des balises <head> SEO (meta et canonical).
 *
 * Sorties du routeur v1 : les vues partagées entre les deux versions du site
 * (ex. l'article de ressource, qui pose ses metas lui-même parce que sa route
 * est dynamique) les utilisent sans tirer un routeur entier dans leur bundle. */

export function setMeta(name, content, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

export function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el) }
  el.setAttribute('href', href)
}
