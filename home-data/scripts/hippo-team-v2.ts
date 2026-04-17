/**
 * Hippowdon Team Builder v2 — Practical Partner Optimization
 *
 * Focus on pokechamdb TOP30 Pokemon as partner candidates (meta-proven builds).
 * Evaluate both offense (can KO with chip) AND defense (can survive their hits).
 *
 * Scenario:
 *   Lead Hippowdon sets Stealth Rock turn 1.
 *   Sand Stream activates immediately.
 *   Opponent's switch-ins take Sand + SR chip.
 *   Back 2 partners need to handle the remaining threats.
 *
 * Key metrics per partner:
 *   - "Handles" = can KO (≤確2 with chip) AND survive their strongest hit (not OHKOd)
 *   - "Threatens" = can KO but gets OHKOd (revenge kill / trade situation)
 *   - "Walls" = survives 2+ hits but can't KO
 *   - "Loses" = gets OHKOd and can't KO
 */

import { calculate, Pokemon, Move, Field, getEffectiveness } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

const SAND_IMMUNE_TYPES = new Set(["Rock", "Ground", "Steel"]);
const SAND_CHIP = 6.25;
const field = new Field({ gameType: "Singles", weather: "Sand" });

// ── Build meta opponents ──────────────────────────────────────────────────
interface MetaOpp {
  name: string;
  rank: number;
  types: string[];
  nature: string;
  ability: string;
  item: string;
  sp: any;
  isMega: boolean;
  chipPct: number;
  attackMoves: { name: string; pct: number }[];
  pokemon?: any; // Pokemon object for calcs
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

  // Only consider moves with ≥20% usage — too rare to plan around
  const attackMoves: { name: string; pct: number }[] = [];
  for (const m of raw.moves) {
    if (m.pct < 20) continue;
    const md = getMoveData(m.name);
    if (!md || md.category === "Status" || md.basePower <= 0) continue;
    attackMoves.push({ name: m.name, pct: m.pct });
  }

  const nature = raw.natures?.[0]?.name || "Hardy";
  const ability = isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]);
  const item = primaryItem;
  const sp = raw.spreads?.[0] || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  metaOpps.push({
    name: raw.name,
    rank: raw.rank,
    types,
    nature,
    ability,
    item,
    sp,
    isMega,
    chipPct: sandChip + srChip,
    attackMoves,
    pokemon: new Pokemon({ name: raw.name, sp, nature, ability, item, isMega }),
  });
}

// ── Build partner candidates from TOP30 (excluding Hippowdon) ─────────────
// Also add some proven non-TOP30 picks that pair well with sand
interface PartnerBuild {
  name: string;
  displayName: string;
  nature: string;
  ability: string;
  item: string;
  sp: any;
  isMega: boolean;
  attackMoves: string[];
  pokemon: any;
  types: string[];
  fromTop30: boolean;
  sandChipPct: number;  // sand damage partner takes per turn (0 if immune)
  hasFullHPAbility: boolean; // Multiscale etc — invalidated by sand chip
}

const partners: PartnerBuild[] = [];

for (const raw of top30Raw) {
  if (raw.name === "Hippowdon") continue;
  const species = getSpecies(raw.name);
  if (!species) continue;

  const primaryItem = raw.items?.[0]?.name || "";
  const isMega = primaryItem.endsWith("ite") &&
    primaryItem !== "Eviolite" && !!species.mega;
  const types = isMega ? species.mega.types : species.types;
  const nature = raw.natures?.[0]?.name || "Hardy";
  const ability = isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]);
  const sp = raw.spreads?.[0] || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  const attackMoves: string[] = [];
  for (const m of raw.moves) {
    if (m.pct < 10) continue;
    const md = getMoveData(m.name);
    if (!md || md.category === "Status" || md.basePower <= 0) continue;
    attackMoves.push(m.name);
  }

  const sandImmunePartner = types.some((t: string) => SAND_IMMUNE_TYPES.has(t));
  const partnerSandChip = sandImmunePartner ? 0 : SAND_CHIP;
  // Full-HP abilities: Multiscale, Shadow Shield — broken by any chip damage
  const FULL_HP_ABILITIES = new Set(["Multiscale", "Shadow Shield"]);
  const hasFullHPAbility = FULL_HP_ABILITIES.has(ability);

  partners.push({
    name: raw.name,
    displayName: `${raw.name}${isMega ? " (Mega)" : ""} [#${raw.rank}]`,
    nature,
    ability,
    item: primaryItem,
    sp,
    isMega,
    attackMoves,
    pokemon: new Pokemon({ name: raw.name, sp, nature, ability, item: primaryItem, isMega }),
    types,
    fromTop30: true,
    sandChipPct: partnerSandChip,
    hasFullHPAbility,
  });
}

console.log(`Partners from TOP30: ${partners.length}`);
console.log(`Meta opponents: ${metaOpps.length}\n`);

// ── Sitrus Berry-aware KO calculation ─────────────────────────────────────
// Sitrus Berry (オボンのみ): restores floor(maxHP/4) when HP drops to ≤ 50%.
//   (A) All rolls > 50%: Sitrus always activates → need ≥62.5%/hit for 確2
//   (B) All rolls ≤ 50%: Sitrus never activates on hit 1 → normal calc (≥50%)
//   (C) Rolls straddle 50%: ⚠ low rolls skip Sitrus → possible 2HKO
function koWithSitrus(rolls: number[], maxHP: number): { n: number; chance: number } {
  const ohkoCount = rolls.filter(r => r >= maxHP).length;
  if (ohkoCount === 16) return { n: 1, chance: 1.0 };
  if (ohkoCount > 0) return { n: 1, chance: ohkoCount / 16 };

  const sitrusHeal = Math.floor(maxHP / 4);
  const sitrusThreshold = Math.floor(maxHP / 2);

  let twoHitKO = 0;
  for (const r1 of rolls) {
    let hp = maxHP - r1;
    if (hp > 0 && hp <= sitrusThreshold) hp += sitrusHeal;
    for (const r2 of rolls) {
      if (r2 >= hp) twoHitKO++;
    }
  }
  if (twoHitKO > 0) return { n: 2, chance: twoHitKO / (16 * 16) };

  let threeHitKO = 0;
  for (const r1 of rolls) {
    let hp = maxHP - r1;
    let used = false;
    if (hp > 0 && hp <= sitrusThreshold) { hp += sitrusHeal; used = true; }
    for (const r2 of rolls) {
      let hp2 = hp - r2;
      if (!used && hp2 > 0 && hp2 <= sitrusThreshold) hp2 += sitrusHeal;
      for (const r3 of rolls) {
        if (r3 >= hp2) threeHitKO++;
      }
    }
  }
  if (threeHitKO > 0) return { n: 3, chance: threeHitKO / (16 ** 3) };

  const effectiveHP = maxHP + sitrusHeal;
  const minDmg = Math.min(...rolls);
  return { n: Math.ceil(effectiveHP / minDmg), chance: 1.0 };
}

// ── Hippowdon (Impish / H32/B16/D18 / Sitrus Berry) ──────────────────────
// Confirmed optimal build: わんぱく H32/B16/D18 (B169/D110, Atk132)
// Role: Survive 2 hits → Stealth Rock + Yawn/EQ. Defensive nature > Adamant.
const hippo = new Pokemon({
  name: "Hippowdon",
  sp: { hp: 32, atk: 0, def: 16, spa: 0, spd: 18, spe: 0 },
  nature: "Impish",
  ability: "Sand Stream",
  item: "Sitrus Berry",
  moves: ["Earthquake", "Stealth Rock", "Yawn", "Whirlwind"],
});

// ── Evaluate matchups ─────────────────────────────────────────────────────
type MatchupResult = "handles" | "threatens" | "walls" | "loses" | "immune_to";

interface DetailedMatchup {
  oppName: string;
  result: MatchupResult;
  myBestMove: string;
  myBestDmg: number;
  myKoN: number;
  oppBestMove: string;
  oppBestDmg: number;
  oppKoN: number;
  chipPct: number;
}

function evaluatePartnerVsOpp(partner: PartnerBuild, opp: MetaOpp): DetailedMatchup {
  // Partner attacking opponent (with chip applied)
  let myBestDmg = 0;
  let myBestMove = "";
  let myKoN = 99;

  for (const moveName of partner.attackMoves) {
    try {
      const move = new Move(moveName);
      const result = calculate(partner.pokemon, opp.pokemon, move, field);
      const [minPct, maxPct] = result.percentRange();

      // Effective HP after chip
      const effHP = Math.max(1, 100 - opp.chipPct);

      // Can this move KO at effective HP?
      let koN = 99;
      if (minPct >= effHP) {
        koN = 1; // guaranteed OHKO with chip
      } else if (maxPct >= effHP) {
        koN = 1; // high-roll OHKO with chip
      } else if (minPct * 2 >= effHP) {
        koN = 2; // guaranteed 2HKO at effective HP
      } else if (maxPct * 2 >= effHP) {
        koN = 2; // 2HKO with some rolls
      } else {
        const ko = result.koChance();
        koN = ko?.n ?? 99;
      }

      if (koN < myKoN || (koN === myKoN && maxPct > myBestDmg)) {
        myKoN = koN;
        myBestMove = moveName;
        myBestDmg = maxPct;
      }
    } catch (e) {
      // skip
    }
  }

  // Opponent attacking partner
  // IMPORTANT: If partner is NOT sand-immune and has a full-HP ability (Multiscale),
  // sand chip will break the ability before the opponent attacks.
  // Create a "sand-damaged" partner with the ability disabled.
  let oppBestDmg = 0;
  let oppBestMove = "";
  let oppKoN = 99;

  // Build defender: if sand breaks full-HP ability, use a dummy ability
  const defenderForCalc = (partner.hasFullHPAbility && partner.sandChipPct > 0)
    ? new Pokemon({
        name: partner.pokemon.name,
        sp: partner.sp,
        nature: partner.nature,
        ability: "Inner Focus",  // neutral ability replacing broken Multiscale
        item: partner.item,
        isMega: partner.isMega,
      })
    : partner.pokemon;

  for (const m of opp.attackMoves) {
    try {
      const move = new Move(m.name);
      const result = calculate(opp.pokemon, defenderForCalc, move, field);
      const [minPct, maxPct] = result.percentRange();

      // Also account for sand chip reducing partner's effective HP
      // Partner enters at (100 - sandChipPct)%, so opponent needs less to KO
      const partnerEffHP = 100 - partner.sandChipPct;
      const ko = result.koChance();
      let koN = ko?.n ?? 99;

      // Adjust: if max damage % >= partner's effective HP, it's an OHKO
      if (maxPct >= partnerEffHP) {
        koN = 1;
      } else if (maxPct * 2 >= partnerEffHP) {
        koN = Math.min(koN, 2);
      }

      // Track the move with lowest koN (worst for partner), not just highest damage
      if (koN < oppKoN || (koN === oppKoN && maxPct > oppBestDmg)) {
        oppBestDmg = maxPct;
        oppBestMove = m.name;
        oppKoN = koN;
      }

} catch (e) {
      // skip
    }
  }

  // Classify matchup
  let result: MatchupResult;
  if (myKoN <= 2 && oppKoN > 1) {
    result = "handles"; // can KO and survives
  } else if (myKoN <= 2 && oppKoN === 1) {
    result = "threatens"; // can KO but gets OHKOd (trade)
  } else if (myKoN > 2 && oppKoN > 2) {
    result = "walls"; // neither can KO quickly
  } else if (myBestDmg === 0 && oppBestDmg === 0) {
    result = "immune_to"; // mutual immunity/no damage
  } else {
    result = "loses"; // can't KO and gets pressured
  }

  return {
    oppName: opp.name,
    result,
    myBestMove,
    myBestDmg,
    myKoN,
    oppBestMove,
    oppBestDmg,
    oppKoN,
    chipPct: opp.chipPct,
  };
}

// ── Evaluate all partners ─────────────────────────────────────────────────
interface PartnerEval {
  partner: PartnerBuild;
  matchups: DetailedMatchup[];
  handles: number;
  threatens: number;
  walls: number;
  loses: number;
  totalCoverage: number; // handles + threatens
}

const evals: PartnerEval[] = [];

for (const p of partners) {
  const matchups: DetailedMatchup[] = [];

  for (const opp of metaOpps) {
    // Skip self-matchup
    if (opp.name === p.name.replace(/-Mega$/, "")) continue;
    matchups.push(evaluatePartnerVsOpp(p, opp));
  }

  const handles = matchups.filter(m => m.result === "handles").length;
  const threatens = matchups.filter(m => m.result === "threatens").length;
  const walls = matchups.filter(m => m.result === "walls").length;
  const loses = matchups.filter(m => m.result === "loses").length;

  evals.push({
    partner: p,
    matchups,
    handles,
    threatens,
    walls,
    loses,
    totalCoverage: handles + threatens,
  });
}

evals.sort((a, b) => {
  if (b.handles !== a.handles) return b.handles - a.handles;
  if (b.totalCoverage !== a.totalCoverage) return b.totalCoverage - a.totalCoverage;
  return a.loses - b.loses;
});

// ── Display results ───────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════════");
console.log("  PARTNER RANKING — Handles (KO + survive) vs TOP30 meta");
console.log("  Chip: Sand(6.25%) + SR(type-dep) applied to opponents");
console.log("═══════════════════════════════════════════════════════════════\n");

for (let i = 0; i < evals.length; i++) {
  const e = evals[i];
  const p = e.partner;

  console.log(`#${i + 1}: ${p.displayName} [${p.types.join("/")}]`);
  console.log(`   ${p.nature} / ${p.item} / ${p.ability}`);
  console.log(`   Handles: ${e.handles}  Threatens: ${e.threatens}  Walls: ${e.walls}  Loses: ${e.loses}`);

  // Show handles
  const handleNames = e.matchups.filter(m => m.result === "handles").map(m => m.oppName);
  if (handleNames.length > 0) {
    console.log(`   ✓ ${handleNames.join(", ")}`);
  }

  // Show loses
  const loseDetails = e.matchups.filter(m => m.result === "loses");
  if (loseDetails.length > 0) {
    console.log(`   ✗ ${loseDetails.map(m => `${m.oppName}(${m.oppBestMove})`).join(", ")}`);
  }
  console.log();
}

// ── Hippowdon's own coverage ──────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  HIPPOWDON OWN COVERAGE (EQ kills after SR/Sand chip)");
console.log("═══════════════════════════════════════════════════════════════\n");

const hippoHandles: string[] = [];
const hippoThreatens: string[] = [];
for (const opp of metaOpps) {
  if (opp.name === "Hippowdon") continue;

  // Hippo EQ vs opponent
  try {
    const eq = new Move("Earthquake");
    const result = calculate(hippo, opp.pokemon, eq, field);
    const [minPct, maxPct] = result.percentRange();
    const effHP = Math.max(1, 100 - opp.chipPct);

    let myKoN = 99;
    if (minPct >= effHP) myKoN = 1;
    else if (maxPct >= effHP) myKoN = 1;
    else if (minPct * 2 >= effHP) myKoN = 2;
    else {
      const ko = result.koChance();
      myKoN = ko?.n ?? 99;
    }

    // Opponent vs Hippo (Sitrus Berry-aware)
    let oppKoN = 99;
    for (const m of opp.attackMoves) {
      try {
        const move = new Move(m.name);
        const r = calculate(opp.pokemon, hippo, move, field);
        const ko = koWithSitrus(r.rolls, hippo.maxHP());
        if (ko.n < oppKoN) oppKoN = ko.n;
      } catch (e) {}
    }

    if (myKoN <= 2 && oppKoN > 1) {
      hippoHandles.push(opp.name);
    } else if (myKoN <= 2 && oppKoN === 1) {
      hippoThreatens.push(opp.name);
    }
  } catch (e) {}
}
console.log(`Hippowdon handles: ${hippoHandles.join(", ")}`);
console.log(`Hippowdon threatens (trade): ${hippoThreatens.join(", ")}`);

// ── Best PAIRS ────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  BEST PARTNER PAIRS (Hippo + P1 + P2 combined coverage)");
console.log("═══════════════════════════════════════════════════════════════\n");

const hippoCovers = new Set([...hippoHandles, ...hippoThreatens]);

interface PairScore {
  p1: string;
  p2: string;
  combinedHandles: number;
  combinedTotal: number; // handles + threatens
  uncovered: string[];
  onlyThreatenedBy: string[]; // covered but only as trade
}

const pairs: PairScore[] = [];
const topEvals = evals.slice(0, 20); // top 20 partners

for (let i = 0; i < topEvals.length; i++) {
  for (let j = i + 1; j < topEvals.length; j++) {
    const e1 = topEvals[i];
    const e2 = topEvals[j];

    // Species clause
    const base1 = e1.partner.name.replace(/-Mega$/, "");
    const base2 = e2.partner.name.replace(/-Mega$/, "");
    if (base1 === base2) continue;

    // Mega clause
    if (e1.partner.isMega && e2.partner.isMega) continue;

    // Combined coverage including Hippowdon
    const handledSet = new Set<string>();
    const threatenedSet = new Set<string>();

    // Hippo coverage
    for (const h of hippoHandles) handledSet.add(h);
    for (const h of hippoThreatens) threatenedSet.add(h);

    // Partner 1
    for (const m of e1.matchups) {
      if (m.result === "handles") handledSet.add(m.oppName);
      if (m.result === "threatens") threatenedSet.add(m.oppName);
    }

    // Partner 2
    for (const m of e2.matchups) {
      if (m.result === "handles") handledSet.add(m.oppName);
      if (m.result === "threatens") threatenedSet.add(m.oppName);
    }

    const allCovered = new Set([...handledSet, ...threatenedSet]);
    const allOppNames = metaOpps.filter(o => o.name !== "Hippowdon").map(o => o.name);
    const uncovered = allOppNames.filter(n => !allCovered.has(n));
    const onlyThreatened = allOppNames.filter(n => !handledSet.has(n) && threatenedSet.has(n));

    pairs.push({
      p1: e1.partner.displayName,
      p2: e2.partner.displayName,
      combinedHandles: handledSet.size,
      combinedTotal: allCovered.size,
      uncovered,
      onlyThreatenedBy: onlyThreatened,
    });
  }
}

pairs.sort((a, b) => {
  if (b.combinedHandles !== a.combinedHandles) return b.combinedHandles - a.combinedHandles;
  if (b.combinedTotal !== a.combinedTotal) return b.combinedTotal - a.combinedTotal;
  return a.uncovered.length - b.uncovered.length;
});

for (let i = 0; i < Math.min(25, pairs.length); i++) {
  const r = pairs[i];
  console.log(`#${i + 1}: ${r.p1} + ${r.p2}`);
  console.log(`   Handles: ${r.combinedHandles}/29  |  Total: ${r.combinedTotal}/29`);
  if (r.uncovered.length > 0) {
    console.log(`   Uncovered: ${r.uncovered.join(", ")}`);
  }
  if (r.onlyThreatenedBy.length > 0 && r.onlyThreatenedBy.length <= 5) {
    console.log(`   Trade-only: ${r.onlyThreatenedBy.join(", ")}`);
  }
  console.log();
}

// ── Detailed matchup table for full-coverage pairs ──────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  FULL-COVERAGE PAIRS — WHO HANDLES WHOM?");
console.log("═══════════════════════════════════════════════════════════════\n");

// Find full-coverage pairs (handles=30) and show assignment
const fullCoveragePairs = pairs.filter(p => p.combinedHandles >= 30).slice(0, 5);

for (const pair of fullCoveragePairs) {
  // Find the partner evals
  const e1 = evals.find(e => e.partner.displayName === pair.p1)!;
  const e2 = evals.find(e => e.partner.displayName === pair.p2)!;
  if (!e1 || !e2) continue;

  console.log(`══ ${pair.p1} + ${pair.p2} ══`);

  const allOppNames = metaOpps.filter(o => o.name !== "Hippowdon").map(o => o.name);

  for (const oppName of allOppNames) {
    const hippoH = hippoHandles.includes(oppName);
    const hippoT = hippoThreatens.includes(oppName);
    const m1 = e1.matchups.find(m => m.oppName === oppName);
    const m2 = e2.matchups.find(m => m.oppName === oppName);

    // Determine best handler
    type Handler = { who: string; result: string; move: string; dmg: number; koN: number; oppMove: string; oppDmg: number };
    const handlers: Handler[] = [];

    if (hippoH) handlers.push({ who: "Hippowdon", result: "handles", move: "Earthquake", dmg: 0, koN: 2, oppMove: "", oppDmg: 0 });
    if (hippoT) handlers.push({ who: "Hippowdon", result: "threatens", move: "Earthquake", dmg: 0, koN: 2, oppMove: "", oppDmg: 0 });
    if (m1) handlers.push({ who: e1.partner.name, result: m1.result, move: m1.myBestMove, dmg: m1.myBestDmg, koN: m1.myKoN, oppMove: m1.oppBestMove, oppDmg: m1.oppBestDmg });
    if (m2) handlers.push({ who: e2.partner.name, result: m2.result, move: m2.myBestMove, dmg: m2.myBestDmg, koN: m2.myKoN, oppMove: m2.oppBestMove, oppDmg: m2.oppBestDmg });

    // Pick best handler (handles > threatens > walls > loses)
    const priority: Record<string, number> = { handles: 0, threatens: 1, walls: 2, loses: 3, immune_to: 4 };
    handlers.sort((a, b) => (priority[a.result] ?? 5) - (priority[b.result] ?? 5));
    const best = handlers[0];

    if (!best) {
      console.log(`  ${oppName.padEnd(16)} ??? UNCOVERED`);
      continue;
    }

    const koLabel = best.koN === 1 ? "確1" : best.koN === 2 ? "確2" : `確${best.koN}`;
    const resultMark = best.result === "handles" ? "○" : best.result === "threatens" ? "△" : "×";

    // Show who else can also handle
    const alsoHandlers = handlers.filter(h => h !== best && (h.result === "handles" || h.result === "threatens"));
    const alsoStr = alsoHandlers.length > 0 ? ` [also: ${alsoHandlers.map(h => h.who).join(", ")}]` : "";

    console.log(`  ${resultMark} ${oppName.padEnd(16)} ← ${best.who.padEnd(14)} ${best.move?.padEnd(16) || "".padEnd(16)} ${koLabel}${alsoStr}`);
  }
  console.log();
}
