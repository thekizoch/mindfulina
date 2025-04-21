// Mindfulina brand theme configuration
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  theme: {
    extend: {
      colors: {
        // Primary palette
        primary: '#0e7f9e',     // ocean blue-green
        secondary: '#ff5e6c',   // hibiscus pink
        accent: '#fde7c3',      // sand
        
        // Extended palette
        ocean: {
          DEFAULT: '#0e7f9e',
          light: '#45a5c4',
          dark: '#0a5b71'
        },
        sand: {
          DEFAULT: '#fde7c3',
          light: '#fff2dc',
          dark: '#f8d49b'
        },
        hibisc: {
          DEFAULT: '#ff5e6c',
          light: '#ff8c96',
          dark: '#e63e4c'
        },
        leaf: {
          DEFAULT: '#5cb85c',
          light: '#7ed17e',
          dark: '#3d8b3d'
        }
      },
      fontFamily: {
        display: ['"Pacifico"', 'cursive'],   // hand-lettered header font
        body: ['"Inter"', 'sans-serif'],      // clean, readable body text
        serif: ['"Lora"', 'serif']            // elegant serif for certain headings
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