# Pikalytics Fetcher (Track A)

This directory implements **Track A** of the Pokemon Champions data pipeline:
fetching and parsing the official Pikalytics AI markdown endpoints.

All scripts are TypeScript, run via `tsx`, and use only the Node standard
library — no third-party HTTP or markdown parsers.

## Storage layout

```
home-data/storage/pikalytics/
├── llms-full.txt                         # Pikalytics API spec mirror
└── {date}/{format}/
    ├── _index.md                         # raw format index markdown
    ├── _index.json                       # parsed top Pokemon list (PikalyticsFormatIndex)
    ├── _failures.json                    # fetch failures (if any)
    ├── _parse-failures.json              # parse failures (if any)
    ├── {Pokemon}.md                      # raw per-Pokemon markdown
    └── {Pokemon}.json                    # parsed per-Pokemon stats (PikalyticsPokemonStats)
```

`{date}` is `YYYY-MM-DD` (UTC). `{format}` is the Pikalytics format key,
e.g. `championspreview`, `gen9ou`, `gen9vgc2026regf`.

## Scripts

| Script | Purpose |
|---|---|
| `fetch-llms.ts` | Mirrors `https://www.pikalytics.com/llms-full.txt`. |
| `fetch-format-index.ts` | Downloads `/ai/pokedex/{format}` and parses the top-50 listing. |
| `fetch-pokemon.ts` | Downloads `/ai/pokedex/{format}/{Pokemon}` for every Pokemon in `_index.json`. |
| `parse-markdown.ts` | Pure parser: markdown → `PikalyticsPokemonStats`. Also a CLI wrapper. |
| `parse-all.ts` | Walks all `.md` files in a `{date}/{format}` folder and writes sibling `.json`. |
| `run-all.ts` | One-shot end-to-end runner. Used by `npm run home:pikalytics`. |

All HTTP requests send:

```
User-Agent: ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)
```

Per-Pokemon fetches sleep 800 ms between successful requests and retry up to
3 times with exponential backoff (1s/2s/4s) on transient failures.

## CLI examples

```bash
# Mirror the API spec only.
npx tsx home-data/pikalytics/fetch-llms.ts

# Pull just the top-50 index for a format.
npx tsx home-data/pikalytics/fetch-format-index.ts --format championspreview

# Pull every Pokemon page listed in _index.json.
npx tsx home-data/pikalytics/fetch-pokemon.ts --format championspreview

# Re-fetch even if files exist.
npx tsx home-data/pikalytics/fetch-pokemon.ts --format gen9ou --force

# Parse every .md in a folder into a sibling .json.
npx tsx home-data/pikalytics/parse-all.ts --format championspreview

# Run the entire pipeline for one or more formats.
npm run home:pikalytics -- --format championspreview,gen9ou
```

CLI flags:

- `--format <key>` — Pikalytics format key. Default: `championspreview`
  (`run-all.ts` defaults to `championspreview,gen9ou`).
- `--date <YYYY-MM-DD>` — storage subfolder. Default: today (UTC).
- `--force` — re-download Pokemon files even if they already exist.

## Tests

A small Vitest suite covers `parsePikalyticsMarkdown` against the
`storage/raw-recon/41-pikalytics-incineroar.md` fixture. The repo's main
`vitest.config.ts` is intentionally restricted to `tests/**`, so a local
config is included alongside the tests:

```bash
npx vitest run --config home-data/pikalytics/vitest.config.ts
```

## Type definitions

All types are exported from `home-data/types/pikalytics.ts` and re-exported
through `home-data/types/index.ts`:

- `PikalyticsPokemonStats`
- `PikalyticsBaseStats`
- `PikalyticsFormatIndex`
- `PikalyticsFormatIndexEntry`
- `UsageRow`
- `SpreadRow`
