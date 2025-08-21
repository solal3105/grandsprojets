import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / 'pages'
PAIRS_FILE = ROOT / 'scripts' / 'meta_to_inject.txt'


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return path.read_text(encoding='utf-8', errors='ignore')


def normalize_title(s: str) -> str:
    s = s.strip().lower()
    # remove accents
    s = unicodedata.normalize('NFD', s)
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    # collapse whitespace and punctuation similar to spaces
    s = re.sub(r'[\s\-–—]+', ' ', s)
    s = re.sub(r'[^a-z0-9 ]+', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def parse_pairs_file() -> dict[str, str]:
    content = read_text(PAIRS_FILE)
    # split on blank lines
    blocks = [b.strip() for b in content.split('\n\n') if b.strip()]
    mapping: dict[str, str] = {}
    for block in blocks:
        lines = [l.strip() for l in block.splitlines() if l.strip()]
        if not lines:
            continue
        title = lines[0]
        desc = ' '.join(lines[1:]) if len(lines) > 1 else ''
        if not desc:
            continue
        mapping[normalize_title(title)] = desc
    return mapping


def extract_front_matter_bounds(lines: list[str]) -> tuple[int, int] | None:
    if not lines or lines[0].strip() != '---':
        return None
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            return (0, i)
    return None


def get_title_from_fm(fm_lines: list[str]) -> tuple[str | None, int | None]:
    for idx, line in enumerate(fm_lines):
        m = re.match(r'^title\s*:\s*(.*)$', line)
        if m:
            val = m.group(1).strip()
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            return val.strip(), idx
    return None, None


def find_meta_index(fm_lines: list[str]) -> int | None:
    for idx, line in enumerate(fm_lines):
        if re.match(r'^meta\s*:', line):
            return idx
    return None


def inject_meta_into_file(md_path: Path, new_meta: str) -> bool:
    text = read_text(md_path)
    lines = text.splitlines()
    bounds = extract_front_matter_bounds(lines)
    if not bounds:
        return False
    start, end = bounds  # fm is lines[start+1:end]
    fm_lines = lines[start + 1:end]

    title_value, title_idx = get_title_from_fm(fm_lines)
    # prepare meta line (escape double quotes)
    meta_value = new_meta.replace('"', '\\"')
    meta_line = f'meta: "{meta_value}"'

    meta_idx = find_meta_index(fm_lines)
    if meta_idx is not None:
        fm_lines[meta_idx] = meta_line
    else:
        insert_at = title_idx + 1 if title_idx is not None else len(fm_lines)
        fm_lines.insert(insert_at, meta_line)

    # rebuild file
    new_lines = []
    new_lines.extend(lines[:start + 1])
    new_lines.extend(fm_lines)
    new_lines.append('---')  # closing
    new_lines.extend(lines[end + 1:])

    new_text = '\n'.join(new_lines) + ('\n' if text.endswith('\n') else '')
    if new_text != text:
        md_path.write_text(new_text, encoding='utf-8')
        return True
    return False


def main():
    mapping = parse_pairs_file()
    if not mapping:
        print('No pairs to inject.')
        return

    modified = 0
    matched = 0

    for md_path in PAGES_DIR.rglob('*.md'):
        md_text = read_text(md_path)
        lines = md_text.splitlines()
        bounds = extract_front_matter_bounds(lines)
        if not bounds:
            continue
        fm_lines = lines[bounds[0] + 1:bounds[1]]
        title, _ = get_title_from_fm(fm_lines)
        if not title:
            continue
        key = normalize_title(title)
        if key in mapping:
            matched += 1
            if inject_meta_into_file(md_path, mapping[key]):
                modified += 1
                print(f"UPDATED meta in {md_path}")
            else:
                print(f"NO CHANGE for {md_path}")

    print(f"Markdown matched by title: {matched}")
    print(f"Markdown modified: {modified}")


if __name__ == '__main__':
    main()
