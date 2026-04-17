/**
 * hippo-threat-classify.ts
 *
 * Classify TOP30 opponents' threats to Hippowdon-HD (our lead).
 *
 * Categories:
 *   A: 実質確1        — koN=1 (regardless of move type)
 *   B: 実質確2以上     — koN<=2 AND move is NOT a C-drop move
 *   C: 偽確2 (C-drop) — koN=2 AND move IS a C-drop (can't actually 2HKO)
 *   D: 確3以下        — koN>=3 (no real threat)
 *
 * For Category C, computes the SECOND-BEST non-C-drop move.
 *
 * Usage:
 *   npx tsx home-data/scripts/hippo-threat-classify.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";
import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import {
  baseSpecies,
  resolveWeather,
  round1,
  STAT_DROP_MOVES,
  CHARGE_TURN_MOVES,
  CHARGE_EXEMPT_ABILITIES,
  RECHARGE_MOVES,
  SELF_KO_MOVES,
  SELF_KO_PENALTY,
  SWITCH_IN_PENALTY_POKEMON,
  SWITCH_IN_PENALTY,
  CHIP_DAMAGE_ABILITIES,
  CHIP_PCT,
  SAND_CHIP_PCT,
  isSandChipImmune,
} from "../analyzer/team-matchup-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load data ───────────────────────────────────────────────────────────────

const dataPath = resolve(__dirname, "../storage/analysis/2026-04-08-team-matchup.json");
const data = JSON.parse(readFileSync(dataPath, "utf-8"));

const pokemonJa: Record<string, string> = JSON.parse(
  readFileSync(resolve(__dirname, "../storage/i18n/pokemon-ja.json"), "utf-8")
);
const movesJa: Record<string, string> = JSON.parse(
  readFileSync(resolve(__dirname, "../storage/i18n/moves-ja.json"), "utf-8")
);

function ja(name: string): string {
  return pokemonJa[name] ?? name;
}
function jaMove(name: string): string {
  return movesJa[name] ?? name;
}
function koLabel(koN: number, koChance: number): string {
  if (koN === 0 || koN >= 99) return "-";
  if (koChance >= 1.0) return `確${koN}`;
  return `乱${koN}(${Math.round(koChance * 100)}%)`;
}

// ── Pool & matrix ───────────────────────────────────────────────────────────

interface PoolEntry {
  name: string;
  usagePct: number;
  usageRank: number;
  isMega: boolean;
  nature: string;
  item: string;
  ability: string;
  types: string[];
  moves: string[];
  sp: Record<string, number>;
  speedStat: number;
}

const pool: PoolEntry[] = data.pool;
const damageMatrix: Record<string, Record<string, any>> = data.damageMatrix;

// Hippowdon defender entry (for calc)
const hippoPool = pool.find((p) => p.name === "Hippowdon")!;
if (!hippoPool) {
  console.error("ERROR: Hippowdon not found in pool");
  process.exit(1);
}

// ── TOP30 by usageRank (exclude Hippowdon itself) ───────────────────────────

// Get unique base species by usageRank (megas + base share same rank)
// We want ALL pool entries (including mega variants) for species with usageRank <= 30
const top30Ranks = new Set<number>();
const rankEntries: PoolEntry[] = [];
for (const p of pool) {
  if (p.name === "Hippowdon" || p.name === "Hippowdon-HD") continue;
  if (p.usageRank <= 30) {
    top30Ranks.add(p.usageRank);
    rankEntries.push(p);
  }
}

// Sort: mega first per species (usually stronger), then by usageRank
rankEntries.sort((a, b) => {
  if (a.usageRank !== b.usageRank) return a.usageRank - b.usageRank;
  // Mega before base
  if (a.isMega && !b.isMega) return -1;
  if (!a.isMega && b.isMega) return 1;
  return 0;
});

// For display, prefer mega form if it exists (it's the one that would actually be used)
// But also keep base forms for completeness since some bases are non-mega
// Dedup: for each usageRank + baseSpecies, keep the best form (mega if available)
const seenSpecies = new Set<string>();
const top30: PoolEntry[] = [];
for (const p of rankEntries) {
  const base = baseSpecies(p.name);
  const key = `${p.usageRank}:${base}`;
  if (seenSpecies.has(key)) continue;
  seenSpecies.add(key);
  // Prefer mega if both exist
  const mega = rankEntries.find(
    (q) => q.usageRank === p.usageRank && baseSpecies(q.name) === base && q.isMega
  );
  top30.push(mega ?? p);
}

console.log(`\n=== カバルドンHD (先発) に対する TOP30 脅威分類 ===\n`);
console.log(`対象: ${top30.length} 体 (usageRank <= 30, Hippowdon除外)\n`);

// ── Compute secondary moves for C-drop cases ──────────────────────────────

interface ThreatEntry {
  name: string;
  jaName: string;
  usageRank: number;
  types: string[];
  speed: number;
  category: "A" | "B" | "C" | "D";
  bestMove: string;
  koN: number;
  koChance: number;
  minPct: number;
  maxPct: number;
  secondMove?: string;
  secondKoN?: number;
  secondKoChance?: number;
  secondMinPct?: number;
  secondMaxPct?: number;
}

function calcMoveVsHippo(
  attacker: PoolEntry,
  moveName: string
): { minPct: number; maxPct: number; koN: number; koChance: number } | null {
  try {
    const atkPokemon = new Pokemon({
      name: baseSpecies(attacker.name),
      nature: attacker.nature as any,
      sp: attacker.sp,
      ability: attacker.ability,
      item: attacker.item,
      isMega: attacker.isMega,
      moves: attacker.moves,
    });
    const defPokemon = new Pokemon({
      name: "Hippowdon",
      nature: hippoPool.nature as any,
      sp: hippoPool.sp,
      ability: hippoPool.ability,
      item: hippoPool.item,
      isMega: false,
    });

    const atkSpeed = attacker.speedStat;
    const defSpeed = hippoPool.speedStat;
    const pairWeather = resolveWeather(
      attacker.ability, atkSpeed,
      hippoPool.ability, defSpeed
    );
    const field = pairWeather
      ? new Field({ gameType: "Singles" as any, weather: pairWeather as any })
      : new Field({ gameType: "Singles" as any });

    const move = new Move(moveName);
    const result = calculate(atkPokemon, defPokemon, move, field);
    let [minPct, maxPct] = result.percentRange();
    const ko = result.koChance();

    const selfKO = SELF_KO_MOVES.has(moveName);
    if (selfKO) {
      minPct *= SELF_KO_PENALTY;
      maxPct *= SELF_KO_PENALTY;
    }
    if (SWITCH_IN_PENALTY_POKEMON.has(baseSpecies(attacker.name))) {
      minPct *= SWITCH_IN_PENALTY;
      maxPct *= SWITCH_IN_PENALTY;
    }

    return {
      minPct: round1(minPct),
      maxPct: round1(maxPct),
      koN: selfKO ? Math.max(ko.n, 2) : ko.n,
      koChance: round1(ko.chance),
    };
  } catch {
    return null;
  }
}

// ── Build threat table ─────────────────────────────────────────────────────

const threats: ThreatEntry[] = [];

for (const p of top30) {
  const defKey = damageMatrix[p.name]?.["Hippowdon"] ? "Hippowdon" : "Hippowdon-HD";
  const entry = damageMatrix[p.name]?.[defKey];

  if (!entry) {
    // No damage entry — skip
    continue;
  }

  const isStatDrop = STAT_DROP_MOVES.has(entry.bestMove);
  const koN = entry.koN;
  const koChance = entry.koChance;

  let category: "A" | "B" | "C" | "D";
  if (koN === 1) {
    category = "A";
  } else if (koN <= 2 && !isStatDrop) {
    category = "B";
  } else if (koN === 2 && isStatDrop) {
    category = "C";
  } else {
    category = "D";
  }

  const threat: ThreatEntry = {
    name: p.name,
    jaName: ja(p.name),
    usageRank: p.usageRank,
    types: p.types,
    speed: p.speedStat,
    category,
    bestMove: entry.bestMove,
    koN,
    koChance,
    minPct: entry.minPct,
    maxPct: entry.maxPct,
  };

  // For C-drop: compute best non-C-drop move
  if (category === "C") {
    let best2: { move: string; minPct: number; maxPct: number; koN: number; koChance: number } | null = null;
    for (const mv of p.moves) {
      if (STAT_DROP_MOVES.has(mv)) continue;
      if (RECHARGE_MOVES.has(mv)) continue;
      if (CHARGE_TURN_MOVES.has(mv) && !CHARGE_EXEMPT_ABILITIES.has(p.ability)) continue;

      const result = calcMoveVsHippo(p, mv);
      if (result && (!best2 || result.maxPct > best2.maxPct)) {
        best2 = { move: mv, ...result };
      }
    }
    if (best2) {
      threat.secondMove = best2.move;
      threat.secondKoN = best2.koN;
      threat.secondKoChance = best2.koChance;
      threat.secondMinPct = best2.minPct;
      threat.secondMaxPct = best2.maxPct;
    }
  }

  threats.push(threat);
}

// ── Sort: category order (A, B, C, D), then usageRank ───────────────────────

const catOrder = { A: 0, B: 1, C: 2, D: 3 };
threats.sort((a, b) => {
  if (catOrder[a.category] !== catOrder[b.category])
    return catOrder[a.category] - catOrder[b.category];
  return a.usageRank - b.usageRank;
});

// ── Output ──────────────────────────────────────────────────────────────────

const CATEGORIES = {
  A: "実質確1",
  B: "実質確2以上 (継続技)",
  C: "偽確2 (C-drop)",
  D: "確3以下",
};

// Summary counts
const catCounts = { A: 0, B: 0, C: 0, D: 0 };
for (const t of threats) catCounts[t.category]++;

console.log("── カテゴリ別サマリ ──");
for (const [cat, label] of Object.entries(CATEGORIES)) {
  console.log(`  ${cat}: ${label} — ${catCounts[cat as keyof typeof catCounts]}体`);
}
console.log();

// Detailed table by category
for (const [cat, label] of Object.entries(CATEGORIES)) {
  const catThreats = threats.filter((t) => t.category === cat);
  if (catThreats.length === 0) continue;

  console.log(`\n── カテゴリ${cat}: ${label} (${catThreats.length}体) ──`);

  if (cat === "C") {
    // C-drop table with second move
    console.log(
      padR("ポケモン", 22) +
        padR("Rank", 6) +
        padR("タイプ", 16) +
        padR("S実数値", 8) +
        padR("最善技(C-drop)", 20) +
        padR("KO判定", 14) +
        padR("ダメ%", 14) +
        padR("次善技(継続)", 20) +
        padR("次善KO", 14) +
        padR("次善ダメ%", 14)
    );
    console.log("-".repeat(148));
    for (const t of catThreats) {
      const secondInfo = t.secondMove
        ? `${jaMove(t.secondMove)}`
        : "(なし)";
      const secondKo = t.secondKoN !== undefined
        ? koLabel(t.secondKoN, t.secondKoChance!)
        : "-";
      const secondDmg = t.secondMinPct !== undefined
        ? `${t.secondMinPct}-${t.secondMaxPct}%`
        : "-";
      console.log(
        padR(t.jaName, 22) +
          padR(String(t.usageRank), 6) +
          padR(t.types.join("/"), 16) +
          padR(String(t.speed), 8) +
          padR(jaMove(t.bestMove), 20) +
          padR(koLabel(t.koN, t.koChance), 14) +
          padR(`${t.minPct}-${t.maxPct}%`, 14) +
          padR(secondInfo, 20) +
          padR(secondKo, 14) +
          padR(secondDmg, 14)
      );
    }
  } else {
    // Standard table
    console.log(
      padR("ポケモン", 22) +
        padR("Rank", 6) +
        padR("タイプ", 16) +
        padR("S実数値", 8) +
        padR("最善技", 20) +
        padR("KO判定", 14) +
        padR("ダメ%", 14)
    );
    console.log("-".repeat(100));
    for (const t of catThreats) {
      console.log(
        padR(t.jaName, 22) +
          padR(String(t.usageRank), 6) +
          padR(t.types.join("/"), 16) +
          padR(String(t.speed), 8) +
          padR(jaMove(t.bestMove), 20) +
          padR(koLabel(t.koN, t.koChance), 14) +
          padR(`${t.minPct}-${t.maxPct}%`, 14)
      );
    }
  }
}

// ── Floette-Mega / Basculegion-F 確1 targets ──────────────────────────────

console.log("\n\n=== 後発確1交代出し脅威 ===\n");

const backTargets = ["Floette-Mega", "Basculegion-F"];
for (const target of backTargets) {
  const targetJa = ja(target);
  console.log(`── ${targetJa} (${target}) を確1できるTOP30 ──`);

  const killers: { name: string; jaName: string; move: string; koN: number; koChance: number; minPct: number; maxPct: number }[] = [];

  for (const t of top30) {
    const entry = damageMatrix[t.name]?.[target];
    if (!entry) continue;

    // Check if koN=1 with the best move
    if (entry.koN === 1) {
      killers.push({
        name: t.name,
        jaName: ja(t.name),
        move: entry.bestMove,
        koN: entry.koN,
        koChance: entry.koChance,
        minPct: entry.minPct,
        maxPct: entry.maxPct,
      });
    }
  }

  if (killers.length === 0) {
    console.log("  (なし)");
  } else {
    killers.sort((a, b) => b.maxPct - a.maxPct);
    console.log(
      padR("ポケモン", 22) +
        padR("技", 20) +
        padR("KO判定", 14) +
        padR("ダメ%", 14)
    );
    console.log("-".repeat(70));
    for (const k of killers) {
      console.log(
        padR(k.jaName, 22) +
          padR(jaMove(k.move), 20) +
          padR(koLabel(k.koN, k.koChance), 14) +
          padR(`${k.minPct}-${k.maxPct}%`, 14)
      );
    }
  }
  console.log();
}

// ── Helper ──────────────────────────────────────────────────────────────────

function padR(s: string, len: number): string {
  // Account for CJK characters (width 2)
  let width = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // CJK Unified Ideographs, Hiragana, Katakana, CJK Symbols
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return s + " ".repeat(Math.max(0, len - width));
}
