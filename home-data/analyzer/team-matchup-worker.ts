/**
 * team-matchup-worker.ts
 *
 * Worker thread for parallel execution of CPU-intensive phases:
 * - 'matchups': Round-robin matchup evaluation (Phase 4/7)
 * - 'cores':    3-core scoring against meta representatives (Phase 5)
 *
 * Receives shared read-only data via workerData on init, then
 * processes tasks via parentPort messages.
 */

import { parentPort, workerData } from "node:worker_threads";
import {
  evaluate3v3,
  selectTeam,
  effectiveKoN,
  mulberry32,
  MinHeap,
  baseSpecies,
  deserializeSimEnv,
} from "./team-matchup-core.ts";
import type {
  DamageMatrix,
  SimEnv,
  MetaRepresentative,
  MetaPokemon,
} from "./team-matchup-core.ts";
import type { Team } from "../types/team-matchup.ts";

// ── Initialize shared data from workerData ───────────────────────────────────

const matrix: DamageMatrix = workerData.matrix;
const simEnv: SimEnv = deserializeSimEnv(workerData.simEnv);
const megaCapableArr: string[] = workerData.megaCapable;
const megaCapable = new Set(megaCapableArr);

// ── Task handlers ──────────────────────────────────────────────────────────

interface MatchupsTask {
  type: "matchups";
  teams: Team[];
  startIdx: number;
  endIdx: number;
  gamesPerTeam: number;
  seed: number;
}

/** Aggregated per-pokemon selection statistics (replaces raw logs) */
interface SelectionAgg {
  timesInTeam: number;
  timesSelected: number;
  winsWhenSelected: number;
  partnerCounts: Record<string, number>;
}

interface MatchupsResult {
  type: "matchups";
  wins: number[];
  losses: number[];
  draws: number[];
  scoreSum: number[];
  // selections: Map<teamIdx, Map<selectionKey, {count, wins}>> serialized as array
  selections: [number, [string, { count: number; wins: number }][]][];
  // per-pokemon aggregated selection stats (replaces raw selectionLog)
  selectionAgg: [string, SelectionAgg][];
}

function handleMatchups(task: MatchupsTask): MatchupsResult {
  const { teams, startIdx, endIdx, gamesPerTeam, seed } = task;
  const totalLen = teams.length;
  const rng = mulberry32(seed);

  // Per-team tracking (only for our range but indexed by absolute team index)
  const wins: number[] = new Array(totalLen).fill(0);
  const losses: number[] = new Array(totalLen).fill(0);
  const draws: number[] = new Array(totalLen).fill(0);
  const scoreSum: number[] = new Array(totalLen).fill(0);
  const teamSelections = new Map<number, Map<string, { count: number; wins: number }>>();
  const selAgg = new Map<string, SelectionAgg>();

  for (let ti = startIdx; ti < endIdx; ti++) {
    const myTeam = teams[ti];
    const selMap = new Map<string, { count: number; wins: number }>();
    teamSelections.set(ti, selMap);

    for (let g = 0; g < gamesPerTeam; g++) {
      let oi = ti;
      while (oi === ti) oi = Math.floor(rng() * totalLen);
      const oppTeam = teams[oi];

      const selA = selectTeam(myTeam.members, oppTeam.members, matrix, megaCapable, simEnv.poolSpeeds);
      const selB = selectTeam(oppTeam.members, myTeam.members, matrix, megaCapable, simEnv.poolSpeeds);
      const result = evaluate3v3(selA.members, selB.members, matrix, simEnv);

      if (result.winner === "A") {
        wins[ti]++;
        losses[oi]++;
      } else if (result.winner === "B") {
        losses[ti]++;
        wins[oi]++;
      } else {
        draws[ti]++;
        draws[oi]++;
      }

      scoreSum[ti] += result.scoreA;

      // Record selections for evaluator team (ti)
      const selKey = [...selA.members].sort().join("+");
      const existing = selMap.get(selKey) ?? { count: 0, wins: 0 };
      existing.count++;
      if (result.winner === "A") existing.wins++;
      selMap.set(selKey, existing);

      // Record selections for opponent team (oi) — keeps denominator consistent with W+L+D
      let oppSelMap = teamSelections.get(oi);
      if (!oppSelMap) { oppSelMap = new Map(); teamSelections.set(oi, oppSelMap); }
      const oppSelKey = [...selB.members].sort().join("+");
      const oppExisting = oppSelMap.get(oppSelKey) ?? { count: 0, wins: 0 };
      oppExisting.count++;
      if (result.winner === "B") oppExisting.wins++;
      oppSelMap.set(oppSelKey, oppExisting);

      // Aggregate per-pokemon selection stats (no raw logs)
      const won = result.winner === "A";
      for (const name of myTeam.members) {
        let agg = selAgg.get(name);
        if (!agg) { agg = { timesInTeam: 0, timesSelected: 0, winsWhenSelected: 0, partnerCounts: {} }; selAgg.set(name, agg); }
        agg.timesInTeam++;
        if (selA.members.includes(name)) {
          agg.timesSelected++;
          if (won) agg.winsWhenSelected++;
          for (const partner of selA.members) {
            if (partner !== name) agg.partnerCounts[partner] = (agg.partnerCounts[partner] ?? 0) + 1;
          }
        }
      }
    }
  }

  // Serialize Maps for transfer
  const selectionsArr: [number, [string, { count: number; wins: number }][]][] = [];
  for (const [ti, selMap] of teamSelections) {
    selectionsArr.push([ti, [...selMap.entries()]]);
  }

  return {
    type: "matchups",
    wins,
    losses,
    draws,
    scoreSum,
    selections: selectionsArr,
    selectionAgg: [...selAgg.entries()],
  };
}

interface CoresTask {
  type: "cores";
  speciesStart: number;
  speciesEnd: number;
  speciesKeys: string[];
  speciesGroups: [string, string[]][];
  metaReps: MetaRepresentative[];
  topK: number;
}

interface CoresResult {
  type: "cores";
  topItems: { score: number; item: string[] }[];
  pokemonAcc: [string, { scoreSum: number; count: number; maxScore: number }][];
  pairAcc: [string, { scoreSum: number; count: number }][];
  totalCores: number;
}

function handleCores(task: CoresTask): CoresResult {
  const { speciesStart, speciesEnd, speciesKeys, metaReps, topK } = task;
  const speciesGroups = new Map(task.speciesGroups);
  const S = speciesKeys.length;

  const pokemonAcc = new Map<string, { scoreSum: number; count: number; maxScore: number }>();
  const pairAcc = new Map<string, { scoreSum: number; count: number }>();
  const heap = new MinHeap<string[]>(topK);
  let totalCores = 0;

  for (let i = speciesStart; i < speciesEnd && i < S - 2; i++) {
    const formsI = speciesGroups.get(speciesKeys[i])!;
    for (let j = i + 1; j < S - 1; j++) {
      const formsJ = speciesGroups.get(speciesKeys[j])!;
      for (let k = j + 1; k < S; k++) {
        const formsK = speciesGroups.get(speciesKeys[k])!;

        for (const fi of formsI) {
          const mi = megaCapable.has(fi) ? 1 : 0;
          for (const fj of formsJ) {
            const mj = mi + (megaCapable.has(fj) ? 1 : 0);
            if (mj > 1) continue;
            for (const fk of formsK) {
              if (mj + (megaCapable.has(fk) ? 1 : 0) > 1) continue;

              const trio = [fi, fj, fk];
              let weightedScore = 0;

              for (const rep of metaReps) {
                const result = evaluate3v3(trio, rep.members, matrix, simEnv);
                if (result.winner === "A") weightedScore += rep.weight;
                else if (result.winner === "draw") weightedScore += rep.weight * 0.5;
              }

              heap.push(weightedScore, [...trio]);
              totalCores++;

              for (const name of trio) {
                let acc = pokemonAcc.get(name);
                if (!acc) { acc = { scoreSum: 0, count: 0, maxScore: 0 }; pokemonAcc.set(name, acc); }
                acc.scoreSum += weightedScore;
                acc.count++;
                if (weightedScore > acc.maxScore) acc.maxScore = weightedScore;
              }

              const pairs = [`${fi}|${fj}`, `${fi}|${fk}`, `${fj}|${fk}`];
              for (const pairKey of pairs) {
                const existing = pairAcc.get(pairKey);
                if (existing) { existing.scoreSum += weightedScore; existing.count++; }
                else pairAcc.set(pairKey, { scoreSum: weightedScore, count: 1 });
              }
            }
          }
        }
      }
    }
  }

  return {
    type: "cores",
    topItems: heap.toSorted().map(({ score, item }) => ({ score, item })),
    pokemonAcc: [...pokemonAcc.entries()],
    pairAcc: [...pairAcc.entries()],
    totalCores,
  };
}

// ── Message handler ────────────────────────────────────────────────────────

parentPort!.on("message", (task: MatchupsTask | CoresTask) => {
  let result: MatchupsResult | CoresResult;
  if (task.type === "matchups") {
    result = handleMatchups(task);
  } else if (task.type === "cores") {
    result = handleCores(task);
  } else {
    throw new Error(`Unknown task type: ${(task as any).type}`);
  }
  parentPort!.postMessage(result);
});
