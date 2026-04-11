/**
 * selection/train.ts — Train the selection prediction model.
 *
 * Per-mon binary classification: for each of my 6 Pokemon,
 * predict P(bring this mon | my team, opponent team).
 *
 * Uses GBDT as the primary model.
 *
 * CLI:  npx tsx home-data/ml/models/selection/train.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dataset, SelectionOutput } from "../../types.js";
import { trainGBDT, predictGBDT, getGBDTFeatureImportance, serializeGBDT } from "../../lib/gradient-boost.js";
import { trainLogistic, predictLogistic, getLogisticFeatureImportance } from "../../lib/logistic.js";
import { kFoldCV, accuracy, logLoss, auc } from "../../lib/evaluation.js";
import { createRng } from "../../lib/matrix.js";
import { buildEmbeddingIndex } from "../../features/species-embedding.js";
import { extractPerMonFeatures, PER_MON_FEATURE_NAMES } from "../../features/matchup-features.js";
import { ratingWeight } from "../../features/replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ML_DIR = resolve(__dirname, "..", "..", "..", "storage", "ml");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Selection Prediction Model Training ===\n");

  // Load selection training data
  console.log("Loading selection training data...");
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
  console.log(`  ${samples.length} selection decisions\n`);

  // Build embedding index
  console.log("Building species embedding index...");
  const embeddingIndex = await buildEmbeddingIndex();
  console.log(`  ${embeddingIndex.speciesList.length} species embedded\n`);

  // Split at SAMPLE level first to prevent data leakage
  // (same replay's 6 mons must stay in same split)
  console.log("Splitting samples at replay level (preventing data leakage)...");
  const rng = createRng(42);
  const winIdx: number[] = [];
  const loseIdx: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].won) winIdx.push(i);
    else loseIdx.push(i);
  }
  // Shuffle
  for (let i = winIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [winIdx[i], winIdx[j]] = [winIdx[j], winIdx[i]];
  }
  for (let i = loseIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [loseIdx[i], loseIdx[j]] = [loseIdx[j], loseIdx[i]];
  }
  const splitClass = (indices: number[]) => {
    const testN = Math.floor(indices.length * 0.15);
    const valN = Math.floor(indices.length * 0.15);
    return {
      test: indices.slice(0, testN),
      val: indices.slice(testN, testN + valN),
      train: indices.slice(testN + valN),
    };
  };
  const winSplit = splitClass(winIdx);
  const loseSplit = splitClass(loseIdx);
  const trainSampleIdx = [...winSplit.train, ...loseSplit.train];
  const valSampleIdx = [...winSplit.val, ...loseSplit.val];
  const testSampleIdx = [...winSplit.test, ...loseSplit.test];
  console.log(`  Samples — Train: ${trainSampleIdx.length}, Val: ${valSampleIdx.length}, Test: ${testSampleIdx.length}`);

  // Expand each split to per-mon instances independently
  console.log("Extracting per-mon features (this may take a while)...");

  async function expandToPerMon(sampleIdxs: number[]): Promise<Dataset> {
    const X: Float64Array[] = [];
    const y: number[] = [];
    const w: number[] = [];
    for (const si of sampleIdxs) {
      const sample = samples[si];
      const broughtSet = new Set(sample.myBrought);
      const weight = ratingWeight(sample.rating);
      for (const mon of sample.myPreview) {
        try {
          const features = await extractPerMonFeatures(
            mon, sample.oppPreview, sample.myPreview, embeddingIndex,
          );
          X.push(features);
          y.push(broughtSet.has(mon) ? 1 : 0);
          w.push(weight);
        } catch { /* skip */ }
      }
    }
    return { X, y, w, featureNames: PER_MON_FEATURE_NAMES };
  }

  const train = await expandToPerMon(trainSampleIdx);
  console.log(`  Train instances: ${train.X.length}`);
  const val = await expandToPerMon(valSampleIdx);
  console.log(`  Val instances: ${val.X.length}`);
  const test = await expandToPerMon(testSampleIdx);
  console.log(`  Test instances: ${test.X.length}`);
  console.log(`  Total: ${train.X.length + val.X.length + test.X.length} (${train.y.filter(v => v === 1).length + val.y.filter(v => v === 1).length + test.y.filter(v => v === 1).length} positive)\n`);

  // --- Train GBDT ---
  console.log("Training GBDT...");
  const gbdtModel = trainGBDT(train, val, {
    numTrees: 150,
    maxDepth: 6,
    learningRate: 0.08,
    minSamplesLeaf: 10,
    subsampleRate: 0.8,
    featureSubsampleRate: 0.8,
    verbose: true,
  });

  // --- Evaluate ---
  console.log("\nEvaluating on test set...");

  // Per-mon metrics
  const testPreds = test.X.map((x) => predictGBDT(gbdtModel, x));
  const perMonAcc = accuracy(test.y, testPreds);
  const perMonLoss = logLoss(test.y, testPreds);
  const perMonAuc = auc(test.y, testPreds);
  console.log(`  Per-mon Accuracy: ${(perMonAcc * 100).toFixed(1)}%`);
  console.log(`  Per-mon LogLoss:  ${perMonLoss.toFixed(4)}`);
  console.log(`  Per-mon AUC:      ${perMonAuc.toFixed(4)}\n`);

  // Top-4 selection metrics (need to group back into decisions)
  console.log("Computing selection-level metrics...");
  const selectionMetrics = await computeSelectionMetrics(samples, embeddingIndex, gbdtModel);
  console.log(`  Top-4 Exact Match: ${(selectionMetrics.exactMatch * 100).toFixed(1)}%`);
  console.log(`  Top-4 Overlap:     ${selectionMetrics.avgOverlap.toFixed(2)} / 4`);
  console.log(`  (Baseline random:  6.7% exact, 2.67 overlap)\n`);

  // --- Cross-validation (lightweight: 3-fold, fewer trees) ---
  // Note: CV uses instance-level folds (not replay-level) for simplicity,
  // but the main train/val/test split above is replay-level to prevent leakage.
  console.log("Running 3-fold cross-validation (lightweight)...");
  const allData: Dataset = {
    X: [...train.X, ...val.X, ...test.X],
    y: [...train.y, ...val.y, ...test.y],
    w: [...train.w, ...val.w, ...test.w],
    featureNames: PER_MON_FEATURE_NAMES,
  };
  const cvResult = kFoldCV(allData, 3, (trainDs, valDs) => {
    const model = trainGBDT(trainDs, valDs, {
      numTrees: 50,
      maxDepth: 4,
      learningRate: 0.1,
      minSamplesLeaf: 20,
    });
    return (x: Float64Array) => predictGBDT(model, x);
  });
  console.log(`  CV Mean AUC: ${cvResult.meanAuc.toFixed(4)} ± ${cvResult.stdAuc.toFixed(4)}\n`);

  // --- Feature Importance ---
  const featureImportance = getGBDTFeatureImportance(gbdtModel);
  console.log("Top 15 Features:");
  for (const fi of featureImportance.slice(0, 15)) {
    console.log(`  ${fi.name}: ${fi.importance.toFixed(4)}`);
  }

  // --- Save ---
  await mkdir(ML_DIR, { recursive: true });

  const output: SelectionOutput = {
    generatedAt: new Date().toISOString(),
    metrics: {
      perMonAccuracy: perMonAcc,
      top4ExactMatch: selectionMetrics.exactMatch,
      top4Overlap: selectionMetrics.avgOverlap,
      logLoss: perMonLoss,
      cvScores: cvResult.foldMetrics.map((f) => f.auc),
    },
    featureImportance,
  };

  await writeFile(resolve(ML_DIR, "selection-model.json"), JSON.stringify(output, null, 2));
  console.log("\nSaved selection-model.json");

  // Save model weights
  await writeFile(
    resolve(ML_DIR, "selection-weights.json"),
    JSON.stringify({ type: "gbdt", model: serializeGBDT(gbdtModel) }, null, 0),
  );
  console.log("Saved selection-weights.json");

  console.log("\n=== Done ===");
}

// ---------------------------------------------------------------------------
// Selection-level metrics
// ---------------------------------------------------------------------------

async function computeSelectionMetrics(
  samples: { myPreview: string[]; oppPreview: string[]; myBrought: string[]; won: boolean; rating: number }[],
  embeddingIndex: any,
  model: any,
): Promise<{ exactMatch: number; avgOverlap: number }> {
  // Sample a subset for evaluation speed (use every 10th sample)
  const evalSamples = samples.filter((_, i) => i % 10 === 0);
  let exactMatches = 0;
  let totalOverlap = 0;

  for (const sample of evalSamples) {
    const broughtSet = new Set(sample.myBrought);
    const scores: { species: string; score: number }[] = [];

    for (const mon of sample.myPreview) {
      try {
        const features = await extractPerMonFeatures(
          mon,
          sample.oppPreview,
          sample.myPreview,
          embeddingIndex,
        );
        const score = predictGBDT(model, features);
        scores.push({ species: mon, score });
      } catch {
        scores.push({ species: mon, score: 0 });
      }
    }

    // Predict top 4
    scores.sort((a, b) => b.score - a.score);
    const predicted = new Set(scores.slice(0, 4).map((s) => s.species));

    // Compute overlap
    let overlap = 0;
    for (const p of predicted) {
      if (broughtSet.has(p)) overlap++;
    }
    totalOverlap += overlap;

    // Exact match
    if (overlap === 4 && predicted.size === broughtSet.size) {
      exactMatches++;
    }
  }

  return {
    exactMatch: exactMatches / (evalSamples.length || 1),
    avgOverlap: totalOverlap / (evalSamples.length || 1),
  };
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
