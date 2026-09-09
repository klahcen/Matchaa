/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          start: '#FD297B',
          mid: '#FF5864',
          end: '#FF655B',
          accent: '#FD297B',
          text: '#333333',
          muted: '#757575',
          border: '#E5E5E5',
          surface: '#FFFFFF',
          bg: '#F8F8F8',
          error: {
            bg: '#FFEBEE',
            text: '#D32F2F',
          },
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #FD297B 0%, #FF5864 50%, #FF655B 100%)',
        'brand-gradient-r': 'linear-gradient(to right, #FD297B 0%, #FF5864 50%, #FF655B 100%)',
      },
    },
  },
  plugins: [],
};
