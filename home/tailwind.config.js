/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
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
    },
  },
  plugins: [],
}
