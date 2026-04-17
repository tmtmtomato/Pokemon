/**
 * Hippowdon Partner Optimization — Phase 2
 *
 * Given lead Hippowdon (Adamant/H32/B2/D32/Sitrus Berry),
 * calculate which 2 partners cover the most TOP30 meta threats
 * after Sand + Stealth Rock chip damage is applied.
 *
 * For each candidate partner pair:
 *   - Each opponent starts at (100% - sandChip - srChip)
 *   - Calculate if partner can OHKO/2HKO at that reduced HP
 *   - Count total coverage
 */

import { calculate, Pokemon, Move, Field, getEffectiveness } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

// ── Load data ─────────────────────────────────────────────────────────────
const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

// Also load the full singles ranking for partner candidates
const singlesData = JSON.parse(
  readFileSync("home-data/storage/analysis/2026-04-10-singles.json", "utf-8")
);

const SAND_IMMUNE_TYPES = new Set(["Rock", "Ground", "Steel"]);
const SAND_CHIP = 6.25;

// ── Build meta opponent profiles ──────────────────────────────────────────
interface MetaOpp {
  name: string;
  rank: number;
  species: any;
  types: string[];
  nature: string;
  ability: string;
  item: string;
  sp: any;
  isMega: boolean;
  chipPct: number;   // sand + SR chip
  effHP: number;     // 100 - chipPct
}

const metaOpps: MetaOpp[] = [];
for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species) continue;

  const primaryItem = raw.items?.[0]?.name || "";
  const isMega = primaryItem.endsWith("ite") &&
    primaryItem !== "Eviolite" && !!species.mega;
  const types = isMega ? species.mega.types : species.types;

  const sandImmune = types.some((t: string) => SAND_IMMUNE_TYPES.has(t));
  const sandChip = sandImmune ? 0 : SAND_CHIP;
  const rockEff = getEffectiveness("Rock" as any, types as any);
  const srChip = (rockEff / 8) * 100;
  const chipPct = sandChip + srChip;

  metaOpps.push({
    name: raw.name,
    rank: raw.rank,
    species,
    types,
    nature: raw.natures?.[0]?.name || "Hardy",
    ability: isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]),
    item: primaryItem,
    sp: raw.spreads?.[0] || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    isMega,
    chipPct,
    effHP: Math.max(0, 100 - chipPct),
  });
}

console.log(`Meta opponents: ${metaOpps.length}`);

// ── Build partner candidate pool ──────────────────────────────────────────
// Use all Pokemon from the singles ranking, excluding Hippowdon itself
// Focus on the top ~50 by overallScore for tractability
interface PartnerCandidate {
  name: string;
  species: any;
  builds: {
    nature: string;
    ability: string;
    item: string;
    sp: any;
    isMega: boolean;
    moves: string[];
  }[];
}

const partnerCandidates: PartnerCandidate[] = [];
const seenSpecies = new Set<string>();

// Take top Pokemon by overallScore
const ranked = [...singlesData.pokemon]
  .sort((a: any, b: any) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

for (const p of ranked.slice(0, 80)) {
  const baseName = p.name.replace(/-Mega$/, "");
  if (baseName === "Hippowdon") continue;
  if (seenSpecies.has(p.name)) continue;
  seenSpecies.add(p.name);

  const species = getSpecies(baseName);
  if (!species) continue;

  // Get best build (highest overallScore)
  const build = p.builds?.[0];
  if (!build) continue;

  const moves = build.moves || [];
  const isMega = p.name.endsWith("-Mega");

  partnerCandidates.push({
    name: p.name,
    species,
    builds: [{
      nature: build.nature || "Hardy",
      ability: build.ability || species.abilities[0],
      item: build.item || "",
      sp: build.sp || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      isMega,
      moves: moves.filter((m: string) => {
        const md = getMoveData(m);
        return md && md.category !== "Status" && md.basePower > 0;
      }),
    }],
  });
}

console.log(`Partner candidates: ${partnerCandidates.length}`);

// ── Evaluate each partner against meta with chip ──────────────────────────
type CoverageResult = {
  name: string;
  koTargets: { name: string; move: string; koN: number; dmgPct: number; withChip: boolean }[];
  canKO2Count: number;   // can 2HKO or better (considering chip)
  canKO1Count: number;   // can OHKO (considering chip)
};

const field = new Field({ gameType: "Singles", weather: "Sand" });

function evaluatePartner(cand: PartnerCandidate): CoverageResult {
  const build = cand.builds[0];
  const attacker = new Pokemon({
    name: cand.species.name,
    sp: build.sp,
    nature: build.nature,
    ability: build.ability,
    item: build.item,
    isMega: build.isMega,
    moves: build.moves,
  });

  const koTargets: CoverageResult["koTargets"] = [];

  for (const opp of metaOpps) {
    const defender = new Pokemon({
      name: opp.name,
      sp: opp.sp,
      nature: opp.nature,
      ability: opp.ability,
      item: opp.item,
      isMega: opp.isMega,
    });

    let bestKoN = 99;
    let bestMove = "";
    let bestDmgPct = 0;
    let bestWithChip = false;

    for (const moveName of build.moves) {
      try {
        const move = new Move(moveName);
        const result = calculate(attacker, defender, move, field);
        const [minPct, maxPct] = result.percentRange();

        // Without chip: normal KO calc
        const koNormal = result.koChance();
        let koN = koNormal?.n ?? 99;

        // With chip: if maxPct + chipPct >= 100, it's effectively an OHKO
        // More precisely: if damage range can KO at reduced HP
        const effHP = opp.effHP;
        let adjustedKoN = koN;
        let withChip = false;

        if (maxPct >= effHP && minPct >= effHP) {
          adjustedKoN = 1;  // guaranteed OHKO with chip
          withChip = true;
        } else if (maxPct >= effHP) {
          // High roll OHKO with chip
          adjustedKoN = 1;
          withChip = true;
        } else if (maxPct * 2 >= effHP * 1.0) {
          // 2HKO considering chip
          adjustedKoN = Math.min(adjustedKoN, 2);
          withChip = opp.chipPct > 0;
        }

        // Also check: 2-hit kill with chip damage between hits
        // After first hit (minPct%), opponent takes another chipPct% sand
        // So total = hit1 + chipPct + hit2 vs 100-chipPct(initial)
        const twoHitTotal = minPct * 2 + opp.chipPct; // 2 hits + extra chip between hits
        if (twoHitTotal >= 100 - opp.chipPct + opp.chipPct) {
          // Wait, let me think more carefully:
          // Turn 0: opponent switches in → takes SR + sand = chipPct off
          // Turn 1: partner attacks → damage = minPct of maxHP
          // End of turn 1: opponent takes sand again (if not immune)
          // Actually the chip model should be:
          //   effective HP after initial chip = effHP = 100 - chipPct
          //   If 1 attack ≥ effHP → OHKO with chip
          //   If 2 attacks ≥ effHP (+ extra sand between turns) → 2HKO with chip
        }

        if (adjustedKoN < bestKoN || (adjustedKoN === bestKoN && maxPct > bestDmgPct)) {
          bestKoN = adjustedKoN;
          bestMove = moveName;
          bestDmgPct = maxPct;
          bestWithChip = withChip;
        }
      } catch (e) {
        // skip
      }
    }

    if (bestKoN <= 2) {
      koTargets.push({
        name: opp.name,
        move: bestMove,
        koN: bestKoN,
        dmgPct: bestDmgPct,
        withChip: bestWithChip,
      });
    }
  }

  return {
    name: cand.name,
    koTargets,
    canKO2Count: koTargets.filter(t => t.koN <= 2).length,
    canKO1Count: koTargets.filter(t => t.koN <= 1).length,
  };
}

// ── Evaluate all partners ─────────────────────────────────────────────────
console.log("\nEvaluating partners...\n");
const partnerResults: CoverageResult[] = [];
for (const cand of partnerCandidates) {
  partnerResults.push(evaluatePartner(cand));
}

partnerResults.sort((a, b) => {
  if (b.canKO2Count !== a.canKO2Count) return b.canKO2Count - a.canKO2Count;
  return b.canKO1Count - a.canKO1Count;
});

console.log("═══════════════════════════════════════════════════════════════");
console.log("  PARTNER COVERAGE RANKING (with Sand+SR chip)");
console.log("═══════════════════════════════════════════════════════════════\n");

for (let i = 0; i < Math.min(30, partnerResults.length); i++) {
  const r = partnerResults[i];
  const oTargets = r.koTargets.filter(t => t.koN <= 1).map(t => t.name).join(", ");
  const twoTargets = r.koTargets.filter(t => t.koN === 2).map(t => `${t.name}${t.withChip ? "*" : ""}`).join(", ");
  console.log(`#${i + 1}: ${r.name} — 確1: ${r.canKO1Count}  確2以内: ${r.canKO2Count}/30`);
  if (oTargets) console.log(`   確1: ${oTargets}`);
  if (twoTargets) console.log(`   確2: ${twoTargets}`);
  console.log();
}

// ── Find best pairs ───────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  BEST PARTNER PAIRS (combined coverage)");
console.log("═══════════════════════════════════════════════════════════════\n");

// For tractability, take top 20 partners and find best pair
const topPartners = partnerResults.slice(0, 25);

type PairResult = {
  p1: string;
  p2: string;
  combined2HKO: number;
  combined1HKO: number;
  coveredNames: string[];
  uncovered: string[];
};

const pairResults: PairResult[] = [];
const allOppNames = metaOpps.map(o => o.name);

for (let i = 0; i < topPartners.length; i++) {
  for (let j = i + 1; j < topPartners.length; j++) {
    const p1 = topPartners[i];
    const p2 = topPartners[j];

    // Check species clause: same base species can't be on same team
    const base1 = p1.name.replace(/-Mega$/, "").replace(/-HB$/, "").replace(/-HD$/, "");
    const base2 = p2.name.replace(/-Mega$/, "").replace(/-HB$/, "").replace(/-HD$/, "");
    if (base1 === base2) continue;

    // Check mega clause: only one mega allowed
    const p1Mega = p1.name.endsWith("-Mega");
    const p2Mega = p2.name.endsWith("-Mega");
    if (p1Mega && p2Mega) continue;

    // Combined coverage
    const covered2HKO = new Set<string>();
    for (const t of p1.koTargets) {
      if (t.koN <= 2) covered2HKO.add(t.name);
    }
    for (const t of p2.koTargets) {
      if (t.koN <= 2) covered2HKO.add(t.name);
    }

    const covered1HKO = new Set<string>();
    for (const t of p1.koTargets) {
      if (t.koN <= 1) covered1HKO.add(t.name);
    }
    for (const t of p2.koTargets) {
      if (t.koN <= 1) covered1HKO.add(t.name);
    }

    // Also add Hippowdon's own EQ coverage (確1: Gengar, Glimmora, Sneasler, Lucario)
    const hippoOHKOs = ["Gengar", "Glimmora", "Sneasler", "Lucario"];
    // Hippo 2HKOs (from earlier analysis)
    const hippo2HKOs = ["Primarina", "Archaludon", "Kingambit", "Aegislash", "Mimikyu",
      "Lopunny", "Basculegion", "Greninja", "Dragapult", "Tyranitar"];

    for (const h of hippoOHKOs) {
      covered1HKO.add(h);
      covered2HKO.add(h);
    }
    for (const h of hippo2HKOs) {
      covered2HKO.add(h);
    }

    const uncovered = allOppNames.filter(n => !covered2HKO.has(n));

    pairResults.push({
      p1: p1.name,
      p2: p2.name,
      combined2HKO: covered2HKO.size,
      combined1HKO: covered1HKO.size,
      coveredNames: [...covered2HKO],
      uncovered,
    });
  }
}

pairResults.sort((a, b) => {
  if (b.combined2HKO !== a.combined2HKO) return b.combined2HKO - a.combined2HKO;
  return b.combined1HKO - a.combined1HKO;
});

for (let i = 0; i < Math.min(20, pairResults.length); i++) {
  const r = pairResults[i];
  console.log(`#${i + 1}: ${r.p1} + ${r.p2}`);
  console.log(`   Coverage: ${r.combined2HKO}/30 (確2以内)  |  ${r.combined1HKO}/30 (確1)`);
  if (r.uncovered.length > 0) {
    console.log(`   Uncovered: ${r.uncovered.join(", ")}`);
  } else {
    console.log(`   ★ FULL COVERAGE ★`);
  }
  console.log();
}
