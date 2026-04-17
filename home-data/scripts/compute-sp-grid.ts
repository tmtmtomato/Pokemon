#!/usr/bin/env npx tsx
/**
 * compute-sp-grid.ts — Precompute SP damage grids for the Team Builder.
 *
 * For each top-team member × top-100 opponents × all relevant moves × SP 0-32,
 * compute damage results and write to _latest-sp-grid.json.
 *
 * This eliminates runtime recalcDamage() calls in the builder's threshold analysis.
 *
 * Runs as a prebuild step in build-all.mjs (after _latest-team-matchup.json exists).
 *
 * Usage: npx tsx home-data/scripts/compute-sp-grid.ts
 * Output: home-data/storage/analysis/_latest-sp-grid.json (~1-2 MB)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { calculate, Pokemon, Move, Field } from "../../src/index";
import { baseSpecies } from "../analyzer/team-matchup-core";
import type { PoolMember, DamageMatrix } from "../types/team-matchup";
import type { NatureName } from "../../src/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const STORAGE = resolve(ROOT, "home-data/storage/analysis");

// ── Load _latest-team-matchup.json ──────────────────────────────────────────

const matchupPath = resolve(STORAGE, "_latest-team-matchup.json");
if (!existsSync(matchupPath)) {
  console.warn("[sp-grid] No _latest-team-matchup.json found — skipping");
  process.exit(0);
}

console.log("[sp-grid] Loading team matchup data...");
const data = JSON.parse(readFileSync(matchupPath, "utf-8"));
const pool: PoolMember[] = data.pool;
const topTeams: { members: string[] }[] = data.topTeams;

// ── Collect unique team members from top teams ──────────────────────────────

const teamMemberNames = new Set<string>();
const TOP_TEAM_COUNT = Math.min(10, topTeams.length);
for (let i = 0; i < TOP_TEAM_COUNT; i++) {
  for (const name of topTeams[i].members) {
    teamMemberNames.add(name);
  }
}

const poolMap = new Map<string, PoolMember>();
for (const p of pool) poolMap.set(p.name, p);

const teamMembers: PoolMember[] = [];
for (const name of teamMemberNames) {
  const m = poolMap.get(name);
  if (m) teamMembers.push(m);
}

// Top 100 opponents by usage
const opponents = [...pool]
  .sort((a, b) => b.usagePct - a.usagePct)
  .slice(0, 100);

console.log(
  `[sp-grid] ${teamMembers.length} team members × ${opponents.length} opponents`,
);

// ── Helpers ─────────────────────────────────────────────────────────────────

type SPAllocation = PoolMember["sp"];

function createPokemon(
  member: PoolMember, spOverride?: SPAllocation, moves?: string[],
): Pokemon {
  return new Pokemon({
    name: baseSpecies(member.name),
    nature: member.nature as NatureName,
    sp: spOverride ?? member.sp,
    ability: member.ability,
    item: member.item,
    isMega: member.isMega,
    moves: moves ?? member.moves,
  });
}

function getMoveCategory(moveName: string): "Physical" | "Special" | "Status" {
  try {
    const m = new Move(moveName);
    if (m.isPhysical()) return "Physical";
    if (m.isSpecial()) return "Special";
    return "Status";
  } catch {
    return "Status";
  }
}

type GridCell = { koN: number; koChance: number } | null;

function calcDamage(
  attacker: PoolMember, defender: PoolMember, moveName: string,
  atkSP?: SPAllocation, defSP?: SPAllocation,
): GridCell {
  try {
    const atkPoke = createPokemon(attacker, atkSP, [moveName]);
    const defPoke = createPokemon(defender, defSP);
    const field = new Field({ gameType: "Singles" as any });
    const move = new Move(moveName);
    const result = calculate(atkPoke, defPoke, move, field);
    const ko = result.koChance();
    return {
      koN: ko.n,
      koChance: Math.round(ko.chance * 1000) / 1000,
    };
  } catch {
    return null;
  }
}

// ── Compute grids ───────────────────────────────────────────────────────────

type GridEntries = Record<string, GridCell[]>;

const attackerGrid: Record<string, GridEntries> = {};
const defenderGrid: Record<string, GridEntries> = {};
let totalCalcs = 0;
let skippedCombos = 0;
const startTime = Date.now();

for (const member of teamMembers) {
  const atkEntries: GridEntries = {};
  const defEntries: GridEntries = {};
  const memberName = member.name;

  // Offensive grids: member attacks each opponent
  const offStats: ("atk" | "spa")[] = [];
  if (member.sp.atk > 0 || member.sp.atk < 32) offStats.push("atk");
  if (member.sp.spa > 0 || member.sp.spa < 32) offStats.push("spa");

  for (const opp of opponents) {
    if (opp.name === memberName) continue;

    for (const moveName of member.moves) {
      const cat = getMoveCategory(moveName);
      if (cat === "Status") continue;

      for (const stat of offStats) {
        if (stat === "atk" && cat !== "Physical") continue;
        if (stat === "spa" && cat !== "Special") continue;

        // Quick pre-filter at current SP
        const baseline = calcDamage(member, opp, moveName);
        totalCalcs++;
        if (!baseline || baseline.koN <= 0 || baseline.koN > 4) {
          skippedCombos++;
          continue;
        }

        const key = `${opp.name}|${moveName}|${stat}`;
        const grid: GridCell[] = new Array(33);
        grid[member.sp[stat]] = baseline;

        for (let sp = 0; sp <= 32; sp++) {
          if (sp === member.sp[stat]) continue;
          const testSP = { ...member.sp, [stat]: sp };
          const r = calcDamage(member, opp, moveName, testSP);
          totalCalcs++;
          grid[sp] = r && r.koN > 0 ? r : null;
        }
        atkEntries[key] = grid;
      }
    }

    // Defensive grids: opponent attacks member
    const defStats: ("hp" | "def" | "spd")[] = [];
    if (member.sp.hp > 0 || member.sp.hp < 32) defStats.push("hp");
    if (member.sp.def > 0 || member.sp.def < 32) defStats.push("def");
    if (member.sp.spd > 0 || member.sp.spd < 32) defStats.push("spd");

    for (const moveName of opp.moves) {
      const cat = getMoveCategory(moveName);
      if (cat === "Status") continue;

      for (const stat of defStats) {
        if (stat === "def" && cat !== "Physical") continue;
        if (stat === "spd" && cat !== "Special") continue;
        // hp: both Physical and Special are relevant

        // Quick pre-filter at current SP
        const baseline = calcDamage(opp, member, moveName);
        totalCalcs++;
        if (!baseline || baseline.koN <= 0 || baseline.koN > 4) {
          skippedCombos++;
          continue;
        }

        const key = `${opp.name}|${moveName}|${stat}`;
        const grid: GridCell[] = new Array(33);
        grid[member.sp[stat]] = baseline;

        for (let sp = 0; sp <= 32; sp++) {
          if (sp === member.sp[stat]) continue;
          const testSP = { ...member.sp, [stat]: sp };
          const r = calcDamage(opp, member, moveName, undefined, testSP);
          totalCalcs++;
          grid[sp] = r && r.koN > 0 ? r : null;
        }
        defEntries[key] = grid;
      }
    }
  }

  if (Object.keys(atkEntries).length > 0) attackerGrid[memberName] = atkEntries;
  if (Object.keys(defEntries).length > 0) defenderGrid[memberName] = defEntries;

  console.log(
    `[sp-grid] ${memberName}: ${Object.keys(atkEntries).length} atk + ${Object.keys(defEntries).length} def combos`,
  );
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ── Write output (compact format) ───────────────────────────────────────────
// Use [koN, koChance] tuples (0 for null) to minimize JSON size.

function compactGrid(entries: GridEntries): Record<string, (0 | [number, number])[]> {
  const result: Record<string, (0 | [number, number])[]> = {};
  for (const [key, grid] of Object.entries(entries)) {
    result[key] = grid.map(cell =>
      cell ? [cell.koN, cell.koChance] as [number, number] : 0,
    );
  }
  return result;
}

const compactAtk: Record<string, Record<string, (0 | [number, number])[]>> = {};
for (const [name, entries] of Object.entries(attackerGrid)) {
  compactAtk[name] = compactGrid(entries);
}
const compactDef: Record<string, Record<string, (0 | [number, number])[]>> = {};
for (const [name, entries] of Object.entries(defenderGrid)) {
  compactDef[name] = compactGrid(entries);
}

const output = { attackerGrid: compactAtk, defenderGrid: compactDef };
const json = JSON.stringify(output);
const outPath = resolve(STORAGE, "_latest-sp-grid.json");
writeFileSync(outPath, json + "\n", "utf-8");

const sizeKB = Math.round(json.length / 1024);
console.log(
  `[sp-grid] Done: ${totalCalcs} calcs (${skippedCombos} skipped), ${sizeKB}KB, ${elapsed}s`,
);
console.log(`[sp-grid] Written to ${outPath}`);
