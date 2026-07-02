# Open Projets — design tokens (brand foundation)

This is a **tokens-only** design foundation for **Open Projets** (openprojets.com),
a SaaS that turns a collectivity's urban projects into an interactive public map.
There are **no components** here — the source product is built in Vue, so what ships
is the brand's color, type, and effect language. Style every design you build with
these tokens so it reads as Open Projets.

## The styling idiom

This is a **Tailwind-token** system. Two equivalent ways to apply a token, both
backed by the same values:

1. **Utility classes** — same names as the production Tailwind config, available as
   plain CSS (so they work with or without Tailwind):
   `text-primary` · `bg-primary` · `bg-primary-light` · `text-amber` · `text-green`
   · `text-purple` · `text-dark` · `bg-dark` · `text-gray-text` · `bg-gray-bg`
   · `border-gray-border` · `font-heading` · `font-body` · `tracking-tight-hero`
   · `shadow-card` · `max-w-container`
2. **CSS variables** — for any property a utility doesn't cover:
   `var(--color-primary)`, `var(--color-amber)`, `var(--font-heading)`,
   `var(--shadow-card)`, `var(--max-w-container)`, …

Prefer the utility classes; reach for `var(--*)` for one-off properties.

## The palette

| Token | Value | Use |
|---|---|---|
| `primary` | `#FF0037` | THE brand red — primary CTAs, links, accents, active state |
| `amber` | `#F2B327` | warm accent, gradient partner |
| `green` | `#5AAB7D` | calm/success accent |
| `purple` | `#4E2BFF` | secondary accent, gradient partner |
| `dark` | `#111111` | headings & near-black text, dark surfaces |
| `gray-text` | `#555555` | secondary body text |
| `gray-bg` | `#FAFAFA` | page / section background |
| `gray-border` | `rgba(0,0,0,.08)` | hairline borders |

`primary-light` (`rgba(255,0,55,.06)`) and `primary-10` (`rgba(255,0,55,.10)`) are
the tints for soft red fills (hover backgrounds, badges).

## Type

- **Headings / display:** `font-heading` → Space Grotesk (400–700).
- **Body / UI:** `font-body` → Inter (300–600).
- Hero/display lines use tight tracking: `tracking-tight-hero` (`-1.824px`).
- Fonts load from Google Fonts via `styles.css` — no extra setup needed.

## Signature flourishes (use sparingly — they're the brand's personality)

- **Clipped text gradients** on big headline words:
  `text-gradient` (red→amber) · `text-gradient-purple` (purple→red)
  · `text-gradient-green` (amber→green) · `text-gradient-contact` (red→purple).
  Apply to the text element itself.
- **Background blobs** — soft radial auras behind sections (absolutely positioned,
  large): `blob-red` · `blob-purple` · `blob-amber` · `blob-green`
  · `blob-contact-1` · `blob-contact-2`.
- **Card elevation:** `shadow-card` — the one true elevation for floating cards/panels.

## One idiomatic snippet

```jsx
<div className="op-page min-h-screen">
  <main className="max-w-container mx-auto px-6 py-24">
    <h1 className="font-heading tracking-tight-hero text-5xl">
      Vos projets, <span className="text-gradient">sur une carte</span>.
    </h1>
    <p className="font-body text-gray-text mt-4">
      Publiez vos projets urbains, informez vos habitants.
    </p>
    <div className="shadow-card bg-white rounded-3xl p-8 mt-10 max-w-md">
      <button className="bg-primary text-white font-body font-medium rounded-full px-6 py-3">
        Demander une démo
      </button>
    </div>
  </main>
</div>
```

---

## Layout of this upload

| Path | What it is |
|---|---|
| `styles.css` | **Entry** — every rendered design receives this and its `@import` closure |
| `tokens/colors.css` | brand color custom properties |
| `tokens/typography.css` | font-family + tracking custom properties |
| `tokens/effects.css` | card shadow + container max-width |
| `tokens/gradients.css` | signature text-gradient & blob utility classes |
| `tokens/utilities.css` | token-backed utility classes (Tailwind config names) |
| `tokens/tailwind.preset.js` | optional Tailwind preset mirroring the config |

**Provenance:** generated from `home-src/tailwind.config.js` and
`home-src/src/style.css` (the production Open Projets marketing site). Faithful 1:1
with those sources — no values invented. To refresh, re-run `/design-sync`.
