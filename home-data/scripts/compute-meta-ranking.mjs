/**
 * Pre-compute tier-weighted 1v1 rankings from the damage matrix.
 * Outputs a small JSON file used by the viewer (avoids bundling the large matrix).
 *
 * Usage: node home-data/scripts/compute-meta-ranking.mjs
 */
import { readFileSync, writeFileSync } from "fs";

const DATA_PATH = "home-data/storage/analysis/2026-04-10-team-matchup.json";
const OUT_PATH = "home-data/storage/analysis/meta-ranking.json";

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));

// Meta tier weights — must match moveCalc.ts META_TIER_WEIGHTS
// S=10×, A/Mega=9×, B=8×, C=7×, D=6×, E=5×, Untiered=1×
const META_TIER_WEIGHTS = {
  // S tier (weight 10)
  Garchomp: 10, Corviknight: 10, Primarina: 10,
  // A tier (weight 9)
  Archaludon: 9, Kingambit: 9, Hippowdon: 9, Espathra: 9, Aegislash: 9,
  // B tier (weight 8)
  Hydreigon: 8, Mimikyu: 8, Rotom: 8, Toxapex: 8, Diggersby: 8,
  Glimmora: 8, Umbreon: 8, Meowscarada: 8, Sneasler: 8, Basculegion: 8,
  // C tier (weight 7)
  Azumarill: 7, "Mr. Rime": 7, Sylveon: 7, Tyranitar: 7, Snorlax: 7,
  Ceruledge: 7, Dragapult: 7,
  // D tier (weight 6)
  Mamoswine: 6, "Samurott-Hisui": 6, "Slowbro-Galar": 6, Palafin: 6,
  Greninja: 6, Sinistcha: 6, Volcarona: 6, Gallade: 6, Avalugg: 6,
  // E tier (weight 5)
  Dragonite: 5, Incineroar: 5, Skeledirge: 5, Skarmory: 5,
  Excadrill: 5, Arcanine: 5, Orthworm: 5, Torterra: 5,
  Pelipper: 5, "Ninetales-Alola": 5, "Goodra-Hisui": 5, Araquanid: 5,
};
const MEGA_WEIGHT = 9;

function getMetaWeight(name, isMega) {
  const w = META_TIER_WEIGHTS[name];
  if (isMega) return Math.max(w ?? 0, MEGA_WEIGHT);
  return w ?? 1;
}

// KO quality: fast KOs worth more than stall victories
function koQuality(koN) {
  if (koN <= 1) return 1.0;
  if (koN === 2) return 0.85;
  if (koN === 3) return 0.65;
  if (koN === 4) return 0.45;
  if (koN <= 6) return 0.25;
  return 0.1;
}

const pool = data.pool;
const matrix = data.damageMatrix;

const ranking = pool.map((member) => {
  let weightedWins = 0;
  let totalWeight = 0;

  for (const opp of pool) {
    if (opp.name === member.name) continue;
    const aToB = matrix[member.name]?.[opp.name];
    const bToA = matrix[opp.name]?.[member.name];
    if (!aToB || !bToA) continue;

    const oppWeight = getMetaWeight(opp.name, opp.isMega);
    totalWeight += oppWeight;

    const aKoN = aToB.koN || 99;
    const bKoN = bToA.koN || 99;
    const aSpeed = member.speedStat ?? 0;
    const bSpeed = opp.speedStat ?? 0;

    let win;
    if (aSpeed > bSpeed) win = aKoN <= bKoN ? 1 : 0;
    else if (bSpeed > aSpeed) win = aKoN < bKoN ? 1 : 0;
    else {
      if (aKoN < bKoN) win = 0.75;
      else if (aKoN === bKoN) win = 0.5;
      else win = 0.25;
    }
    // Scale win by KO quality (OHKO=1.0, stall=0.1)
    if (win > 0) win *= koQuality(aKoN);
    weightedWins += win * oppWeight;
  }

  const weightedWinRate = totalWeight > 0 ? (weightedWins / totalWeight) * 100 : 0;
  return {
    name: member.name,
    isMega: member.isMega,
    weightedWinRate: Math.round(weightedWinRate * 10) / 10,
  };
});

writeFileSync(OUT_PATH, JSON.stringify(ranking));
console.log(`Meta ranking computed for ${ranking.length} Pokemon → ${OUT_PATH}`);
