/**
 * Mega Tyranitar detailed matchup table for Hippowdon team
 *
 * Uses existing matchupValue() from team-matchup-core.ts.
 * Reads pre-computed DamageMatrix from _latest-team-matchup.json.
 *
 * Chip damage distinction:
 *   - Sand: 6.25%/turn (1/16) — always active against non-immune (ongoing)
 *   - SR:   1/8 × type eff — only on switch-in (optional, shown separately)
 */
import {
  matchupValue,
  effectiveKoN,
  adjustedEKoN,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, DamageMatrixEntry } from "../types/team-matchup.js";
import { getEffectiveness } from "../../src/index.js";
import { readFileSync } from "node:fs";

// ── i18n ──
const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const movesJa = JSON.parse(readFileSync("home-data/storage/i18n/moves-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || en;
const jaMove = (en: string) => movesJa[en] || en;

// ── Load pre-computed data ──
const teamMatchup = JSON.parse(
  readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8")
);
const matrix: DamageMatrix = teamMatchup.damageMatrix ??
  JSON.parse(readFileSync("home-data/storage/analysis/2026-04-15-damage-matrix.json", "utf-8"));
const pool: any[] = teamMatchup.pool;

const poolSpeeds = new Map<string, number>();
for (const p of pool) {
  poolSpeeds.set(p.name, p.speedStat ?? 0);
}

// ── Config ──
const ME = "Tyranitar-Mega";
const SAND_IMMUNE_TYPES = new Set(["Rock", "Ground", "Steel"]);
const SAND_CHIP = 6.25; // 1/16 per turn

const myEntry = pool.find((p: any) => p.name === ME);
if (!myEntry) throw new Error(ME + " not found in pool");

const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

// ── Build opponent list ──
interface Opponent {
  rank: number;
  poolName: string;
  displayName: string;
  types: string[];
  speed: number;
  sandChip: number;  // 6.25 or 0 (per turn, ongoing)
  srChip: number;    // switch-in only (optional)
}

const opponents: Opponent[] = [];
for (const raw of top30Raw) {
  if (raw.name === "Hippowdon") continue;
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  const poolName = hasMega ? raw.name + "-Mega" : raw.name;

  const poolEntry = pool.find((p: any) => p.name === poolName);
  if (!poolEntry) {
    console.log("WARNING: " + poolName + " not found in pool, skipping");
    continue;
  }

  const types = poolEntry.types || [];
  const sandImmune = types.some((t: string) => SAND_IMMUNE_TYPES.has(t));
  const sandChip = sandImmune ? 0 : SAND_CHIP;
  const rockEff = getEffectiveness("Rock" as any, types as any);
  const srChip = (rockEff / 8) * 100; // 1/8 base × type eff

  opponents.push({
    rank: raw.rank,
    poolName,
    displayName: jaName(raw.name),
    types,
    speed: poolEntry.speedStat ?? 0,
    sandChip,
    srChip,
  });
}

// ── My info ──
const mySpeed = poolSpeeds.get(ME) ?? 0;
console.log("═══ " + jaName("Tyranitar") + "（メガ） 全対面詳細 ═══");
console.log("育成: " + myEntry.nature + " / " + myEntry.item + " / " + myEntry.ability);
console.log("SP: H" + myEntry.sp.hp + "/A" + myEntry.sp.atk + "/B" + myEntry.sp.def + "/D" + myEntry.sp.spd + "/S" + myEntry.sp.spe);
console.log("技: " + myEntry.moves.map((m: string) => jaMove(m)).join(", "));
console.log("素早さ: " + mySpeed);
console.log("砂免除: ○（岩タイプ）");
console.log();
console.log("※ 砂ダメ = 毎ターン1/16 (6.25%) — 対面中ずっと発生");
console.log("※ SR   = 交代で出てきた時に1回 1/8×相性 — 対面中の相手には無関係");
console.log("※ デフォルト評価は砂のみ。SR込み(交代出し)で確定数が変わる場合は [SR込] で注記");
console.log();

// ── Evaluate ──
interface MatchupDetail {
  rank: number;
  poolName: string;
  displayName: string;
  // Base (sand only)
  myScoreSand: number;
  myEKoNSand: number;
  // With SR (switch-in scenario)
  myScoreSR: number;
  myEKoNSR: number;
  // Raw entry
  myEntry: DamageMatrixEntry | undefined;
  sandChip: number;
  srChip: number;
  // Opponent attacking me
  oppScore: number;
  oppEntry: DamageMatrixEntry | undefined;
  oppEKoN: number;
  // Speed
  speed: number;
  speedOrder: string;
  // Classification (based on sand-only)
  result: string;
  srUpgrade: boolean; // true if SR changes the classification
}

const details: MatchupDetail[] = [];

for (const opp of opponents) {
  const meAtk = matrix[ME]?.[opp.poolName];
  const oppAtk = matrix[opp.poolName]?.[ME];

  // Sand-only evaluation (default — face-to-face)
  const myScoreSand = matchupValue(ME, opp.poolName, matrix, poolSpeeds, opp.sandChip);
  const myEKoNSand = opp.sandChip > 0 ? adjustedEKoN(meAtk, opp.sandChip) : effectiveKoN(meAtk);

  // SR + Sand evaluation (switch-in scenario)
  const totalChip = opp.sandChip + opp.srChip;
  const myScoreSR = matchupValue(ME, opp.poolName, matrix, poolSpeeds, totalChip);
  const myEKoNSR = totalChip > 0 ? adjustedEKoN(meAtk, totalChip) : effectiveKoN(meAtk);

  const oppScore = matchupValue(opp.poolName, ME, matrix, poolSpeeds); // no chip on me (sand immune)
  const oppEKoN = effectiveKoN(oppAtk);

  let speedOrder: string;
  if (mySpeed > opp.speed) speedOrder = "先手";
  else if (mySpeed < opp.speed) speedOrder = "後手";
  else speedOrder = "同速";

  // Classification based on sand-only scores
  let result: string;
  if (myScoreSand >= 1.0) {
    result = "◎完勝";
  } else if (myScoreSand >= 0.3 && oppScore <= 0.3) {
    result = "○有利";
  } else if (myScoreSand >= 0.3 && oppScore >= 1.0) {
    result = "△相打ち";
  } else if (myScoreSand >= 0.3 && oppScore >= 0.3) {
    if (mySpeed > opp.speed) result = "○有利";
    else if (mySpeed < opp.speed) result = "×不利";
    else result = "△同速勝負";
  } else if (myScoreSand === 0 && oppScore === 0) {
    result = "□膠着";
  } else if (myScoreSand === 0) {
    result = "×不利";
  } else {
    result = "△微妙";
  }

  // Check if SR upgrades the result
  const srUpgrade = myScoreSR > myScoreSand;

  details.push({
    rank: opp.rank, poolName: opp.poolName, displayName: opp.displayName,
    myScoreSand, myEKoNSand, myScoreSR, myEKoNSR, myEntry: meAtk,
    sandChip: opp.sandChip, srChip: opp.srChip,
    oppScore, oppEntry: oppAtk, oppEKoN,
    speed: opp.speed, speedOrder, result, srUpgrade,
  });
}

// Sort
const resultPrio: Record<string, number> = {
  "◎完勝": 0, "○有利": 1, "△相打ち": 2, "△同速勝負": 2,
  "△微妙": 3, "□膠着": 4, "×不利": 5,
};
details.sort((a, b) => {
  const pa = resultPrio[a.result] ?? 9;
  const pb = resultPrio[b.result] ?? 9;
  if (pa !== pb) return pa - pb;
  return a.rank - b.rank;
});

// Helpers
function koLabel(eKoN: number): string {
  if (eKoN >= 99) return "---";
  if (eKoN <= 1.0) return "確1";
  if (eKoN <= 1.25) return "乱1";
  if (eKoN <= 2.0) return "確2";
  if (eKoN <= 2.5) return "乱2";
  return "確" + Math.ceil(eKoN);
}

// Output
let currentResult = "";
for (const d of details) {
  if (d.result !== currentResult) {
    currentResult = d.result;
    console.log("\n── " + d.result + " ──");
    console.log(
      "   " +
      "相手".padEnd(14) +
      "速度".padEnd(10) +
      "│ スコア".padEnd(12) +
      "技".padEnd(14) +
      "ダメ%".padEnd(16) +
      "確定数(砂)".padEnd(12) +
      "│ 被スコア".padEnd(12) +
      "被技".padEnd(14) +
      "被ダメ%".padEnd(16) +
      "被確定数" +
      "    │ SR込"
    );
    console.log("   " + "-".repeat(155));
  }

  const meAtk = d.myEntry;
  const oppAtk = d.oppEntry;

  const myMoveStr = meAtk?.bestMove ? jaMove(meAtk.bestMove) : "(打点なし)";
  const myDmgStr = meAtk && meAtk.maxPct > 0
    ? meAtk.minPct.toFixed(1) + "-" + meAtk.maxPct.toFixed(1) + "%"
    : "---";

  const oppMoveStr = oppAtk?.bestMove ? jaMove(oppAtk.bestMove) : "(打点なし)";
  const oppDmgStr = oppAtk && oppAtk.maxPct > 0
    ? oppAtk.minPct.toFixed(1) + "-" + oppAtk.maxPct.toFixed(1) + "%"
    : "---";

  const spdStr = d.speedOrder + "(" + d.speed.toFixed(0) + ")";

  // SR annotation: show only if SR changes KO number
  let srNote = "";
  if (d.srUpgrade) {
    srNote = koLabel(d.myEKoNSR) + "(+" + d.srChip.toFixed(0) + "%)";
  }

  console.log(
    "#" + String(d.rank).padEnd(3) +
    d.displayName.padEnd(14) +
    spdStr.padEnd(10) +
    "│ " + String(d.myScoreSand.toFixed(1)).padEnd(5) +
    myMoveStr.padEnd(14) +
    myDmgStr.padEnd(16) +
    koLabel(d.myEKoNSand).padEnd(12) +
    "│ " + String(d.oppScore.toFixed(1)).padEnd(5) +
    oppMoveStr.padEnd(14) +
    oppDmgStr.padEnd(16) +
    koLabel(d.oppEKoN).padEnd(10) +
    "│ " + srNote
  );
}

// Summary
const counts: Record<string, number> = {};
for (const d of details) {
  counts[d.result] = (counts[d.result] || 0) + 1;
}
console.log("\n═══ 集計（砂のみ） ═══");
for (const [result, count] of Object.entries(counts)) {
  console.log("  " + result + ": " + count);
}
console.log("  合計: " + details.length);

// SR upgrades
const upgrades = details.filter(d => d.srUpgrade);
if (upgrades.length > 0) {
  console.log("\n═══ SR交代出しで確定数改善 ═══");
  for (const d of upgrades) {
    console.log("  " + d.displayName + ": " + koLabel(d.myEKoNSand) + " → " + koLabel(d.myEKoNSR) + " (SR " + d.srChip.toFixed(0) + "%)");
  }
}
