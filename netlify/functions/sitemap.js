exports.handler = async (event, context) => {
  try {
    // Hardcoded credentials per user's request (note: consider env vars for security best practices)
    const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0';
    const BASE_ORIGIN = 'https://grandsprojets.com';

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { statusCode: 500, body: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' };
    }

    // Fetch minimal fields from contribution_uploads (use project_name, not name)
    const url = new URL('/rest/v1/contribution_uploads', SUPABASE_URL);
    // Note: table does not have updated_at; use created_at only
    url.searchParams.set('select', 'project_name,category,markdown_url,created_at');
    url.searchParams.set('order', 'created_at.desc');
    // Only approved contributions should be indexed
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
      return { statusCode: 500, body: `Supabase error ${resp.status}: ${txt}` };
    }

    const rows = await resp.json();
    const items = Array.isArray(rows) ? rows : [];

    const mapCat = (c) => {
      const v = String(c || '').toLowerCase();
      if (v === 'mobilite') return 'transport';
      if (v === 'vélo' || v === 'velo') return 'velo';
      if (v === 'urbanisme') return 'urbanisme';
      return 'transport';
    };

    const fmtDate = (d) => {
      try {
        if (!d) return null;
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return null;
        return dt.toISOString().slice(0, 10); // YYYY-MM-DD
      } catch { return null; }
    };

    const urlset = [];

    // Home (optional but recommended)
    urlset.push({
      loc: `${BASE_ORIGIN}/`,
      changefreq: 'daily',
      priority: '0.8'
    });

    for (const it of items) {
      const name = it?.project_name || '';
      const cat = mapCat(it?.category);
      if (!name || !cat) continue;
      const encoded = encodeURIComponent(name);
      const loc = `${BASE_ORIGIN}/fiche/?cat=${cat}&project=${encoded}`;
      const lastmod = fmtDate(it?.created_at) || undefined;
      const priority = it?.markdown_url ? '0.8' : '0.6';
      urlset.push({ loc, lastmod, changefreq: 'weekly', priority });
    }

    const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urlset.map((u) => {
        return [
          '  <url>',
          `    <loc>${escapeXml(u.loc)}</loc>`,
          u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
          u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : '',
          u.priority ? `    <priority>${u.priority}</priority>` : '',
          '  </url>'
        ].filter(Boolean).join('\n');
      }),
      '</urlset>'
    ].join('\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      },
      body: xml
    };
  } catch (e) {
    return { statusCode: 500, body: `Sitemap generation failed: ${e?.message || e}` };
  }
};
