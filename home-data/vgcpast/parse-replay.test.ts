/**
 * Vitest fixture test for parseReplay() against the canonical sample replay
 * (`storage/raw-recon/48-vgcpast-sample-replay.html`, the "9wtt vs.
 * VerdugoMC" Reg M-A doubles game).
 *
 * Run with: `npx vitest run home-data/vgcpast/parse-replay.test.ts`.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReplayMon } from "../types/replay.js";
import { parseReplay } from "./parse-replay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = resolve(
  __dirname,
  "..",
  "storage",
  "raw-recon",
  "48-vgcpast-sample-replay.html",
);

function findMon(team: { preview: ReplayMon[]; brought: ReplayMon[] }, species: string) {
  // Look in brought first (richer info), then preview.
  const matches = (m: ReplayMon) =>
    m.species === species ||
    m.species.replace(/-(Mega(?:-X|-Y)?|Primal)$/, "") === species;
  return (
    team.brought.find(matches) ?? team.preview.find(matches) ?? null
  );
}

describe("parseReplay (9wtt vs VerdugoMC sample)", () => {
  it("parses metadata, players, teams and revealed info correctly", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const parsed = parseReplay(html, {
      tierDir: "Gen9VGCRegulationM-A",
      file: "Gen9VGCRegulationM-A_9wtt_VerdugoMC_battle-gen9vgcregulationma-716983.html",
      url: "",
      size: html.length,
      hash: "",
    });

    // --- top-level metadata ---
    expect(parsed.winner).toBe("9wtt");
    expect(parsed.tier).toBe("[Gen 9] VGC Regulation M-A");
    expect(parsed.gametype).toBe("doubles");
    expect(parsed.rated).toBe(true);

    // --- players ---
    expect(parsed.players).toHaveLength(2);
    const p1 = parsed.players.find((p) => p.side === "p1");
    const p2 = parsed.players.find((p) => p.side === "p2");
    expect(p1?.name).toBe("9wtt");
    expect(p2?.name).toBe("VerdugoMC");
    expect(p1?.rating).toBe(1109);
    expect(p2?.rating).toBe(1057);

    // --- rating change ---
    expect(parsed.ratingChange).toBeDefined();
    const rc9wtt = parsed.ratingChange!.find((r) => r.name === "9wtt");
    const rcVerdugo = parsed.ratingChange!.find(
      (r) => r.name === "VerdugoMC",
    );
    expect(rc9wtt?.before).toBe(1109);
    expect(rc9wtt?.after).toBe(1130);
    expect(rcVerdugo?.before).toBe(1057);
    expect(rcVerdugo?.after).toBe(1048);

    // --- teampreview ---
    const team1 = parsed.teams.find((t) => t.side === "p1")!;
    const team2 = parsed.teams.find((t) => t.side === "p2")!;
    expect(team1.preview).toHaveLength(6);
    expect(team2.preview).toHaveLength(6);

    // p1 should include all expected mons
    const p1PreviewSpecies = team1.preview.map((m) => m.species);
    expect(p1PreviewSpecies).toEqual(
      expect.arrayContaining([
        "Gengar",
        "Froslass",
        "Politoed",
        "Sneasler",
        "Basculegion",
        "Typhlosion-Hisui",
      ]),
    );

    // --- Gengar (mega + Gengarite) ---
    const gengar = findMon(team1, "Gengar");
    expect(gengar).not.toBeNull();
    expect(gengar!.megaEvolved).toBe(true);
    expect(gengar!.itemRevealed).toBe("Gengarite");
    // Ability revealed via |raw| broadcast
    expect(gengar!.abilityRevealed).toBe("Shadow Tag");

    // --- Politoed (Drizzle, Leftovers) ---
    const politoed = findMon(team1, "Politoed");
    expect(politoed).not.toBeNull();
    expect(politoed!.abilityRevealed).toBe("Drizzle");

    // --- Archaludon (Leftovers + Stamina) ---
    const archaludon = findMon(team2, "Archaludon");
    expect(archaludon).not.toBeNull();
    expect(archaludon!.itemRevealed).toBe("Leftovers");
    expect(archaludon!.abilityRevealed).toBe("Stamina");

    // --- bring counts ---
    expect(team1.bringCount).toBe(4);
    expect(team2.bringCount).toBe(4);

    // --- brought mons (player 1 should have at least 4 distinct switched mons) ---
    expect(team1.brought.length).toBeGreaterThanOrEqual(4);
  });
});
