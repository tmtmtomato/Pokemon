/**
 * team-eval/train.ts — Train team composition → win rate prediction model.
 *
 * Uses 140-dim matchup features (my team + opponent team + cross features)
 * instead of 67-dim team-only features for better predictive power.
 *
 * Trains both logistic regression and GBDT, picks the better one.
 * Outputs model weights + team rankings + feature importance.
 *
 * CLI:  npx tsx home-data/ml/models/team-eval/train.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dataset, TeamEvalOutput } from "../../types.js";
import { trainLogistic, predictLogistic, getLogisticFeatureImportance, serializeLogistic } from "../../lib/logistic.js";
import { trainGBDT, predictGBDT, getGBDTFeatureImportance, serializeGBDT } from "../../lib/gradient-boost.js";
import { kFoldCV, accuracy, logLoss, auc, stratifiedSplit } from "../../lib/evaluation.js";
import { extractMatchupFeatures, MATCHUP_FEATURE_NAMES } from "../../features/matchup-features.js";
import { ratingWeight } from "../../features/replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ML_DIR = resolve(__dirname, "..", "..", "..", "storage", "ml");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Team Evaluation Model Training (Matchup Mode) ===\n");

  // Load selection training data (has both teams per replay)
  console.log("Loading selection training data (for matchup features)...");
  const raw = JSON.parse(
    await readFile(resolve(ML_DIR, "selection-training.json"), "utf-8"),
  );
  const samples: {
    myPreview: string[];
    oppPreview: string[];
    myBrought: string[];
    won: boolean;
    rating: number;
  }[] = raw.samples;
  console.log(`  ${samples.length} samples\n`);

  // Extract 140-dim matchup features
  console.log("Extracting matchup features (140 dims)...");
  const X: Float64Array[] = [];
  const y: number[] = [];
  const w: number[] = [];
  const teamSpeciesList: string[][] = [];

  let processed = 0;
  for (const sample of samples) {
    try {
      const features = await extractMatchupFeatures(sample.myPreview, sample.oppPreview);
      X.push(features);
      y.push(sample.won ? 1 : 0);
      w.push(ratingWeight(sample.rating));
      teamSpeciesList.push(sample.myPreview);
    } catch {
      // skip on error
    }

    processed++;
    if (processed % 2000 === 0) {
      console.log(`  Processed ${processed}/${samples.length} samples...`);
    }
  }
  console.log(`  Total: ${X.length} samples, ${MATCHUP_FEATURE_NAMES.length} features\n`);

  const dataset: Dataset = {
    X,
    y,
    w,
    featureNames: MATCHUP_FEATURE_NAMES,
  };

  // Split
  const { train, val, test } = stratifiedSplit(dataset, 0.15, 0.15);
  console.log(`  Train: ${train.X.length}, Val: ${val.X.length}, Test: ${test.X.length}\n`);

  // --- Logistic Regression ---
  console.log("Training Logistic Regression...");
  const lrModel = trainLogistic(train, val, {
    learningRate: 0.01,
    lambda: 0.001,
    epochs: 150,
    batchSize: 64,
    patience: 15,
    verbose: true,
  });

  const lrPreds = test.X.map((x) => predictLogistic(lrModel, x));
  const lrAcc = accuracy(test.y, lrPreds);
  const lrLoss = logLoss(test.y, lrPreds);
  const lrAuc = auc(test.y, lrPreds);
  console.log(`  LR Test - Acc: ${(lrAcc * 100).toFixed(1)}%, LogLoss: ${lrLoss.toFixed(4)}, AUC: ${lrAuc.toFixed(4)}\n`);

  // --- GBDT ---
  console.log("Training GBDT...");
  const gbdtModel = trainGBDT(train, val, {
    numTrees: 200,
    maxDepth: 5,
    learningRate: 0.1,
    minSamplesLeaf: 10,
    subsampleRate: 0.8,
    featureSubsampleRate: 0.8,
    patience: 25,
    verbose: true,
  });

  const gbdtPreds = test.X.map((x) => predictGBDT(gbdtModel, x));
  const gbdtAcc = accuracy(test.y, gbdtPreds);
  const gbdtLoss = logLoss(test.y, gbdtPreds);
  const gbdtAuc = auc(test.y, gbdtPreds);
  console.log(`  GBDT Test - Acc: ${(gbdtAcc * 100).toFixed(1)}%, LogLoss: ${gbdtLoss.toFixed(4)}, AUC: ${gbdtAuc.toFixed(4)}\n`);

  // --- Cross-validation ---
  console.log("Running 5-fold cross-validation...");
  const cvResult = kFoldCV(dataset, 5, (trainDs, valDs) => {
    // Use the better model type
    if (gbdtAuc > lrAuc) {
      const model = trainGBDT(trainDs, valDs, {
        numTrees: 100,
        maxDepth: 4,
        learningRate: 0.1,
        minSamplesLeaf: 10,
        patience: 15,
      });
      return (x: Float64Array) => predictGBDT(model, x);
    } else {
      const model = trainLogistic(trainDs, valDs, {
        learningRate: 0.01,
        lambda: 0.001,
        epochs: 100,
        batchSize: 64,
      });
      return (x: Float64Array) => predictLogistic(model, x);
    }
  });

  console.log(`  CV Results:`);
  console.log(`    Mean Accuracy: ${(cvResult.meanAccuracy * 100).toFixed(1)}% ± ${(cvResult.stdAccuracy * 100).toFixed(1)}%`);
  console.log(`    Mean AUC:      ${cvResult.meanAuc.toFixed(4)} ± ${cvResult.stdAuc.toFixed(4)}`);
  console.log(`    Mean LogLoss:  ${cvResult.meanLogLoss.toFixed(4)} ± ${cvResult.stdLogLoss.toFixed(4)}\n`);

  // --- Feature Importance ---
  const useBest = gbdtAuc > lrAuc ? "gbdt" : "logistic";
  const featureImportance = useBest === "gbdt"
    ? getGBDTFeatureImportance(gbdtModel)
    : getLogisticFeatureImportance(lrModel);

  console.log("Top 20 Features:");
  for (const fi of featureImportance.slice(0, 20)) {
    console.log(`  ${fi.name}: ${fi.importance.toFixed(4)}`);
  }
  console.log();

  // --- Team Rankings ---
  console.log("Computing team rankings...");
  const teamMap = new Map<string, { species: string[]; preds: number[]; won: number; count: number }>();
  for (let i = 0; i < X.length; i++) {
    const key = teamSpeciesList[i].join(" / ");
    if (!teamMap.has(key)) {
      teamMap.set(key, { species: teamSpeciesList[i], preds: [], won: 0, count: 0 });
    }
    const entry = teamMap.get(key)!;
    const pred = useBest === "gbdt"
      ? predictGBDT(gbdtModel, dataset.X[i])
      : predictLogistic(lrModel, dataset.X[i]);
    entry.preds.push(pred);
    if (y[i] === 1) entry.won++;
    entry.count++;
  }

  const teamRankings = [...teamMap.values()]
    .filter((t) => t.count >= 5)
    .map((t) => ({
      species: t.species,
      key: t.species.join(" / "),
      predictedWinRate: t.preds.reduce((a, b) => a + b, 0) / t.preds.length,
      count: t.count,
      observedWinRate: t.won / t.count,
    }))
    .sort((a, b) => b.predictedWinRate - a.predictedWinRate);

  console.log(`  ${teamRankings.length} teams with 5+ observations\n`);
  console.log("Top 10 Teams (by predicted win rate):");
  for (const t of teamRankings.slice(0, 10)) {
    console.log(`  ${(t.predictedWinRate * 100).toFixed(1)}% pred / ${(t.observedWinRate * 100).toFixed(1)}% obs (n=${t.count}) — ${t.key}`);
  }

  // --- Save output ---
  await mkdir(ML_DIR, { recursive: true });

  const output: TeamEvalOutput = {
    generatedAt: new Date().toISOString(),
    modelType: useBest as "logistic" | "gbdt",
    metrics: cvResult,
    featureImportance,
    teamRankings: teamRankings.slice(0, 200),
  };

  await writeFile(resolve(ML_DIR, "team-eval-model.json"), JSON.stringify(output, null, 2));
  console.log("\nSaved team-eval-model.json");

  // Save raw model for inference
  const modelData = useBest === "gbdt"
    ? { type: "gbdt", model: serializeGBDT(gbdtModel) }
    : { type: "logistic", model: serializeLogistic(lrModel) };
  await writeFile(resolve(ML_DIR, "team-eval-weights.json"), JSON.stringify(modelData, null, 0));
  console.log("Saved team-eval-weights.json");

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
