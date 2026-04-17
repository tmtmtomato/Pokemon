/**
 * Hippowdon partner pair evaluation — Phase 4
 *
 * Evaluates all (P1, P2) pairs as Hippowdon's partners using evaluate3v3().
 * Opponent teams: TOP30-derived representative 3-member teams.
 *
 * Assumptions:
 *   - Hippowdon is always selected (lead + SR setter)
 *   - Sand lasts 5 turns total: P1 gets ~2-3 hits, P2 gets ~0-1
 *   - SR is set by Hippowdon; first opponent (lead) may not take SR
 *     (but takes 2 turns of sand = 12.5% chip from facing Hippowdon)
 *   - Mega clause: team can have at most 1 mega (Hippowdon is not mega)
 *   - Species clause: no duplicate base species
 */
import {
  matchupValue,
  effectiveKoN,
  evaluate3v3,
  baseSpecies,
  isSandChipImmune,
  MEGA_POOL_SUFFIX,
  WEATHER_ABILITIES,
  STEALTH_ROCK_USERS,
  DISGUISE_ABILITY,
  SAND_CHIP_PCT,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, SimEnv } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync, existsSync } from "node:fs";

type TypeName = Parameters<typeof getEffectiveness>[0];

// ── i18n ──
const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const movesJa = JSON.parse(readFileSync("home-data/storage/i18n/moves-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;
const jaMove = (en: string) => movesJa[en] || en;

// ── Load data ──
console.log("Loading data...");
const teamMatchup = JSON.parse(
  readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8")
);
const matrix: DamageMatrix = teamMatchup.damageMatrix;
const pool: any[] = teamMatchup.pool;

const allRawPath = "home-data/storage/pokechamdb/all-raw.json";
const top30RawPath = "home-data/storage/pokechamdb/top30-raw.json";
const rawPath = existsSync(allRawPath) ? allRawPath : top30RawPath;
const top30Raw: any[] = JSON.parse(readFileSync(rawPath, "utf-8"));

console.log(`Pool: ${pool.length} entries, Source: ${rawPath.split(/[\\/]/).pop()} (${top30Raw.length} entries)`);

// ── Build SimEnv ──
const simEnv: SimEnv = {
  weatherUsers: new Map(),
  sandChipImmune: new Set(),
  srUsers: new Set(),
  srChipPct: new Map(),
  poolTypes: new Map(),
  poolAbilities: new Map(),
  poolSpeeds: new Map(),
  disguiseUsers: new Set(),
};

for (const p of pool) {
  const speciesName = baseSpecies(p.name);
  const species = getSpecies(speciesName);
  const types = species?.types ?? [];
  const ability = p.ability || "";

  simEnv.poolTypes.set(p.name, types as string[]);
  simEnv.poolAbilities.set(p.name, ability);
  simEnv.poolSpeeds.set(p.name, p.speedStat ?? 0);

  const weather = WEATHER_ABILITIES[ability];
  if (weather) simEnv.weatherUsers.set(p.name, weather);
  if (isSandChipImmune(types as string[], ability)) simEnv.sandChipImmune.add(p.name);
  if (STEALTH_ROCK_USERS.has(speciesName)) simEnv.srUsers.add(p.name);
  if (ability === DISGUISE_ABILITY) simEnv.disguiseUsers.add(p.name);
  simEnv.srChipPct.set(p.name, getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100);
}

// ── Build opponent teams from TOP30 ──
const HIPPO = "Hippowdon";

// Map pokechamdb names to pool names (handle mega)
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

// Create opponent teams: each TOP30 member as "ace" + their top 2 teammates
interface OppTeam {
  label: string;
  members: string[];
}

const oppTeams: OppTeam[] = [];
const top30Map = new Map<string, any>();
for (const raw of top30Raw) {
  top30Map.set(raw.name, raw);
}

// Also build a quick name→poolName map for TOP30
const top30PoolNames = new Map<string, string>();
for (const raw of top30Raw) {
  top30PoolNames.set(raw.name, toPoolName(raw));
}

// Method 1: Teammate-based teams (each TOP30 as ace + their top 2 mates)
for (const raw of top30Raw) {
  if (raw.name === HIPPO) continue;
  const acePoolName = toPoolName(raw);
  if (!matrix[acePoolName]) continue;

  const teammates: string[] = raw.teammates || [];
  const aceMega = acePoolName.endsWith(MEGA_POOL_SUFFIX);
  const aceBase = baseSpecies(acePoolName);

  const validMates: string[] = [];
  for (const tmName of teammates) {
    if (tmName === HIPPO) continue;
    const tmPoolName = top30PoolNames.get(tmName);
    if (!tmPoolName) continue;
    if (!matrix[tmPoolName]) continue;
    if (baseSpecies(tmPoolName) === aceBase) continue;
    if (aceMega && tmPoolName.endsWith(MEGA_POOL_SUFFIX)) continue;
    validMates.push(tmPoolName);
  }

  if (validMates.length >= 2) {
    const tm1 = validMates[0];
    const tm1Base = baseSpecies(tm1);
    const tm1Mega = tm1.endsWith(MEGA_POOL_SUFFIX);
    for (let i = 1; i < validMates.length; i++) {
      const tm2 = validMates[i];
      if (baseSpecies(tm2) === tm1Base) continue;
      if (tm1Mega && tm2.endsWith(MEGA_POOL_SUFFIX)) continue;
      if (aceMega && tm2.endsWith(MEGA_POOL_SUFFIX)) continue;
      oppTeams.push({
        label: `${jaName(raw.name)} + ${jaName(validMates[0])} + ${jaName(tm2)}`,
        members: [acePoolName, tm1, tm2],
      });
      break;
    }
  }
}

// Method 2: Random combinations from TOP30 (seeded for reproducibility)
// Generate C(29,3) = 3654 combos but cap at ~200 for speed
const top30Pool: string[] = [];
for (const raw of top30Raw) {
  if (raw.name === HIPPO) continue;
  const poolName = toPoolName(raw);
  if (matrix[poolName]) top30Pool.push(poolName);
}

const MAX_RANDOM_TEAMS = 200;
let randomCount = 0;
const seenTeams = new Set<string>();

// Add all teammate-based teams to seen set
for (const t of oppTeams) {
  const key = [...t.members].sort().join("+");
  seenTeams.add(key);
}

// Enumerate all valid 3-member combos from TOP30
for (let a = 0; a < top30Pool.length && randomCount < MAX_RANDOM_TEAMS; a++) {
  for (let b = a + 1; b < top30Pool.length && randomCount < MAX_RANDOM_TEAMS; b++) {
    for (let c = b + 1; c < top30Pool.length && randomCount < MAX_RANDOM_TEAMS; c++) {
      const m1 = top30Pool[a], m2 = top30Pool[b], m3 = top30Pool[c];

      // Species clause
      if (baseSpecies(m1) === baseSpecies(m2)) continue;
      if (baseSpecies(m1) === baseSpecies(m3)) continue;
      if (baseSpecies(m2) === baseSpecies(m3)) continue;

      // Mega clause: at most 1 mega
      const megas = [m1, m2, m3].filter(m => m.endsWith(MEGA_POOL_SUFFIX));
      if (megas.length > 1) continue;

      const key = [m1, m2, m3].sort().join("+");
      if (seenTeams.has(key)) continue;
      seenTeams.add(key);

      oppTeams.push({
        label: `${jaName(m1)} + ${jaName(m2)} + ${jaName(m3)}`,
        members: [m1, m2, m3],
      });
      randomCount++;
    }
  }
}

console.log(`Generated ${oppTeams.length} opponent teams from TOP30 data`);

// ── Build candidate pool ──
// Candidates: pool members with matrix coverage, excluding Hippowdon itself
const HIPPO_POOL = "Hippowdon";
const MIN_SINGLES_SCORE = 35; // Only consider reasonably ranked Pokemon

const candidates: string[] = [];
for (const p of pool) {
  if (p.name === HIPPO_POOL) continue;
  if (baseSpecies(p.name) === HIPPO) continue;
  if (!matrix[p.name]) continue;

  // Require minimum quality
  const score = p.overallScore ?? 0;
  if (score < MIN_SINGLES_SCORE) continue;

  // Require enough matchup data (at least can hit some of TOP30)
  let hitCount = 0;
  for (const opp of oppTeams) {
    for (const om of opp.members) {
      if (matrix[p.name]?.[om] && matrix[p.name][om].maxPct > 0) hitCount++;
    }
  }
  if (hitCount < 10) continue;

  candidates.push(p.name);
}

console.log(`Candidates: ${candidates.length} (score >= ${MIN_SINGLES_SCORE})`);

// ── Evaluate all pairs ──
interface PairResult {
  p1: string;
  p2: string;
  winRate: number;
  avgScoreA: number;
  avgScoreB: number;
  wins: number;
  losses: number;
  draws: number;
  // Per-opponent worst cases
  worstOpp: string;
  worstScore: number;
}

const myTeamBase = [HIPPO_POOL]; // Hippowdon always included
const results: PairResult[] = [];

const totalPairs = candidates.length * (candidates.length - 1) / 2;
console.log(`\nEvaluating ${totalPairs} pairs against ${oppTeams.length} opponent teams...`);
let pairCount = 0;
const logInterval = Math.max(1, Math.floor(totalPairs / 20));

for (let i = 0; i < candidates.length; i++) {
  const p1 = candidates[i];
  const p1Base = baseSpecies(p1);
  const p1Mega = p1.endsWith(MEGA_POOL_SUFFIX);

  for (let j = i + 1; j < candidates.length; j++) {
    const p2 = candidates[j];
    pairCount++;
    if (pairCount % logInterval === 0) {
      process.stdout.write(`  ${pairCount}/${totalPairs} (${Math.round(100 * pairCount / totalPairs)}%)\r`);
    }

    // Species clause
    if (baseSpecies(p2) === p1Base) continue;
    if (baseSpecies(p2) === HIPPO) continue;

    // Mega clause: at most 1 mega
    if (p1Mega && p2.endsWith(MEGA_POOL_SUFFIX)) continue;

    const myTeam = [HIPPO_POOL, p1, p2];

    let wins = 0, losses = 0, draws = 0;
    let totalScoreA = 0, totalScoreB = 0;
    let worstOpp = "";
    let worstScore = Infinity;

    for (const opp of oppTeams) {
      const result = evaluate3v3(myTeam, opp.members, matrix, simEnv);
      totalScoreA += result.scoreA;
      totalScoreB += result.scoreB;

      if (result.winner === "A") wins++;
      else if (result.winner === "B") losses++;
      else draws++;

      const margin = result.scoreA - result.scoreB;
      if (margin < worstScore) {
        worstScore = margin;
        worstOpp = opp.label;
      }
    }

    const n = oppTeams.length;
    results.push({
      p1, p2,
      winRate: wins / n,
      avgScoreA: totalScoreA / n,
      avgScoreB: totalScoreB / n,
      wins, losses, draws,
      worstOpp,
      worstScore,
    });
  }
}

console.log(`\nDone. ${results.length} valid pairs evaluated.`);

// ── Sort by win rate, then by average score margin ──
results.sort((a, b) => {
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  return (b.avgScoreA - b.avgScoreB) - (a.avgScoreA - a.avgScoreB);
});

// ── Output top 30 ──
console.log("\n═══ カバルドン + P1 + P2 — 上位30ペア ═══");
console.log("(勝率 = evaluate3v3() でスコアA > スコアBとなる割合)\n");
console.log(
  "#".padEnd(4) +
  "P1".padEnd(18) +
  "P2".padEnd(18) +
  "勝率".padEnd(8) +
  "勝".padEnd(5) +
  "負".padEnd(5) +
  "分".padEnd(5) +
  "平均A".padEnd(8) +
  "平均B".padEnd(8) +
  "最悪マージン".padEnd(14) +
  "最悪相手"
);
console.log("-".repeat(130));

for (let k = 0; k < Math.min(30, results.length); k++) {
  const r = results[k];
  console.log(
    String(k + 1).padEnd(4) +
    jaName(r.p1).padEnd(18) +
    jaName(r.p2).padEnd(18) +
    (r.winRate * 100).toFixed(1).padStart(5) + "%  " +
    String(r.wins).padEnd(5) +
    String(r.losses).padEnd(5) +
    String(r.draws).padEnd(5) +
    r.avgScoreA.toFixed(3).padStart(6) + "  " +
    r.avgScoreB.toFixed(3).padStart(6) + "  " +
    r.worstScore.toFixed(3).padStart(7) + "       " +
    r.worstOpp
  );
}

// ── Also show unique Pokemon appearing in top 30 ──
console.log("\n═══ 上位30ペアに登場するポケモン ═══");
const pokemonCount = new Map<string, number>();
for (let k = 0; k < Math.min(30, results.length); k++) {
  const r = results[k];
  pokemonCount.set(r.p1, (pokemonCount.get(r.p1) || 0) + 1);
  pokemonCount.set(r.p2, (pokemonCount.get(r.p2) || 0) + 1);
}
const sortedPokemon = [...pokemonCount.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, count] of sortedPokemon) {
  const speed = simEnv.poolSpeeds.get(name) ?? 0;
  const isMega = name.endsWith(MEGA_POOL_SUFFIX);
  const sandImmune = simEnv.sandChipImmune.has(name);
  console.log(
    `  ${jaName(name).padEnd(18)} ${count}回  Spe=${speed.toFixed(0).padStart(5)}  ${isMega ? "MEGA" : "    "}  ${sandImmune ? "砂免除" : "砂影響"}`
  );
}

// ── Show bottom context: what are good non-mega pairs? ──
console.log("\n═══ 非メガ限定 上位10ペア ═══");
const nonMegaResults = results.filter(r =>
  !r.p1.endsWith(MEGA_POOL_SUFFIX) && !r.p2.endsWith(MEGA_POOL_SUFFIX)
);
for (let k = 0; k < Math.min(10, nonMegaResults.length); k++) {
  const r = nonMegaResults[k];
  console.log(
    String(k + 1).padEnd(4) +
    jaName(r.p1).padEnd(18) +
    jaName(r.p2).padEnd(18) +
    (r.winRate * 100).toFixed(1).padStart(5) + "%  " +
    "W" + r.wins + "/L" + r.losses + "/D" + r.draws
  );
}

// ── Individual P1/P2 matchup details for #1 pair ──
if (results.length > 0) {
  const best = results[0];
  console.log(`\n═══ ベストペア詳細: ${jaName(best.p1)} + ${jaName(best.p2)} ═══\n`);

  const p1Speed = simEnv.poolSpeeds.get(best.p1) ?? 0;
  const p2Speed = simEnv.poolSpeeds.get(best.p2) ?? 0;
  const p1Entry = pool.find((p: any) => p.name === best.p1);
  const p2Entry = pool.find((p: any) => p.name === best.p2);

  console.log(`P1: ${jaName(best.p1)} (Spe=${p1Speed.toFixed(0)}, ${p1Entry?.nature || "?"}, ${p1Entry?.item || "?"})`);
  console.log(`  技: ${(p1Entry?.moves || []).map((m: string) => jaMove(m)).join(", ")}`);
  console.log(`P2: ${jaName(best.p2)} (Spe=${p2Speed.toFixed(0)}, ${p2Entry?.nature || "?"}, ${p2Entry?.item || "?"})`);
  console.log(`  技: ${(p2Entry?.moves || []).map((m: string) => jaMove(m)).join(", ")}`);

  console.log(`\n対戦結果:  勝率=${(best.winRate * 100).toFixed(1)}%  W${best.wins}/L${best.losses}/D${best.draws}`);
  console.log(`スコア: A=${best.avgScoreA.toFixed(3)} vs B=${best.avgScoreB.toFixed(3)}`);

  // Show per-opponent breakdown
  console.log("\n対戦別詳細:");
  const myTeam = [HIPPO_POOL, best.p1, best.p2];
  for (const opp of oppTeams) {
    const result = evaluate3v3(myTeam, opp.members, matrix, simEnv);
    const winStr = result.winner === "A" ? "○" : result.winner === "B" ? "×" : "△";
    console.log(
      `  ${winStr} ${opp.label.padEnd(45)} A=${result.scoreA.toFixed(2)} B=${result.scoreB.toFixed(2)}`
    );
  }
}
