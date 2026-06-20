export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f4fbf7', 100: '#dff3e8', 600: '#247e50', 700: '#1d6543' },
        ink: '#17211b',
        clay: '#b7653b'
      },
      boxShadow: { panel: '0 8px 30px rgba(23, 33, 27, 0.08)' }
    }
  },
  plugins: []
};
