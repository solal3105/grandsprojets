# design-sync notes - Open Projets

## Repo is NOT a React component library
This repo is a Vue 3 marketing site (`home-src/`) + a vanilla-JS MapLibre map app
(root). The Claude Design pipeline renders **React** components, so the normal
component sync does not apply. On the first sync (2026-06-30) the user chose a
**tokens-only foundation** - ship the brand's design tokens, no components.

## Shape: tokens-only (off-script / bespoke)
Not produced by the converter - there is no esbuild-bundlable React `dist/`. The
`ds-bundle/` layout is hand-authored:
- `styles.css` is the entry; its `@import` closure is the whole foundation.
- `tokens/*.css` hold CSS custom properties + token-backed utility classes.
- No `_ds_bundle.js`, no `components/`, no `_ds_sync.json` (no anchor) - a re-sync
  simply rebuilds from source and re-uploads. That's the honest choice for a
  bespoke shape (the package/storybook anchor format doesn't fit here).

## Token source = HOME BRAND (#FF0037)
The user picked the **Home** brand (`home-src/tailwind.config.js`) over the map
app's richer 3-layer system (`styles/00-colors.css`, primary `#14AE5C` + dark mode
+ semantic aliases). If they ever want the app's design-system rigor instead, that
file is the source - it has `--text-*`/`--surface-*`/`--border-*` aliases and dark
mode that the Home brand lacks.

## Fonts
Space Grotesk + Inter load from **Google Fonts** via an `@import` at the top of
`styles.css` (same as production `home-src/index.html`). Not bundled as woff2 -
relies on network at render time. If a future render sandbox blocks external CSS,
download the woff2 files into `ds-bundle/fonts/` and switch to `@font-face`.

## Foundation cards (so the Design System gallery isn't empty)
A tokens-only upload has no browsable cards, so the gallery looked empty. Added
three self-contained preview cards under `ds-bundle/components/foundations/`
(`Colors`, `Typography`, `Effects`), each with a first-line `<!-- @dsCard
group="Foundations" name="…" -->` marker. They are visual references only (inline
HTML/CSS, not real components). After uploading cards, write `_ds_needs_recompile`
so the app rebuilds its card index - cards appear on next open/refresh.

## To refresh
Re-read `home-src/tailwind.config.js` + `home-src/src/style.css`, regenerate
`ds-bundle/tokens/*` 1:1, re-validate names against `.design-sync/conventions.md`,
re-upload to project `597dfdae-cdd6-4d1b-b200-8b81cdadcb29`.
