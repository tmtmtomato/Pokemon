/**
 * Verify: does Mega Lopunny's HJK actually become 乱2 against D-specialized Hippowdon?
 * TEAM-BUILD-SPEC.md claims しんちょう B2/D32 has 19 opponents at 乱2以内.
 */
import { calculate, Pokemon, Move, Field } from "../../src/index.js";

const field = new Field({ gameType: "Singles", weather: "Sand" });

const builds = [
  { label: "しんちょう B12/D22", nature: "Careful", sp: { hp: 32, atk: 0, def: 12, spa: 0, spd: 22, spe: 0 } },
  { label: "しんちょう B2/D32", nature: "Careful", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  { label: "わんぱく B16/D18 (current)", nature: "Impish", sp: { hp: 32, atk: 0, def: 16, spa: 0, spd: 18, spe: 0 } },
  { label: "わんぱく B2/D32", nature: "Impish", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
];

// Mega Lopunny: pokechamdb = Jolly H1/A32/B1/S32
const lopunny = new Pokemon({
  name: "Lopunny",
  sp: { hp: 1, atk: 32, def: 1, spa: 0, spd: 0, spe: 32 },
  nature: "Jolly",
  ability: "Scrappy",
  item: "Lopunnite",
  isMega: true,
});

// Also Adamant variant
const lopunnyAdm = new Pokemon({
  name: "Lopunny",
  sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  nature: "Adamant",
  ability: "Scrappy",
  item: "Lopunnite",
  isMega: true,
});

console.log(`Jolly Mega Lopunny: Atk=${lopunny.stat("atk")}`);
console.log(`Adamant Mega Lopunny: Atk=${lopunnyAdm.stat("atk")}`);
console.log();

const moves = ["High Jump Kick", "Close Combat"];

for (const b of builds) {
  const hippo = new Pokemon({
    name: "Hippowdon",
    sp: b.sp,
    nature: b.nature,
    ability: "Sand Stream",
    item: "Sitrus Berry",
  });
  console.log(`--- ${b.label} (HP=${hippo.maxHP()} B=${hippo.stat("def")} D=${hippo.stat("spd")}) ---`);

  for (const m of moves) {
    const move = new Move(m);
    // Jolly
    const r1 = calculate(lopunny, hippo, move, field);
    const ko1 = r1.koChance();
    const label1 = ko1?.n === 1
      ? (ko1.chance >= 1 ? "確1" : `乱1(${(ko1.chance * 100).toFixed(0)}%)`)
      : ko1?.n === 2
      ? (ko1.chance >= 1 ? "確2" : `乱2(${(ko1.chance * 100).toFixed(0)}%)`)
      : `確${ko1?.n ?? "?"}+`;
    console.log(`  Jolly ${m}: ${r1.percentRange()[0].toFixed(1)}-${r1.percentRange()[1].toFixed(1)}% [${label1}]`);

    // Adamant
    const r2 = calculate(lopunnyAdm, hippo, move, field);
    const ko2 = r2.koChance();
    const label2 = ko2?.n === 1
      ? (ko2.chance >= 1 ? "確1" : `乱1(${(ko2.chance * 100).toFixed(0)}%)`)
      : ko2?.n === 2
      ? (ko2.chance >= 1 ? "確2" : `乱2(${(ko2.chance * 100).toFixed(0)}%)`)
      : `確${ko2?.n ?? "?"}+`;
    console.log(`  Adamant ${m}: ${r2.percentRange()[0].toFixed(1)}-${r2.percentRange()[1].toFixed(1)}% [${label2}]`);
  }
  console.log();
}
