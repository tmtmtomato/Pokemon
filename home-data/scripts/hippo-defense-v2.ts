/**
 * Hippowdon Defensive Optimization v2
 *
 * Per-Pokemon aggregation: each opponent's BEST move determines the matchup.
 * Two metrics:
 *   - 乱1以内: opponent can OHKO (koN=1, any chance)
 *   - 乱2以内: opponent can 2HKO (koN<=2, any chance)
 *
 * Single-use moves (Draco Meteor, Overheat) flagged separately.
 */

import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

// ── JP name dictionaries ─────────────────────────────────────────────────
const pokemonJA: Record<string, string> = JSON.parse(
  readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8")
);
const movesJA: Record<string, string> = JSON.parse(
  readFileSync("home-data/storage/i18n/moves-ja.json", "utf-8")
);
const ja = (name: string) => pokemonJA[name] ?? name;
const jaM = (name: string) => movesJA[name] ?? name;

const field = new Field({ gameType: "Singles", weather: "Sand" });
const SINGLE_USE_MOVES = new Set(["Draco Meteor", "Overheat"]);
const MOVE_USAGE_THRESHOLD = 20; // Ignore moves with <20% usage — too rare to plan around

// Solar Beam requires a charge turn under Sand (Hippowdon overrides Drought).
// Mega Charizard Y's Drought is replaced by Sand Stream → Solar Beam is NOT instant.
// Exclude it for specific Pokemon whose only reason to run it is Drought synergy.
const SAND_BLOCKED_MOVES: Record<string, Set<string>> = {
  "Charizard": new Set(["Solar Beam"]),
};

// ── Meta opponents ────────────────────────────────────────────────────────
interface OppProfile {
  name: string;
  rank: number;
  attacker: any;
  moves: { name: string; pct: number; category: string; isSingleUse: boolean }[];
}

const opponents: OppProfile[] = [];
for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species || raw.name === "Hippowdon") continue;

  const primaryItem = raw.items?.[0]?.name || "";
  const isMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite" && !!species.mega;
  const nature = raw.natures?.[0]?.name || "Hardy";
  const ability = isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]);
  const sp = raw.spreads?.[0] || {};

  const moves: OppProfile["moves"] = [];
  const blocked = SAND_BLOCKED_MOVES[raw.name];
  for (const m of raw.moves) {
    if (m.pct < MOVE_USAGE_THRESHOLD) continue;
    if (blocked?.has(m.name)) continue; // blocked under Sand
    const md = getMoveData(m.name);
    if (!md || md.category === "Status" || md.basePower <= 0) continue;
    moves.push({
      name: m.name,
      pct: m.pct,
      category: md.category,
      isSingleUse: SINGLE_USE_MOVES.has(m.name),
    });
  }

  opponents.push({
    name: raw.name,
    rank: raw.rank,
    attacker: new Pokemon({ name: raw.name, sp, nature, ability, item: primaryItem, isMega }),
    moves,
  });
}

// ── Sitrus Berry-aware KO calculation ─────────────────────────────────────
//
// Sitrus Berry (オボンのみ): restores floor(maxHP/4) when HP drops to ≤ 50%.
//
// 2HKO threshold:
//   (A) All rolls > 50%:  Sitrus always activates on hit 1 → need ≥62.5%/hit for 確2
//   (B) All rolls ≤ 50%:  Sitrus never activates on hit 1 → normal calc (need ≥50%)
//   (C) Rolls STRADDLE 50%: danger zone.
//       Low rolls (no Sitrus trigger) + high roll on hit 2 can still 2HKO.
//       This is reported as 乱2 with "⚠" warning (Sitrus activation is roll-dependent).
//
// Enumeration: for each (r1, r2) pair out of 16×16=256 combinations,
//   simulate HP after hit 1, apply Sitrus if triggered, then check if hit 2 KOs.
//
interface SitrusKO {
  n: number;
  chance: number;
  straddle50: boolean; // true if some rolls trigger Sitrus and some don't
}

function koWithSitrus(rolls: number[], maxHP: number): SitrusKO {
  // OHKO check (Sitrus doesn't matter — KO in one hit)
  const ohkoCount = rolls.filter(r => r >= maxHP).length;
  if (ohkoCount === 16) return { n: 1, chance: 1.0, straddle50: false };
  if (ohkoCount > 0) return { n: 1, chance: ohkoCount / 16, straddle50: false };

  const sitrusHeal = Math.floor(maxHP / 4);
  const sitrusThreshold = Math.floor(maxHP / 2); // HP ≤ this triggers Sitrus

  // Check if damage rolls straddle the 50% HP threshold
  const minDmg = Math.min(...rolls);
  const maxDmg = Math.max(...rolls);
  const straddle50 = (maxHP - maxDmg) <= sitrusThreshold && (maxHP - minDmg) > sitrusThreshold;

  // 2HKO: enumerate all (hit1, hit2) roll pairs
  let twoHitKO = 0;
  for (const r1 of rolls) {
    let hp = maxHP - r1;
    if (hp > 0 && hp <= sitrusThreshold) {
      hp += sitrusHeal; // Sitrus activates
    }
    for (const r2 of rolls) {
      if (r2 >= hp) twoHitKO++;
    }
  }
  if (twoHitKO > 0) {
    return { n: 2, chance: twoHitKO / (16 * 16), straddle50 };
  }

  // 3HKO: enumerate all (hit1, hit2, hit3) — Sitrus consumed once
  let threeHitKO = 0;
  for (const r1 of rolls) {
    let hp = maxHP - r1;
    let sitrusUsed = false;
    if (hp > 0 && hp <= sitrusThreshold) {
      hp += sitrusHeal;
      sitrusUsed = true;
    }
    for (const r2 of rolls) {
      let hp2 = hp - r2;
      if (!sitrusUsed && hp2 > 0 && hp2 <= sitrusThreshold) {
        hp2 += sitrusHeal;
      }
      for (const r3 of rolls) {
        if (r3 >= hp2) threeHitKO++;
      }
    }
  }
  if (threeHitKO > 0) {
    return { n: 3, chance: threeHitKO / (16 ** 3), straddle50: false };
  }

  // 4+ HKO (simplified — Sitrus adds ~25% effective HP)
  const effectiveHP = maxHP + sitrusHeal;
  const n = Math.ceil(effectiveHP / minDmg);
  return { n, chance: 1.0, straddle50: false };
}

// ── Builds ────────────────────────────────────────────────────────────────
// Exhaustive: B=0..32 (step 2), D=min(32, 34-B), × 2 natures
// Also test H reduction: H=28,30 with しんちょう to check if B/D gain outweighs HP loss
const NATURES_LIST: { label: string; eng: string }[] = [
  { label: "わんぱく", eng: "Impish" },
  { label: "しんちょう", eng: "Careful" },
];
const builds: { label: string; nature: string; sp: any }[] = [];
for (const nat of NATURES_LIST) {
  for (let b = 0; b <= 32; b += 2) {
    const d = Math.min(32, 34 - b);
    if (d < 0) continue;
    builds.push({
      label: `${nat.label} H32/B${b}/D${d}`,
      nature: nat.eng,
      sp: { hp: 32, atk: 0, def: b, spa: 0, spd: d, spe: 0 },
    });
  }
}
// H reduction variants (しんちょう only, D28 fixed, B gains from H)
for (const h of [30, 28, 26]) {
  const pool = 66 - h; // remaining SP
  const d = 28;
  const b = pool - d;  // leftover goes to B
  if (b < 0 || b > 32) continue;
  builds.push({
    label: `しんちょう H${h}/B${b}/D${d}`,
    nature: "Careful",
    sp: { hp: h, atk: 0, def: b, spa: 0, spd: d, spe: 0 },
  });
}
// Also: H reduced, D gains instead of B
for (const h of [30, 28]) {
  const pool = 66 - h;
  const b = 6; // keep B same as current best
  const d = Math.min(32, pool - b);
  if (d < 0) continue;
  builds.push({
    label: `しんちょう H${h}/B${b}/D${d}`,
    nature: "Careful",
    sp: { hp: h, atk: 0, def: b, spa: 0, spd: d, spe: 0 },
  });
}

// ── Evaluate ──────────────────────────────────────────────────────────────
interface OppMatchup {
  name: string;
  rank: number;
  bestMove: string;
  bestMovePct: number;
  bestCategory: string;
  bestIsSingleUse: boolean;
  minPct: number;
  maxPct: number;
  koN: number;
  koChance: number;
  straddle50: boolean;       // Sitrus activation is roll-dependent (⚠ warning)
  // Also track best non-single-use move
  bestNonSingleMove: string;
  bestNonSingleMaxPct: number;
  bestNonSingleKoN: number;
  bestNonSingleKoChance: number;
  bestNonSingleStraddle: boolean;
}

interface BuildEval {
  label: string;
  defStat: number;
  spdStat: number;
  matchups: OppMatchup[];
  ohkoCount: number;       // 乱1以内 (any move)
  twoHkoCount: number;     // 乱2以内 (any move)
  ohkoCountReal: number;   // 乱1以内 (non-single-use only)
  twoHkoCountReal: number; // 乱2以内 (non-single-use only)
}

const results: BuildEval[] = [];

for (const build of builds) {
  const hippo = new Pokemon({
    name: "Hippowdon",
    sp: build.sp,
    nature: build.nature,
    ability: "Sand Stream",
    item: "Sitrus Berry",
  });

  const matchups: OppMatchup[] = [];

  for (const opp of opponents) {
    let bestMove = "";
    let bestMovePct = 0;
    let bestCategory = "";
    let bestIsSingleUse = false;
    let bestMinPct = 0;
    let bestMaxPct = 0;
    let bestKoN = 99;
    let bestKoChance = 0;
    let bestStraddle = false;

    let bestNSMove = "";
    let bestNSMaxPct = 0;
    let bestNSKoN = 99;
    let bestNSKoChance = 0;
    let bestNSStraddle = false;

    for (const m of opp.moves) {
      try {
        const move = new Move(m.name);
        const result = calculate(opp.attacker, hippo, move, field);
        const [minPct, maxPct] = result.percentRange();

        // Use Sitrus Berry-aware KO calc instead of raw koChance()
        const ko = koWithSitrus(result.rolls, hippo.maxHP());
        const koN = ko.n;
        const koChance = ko.chance;

        // Best overall move (by lowest koN, then highest damage)
        if (koN < bestKoN || (koN === bestKoN && maxPct > bestMaxPct)) {
          bestMove = m.name;
          bestMovePct = m.pct;
          bestCategory = m.category;
          bestIsSingleUse = m.isSingleUse;
          bestMinPct = minPct;
          bestMaxPct = maxPct;
          bestKoN = koN;
          bestKoChance = koChance;
          bestStraddle = ko.straddle50;
        }

        // Best non-single-use move
        if (!m.isSingleUse && (koN < bestNSKoN || (koN === bestNSKoN && maxPct > bestNSMaxPct))) {
          bestNSMove = m.name;
          bestNSMaxPct = maxPct;
          bestNSKoN = koN;
          bestNSKoChance = koChance;
          bestNSStraddle = ko.straddle50;
        }
      } catch (e) {}
    }

    matchups.push({
      name: opp.name,
      rank: opp.rank,
      bestMove,
      bestMovePct,
      bestCategory,
      bestIsSingleUse,
      minPct: bestMinPct,
      maxPct: bestMaxPct,
      koN: bestKoN,
      koChance: bestKoChance,
      straddle50: bestStraddle,
      bestNonSingleMove: bestNSMove,
      bestNonSingleMaxPct: bestNSMaxPct,
      bestNonSingleKoN: bestNSKoN,
      bestNonSingleKoChance: bestNSKoChance,
      bestNonSingleStraddle: bestNSStraddle,
    });
  }

  const ohkoCount = matchups.filter(m => m.koN === 1).length;
  const twoHkoCount = matchups.filter(m => m.koN <= 2).length;
  const ohkoCountReal = matchups.filter(m => {
    if (m.bestIsSingleUse) return m.bestNonSingleKoN === 1;
    return m.koN === 1;
  }).length;
  const twoHkoCountReal = matchups.filter(m => {
    if (m.bestIsSingleUse) return m.bestNonSingleKoN <= 2;
    return m.koN <= 2;
  }).length;

  results.push({
    label: build.label,
    defStat: hippo.stat("def"),
    spdStat: hippo.stat("spd"),
    matchups,
    ohkoCount,
    twoHkoCount,
    ohkoCountReal,
    twoHkoCountReal,
  });
}

// ── Sort by: fewest 乱1(real), then fewest 乱2(real) ─────────────────────
results.sort((a, b) => {
  if (a.ohkoCountReal !== b.ohkoCountReal) return a.ohkoCountReal - b.ohkoCountReal;
  if (a.twoHkoCountReal !== b.twoHkoCountReal) return a.twoHkoCountReal - b.twoHkoCountReal;
  if (a.ohkoCount !== b.ohkoCount) return a.ohkoCount - b.ohkoCount;
  return a.twoHkoCount - b.twoHkoCount;
});

// ── Summary table ─────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════════════════════");
console.log("  ポケモン単位集計 — 総当たり (ソート: 乱1少→乱2少)");
console.log("═══════════════════════════════════════════════════════════════════════════\n");

console.log("  # | Build                    |  B  |  D  | 乱1以内 | 乱2以内 | 乱1(継続技) | 乱2(継続技)");
console.log("----|--------------------------|-----|-----|---------|---------|-------------|----------");
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const l = r.label.padEnd(24);
  console.log(`${String(i + 1).padStart(3)} | ${l} | ${String(r.defStat).padStart(3)} | ${String(r.spdStat).padStart(3)} | ${String(r.ohkoCount).padStart(4)}/29  | ${String(r.twoHkoCount).padStart(4)}/29  | ${String(r.ohkoCountReal).padStart(6)}/29    | ${String(r.twoHkoCountReal).padStart(5)}/29`);
}

// ── Detailed matchup for top 3 builds ─────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════════════");
console.log("  上位3ビルドの全対面詳細");
console.log("═══════════════════════════════════════════════════════════════════════════");

function koLabel(koN: number, chance: number, straddle = false): string {
  if (koN >= 99) return "確3+";
  if (koN === 1 && chance >= 1.0) return "確1";
  if (koN === 1) return `乱1(${(chance * 100).toFixed(0)}%)`;
  if (koN === 2 && chance >= 1.0) return "確2";
  if (koN === 2) return `乱2(${(chance * 100).toFixed(0)}%)${straddle ? " ⚠" : ""}`;
  if (koN === 3 && chance >= 1.0) return "確3";
  if (koN === 3) return `乱3(${(chance * 100).toFixed(0)}%)`;
  return `確${koN}+`;
}

// Show top 3 + specific build
const detailBuilds = [results[0], results[1], results[2], results.find(r => r.label === "しんちょう H32/B12/D22")].filter((r): r is BuildEval => !!r);
const seen = new Set<string>();
for (const r of detailBuilds) {
  if (seen.has(r.label)) continue;
  seen.add(r.label);
  const rank = results.indexOf(r) + 1;
  console.log(`\n── #${rank} ${r.label} (B${r.defStat}/D${r.spdStat}) ──`);
  console.log(`   乱1以内: ${r.ohkoCount}体  乱2以内: ${r.twoHkoCount}体  (継続技のみ: 乱1=${r.ohkoCountReal} 乱2=${r.twoHkoCountReal})\n`);

  const sorted = [...r.matchups].sort((a, b) => {
    if (a.koN !== b.koN) return a.koN - b.koN;
    return b.maxPct - a.maxPct;
  });

  for (const m of sorted) {
    const ko = koLabel(m.koN, m.koChance, m.straddle50);
    const single = m.bestIsSingleUse ? " [単発]" : "";
    const cat = m.bestCategory === "Physical" ? "物" : "特";
    let extra = "";
    if (m.bestIsSingleUse && m.bestNonSingleMove) {
      const nsKo = koLabel(m.bestNonSingleKoN, m.bestNonSingleKoChance, m.bestNonSingleStraddle);
      extra = ` → 継続技: ${jaM(m.bestNonSingleMove)} ${nsKo}`;
    }
    const marker = m.koN === 1 ? "★" : m.koN === 2 ? "・" : " ";
    // Pad JP names using full-width aware padding
    const pokeName = ja(m.name).padEnd(10);
    const moveName = jaM(m.bestMove).padEnd(12);
    console.log(`  ${marker} #${String(m.rank).padStart(2)} ${pokeName} ${moveName} ${cat} ${m.minPct.toFixed(1).padStart(5)}-${m.maxPct.toFixed(1).padStart(5)}% ${ko.padEnd(12)}${single}${extra}`);
  }
}

// ── B/D tradeoff comparison ──────────────────────────────────────────────
// Compare specific しんちょう builds to see physical vs special threat tradeoffs
console.log("\n\n═══════════════════════════════════════════════════════════════════════════");
console.log("  H削減 → BD追加 効率比較 (しんちょう)");
console.log("═══════════════════════════════════════════════════════════════════════════\n");

const compareBuildLabels = [
  "しんちょう H32/B6/D28",
  "しんちょう H30/B8/D28",
  "しんちょう H28/B10/D28",
  "しんちょう H26/B12/D28",
  "しんちょう H30/B6/D30",
  "しんちょう H28/B6/D32",
];

const compareBuilds = compareBuildLabels
  .map(l => results.find(r => r.label === l))
  .filter((r): r is BuildEval => !!r);

// Collect all opponents and for each build show koN/label
type CompareRow = {
  name: string;
  rank: number;
  builds: { koN: number; chance: number; cat: string; move: string; pct: string; straddle: boolean; isSingleUse: boolean; nsKoN: number; nsChance: number; nsStraddle: boolean }[];
};

const allNames = compareBuilds[0]?.matchups.map(m => m.name) ?? [];
const compareRows: CompareRow[] = [];

for (const name of allNames) {
  const row: CompareRow = { name, rank: 0, builds: [] };
  for (const build of compareBuilds) {
    const m = build.matchups.find(x => x.name === name)!;
    row.rank = m.rank;
    row.builds.push({
      koN: m.koN, chance: m.koChance, cat: m.bestCategory, move: m.bestMove,
      pct: `${m.minPct.toFixed(1)}-${m.maxPct.toFixed(1)}%`,
      straddle: m.straddle50, isSingleUse: m.bestIsSingleUse,
      nsKoN: m.bestNonSingleKoN, nsChance: m.bestNonSingleKoChance, nsStraddle: m.bestNonSingleStraddle,
    });
  }
  compareRows.push(row);
}

// Sort by: worst case across builds (lowest koN in any build), then by name
compareRows.sort((a, b) => {
  const worstA = Math.min(...a.builds.map(x => x.koN));
  const worstB = Math.min(...b.builds.map(x => x.koN));
  if (worstA !== worstB) return worstA - worstB;
  return a.rank - b.rank;
});

// Header
const bLabels = compareBuilds.map(b => `B${b.defStat}/D${b.spdStat}`);
console.log(`     ${"相手".padEnd(12)} ${"カテ".padEnd(4)} ${bLabels.map(l => l.padStart(14)).join("  ")}`);
console.log(`     ${"─".repeat(12)} ${"──".padEnd(4)} ${bLabels.map(() => "─".repeat(14)).join("  ")}`);

for (const row of compareRows) {
  const cells: string[] = [];
  let cat = "";
  for (const b of row.builds) {
    const effectiveKoN = b.isSingleUse ? b.nsKoN : b.koN;
    const effectiveChance = b.isSingleUse ? b.nsChance : b.chance;
    const effectiveStraddle = b.isSingleUse ? b.nsStraddle : b.straddle;
    const label = koLabel(effectiveKoN, effectiveChance, effectiveStraddle);
    const singleMark = b.isSingleUse && b.koN <= 2 ? "*" : "";
    cells.push((label + singleMark).padStart(14));
    cat = b.cat === "Physical" ? "物理" : "特殊";
  }
  // Highlight rows where koN changes across builds (the interesting tradeoffs)
  const koNs = row.builds.map(b => b.isSingleUse ? b.nsKoN : b.koN);
  const changes = koNs.some(k => k !== koNs[0]);
  const marker = changes ? "△" : " ";
  console.log(`${marker} #${String(row.rank).padStart(2)} ${ja(row.name).padEnd(10)} ${cat.padEnd(4)} ${cells.join("  ")}`);
}

// Summary per build
console.log(`\n  Summary (継続技のみ):`);
for (const build of compareBuilds) {
  const physThreats = build.matchups.filter(m => {
    const koN = m.bestIsSingleUse ? m.bestNonSingleKoN : m.koN;
    const cat = m.bestIsSingleUse ? "Physical" : m.bestCategory;  // crude, check actual
    return koN <= 2;
  });
  const physCount = physThreats.filter(m => {
    // Get the effective category for 乱2 threats
    const cat = m.bestIsSingleUse ? m.bestCategory : m.bestCategory;
    return cat === "Physical";
  }).length;
  const specCount = physThreats.length - physCount;
  console.log(`  ${build.label} (B${build.defStat}/D${build.spdStat}): 乱2以内=${build.twoHkoCountReal}/29 (物理${physCount} 特殊${specCount})`);
}

// Show specific moves for B6/D28 threats in the 乱2 zone
console.log(`\n  * = 単発技(流星群/オバヒ)で乱2だが継続技では確3以上`);

console.log("\n── 凡例 ──");
console.log("  採用率閾値: " + MOVE_USAGE_THRESHOLD + "% 以上の攻撃技のみ対象");
console.log("  オボンのみ: HP≤50%で発動 → floor(maxHP/4) 回復。確2にはダメージ≥62.5%/発が必要");
console.log("  ⚠ = 乱数が50%を跨ぐ → 低乱数ならオボン不発動で2発KOの可能性あり");
console.log("  △ = ビルド間でkoNが変化する相手 (B/Dトレードオフで入れ替わる)");
