import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / 'pages'
OUTPUT_PATH = ROOT / 'scripts' / 'descriptions.json'
PROD_DOMAIN = 'https://grandsprojets.com'


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return path.read_text(encoding='utf-8', errors='ignore')


def extract_front_matter_lines(md_text: str) -> list[str]:
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != '---':
        return []
    # find the next line that is exactly '---'
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
        # Handle quoted single-line
        if (val.startswith('"') and val.endswith('"') and len(val) >= 2) or (
            val.startswith("'") and val.endswith("'") and len(val) >= 2
        ):
            val = val[1:-1]
            data[key] = val
            i += 1
            continue
        # Handle block scalars or empty value for description (|, >, or nothing)
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
        # Default: take value as-is (unquoted single-line)
        data[key] = val.strip()
        i += 1
    return data


def map_md_to_html(md_path: Path) -> Path:
    rel = md_path.relative_to(PAGES_DIR)
    folder = rel.parent
    name = rel.stem  # without extension
    if folder.name == 'velo' and name.startswith('ligne-'):
        html_name = name.replace('ligne-', 'voie-lyonnaise-') + '.html'
    else:
        html_name = name + '.html'
    return PAGES_DIR / folder / html_name


def to_posix(p: Path) -> str:
    return str(p).replace('\\', '/')


def main():
    items = []
    total = 0
    with_desc = 0

    for md_path in PAGES_DIR.rglob('*.md'):
        total += 1
        md_text = read_text(md_path)
        fm_lines = extract_front_matter_lines(md_text)
        data = parse_front_matter(fm_lines)
        html_path = map_md_to_html(md_path)
        rel_html = html_path.relative_to(ROOT)
        url = f"{PROD_DOMAIN}/{to_posix(rel_html)}"

        item = {
            'md_path': to_posix(md_path.relative_to(ROOT)),
            'title': data.get('title'),
            'category': data.get('category'),
            'cover': data.get('cover'),
            'description': data.get('description'),
            'html_path': to_posix(rel_html),
            'url': url,
            'html_exists': html_path.exists(),
        }
        if item['description']:
            with_desc += 1
        items.append(item)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8'
    )

    print(f"Markdown files scanned: {total}")
    print(f"Descriptions found: {with_desc}")
    print(f"Output written to: {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
