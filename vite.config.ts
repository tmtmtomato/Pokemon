import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const entry = process.env.VITE_ENTRY;

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: false,
    rollupOptions: {
      input: entry === 'tracker'
        ? { tracker: 'index-tracker.html' }
        : entry === 'meta'
          ? { meta: 'meta.html' }
          : entry === 'teams'
            ? { teams: 'teams.html' }
            : entry === 'singles'
              ? { singles: 'singles.html' }
              : entry === 'matchup'
                ? { matchup: 'matchup.html' }
                : entry === 'moves'
                  ? { moves: 'moves.html' }
                  : entry === 'firepower'
                    ? { firepower: 'firepower.html' }
                    : entry === 'ml'
                    ? { ml: 'ml.html' }
                    : { calc: 'calc.html' },
    },
  },
});
