// Même calcul dans le navigateur, le prérendu et l'edge home-seo.
// Les titres et introductions visibles des guides restent complets.
const BRAND = 'Open Projets';
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function shorten(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(' ', limit - 1);
  return text.slice(0, cut > 0 ? cut : limit - 1).replace(/[\s,;:(]+$/, '') + '…';
}

export function resourceSeo(article) {
  const fullTitle = clean(article.title).replace(/\s*\|\s*Open Projets$/i, '');
  // Le sujet avant deux-points est préférable à un sous-titre coupé en plein
  // milieu d'une proposition. Le H1 de l'article garde le titre complet.
  const topic = fullTitle.split(/\s+:\s+/)[0];
  const head = fullTitle.length + BRAND.length + 3 <= 60
    ? fullTitle
    : topic && topic.length <= 60 ? topic : fullTitle;
  const title = head.length + BRAND.length + 3 <= 60
    ? `${head} | ${BRAND}`
    : shorten(head, 60);

  const text = clean(article.description);
  let description = text;
  if (text.length > 160) {
    // Garder les phrases entières dès que possible. Sinon, une ellipse
    // explicite évite de faire passer un fragment pour une phrase complète.
    const ends = [...text.matchAll(/[.!?](?=\s|$)/g)].filter((m) => m.index < 160);
    description = ends.length ? text.slice(0, ends.at(-1).index + 1) : shorten(text, 160);
  }
  return { title, description };
}
