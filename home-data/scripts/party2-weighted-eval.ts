/**
 * party2-weighted-eval.ts
 *
 * 使用率傾斜 + テンメイト共起を加味した構築評価。
 *
 * Step 1: pokechamdb TOP50の使用率を傾斜重み化
 * Step 2: テンメイト情報から共起ペアを集計 → 「よく当たる3体選出」を生成
 * Step 3: 各TOP50相手の「対処難易度 × 使用率重み」を計算
 * Step 4: パーティ1の結果を出し、改善点を洗い出す
 */
import {
  effectiveKoN,
  adjustedEKoN,
  baseSpecies,
  isSandChipImmune,
  SAND_CHIP_PCT,
  matchupValue,
  evaluate3v3,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, SimEnv } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

type TypeName = Parameters<typeof getEffectiveness>[0];

const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;

const teamMatchup = JSON.parse(
  readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8")
);
const matrix: DamageMatrix = teamMatchup.damageMatrix;
const pool: any[] = teamMatchup.pool;
const allRaw: any[] = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/all-raw.json", "utf-8")
);

// ── Pool lookups ──
const poolMap = new Map<string, any>();
const poolSpeeds = new Map<string, number>();
const poolTypes = new Map<string, string[]>();
const poolAbilities = new Map<string, string>();
for (const p of pool) {
  poolMap.set(p.name, p);
  poolSpeeds.set(p.name, p.speedStat ?? 0);
  const species = getSpecies(baseSpecies(p.name));
  poolTypes.set(p.name, (species?.types ?? []) as string[]);
  poolAbilities.set(p.name, p.ability ?? "");
}

// ── SimEnv for evaluate3v3 ──
const WEATHER_ABILITIES: Record<string, string> = {
  "Sand Stream": "Sand", "Drought": "Sun", "Drizzle": "Rain", "Snow Warning": "Hail",
};
const simEnv: SimEnv = {
  weatherUsers: new Map<string, string>(),
  sandChipImmune: new Set<string>(),
  srUsers: new Set<string>(),
  srChipPct: new Map<string, number>(),
  poolTypes,
  poolAbilities,
  poolSpeeds,
  disguiseUsers: new Set<string>(),
};

for (const p of pool) {
  const ability = p.ability ?? "";
  if (WEATHER_ABILITIES[ability]) simEnv.weatherUsers.set(p.name, WEATHER_ABILITIES[ability]);
  const types = poolTypes.get(p.name) ?? [];
  if (isSandChipImmune(types, ability)) simEnv.sandChipImmune.add(p.name);
  if (p.moves?.includes("Stealth Rock")) simEnv.srUsers.add(p.name);
  const srChip = getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100;
  simEnv.srChipPct.set(p.name, srChip);
  if (ability === "Disguise") simEnv.disguiseUsers.add(p.name);
}

// ── Step 1: Usage weight (rank-based, higher rank = more weight) ──
// Use sqrt-based decay: weight = sqrt(51 - rank) / sqrt(50)
function usageWeight(rank: number): number {
  return Math.sqrt(Math.max(1, 51 - rank)) / Math.sqrt(50);
}

// ── Step 2: Build co-occurrence map from teammates ──
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

// Map raw name → pool name for lookup
const rawToPool = new Map<string, string>();
for (const raw of allRaw) {
  rawToPool.set(raw.name, toPoolName(raw));
}

// Co-occurrence: count how many times A and B appear as teammates
const cooccurrence = new Map<string, Map<string, number>>();
for (const raw of allRaw.slice(0, 50)) {
  const me = toPoolName(raw);
  if (!cooccurrence.has(me)) cooccurrence.set(me, new Map());
  for (const tm of raw.teammates ?? []) {
    const partner = rawToPool.get(tm.name) ?? tm.name;
    cooccurrence.get(me)!.set(partner, (cooccurrence.get(me)!.get(partner) ?? 0) + 1);
    // Symmetric
    if (!cooccurrence.has(partner)) cooccurrence.set(partner, new Map());
    cooccurrence.get(partner)!.set(me, (cooccurrence.get(partner)!.get(me) ?? 0) + 1);
  }
}

// ── Step 3: Generate likely opponent teams (3-body selections) ──
// For each TOP50 Pokemon, find its top 2 partners → form a likely 3-body selection
interface OpponentTeam {
  members: string[];
  weight: number; // usage-weighted importance
  label: string;
}

const opponentTeams: OpponentTeam[] = [];
const top50Pool = allRaw.slice(0, 50).map(r => toPoolName(r));

for (let i = 0; i < Math.min(30, allRaw.length); i++) {
  const raw = allRaw[i];
  const lead = toPoolName(raw);
  if (!matrix[lead]) continue;

  const partners = cooccurrence.get(lead);
  if (!partners) continue;

  // Get top partners that are also in TOP50 and in matrix
  const topPartners = [...partners.entries()]
    .filter(([p]) => p !== lead && matrix[p] && top50Pool.includes(p))
    .sort((a, b) => b[1] - a[1]);

  // Generate teams with top 2-3 partners
  for (let j = 0; j < Math.min(3, topPartners.length); j++) {
    for (let k = j + 1; k < Math.min(4, topPartners.length); k++) {
      const team = [lead, topPartners[j][0], topPartners[k][0]];
      // Skip if duplicate base species
      const bases = new Set(team.map(t => baseSpecies(t)));
      if (bases.size < 3) continue;

      const weight = usageWeight(i + 1) * (1 + (topPartners[j][1] + topPartners[k][1]) / 10);
      opponentTeams.push({
        members: team,
        weight,
        label: team.map(t => jaName(t)).join("+"),
      });
    }
  }
}

// Deduplicate by sorted members
const seen = new Set<string>();
const uniqueTeams = opponentTeams.filter(t => {
  const key = [...t.members].sort().join(",");
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Sort by weight
uniqueTeams.sort((a, b) => b.weight - a.weight);

console.log(`=== 仮想対戦チーム ${uniqueTeams.length}パターン生成 (TOP30から) ===`);
console.log("上位10パターン:");
for (let i = 0; i < Math.min(10, uniqueTeams.length); i++) {
  const t = uniqueTeams[i];
  console.log(`  ${i + 1}. ${t.label} (重み${t.weight.toFixed(2)})`);
}

// ── Step 4: Evaluate Party 1 vs all opponent teams ──
const PARTY1 = ["Hippowdon", "Basculegion-F", "Lucario-Mega", "Delphox-Mega", "Glimmora", "Meowscarada"];

function evaluateParty(party: string[], oppTeams: OpponentTeam[]): {
  totalScore: number;
  wins: number;
  losses: number;
  draws: number;
  worstMatchups: { opp: string; score: number; weight: number }[];
} {
  let totalScore = 0;
  let wins = 0, losses = 0, draws = 0;
  const matchupResults: { opp: string; score: number; bestSel: string; weight: number }[] = [];

  for (const oppTeam of oppTeams) {
    // Try all C(party.length, 3) selections, pick the best
    let bestScore = -Infinity;
    let bestSel = "";
    const selections = combinations(party, 3);

    for (const sel of selections) {
      const result = evaluate3v3(sel, oppTeam.members, matrix, simEnv);
      const diff = result.scoreA - result.scoreB;
      if (diff > bestScore) {
        bestScore = diff;
        bestSel = sel.map(n => jaName(n)).join("+");
      }
    }

    const weightedScore = bestScore * oppTeam.weight;
    totalScore += weightedScore;
    if (bestScore > 0.05) wins++;
    else if (bestScore < -0.05) losses++;
    else draws++;

    matchupResults.push({ opp: oppTeam.label, score: bestScore, bestSel, weight: oppTeam.weight });
  }

  // Worst matchups (weighted)
  matchupResults.sort((a, b) => a.score * a.weight - b.score * b.weight);
  const worstMatchups = matchupResults.slice(0, 10);

  return { totalScore, wins, losses, draws, worstMatchups };
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

console.log(`\n=== パーティ1評価 (${uniqueTeams.length}パターン対戦) ===`);
console.log(`メンバー: ${PARTY1.map(n => jaName(n)).join(" / ")}`);

const result1 = evaluateParty(PARTY1, uniqueTeams);
console.log(`加重スコア: ${result1.totalScore.toFixed(1)}`);
console.log(`勝敗: ${result1.wins}勝 ${result1.losses}敗 ${result1.draws}引分 / ${uniqueTeams.length}戦`);
console.log(`勝率: ${(result1.wins / uniqueTeams.length * 100).toFixed(1)}%`);
console.log(`\n最も苦しいマッチアップ:`);
for (const m of result1.worstMatchups) {
  const marker = m.score < -0.05 ? "★" : "▲";
  console.log(`  ${marker} ${m.opp} — スコア差${m.score.toFixed(3)} [${m.bestSel}] (重み${m.weight.toFixed(2)})`);
}

// ── Step 5: Find which opponents appear most in losses ──
console.log(`\n=== 敗因分析: 負けマッチアップに頻出する相手 ===`);
const lossOpps = new Map<string, { count: number; totalWeightedLoss: number }>();
for (const m of result1.worstMatchups.filter(m => m.score < -0.05)) {
  const members = m.opp.split("+");
  for (const mem of members) {
    // Find pool name from ja name
    const poolName = [...poolMap.keys()].find(k => jaName(k) === mem) ?? mem;
    const entry = lossOpps.get(mem) ?? { count: 0, totalWeightedLoss: 0 };
    entry.count++;
    entry.totalWeightedLoss += Math.abs(m.score) * m.weight;
    lossOpps.set(mem, entry);
  }
}

const sorted = [...lossOpps.entries()].sort((a, b) => b[1].totalWeightedLoss - a[1].totalWeightedLoss);
for (const [name, data] of sorted.slice(0, 10)) {
  console.log(`  ${name}: ${data.count}回, 加重損失${data.totalWeightedLoss.toFixed(1)}`);
}
