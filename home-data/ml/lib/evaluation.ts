/**
 * evaluation.ts — Metrics and cross-validation for ML models.
 */

import type { CVResult, Dataset } from "../types.js";
import { binaryCrossEntropy, createRng, sigmoid } from "./matrix.js";

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Binary accuracy (threshold = 0.5). */
export function accuracy(yTrue: number[], yProb: number[]): number {
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = yProb[i] >= 0.5 ? 1 : 0;
    if (pred === yTrue[i]) correct++;
  }
  return correct / (yTrue.length || 1);
}

/** Mean binary cross-entropy loss. */
export function logLoss(yTrue: number[], yProb: number[]): number {
  let total = 0;
  for (let i = 0; i < yTrue.length; i++) {
    total += binaryCrossEntropy(yTrue[i], yProb[i]);
  }
  return total / (yTrue.length || 1);
}

/** Weighted log loss. */
export function weightedLogLoss(
  yTrue: number[],
  yProb: number[],
  weights: number[],
): number {
  let total = 0;
  let totalW = 0;
  for (let i = 0; i < yTrue.length; i++) {
    total += weights[i] * binaryCrossEntropy(yTrue[i], yProb[i]);
    totalW += weights[i];
  }
  return total / (totalW || 1);
}

/**
 * ROC-AUC via trapezoidal approximation.
 * Handles ties and edge cases.
 */
export function auc(yTrue: number[], yProb: number[]): number {
  const n = yTrue.length;
  if (n === 0) return 0.5;

  // Sort by descending probability
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => yProb[b] - yProb[a]);

  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let aucSum = 0;
  let prevProb = -Infinity;

  const totalPos = yTrue.reduce((s, v) => s + v, 0);
  const totalNeg = n - totalPos;

  if (totalPos === 0 || totalNeg === 0) return 0.5;

  for (const idx of indices) {
    const prob = yProb[idx];
    if (prob !== prevProb) {
      // Add trapezoid
      aucSum += ((fp - prevFp) * (tp + prevTp)) / 2;
      prevTp = tp;
      prevFp = fp;
      prevProb = prob;
    }
    if (yTrue[idx] === 1) {
      tp++;
    } else {
      fp++;
    }
  }
  // Final trapezoid
  aucSum += ((fp - prevFp) * (tp + prevTp)) / 2;

  return aucSum / (totalPos * totalNeg);
}

/** Confusion matrix (2x2) for binary classification. */
export function confusionMatrix(
  yTrue: number[],
  yProb: number[],
  threshold = 0.5,
): { tp: number; fp: number; tn: number; fn: number } {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = yProb[i] >= threshold ? 1 : 0;
    if (yTrue[i] === 1 && pred === 1) tp++;
    else if (yTrue[i] === 0 && pred === 1) fp++;
    else if (yTrue[i] === 0 && pred === 0) tn++;
    else fn++;
  }
  return { tp, fp, tn, fn };
}

// ---------------------------------------------------------------------------
// Cross-validation
// ---------------------------------------------------------------------------

export type TrainFn = (
  train: Dataset,
  val: Dataset | null,
) => (x: Float64Array) => number;

/**
 * Stratified k-fold cross-validation.
 */
export function kFoldCV(
  data: Dataset,
  k: number,
  trainFn: TrainFn,
  seed = 42,
): CVResult {
  const rng = createRng(seed);
  const n = data.X.length;

  // Separate positive and negative indices
  const posIndices: number[] = [];
  const negIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (data.y[i] === 1) posIndices.push(i);
    else negIndices.push(i);
  }

  // Shuffle each class
  shuffleArray(posIndices, rng);
  shuffleArray(negIndices, rng);

  // Assign folds (stratified)
  const foldAssignment = new Int32Array(n);
  for (let i = 0; i < posIndices.length; i++) {
    foldAssignment[posIndices[i]] = i % k;
  }
  for (let i = 0; i < negIndices.length; i++) {
    foldAssignment[negIndices[i]] = i % k;
  }

  const foldMetrics: CVResult["foldMetrics"] = [];

  for (let fold = 0; fold < k; fold++) {
    // Split
    const trainX: Float64Array[] = [];
    const trainY: number[] = [];
    const trainW: number[] = [];
    const valX: Float64Array[] = [];
    const valY: number[] = [];
    const valW: number[] = [];

    for (let i = 0; i < n; i++) {
      if (foldAssignment[i] === fold) {
        valX.push(data.X[i]);
        valY.push(data.y[i]);
        valW.push(data.w[i]);
      } else {
        trainX.push(data.X[i]);
        trainY.push(data.y[i]);
        trainW.push(data.w[i]);
      }
    }

    const trainDs: Dataset = {
      X: trainX,
      y: trainY,
      w: trainW,
      featureNames: data.featureNames,
    };
    const valDs: Dataset = {
      X: valX,
      y: valY,
      w: valW,
      featureNames: data.featureNames,
    };

    // Train and evaluate
    const predictFn = trainFn(trainDs, valDs);
    const preds = valX.map(predictFn);

    foldMetrics.push({
      accuracy: accuracy(valY, preds),
      logLoss: logLoss(valY, preds),
      auc: auc(valY, preds),
    });
  }

  // Aggregate
  const accs = foldMetrics.map((m) => m.accuracy);
  const losses = foldMetrics.map((m) => m.logLoss);
  const aucs = foldMetrics.map((m) => m.auc);

  return {
    foldMetrics,
    meanAccuracy: mean(accs),
    meanLogLoss: mean(losses),
    meanAuc: mean(aucs),
    stdAccuracy: std(accs),
    stdLogLoss: std(losses),
    stdAuc: std(aucs),
  };
}

/**
 * Stratified train/val/test split.
 */
export function stratifiedSplit(
  data: Dataset,
  valRatio: number,
  testRatio: number,
  seed = 42,
): { train: Dataset; val: Dataset; test: Dataset } {
  const rng = createRng(seed);
  const n = data.X.length;

  const posIndices: number[] = [];
  const negIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (data.y[i] === 1) posIndices.push(i);
    else negIndices.push(i);
  }

  shuffleArray(posIndices, rng);
  shuffleArray(negIndices, rng);

  const splitClass = (indices: number[]) => {
    const testN = Math.floor(indices.length * testRatio);
    const valN = Math.floor(indices.length * valRatio);
    return {
      test: indices.slice(0, testN),
      val: indices.slice(testN, testN + valN),
      train: indices.slice(testN + valN),
    };
  };

  const posSplit = splitClass(posIndices);
  const negSplit = splitClass(negIndices);

  const buildDataset = (indices: number[]): Dataset => ({
    X: indices.map((i) => data.X[i]),
    y: indices.map((i) => data.y[i]),
    w: indices.map((i) => data.w[i]),
    featureNames: data.featureNames,
  });

  return {
    train: buildDataset([...posSplit.train, ...negSplit.train]),
    val: buildDataset([...posSplit.val, ...negSplit.val]),
    test: buildDataset([...posSplit.test, ...negSplit.test]),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
}

function std(arr: number[]): number {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length || 1);
  return Math.sqrt(variance);
}

function shuffleArray(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
