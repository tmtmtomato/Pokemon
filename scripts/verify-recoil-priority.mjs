import { readFileSync } from "fs";
const data = JSON.parse(readFileSync("home-data/storage/analysis/2026-04-10-team-matchup.json", "utf-8"));

console.log("=== Recoil verification ===");
// Palafin-Hero has Wave Crash (33% recoil) + Jet Punch (priority)
const palafin = data.damageMatrix["Palafin-Hero"];
const targets = ["Garchomp", "Bellibolt", "Corviknight", "Reuniclus"];
for (const t of targets) {
  const e = palafin?.[t];
  if (e) {
    console.log(`Palafin-Hero→${t}: best=${e.bestMove} ${e.maxPct}% recoil=${e.recoilPctToSelf}% prio=${e.priorityMaxPct}% combined=${(e.maxPct + e.priorityMaxPct).toFixed(1)}%`);
  }
}

// Arcanine has Flare Blitz (33% recoil) + Extreme Speed (priority +2)
const arcanine = data.damageMatrix["Arcanine"];
for (const t of targets) {
  const e = arcanine?.[t];
  if (e) {
    console.log(`Arcanine→${t}: best=${e.bestMove} ${e.maxPct}% recoil=${e.recoilPctToSelf}% prio=${e.priorityMaxPct}% combined=${(e.maxPct + e.priorityMaxPct).toFixed(1)}%`);
  }
}

// Emboar has Flare Blitz + Head Smash (50% recoil) — NO priority
const emboar = data.damageMatrix["Emboar"];
for (const t of ["Garchomp", "Corviknight"]) {
  const e = emboar?.[t];
  if (e) {
    console.log(`Emboar→${t}: best=${e.bestMove} ${e.maxPct}% recoil=${e.recoilPctToSelf}% prio=${e.priorityMaxPct}%`);
  }
}

// Non-recoil Pokemon should have recoil=0
const gengar = data.damageMatrix["Gengar"];
const gengarEntry = gengar?.["Garchomp"];
console.log(`\nGengar→Garchomp: recoil=${gengarEntry?.recoilPctToSelf}% (should be 0)`);
const scizor = data.damageMatrix["Scizor"];
const scizorEntry = scizor?.["Garchomp"];
console.log(`Scizor→Garchomp: recoil=${scizorEntry?.recoilPctToSelf}% (should be 0) prio=${scizorEntry?.priorityMaxPct}%`);

console.log("\n=== Priority fix verification ===");
console.log("Palafin-Hero: Wave Crash is NOT priority, Jet Punch IS priority");
console.log("Arcanine: Flare Blitz is NOT priority, Extreme Speed IS priority");
console.log("The combined 2-turn KO pattern should work for:");
console.log("  - Targets where bestMove.maxPct + priorityMaxPct >= 100%");

// Check Dragonite — has Extreme Speed but no recoil
const dragonite = data.damageMatrix["Dragonite"];
for (const t of ["Garchomp", "Bellibolt"]) {
  const e = dragonite?.[t];
  if (e) {
    console.log(`Dragonite→${t}: best=${e.bestMove} ${e.maxPct}% recoil=${e.recoilPctToSelf}% prio=${e.priorityMaxPct}% combined=${(e.maxPct + e.priorityMaxPct).toFixed(1)}%`);
  }
}

// Count Pokemon with recoil in pool
let recoilCount = 0;
for (const p of data.pool) {
  // Check if any of their matrix entries have recoil
  const entries = data.damageMatrix[p.name];
  if (!entries) continue;
  const hasRecoil = Object.values(entries).some(e => e.recoilPctToSelf > 0);
  if (hasRecoil) recoilCount++;
}
console.log(`\nPool Pokemon with recoil on best move: ${recoilCount}`);
