/**
 * Pre-compute usage-weighted 1v1 rankings from the damage matrix.
 * Outputs a small JSON file used by the viewer (avoids bundling the large matrix).
 *
 * Weights are derived from actual pool usage percentages (usagePct)
 * rather than hardcoded tier assignments.
 *
 * Usage: node home-data/scripts/compute-meta-ranking.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Auto-resolve latest team-matchup JSON by modification time
const ANALYSIS_DIR = "home-data/storage/analysis";
const matchupFiles = readdirSync(ANALYSIS_DIR)
  .filter(f => f.endsWith("-team-matchup.json") && !f.startsWith("_"))
  .sort((a, b) => statSync(join(ANALYSIS_DIR, b)).mtimeMs - statSync(join(ANALYSIS_DIR, a)).mtimeMs);
if (matchupFiles.length === 0) {
  console.error("No *-team-matchup.json found in", ANALYSIS_DIR);
  process.exit(1);
}
const DATA_PATH = join(ANALYSIS_DIR, matchupFiles[0]);
const OUT_PATH = join(ANALYSIS_DIR, "meta-ranking.json");
console.log(`Using: ${matchupFiles[0]}`);

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));

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

// Build usage weight map from pool data (usagePct as natural meta weight)
const usageWeights = new Map();
for (const member of pool) {
  usageWeights.set(member.name, member.usagePct ?? 1);
}

const ranking = pool.map((member) => {
  let weightedWins = 0;
  let totalWeight = 0;

  for (const opp of pool) {
    if (opp.name === member.name) continue;
    const aToB = matrix[member.name]?.[opp.name];
    const bToA = matrix[opp.name]?.[member.name];
    if (!aToB || !bToA) continue;

    const oppWeight = usageWeights.get(opp.name) ?? 1;
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
