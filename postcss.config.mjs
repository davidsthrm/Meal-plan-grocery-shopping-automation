// Tailwind runs as a PostCSS plugin, the way the Next.js guide sets it up. The Turbopack
// loader that was here before kept serving the stylesheet from when the dev server started:
// a change to globals.css only showed after a restart.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
