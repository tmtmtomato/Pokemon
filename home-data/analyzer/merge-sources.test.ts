/**
 * Unit tests for the pure `mergeFormat` function in merge-sources.ts.
 *
 * We deliberately avoid touching the real Pikalytics / vgcpast storage
 * here — instead, hand-built fixtures verify that:
 *   - Pokemon common to both sources get their moves/items/abilities
 *     from Pikalytics and winRate from vgcpast.
 *   - Pokemon that only appear in Pikalytics still produce a complete
 *     PokemonMeta with no winRate.
 *   - Pokemon that only appear in vgcpast are still included with
 *     counts-derived WeightedRows.
 *   - The top-10 usagePct sum stays roughly in the 100 ballpark for the
 *     Pikalytics-preferred entries, i.e. the merge doesn't accidentally
 *     rescale Pikalytics values.
 */

import { describe, expect, it } from "vitest";

import {
  combineVgcpastTiers,
  mergeFormat,
  parseTopBuild,
  type VgcpastFormatAggregate,
  type VgcpastTierSummary,
} from "./merge-sources.js";
import type {
  PikalyticsFormatIndex,
  PikalyticsPokemonStats,
} from "../types/pikalytics.js";

function makePikaStats(
  pokemon: string,
  overrides: Partial<PikalyticsPokemonStats> = {},
): PikalyticsPokemonStats {
  return {
    pokemon,
    format: "championspreview",
    game: "Pokémon Scarlet Violet",
    dataDate: "2026-03",
    moves: [],
    abilities: [],
    items: [],
    teammates: [],
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100, bst: 600 },
    rawMarkdown: "",
    ...overrides,
  };
}

function makeIndex(
  topPokemon: { name: string; usagePct: number; rank: number }[],
): PikalyticsFormatIndex {
  return {
    format: "championspreview",
    fetchedAt: "2026-04-08T00:00:00.000Z",
    topPokemon,
  };
}

function makeVgcpast(overrides: Partial<VgcpastFormatAggregate> = {}): VgcpastFormatAggregate {
  return {
    totalReplays: 100,
    tierLabels: ["Gen9VGCRegulationM-A (100)"],
    pokemon: {},
    ...overrides,
  };
}

describe("mergeFormat", () => {
  it("combines Pikalytics rows with vgcpast winRate for shared Pokemon", () => {
    const pikaStats = [
      makePikaStats("Incineroar", {
        moves: [
          { name: "Fake Out", pct: 41.092 },
          { name: "Parting Shot", pct: 21.185 },
        ],
        abilities: [{ name: "Intimidate", pct: 60.647 }],
        items: [{ name: "Sitrus Berry", pct: 8.305 }],
        teammates: [{ name: "Sinistcha", pct: 31.618 }],
      }),
    ];
    const index = makeIndex([
      { name: "Incineroar", usagePct: 48.27, rank: 1 },
    ]);
    const vgcpast = makeVgcpast({
      totalReplays: 100,
      pokemon: {
        Incineroar: {
          usageCount: 50,
          usagePct: 25,
          brought: 50,
          wins: 30,
          winRate: 60,
          items: { "Sitrus Berry": 40, "Rocky Helmet": 10 },
          abilities: { Intimidate: 50 },
          moves: { "Fake Out": 50, "Parting Shot": 25 },
          teraTypes: { Water: 20, Grass: 5 },
          teammates: { Sinistcha: 15 },
          opponents: {},
        },
      },
    });

    const result = mergeFormat({
      formatKey: "championspreview",
      pikalyticsIndex: index,
      pikalyticsStats: pikaStats,
      vgcpast,
    });

    expect(result.formatKey).toBe("championspreview");
    expect(result.totalReplays).toBe(100);
    expect(result.totalTeams).toBe(200);
    expect(result.sources).toEqual(["pikalytics", "vgcpast"]);
    expect(result.pokemon).toHaveLength(1);

    const [mon] = result.pokemon;
    expect(mon.name).toBe("Incineroar");
    expect(mon.rank).toBe(1);
    expect(mon.usagePct).toBeCloseTo(48.27, 5);
    // Moves come from Pikalytics, not vgcpast counts.
    expect(mon.moves.map((r) => r.name)).toEqual(["Fake Out", "Parting Shot"]);
    expect(mon.moves[0].pct).toBeCloseTo(41.092, 5);
    // winRate comes from vgcpast.
    expect(mon.winRate).toBe(60);
    // Notes should mention both sources.
    expect(mon.notes.some((n) => n.startsWith("Pikalytics"))).toBe(true);
    expect(mon.notes.some((n) => n.startsWith("vgcpast"))).toBe(true);
  });

  it("includes Pokemon that only appear in Pikalytics", () => {
    const pikaStats = [
      makePikaStats("Sneasler", {
        moves: [{ name: "Close Combat", pct: 55 }],
        abilities: [{ name: "Unburden", pct: 70 }],
        items: [{ name: "Focus Sash", pct: 30 }],
        teammates: [{ name: "Whimsicott", pct: 20 }],
      }),
    ];
    const index = makeIndex([
      { name: "Sneasler", usagePct: 29.13, rank: 2 },
    ]);
    const vgcpast = makeVgcpast({ pokemon: {} });

    const result = mergeFormat({
      formatKey: "championspreview",
      pikalyticsIndex: index,
      pikalyticsStats: pikaStats,
      vgcpast,
    });
    expect(result.pokemon).toHaveLength(1);
    const [mon] = result.pokemon;
    expect(mon.name).toBe("Sneasler");
    expect(mon.winRate).toBeUndefined();
    expect(mon.moves.map((r) => r.name)).toEqual(["Close Combat"]);
    expect(mon.notes.some((n) => n.startsWith("Pikalytics"))).toBe(true);
  });

  it("includes Pokemon that only appear in vgcpast", () => {
    const vgcpast = makeVgcpast({
      totalReplays: 50,
      pokemon: {
        "Skarmory-Mega": {
          usageCount: 10,
          usagePct: 10,
          brought: 10,
          wins: 4,
          winRate: 40,
          items: { Skarmorite: 10 },
          abilities: { Stalwart: 10 },
          moves: { "Sand Tomb": 8, Protect: 5, "Brave Bird": 4 },
          teraTypes: {},
          teammates: { Hippowdon: 5 },
          opponents: {},
        },
      },
    });

    const result = mergeFormat({
      formatKey: "championspreview",
      pikalyticsIndex: makeIndex([]),
      pikalyticsStats: [],
      vgcpast,
    });
    expect(result.pokemon).toHaveLength(1);
    const [mon] = result.pokemon;
    expect(mon.name).toBe("Skarmory-Mega");
    // Usage falls back to vgcpast.
    expect(mon.usagePct).toBeCloseTo(10, 5);
    expect(mon.winRate).toBe(40);
    // Moves are derived from counts, sorted by descending pct.
    expect(mon.moves[0].name).toBe("Sand Tomb");
    expect(mon.moves[0].n).toBe(8);
    expect(mon.moves[0].pct).toBeCloseTo((8 / 10) * 100, 5);
    // Synthetic rank assigned (nonzero).
    expect(mon.rank).toBeGreaterThan(0);
  });

  it("keeps the top-50 Pikalytics usage ballpark around 100%", () => {
    const usages = Array.from({ length: 50 }, (_, i) => ({
      name: `Mon${i + 1}`,
      usagePct: 2, // 50 * 2 = 100 total
      rank: i + 1,
    }));
    const pikaStats = usages.map((u) =>
      makePikaStats(u.name, {
        moves: [{ name: "Tackle", pct: 100 }],
        abilities: [{ name: "Intimidate", pct: 100 }],
        items: [{ name: "Leftovers", pct: 100 }],
        teammates: [],
      }),
    );
    const result = mergeFormat({
      formatKey: "championspreview",
      pikalyticsIndex: makeIndex(usages),
      pikalyticsStats: pikaStats,
      vgcpast: null,
    });

    const sum = result.pokemon.reduce((s, p) => s + p.usagePct, 0);
    expect(sum).toBeCloseTo(100, 5);
    expect(result.sources).toEqual(["pikalytics"]);
    expect(result.totalReplays).toBe(0);
  });
});

describe("parseTopBuild", () => {
  it("extracts nature, EV spread, and adoption pct", () => {
    const md =
      "### What is the most common EV Spread and Nature for Alomomola?\n" +
      "The top build for Alomomola features a **Relaxed** nature with an EV spread of `252/0/236/0/20/0`. This configuration accounts for 20.406% of competitive builds.\n";
    const got = parseTopBuild(md);
    expect(got).toEqual({
      nature: "Relaxed",
      evs: "252/0/236/0/20/0",
      pct: 20.406,
    });
  });

  it("returns undefined when Pikalytics has no spread data", () => {
    const md =
      "### What is the most common EV Spread and Nature for Incineroar?\n" +
      "No EV spread or nature data available.\n";
    expect(parseTopBuild(md)).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(parseTopBuild(undefined)).toBeUndefined();
    expect(parseTopBuild("")).toBeUndefined();
  });
});

describe("mergeFormat with topBuild parsing", () => {
  it("parses topBuild from rawMarkdown when present", () => {
    const pikaStats = [
      makePikaStats("Alomomola", {
        format: "gen9ou",
        rawMarkdown:
          "The top build for Alomomola features a **Relaxed** nature with an EV spread of `252/0/236/0/20/0`. This configuration accounts for 20.406% of competitive builds.",
      }),
    ];
    const result = mergeFormat({
      formatKey: "gen9ou",
      pikalyticsIndex: makeIndex([
        { name: "Alomomola", usagePct: 30, rank: 1 },
      ]),
      pikalyticsStats: pikaStats,
      vgcpast: null,
    });
    expect(result.pokemon[0].topBuild).toEqual({
      nature: "Relaxed",
      evs: "252/0/236/0/20/0",
      pct: 20.406,
    });
  });

  it("leaves topBuild undefined when not in markdown", () => {
    const pikaStats = [makePikaStats("Incineroar", { rawMarkdown: "No EV spread or nature data available." })];
    const result = mergeFormat({
      formatKey: "championspreview",
      pikalyticsIndex: makeIndex([{ name: "Incineroar", usagePct: 48, rank: 1 }]),
      pikalyticsStats: pikaStats,
      vgcpast: null,
    });
    expect(result.pokemon[0].topBuild).toBeUndefined();
  });
});

describe("combineVgcpastTiers", () => {
  it("sums counts across multiple tier summaries", () => {
    const tierA: VgcpastTierSummary = {
      tier: "Gen9VGCRegulationM-A",
      safeTier: "Gen9VGCRegulationM-A",
      totalReplays: 100,
      pokemon: {
        Incineroar: {
          usageCount: 40,
          usagePct: 20,
          brought: 40,
          wins: 20,
          winRate: 50,
          items: { "Sitrus Berry": 30, "Rocky Helmet": 10 },
          abilities: { Intimidate: 40 },
          moves: { "Fake Out": 35 },
          teraTypes: {},
          teammates: { Sinistcha: 20 },
          opponents: {},
        },
      },
    };
    const tierB: VgcpastTierSummary = {
      tier: "Gen9Pre-ChampionsVGC",
      safeTier: "Gen9Pre-ChampionsVGC",
      totalReplays: 200,
      pokemon: {
        Incineroar: {
          usageCount: 100,
          usagePct: 25,
          brought: 100,
          wins: 60,
          winRate: 60,
          items: { "Sitrus Berry": 80, Leftovers: 20 },
          abilities: { Intimidate: 100 },
          moves: { "Fake Out": 90, "Parting Shot": 40 },
          teraTypes: { Water: 30 },
          teammates: { Sinistcha: 50 },
          opponents: {},
        },
      },
    };

    const combined = combineVgcpastTiers([tierA, tierB]);
    expect(combined.totalReplays).toBe(300);
    const incin = combined.pokemon.Incineroar;
    expect(incin.usageCount).toBe(140);
    expect(incin.wins).toBe(80);
    // Recomputed off merged totals: 80 / 140 = ~57.14
    expect(incin.winRate).toBeCloseTo((80 / 140) * 100, 5);
    // usagePct = 140 / (300*2) * 100
    expect(incin.usagePct).toBeCloseTo((140 / 600) * 100, 5);
    expect(incin.items["Sitrus Berry"]).toBe(110);
    expect(incin.items.Leftovers).toBe(20);
    expect(incin.items["Rocky Helmet"]).toBe(10);
    expect(incin.moves["Fake Out"]).toBe(125);
    expect(incin.moves["Parting Shot"]).toBe(40);
  });
});
