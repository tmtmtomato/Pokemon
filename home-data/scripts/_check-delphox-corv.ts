import { calculate, Pokemon, Move, calcStat, getNatureModifier } from "../../src/index.js";
import type { NatureName } from "../../src/types.js";
import { getSpecies } from "../../src/data/index.js";

const atkSpecies = getSpecies("Delphox")!;
const defSpecies = getSpecies("Corviknight")!;

console.log("=== Species data ===");
console.log("Delphox base SpA:", atkSpecies.baseStats.spa);
console.log("Delphox-Mega base SpA:", atkSpecies.mega?.baseStats.spa);
console.log("Corviknight base HP:", defSpecies.baseStats.hp, "SpD:", defSpecies.baseStats.spd);

const attacker = new Pokemon({
  name: "Delphox",
  nature: "Timid",
  sp: { hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  ability: "Levitate",
  item: "Delphoxite",
  isMega: true,
});

const defender = new Pokemon({
  name: "Corviknight",
  nature: "Impish",
  sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
  ability: "Pressure",
  item: "Leftovers",
});

console.log("\n=== Computed stats ===");
console.log("Attacker SpA:", attacker.rawStats.spa, "stat():", attacker.stat("spa"));
console.log("Defender HP:", defender.maxHP(), "SpD:", defender.rawStats.spd, "stat():", defender.stat("spd"));

const move = new Move("Flamethrower");
console.log("\nMove:", move.name, "BP:", move.basePower, "Type:", move.type, "Category:", move.category);

const result = calculate(attacker, defender, move);
console.log("\n=== Result ===");
console.log(JSON.stringify(result, null, 2));
