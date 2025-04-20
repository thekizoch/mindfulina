// New file: Tailwind configuration with custom theme
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  theme: {
    extend: {
      colors: {
        ocean:  '#0e7f9e',   // blue‑green lagoon
        sand:   '#fde7c3',
        hibisc: '#ff5e6c',   // hibiscus pink
      },
      fontFamily: {
        display: ['"Pacifico"', 'cursive'],   // hand‑lettered header font
      },
    },
  },
  plugins: [],
}; 