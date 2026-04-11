/**
 * Unit tests for the viewer's pure helpers. Run via:
 *   npx vitest run -c home-data/vitest.config.ts home-data/viewer/utils.test.ts
 */

import { describe, it, expect } from "vitest";
import type { PokemonMeta } from "../types/analytics";
import { comparePokemonName } from "./i18n";
import {
  barWidth,
  extractVgcpastGames,
  filterPokemon,
  formatPct,
  hasPikalyticsNote,
  hasVgcpastNote,
  matchesQuery,
  pickDefaultPokemon,
  sortPokemon,
} from "./utils";

function mon(partial: Partial<PokemonMeta> & { name: string; rank: number; usagePct: number }): PokemonMeta {
  return {
    moves: [],
    abilities: [],
    items: [],
    teammates: [],
    notes: [],
    ...partial,
  };
}

describe("comparePokemonName", () => {
  it("sorts by English name when lang is 'en'", () => {
    // Charizard < Pikachu alphabetically in English
    expect(comparePokemonName("Charizard", "Pikachu", "en")).toBeLessThan(0);
    expect(comparePokemonName("Pikachu", "Charizard", "en")).toBeGreaterThan(0);
  });
  it("sorts by Japanese name in gojuon order when lang is 'ja'", () => {
    // Charizard = リザードン, Pikachu = ピカチュウ
    // In gojuon order: ピカチュウ (pi) comes before リザードン (ri)
    expect(comparePokemonName("Pikachu", "Charizard", "ja")).toBeLessThan(0);
    expect(comparePokemonName("Charizard", "Pikachu", "ja")).toBeGreaterThan(0);
  });
  it("returns 0 for the same Pokemon", () => {
    expect(comparePokemonName("Pikachu", "Pikachu", "ja")).toBe(0);
    expect(comparePokemonName("Pikachu", "Pikachu", "en")).toBe(0);
  });
  it("falls back to the English name when no JP entry exists", () => {
    // Unknown names fall back to English comparison under ja locale
    expect(comparePokemonName("Zzzzmon", "Aaaamon", "ja")).toBeGreaterThan(0);
  });
});

describe("matchesQuery", () => {
  it("matches empty query", () => {
    expect(matchesQuery("Incineroar", "")).toBe(true);
  });
  it("is case-insensitive", () => {
    expect(matchesQuery("Incineroar", "incin")).toBe(true);
    expect(matchesQuery("Incineroar", "ROAR")).toBe(true);
  });
  it("returns false when no match", () => {
    expect(matchesQuery("Incineroar", "gengar")).toBe(false);
  });
  it("matches the localized JP form", () => {
    // 'ガオガエン' is the JP name for Incineroar in pokemon-ja.json.
    expect(matchesQuery("Incineroar", "ガオガエン")).toBe(true);
    expect(matchesQuery("Incineroar", "ガオ")).toBe(true);
  });
});

describe("extractVgcpastGames", () => {
  it("parses the vgcpast note format", () => {
    const m = mon({
      name: "Incineroar",
      rank: 1,
      usagePct: 48,
      notes: ["Pikalytics 2026-03", "vgcpast 1394 games (wr 47.9%)"],
    });
    expect(extractVgcpastGames(m)).toBe(1394);
  });
  it("returns 0 when no vgcpast note present", () => {
    const m = mon({
      name: "Foo",
      rank: 99,
      usagePct: 1,
      notes: ["Pikalytics 2026-03"],
    });
    expect(extractVgcpastGames(m)).toBe(0);
  });
});

describe("hasPikalyticsNote / hasVgcpastNote", () => {
  const m = mon({
    name: "Incineroar",
    rank: 1,
    usagePct: 48,
    notes: ["Pikalytics 2026-03", "vgcpast 1394 games (wr 47.9%)"],
  });
  it("detects Pikalytics source", () => {
    expect(hasPikalyticsNote(m)).toBe(true);
  });
  it("detects vgcpast source", () => {
    expect(hasVgcpastNote(m)).toBe(true);
  });
});

describe("filterPokemon", () => {
  const list: PokemonMeta[] = [
    mon({ name: "Incineroar", rank: 1, usagePct: 48, notes: ["Pikalytics 2026-03", "vgcpast 1394 games (wr 47.9%)"] }),
    mon({ name: "Sneasler", rank: 2, usagePct: 29, notes: ["Pikalytics 2026-03", "vgcpast 310 games (wr 50%)"] }),
    mon({ name: "Whimsicott", rank: 3, usagePct: 25, notes: ["Pikalytics 2026-03"] }),
  ];

  it("returns all rows when no filters", () => {
    expect(filterPokemon(list, "", 0).length).toBe(3);
  });

  it("applies query filter", () => {
    const got = filterPokemon(list, "snea", 0);
    expect(got.map((m) => m.name)).toEqual(["Sneasler"]);
  });

  it("applies minGames filter", () => {
    const got = filterPokemon(list, "", 500);
    expect(got.map((m) => m.name)).toEqual(["Incineroar"]);
  });

  it("applies vgcpast-only source filter", () => {
    const got = filterPokemon(list, "", 0, "vgcpast");
    expect(got.map((m) => m.name)).toEqual(["Incineroar", "Sneasler"]);
  });

  it("applies both-sources filter", () => {
    const got = filterPokemon(list, "", 0, "both");
    expect(got.map((m) => m.name)).toEqual(["Incineroar", "Sneasler"]);
  });
});

describe("sortPokemon", () => {
  const list: PokemonMeta[] = [
    mon({ name: "Beta", rank: 3, usagePct: 10, winRate: 70 }),
    mon({ name: "Alpha", rank: 1, usagePct: 40, winRate: 50 }),
    mon({ name: "Gamma", rank: 2, usagePct: 20, winRate: 60 }),
  ];

  it("sorts by rank ascending", () => {
    expect(sortPokemon(list, "rank").map((m) => m.name)).toEqual(["Alpha", "Gamma", "Beta"]);
  });
  it("sorts by usage descending", () => {
    expect(sortPokemon(list, "usage").map((m) => m.name)).toEqual(["Alpha", "Gamma", "Beta"]);
  });
  it("sorts by winRate descending", () => {
    expect(sortPokemon(list, "winRate").map((m) => m.name)).toEqual(["Beta", "Gamma", "Alpha"]);
  });
  it("sorts by name ascending (default ja locale)", () => {
    expect(sortPokemon(list, "name").map((m) => m.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
  it("sorts by name ascending with explicit en locale", () => {
    expect(sortPokemon(list, "name", "en").map((m) => m.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
  it("does not mutate the input", () => {
    const before = list.map((m) => m.name);
    sortPokemon(list, "name");
    expect(list.map((m) => m.name)).toEqual(before);
  });
});

describe("formatPct", () => {
  it("formats integers without decimals", () => {
    expect(formatPct(100)).toBe("100%");
  });
  it("formats fractional values with 2 digits", () => {
    expect(formatPct(41.092)).toBe("41.09%");
  });
  it("returns '-' for undefined", () => {
    expect(formatPct(undefined)).toBe("-");
  });
});

describe("barWidth", () => {
  it("clamps below 0", () => {
    expect(barWidth(-5)).toBe("0.00%");
  });
  it("clamps above 100", () => {
    expect(barWidth(150)).toBe("100.00%");
  });
  it("formats normal values", () => {
    expect(barWidth(41.092)).toBe("41.09%");
  });
});

describe("pickDefaultPokemon", () => {
  it("returns the rank-1 entry regardless of list order", () => {
    const fmt = {
      formatKey: "test",
      display: "Test",
      sources: ["pikalytics" as const],
      totalReplays: 0,
      totalTeams: 0,
      pokemon: [
        mon({ name: "Beta", rank: 3, usagePct: 10 }),
        mon({ name: "Alpha", rank: 1, usagePct: 40 }),
        mon({ name: "Gamma", rank: 2, usagePct: 20 }),
      ],
    };
    expect(pickDefaultPokemon(fmt)?.name).toBe("Alpha");
  });
  it("returns undefined for an empty list", () => {
    const fmt = {
      formatKey: "test",
      display: "Test",
      sources: ["pikalytics" as const],
      totalReplays: 0,
      totalTeams: 0,
      pokemon: [],
    };
    expect(pickDefaultPokemon(fmt)).toBeUndefined();
  });
});
