const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
const BASE_ORIGIN = 'https://openprojets.com';

export default async (_request, _context) => {
  try {

    // Récupérer les projets avec les infos de ville
    const url = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
    url.searchParams.set('select', 'project_name,category,markdown_url,cover_url,description,ville,created_at');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('approved', 'eq.true');

    const resp = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json'
      }
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return new Response(`Supabase error ${resp.status}: ${txt}`, { status: 500 });
    }

    const rows = await resp.json();
    const items = Array.isArray(rows) ? rows : [];

    const fmtDate = (d) => {
      try {
        if (!d) return null;
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return null;
        return dt.toISOString().slice(0, 10);
      } catch (e) { console.debug('[netlify] fmtDate', e); return null; }
    };

    const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    const urlset = [];

    // Date la plus récente pour la page d'accueil
    const latestDate = items.length > 0 ? fmtDate(items[0]?.created_at) : fmtDate(new Date().toISOString());

    // Accueil
    urlset.push({
      loc: `${BASE_ORIGIN}/`,
      lastmod: latestDate,
      changefreq: 'daily',
      priority: '1.0'
    });

    // Page /home/
    urlset.push({
      loc: `${BASE_ORIGIN}/home/`,
      lastmod: latestDate,
      changefreq: 'weekly',
      priority: '0.9'
    });

    // Pages Home SPA
    const homePages = [
      { path: '/home/fonctionnalites', priority: '0.8' },
      { path: '/home/a-propos', priority: '0.7' },
      { path: '/home/contact', priority: '0.7' },
      { path: '/home/aide', priority: '0.6' },
    ];
    for (const hp of homePages) {
      urlset.push({
        loc: `${BASE_ORIGIN}${hp.path}`,
        lastmod: latestDate,
        changefreq: 'monthly',
        priority: hp.priority,
      });
    }

    // Filtrer les entrées de test E2E
    const isTestEntry = (name, cat) => {
      const lower = name.toLowerCase();
      return lower.startsWith('e2e-') || lower.startsWith('e2e_') ||
        lower.startsWith('test ') || lower === 'test' ||
        cat.startsWith('e2e-') || cat.startsWith('e2e_');
    };

    // Fiches individuelles avec images pour Google Images
    for (const it of items) {
      const name = it?.project_name || '';
      const cat = String(it?.category || '').toLowerCase();
      const ville = it?.ville || '';
      if (!name || !cat) continue;
      if (isTestEntry(name, cat)) continue;
      const encoded = encodeURIComponent(name);
      const loc = `${BASE_ORIGIN}/fiche/?cat=${encodeURIComponent(cat)}&project=${encoded}${ville ? `&city=${encodeURIComponent(ville)}` : ''}`;
      const lastmod = fmtDate(it?.created_at) || undefined;
      const priority = it?.markdown_url ? '0.8' : '0.6';

      const entry = { loc, lastmod, changefreq: 'weekly', priority };

      // Image sitemap extension — permet l'indexation dans Google Images
      if (it.cover_url) {
        entry.image = {
          loc: it.cover_url,
          title: name,
          caption: it.description ? it.description.slice(0, 200) : undefined,
        };
      }

      urlset.push(entry);
    }

    // Générer le XML avec support image:image (Google Image Sitemap extension)
    const xmlNs = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<urlset ${xmlNs}>`,
      ...urlset.map((u) => {
        const parts = [
          '  <url>',
          `    <loc>${escapeXml(u.loc)}</loc>`,
          u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
          u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : '',
          u.priority ? `    <priority>${u.priority}</priority>` : '',
        ];
        // Google Image Sitemap extension
        if (u.image) {
          parts.push('    <image:image>');
          parts.push(`      <image:loc>${escapeXml(u.image.loc)}</image:loc>`);
          if (u.image.title) parts.push(`      <image:title>${escapeXml(u.image.title)}</image:title>`);
          if (u.image.caption) parts.push(`      <image:caption>${escapeXml(u.image.caption)}</image:caption>`);
          parts.push('    </image:image>');
        }
        parts.push('  </url>');
        return parts.filter(Boolean).join('\n');
      }),
      '</urlset>'
    ].join('\n');

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch (e) {
    return new Response(`Sitemap generation failed: ${e?.message || e}`, { status: 500 });
  }
};

export const config = {
  path: '/sitemap.xml',
};
