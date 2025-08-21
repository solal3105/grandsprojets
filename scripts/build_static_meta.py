import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

# Paths and constants
ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / 'pages'
SITEMAP_PATH = ROOT / 'sitemap.xml'
PROD_ORIGIN = 'https://grandsprojets.com'
SITE_NAME = 'Grands Projets de Lyon'
DEFAULT_COVER = '/img/logomin.png'

# -------------------- Front matter parsing (mirrors extract_descriptions.py) --------------------

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return path.read_text(encoding='utf-8', errors='ignore')


def extract_front_matter_lines(md_text: str) -> list[str]:
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != '---':
        return []
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            return lines[1:i]
    return []


def parse_front_matter(fm_lines: list[str]) -> dict:
    data: dict[str, str] = {}
    i = 0
    while i < len(fm_lines):
        line = fm_lines[i]
        m = re.match(r'^([A-Za-z0-9_\-]+)\s*:\s*(.*)$', line)
        if not m:
            i += 1
            continue
        key = m.group(1)
        val = m.group(2).rstrip()
        if (val.startswith('"') and val.endswith('"') and len(val) >= 2) or (
            val.startswith("'") and val.endswith("'") and len(val) >= 2
        ):
            val = val[1:-1]
            data[key] = val
            i += 1
            continue
        if key == 'description' and (val in ('', '|', '>')):
            i += 1
            block_lines = []
            while i < len(fm_lines):
                l2 = fm_lines[i]
                if l2.startswith(' ') or l2.startswith('\t'):
                    block_lines.append(l2.strip())
                    i += 1
                else:
                    break
            data[key] = ' '.join(block_lines).strip()
            continue
        data[key] = val.strip()
        i += 1
    return data


def map_md_to_html(md_path: Path) -> Path:
    rel = md_path.relative_to(PAGES_DIR)
    folder = rel.parent
    name = rel.stem
    if folder.name == 'velo' and name.startswith('ligne-'):
        html_name = name.replace('ligne-', 'voie-lyonnaise-') + '.html'
    else:
        html_name = name + '.html'
    return PAGES_DIR / folder / html_name


# -------------------- Utilities --------------------

def to_posix(p: Path) -> str:
    return str(p).replace('\\', '/')


def html_escape(s: str) -> str:
    return (
        s.replace('&', '&amp;')
         .replace('"', '&quot;')
         .replace("'", '&#39;')
         .replace('<', '&lt;')
         .replace('>', '&gt;')
    )


def absolutize(url_or_path: str) -> str:
    if not url_or_path:
        return f"{PROD_ORIGIN}{DEFAULT_COVER}"
    u = url_or_path.strip()
    if u.startswith('http://') or u.startswith('https://'):
        return u
    if not u.startswith('/'):
        u = '/' + u
    return f"{PROD_ORIGIN}{u}"


def compute_full_title(raw_title: str | None) -> str:
    if not raw_title:
        return SITE_NAME
    return f"{raw_title} – {SITE_NAME}"


def slug_to_title(slug: str) -> str:
    # naive conversion: 'lyon-confluence-phase-2' -> 'Lyon Confluence Phase 2'
    parts = [p for p in re.split(r'[-_]+', slug) if p]
    return ' '.join(w.capitalize() for w in parts)


def build_seo_block(full_title: str, description: str, page_url: str, cover_abs: str) -> str:
    # JSON-LD: WebPage and BreadcrumbList
    web_page = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        'name': full_title.replace(f' – {SITE_NAME}', ''),
        'headline': full_title.replace(f' – {SITE_NAME}', ''),
        'description': description,
        'url': page_url,
        'image': cover_abs,
    }
    breadcrumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': f'{PROD_ORIGIN}/'},
            {'@type': 'ListItem', 'position': 2, 'name': full_title.replace(f' – {SITE_NAME}', ''), 'item': page_url},
        ],
    }
    # Use same IDs as dynamic ensureJsonLd() so runtime updates the same nodes
    jsonld = (
        '<script id="fp-jsonld-webpage" type="application/ld+json">' +
        json.dumps(web_page, ensure_ascii=False) +
        '</script>\n' +
        '<script id="fp-jsonld-breadcrumb" type="application/ld+json">' +
        json.dumps(breadcrumbs, ensure_ascii=False) +
        '</script>'
    )

    # Build meta tags
    lines = [
        f'<meta name="description" content="{html_escape(description)}">',
        f'<link rel="canonical" href="{html_escape(page_url)}">',
        f'<meta property="og:site_name" content="{SITE_NAME}">',
        f'<meta property="og:type" content="article">',
        f'<meta property="og:locale" content="fr_FR">',
        f'<meta property="og:title" content="{html_escape(full_title)}">',
        f'<meta property="og:description" content="{html_escape(description)}">',
        f'<meta property="og:url" content="{html_escape(page_url)}">',
        f'<meta property="og:image" content="{html_escape(cover_abs)}">',
        f'<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{html_escape(full_title)}">',
        f'<meta name="twitter:description" content="{html_escape(description)}">',
        f'<meta name="twitter:image" content="{html_escape(cover_abs)}">',
    ]

    block = (
        '<!-- SEO-START AUTO -->\n'
        + '\n'.join(lines) + '\n' + jsonld + '\n'
        + '<!-- SEO-END AUTO -->'
    )
    return block


def inject_into_head(html_text: str, full_title: str, seo_block: str) -> str:
    # Replace or insert <title>
    title_tag = f'<title>{html_escape(full_title)}</title>'
    if re.search(r'<title>.*?</title>', html_text, flags=re.IGNORECASE | re.DOTALL):
        html_text = re.sub(r'<title>.*?</title>', title_tag, html_text, count=1, flags=re.IGNORECASE | re.DOTALL)
    else:
        # add title at start of SEO block
        seo_block = title_tag + '\n' + seo_block

    # Replace any existing SEO block
    if re.search(r'<!--\s*SEO-START AUTO\s*-->.*?<!--\s*SEO-END AUTO\s*-->', html_text, flags=re.DOTALL | re.IGNORECASE):
        html_text = re.sub(r'<!--\s*SEO-START AUTO\s*-->.*?<!--\s*SEO-END AUTO\s*-->', seo_block, html_text, flags=re.DOTALL | re.IGNORECASE)
        return html_text

    # Insert before </head>
    idx = html_text.lower().find('</head>')
    if idx != -1:
        return html_text[:idx] + seo_block + '\n' + html_text[idx:]

    # Fallback: append at end
    return html_text + '\n' + seo_block + '\n'


# -------------------- Sitemap generation --------------------

def format_lastmod(ts: float) -> str:
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).date()
    return dt.isoformat()


def generate_sitemap(entries: list[tuple[str, float]]):
    # entries: list of (absolute_url, mtime)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url, mtime in entries:
        lastmod = format_lastmod(mtime)
        lines += [
            '  <url>',
            f'    <loc>{url}</loc>',
            f'    <lastmod>{lastmod}</lastmod>',
            '  </url>',
        ]
    lines.append('</urlset>')
    SITEMAP_PATH.write_text('\n'.join(lines) + '\n', encoding='utf-8')


# -------------------- Main build --------------------

def main():
    # 1) Build map from md -> front matter, html path
    md_items = []
    for md_path in PAGES_DIR.rglob('*.md'):
        md_text = read_text(md_path)
        fm = parse_front_matter(extract_front_matter_lines(md_text))
        html_path = map_md_to_html(md_path)
        md_items.append((md_path, fm, html_path))

    # 2) Inject SEO into HTML files
    updated = 0
    processed_urls: set[str] = set()

    for md_path, fm, html_path in md_items:
        if not html_path.exists():
            continue
        rel_html = html_path.relative_to(ROOT)
        page_url = f"{PROD_ORIGIN}/{to_posix(rel_html)}"
        raw_title = fm.get('title') or fm.get('name')
        if not raw_title:
            # derive from filename
            raw_title = slug_to_title(html_path.stem)
        full_title = compute_full_title(raw_title)
        description = fm.get('meta') or fm.get('description') or 'Fiche projet: informations, carte et documents officiels.'
        cover = fm.get('cover') or DEFAULT_COVER
        cover_abs = absolutize(cover)

        seo_block = build_seo_block(full_title, description, page_url, cover_abs)

        html_text = read_text(html_path)
        new_html = inject_into_head(html_text, full_title, seo_block)
        if new_html != html_text:
            html_path.write_text(new_html, encoding='utf-8')
            updated += 1
        processed_urls.add(page_url)

    # 3) Build sitemap: include homepage and all pages/**/*.html
    entries: list[tuple[str, float]] = []

    # Homepage
    index_path = ROOT / 'index.html'
    if index_path.exists():
        entries.append((f'{PROD_ORIGIN}/', index_path.stat().st_mtime))

    # Pages/**/*.html
    for html_file in sorted(PAGES_DIR.rglob('*.html')):
        rel_html = to_posix(html_file.relative_to(ROOT))
        url = f"{PROD_ORIGIN}/{rel_html}"
        try:
            mtime = html_file.stat().st_mtime
        except OSError:
            mtime = datetime.now(timezone.utc).timestamp()
        entries.append((url, mtime))

    # Ensure uniqueness and stable order
    seen = set()
    unique_entries: list[tuple[str, float]] = []
    for url, mtime in entries:
        if url in seen:
            continue
        seen.add(url)
        unique_entries.append((url, mtime))

    generate_sitemap(unique_entries)

    print(f"SEO blocks updated: {updated}")
    print(f"Sitemap entries: {len(unique_entries)} written to {SITEMAP_PATH}")


if __name__ == '__main__':
    main()
