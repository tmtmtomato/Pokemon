# Champions Meta Viewer (Track D)

Single-page HTML viewer for the merged Track C meta snapshot
(`home-data/storage/analysis/2026-04-08-meta.json`). Browser-only; no
server, no network fetch — the JSON is baked into the final HTML by
`viteSingleFile()`.

## Files

| Path | Role |
| --- | --- |
| `meta.html` (repo root) | Vite entry. Mounts `/home-data/viewer/main.tsx` into `#root`. |
| `home-data/viewer/main.tsx` | React 19 `createRoot` bootstrap. |
| `home-data/viewer/App.tsx` | Lifts all filter / sort / selection state. Imports the meta JSON statically. |
| `home-data/viewer/components/Toolbar.tsx` | Top toolbar: format tabs, search, min-games, sort, source filter, theme. |
| `home-data/viewer/components/PokemonList.tsx` | Left-pane list with rank / usage / win rate and source badges. |
| `home-data/viewer/components/PokemonDetail.tsx` | Right-pane details with five sections of usage bars. |
| `home-data/viewer/components/UsageBar.tsx` | Shared horizontal bar graph row. |
| `home-data/viewer/utils.ts` | Pure filter / sort / format helpers. |
| `home-data/viewer/utils.test.ts` | Vitest unit tests for the pure helpers. |
| `home-data/viewer/styles.css` | Tailwind v4 entry (`@import "tailwindcss";`). |
| `home-data/viewer/screenshot.mjs` | Optional Playwright screenshot runner. |

## Build

```bash
npm run build:meta
```

Outputs `build/meta.html` (single HTML file, ~2 MB including the inlined
JSON and the React bundle). Open the file directly in any browser — no
`npm run dev` required.

## Screenshot

```bash
node home-data/viewer/screenshot.mjs
```

Writes `home-data/viewer/screenshots/meta.png` from `build/meta.html` via
`file://`. The script swallows errors and exits 0 when Playwright cannot
launch (e.g. on sandboxes without browser system libs).

## Tests

```bash
npx vitest run -c home-data/vitest.config.ts home-data/viewer/utils.test.ts
```

The tests cover `matchesQuery`, `extractVgcpastGames`, `filterPokemon`,
`sortPokemon`, `formatPct`, `barWidth`, and `pickDefaultPokemon`. Tests
are intentionally DOM-free so they run in the same Node environment as
the rest of the `home-data` suite.

## Usage (UI)

- **Format tabs** — switches between `championspreview` and `gen9ou`.
  Selecting a new format resets the highlighted Pokemon to rank #1.
- **Search** — case-insensitive substring over species name.
- **Min games** — hides Pokemon whose `notes` do not contain a vgcpast
  game count `>= N`.
- **Sort** — rank / usage% / win rate / name.
- **Source** — `All` / `Pikalytics` / `vgcpast` / `Both`. Filters rows
  based on which data source contributed to each entry (parsed from
  `notes`).
- **Dark toggle** — switches between dark and light body backgrounds by
  toggling the `dark` class on `<html>`.

Each Pokemon detail view renders up to 10 rows per section:

- Top Moves (blue)
- Top Abilities (emerald)
- Top Items (amber)
- Tera Types (violet, shown only when present)
- Top Teammates (pink)

The header block shows rank, usage%, win rate, and the provenance notes
from Track C (e.g. `Pikalytics 2026-03`, `vgcpast 1394 games (wr 47.9%)`).
