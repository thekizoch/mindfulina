// Mindfulina brand theme configuration
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  theme: {
    extend: {
      colors: {
        gold: '#D4A437',         // Logo text, accents, headings
        sunsetCoral: '#F4B4A8',  // Background gradients, highlights
        seafoamGreen: '#B8D9C5', // Background gradients, calm accents
        skyBlue: '#C9E9F6',      // Optional accent
        blushPink: '#FADCE5',    // Gentle watercolor gradient
        brandWhite: '#FFFFFF',   // Text background, logo base
        textGray: '#4A4A4A',     // For body text (a softer dark gray)
      },
      fontFamily: {
        display: ['"Pacifico"', 'cursive'],   // hand-lettered header font
        body: ['"Georgia"', 'serif'],      // Per brand-identity (Garamond / Georgia)
        serif: ['"Cinzel"', 'serif']            // Per brand-identity (Trajan Pro / Cinzel)
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        'soft': '0 4px 20px rgba(0, 0, 0, 0.05)',
        'inner-soft': 'inset 0 2px 10px rgba(0, 0, 0, 0.05)'
      }
    },
  },
  plugins: [],
}; 