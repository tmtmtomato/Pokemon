/**
 * move-advisor/train.ts — Train the move quality / bad play detection model.
 *
 * Uses outcome-conditioned scoring: P(win | move chosen in this context).
 * GBDT on ~20 game-state features extracted from replay events.
 *
 * CLI:  npx tsx home-data/ml/models/move-advisor/train.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dataset, MoveAdvisorOutput } from "../../types.js";
import { trainGBDT, predictGBDT, getGBDTFeatureImportance, serializeGBDT } from "../../lib/gradient-boost.js";
import { accuracy, logLoss, auc, stratifiedSplit, kFoldCV } from "../../lib/evaluation.js";
import { MOVE_FEATURE_NAMES, MOVE_FEATURE_DIM } from "../../features/game-state-features.js";
import { loadReplays, VGC_DOUBLES_TIERS, ratingWeight, getAvgRating } from "../../features/replay-walker.js";
import { extractMoveFeatures } from "../../features/game-state-features.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ML_DIR = resolve(__dirname, "..", "..", "..", "storage", "ml");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Move Advisor Model Training ===\n");

  // Load replays directly (action-training.json only has basic info,
  // we need the full feature vectors from game state)
  console.log("Loading replays and extracting move features...");
  const replays = await loadReplays({
    tiers: VGC_DOUBLES_TIERS,
    requireWinner: true,
    doublesOnly: true,
  });
  console.log(`  Loaded ${replays.length} replays\n`);

  const X: Float64Array[] = [];
  const y: number[] = [];
  const w: number[] = [];
  const moveNames: string[] = [];
  const actorSpecies: string[] = [];

  let processed = 0;
  for (const replay of replays) {
    try {
      const features = await extractMoveFeatures(replay);
      const avgRating = getAvgRating(replay);
      const weight = ratingWeight(avgRating);

      for (const mf of features) {
        X.push(mf.features);
        y.push(mf.won ? 1 : 0);
        w.push(weight);
        moveNames.push(mf.moveUsed);
        actorSpecies.push(mf.actor);
      }
    } catch {
      // skip malformed replays
    }

    processed++;
    if (processed % 2000 === 0) {
      console.log(`  Processed ${processed}/${replays.length} replays (${X.length} actions)...`);
    }
  }
  console.log(`  Total action samples: ${X.length}\n`);

  const dataset: Dataset = {
    X,
    y,
    w,
    featureNames: MOVE_FEATURE_NAMES,
  };

  // Split
  const { train, val, test } = stratifiedSplit(dataset, 0.15, 0.15);
  console.log(`  Train: ${train.X.length}, Val: ${val.X.length}, Test: ${test.X.length}\n`);

  // --- Train GBDT ---
  console.log("Training GBDT...");
  const model = trainGBDT(train, val, {
    numTrees: 120,
    maxDepth: 5,
    learningRate: 0.1,
    minSamplesLeaf: 20,
    subsampleRate: 0.8,
    featureSubsampleRate: 0.8,
    verbose: true,
  });

  // --- Evaluate ---
  console.log("\nEvaluating on test set...");
  const testPreds = test.X.map((x) => predictGBDT(model, x));
  const testAcc = accuracy(test.y, testPreds);
  const testLoss = logLoss(test.y, testPreds);
  const testAuc = auc(test.y, testPreds);
  console.log(`  Accuracy:  ${(testAcc * 100).toFixed(1)}%`);
  console.log(`  LogLoss:   ${testLoss.toFixed(4)}`);
  console.log(`  AUC:       ${testAuc.toFixed(4)}\n`);

  // --- Feature Importance ---
  const featureImportance = getGBDTFeatureImportance(model);
  console.log("Top 15 Features:");
  for (const fi of featureImportance.slice(0, 15)) {
    console.log(`  ${fi.name}: ${fi.importance.toFixed(4)}`);
  }
  console.log();

  // --- Species-level move quality ---
  console.log("Computing per-species move quality...");
  const speciesMoveMap = new Map<string, Map<string, { total: number; winScore: number }>>();

  for (let i = 0; i < X.length; i++) {
    const species = actorSpecies[i];
    const move = moveNames[i];
    const score = predictGBDT(model, X[i]);

    if (!speciesMoveMap.has(species)) speciesMoveMap.set(species, new Map());
    const moveMap = speciesMoveMap.get(species)!;
    if (!moveMap.has(move)) moveMap.set(move, { total: 0, winScore: 0 });
    const entry = moveMap.get(move)!;
    entry.total++;
    entry.winScore += score;
  }

  const speciesMoveQuality = [...speciesMoveMap.entries()]
    .map(([species, moveMap]) => ({
      species,
      moves: [...moveMap.entries()]
        .map(([name, data]) => ({
          name,
          avgScore: data.winScore / data.total,
          usageCount: data.total,
        }))
        .sort((a, b) => b.avgScore - a.avgScore),
    }))
    .sort((a, b) => b.moves[0]?.avgScore - a.moves[0]?.avgScore);

  console.log(`  ${speciesMoveQuality.length} species analyzed\n`);

  // --- Common bad play patterns ---
  console.log("Identifying common bad play patterns...");
  const badPlayPatterns = identifyBadPlays(X, y, moveNames, actorSpecies, model);
  for (const bp of badPlayPatterns.slice(0, 10)) {
    console.log(`  ${bp.description} (freq: ${bp.frequency}, severity: ${bp.avgSeverity.toFixed(3)})`);
  }

  // --- Save ---
  await mkdir(ML_DIR, { recursive: true });

  const output: MoveAdvisorOutput = {
    generatedAt: new Date().toISOString(),
    totalReplays: replays.length,
    totalActions: X.length,
    metrics: { accuracy: testAcc, logLoss: testLoss, auc: testAuc },
    featureImportance,
    speciesMoveQuality: speciesMoveQuality.slice(0, 50),
    commonBadPlays: badPlayPatterns.slice(0, 20),
  };

  await writeFile(resolve(ML_DIR, "move-advisor-model.json"), JSON.stringify(output, null, 2));
  console.log("\nSaved move-advisor-model.json");

  // Save model weights
  await writeFile(
    resolve(ML_DIR, "move-advisor-weights.json"),
    JSON.stringify({ type: "gbdt", model: serializeGBDT(model) }, null, 0),
  );
  console.log("Saved move-advisor-weights.json");

  console.log("\n=== Done ===");
}

// ---------------------------------------------------------------------------
// Bad play detection
// ---------------------------------------------------------------------------

// Moves that are strategically valuable despite low base power / non-STAB.
// These should never be flagged as "bad plays" by the pattern detector.
const UTILITY_MOVES = new Set([
  "Fake Out", "Follow Me", "Rage Powder", "Helping Hand", "Tailwind",
  "Trick Room", "Wide Guard", "Quick Guard", "Ally Switch", "Parting Shot",
  "U-turn", "Volt Switch", "Icy Wind", "Electroweb", "Snarl",
  "Encore", "Taunt", "Will-O-Wisp", "Thunder Wave", "Haze",
  "Coaching", "Decorate", "Safeguard", "Imprison",
]);

function identifyBadPlays(
  X: Float64Array[],
  y: number[],
  moveNames: string[],
  actors: string[],
  model: any,
): MoveAdvisorOutput["commonBadPlays"] {
  // Aggregate: for losing moves with low predicted score, look for patterns
  const patterns = new Map<string, { count: number; totalSeverity: number }>();

  for (let i = 0; i < X.length; i++) {
    if (y[i] === 1) continue; // only analyze losing moves

    const score = predictGBDT(model, X[i]);
    if (score >= 0.4) continue; // not bad enough

    const severity = 0.5 - score; // how bad (0 = borderline, 0.5 = terrible)

    // Feature indices (from MOVE_FEATURE_NAMES):
    // [0] type_eff_vs_target  [1] is_stab       [2] is_physical
    // [3] is_special          [4] base_power     [5] is_status
    // [6] is_protect          [7] turn_normalized [8] faint_differential
    // [9] my_remaining        [10] opp_remaining  [11] partner_active
    // [12] speed_relative     [13] moved_first    [14] weather_favorable
    // [15] consecutive_protects [16] move_repeated [17] is_priority
    // [18] is_spread          [19] is_switch

    const features = X[i];
    const move = moveNames[i];
    const actor = actors[i];
    const descriptions: string[] = [];

    // Skip utility/support moves from non-STAB/low-power patterns
    const isUtility = UTILITY_MOVES.has(move);
    const isPriority = features[17] > 0;

    // Protect when winning (and not as a strategic stall)
    if (features[6] === 1 && features[8] > 0.25) {
      descriptions.push(`${actor}: Protect while clearly ahead`);
    }

    // Non-STAB low-power move (excluding priority and utility moves)
    if (features[1] === 0 && features[4] < 0.4 && features[5] === 0
        && !isPriority && !isUtility && features[4] > 0) {
      descriptions.push(`${actor}: Non-STAB low-power ${move}`);
    }

    // Using spread move when only one opponent remaining
    if (features[18] === 1 && features[10] <= 0.25) {
      descriptions.push(`${actor}: Spread move (${move}) vs solo opponent`);
    }

    // Consecutive Protect (very high chance of failure)
    if (features[15] > 0) {
      descriptions.push(`${actor}: Consecutive Protect/Detect`);
    }

    // Status move late game while behind (wasting turns)
    if (features[5] === 1 && features[7] > 0.7 && features[8] < -0.1 && !isUtility) {
      descriptions.push(`${actor}: Status move late game while behind`);
    }

    // Attacking partner's weakness (poor target selection proxy)
    if (features[0] < 0.125 && features[4] > 0.3 && !features[5]) {
      // Low type effectiveness + decent power = probably hitting into a resist
      descriptions.push(`${actor}: ${move} into resisted target`);
    }

    for (const desc of descriptions) {
      const entry = patterns.get(desc) ?? { count: 0, totalSeverity: 0 };
      entry.count++;
      entry.totalSeverity += severity;
      patterns.set(desc, entry);
    }
  }

  return [...patterns.entries()]
    .filter(([_, v]) => v.count >= 10) // minimum frequency (raised for quality)
    .map(([description, data]) => ({
      description,
      frequency: data.count,
      avgSeverity: data.totalSeverity / data.count,
    }))
    .sort((a, b) => b.frequency * b.avgSeverity - a.frequency * a.avgSeverity);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
