import { describe, it, expect } from "vitest";
import {
  baseSpecies,
  matchupValue,
  evaluate3v3,
} from "../home-data/analyzer/team-matchup-core.js";
import type {
  DamageMatrix,
  DamageMatrixEntry,
  SimEnv,
} from "../home-data/analyzer/team-matchup-core.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<DamageMatrixEntry> = {}): DamageMatrixEntry {
  return {
    bestMove: "Test",
    minPct: 90,
    maxPct: 100,
    koN: 1,
    koChance: 1.0,
    effectiveness: 1,
    isContact: false,
    chipPctToAttacker: 0,
    weatherChipToDefender: 0,
    priorityMaxPct: 0,
    priorityKoN: 0,
    priorityKoChance: 0,
    recoilPctToSelf: 0,
    ...overrides,
  };
}

function buildMatrix(pairs: [string, string, Partial<DamageMatrixEntry>][]): DamageMatrix {
  const m: DamageMatrix = {};
  for (const [atk, def, entry] of pairs) {
    if (!m[atk]) m[atk] = {};
    m[atk][def] = makeEntry(entry);
  }
  return m;
}

function buildSimEnv(opts: {
  speeds?: Record<string, number>;
  disguise?: string[];
} = {}): SimEnv {
  return {
    weatherUsers: new Map(),
    sandChipImmune: new Set(),
    srUsers: new Set(),
    srChipPct: new Map(),
    poolTypes: new Map(),
    poolAbilities: new Map(),
    poolSpeeds: new Map(Object.entries(opts.speeds ?? {})),
    disguiseUsers: new Set(opts.disguise ?? []),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("baseSpecies", () => {
  it("strips -Mega suffix", () => {
    expect(baseSpecies("Garchomp-Mega")).toBe("Garchomp");
  });

  it("strips -HB suffix", () => {
    expect(baseSpecies("Garchomp-HB")).toBe("Garchomp");
  });

  it("strips -HD suffix", () => {
    expect(baseSpecies("Mimikyu-HD")).toBe("Mimikyu");
  });

  it("returns original for plain names", () => {
    expect(baseSpecies("Pikachu")).toBe("Pikachu");
  });

  it("does not strip non-variant suffixes", () => {
    expect(baseSpecies("Porygon-Z")).toBe("Porygon-Z");
    expect(baseSpecies("Rotom-Wash")).toBe("Rotom-Wash");
  });

  it("handles double-suffix edge case", () => {
    // Only strips the first matching suffix
    expect(baseSpecies("Test-Mega")).toBe("Test");
  });
});

describe("matchupValue with extraDefenderKoN", () => {
  const speeds = new Map([["Fast", 150], ["Slow", 80]]);

  it("first-strike OHKO (2.5) → first-strike 2HKO (1.0) with +1", () => {
    const m = buildMatrix([["Fast", "Slow", { koN: 1, koChance: 1.0 }]]);
    expect(matchupValue("Fast", "Slow", m, speeds)).toBe(2.5);
    expect(matchupValue("Fast", "Slow", m, speeds, 0, 1)).toBe(1.0);
  });

  it("slower OHKO (1.3) → slower 2HKO (0.3) with +1", () => {
    const m = buildMatrix([["Slow", "Fast", { koN: 1, koChance: 1.0 }]]);
    expect(matchupValue("Slow", "Fast", m, speeds)).toBe(1.3);
    expect(matchupValue("Slow", "Fast", m, speeds, 0, 1)).toBe(0.3);
  });

  it("first-strike 2HKO (1.0) → 3HKO = 0 with +1", () => {
    const m = buildMatrix([["Fast", "Slow", { maxPct: 55, koN: 2, koChance: 1.0 }]]);
    expect(matchupValue("Fast", "Slow", m, speeds)).toBe(1.0);
    expect(matchupValue("Fast", "Slow", m, speeds, 0, 1)).toBe(0);
  });

  it("slower 2HKO (0.3) → 3HKO = 0 with +1", () => {
    const m = buildMatrix([["Slow", "Fast", { maxPct: 55, koN: 2, koChance: 1.0 }]]);
    expect(matchupValue("Slow", "Fast", m, speeds)).toBe(0.3);
    expect(matchupValue("Slow", "Fast", m, speeds, 0, 1)).toBe(0);
  });

  it("3HKO (0) stays 0 with +1", () => {
    const m = buildMatrix([["Fast", "Slow", { maxPct: 35, koN: 3, koChance: 1.0 }]]);
    expect(matchupValue("Fast", "Slow", m, speeds)).toBe(0);
    expect(matchupValue("Fast", "Slow", m, speeds, 0, 1)).toBe(0);
  });

  it("does nothing when extraDefenderKoN is 0 or undefined", () => {
    const m = buildMatrix([["Fast", "Slow", { koN: 1, koChance: 1.0 }]]);
    const normal = matchupValue("Fast", "Slow", m, speeds);
    expect(matchupValue("Fast", "Slow", m, speeds, 0, 0)).toBe(normal);
    expect(matchupValue("Fast", "Slow", m, speeds, 0, undefined)).toBe(normal);
  });
});

describe("evaluate3v3 with Disguise", () => {
  // Team A has a Disguise user; Team B does not.
  // The Disguise user should reduce Team B's best threat by +1 koN.

  it("Disguise reduces biggest threat against Disguise user in selA", () => {
    // Mimikyu (speed 96) on team A, opponent X (speed 150) OHKOs Mimikyu
    const m = buildMatrix([
      // Team A attacks Team B
      ["A1", "B1", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["A1", "B2", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["A1", "B3", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["Mimikyu", "B1", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["Mimikyu", "B2", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["Mimikyu", "B3", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["A3", "B1", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["A3", "B2", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["A3", "B3", { koN: 2, koChance: 1.0, maxPct: 55 }],
      // Team B attacks Team A
      ["B1", "A1", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["B1", "Mimikyu", { koN: 1, koChance: 1.0, maxPct: 100 }], // OHKO threat!
      ["B1", "A3", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["B2", "A1", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["B2", "Mimikyu", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["B2", "A3", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["B3", "A1", { koN: 2, koChance: 1.0, maxPct: 55 }],
      ["B3", "Mimikyu", { koN: 3, koChance: 1.0, maxPct: 35 }],
      ["B3", "A3", { koN: 2, koChance: 1.0, maxPct: 55 }],
    ]);

    const envNoDisguise = buildSimEnv({
      speeds: { A1: 100, Mimikyu: 96, A3: 100, B1: 150, B2: 100, B3: 80 },
    });
    const envDisguise = buildSimEnv({
      speeds: { A1: 100, Mimikyu: 96, A3: 100, B1: 150, B2: 100, B3: 80 },
      disguise: ["Mimikyu"],
    });

    const selA = ["A1", "Mimikyu", "A3"];
    const selB = ["B1", "B2", "B3"];

    const resultNormal = evaluate3v3(selA, selB, m, envNoDisguise);
    const resultDisguise = evaluate3v3(selA, selB, m, envDisguise);

    // B1→Mimikyu was OHKO (matchupValue=2.5 since B1 is faster).
    // With Disguise, it becomes 2HKO → matchupValue=1.0.
    // B_total should decrease by 1.5, so scoreB decreases.
    expect(resultDisguise.scoreB).toBeLessThan(resultNormal.scoreB);
  });

  it("no Disguise effect when no Disguise user in selection", () => {
    const m = buildMatrix([
      ["A1", "B1", { koN: 1, koChance: 1.0 }],
      ["B1", "A1", { koN: 1, koChance: 1.0 }],
    ]);
    const env = buildSimEnv({ speeds: { A1: 100, B1: 100 }, disguise: ["MimikyuNotInSel"] });
    const result = evaluate3v3(["A1"], ["B1"], m, env);
    // Just verify it doesn't crash
    expect(result.winner).toBeDefined();
  });
});
