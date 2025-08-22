#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Inject Google Analytics gtag.js snippet into every standalone fiche HTML under pages/**.

- Inserts before the first closing </head> (case-insensitive)
- Skips files that already contain the GA tag for the target ID
- Supports --dry-run and --id overrides

Usage examples (from project root):
  python scripts/inject_ga.py --dry-run
  python scripts/inject_ga.py --id G-XXXXXXX
"""
from __future__ import annotations
import argparse
import sys
import re
from pathlib import Path

DEFAULT_GA_ID = "G-8LGDVJXTPK"

SNIPPET_TEMPLATE = """  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id={ga_id}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);} 
    gtag('js', new Date());

    gtag('config', '{ga_id}');
  </script>
"""

HEAD_CLOSE_RE = re.compile(r"</head>", re.IGNORECASE)


def inject_ga_in_file(path: Path, ga_id: str, dry_run: bool = False, verbose: bool = False) -> str:
    """Returns one of: 'injected', 'already', 'nohead', 'error'"""
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        if verbose:
            print(f"[ERROR] Cannot read {path}: {e}")
        return "error"

    # If already contains this GA id, skip
    if (f"gtag/js?id={ga_id}" in text) or (f"gtag('config', '{ga_id}')" in text):
        if verbose:
            print(f"[SKIP] Already contains GA {ga_id}: {path}")
        return "already"

    m = HEAD_CLOSE_RE.search(text)
    if not m:
        if verbose:
            print(f"[WARN] </head> not found, skipping: {path}")
        return "nohead"

    snippet = SNIPPET_TEMPLATE.format(ga_id=ga_id)

    # Insert just before the first </head>
    new_text = text[:m.start()] + snippet + text[m.start():]

    if dry_run:
        if verbose:
            print(f"[DRY] Would inject GA into {path}")
        return "injected"

    try:
        path.write_text(new_text, encoding="utf-8")
        if verbose:
            print(f"[OK] Injected GA into {path}")
        return "injected"
    except Exception as e:
        if verbose:
            print(f"[ERROR] Cannot write {path}: {e}")
        return "error"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inject Google Analytics into fiche HTML files under pages/")
    parser.add_argument("--id", dest="ga_id", default=DEFAULT_GA_ID, help="Google Analytics measurement ID (default: %(default)s)")
    parser.add_argument("--dry-run", action="store_true", help="Show which files would be modified without writing")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--root", default=".", help="Project root (default: current directory)")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    pages_dir = root / "pages"
    if not pages_dir.exists():
        print(f"[ERROR] pages/ not found at: {pages_dir}")
        return 1

    html_files = list(pages_dir.rglob("*.html"))
    total = len(html_files)
    if args.verbose:
        print(f"Scanning {total} HTML files under {pages_dir} ...")

    counts = {"injected": 0, "already": 0, "nohead": 0, "error": 0}

    for f in html_files:
        status = inject_ga_in_file(f, args.ga_id, dry_run=args.dry_run, verbose=args.verbose)
        counts[status] = counts.get(status, 0) + 1

    print("GA injection summary:")
    print(f"  Total files:     {total}")
    print(f"  Injected:        {counts['injected']}")
    print(f"  Already present: {counts['already']}")
    print(f"  No </head>:      {counts['nohead']}")
    print(f"  Errors:          {counts['error']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
