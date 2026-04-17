import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * All page entries. Add new pages here — `build:pages` picks them up automatically.
 * Key = VITE_ENTRY value, Value = source HTML file in project root.
 */
const PAGES: Record<string, string> = {
  calc:      'calc.html',
  tracker:   'index-tracker.html',
  meta:      'meta.html',
  teams:     'teams.html',
  singles:   'singles.html',
  matchup:   'matchup.html',
  moves:     'moves.html',
  firepower: 'firepower.html',
  ml:        'ml.html',
  history:   'history.html',
  builder:   'builder.html',
};

const entry = process.env.VITE_ENTRY;

function getInput(): Record<string, string> {
  if (!entry) {
    throw new Error(
      `VITE_ENTRY not set. Use build:pages to build all, or VITE_ENTRY=<name> for one.\n` +
      `  Valid entries: ${Object.keys(PAGES).join(', ')}`,
    );
  }
  if (!(entry in PAGES)) {
    throw new Error(`Unknown VITE_ENTRY="${entry}". Valid: ${Object.keys(PAGES).join(', ')}`);
  }
  return { [entry]: PAGES[entry] };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: false,
    rollupOptions: {
      input: getInput(),
    },
  },
});
