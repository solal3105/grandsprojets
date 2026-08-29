/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './index-v2.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FF0037',
        // #FF0037 plafonne a 3,96:1 sur blanc : insuffisant pour du texte.
        // Cette declinaison tient 5,6:1 a teinte identique.
        'primary-ink': '#C4002A',
        'primary-light': 'rgba(255, 0, 55, 0.06)',
        'primary-10': 'rgba(255, 0, 55, 0.10)',
        amber: '#F2B327',
        // Declinaisons lisibles : l'ambre et le vert de marque sont trop clairs
        // pour du texte sur blanc, le violet trop sombre pour du texte sur noir.
        'amber-ink': '#8A5D00',
        green: '#5AAB7D',
        'green-ink': '#2F7551',
        purple: '#4E2BFF',
        'purple-light': '#A594FF',
        teal: '#0E7C86',
        // La marque d'Open Projets Chantiers, reprise telle quelle de sa rampe
        // (crans 500, 700, 200 et 50). Presenter ce produit en violet sur fond
        // noir donnait une fausse idee de l'outil avant meme le clic.
        chantiers: '#14AE5C',
        'chantiers-ink': '#09773C', // 5,7:1 sur blanc : le seul cran lisible en texte
        'chantiers-border': '#B9EFD2',
        'chantiers-bg': '#F0FCF6',
        /* Les cinq modules, en une seule gamme. Meme profondeur, meme
         * intensite, cinq teintes assez espacees sur la roue pour qu'on ne
         * confonde jamais deux sections : cramoisi, ocre, emeraude, bleu,
         * violet. Chaque ton tient au moins 5:1 sur blanc, il sert donc aussi
         * bien de fond de capture que de texte d'accent.
         * Le cramoisi est celui de la marque, les quatre autres sont cales
         * dessus. Le ton `-soft` est le meme melange a 10% sur blanc. */
        mod: {
          carte: '#C4002A',
          'carte-soft': '#F9E6EA',
          travaux: '#B45309',
          'travaux-soft': '#F8EEE6',
          chantiers: '#0B7A4A',
          'chantiers-soft': '#E7F2ED',
          participer: '#1B5FA8',
          'participer-soft': '#E8EFF6',
          diagnostic: '#7546CC',
          'diagnostic-soft': '#F1ECFA',
        },
        dark: '#111111',
        'gray-text': '#555555',
        // Gris secondaire reellement lisible (5,3:1). Remplace les opacites
        // appliquees a gray-text, qui tombaient a 2,3:1.
        'gray-muted': '#6B6B6B',
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
        // Le nom d'un module, en gros et en Space Grotesk : resserre juste
        // assez pour qu'il se tienne comme un logotype.
        'tight-name': '-0.6px',
      },
      boxShadow: {
        card: '0 24px 64px -12px rgba(0, 0, 0, 0.10)',
        // Sur le gris de fond, une pastille blanche sans ombre ne se detache
        // plus du tout : ce cran la repose sans la faire flotter.
        pill: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.05)',
        // L'elevation d'une capture d'ecran presentee comme un objet.
        capture: '0 32px 80px -16px rgba(0, 0, 0, 0.18), 0 8px 24px -8px rgba(0, 0, 0, 0.10)',
      },
    },
  },
  plugins: [],
}
