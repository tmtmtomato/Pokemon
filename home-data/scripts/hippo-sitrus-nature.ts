/**
 * Hippowdon Sitrus Berry + Nature Comparison
 *
 * Q1: Does Sitrus Berry recovery (25% HP at <50%) turn any 確2 into 確3?
 * Q2: Does Adamant actually flip any EQ KO thresholds vs Impish/Careful?
 */

import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

const field = new Field({ gameType: "Singles", weather: "Sand" });

// ── Build meta attackers ──────────────────────────────────────────────────
const metaAttackers: {
  name: string;
  rank: number;
  pokemon: any;
  attackMoves: { name: string; pct: number }[];
}[] = [];

for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species) continue;
  if (raw.name === "Hippowdon") continue;

  const primaryItem = raw.items?.[0]?.name || "";
  const isMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite" && !!species.mega;
  const nature = raw.natures?.[0]?.name || "Hardy";
  const ability = isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]);
  const sp = raw.spreads?.[0] || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  const attackMoves: { name: string; pct: number }[] = [];
  for (const m of raw.moves) {
    if (m.pct < 5) continue;
    const md = getMoveData(m.name);
    if (!md || md.category === "Status" || md.basePower <= 0) continue;
    attackMoves.push({ name: m.name, pct: m.pct });
  }

  metaAttackers.push({
    name: raw.name,
    rank: raw.rank,
    pokemon: new Pokemon({ name: raw.name, sp, nature, ability, item: primaryItem, isMega }),
    attackMoves,
  });
}

// ── Nature/SP builds to compare ───────────────────────────────────────────
const builds = [
  { label: "Adamant H32/B2/D32", nature: "Adamant", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  { label: "Impish  H32/B2/D32", nature: "Impish",  sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  { label: "Careful H32/B2/D32", nature: "Careful", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  { label: "Impish  H32/B32/D2", nature: "Impish",  sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 } },
  { label: "Careful H32/B32/D2", nature: "Careful", sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 } },
];

// ══════════════════════════════════════════════════════════════════════════
// Q1: Sitrus Berry 確2 → 確3 analysis
// ══════════════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════");
console.log("  Q1: オボンのみで確2→確3になる対面");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const build of builds) {
  const hippo = new Pokemon({
    name: "Hippowdon",
    sp: build.sp,
    nature: build.nature,
    ability: "Sand Stream",
    item: "Sitrus Berry",
  });
  const maxHP = hippo.maxHP();

  console.log(`\n── ${build.label} (HP=${maxHP}, Atk=${hippo.stat("atk")}, Def=${hippo.stat("def")}, SpD=${hippo.stat("spd")}) ──`);

  for (const atk of metaAttackers) {
    for (const m of atk.attackMoves) {
      try {
        const move = new Move(m.name);
        const result = calculate(atk.pokemon, hippo, move, field);
        const [minPct, maxPct] = result.percentRange();
        const rolls = result.rolls as number[];

        // Without Sitrus: is this a 確2?
        // 確2 = min damage * 2 >= maxHP (guaranteed 2HKO)
        // 乱2 = max damage * 2 >= maxHP but min * 2 < maxHP
        const minDmg = rolls[0];
        const maxDmg = rolls[rolls.length - 1];

        const is2HKO = minDmg * 2 >= maxHP; // guaranteed 2HKO
        const isRanged2HKO = !is2HKO && maxDmg * 2 >= maxHP; // random 2HKO

        if (!is2HKO && !isRanged2HKO) continue; // not 2HKO, skip

        // With Sitrus: simulate
        // Hit 1: damage = roll → remaining = maxHP - roll
        // If remaining < maxHP * 0.5 → Sitrus activates: remaining += floor(maxHP * 0.25)
        // Hit 2: damage = roll → remaining -= roll
        // If remaining > 0 → survived = 確3 (or better)
        const sitrusHeal = Math.floor(maxHP * 0.25);

        // Check worst case (max damage both rolls) — if survives, guaranteed 確3
        // Check best case (min damage both rolls) — if doesn't survive, still 確2
        let survivesWorstCase = false;
        let survivesBestCase = false;
        let surviveCount = 0;

        // Check all 16x16 roll combinations
        for (const r1 of rolls) {
          for (const r2 of rolls) {
            let remaining = maxHP - r1;
            if (remaining <= 0) continue; // OHKOd

            // Sitrus check
            if (remaining <= Math.floor(maxHP * 0.5)) {
              remaining += sitrusHeal;
            }

            remaining -= r2;
            if (remaining > 0) surviveCount++;
          }
        }

        const totalCombos = rolls.length * rolls.length;
        const surviveRate = surviveCount / totalCombos;

        if (surviveRate > 0) {
          // This is a case where Sitrus turns 確2/乱2 into 確3/乱2
          const without = is2HKO ? "確2" : `乱2`;
          const withSitrus = surviveRate >= 1.0 ? "確3以上" :
                            surviveRate > 0.5 ? `乱2(${((1-surviveRate)*100).toFixed(0)}%)→乱3に改善` :
                            `乱2改善(生存${(surviveRate*100).toFixed(0)}%)`;

          console.log(`  ${atk.name} ${m.name}(${m.pct}%): ${minPct.toFixed(1)}-${maxPct.toFixed(1)}% | ${without} → オボン込み: ${withSitrus}`);
        }
      } catch (e) {}
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Q2: Adamant vs Impish/Careful — EQ KO threshold differences
// ══════════════════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("  Q2: いじっぱり vs 防御性格 — 地震の確定数の差");
console.log("═══════════════════════════════════════════════════════════════\n");

// Build defenders from TOP30 meta
const metaDefenders: {
  name: string;
  rank: number;
  pokemon: any;
}[] = [];
for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species) continue;
  if (raw.name === "Hippowdon") continue;
  const primaryItem = raw.items?.[0]?.name || "";
  const isMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite" && !!species.mega;
  const nature = raw.natures?.[0]?.name || "Hardy";
  const ability = isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]);
  const sp = raw.spreads?.[0] || {};
  metaDefenders.push({
    name: raw.name,
    rank: raw.rank,
    pokemon: new Pokemon({ name: raw.name, sp, nature, ability, item: primaryItem, isMega }),
  });
}

const natureCompare = [
  { label: "Adamant", nature: "Adamant" },
  { label: "Impish ", nature: "Impish" },
  { label: "Careful", nature: "Careful" },
];

// Header
console.log("Opponent           | Adamant          | Impish           | Careful          | 差分");
console.log("-------------------|------------------|------------------|------------------|-----");

for (const def of metaDefenders) {
  const results: { label: string; minPct: number; maxPct: number; koN: number; koChance: number }[] = [];

  for (const nc of natureCompare) {
    const hippo = new Pokemon({
      name: "Hippowdon",
      sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
      nature: nc.nature,
      ability: "Sand Stream",
      item: "Sitrus Berry",
    });

    try {
      const eq = new Move("Earthquake");
      const result = calculate(hippo, def.pokemon, eq, field);
      const [minPct, maxPct] = result.percentRange();
      const ko = result.koChance();
      results.push({
        label: nc.label,
        minPct,
        maxPct,
        koN: ko?.n ?? 99,
        koChance: ko?.chance ?? 0,
      });
    } catch (e) {
      results.push({ label: nc.label, minPct: 0, maxPct: 0, koN: 99, koChance: 0 });
    }
  }

  // Check if there's any difference in KO thresholds
  const koNs = results.map(r => r.koN);
  const chances = results.map(r => r.koChance);
  const hasDiff = koNs[0] !== koNs[1] || koNs[0] !== koNs[2] ||
                  Math.abs(chances[0] - chances[1]) > 0.05 ||
                  Math.abs(chances[0] - chances[2]) > 0.05;

  function koLabel(koN: number, chance: number): string {
    if (koN >= 99) return "---";
    if (chance >= 1.0) return `確${koN}`;
    return `乱${koN}(${(chance * 100).toFixed(0)}%)`;
  }

  const name = def.name.padEnd(18);
  const cols = results.map(r => `${r.minPct.toFixed(1)}-${r.maxPct.toFixed(1)}% ${koLabel(r.koN, r.koChance)}`.padEnd(16));
  const diffMark = hasDiff ? " ★" : "";

  console.log(`${name} | ${cols[0]} | ${cols[1]} | ${cols[2]} |${diffMark}`);
}

// ── Summary: what does Adamant gain over defensive natures? ───────────────
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("  まとめ: いじっぱりで確定数が変わる相手");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const def of metaDefenders) {
  const hippoAdamant = new Pokemon({
    name: "Hippowdon", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
    nature: "Adamant", ability: "Sand Stream", item: "Sitrus Berry",
  });
  const hippoImpish = new Pokemon({
    name: "Hippowdon", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
    nature: "Impish", ability: "Sand Stream", item: "Sitrus Berry",
  });
  const hippoCareful = new Pokemon({
    name: "Hippowdon", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
    nature: "Careful", ability: "Sand Stream", item: "Sitrus Berry",
  });

  try {
    const eq = new Move("Earthquake");
    const rA = calculate(hippoAdamant, def.pokemon, eq, field);
    const rI = calculate(hippoImpish, def.pokemon, eq, field);
    const rC = calculate(hippoCareful, def.pokemon, eq, field);

    const koA = rA.koChance();
    const koI = rI.koChance();
    const koC = rC.koChance();

    const diffAI = (koA?.n !== koI?.n) || (Math.abs((koA?.chance ?? 0) - (koI?.chance ?? 0)) > 0.05);
    const diffAC = (koA?.n !== koC?.n) || (Math.abs((koA?.chance ?? 0) - (koC?.chance ?? 0)) > 0.05);

    if (diffAI || diffAC) {
      function kl(ko: any): string {
        if (!ko || ko.n >= 99) return "---";
        if (ko.chance >= 1.0) return `確${ko.n}`;
        return `乱${ko.n}(${(ko.chance * 100).toFixed(0)}%)`;
      }
      const [minA, maxA] = rA.percentRange();
      const [minI, maxI] = rI.percentRange();
      console.log(`${def.name}:`);
      console.log(`  Adamant: ${minA.toFixed(1)}-${maxA.toFixed(1)}% [${kl(koA)}]`);
      console.log(`  Impish:  ${minI.toFixed(1)}-${maxI.toFixed(1)}% [${kl(koI)}]`);
      console.log(`  Careful: ${rC.percentRange()[0].toFixed(1)}-${rC.percentRange()[1].toFixed(1)}% [${kl(koC)}]`);
      console.log();
    }
  } catch (e) {}
}
