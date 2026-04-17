import { calculate, Pokemon, Move, getEffectiveness } from "../../src/index.js";
import type { TypeName } from "../../src/types.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync } from "fs";
import { baseSpecies } from "../analyzer/team-matchup-core.js";

const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;
const data = JSON.parse(readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8"));
const pool: any[] = data.pool;
const allRaw: any[] = JSON.parse(readFileSync("home-data/storage/pokechamdb/all-raw.json", "utf-8"));
const top50 = allRaw.slice(0, 50);

function toPoolName(raw: any): string {
  const item = raw.items?.[0]?.name || "";
  const hasMega = item.endsWith("ite") && item !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

const attacker = new Pokemon({
  name: "Lucario", nature: "Jolly",
  sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  ability: "Adaptability", item: "Lucarionite", isMega: true,
});
const eq = new Move("Earthquake");

console.log("=== メガルカリオ じしん vs TOP50 ===");
console.log("");

interface Row { rank: number; name: string; minPct: number; maxPct: number; eff: number; koLabel: string }
const rows: Row[] = [];
const immunes: { rank: number; name: string }[] = [];

for (let i = 0; i < top50.length; i++) {
  const oppName = toPoolName(top50[i]);
  const oppPool = pool.find((p: any) => p.name === oppName) || pool.find((p: any) => p.name === top50[i].name);
  if (!oppPool) continue;

  const defender = new Pokemon({
    name: baseSpecies(oppPool.name),
    nature: oppPool.nature, sp: oppPool.sp,
    ability: oppPool.ability, item: oppPool.item, isMega: oppPool.isMega,
  });

  // Type effectiveness
  const defSpecies = getSpecies(baseSpecies(oppPool.name));
  const types = oppPool.isMega && defSpecies?.mega ? defSpecies.mega.types : (defSpecies?.types ?? []);
  const eff = getEffectiveness("Ground" as TypeName, types as TypeName[]);

  if (eff === 0) {
    immunes.push({ rank: i + 1, name: oppPool.name });
    continue;
  }

  const result = calculate(attacker, defender, eq);
  const hp = defender.maxHP();
  const minPct = result.rolls[0] / hp * 100;
  const maxPct = result.rolls[result.rolls.length - 1] / hp * 100;

  let koLabel: string;
  if (minPct >= 100) koLabel = "確1";
  else if (maxPct >= 100) {
    const chance = result.rolls.filter((r: number) => r >= hp).length / result.rolls.length;
    koLabel = `乱1(${Math.round(chance * 100)}%)`;
  } else {
    const koN = Math.ceil(100 / maxPct);
    koLabel = minPct * koN >= 100 ? `確${koN}` : `乱${koN}`;
  }

  rows.push({ rank: i + 1, name: oppPool.name, minPct, maxPct, eff, koLabel });
}

// Sort: 4x > 2x > 1x > 0.5x, then by damage desc
rows.sort((a, b) => b.eff - a.eff || b.maxPct - a.maxPct);

for (const r of rows) {
  const effStr = r.eff === 4 ? "4倍" : r.eff === 2 ? "2倍" : r.eff === 0.5 ? "半減" : r.eff === 0.25 ? "1/4" : "等倍";
  console.log(
    `#${String(r.rank).padStart(2)} ${jaName(r.name).padEnd(16)} ${effStr.padEnd(4)} ${r.minPct.toFixed(1).padStart(6)}~${r.maxPct.toFixed(1).padStart(6)}%  ${r.koLabel}`
  );
}

if (immunes.length > 0) {
  console.log("\n無効:");
  for (const r of immunes) console.log(`  #${r.rank} ${jaName(r.name)}`);
}
