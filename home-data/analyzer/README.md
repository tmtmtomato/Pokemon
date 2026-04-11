# home-data/analyzer — Track C

Track C fuses the two upstream raw-data collectors into a single
format-keyed meta snapshot and derives a few downstream views from it.

```
Track A  Pikalytics {date}/{format}/*.json ─┐
                                             ├─► merge-sources ─► {date}-meta.json
Track B  vgcpast parsed/{tier}/_summary.json ┘                      │
                                                                    ├─► distributions ─► {date}-distributions.json
                                                                    │
vgcpast parsed/{tier}/{id}.json (ParsedReplay) ────────────────────► matchups ────────► {date}-matchups.json
```

All outputs live in `home-data/storage/analysis/`.

## Format → vgcpast tier mapping

| Pikalytics format | vgcpast tiers |
|---|---|
| `championspreview` | `Gen9VGCRegulationM-A`, `Gen9VGCRegulationM-A_Bo3_`, `Gen9Pre-ChampionsVGC`, `Gen9Pre-ChampionsVGC_Bo3_` |
| `gen9ou` | `Gen9Pre-ChampionsOU` |

Pikalytics format directories that don't have a vgcpast counterpart are
still merged and written to the snapshot, they just have
`sources === ["pikalytics"]` and `totalReplays === 0`.

## Scripts

```bash
# Full pipeline (merge → distributions → matchups)
npm run home:analyze -- --date 2026-04-08

# Individual steps
npx tsx home-data/analyzer/merge-sources.ts --date 2026-04-08
npx tsx home-data/analyzer/distributions.ts --date 2026-04-08
npx tsx home-data/analyzer/matchups.ts      --date 2026-04-08 [--tier Gen9VGCRegulationM-A]
```

If `--date` is omitted, today's UTC date is used; if today doesn't have
any Pikalytics data yet, `merge-sources` automatically falls back to the
latest `YYYY-MM-DD` directory found under
`home-data/storage/pikalytics/`.

## File shapes

### `{date}-meta.json`  (`MetaSnapshot`)

```ts
{
  generatedAt: string;
  formats: Array<{
    formatKey: string;                               // "championspreview"
    display:   string;                               // "Pokemon Champions VGC 2026 (preview)"
    sources:   Array<"pikalytics" | "vgcpast" | "home">;
    totalReplays: number;                            // summed vgcpast replays across mapped tiers
    totalTeams:   number;                            // totalReplays * 2
    pokemon: Array<{
      name: string;
      usagePct: number;      // 0-100 (Pikalytics preferred, falls back to vgcpast)
      rank: number;          // 1-indexed; synthetic rank for vgcpast-only entries
      winRate?: number;      // 0-100, from vgcpast wins/usageCount
      moves:       WeightedRow[];
      abilities:   WeightedRow[];
      items:       WeightedRow[];
      teraTypes?:  WeightedRow[];
      teammates:   WeightedRow[];
      notes: string[];       // e.g. "Pikalytics 2026-03", "vgcpast 123 games (wr 54.8%)"
    }>;
  }>;
}
```

A `WeightedRow` is `{ name, pct, n? }` where `pct` is in the 0-100 range
and `n` is the raw vgcpast sample count (only populated when the row was
derived from vgcpast counts rather than Pikalytics).

### `{date}-distributions.json`

Normalised probability mass functions for each Pokemon, ready to be
consumed by Bayesian predictors.

```ts
{
  generatedAt: string;
  formats: Array<{
    formatKey: string;
    pokemon: Array<{
      name: string;
      usagePct: number;
      moves:     Array<{ name: string; p: number }>; // Σp = 1 (or [] if empty)
      items:     Array<{ name: string; p: number }>;
      abilities: Array<{ name: string; p: number }>;
      teammates: Array<{ name: string; p: number }>;
      teraTypes?: Array<{ name: string; p: number }>;
    }>;
  }>;
}
```

### `{date}-matchups.json`

Co-occurrence win rates computed from `ParsedReplay` files. "1v1" is a
misnomer — vgcpast doesn't reliably tell us which individual mons
engaged each other — so we count every pair of (winning-side species,
losing-side species) as one game won by the winning side. That's
sufficient for a first-pass matchup matrix.

```ts
{
  generatedAt: string;
  tiers: Array<{
    tier: string;            // safeTier, e.g. "Gen9VGCRegulationM-A"
    totalReplays: number;
    pairs: Array<{
      a: string;             // species (alphabetically first)
      b: string;             // species (alphabetically second)
      games: number;
      aWins: number;
      bWins: number;
      aWinRate: number;      // aWins / games
    }>;
  }>;
}
```

Tiers with more than 10,000 distinct pairs are filtered to `games >= 3`
before being written to disk to keep the file size reasonable.

## Tests

```bash
npx vitest run -c home-data/vitest.config.ts home-data/analyzer/
```

`merge-sources.test.ts` covers the pure `mergeFormat` and
`combineVgcpastTiers` functions with hand-built fixtures;
`distributions.test.ts` covers `toPmf` and `buildDistributions`.
`matchups.ts` is exercised via the real-data end-to-end run.
