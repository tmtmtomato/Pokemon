/**
 * Hippowdon Lead Optimization Script
 *
 * Calculates the optimal nature/SP/item for lead Hippowdon against the pokechamdb TOP30 meta.
 * Key question: which build survives the most first-turn attacks from the meta?
 * Also: which opponents does Hippowdon OHKO with Earthquake?
 *
 * Chip damage context: Sand Stream (6.25%) + Stealth Rock (type-dependent)
 */

import { calculate, Pokemon, Move, Field, getEffectiveness } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

// ── Load TOP30 meta data ──────────────────────────────────────────────────
const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

// ── Build meta attacker profiles ──────────────────────────────────────────
// For each TOP30 Pokemon: their most-used attacking moves + nature/SP/ability/item
const metaAttackers = [];
for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species) continue;

  // Skip Hippowdon itself (mirror match irrelevant for optimization)
  if (raw.name === "Hippowdon") continue;

  // Get attacking moves (>10% usage, category != Status)
  const attackMoves = [];
  for (const m of raw.moves) {
    if (m.pct < 5) continue;
    const moveData = getMoveData(m.name);
    if (!moveData || moveData.category === "Status" || moveData.basePower <= 0) continue;
    attackMoves.push({ name: m.name, pct: m.pct, data: moveData });
  }

  if (attackMoves.length === 0) continue; // pure support (e.g. Umbreon with only Foul Play)

  // Primary nature (highest usage)
  const primaryNature = raw.natures?.[0]?.name || "Hardy";

  // Primary ability
  const primaryAbility = raw.abilities?.[0]?.name || species.abilities[0];

  // Primary item
  const primaryItem = raw.items?.[0]?.name || "";

  // Primary SP spread
  const primarySpread = raw.spreads?.[0] || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  // Check if this is a Mega
  const isMega = primaryItem.endsWith("ite") &&
    primaryItem !== "Eviolite" &&
    species.mega;

  metaAttackers.push({
    name: raw.name,
    rank: raw.rank,
    species,
    nature: primaryNature,
    ability: isMega ? species.mega.ability : primaryAbility,
    item: primaryItem,
    sp: primarySpread,
    isMega: !!isMega,
    attackMoves,
    types: isMega ? species.mega.types : species.types,
  });
}

console.log(`Loaded ${metaAttackers.length} meta attackers with attacking moves\n`);

// ── Hippowdon build candidates ────────────────────────────────────────────
// SP total = 66, HP always 32 (mandatory for a wall)
// Nature options: defensive natures that don't reduce Atk (for EQ)
const NATURES = [
  { name: "Impish", plus: "def", minus: "spa" },   // +B -C
  { name: "Careful", plus: "spd", minus: "spa" },   // +D -C
  { name: "Relaxed", plus: "def", minus: "spe" },   // +B -S
  { name: "Sassy", plus: "spd", minus: "spe" },     // +D -S
  { name: "Adamant", plus: "atk", minus: "spa" },   // +A -C (offensive)
  { name: "Bold", plus: "def", minus: "atk" },      // +B -A (loses EQ damage)
  { name: "Calm", plus: "spd", minus: "atk" },      // +D -A (loses EQ damage)
];

// SP allocations: H32 + remaining 34 split between B and D
const SP_SPREADS = [];
for (let b = 0; b <= 32; b += 2) {
  const d = Math.min(32, 34 - b);
  if (d < 0) continue;
  SP_SPREADS.push({ hp: 32, atk: 0, def: b, spa: 0, spd: d, spe: 0, label: `H32/B${b}/D${d}` });
}
// Also test with some Atk investment for EQ OHKOs
SP_SPREADS.push({ hp: 32, atk: 2, def: 32, spa: 0, spd: 0, spe: 0, label: "H32/A2/B32" });
SP_SPREADS.push({ hp: 32, atk: 2, def: 0, spa: 0, spd: 32, spe: 0, label: "H32/A2/D32" });

// Items to test
const ITEMS = ["Sitrus Berry", "Leftovers"];

// ── Calculate best Hippowdon build ────────────────────────────────────────
const field = new Field({ gameType: "Singles", weather: "Sand" });

const results = [];

for (const nature of NATURES) {
  for (const sp of SP_SPREADS) {
    for (const item of ITEMS) {
      const hippo = new Pokemon({
        name: "Hippowdon",
        sp,
        nature: nature.name,
        ability: "Sand Stream",
        item,
        moves: ["Earthquake", "Stealth Rock", "Yawn", "Whirlwind"],
      });

      const hippoHP = hippo.maxHP();

      // Track survival and OHKO counts
      let surviveCount = 0;   // # of meta Pokemon whose best attack doesn't OHKO
      let ohkoCount = 0;       // # of meta Pokemon Hippowdon OHKOs with EQ
      const vulnerabilities = [];  // Who OHKOs Hippowdon?
      const ohkoTargets = [];      // Who does Hippo OHKO?

      for (const atk of metaAttackers) {
        // Build attacker Pokemon
        const attacker = new Pokemon({
          name: atk.name,
          sp: atk.sp,
          nature: atk.nature,
          ability: atk.ability,
          item: atk.item,
          isMega: atk.isMega,
        });

        // Find strongest attack against Hippowdon
        let worstDmgPct = 0;
        let worstMoveName = "";

        for (const m of atk.attackMoves) {
          try {
            const move = new Move(m.name);
            const result = calculate(attacker, hippo, move, field);
            const [minPct, maxPct] = result.percentRange();
            // Use max damage (worst case for defender)
            if (maxPct > worstDmgPct) {
              worstDmgPct = maxPct;
              worstMoveName = m.name;
            }
          } catch (e) {
            // Move not found or calc error, skip
          }
        }

        // Sitrus Berry recovery: +25% HP when below 50%
        // For survival calc: if worst hit puts Hippo below 50% but above 0%, Sitrus activates
        const sitrusRecovery = item === "Sitrus Berry" ? 25 : 0;

        // Can survive the strongest hit?
        // Survive = worstDmgPct < 100 (not OHKOd)
        if (worstDmgPct < 100) {
          surviveCount++;
        } else {
          vulnerabilities.push({
            name: atk.name,
            rank: atk.rank,
            move: worstMoveName,
            dmgPct: worstDmgPct,
          });
        }

        // Can Hippowdon OHKO with Earthquake?
        try {
          const eq = new Move("Earthquake");
          const eqResult = calculate(hippo, attacker, eq, field);
          const ko = eqResult.koChance();
          if (ko && ko.n === 1 && ko.chance >= 1.0) {
            ohkoCount++;
            ohkoTargets.push({
              name: atk.name,
              dmg: eqResult.percentRange(),
            });
          }
        } catch (e) {
          // skip
        }
      }

      results.push({
        nature: nature.name,
        sp: sp.label,
        item,
        surviveCount,
        ohkoCount,
        vulnerabilities,
        ohkoTargets,
        total: metaAttackers.length,
      });
    }
  }
}

// ── Sort and display results ──────────────────────────────────────────────
results.sort((a, b) => {
  // Primary: survive more, Secondary: OHKO more
  if (b.surviveCount !== a.surviveCount) return b.surviveCount - a.surviveCount;
  return b.ohkoCount - a.ohkoCount;
});

console.log("═══════════════════════════════════════════════════════════════");
console.log("  HIPPOWDON LEAD OPTIMIZATION — TOP BUILDS");
console.log("═══════════════════════════════════════════════════════════════\n");

// Show top 10
for (let i = 0; i < Math.min(15, results.length); i++) {
  const r = results[i];
  console.log(`#${i + 1}: ${r.nature} / ${r.sp} / ${r.item}`);
  console.log(`   Survive: ${r.surviveCount}/${r.total}  |  EQ確1: ${r.ohkoCount}/${r.total}`);
  if (r.vulnerabilities.length > 0) {
    console.log(`   被確1: ${r.vulnerabilities.map(v => `${v.name}(${v.move} ${v.dmgPct.toFixed(1)}%)`).join(", ")}`);
  }
  console.log();
}

// ── Detailed analysis of top build ────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  BEST BUILD — DETAILED MATCHUP TABLE");
console.log("═══════════════════════════════════════════════════════════════\n");

const best = results[0];
console.log(`Build: ${best.nature} / ${best.sp} / ${best.item}\n`);

const hippo = new Pokemon({
  name: "Hippowdon",
  sp: SP_SPREADS.find(s => s.label === best.sp),
  nature: best.nature,
  ability: "Sand Stream",
  item: best.item,
  moves: ["Earthquake", "Stealth Rock", "Yawn", "Whirlwind"],
});

console.log(`Stats: HP=${hippo.maxHP()} Atk=${hippo.stat("atk")} Def=${hippo.stat("def")} SpD=${hippo.stat("spd")} Spe=${hippo.stat("spe")}`);
console.log();

// ── Chip damage table for all TOP30 ───────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  CHIP DAMAGE TABLE — Sand + Stealth Rock per meta Pokemon");
console.log("═══════════════════════════════════════════════════════════════\n");

const SAND_IMMUNE_TYPES = new Set(["Rock", "Ground", "Steel"]);
const SAND_CHIP = 6.25;

console.log("Pokemon            | Types          | Sand  | SR    | Total | Eff.HP");
console.log("-------------------|----------------|-------|-------|-------|-------");

for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species) continue;

  const types = species.types;
  const isMegaMain = raw.items?.[0]?.name?.endsWith("ite") &&
    raw.items[0].name !== "Eviolite" && species.mega;
  const effectiveTypes = isMegaMain ? species.mega.types : types;

  // Sand chip
  const sandImmune = effectiveTypes.some(t => SAND_IMMUNE_TYPES.has(t));
  const sandChip = sandImmune ? 0 : SAND_CHIP;

  // SR chip: Rock effectiveness / 8 * 100
  const rockEff = getEffectiveness("Rock", effectiveTypes);
  const srChip = (rockEff / 8) * 100;

  const totalChip = sandChip + srChip;
  const effHP = Math.max(0, 100 - totalChip);

  const name = raw.name.padEnd(18);
  const typeStr = effectiveTypes.join("/").padEnd(14);
  console.log(`${name} | ${typeStr} | ${sandChip.toFixed(2).padStart(5)} | ${srChip.toFixed(2).padStart(5)} | ${totalChip.toFixed(2).padStart(5)} | ${effHP.toFixed(1).padStart(5)}%`);
}

// ── Hippowdon EQ damage vs all TOP30 ──────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  HIPPOWDON EARTHQUAKE vs TOP30 (best build)");
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("Pokemon            | EQ Dmg%       | KO    | Notes");
console.log("-------------------|---------------|-------|------");

for (const atk of metaAttackers) {
  const defender = new Pokemon({
    name: atk.name,
    sp: atk.sp,
    nature: atk.nature,
    ability: atk.ability,
    item: atk.item,
    isMega: atk.isMega,
  });

  try {
    const eq = new Move("Earthquake");
    const result = calculate(hippo, defender, eq, field);
    const [minPct, maxPct] = result.percentRange();
    const ko = result.koChance();

    // Check Levitate/Flying immunity
    const defTypes = atk.isMega ? atk.species.mega.types : atk.species.types;
    const isImmune = defTypes.includes("Flying") || atk.ability === "Levitate";

    const name = atk.name.padEnd(18);
    const dmgStr = isImmune ? "IMMUNE".padEnd(13) : `${minPct.toFixed(1)}-${maxPct.toFixed(1)}%`.padEnd(13);
    const koStr = isImmune ? "---" : (ko ? `${ko.n}HKO ${ko.chance >= 1 ? "確" : `乱(${(ko.chance*100).toFixed(0)}%)`}` : "---");

    let notes = "";
    if (isImmune) notes = atk.ability === "Levitate" ? "ふゆう" : "ひこうタイプ";

    console.log(`${name} | ${dmgStr} | ${koStr.padEnd(5)} | ${notes}`);
  } catch (e) {
    console.log(`${atk.name.padEnd(18)} | ERROR         |       | ${e.message}`);
  }
}

// ── Who OHKOs Hippowdon? Detailed ─────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  WHO OHKOs HIPPOWDON? (best build)");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const atk of metaAttackers) {
  const attacker = new Pokemon({
    name: atk.name,
    sp: atk.sp,
    nature: atk.nature,
    ability: atk.ability,
    item: atk.item,
    isMega: atk.isMega,
  });

  const moveResults = [];
  for (const m of atk.attackMoves) {
    try {
      const move = new Move(m.name);
      const result = calculate(attacker, hippo, move, field);
      const [minPct, maxPct] = result.percentRange();
      const ko = result.koChance();
      moveResults.push({
        moveName: m.name,
        pct: m.pct,
        minPct,
        maxPct,
        koN: ko?.n,
        koChance: ko?.chance,
      });
    } catch (e) {
      // skip
    }
  }

  if (moveResults.length === 0) continue;

  const best = moveResults.reduce((a, b) => a.maxPct > b.maxPct ? a : b);
  const koLabel = best.koN === 1
    ? (best.koChance >= 1 ? "確1" : `乱1(${(best.koChance*100).toFixed(0)}%)`)
    : best.koN === 2
    ? (best.koChance >= 1 ? "確2" : `乱2(${(best.koChance*100).toFixed(0)}%)`)
    : `確${best.koN}+`;

  console.log(`${atk.name} (#${atk.rank}): ${best.moveName} → ${best.minPct.toFixed(1)}-${best.maxPct.toFixed(1)}% [${koLabel}]`);
  // Show other notable moves
  for (const m of moveResults) {
    if (m === best) continue;
    if (m.maxPct > 30) {
      const mkoLabel = m.koN === 1
        ? (m.koChance >= 1 ? "確1" : `乱1(${(m.koChance*100).toFixed(0)}%)`)
        : m.koN === 2
        ? (m.koChance >= 1 ? "確2" : `乱2(${(m.koChance*100).toFixed(0)}%)`)
        : `確${m.koN}+`;
      console.log(`   └ ${m.moveName}: ${m.minPct.toFixed(1)}-${m.maxPct.toFixed(1)}% [${mkoLabel}]`);
    }
  }
}
