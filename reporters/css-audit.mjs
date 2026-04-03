#!/usr/bin/env node
// reporters/css-audit.js
// Finds CSS classes defined in styles/ that are never referenced in JS/HTML sources.
// Usage: node reporters/css-audit.js [--verbose]

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const ROOT   = new URL('..', import.meta.url).pathname;
const VERBOSE = process.argv.includes('--verbose');

// ─── Config ────────────────────────────────────────────────────────────────

const CSS_DIR = join(ROOT, 'styles');

// Directories/files to scan for class references
// Includes compiled home/ assets so Vue component classes are detected
const SEARCH_ROOTS = [
  join(ROOT, 'modules'),
  join(ROOT, 'admin'),
  join(ROOT, 'fiche'),
  join(ROOT, 'home', 'assets'),  // compiled Vue SPA
  join(ROOT, 'index.html'),
  join(ROOT, 'main.js'),
];
const SEARCH_EXTS = new Set(['.js', '.html', '.mjs']);

// CSS files to skip entirely (known external/reset/variable files with no component classes)
const SKIP_CSS = new Set(['00-colors.css', '01-base.css']);

// Class prefixes that are intentionally generated dynamically and safe to ignore
// (e.g. Tailwind utilities in home-src, MapLibre internals, FontAwesome)
const IGNORE_PREFIXES = ['fa-', 'maplibre', 'mapboxgl-', 'leaflet-'];

// Class name *fragments* — if the corpus contains this fragment, the class is
// likely constructed dynamically (e.g. 'gp-toast--' + type → gp-toast--success).
// If any fragment matches the start of a class name, it's excluded from orphans.
const DYNAMIC_FRAGMENTS = [
  'gp-toast--',   // Toast.show(msg, 'success') → gp-toast--success
  'np-dot--',     // np-dot--active/upcoming/done/pending built in travaux-views
  'gp-hp-tag--',  // hover popup tag variants
];

// Classes known to be set purely via JavaScript string manipulation
// or in HTML attributes not detectable by simple text search — add here if needed.
const KNOWN_DYNAMIC = new Set([]);

// ─── Helpers ───────────────────────────────────────────────────────────────

function walkFiles(root, exts, files = []) {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walkFiles(full, exts, files);
    } else if (e.isFile() && exts.has(extname(e.name))) {
      files.push(full);
    }
  }
  return files;
}

function extractCSSClasses(cssText) {
  // Match .classname from selectors, strip pseudo-classes/elements and combinators
  const classRe = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
  const classes = new Set();
  let m;
  // Remove comments first
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((m = classRe.exec(stripped)) !== null) {
    classes.add(m[1]);
  }
  return classes;
}

function buildSearchCorpus(roots) {
  const files = [];
  for (const r of roots) {
    try {
      const stat = statSync(r);
      if (stat.isFile()) files.push(r);
      else walkFiles(r, SEARCH_EXTS, files);
    } catch { /* path doesn't exist */ }
  }

  let corpus = '';
  for (const f of files) {
    try { corpus += readFileSync(f, 'utf8') + '\n'; }
    catch { /* skip unreadable */ }
  }
  return { corpus, count: files.length };
}

// ─── Main ──────────────────────────────────────────────────────────────────

console.log('🔍  CSS Orphan Audit\n');

// 1. Collect CSS classes per file
const cssFiles = readdirSync(CSS_DIR)
  .filter(f => f.endsWith('.css') && !SKIP_CSS.has(f))
  .sort();

const classMap = new Map(); // className → Set<cssFile>

for (const f of cssFiles) {
  const text = readFileSync(join(CSS_DIR, f), 'utf8');
  const classes = extractCSSClasses(text);
  for (const cls of classes) {
    if (!classMap.has(cls)) classMap.set(cls, new Set());
    classMap.get(cls).add(f);
  }
}

// 2. Build source corpus
const { corpus, count: fileCount } = buildSearchCorpus(SEARCH_ROOTS);
console.log(`📁  Scanned ${cssFiles.length} CSS files, ${fileCount} source files\n`);

// 3. Find orphans
const orphans = new Map(); // cssFile → [className]

for (const [cls, sources] of classMap) {
  // Skip ignored prefixes, dynamic fragments, and known dynamic classes
  if (IGNORE_PREFIXES.some(p => cls.startsWith(p))) continue;
  if (DYNAMIC_FRAGMENTS.some(f => cls.startsWith(f))) continue;
  if (KNOWN_DYNAMIC.has(cls)) continue;

  // Search for the class name in the corpus
  // Match: "class-name" or 'class-name' or `class-name` or class-name (word boundary)
  // We look for the literal string to handle all JS string patterns
  if (!corpus.includes(cls)) {
    for (const file of sources) {
      if (!orphans.has(file)) orphans.set(file, []);
      orphans.get(file).push(cls);
    }
  }
}

// 4. Report
if (orphans.size === 0) {
  console.log('✅  No orphaned CSS classes found.\n');
  process.exit(0);
}

let totalOrphans = 0;

// Sort files by orphan count (most orphans first)
const sorted = [...orphans.entries()].sort((a, b) => b[1].length - a[1].length);

for (const [file, classes] of sorted) {
  console.log(`\n📄  ${file}  (${classes.length} orphan${classes.length > 1 ? 's' : ''})`);
  if (VERBOSE || classes.length <= 15) {
    for (const cls of classes.sort()) {
      console.log(`    .${cls}`);
    }
  } else {
    const preview = classes.slice(0, 10).sort();
    for (const cls of preview) console.log(`    .${cls}`);
    console.log(`    … and ${classes.length - 10} more (run --verbose to see all)`);
  }
  totalOrphans += classes.length;
}

console.log(`\n─────────────────────────────────────────`);
console.log(`Total: ${totalOrphans} potentially orphaned classes across ${orphans.size} files`);
console.log(`\n⚠️  Always verify before deleting:`);
console.log(`   • Classes set via JS string concatenation may be missed`);
console.log(`   • Classes used in fiche-v2.js or compiled home/ assets are not scanned`);
