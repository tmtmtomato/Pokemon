/**
 * party2-turn-sim.ts
 *
 * ターン逐次シミュレーション: HP管理 + 交代判断 + 先手後手
 *
 * ルール:
 * - 3v3、メガ1体制限
 * - ダメージ: matrix の (min+max)/2 を使用
 * - 速度: poolSpeeds で先手後手
 * - 交代: 不利対面で控えに有利ポケモンが居れば交代
 *   - 交代は読めない: 相手は対面相手への bestMove を撃つ
 *   - 交代先は bestMove(対面相手) のタイプ×自タイプ相性で被ダメ推定
 * - KO時: 倒された側が次を出す（最も有利なやつ）
 */
import {
  matchupValue,
  effectiveKoN,
  baseSpecies,
  isSandChipImmune,
  SAND_CHIP_PCT,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, SimEnv } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

type TypeName = Parameters<typeof getEffectiveness>[0];

const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;
const movesJa = JSON.parse(readFileSync("home-data/storage/i18n/moves-ja.json", "utf-8"));
const jaMove = (en: string) => movesJa[en] || en;

const teamMatchup = JSON.parse(
  readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8")
);
const matrix: DamageMatrix = teamMatchup.damageMatrix;
const pool: any[] = teamMatchup.pool;
const allRaw: any[] = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/all-raw.json", "utf-8")
);

const movesJson: Record<string, any> = JSON.parse(
  readFileSync("src/data/moves.json", "utf-8")
);

// ── Pool lookups ──
const poolSpeeds = new Map<string, number>();
const poolTypes = new Map<string, string[]>();
const poolAbilities = new Map<string, string>();
for (const p of pool) {
  poolSpeeds.set(p.name, p.speedStat ?? 0);
  const species = getSpecies(baseSpecies(p.name));
  poolTypes.set(p.name, (species?.types ?? []) as string[]);
  poolAbilities.set(p.name, p.ability ?? "");
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

function getMoveType(moveName: string): string | null {
  return movesJson[moveName]?.type ?? null;
}

// Damage when attacker commits bestMove(vs originalTarget) but hits switchIn
function switchInDamage(attacker: string, originalTarget: string, switchIn: string): number {
  const entry = matrix[attacker]?.[originalTarget];
  if (!entry || entry.maxPct <= 0) return 0;
  const moveType = getMoveType(entry.bestMove);
  if (!moveType) return 0;
  const switchTypes = poolTypes.get(switchIn) ?? [];
  const origTypes = poolTypes.get(originalTarget) ?? [];
  if (switchTypes.length === 0 || origTypes.length === 0) return 0;
  const effSwitch = getEffectiveness(moveType as TypeName, switchTypes as TypeName[]);
  const effOrig = getEffectiveness(moveType as TypeName, origTypes as TypeName[]);
  if (effOrig <= 0) return entry.maxPct * effSwitch; // edge: original was immune somehow
  return (entry.minPct + entry.maxPct) / 2 * (effSwitch / effOrig);
}

// matchupValue shorthand
function mv(a: string, b: string): number {
  return matchupValue(a, b, matrix, poolSpeeds);
}

// ── Battle State ──
interface Fighter {
  name: string;
  hp: number; // 0-100
}

interface BattleResult {
  winner: "A" | "B" | "draw";
  turnsPlayed: number;
  aRemaining: number;
  bRemaining: number;
  log: string[];
}

function simulateBattle(teamA: string[], teamB: string[]): BattleResult {
  const stA: Fighter[] = teamA.map(n => ({ name: n, hp: 100 }));
  const stB: Fighter[] = teamB.map(n => ({ name: n, hp: 100 }));
  let idxA = 0, idxB = 0;
  const log: string[] = [];

  function alive(team: Fighter[]): Fighter[] {
    return team.filter(f => f.hp > 0);
  }
  function aliveBench(team: Fighter[], activeIdx: number): number[] {
    return team.map((f, i) => i).filter(i => i !== activeIdx && team[i].hp > 0);
  }

  // Pick best switch-in from bench against opponent
  function bestSwitch(team: Fighter[], activeIdx: number, oppName: string): number {
    const bench = aliveBench(team, activeIdx);
    if (bench.length === 0) return -1;
    let bestIdx = -1, bestMv = -Infinity;
    for (const bi of bench) {
      const val = mv(team[bi].name, oppName);
      if (val > bestMv) { bestMv = val; bestIdx = bi; }
    }
    return bestMv > 0 ? bestIdx : -1;
  }

  // Should switch? If I'm losing this matchup badly and bench has a counter
  function shouldSwitch(
    myTeam: Fighter[], myIdx: number,
    oppName: string,
  ): number { // returns bench idx or -1
    const me = myTeam[myIdx];
    const myMv = mv(me.name, oppName);
    const oppMv = mv(oppName, me.name);

    // Switch if: I can't do anything (myMv <= 0) AND opponent can KO me (oppMv > 0)
    if (myMv <= 0 && oppMv > 0) {
      const si = bestSwitch(myTeam, myIdx, oppName);
      if (si >= 0) {
        // Check: can switch-in survive the hit?
        const dmg = switchInDamage(oppName, me.name, myTeam[si].name);
        if (myTeam[si].hp - dmg > 0) return si;
      }
    }
    return -1;
  }

  // Pick best Pokemon to send out after KO
  function pickNext(team: Fighter[], activeIdx: number, oppName: string): number {
    const bench = aliveBench(team, activeIdx);
    if (bench.length === 0) return -1;
    let bestIdx = bench[0], bestMv = -Infinity;
    for (const bi of bench) {
      const val = mv(team[bi].name, oppName);
      if (val > bestMv) { bestMv = val; bestIdx = bi; }
    }
    return bestIdx;
  }

  log.push(`=== 対戦開始 ===`);
  log.push(`  A: ${teamA.map(n => jaName(n)).join(" / ")}`);
  log.push(`  B: ${teamB.map(n => jaName(n)).join(" / ")}`);
  log.push(`  先発: ${jaName(stA[0].name)} vs ${jaName(stB[0].name)}`);

  for (let turn = 1; turn <= 30; turn++) {
    if (alive(stA).length === 0 || alive(stB).length === 0) break;

    const a = stA[idxA];
    const b = stB[idxB];
    log.push(`\n--- ターン${turn} ---`);
    log.push(`  ${jaName(a.name)}(HP${a.hp.toFixed(0)}%) vs ${jaName(b.name)}(HP${b.hp.toFixed(0)}%)`);

    // ── Decision phase ──
    const aSwitchTo = shouldSwitch(stA, idxA, b.name);
    const bSwitchTo = shouldSwitch(stB, idxB, a.name);

    // ── Resolve switches (before attacks) ──
    if (aSwitchTo >= 0 && bSwitchTo >= 0) {
      // Both switch — no committed move, just swap
      const oldA = jaName(a.name), oldB = jaName(b.name);
      idxA = aSwitchTo;
      idxB = bSwitchTo;
      log.push(`  A: ${oldA} → ${jaName(stA[idxA].name)} に交代`);
      log.push(`  B: ${oldB} → ${jaName(stB[idxB].name)} に交代`);
      continue;
    }

    if (aSwitchTo >= 0) {
      // A switches, B attacks (committed to bestMove vs A's original)
      const oldA = a.name;
      const oldAja = jaName(oldA);
      idxA = aSwitchTo;
      const newA = stA[idxA];
      const dmg = switchInDamage(b.name, oldA, newA.name);
      const moveName = bestMoveName(b.name, oldA);
      newA.hp = Math.max(0, newA.hp - dmg);
      log.push(`  A: ${oldAja} → ${jaName(newA.name)} に交代`);
      log.push(`  B: ${jaName(b.name)} の ${jaMove(moveName)}! → ${jaName(newA.name)} に ${dmg.toFixed(1)}% (HP${newA.hp.toFixed(0)}%)`);
      if (newA.hp <= 0) {
        log.push(`  ★ ${jaName(newA.name)} 戦闘不能!`);
        const next = pickNext(stA, idxA, b.name);
        if (next < 0) { log.push(`  A の全滅!`); break; }
        idxA = next;
        log.push(`  A: ${jaName(stA[idxA].name)} を繰り出す`);
      }
      continue;
    }

    if (bSwitchTo >= 0) {
      // B switches, A attacks (committed to bestMove vs B's original)
      const oldB = b.name;
      const oldBja = jaName(oldB);
      idxB = bSwitchTo;
      const newB = stB[idxB];
      const dmg = switchInDamage(a.name, oldB, newB.name);
      const moveName = bestMoveName(a.name, oldB);
      newB.hp = Math.max(0, newB.hp - dmg);
      log.push(`  B: ${oldBja} → ${jaName(newB.name)} に交代`);
      log.push(`  A: ${jaName(a.name)} の ${jaMove(moveName)}! → ${jaName(newB.name)} に ${dmg.toFixed(1)}% (HP${newB.hp.toFixed(0)}%)`);
      if (newB.hp <= 0) {
        log.push(`  ★ ${jaName(newB.name)} 戦闘不能!`);
        const next = pickNext(stB, idxB, a.name);
        if (next < 0) { log.push(`  B の全滅!`); break; }
        idxB = next;
        log.push(`  B: ${jaName(stB[idxB].name)} を繰り出す`);
      }
      continue;
    }

    // ── Both attack ──
    const spdA = poolSpeeds.get(a.name) ?? 0;
    const spdB = poolSpeeds.get(b.name) ?? 0;
    const aFirst = spdA >= spdB; // tie goes to A

    const firstAtk = aFirst ? a : b;
    const secondAtk = aFirst ? b : a;
    const firstTarget = aFirst ? b : a;
    const secondTarget = aFirst ? a : b;
    const firstIsA = aFirst;

    // First attack
    const dmg1 = avgDamage(firstAtk.name, firstTarget.name);
    const move1 = bestMoveName(firstAtk.name, firstTarget.name);
    firstTarget.hp = Math.max(0, firstTarget.hp - dmg1);
    const side1 = firstIsA ? "A" : "B";
    log.push(`  ${side1}: ${jaName(firstAtk.name)} の ${jaMove(move1)}! → ${dmg1.toFixed(1)}% (${jaName(firstTarget.name)} HP${firstTarget.hp.toFixed(0)}%)`);

    if (firstTarget.hp <= 0) {
      log.push(`  ★ ${jaName(firstTarget.name)} 戦闘不能!`);
      const targetIsA = !firstIsA;
      if (targetIsA) {
        const next = pickNext(stA, idxA, firstAtk.name);
        if (next < 0) { log.push(`  A の全滅!`); break; }
        idxA = next;
        log.push(`  A: ${jaName(stA[idxA].name)} を繰り出す`);
      } else {
        const next = pickNext(stB, idxB, firstAtk.name);
        if (next < 0) { log.push(`  B の全滅!`); break; }
        idxB = next;
        log.push(`  B: ${jaName(stB[idxB].name)} を繰り出す`);
      }
      continue; // KO'd side doesn't get to attack
    }

    // Second attack
    const dmg2 = avgDamage(secondAtk.name, secondTarget.name);
    const move2 = bestMoveName(secondAtk.name, secondTarget.name);
    secondTarget.hp = Math.max(0, secondTarget.hp - dmg2);
    const side2 = firstIsA ? "B" : "A";
    log.push(`  ${side2}: ${jaName(secondAtk.name)} の ${jaMove(move2)}! → ${dmg2.toFixed(1)}% (${jaName(secondTarget.name)} HP${secondTarget.hp.toFixed(0)}%)`);

    if (secondTarget.hp <= 0) {
      log.push(`  ★ ${jaName(secondTarget.name)} 戦闘不能!`);
      if (firstIsA) {
        // A was second target → A got KO'd
        const next = pickNext(stA, idxA, secondAtk.name);
        if (next < 0) { log.push(`  A の全滅!`); break; }
        idxA = next;
        log.push(`  A: ${jaName(stA[idxA].name)} を繰り出す`);
      } else {
        const next = pickNext(stB, idxB, secondAtk.name);
        if (next < 0) { log.push(`  B の全滅!`); break; }
        idxB = next;
        log.push(`  B: ${jaName(stB[idxB].name)} を繰り出す`);
      }
    }
  }

  const aAlive = alive(stA).length;
  const bAlive = alive(stB).length;
  const winner = aAlive > bAlive ? "A" : bAlive > aAlive ? "B" : "draw";

  log.push(`\n=== 結果: ${winner === "A" ? "A の勝ち!" : winner === "B" ? "B の勝ち!" : "引き分け"} ===`);
  log.push(`  A残: ${aAlive}体 (${alive(stA).map(f => `${jaName(f.name)}${f.hp.toFixed(0)}%`).join(", ")})`);
  log.push(`  B残: ${bAlive}体 (${alive(stB).map(f => `${jaName(f.name)}${f.hp.toFixed(0)}%`).join(", ")})`);

  return { winner, turnsPlayed: 0, aRemaining: aAlive, bRemaining: bAlive, log };
}

// ── Generate realistic opponent teams ──
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

function isMega(name: string): boolean { return name.endsWith("-Mega"); }
function megaCount(names: string[]): number { return names.filter(n => isMega(n)).length; }

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
      // Opponent also follows mega-1 limit
      if (megaCount(team) > 1) continue;
      const w = Math.sqrt(Math.max(1, 51 - (ri + 1))) / Math.sqrt(50)
        * (1 + (topPartners[pj][1] + topPartners[pk][1]) / 10);
      oppTeams.push({ members: team, weight: w, label: team.map(t => jaName(t)).join(" + ") });
    }
  }
}
const seen = new Set<string>();
const uniqueOppTeams = oppTeams.filter(t => {
  const key = [...t.members].sort().join(",");
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}).sort((a, b) => b.weight - a.weight);

// ── Our party ──
const PARTY = ["Floette-Mega", "Typhlosion", "Basculegion-F", "Gallade", "Starmie-Mega", "Glimmora-Mega"];

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

const validSelections = combinations(PARTY, 3).filter(sel => megaCount(sel) <= 1);

console.log(`=== ターン逐次シミュレーション ===`);
console.log(`パーティ: ${PARTY.map(n => jaName(n)).join(" / ")}`);
console.log(`有効選出: ${validSelections.length}通り`);
console.log(`仮想対戦チーム: ${uniqueOppTeams.length}パターン (メガ1体制限)\n`);

// Simulate against top 5 opponent teams
const simCount = Math.min(5, uniqueOppTeams.length);
for (let ti = 0; ti < simCount; ti++) {
  const opp = uniqueOppTeams[ti];
  console.log(`\n${"═".repeat(60)}`);
  console.log(`対戦${ti + 1}: vs ${opp.label} (重み${opp.weight.toFixed(2)})`);
  console.log(`${"═".repeat(60)}`);

  // Find best selection
  let bestResult: BattleResult | null = null;
  let bestSel: string[] = [];

  for (const sel of validSelections) {
    const result = simulateBattle(sel, opp.members);
    if (!bestResult
      || (result.winner === "A" && bestResult.winner !== "A")
      || (result.winner === bestResult.winner && result.aRemaining > bestResult.aRemaining)) {
      bestResult = result;
      bestSel = sel;
    }
  }

  if (bestResult) {
    console.log(`\n選出: ${bestSel.map(n => jaName(n)).join(" / ")}`);
    for (const line of bestResult.log) {
      console.log(line);
    }
  }
}

// ── Summary: run all opponent teams ──
console.log(`\n\n${"═".repeat(60)}`);
console.log(`=== 全${uniqueOppTeams.length}チーム対戦サマリー ===`);
console.log(`${"═".repeat(60)}`);

let totalWins = 0, totalLosses = 0, totalDraws = 0;
const lossLog: { opp: string; aRem: number; bRem: number }[] = [];

for (const opp of uniqueOppTeams) {
  let bestResult: BattleResult | null = null;
  for (const sel of validSelections) {
    const result = simulateBattle(sel, opp.members);
    if (!bestResult
      || (result.winner === "A" && bestResult.winner !== "A")
      || (result.winner === bestResult.winner && result.aRemaining > bestResult.aRemaining)) {
      bestResult = result;
    }
  }
  if (bestResult) {
    if (bestResult.winner === "A") totalWins++;
    else if (bestResult.winner === "B") {
      totalLosses++;
      lossLog.push({ opp: opp.label, aRem: bestResult.aRemaining, bRem: bestResult.bRemaining });
    }
    else totalDraws++;
  }
}

console.log(`\n${totalWins}勝 ${totalLosses}敗 ${totalDraws}引分 / ${uniqueOppTeams.length}戦 (勝率${(totalWins / uniqueOppTeams.length * 100).toFixed(1)}%)`);
if (lossLog.length > 0) {
  console.log(`\n敗北マッチアップ:`);
  for (const l of lossLog) {
    console.log(`  ★ ${l.opp} (A残${l.aRem} B残${l.bRem})`);
  }
}
