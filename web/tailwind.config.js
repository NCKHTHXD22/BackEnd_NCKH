/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // nếu bạn dùng React
    "./index.html"
  ],
  theme: {
    extend: {
      backgroundImage: {
        'sidebar':     'linear-gradient(180deg, #0c1a42 0%, #16348a 35%, #1d4ed8 70%, #0c1a42 100%)',
        'header':      'linear-gradient(135deg, #1d4ed8 0%, #2563eb 40%, #0ea5e9 100%)',
        'hero-card':   'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #0ea5e9 100%)',
        'login-panel': 'linear-gradient(160deg, #0c1a42 0%, #16348a 30%, #1d4ed8 55%, #0c1a42 100%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: 0, transform: 'translateX(-12px)' },
          to:   { opacity: 1, transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: 1 },
          '50%':      { opacity: 0.6 },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.35s ease both',
        'slide-in-left': 'slide-in-left 0.3s ease both',
        'pulse-soft':    'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
