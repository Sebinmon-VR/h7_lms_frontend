/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        kidPrimary: '#7DD3FC', // pastel sky
        kidAccent: '#FDE68A',  // soft yellow
        kidSoft: '#FBCFE8',    // soft pink
        adminBg: '#0f172a'
      }
    }
  },
  plugins: [],
}
