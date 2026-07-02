/**
 * Open Projets — Tailwind preset
 * Mirrors home-src/tailwind.config.js (theme.extend) exactly. A Tailwind-aware
 * runtime can `presets: [openProjetsPreset]` to make `text-primary`, `bg-dark`,
 * `font-heading`, `shadow-card`, `max-w-container`, etc. resolve natively.
 * The same names are also shipped as plain CSS in tokens/utilities.css, so they
 * work even without Tailwind.
 */
export default {
  theme: {
    extend: {
      colors: {
        primary: '#FF0037',
        'primary-light': 'rgba(255, 0, 55, 0.06)',
        'primary-10': 'rgba(255, 0, 55, 0.10)',
        amber: '#F2B327',
        green: '#5AAB7D',
        purple: '#4E2BFF',
        dark: '#111111',
        'gray-text': '#555555',
        'gray-bg': '#FAFAFA',
        'gray-border': 'rgba(0, 0, 0, 0.08)',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      maxWidth: {
        container: '1280px',
      },
      letterSpacing: {
        'tight-hero': '-1.824px',
      },
      boxShadow: {
        card: '0 24px 64px -12px rgba(0, 0, 0, 0.10)',
      },
    },
  },
}
