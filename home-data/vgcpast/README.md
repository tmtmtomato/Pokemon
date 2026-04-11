# vgcpast.es replay pipeline (Track B)

Scrapes the public replay archive at <https://replays.vgcpast.es> and turns
each Showdown protocol log into a normalised `ParsedReplay` JSON for the
Champions meta pipeline.

## Files

| File | Purpose |
|---|---|
| `enumerate.ts` | Fetches each tier's directory listing and produces `ListingEntry[]` JSON. |
| `fetch-replays.ts` | Downloads every replay HTML referenced by the listing JSON, with rate-limited workers. |
| `parse-replay.ts` | Pure parser that turns one replay HTML into a `ParsedReplay`. Also runnable as a CLI. |
| `parse-all.ts` | Walks the cached HTML and emits `parsed/{tier}/{battleId}.json`. |
| `aggregate.ts` | Reads parsed JSON and writes a per-tier `_summary.json` (usage, items, abilities, moves, tera, teammates, opponents). |
| `run-all.ts` | Convenience orchestrator that runs the four steps in order. |
| `parse-replay.test.ts` | Vitest fixture test against `storage/raw-recon/48-vgcpast-sample-replay.html`. |
| `vitest.config.ts` (in `home-data/`) | Test runner config that matches `home-data/**/*.test.ts`. |

## Target tiers

```ts
export const TARGET_TIERS = [
  "Gen9VGCRegulationM-A",
  "Gen9VGCRegulationM-A(Bo3)",
  "Gen9Pre-ChampionsVGC",
  "Gen9Pre-ChampionsVGC(Bo3)",
  "Gen9Pre-ChampionsOU",
];
```

## Storage layout

```
home-data/storage/vgcpast/
├── listings/
│   ├── Gen9VGCRegulationM-A.html        # raw directory snapshot
│   └── Gen9VGCRegulationM-A.json        # ListingEntry[]
├── replays/
│   └── Gen9VGCRegulationM-A/
│       ├── 716983.html                  # raw replay
│       └── _failures.json               # 404 / persistent fetch errors
└── parsed/
    └── Gen9VGCRegulationM-A/
        ├── 716983.json                  # ParsedReplay
        ├── _parse_failures.json         # parse-time errors (rare)
        └── _summary.json                # tier-level aggregate
```

Tier names that contain `(` / `)` (e.g. `Gen9VGCRegulationM-A(Bo3)`) are
flattened to `Gen9VGCRegulationM-A_Bo3_` on disk; the original name is kept
in the JSON's `tier` field.

## Usage

```bash
# 1. enumerate every tier listing (cached HTML + ListingEntry[] JSON)
npx tsx home-data/vgcpast/enumerate.ts

# 2. fetch replays (5 concurrent workers, 250 ms delay each)
npx tsx home-data/vgcpast/fetch-replays.ts --tier Gen9VGCRegulationM-A
npx tsx home-data/vgcpast/fetch-replays.ts --tier Gen9VGCRegulationM-A --limit 100

# 3. parse all cached replay HTML to JSON
npx tsx home-data/vgcpast/parse-all.ts --tier Gen9VGCRegulationM-A

# 4. tier-level aggregate
npx tsx home-data/vgcpast/aggregate.ts --tier Gen9VGCRegulationM-A

# orchestrator (1→4 in order)
npm run home:vgcpast -- --tier Gen9VGCRegulationM-A --limit 100

# parse a single replay HTML to stdout (debugging)
npx tsx home-data/vgcpast/parse-replay.ts home-data/storage/vgcpast/replays/Gen9VGCRegulationM-A/716983.html
```

## Tests

```bash
npx vitest run -c home-data/vitest.config.ts home-data/vgcpast/parse-replay.test.ts
```

## Sizing notes

| Tier | Approx. listing size | Approx. replay count |
|---|---|---|
| `Gen9VGCRegulationM-A` | ~250 KB | ~hundreds-low thousands |
| `Gen9VGCRegulationM-A(Bo3)` | small | hundreds |
| `Gen9Pre-ChampionsVGC` | ~4 MB | ~12 000+ |
| `Gen9Pre-ChampionsVGC(Bo3)` | mid | thousands |
| `Gen9Pre-ChampionsOU` | ~500 KB | ~1500 |

At ~20 req/s the full pipeline for the largest tier takes ~10–12 minutes,
so run it tier by tier or pass `--limit` for smoke tests.

## HTTP etiquette

Every request sends:

```
User-Agent: ChampionsBot/1.0 (research; pokemon-champions-meta-pipeline)
```

Failures retry with exponential backoff (1 s / 2 s / 4 s, 3 attempts).
Persistent failures land in `_failures.json` next to the replays so reruns
can target only what's missing.
