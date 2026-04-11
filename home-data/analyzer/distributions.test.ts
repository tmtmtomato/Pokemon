/**
 * Unit tests for `buildDistributions` / `toPmf` in distributions.ts.
 *
 * Focus areas:
 *   - Every non-empty PMF sums to exactly 1 (within 1e-6).
 *   - Empty inputs produce empty arrays rather than NaN entries.
 *   - Zero / negative weights are silently ignored.
 *   - Output rows are sorted descending by probability.
 */

import { describe, expect, it } from "vitest";

import {
  buildDistributions,
  formatMetaToDistribution,
  toPmf,
  type DistributionsFile,
} from "./distributions.js";
import type { MetaSnapshot } from "../types/analytics.js";

describe("toPmf", () => {
  it("normalises positive weights to sum to 1", () => {
    const pmf = toPmf([
      { name: "A", pct: 40 },
      { name: "B", pct: 30 },
      { name: "C", pct: 10 },
    ]);
    const sum = pmf.reduce((s, r) => s + r.p, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(pmf.map((r) => r.name)).toEqual(["A", "B", "C"]);
    expect(pmf[0].p).toBeCloseTo(40 / 80, 6);
  });

  it("returns an empty array for empty/undefined input", () => {
    expect(toPmf(undefined)).toEqual([]);
    expect(toPmf([])).toEqual([]);
  });

  it("drops zero and negative weights", () => {
    const pmf = toPmf([
      { name: "A", pct: 50 },
      { name: "B", pct: 0 },
      { name: "C", pct: -5 },
      { name: "D", pct: 50 },
    ]);
    expect(pmf.map((r) => r.name)).toEqual(["A", "D"]);
    const sum = pmf.reduce((s, r) => s + r.p, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("handles NaN / Infinity gracefully", () => {
    const pmf = toPmf([
      { name: "A", pct: Number.NaN },
      { name: "B", pct: Number.POSITIVE_INFINITY },
      { name: "C", pct: 10 },
    ]);
    // Only C is finite and positive -> it becomes 1.
    expect(pmf).toHaveLength(1);
    expect(pmf[0].name).toBe("C");
    expect(pmf[0].p).toBeCloseTo(1, 6);
  });
});

describe("buildDistributions / formatMetaToDistribution", () => {
  const snapshot: MetaSnapshot = {
    generatedAt: "2026-04-08T00:00:00.000Z",
    formats: [
      {
        formatKey: "championspreview",
        display: "Preview",
        sources: ["pikalytics"],
        totalReplays: 0,
        totalTeams: 0,
        pokemon: [
          {
            name: "Incineroar",
            usagePct: 48.27,
            rank: 1,
            moves: [
              { name: "Fake Out", pct: 41.092 },
              { name: "Parting Shot", pct: 21.185 },
              { name: "Flare Blitz", pct: 19.934 },
            ],
            abilities: [{ name: "Intimidate", pct: 60.647 }],
            items: [
              { name: "Sitrus Berry", pct: 8.305 },
              { name: "Rocky Helmet", pct: 2.046 },
            ],
            teammates: [{ name: "Sinistcha", pct: 31.618 }],
            teraTypes: [
              { name: "Water", pct: 40 },
              { name: "Grass", pct: 20 },
            ],
            notes: [],
          },
          {
            name: "EmptyMon",
            usagePct: 0,
            rank: 50,
            moves: [],
            abilities: [],
            items: [],
            teammates: [],
            notes: [],
          },
        ],
      },
    ],
  };

  it("produces PMFs that each sum to 1 (or 0 when empty)", () => {
    const file: DistributionsFile = buildDistributions(snapshot);
    expect(file.formats).toHaveLength(1);
    const format = file.formats[0];
    expect(format.pokemon).toHaveLength(2);

    const incin = format.pokemon[0];
    const axes = ["moves", "items", "abilities", "teammates"] as const;
    for (const axis of axes) {
      const rows = incin[axis];
      const sum = rows.reduce((s, r) => s + r.p, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
    expect(incin.teraTypes).toBeDefined();
    const teraSum = (incin.teraTypes ?? []).reduce((s, r) => s + r.p, 0);
    expect(teraSum).toBeCloseTo(1, 6);

    const empty = format.pokemon[1];
    expect(empty.moves).toEqual([]);
    expect(empty.items).toEqual([]);
    expect(empty.abilities).toEqual([]);
    expect(empty.teammates).toEqual([]);
    expect(empty.teraTypes).toBeUndefined();
  });

  it("preserves name and usagePct on each distribution row", () => {
    const file = buildDistributions(snapshot);
    expect(file.formats[0].pokemon[0].name).toBe("Incineroar");
    expect(file.formats[0].pokemon[0].usagePct).toBeCloseTo(48.27, 6);
  });

  it("formatMetaToDistribution matches buildDistributions for a single format", () => {
    const direct = formatMetaToDistribution(snapshot.formats[0]);
    const viaFile = buildDistributions(snapshot).formats[0];
    expect(direct.formatKey).toBe(viaFile.formatKey);
    expect(direct.pokemon.length).toBe(viaFile.pokemon.length);
    expect(direct.pokemon[0].moves).toEqual(viaFile.pokemon[0].moves);
  });
});
