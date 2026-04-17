/**
 * Quick check: Mega Lopunny damage vs Hippowdon
 */
import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import { readFileSync } from "node:fs";

const field = new Field({ gameType: "Singles", weather: "Sand" });

// Our Hippowdon: Impish H32/B16/D18
const hippo = new Pokemon({
  name: "Hippowdon",
  sp: { hp: 32, atk: 0, def: 16, spa: 0, spd: 18, spe: 0 },
  nature: "Impish",
  ability: "Sand Stream",
  item: "Sitrus Berry",
});
console.log(`Hippo: HP=${hippo.maxHP()} Def=${hippo.stat("def")} SpD=${hippo.stat("spd")}`);

// pokechamdb Mega Lopunny: Jolly A32/S32
const lopunny = new Pokemon({
  name: "Lopunny",
  sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  nature: "Jolly",
  ability: "Scrappy",
  item: "Lopunnite",
  isMega: true,
});
console.log(`Mega Lopunny (Jolly A32): Atk=${lopunny.stat("atk")}`);

// Check all Lopunny attacking moves
const moves = ["High Jump Kick", "Close Combat", "Double-Edge", "Fake Out", "Ice Punch"];
for (const m of moves) {
  try {
    const move = new Move(m);
    const r = calculate(lopunny, hippo, move, field);
    const [min, max] = r.percentRange();
    const ko = r.koChance();
    console.log(`  ${m}: ${min.toFixed(1)}-${max.toFixed(1)}% koN=${ko?.n ?? 99} chance=${(ko?.chance ?? 0).toFixed(2)}`);
  } catch (e) {
    console.log(`  ${m}: error`);
  }
}

// User's scenario: Adamant A32 vs H32 uninvested
console.log("\n--- User scenario: Adamant A32 vs H32 uninvested ---");
const lopAdamant = new Pokemon({
  name: "Lopunny",
  sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  nature: "Adamant",
  ability: "Scrappy",
  item: "Lopunnite",
  isMega: true,
});
const hippoPlain = new Pokemon({
  name: "Hippowdon",
  sp: { hp: 32, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  nature: "Hardy",
  ability: "Sand Stream",
  item: "Sitrus Berry",
});
console.log(`Adamant Lopunny: Atk=${lopAdamant.stat("atk")}`);
console.log(`Uninvested Hippo: HP=${hippoPlain.maxHP()} Def=${hippoPlain.stat("def")}`);
const r2 = calculate(lopAdamant, hippoPlain, new Move("High Jump Kick"), field);
console.log(`  HJK: ${r2.percentRange()[0].toFixed(1)}-${r2.percentRange()[1].toFixed(1)}%`);

// Also check what hippo-defense-v2 was reporting
console.log("\n--- Hippo handles check ---");
const hippoEQ = calculate(hippo, lopunny, new Move("Earthquake"), field);
console.log(`Hippo EQ vs MegaLopunny: ${hippoEQ.percentRange()[0].toFixed(1)}-${hippoEQ.percentRange()[1].toFixed(1)}% koN=${hippoEQ.koChance()?.n ?? 99}`);

// Check pokechamdb Lopunny data
const top30 = JSON.parse(readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8"));
const lopData = top30.find((p: any) => p.name === "Lopunny");
if (lopData) {
  console.log("\npokechamdb Lopunny:");
  console.log(`  Nature: ${lopData.natures?.[0]?.name}`);
  console.log(`  Item: ${lopData.items?.[0]?.name}`);
  console.log(`  SP: ${JSON.stringify(lopData.spreads?.[0])}`);
  console.log(`  Moves: ${lopData.moves?.map((m: any) => `${m.name}(${m.pct}%)`).join(", ")}`);
}
