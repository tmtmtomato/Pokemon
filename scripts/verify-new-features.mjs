import { readFileSync } from "fs";
const data = JSON.parse(readFileSync("home-data/storage/analysis/2026-04-10-team-matchup.json", "utf-8"));

console.log("=== Weather verification ===");
// Check Sun effect: Ninetales (Drought) attacking with Fire → should be boosted
const ninetales_fire = data.damageMatrix["Ninetales"]?.["Corviknight"];
const charizardM_fire = data.damageMatrix["Charizard-Mega"]?.["Corviknight"];
console.log("Ninetales→Corviknight (Sun+Fire):", ninetales_fire?.bestMove, ninetales_fire?.maxPct + "%");
console.log("Charizard-Mega→Corviknight (Sun+Fire):", charizardM_fire?.bestMove, charizardM_fire?.maxPct + "%");

// Check Rain effect: Pelipper (Drizzle)
const pelipper_rain = data.damageMatrix["Pelipper"]?.["Garchomp"];
console.log("Pelipper→Garchomp (Rain+Water):", pelipper_rain?.bestMove, pelipper_rain?.maxPct + "%");

// Check Snow effect: Ninetales-Alola (Snow Warning) — should boost Ice Def
const ninA = data.damageMatrix["Ninetales-Alola"];
console.log("Ninetales-Alola→Garchomp (Snow):", ninA?.["Garchomp"]?.bestMove, ninA?.["Garchomp"]?.maxPct + "%");

// Check weather chip
console.log("\nWeather chip field:");
console.log("  Ninetales→Bellibolt (Sun, no chip):", data.damageMatrix["Ninetales"]?.["Bellibolt"]?.weatherChipToDefender);
console.log("  Hippowdon→Bellibolt (Sand, chip):", data.damageMatrix["Hippowdon"]?.["Bellibolt"]?.weatherChipToDefender);
console.log("  Hippowdon→Corviknight (Sand, Steel immune):", data.damageMatrix["Hippowdon"]?.["Corviknight"]?.weatherChipToDefender);

console.log("\n=== Priority move verification ===");
// Check Dragonite has priority data (Extreme Speed)
const dragonite_espr = data.damageMatrix["Dragonite"];
const targets = ["Garchomp", "Bellibolt", "Reuniclus"];
for (const t of targets) {
  const e = dragonite_espr?.[t];
  if (e) {
    console.log(`Dragonite→${t}: best=${e.bestMove} ${e.maxPct}%, priority=${e.priorityMaxPct}% (koN=${e.priorityKoN})`);
  }
}

// Arcanine
const arcanine = data.damageMatrix["Arcanine"];
for (const t of targets) {
  const e = arcanine?.[t];
  if (e) {
    console.log(`Arcanine→${t}: best=${e.bestMove} ${e.maxPct}%, priority=${e.priorityMaxPct}% (koN=${e.priorityKoN})`);
  }
}

// Scizor (Bullet Punch)
const scizor = data.damageMatrix["Scizor"];
for (const t of ["Garchomp", "Reuniclus"]) {
  const e = scizor?.[t];
  if (e) {
    console.log(`Scizor→${t}: best=${e.bestMove} ${e.maxPct}%, priority=${e.priorityMaxPct}% (koN=${e.priorityKoN})`);
  }
}

// Non-priority user should have 0
const gengar = data.damageMatrix["Gengar"];
console.log(`Gengar→Garchomp: priority=${gengar?.["Garchomp"]?.priorityMaxPct}% (should be 0)`);
