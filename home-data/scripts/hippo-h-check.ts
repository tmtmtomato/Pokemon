/**
 * Quick check: H reduction efficiency for Hippowdon.
 * Does reducing H and investing in B/D improve survivability?
 */
import { calculate, Pokemon, Move, Field } from "../../src/index.js";

const field = new Field({ gameType: "Singles", weather: "Sand" });

// Test builds: reduce H, redistribute to B or D
const builds = [
  { label: "H32/B6/D28 (現行)", sp: { hp:32,atk:0,def:6,spa:0,spd:28,spe:0 } },
  { label: "H30/B8/D28",       sp: { hp:30,atk:0,def:8,spa:0,spd:28,spe:0 } },
  { label: "H28/B10/D28",      sp: { hp:28,atk:0,def:10,spa:0,spd:28,spe:0 } },
  { label: "H26/B12/D28",      sp: { hp:26,atk:0,def:12,spa:0,spd:28,spe:0 } },
  { label: "H30/B6/D30",       sp: { hp:30,atk:0,def:6,spa:0,spd:30,spe:0 } },
  { label: "H28/B6/D32",       sp: { hp:28,atk:0,def:6,spa:0,spd:32,spe:0 } },
];

console.log("しんちょう (Careful) — H削減 → BD追加の効率検証\n");
console.log("Build                   HP   B    D    オボン  実質HP");
console.log("─".repeat(60));

const hippos: { label: string; pokemon: any; maxHP: number }[] = [];
for (const b of builds) {
  const h = new Pokemon({ name: "Hippowdon", sp: b.sp, nature: "Careful", ability: "Sand Stream", item: "Sitrus Berry" });
  const sitrus = Math.floor(h.maxHP() / 4);
  console.log(`${b.label.padEnd(24)}${String(h.maxHP()).padStart(3)}  ${String(h.stat("def")).padStart(3)}  ${String(h.stat("spd")).padStart(3)}  ${String(sitrus).padStart(4)}   ${h.maxHP() + sitrus}`);
  hippos.push({ label: b.label, pokemon: h, maxHP: h.maxHP() });
}

// Key matchups: Basculegion Wave Crash, Rotom-Wash Hydro Pump, Meowscarada Flower Trick
console.log("\n主要マッチアップ比較:\n");

const threats = [
  { name: "Basculegion", move: "Wave Crash", nature: "Adamant",
    sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, ability: "Adaptability", item: "Choice Band" },
  { name: "Rotom-Wash", move: "Hydro Pump", nature: "Modest",
    sp: { hp: 32, atk: 0, def: 4, spa: 32, spd: 0, spe: 0 }, ability: "Levitate", item: "Sitrus Berry" },
  { name: "Meowscarada", move: "Flower Trick", nature: "Jolly",
    sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, ability: "Protean", item: "Focus Sash" },
  { name: "Gyarados", move: "Waterfall", nature: "Adamant",
    sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, ability: "Intimidate", item: "Gyaradosite", isMega: true },
];

const pokemonJA: Record<string, string> = JSON.parse(
  require("fs").readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8")
);
const movesJA: Record<string, string> = JSON.parse(
  require("fs").readFileSync("home-data/storage/i18n/moves-ja.json", "utf-8")
);

for (const t of threats) {
  const atk = new Pokemon(t);
  const move = new Move(t.move);
  const ja = pokemonJA[t.name] ?? t.name;
  const jaM = movesJA[t.move] ?? t.move;
  console.log(`  ${ja} ${jaM}:`);

  for (const h of hippos) {
    const r = calculate(atk, h.pokemon, move, field);
    const [minP, maxP] = r.percentRange();
    // Simple Sitrus check
    const sitrusHeal = Math.floor(h.maxHP / 4);
    const sitrusThreshold = Math.floor(h.maxHP / 2);
    const rolls = r.rolls;
    const ohko = rolls.filter(x => x >= h.maxHP).length;
    let twoHitKO = 0;
    for (const r1 of rolls) {
      let hp = h.maxHP - r1;
      if (hp > 0 && hp <= sitrusThreshold) hp += sitrusHeal;
      for (const r2 of rolls) { if (r2 >= hp) twoHitKO++; }
    }
    const koLabel = ohko === 16 ? "確1" : ohko > 0 ? `乱1(${((ohko/16)*100).toFixed(0)}%)` :
      twoHitKO === 256 ? "確2" : twoHitKO > 0 ? `乱2(${((twoHitKO/256)*100).toFixed(0)}%)` : "確3+";

    console.log(`    ${h.label.padEnd(24)} ${minP.toFixed(1).padStart(5)}-${maxP.toFixed(1).padStart(5)}%  ${koLabel}`);
  }
  console.log();
}
