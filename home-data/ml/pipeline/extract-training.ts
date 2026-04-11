/**
 * extract-training.ts — Main pipeline: replays → training data JSON.
 *
 * Reads all parsed VGC doubles replays and produces three training datasets:
 *   1. team-eval-training.json   — Team composition → win/loss
 *   2. selection-training.json   — My 6 + Opp 6 → brought 4 + win/loss
 *   3. action-training.json      — Per-turn move events + win/loss
 *
 * CLI:  npx tsx home-data/ml/pipeline/extract-training.ts [--max N]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedReplay } from "../../types/replay.js";
import type {
  ActionSample,
  SelectionSample,
  TeamEvalSample,
  TrainingData,
} from "../types.js";
import { extractTeamFeatures, TEAM_FEATURE_NAMES } from "../features/team-features.js";
import { extractMoveFeatures } from "../features/game-state-features.js";
import {
  getAvgRating,
  loadReplays,
  normalizeMega,
  ratingWeight,
  VGC_DOUBLES_TIERS,
} from "../features/replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = resolve(__dirname, "..", "..", "storage", "ml");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const maxReplaysArg = args.indexOf("--max");
const maxReplays = maxReplaysArg >= 0 ? parseInt(args[maxReplaysArg + 1], 10) : undefined;

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== ML Training Data Extraction ===\n");

  // Load replays
  console.log("Loading replays...");
  const replays = await loadReplays({
    tiers: VGC_DOUBLES_TIERS,
    requireWinner: true,
    doublesOnly: true,
    maxReplays,
  });
  console.log(`  Loaded ${replays.length} doubles replays with winners\n`);

  // Extract team eval + selection data
  console.log("Extracting team eval & selection features...");
  const teamEvalSamples: TeamEvalSample[] = [];
  const selectionSamples: SelectionSample[] = [];

  let processedReplays = 0;
  for (const replay of replays) {
    const result = await extractTeamAndSelection(replay);
    if (result) {
      teamEvalSamples.push(...result.teamEval);
      selectionSamples.push(...result.selection);
    }
    processedReplays++;
    if (processedReplays % 1000 === 0) {
      console.log(`  Processed ${processedReplays}/${replays.length} replays...`);
    }
  }
  console.log(`  Team eval samples: ${teamEvalSamples.length}`);
  console.log(`  Selection samples: ${selectionSamples.length}\n`);

  // Extract action data
  console.log("Extracting move/action features...");
  const actionSamples: ActionSample[] = [];
  let actionReplayCount = 0;

  for (const replay of replays) {
    try {
      const moveFeatures = await extractMoveFeatures(replay);
      for (const mf of moveFeatures) {
        actionSamples.push({
          turn: mf.turn,
          activeMon: mf.actor,
          partner: null, // set below if we can infer
          oppActive: [],
          moveUsed: mf.moveUsed,
          target: mf.target,
          myRemaining: [],
          oppRemaining: [],
          weather: null,
          field: null,
          turnInGame: mf.turn,
          totalTurns: mf.totalTurns,
          won: mf.won,
          rating: getAvgRating(replay),
          tier: replay.tierKey,
        });
      }
    } catch {
      // skip replays with parsing issues
    }
    actionReplayCount++;
    if (actionReplayCount % 2000 === 0) {
      console.log(`  Processed ${actionReplayCount}/${replays.length} replays for actions...`);
    }
  }
  console.log(`  Action samples: ${actionSamples.length}\n`);

  // Save outputs
  await mkdir(OUTPUT_DIR, { recursive: true });

  const trainingData: TrainingData = {
    generatedAt: new Date().toISOString(),
    tiers: VGC_DOUBLES_TIERS,
    totalReplays: replays.length,
    teamEval: teamEvalSamples,
    selection: selectionSamples,
    actions: actionSamples,
  };

  // Save as separate files for memory efficiency
  console.log("Saving training data...");

  await writeFile(
    resolve(OUTPUT_DIR, "team-eval-training.json"),
    JSON.stringify({
      generatedAt: trainingData.generatedAt,
      totalReplays: trainingData.totalReplays,
      totalSamples: teamEvalSamples.length,
      featureNames: TEAM_FEATURE_NAMES,
      samples: teamEvalSamples,
    }, null, 0),
  );
  console.log(`  Saved team-eval-training.json (${teamEvalSamples.length} samples)`);

  await writeFile(
    resolve(OUTPUT_DIR, "selection-training.json"),
    JSON.stringify({
      generatedAt: trainingData.generatedAt,
      totalReplays: trainingData.totalReplays,
      totalSamples: selectionSamples.length,
      samples: selectionSamples,
    }, null, 0),
  );
  console.log(`  Saved selection-training.json (${selectionSamples.length} samples)`);

  await writeFile(
    resolve(OUTPUT_DIR, "action-training.json"),
    JSON.stringify({
      generatedAt: trainingData.generatedAt,
      totalReplays: trainingData.totalReplays,
      totalSamples: actionSamples.length,
      samples: actionSamples,
    }, null, 0),
  );
  console.log(`  Saved action-training.json (${actionSamples.length} samples)`);

  console.log("\n=== Done ===");
}

// ---------------------------------------------------------------------------
// Per-replay extraction
// ---------------------------------------------------------------------------

async function extractTeamAndSelection(replay: ParsedReplay): Promise<{
  teamEval: TeamEvalSample[];
  selection: SelectionSample[];
} | null> {
  if (!replay.winner || replay.teams.length !== 2) return null;

  const winnerSide = replay.players.find((p) => p.name === replay.winner)?.side;
  if (!winnerSide) return null;

  const avgRating = getAvgRating(replay);
  const teamEval: TeamEvalSample[] = [];
  const selection: SelectionSample[] = [];

  for (const team of replay.teams) {
    const isWinner = team.side === winnerSide;
    const preview = team.preview.map((m) => normalizeMega(m.species)).sort();
    const brought = team.brought.map((m) => normalizeMega(m.species)).sort();

    if (preview.length !== 6) continue;
    if (brought.length < 1) continue;

    // Team eval sample
    try {
      const features = await extractTeamFeatures(preview);
      teamEval.push({
        teamSpecies: preview,
        features: Array.from(features),
        won: isWinner,
        rating: avgRating,
        tier: replay.tierKey,
      });
    } catch {
      // skip on feature extraction error
    }

    // Selection sample
    const oppTeam = replay.teams.find((t) => t.side !== team.side);
    if (oppTeam && oppTeam.preview.length === 6) {
      const oppPreview = oppTeam.preview.map((m) => normalizeMega(m.species)).sort();
      selection.push({
        myPreview: preview,
        oppPreview: oppPreview,
        myBrought: brought,
        won: isWinner,
        rating: avgRating,
        tier: replay.tierKey,
      });
    }
  }

  return { teamEval, selection };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
