/**
 * party2-build-core.ts
 *
 * 仮想環境の使用率を重みにして最適パーティを探索。
 * 常に交代あり: こちらも相手も不利対面では必ず交代する。
 *
 * 交代ルール:
 * - A vs B で B が有利 → A は控えの有利な C に交代 (交代を読まない: 相手は対A技を撃つ)
 * - 交代ダメージ推定: 相手の bestMove(対A) のタイプ × C のタイプ相性で近似
 *
 * スカーフロック:
 * - Choice Scarf 持ちは技を使ったら交代するまで同じ技しか撃てない
 * - 相手が交代で不利な対面になった場合、スカーフ持ちは強制交代 or ロック技で殴るしかない
 * - 評価: ロック状態で不利対面になるペナルティを加算
 *
 * Phase 1: matchupValue 事前計算
 * Phase 2: 個体スコアリング → 候補絞り込み
 * Phase 3: コア3体全探索 (メガ1体制限 + 持ち物排他)
 * Phase 4: 補完3体 + 交代あり3v3検証 + ターンシミュ
 */
import {
  matchupValue,
  effectiveKoN,
  baseSpecies,
  isSandChipImmune,
  evaluate3v3,
  resolveTeamWeather,
  canSetSR,
  SAND_CHIP_PCT,
  adjustedEKoN,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, DamageMatrixEntry, SimEnv } from "../analyzer/team-matchup-core.js";
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

// ── Move type lookup (for switch-in damage estimation) ──
const movesJson: Record<string, any> = JSON.parse(
  readFileSync("src/data/moves.json", "utf-8")
);
function getMoveType(moveName: string): string | null {
  return movesJson[moveName]?.type ?? null;
}

// ── Usage rate model: 37 / (1 + 0.12 * (rank - 1)) ──
function usagePct(rank: number): number {
  return 37.0 / (1 + 0.12 * (rank - 1));
}

// ── Pool lookups ──
const poolSpeeds = new Map<string, number>();
const poolTypes = new Map<string, string[]>();
const poolAbilities = new Map<string, string>();
const poolItems = new Map<string, string>();
const poolMoves = new Map<string, string[]>();
for (const p of pool) {
  poolSpeeds.set(p.name, p.speedStat ?? 0);
  const species = getSpecies(baseSpecies(p.name));
  poolTypes.set(p.name, (species?.types ?? []) as string[]);
  poolAbilities.set(p.name, p.ability ?? "");
  poolItems.set(p.name, p.item ?? "");
  poolMoves.set(p.name, p.moves ?? []);
}

// ── Item uniqueness check ──
function hasItemConflict(team: string[]): boolean {
  const items = new Set<string>();
  for (const m of team) {
    const item = poolItems.get(m) ?? "";
    if (item && items.has(item)) return true;
    if (item) items.add(item);
  }
  return false;
}

// ── SimEnv ──
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

// ── Mega detection ──
function isMega(name: string): boolean {
  return name.endsWith("-Mega");
}
function megaCount(names: string[]): number {
  return names.filter(n => isMega(n)).length;
}

// ── TOP50 opponent list (pool names) ──
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

const top50 = allRaw.slice(0, 50);
const opponents: { name: string; rank: number; weight: number }[] = [];
for (let i = 0; i < top50.length; i++) {
  const poolName = toPoolName(top50[i]);
  if (matrix[poolName]) {
    opponents.push({ name: poolName, rank: i + 1, weight: usagePct(i + 1) });
  }
}
const totalWeight = opponents.reduce((s, o) => s + o.weight, 0);

// ── Switch-in damage estimation ──
// Given A's bestMove against B, estimate how much damage C takes as a switch-in.
// Uses: bestMove type → C's type effectiveness → scale A's maxPct by ratio.
function switchInDamagePct(
  attacker: string,
  originalTarget: string,
  switchIn: string,
): number {
  const entry = matrix[attacker]?.[originalTarget];
  if (!entry || entry.maxPct <= 0) return 0;

  const moveType = getMoveType(entry.bestMove);
  if (!moveType) return 0;

  const switchTypes = poolTypes.get(switchIn) ?? [];
  if (switchTypes.length === 0) return 0;

  // Type effectiveness of bestMove vs switch-in
  const effVsSwitchIn = getEffectiveness(moveType as TypeName, switchTypes as TypeName[]);

  // Type effectiveness of bestMove vs original target
  const origTypes = poolTypes.get(originalTarget) ?? [];
  const effVsOrig = getEffectiveness(moveType as TypeName, origTypes as TypeName[]);

  if (effVsOrig <= 0) return 0;

  // Scale damage proportionally: if move was 2x vs original and 0.5x vs switch-in,
  // switch-in takes roughly 1/4 of the original damage
  const ratio = effVsSwitchIn / effVsOrig;
  return entry.maxPct * ratio;
}

// ── Choice Scarf detection ──
function isChoiceScarf(name: string): boolean {
  return (poolItems.get(name) ?? "") === "Choice Scarf";
}

// ── Palafin form change ──
// Palafin-Hero must be sent out as Naive first, then switch out (Flip Turn / switch).
// Only after returning does it transform to Hero form.
function isPalafinHero(name: string): boolean {
  return name === "Palafin-Hero";
}
// Penalty for evaluate3v3WithSwitch: ~1.5 matchupValue points lost for 1 setup turn
const PALAFIN_SETUP_PENALTY = 1.5;

// ── Switching moves (U-turn / Flip Turn / Volt Switch) ──
// Returns the switching move name if usable, or null.
// Conditions:
// - U-turn: always usable if learned
// - Flip Turn: usable unless opponent has Water Absorb (ちょすい)
// - Volt Switch: usable unless opponent is Ground type
const SWITCHING_MOVES = ["U-turn", "Flip Turn", "Volt Switch"] as const;

function getSwitchMove(attackerName: string, opponentName: string): string | null {
  const moves = poolMoves.get(attackerName) ?? [];
  const oppAbility = poolAbilities.get(opponentName) ?? "";
  const oppTypes = poolTypes.get(opponentName) ?? [];

  if (moves.includes("U-turn")) return "U-turn";
  if (moves.includes("Flip Turn")) {
    if (oppAbility !== "Water Absorb") return "Flip Turn";
  }
  if (moves.includes("Volt Switch")) {
    if (!oppTypes.includes("Ground")) return "Volt Switch";
  }
  return null;
}

// Estimate switching move damage using move type + effectiveness
function switchMoveDamage(attackerName: string, opponentName: string, moveName: string): number {
  // Check if this specific move exists in the damage matrix (it might be the bestMove)
  const entry = matrix[attackerName]?.[opponentName];
  if (entry && entry.bestMove === moveName) {
    return (entry.minPct + entry.maxPct) / 2;
  }
  // Otherwise estimate from move base power and type effectiveness
  const moveData = movesJson[moveName];
  if (!moveData) return 0;
  const moveType = moveData.type as string;
  const oppTypes = poolTypes.get(opponentName) ?? [];
  const eff = getEffectiveness(moveType as TypeName, oppTypes as TypeName[]);
  // Base estimate: these moves have 70 BP, roughly 15-25% damage on neutral
  // Scale from bestMove damage as reference
  if (!entry || entry.maxPct <= 0) return Math.max(0, 20 * eff);
  const bestMoveType = getMoveType(entry.bestMove);
  if (!bestMoveType) return Math.max(0, 20 * eff);
  const bestEff = getEffectiveness(bestMoveType as TypeName, oppTypes as TypeName[]);
  const bestBP = movesJson[entry.bestMove]?.basePower ?? 80;
  const moveBP = moveData.basePower ?? 70;
  // Scale proportionally: (switchMoveBP/bestMoveBP) * (switchMoveEff/bestMoveEff) * bestMoveDmg
  if (bestEff <= 0 || bestBP <= 0) return Math.max(0, 20 * eff);
  const ratio = (moveBP / bestBP) * (eff / bestEff);
  return Math.max(0, (entry.minPct + entry.maxPct) / 2 * ratio);
}

/**
 * Estimate damage when attacker is Scarf-locked to a specific move type
 * and the opponent switches to switchIn.
 * Returns estimated damage % to switchIn.
 */
function scarfLockedDamagePct(
  attacker: string,
  lockedMoveTarget: string,
  switchIn: string,
): number {
  const entry = matrix[attacker]?.[lockedMoveTarget];
  if (!entry || entry.maxPct <= 0) return 0;
  const moveType = getMoveType(entry.bestMove);
  if (!moveType) return 0;
  const switchTypes = poolTypes.get(switchIn) ?? [];
  if (switchTypes.length === 0) return 0;
  const effVsSwitchIn = getEffectiveness(moveType as TypeName, switchTypes as TypeName[]);
  const origTypes = poolTypes.get(lockedMoveTarget) ?? [];
  const effVsOrig = getEffectiveness(moveType as TypeName, origTypes as TypeName[]);
  if (effVsOrig <= 0) return entry.maxPct * effVsSwitchIn;
  return entry.maxPct * (effVsSwitchIn / effVsOrig);
}

/**
 * evaluate3v3 with switch + scarf-lock logic.
 *
 * Switch rules:
 * - Both sides switch when disadvantaged AND a bench member survives the hit AND is favorable
 * - Scarf-lock: if a Scarf user KOs/beats target, it's locked to that move type.
 *   When opponent switches in a counter, the Scarf user must either:
 *   (a) keep firing the locked move (possibly resisted/immune), or
 *   (b) switch out (loses tempo + Scarf speed advantage for that move)
 *   This creates an additional penalty for Scarf users in switch-heavy games.
 */
function evaluate3v3WithSwitch(
  selA: string[],
  selB: string[],
): { scoreA: number; scoreB: number; winner: string } {
  const activeWeather = resolveTeamWeather(selA, selB, simEnv);
  const sandActive = activeWeather === "Sand";
  const srFromA = canSetSR(selA, selB, matrix, simEnv);
  const srFromB = canSetSR(selB, selA, matrix, simEnv);

  function chipFor(name: string, oppHasSR: boolean): number {
    let chip = 0;
    if (sandActive && !simEnv.sandChipImmune.has(name)) chip += SAND_CHIP_PCT;
    if (oppHasSR) chip += simEnv.srChipPct.get(name) ?? 0;
    return chip;
  }

  let A_total = 0;
  let B_total = 0;

  const aMV: number[][] = [];
  const bMV: number[][] = [];

  for (let ai = 0; ai < selA.length; ai++) {
    aMV[ai] = [];
    for (let bi = 0; bi < selB.length; bi++) {
      const bChip = chipFor(selB[bi], srFromA);
      const val = matchupValue(selA[ai], selB[bi], matrix, simEnv.poolSpeeds, bChip);
      aMV[ai][bi] = val;
      A_total += val;
    }
  }
  for (let bi = 0; bi < selB.length; bi++) {
    bMV[bi] = [];
    for (let ai = 0; ai < selA.length; ai++) {
      const aChip = chipFor(selA[ai], srFromB);
      const val = matchupValue(selB[bi], selA[ai], matrix, simEnv.poolSpeeds, aChip);
      bMV[bi][ai] = val;
      B_total += val;
    }
  }

  // ── Switch penalty: when A[ai] beats B[bi], B may switch to B[bk] ──
  for (let ai = 0; ai < selA.length; ai++) {
    for (let bi = 0; bi < selB.length; bi++) {
      if (aMV[ai][bi] <= 0) continue;

      let bestSwitchPenalty = 0;

      for (let bk = 0; bk < selB.length; bk++) {
        if (bk === bi) continue;
        const dmgToSwitchIn = switchInDamagePct(selA[ai], selB[bi], selB[bk]);
        if (dmgToSwitchIn >= 100) continue;
        if (bMV[bk][ai] <= 0) continue;

        // Base penalty: lose the advantageous matchup, get 0.3 tempo credit
        let penalty = aMV[ai][bi] - 0.3;

        // Scarf-lock penalty: if A[ai] is Scarf, it's now locked to a move
        // that was good vs B[bi] but may be bad vs B[bk].
        // The Scarf user either fires the locked (bad) move or switches out.
        if (isChoiceScarf(selA[ai])) {
          const lockedDmg = scarfLockedDamagePct(selA[ai], selB[bi], selB[bk]);
          // If locked move does < 25% to switch-in → basically useless, must switch
          // Extra penalty: Scarf user forced to waste move or lose a turn switching
          if (lockedDmg < 25) {
            penalty += 0.3; // additional tempo loss for being locked
          }
        }

        if (penalty > bestSwitchPenalty) bestSwitchPenalty = penalty;
      }

      if (bestSwitchPenalty > 0) A_total -= bestSwitchPenalty;
    }
  }

  // ── Same for B side ──
  for (let bi = 0; bi < selB.length; bi++) {
    for (let ai = 0; ai < selA.length; ai++) {
      if (bMV[bi][ai] <= 0) continue;

      let bestSwitchPenalty = 0;
      for (let ak = 0; ak < selA.length; ak++) {
        if (ak === ai) continue;
        const dmgToSwitchIn = switchInDamagePct(selB[bi], selA[ai], selA[ak]);
        if (dmgToSwitchIn >= 100) continue;
        if (aMV[ak][bi] <= 0) continue;

        let penalty = bMV[bi][ai] - 0.3;
        if (isChoiceScarf(selB[bi])) {
          const lockedDmg = scarfLockedDamagePct(selB[bi], selA[ai], selA[ak]);
          if (lockedDmg < 25) penalty += 0.3;
        }
        if (penalty > bestSwitchPenalty) bestSwitchPenalty = penalty;
      }
      if (bestSwitchPenalty > 0) B_total -= bestSwitchPenalty;
    }
  }

  // Palafin-Hero penalty: needs 1 switch cycle to activate Hero form
  for (const name of selA) {
    if (isPalafinHero(name)) A_total -= PALAFIN_SETUP_PENALTY;
  }
  for (const name of selB) {
    if (isPalafinHero(name)) B_total -= PALAFIN_SETUP_PENALTY;
  }

  const scoreA = Math.round(A_total / 22.5 * 100) / 100;
  const scoreB = Math.round(B_total / 22.5 * 100) / 100;
  return {
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
  };
}

console.log(`=== 仮想環境パーティ最適化 (交代補正 + 持ち物排他) ===`);
console.log(`対象相手: ${opponents.length}体 (TOP50), 合計使用率重み: ${totalWeight.toFixed(1)}`);

// ── Phase 1: Precompute matchupValue for all (candidate, opponent) pairs ──
console.log("\n--- Phase 1: matchupValue 事前計算 ---");
const candidates = pool.map((p: any) => p.name).filter((n: string) => matrix[n]);
console.log(`候補: ${candidates.length}体`);

const mvTable = new Map<string, number[]>();
for (const c of candidates) {
  const scores: number[] = [];
  for (const opp of opponents) {
    const mv = matchupValue(c, opp.name, matrix, poolSpeeds);
    scores.push(mv);
  }
  mvTable.set(c, scores);
}

// ── Phase 2: Individual scoring (usage-weighted) ──
console.log("\n--- Phase 2: 個体使用率加重スコア TOP30 ---");

interface IndividualScore {
  name: string;
  weightedScore: number;
  coversCount: number;
  coversWeight: number;
}

const individualScores: IndividualScore[] = [];
for (const c of candidates) {
  const scores = mvTable.get(c)!;
  let weightedScore = 0;
  let coversCount = 0;
  let coversWeight = 0;
  for (let i = 0; i < opponents.length; i++) {
    weightedScore += scores[i] * opponents[i].weight;
    if (scores[i] > 0) {
      coversCount++;
      coversWeight += opponents[i].weight;
    }
  }
  individualScores.push({ name: c, weightedScore, coversCount, coversWeight });
}

individualScores.sort((a, b) => b.weightedScore - a.weightedScore);

console.log("順位  ポケモン名           加重スコア  カバー数  カバ���率");
console.log("─".repeat(65));
for (let i = 0; i < 30; i++) {
  const s = individualScores[i];
  console.log(
    `${String(i + 1).padStart(3)}.  ${jaName(s.name).padEnd(16)}  ${s.weightedScore.toFixed(1).padStart(8)}  ${String(s.coversCount).padStart(5)}/${opponents.length}  ${(s.coversWeight / totalWeight * 100).toFixed(1).padStart(5)}%`
  );
}

// ── Shared utilities ──
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

// ── Build co-occurrence opponent teams (used by Phase 3 + 4 + 5) ──
const rawToPool = new Map<string, string>();
for (const raw of allRaw) rawToPool.set(raw.name, toPoolName(raw));

const cooccurrence = new Map<string, Map<string, number>>();
for (const raw of allRaw.slice(0, 50)) {
  const me = toPoolName(raw);
  if (!cooccurrence.has(me)) cooccurrence.set(me, new Map());
  for (const tm of raw.teammates ?? []) {
    const partner = rawToPool.get(tm.name) ?? tm.name;
    cooccurrence.get(me)!.set(partner, (cooccurrence.get(me)!.get(partner) ?? 0) + 1);
    if (!cooccurrence.has(partner)) cooccurrence.set(partner, new Map());
    cooccurrence.get(partner)!.set(me, (cooccurrence.get(partner)!.get(me) ?? 0) + 1);
  }
}

const top50Pool = allRaw.slice(0, 50).map((r: any) => toPoolName(r));

interface OppTeam { members: string[]; weight: number; label: string }
const oppTeams: OppTeam[] = [];
for (let ri = 0; ri < Math.min(30, allRaw.length); ri++) {
  const raw = allRaw[ri];
  const lead = toPoolName(raw);
  if (!matrix[lead]) continue;
  const partners = cooccurrence.get(lead);
  if (!partners) continue;
  const topPartners = [...partners.entries()]
    .filter(([p]) => p !== lead && matrix[p] && top50Pool.includes(p))
    .sort((a, b) => b[1] - a[1]);
  for (let pj = 0; pj < Math.min(3, topPartners.length); pj++) {
    for (let pk = pj + 1; pk < Math.min(4, topPartners.length); pk++) {
      const team = [lead, topPartners[pj][0], topPartners[pk][0]];
      const teamBases = new Set(team.map(t => baseSpecies(t)));
      if (teamBases.size < 3) continue;
      const w = Math.sqrt(Math.max(1, 51 - (ri + 1))) / Math.sqrt(50)
        * (1 + (topPartners[pj][1] + topPartners[pk][1]) / 10);
      oppTeams.push({ members: team, weight: w, label: team.map(t => jaName(t)).join("+") });
    }
  }
}
const seen = new Set<string>();
const uniqueOppTeams = oppTeams.filter(t => {
  const key = [...t.members].sort().join(",");
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
console.log(`\n仮想相手チーム: ${uniqueOppTeams.length}種生成`);

// ── Phase 3: Core 3 search ──
const TOP_N = 35;
const topCandidates = individualScores.slice(0, TOP_N).map(s => s.name);

console.log(`\n--- Phase 3: コア3体探索 (TOP${TOP_N}から, メガ1体制限) ---`);

interface CoreResult {
  members: string[];
  weightedScore: number;
  fullCoverWeight: number;
  uncoveredOpps: { name: string; weight: number }[];
}

const coreResults: CoreResult[] = [];

for (let i = 0; i < topCandidates.length; i++) {
  for (let j = i + 1; j < topCandidates.length; j++) {
    for (let k = j + 1; k < topCandidates.length; k++) {
      const c1 = topCandidates[i];
      const c2 = topCandidates[j];
      const c3 = topCandidates[k];

      const bases = new Set([baseSpecies(c1), baseSpecies(c2), baseSpecies(c3)]);
      if (bases.size < 3) continue;
      if (megaCount([c1, c2, c3]) > 1) continue;
      if (hasItemConflict([c1, c2, c3])) continue;

      const mv1 = mvTable.get(c1)!;
      const mv2 = mvTable.get(c2)!;
      const mv3 = mvTable.get(c3)!;

      let weightedScore = 0;
      let fullCoverWeight = 0;
      const uncoveredOpps: { name: string; weight: number }[] = [];

      for (let oi = 0; oi < opponents.length; oi++) {
        const best = Math.max(mv1[oi], mv2[oi], mv3[oi]);
        weightedScore += best * opponents[oi].weight;
        if (best > 0) {
          fullCoverWeight += opponents[oi].weight;
        } else {
          uncoveredOpps.push({ name: opponents[oi].name, weight: opponents[oi].weight });
        }
      }

      coreResults.push({ members: [c1, c2, c3], weightedScore, fullCoverWeight, uncoveredOpps });
    }
  }
}

coreResults.sort((a, b) => b.weightedScore - a.weightedScore);

// Pre-filter: keep top 200 by static score, then re-rank by switch evaluation
coreResults.sort((a, b) => b.weightedScore - a.weightedScore);
const coreShortlist = coreResults.slice(0, 200);

console.log(`  静的スコアTOP200を交代+スカーフ込みで再評価中... (${coreShortlist.length} × ${uniqueOppTeams.length}チーム)`);

interface CoreSwitchResult {
  members: string[];
  swWins: number;
  swLosses: number;
  swDraws: number;
  swWinRate: number;
  staticScore: number;
  lossDetails: { opp: string; score: number }[];
}

const coreSwitchResults: CoreSwitchResult[] = [];
for (const core of coreShortlist) {
  let wins = 0, losses = 0, draws = 0;
  const lossDetails: { opp: string; score: number }[] = [];
  for (const opp of uniqueOppTeams) {
    const r = evaluate3v3WithSwitch(core.members, opp.members);
    const diff = r.scoreA - r.scoreB;
    if (diff > 0.05) wins++;
    else if (diff < -0.05) { losses++; lossDetails.push({ opp: opp.label, score: diff }); }
    else draws++;
  }
  coreSwitchResults.push({
    members: core.members,
    swWins: wins, swLosses: losses, swDraws: draws,
    swWinRate: wins / uniqueOppTeams.length,
    staticScore: core.weightedScore,
    lossDetails: lossDetails.sort((a, b) => a.score - b.score),
  });
}

// Sort by: win rate desc, then fewer losses, then higher static score
coreSwitchResults.sort((a, b) =>
  b.swWinRate - a.swWinRate
  || a.swLosses - b.swLosses
  || b.staticScore - a.staticScore
);

console.log("\nコア3体 TOP15 (交代+スカーフロック込み):");
console.log("順位  メンバー                                    勝率    勝-敗-分  敗北相手");
console.log("─".repeat(100));
for (let i = 0; i < Math.min(15, coreSwitchResults.length); i++) {
  const r = coreSwitchResults[i];
  const names = r.members.map(m => jaName(m)).join(" / ");
  const losses = r.lossDetails.length > 0
    ? r.lossDetails.slice(0, 3).map(l => l.opp).join(", ")
    : "なし";
  console.log(
    `${String(i + 1).padStart(3)}.  ${names.padEnd(40)}  ${(r.swWinRate * 100).toFixed(1).padStart(5)}%  ${r.swWins}-${r.swLosses}-${r.swDraws}  ${losses}`
  );
}

// ── Phase 4: Extend best core to 6 members ──
console.log("\n--- Phase 4: 補完3体探索 + 交代補正付き3v3検証 ---");

let bestPartyForSim: string[] = [];
let bestValidSels: string[][] = [];
let bestSimWinRate = -1;

for (let ci = 0; ci < Math.min(3, coreSwitchResults.length); ci++) {
  const core = coreSwitchResults[ci];
  const coreBases = new Set(core.members.map(m => baseSpecies(m)));
  console.log(`\n◆ コア${ci + 1}: ${core.members.map(m => jaName(m)).join(" / ")} (コア勝率${(core.swWinRate * 100).toFixed(1)}%)`);

  // Greedy slot fill with switch evaluation
  const selected: string[] = [...core.members];
  const usedBases = new Set(coreBases);

  for (let slot = 4; slot <= 6; slot++) {
    let bestAdd = "";
    let bestWinRate = -Infinity;
    let bestWins = 0;

    // Use top candidates (by static score) to keep computation manageable
    const slotCandidates = individualScores.slice(0, 50).map(s => s.name);
    for (const cand of slotCandidates) {
      if (selected.includes(cand)) continue;
      if (usedBases.has(baseSpecies(cand))) continue;
      if (hasItemConflict([...selected, cand])) continue;

      // Evaluate with switch: try all 3-member selections from (selected + cand)
      const trial = [...selected, cand];
      const trialSels = combinations(trial, 3).filter(sel => megaCount(sel) <= 1);
      if (trialSels.length === 0) continue;

      let wins = 0;
      for (const opp of uniqueOppTeams) {
        let bestDiff = -Infinity;
        for (const sel of trialSels) {
          const r = evaluate3v3WithSwitch(sel, opp.members);
          const diff = r.scoreA - r.scoreB;
          if (diff > bestDiff) bestDiff = diff;
        }
        if (bestDiff > 0.05) wins++;
      }

      const wr = wins / uniqueOppTeams.length;
      if (wr > bestWinRate || (wr === bestWinRate && wins > bestWins)) {
        bestWinRate = wr;
        bestWins = wins;
        bestAdd = cand;
      }
    }

    if (bestAdd) {
      selected.push(bestAdd);
      usedBases.add(baseSpecies(bestAdd));
      console.log(`  枠${slot}: ${jaName(bestAdd)} (交代込み勝率${(bestWinRate * 100).toFixed(1)}%)`);
    }
  }

  // Coverage summary
  const finalMvs = selected.map(m => mvTable.get(m)!);
  let coverCount = 0;
  const finalUncovered: string[] = [];
  for (let oi = 0; oi < opponents.length; oi++) {
    if (Math.max(...finalMvs.map(mv => mv[oi])) > 0) coverCount++;
    else finalUncovered.push(jaName(opponents[oi].name));
  }

  console.log(`\n  最終6体:`);
  for (const m of selected) {
    const item = poolItems.get(m) ?? "???";
    console.log(`    ${jaName(m).padEnd(16)} [${item}]`);
  }
  console.log(`  カバー: ${coverCount}/${opponents.length}`);
  if (finalUncovered.length > 0) console.log(`  穴: ${finalUncovered.join(", ")}`);

  // ── 3v3 verification: switch + scarf-lock ──
  const validSelections = combinations(selected, 3).filter(sel => megaCount(sel) <= 1);
  console.log(`  有効選出: ${validSelections.length}通り (メガ1体制限)`);

  const scarfMembers = selected.filter(m => isChoiceScarf(m));
  if (scarfMembers.length > 0) {
    console.log(`  スカーフ: ${scarfMembers.map(m => jaName(m)).join(", ")}`);
  }

  let swWins = 0, swLosses = 0, swDraws = 0;
  const swLossDetails: { opp: string; score: number; sel: string }[] = [];
  for (const opp of uniqueOppTeams) {
    let bestScore = -Infinity;
    let bestSel = "";
    for (const sel of validSelections) {
      const r = evaluate3v3WithSwitch(sel, opp.members);
      const diff = r.scoreA - r.scoreB;
      if (diff > bestScore) {
        bestScore = diff;
        bestSel = sel.map(n => jaName(n)).join("+");
      }
    }
    if (bestScore > 0.05) swWins++;
    else if (bestScore < -0.05) {
      swLosses++;
      swLossDetails.push({ opp: opp.label, score: bestScore, sel: bestSel });
    }
    else swDraws++;
  }
  swLossDetails.sort((a, b) => a.score - b.score);
  console.log(`\n  [交代+スカーフロック] ${swWins}勝 ${swLosses}敗 ${swDraws}引分 / ${uniqueOppTeams.length}戦 (${(swWins / uniqueOppTeams.length * 100).toFixed(1)}%)`);

  if (swLossDetails.length > 0) {
    console.log(`  敗北マッチアップ:`);
    for (const l of swLossDetails.slice(0, 10)) {
      console.log(`    ★ ${l.opp} (${l.score.toFixed(3)}) [${l.sel}]`);
    }
  }

  // Pick best core by switch win rate for simulation
  const winRate = swWins / uniqueOppTeams.length;
  if (winRate > bestSimWinRate) {
    bestSimWinRate = winRate;
    bestPartyForSim = selected;
    bestValidSels = validSelections;
  }
}

// ══════════════════════════════════════════════════════════════
// Phase 5: Turn-by-turn simulation vs 10 representative teams
// ══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log(`=== Phase 5: ターン逐次シミュレーション (10チーム) ===`);
console.log(`${"═".repeat(70)}`);

const movesJa = JSON.parse(readFileSync("home-data/storage/i18n/moves-ja.json", "utf-8"));
const jaMove = (en: string) => movesJa[en] || en;

const SIM_OPP_COUNT = 10;
const simOppTeams = uniqueOppTeams.slice(0, SIM_OPP_COUNT);

console.log(`\n仮想相手チーム ${simOppTeams.length}種:`);
for (let i = 0; i < simOppTeams.length; i++) {
  const t = simOppTeams[i];
  console.log(`  ${i + 1}. ${t.label} (重み${t.weight.toFixed(2)})`);
}

// ── Damage helpers ──
function avgDamage(attacker: string, defender: string): number {
  const entry = matrix[attacker]?.[defender];
  if (!entry || entry.maxPct <= 0) return 0;
  return (entry.minPct + entry.maxPct) / 2;
}
function bestMoveName(attacker: string, defender: string): string {
  return matrix[attacker]?.[defender]?.bestMove ?? "???";
}
function switchInDamageAvg(attacker: string, originalTarget: string, switchIn: string): number {
  const entry = matrix[attacker]?.[originalTarget];
  if (!entry || entry.maxPct <= 0) return 0;
  const moveType = getMoveType(entry.bestMove);
  if (!moveType) return 0;
  const switchTypes = poolTypes.get(switchIn) ?? [];
  const origTypes = poolTypes.get(originalTarget) ?? [];
  if (switchTypes.length === 0 || origTypes.length === 0) return 0;
  const effSwitch = getEffectiveness(moveType as TypeName, switchTypes as TypeName[]);
  const effOrig = getEffectiveness(moveType as TypeName, origTypes as TypeName[]);
  if (effOrig <= 0) return entry.maxPct * effSwitch;
  return (entry.minPct + entry.maxPct) / 2 * (effSwitch / effOrig);
}
function mvSim(a: string, b: string): number {
  return matchupValue(a, b, matrix, poolSpeeds);
}

// ── Battle State ──
interface Fighter { name: string; hp: number; lockedMoveTarget: string | null; palafinActivated: boolean; }
interface BattleResult {
  winner: "A" | "B" | "draw";
  aRemaining: number;
  bRemaining: number;
  log: string[];
}

function simulateBattle(teamA: string[], teamB: string[]): BattleResult {
  const stA: Fighter[] = teamA.map(n => ({ name: n, hp: 100, lockedMoveTarget: null, palafinActivated: false }));
  const stB: Fighter[] = teamB.map(n => ({ name: n, hp: 100, lockedMoveTarget: null, palafinActivated: false }));
  let idxA = 0, idxB = 0;
  const log: string[] = [];

  // Effective name: Palafin-Hero uses Naive ("Palafin") stats until activated
  function eName(f: Fighter): string {
    return isPalafinHero(f.name) && !f.palafinActivated ? "Palafin" : f.name;
  }

  function alive(team: Fighter[]): Fighter[] { return team.filter(f => f.hp > 0); }
  function aliveBench(team: Fighter[], activeIdx: number): number[] {
    return team.map((_, i) => i).filter(i => i !== activeIdx && team[i].hp > 0);
  }

  function bestSwitchSim(team: Fighter[], activeIdx: number, oppName: string): number {
    const bench = aliveBench(team, activeIdx);
    if (bench.length === 0) return -1;
    let bestIdx = -1, bestMvVal = -Infinity;
    for (const bi of bench) {
      const val = mvSim(eName(team[bi]), oppName);
      if (val > bestMvVal) { bestMvVal = val; bestIdx = bi; }
    }
    return bestMvVal > 0 ? bestIdx : -1;
  }

  function shouldSwitchSim(myTeam: Fighter[], myIdx: number, oppName: string): number {
    const me = myTeam[myIdx];
    const myEffName = eName(me);

    // Palafin-Hero (Naive form): MUST switch out to activate Hero form
    if (isPalafinHero(me.name) && !me.palafinActivated) {
      const si = bestSwitchSim(myTeam, myIdx, oppName);
      if (si >= 0) {
        const dmg = switchInDamageAvg(oppName, myEffName, eName(myTeam[si]));
        if (myTeam[si].hp - dmg > 0) return si;
      }
      // No valid switch target: forced to stay as Naive and fight
      return -1;
    }

    const myMvVal = mvSim(myEffName, oppName);
    const oppMvVal = mvSim(oppName, myEffName);
    const isDisadvantaged = myMvVal <= 0 && oppMvVal > 0;

    let scarfLocked = false;
    if (isChoiceScarf(me.name) && me.lockedMoveTarget) {
      const lockedDmg = scarfLockedDamagePct(me.name, me.lockedMoveTarget, oppName);
      if (lockedDmg < 20 && oppMvVal > 0) scarfLocked = true;
    }

    if (isDisadvantaged || scarfLocked) {
      const si = bestSwitchSim(myTeam, myIdx, oppName);
      if (si >= 0) {
        const dmg = switchInDamageAvg(oppName, myEffName, eName(myTeam[si]));
        if (myTeam[si].hp - dmg > 0) return si;
      }
    }
    return -1;
  }

  function pickNextSim(team: Fighter[], activeIdx: number, oppName: string): number {
    const bench = aliveBench(team, activeIdx);
    if (bench.length === 0) return -1;
    let bestIdx = bench[0], bestMvVal = -Infinity;
    for (const bi of bench) {
      const val = mvSim(eName(team[bi]), oppName);
      if (val > bestMvVal) { bestMvVal = val; bestIdx = bi; }
    }
    return bestIdx;
  }

  function scarfLockedAvgDmg(attacker: string, lockedTarget: string, actualTarget: string): number {
    return scarfLockedDamagePct(attacker, lockedTarget, actualTarget);
  }

  log.push(`  先発: ${jaName(stA[0].name)} vs ${jaName(stB[0].name)}`);

  for (let turn = 1; turn <= 30; turn++) {
    if (alive(stA).length === 0 || alive(stB).length === 0) break;
    const a = stA[idxA];
    const b = stB[idxB];
    log.push(`  T${turn}: ${jaName(a.name)}(${a.hp.toFixed(0)}%) vs ${jaName(b.name)}(${b.hp.toFixed(0)}%)`);

    const aEff = eName(a), bEff = eName(b);
    const aSwitchTo = shouldSwitchSim(stA, idxA, bEff);
    const bSwitchTo = shouldSwitchSim(stB, idxB, aEff);

    if (aSwitchTo >= 0 && bSwitchTo >= 0) {
      // Palafin activation on switch-out (not faint)
      if (isPalafinHero(a.name)) a.palafinActivated = true;
      if (isPalafinHero(b.name)) b.palafinActivated = true;
      idxA = aSwitchTo; idxB = bSwitchTo;
      stA[idxA].lockedMoveTarget = null;
      stB[idxB].lockedMoveTarget = null;
      log.push(`    A→${jaName(stA[idxA].name)} / B→${jaName(stB[idxB].name)} 同時交代`);
      continue;
    }

    if (aSwitchTo >= 0) {
      const oldAEff = aEff;
      const spdMe = poolSpeeds.get(oldAEff) ?? 0;
      const spdOpp = poolSpeeds.get(bEff) ?? 0;
      const aIsFaster = spdMe >= spdOpp;
      const oppDmgToMe = avgDamage(bEff, oldAEff);
      const switchMove = getSwitchMove(oldAEff, bEff);

      // Switching move: usable if (faster OR survive opponent's hit)
      if (switchMove && (aIsFaster || a.hp - oppDmgToMe > 0)) {
        if (aIsFaster) {
          // A faster: switching move → damage → switch → switch-in takes B's attack
          const smDmg = switchMoveDamage(oldAEff, bEff, switchMove);
          if (isPalafinHero(a.name)) a.palafinActivated = true;
          if (isChoiceScarf(a.name)) a.lockedMoveTarget = bEff;
          b.hp = Math.max(0, b.hp - smDmg);
          log.push(`    A:${jaName(a.name)} ${jaMove(switchMove)} ${smDmg.toFixed(0)}%→${jaName(b.name)}(${b.hp.toFixed(0)}%)`);
          if (b.hp <= 0) {
            log.push(`    ★${jaName(b.name)} 倒れた`);
            idxA = aSwitchTo; stA[idxA].lockedMoveTarget = null;
            const nextB = pickNextSim(stB, idxB, eName(stA[idxA]));
            if (nextB < 0) { log.push(`    B全滅`); break; }
            idxB = nextB; stB[idxB].lockedMoveTarget = null;
            log.push(`    A→${jaName(stA[idxA].name)}`);
            continue;
          }
          idxA = aSwitchTo;
          const newA = stA[idxA];
          newA.lockedMoveTarget = null;
          const newAEff = eName(newA);
          const inDmg = switchInDamageAvg(bEff, oldAEff, newAEff);
          const oppMove = bestMoveName(bEff, oldAEff);
          if (isChoiceScarf(b.name)) b.lockedMoveTarget = oldAEff;
          newA.hp = Math.max(0, newA.hp - inDmg);
          log.push(`    A→${jaName(newA.name)}, B:${jaMove(oppMove)} ${inDmg.toFixed(0)}%→${jaName(newA.name)}(${newA.hp.toFixed(0)}%)`);
          if (newA.hp <= 0) {
            log.push(`    ★${jaName(newA.name)} 倒れた`);
            const next = pickNextSim(stA, idxA, bEff);
            if (next < 0) { log.push(`    A全滅`); break; }
            idxA = next; stA[idxA].lockedMoveTarget = null;
          }
        } else {
          // A slower: B attacks A first → A survives → switching move → switch (no extra hit)
          const bDmg = avgDamage(bEff, oldAEff);
          const bMove = bestMoveName(bEff, oldAEff);
          if (isChoiceScarf(b.name)) b.lockedMoveTarget = oldAEff;
          a.hp = Math.max(0, a.hp - bDmg);
          log.push(`    B:${jaName(b.name)} ${jaMove(bMove)} ${bDmg.toFixed(0)}%→${jaName(a.name)}(${a.hp.toFixed(0)}%)`);
          if (a.hp <= 0) {
            log.push(`    ★${jaName(a.name)} 倒れた`);
            const next = pickNextSim(stA, idxA, bEff);
            if (next < 0) { log.push(`    A全滅`); break; }
            idxA = next; stA[idxA].lockedMoveTarget = null;
            continue;
          }
          const smDmg = switchMoveDamage(oldAEff, bEff, switchMove);
          if (isPalafinHero(a.name)) a.palafinActivated = true;
          if (isChoiceScarf(a.name)) a.lockedMoveTarget = bEff;
          b.hp = Math.max(0, b.hp - smDmg);
          log.push(`    A:${jaName(a.name)} ${jaMove(switchMove)} ${smDmg.toFixed(0)}%→${jaName(b.name)}(${b.hp.toFixed(0)}%)`);
          if (b.hp <= 0) {
            log.push(`    ★${jaName(b.name)} 倒れた`);
            idxA = aSwitchTo; stA[idxA].lockedMoveTarget = null;
            const nextB = pickNextSim(stB, idxB, eName(stA[idxA]));
            if (nextB < 0) { log.push(`    B全滅`); break; }
            idxB = nextB; stB[idxB].lockedMoveTarget = null;
            log.push(`    A→${jaName(stA[idxA].name)}`);
            continue;
          }
          idxA = aSwitchTo;
          const newA = stA[idxA];
          newA.lockedMoveTarget = null;
          log.push(`    A→${jaName(newA.name)}`);
        }
        continue;
      }

      // Normal switch (no switching move available or can't use it)
      if (isPalafinHero(a.name)) a.palafinActivated = true;
      idxA = aSwitchTo;
      const newA = stA[idxA];
      newA.lockedMoveTarget = null;
      const newAEff = eName(newA);
      const dmg = switchInDamageAvg(bEff, oldAEff, newAEff);
      const moveName = bestMoveName(bEff, oldAEff);
      if (isChoiceScarf(b.name)) b.lockedMoveTarget = oldAEff;
      newA.hp = Math.max(0, newA.hp - dmg);
      const formLabel = isPalafinHero(newA.name) && !newA.palafinActivated ? "(ナイーブ)" : "";
      log.push(`    A→${jaName(newA.name)}${formLabel}, B:${jaMove(moveName)} ${dmg.toFixed(0)}%→${jaName(newA.name)}(${newA.hp.toFixed(0)}%)`);
      if (newA.hp <= 0) {
        log.push(`    ★${jaName(newA.name)} 倒れた`);
        const next = pickNextSim(stA, idxA, bEff);
        if (next < 0) { log.push(`    A全滅`); break; }
        idxA = next; stA[idxA].lockedMoveTarget = null;
      }
      continue;
    }

    if (bSwitchTo >= 0) {
      const oldBEff = bEff;
      const spdOppB = poolSpeeds.get(oldBEff) ?? 0;
      const spdMeB = poolSpeeds.get(aEff) ?? 0;
      const bIsFaster = spdOppB >= spdMeB;
      const aDmgToB = avgDamage(aEff, oldBEff);
      const switchMoveB = getSwitchMove(oldBEff, aEff);

      // Switching move: usable if (faster OR survive opponent's hit)
      if (switchMoveB && (bIsFaster || b.hp - aDmgToB > 0)) {
        if (bIsFaster) {
          // B faster: switching move → damage → switch → switch-in takes A's attack
          const smDmg = switchMoveDamage(oldBEff, aEff, switchMoveB);
          if (isPalafinHero(b.name)) b.palafinActivated = true;
          if (isChoiceScarf(b.name)) b.lockedMoveTarget = aEff;
          a.hp = Math.max(0, a.hp - smDmg);
          log.push(`    B:${jaName(b.name)} ${jaMove(switchMoveB)} ${smDmg.toFixed(0)}%→${jaName(a.name)}(${a.hp.toFixed(0)}%)`);
          if (a.hp <= 0) {
            log.push(`    ★${jaName(a.name)} 倒れた`);
            idxB = bSwitchTo; stB[idxB].lockedMoveTarget = null;
            const nextA = pickNextSim(stA, idxA, eName(stB[idxB]));
            if (nextA < 0) { log.push(`    A全滅`); break; }
            idxA = nextA; stA[idxA].lockedMoveTarget = null;
            log.push(`    B→${jaName(stB[idxB].name)}`);
            continue;
          }
          idxB = bSwitchTo;
          const newB = stB[idxB];
          newB.lockedMoveTarget = null;
          const newBEff = eName(newB);
          const inDmg = switchInDamageAvg(aEff, oldBEff, newBEff);
          const oppMove = bestMoveName(aEff, oldBEff);
          if (isChoiceScarf(a.name)) a.lockedMoveTarget = oldBEff;
          newB.hp = Math.max(0, newB.hp - inDmg);
          log.push(`    B→${jaName(newB.name)}, A:${jaMove(oppMove)} ${inDmg.toFixed(0)}%→${jaName(newB.name)}(${newB.hp.toFixed(0)}%)`);
          if (newB.hp <= 0) {
            log.push(`    ★${jaName(newB.name)} 倒れた`);
            const next = pickNextSim(stB, idxB, aEff);
            if (next < 0) { log.push(`    B全滅`); break; }
            idxB = next; stB[idxB].lockedMoveTarget = null;
          }
        } else {
          // B slower: A attacks B first → B survives → switching move → switch (no extra hit)
          const aDmg = avgDamage(aEff, oldBEff);
          const aMove = bestMoveName(aEff, oldBEff);
          if (isChoiceScarf(a.name)) a.lockedMoveTarget = oldBEff;
          b.hp = Math.max(0, b.hp - aDmg);
          log.push(`    A:${jaName(a.name)} ${jaMove(aMove)} ${aDmg.toFixed(0)}%→${jaName(b.name)}(${b.hp.toFixed(0)}%)`);
          if (b.hp <= 0) {
            log.push(`    ★${jaName(b.name)} 倒れた`);
            const next = pickNextSim(stB, idxB, aEff);
            if (next < 0) { log.push(`    B全滅`); break; }
            idxB = next; stB[idxB].lockedMoveTarget = null;
            continue;
          }
          const smDmg = switchMoveDamage(oldBEff, aEff, switchMoveB);
          if (isPalafinHero(b.name)) b.palafinActivated = true;
          if (isChoiceScarf(b.name)) b.lockedMoveTarget = aEff;
          a.hp = Math.max(0, a.hp - smDmg);
          log.push(`    B:${jaName(b.name)} ${jaMove(switchMoveB)} ${smDmg.toFixed(0)}%→${jaName(a.name)}(${a.hp.toFixed(0)}%)`);
          if (a.hp <= 0) {
            log.push(`    ★${jaName(a.name)} 倒れた`);
            idxB = bSwitchTo; stB[idxB].lockedMoveTarget = null;
            const nextA = pickNextSim(stA, idxA, eName(stB[idxB]));
            if (nextA < 0) { log.push(`    A全滅`); break; }
            idxA = nextA; stA[idxA].lockedMoveTarget = null;
            log.push(`    B→${jaName(stB[idxB].name)}`);
            continue;
          }
          idxB = bSwitchTo;
          const newB = stB[idxB];
          newB.lockedMoveTarget = null;
          log.push(`    B→${jaName(newB.name)}`);
        }
        continue;
      }

      // Normal switch (no switching move available or can't use it)
      if (isPalafinHero(b.name)) b.palafinActivated = true;
      idxB = bSwitchTo;
      const newB = stB[idxB];
      newB.lockedMoveTarget = null;
      const newBEff = eName(newB);
      const dmg = switchInDamageAvg(aEff, oldBEff, newBEff);
      const moveName = bestMoveName(aEff, oldBEff);
      if (isChoiceScarf(a.name)) a.lockedMoveTarget = oldBEff;
      newB.hp = Math.max(0, newB.hp - dmg);
      const formLabel = isPalafinHero(newB.name) && !newB.palafinActivated ? "(ナイーブ)" : "";
      log.push(`    B→${jaName(newB.name)}${formLabel}, A:${jaMove(moveName)} ${dmg.toFixed(0)}%→${jaName(newB.name)}(${newB.hp.toFixed(0)}%)`);
      if (newB.hp <= 0) {
        log.push(`    ★${jaName(newB.name)} 倒れた`);
        const next = pickNextSim(stB, idxB, aEff);
        if (next < 0) { log.push(`    B全滅`); break; }
        idxB = next; stB[idxB].lockedMoveTarget = null;
      }
      continue;
    }

    // Both attack — use effective names for damage lookups
    const spdA = poolSpeeds.get(aEff) ?? 0;
    const spdB = poolSpeeds.get(bEff) ?? 0;
    const aFirst = spdA >= spdB;
    const first = aFirst ? a : b;
    const second = aFirst ? b : a;
    const target1 = aFirst ? b : a;
    const target2 = aFirst ? a : b;
    const firstIsA = aFirst;
    const fEff = eName(first), sEff = eName(second);
    const t1Eff = eName(target1), t2Eff = eName(target2);

    let dmg1: number, move1: string;
    if (isChoiceScarf(first.name) && first.lockedMoveTarget && first.lockedMoveTarget !== t1Eff) {
      dmg1 = scarfLockedAvgDmg(first.name, first.lockedMoveTarget, t1Eff);
      move1 = bestMoveName(first.name, first.lockedMoveTarget) + "(ロック)";
    } else {
      dmg1 = avgDamage(fEff, t1Eff);
      move1 = bestMoveName(fEff, t1Eff);
      if (isChoiceScarf(first.name)) first.lockedMoveTarget = t1Eff;
    }
    target1.hp = Math.max(0, target1.hp - dmg1);
    const firstFormLabel = isPalafinHero(first.name) && !first.palafinActivated ? "(ナイーブ)" : "";
    log.push(`    ${firstIsA ? "A" : "B"}:${jaName(first.name)}${firstFormLabel} ${jaMove(move1)} ${dmg1.toFixed(0)}%→${jaName(target1.name)}(${target1.hp.toFixed(0)}%)`);

    if (target1.hp <= 0) {
      log.push(`    ★${jaName(target1.name)} 倒れた`);
      if (firstIsA) {
        const next = pickNextSim(stB, idxB, fEff);
        if (next < 0) { log.push(`    B全滅`); break; }
        idxB = next; stB[idxB].lockedMoveTarget = null;
      } else {
        const next = pickNextSim(stA, idxA, fEff);
        if (next < 0) { log.push(`    A全滅`); break; }
        idxA = next; stA[idxA].lockedMoveTarget = null;
      }
      continue;
    }

    let dmg2: number, move2: string;
    if (isChoiceScarf(second.name) && second.lockedMoveTarget && second.lockedMoveTarget !== t2Eff) {
      dmg2 = scarfLockedAvgDmg(second.name, second.lockedMoveTarget, t2Eff);
      move2 = bestMoveName(second.name, second.lockedMoveTarget) + "(ロック)";
    } else {
      dmg2 = avgDamage(sEff, t2Eff);
      move2 = bestMoveName(sEff, t2Eff);
      if (isChoiceScarf(second.name)) second.lockedMoveTarget = t2Eff;
    }
    target2.hp = Math.max(0, target2.hp - dmg2);
    const secondFormLabel = isPalafinHero(second.name) && !second.palafinActivated ? "(ナイーブ)" : "";
    log.push(`    ${firstIsA ? "B" : "A"}:${jaName(second.name)}${secondFormLabel} ${jaMove(move2)} ${dmg2.toFixed(0)}%→${jaName(target2.name)}(${target2.hp.toFixed(0)}%)`);

    if (target2.hp <= 0) {
      log.push(`    ★${jaName(target2.name)} 倒れた`);
      if (firstIsA) {
        const next = pickNextSim(stA, idxA, sEff);
        if (next < 0) { log.push(`    A全滅`); break; }
        idxA = next; stA[idxA].lockedMoveTarget = null;
      } else {
        const next = pickNextSim(stB, idxB, sEff);
        if (next < 0) { log.push(`    B全滅`); break; }
        idxB = next; stB[idxB].lockedMoveTarget = null;
      }
    }
  }

  const aAlive = alive(stA).length;
  const bAlive = alive(stB).length;
  const winner = aAlive > bAlive ? "A" : bAlive > aAlive ? "B" : "draw";
  log.push(`  → ${winner === "A" ? "A勝ち" : winner === "B" ? "B勝ち" : "引分"} (A残${aAlive} B残${bAlive})`);
  return { winner, aRemaining: aAlive, bRemaining: bAlive, log };
}

// ── Run simulations ──
const party = bestPartyForSim;
const partySels = bestValidSels;

console.log(`\nパーティ: ${party.map(n => `${jaName(n)}[${poolItems.get(n)}]`).join(" / ")}`);
console.log(`有効選出: ${partySels.length}通り\n`);

let simWins = 0, simLosses = 0, simDraws = 0;
const simLossLog: string[] = [];

for (let ti = 0; ti < simOppTeams.length; ti++) {
  const opp = simOppTeams[ti];
  console.log(`\n── 対戦${ti + 1}: vs ${opp.label} ──`);

  let bestResult: BattleResult | null = null;
  let bestSel: string[] = [];
  for (const sel of partySels) {
    const result = simulateBattle(sel, opp.members);
    if (!bestResult
      || (result.winner === "A" && bestResult.winner !== "A")
      || (result.winner === bestResult.winner && result.aRemaining > bestResult.aRemaining)) {
      bestResult = result;
      bestSel = sel;
    }
  }

  if (bestResult) {
    console.log(`  選出: ${bestSel.map(n => jaName(n)).join(" / ")}`);
    for (const line of bestResult.log) console.log(line);
    if (bestResult.winner === "A") simWins++;
    else if (bestResult.winner === "B") {
      simLosses++;
      simLossLog.push(`★ ${opp.label} — ${bestSel.map(n => jaName(n)).join("+")} で敗北`);
    } else simDraws++;
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log(`=== シミュ結果: ${simWins}勝 ${simLosses}敗 ${simDraws}引分 / ${simOppTeams.length}戦 (${(simWins / simOppTeams.length * 100).toFixed(1)}%) ===`);
if (simLossLog.length > 0) {
  console.log(`敗北:`);
  for (const l of simLossLog) console.log(`  ${l}`);
}
