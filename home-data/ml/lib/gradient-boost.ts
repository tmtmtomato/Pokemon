/**
 * gradient-boost.ts — Gradient Boosted Decision Trees (GBDT) for binary classification.
 *
 * Simplified implementation: greedy histogram-based splits, MSE on gradients.
 * Supports subsampling (rows & features) for regularization.
 */

import type { Dataset, FeatureImportance } from "../types.js";
import { binaryCrossEntropy, createRng, sigmoid } from "./matrix.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GBDTConfig {
  numTrees: number;
  maxDepth: number;
  learningRate: number; // shrinkage
  minSamplesLeaf: number;
  subsampleRate: number; // row subsampling per tree
  featureSubsampleRate: number; // column subsampling per tree
  patience: number; // early stopping patience (0 = disabled)
  minDelta: number; // minimum improvement for early stopping
  seed: number;
  verbose: boolean;
}

export interface DecisionNode {
  featureIndex: number;
  threshold: number;
  left: DecisionNode | number; // number = leaf value
  right: DecisionNode | number;
}

export interface GBDTModel {
  trees: DecisionNode[];
  initialPrediction: number; // log-odds of base rate
  featureNames: string[];
  config: GBDTConfig;
  featureImportance: number[]; // split-count based
  trainHistory: { tree: number; trainLoss: number; valLoss?: number }[];
}

export const DEFAULT_GBDT_CONFIG: GBDTConfig = {
  numTrees: 100,
  maxDepth: 5,
  learningRate: 0.1,
  minSamplesLeaf: 5,
  subsampleRate: 0.8,
  featureSubsampleRate: 0.8,
  patience: 20,
  minDelta: 1e-4,
  seed: 42,
  verbose: false,
};

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export function trainGBDT(
  trainData: Dataset,
  valData: Dataset | null,
  config: Partial<GBDTConfig> = {},
): GBDTModel {
  const cfg = { ...DEFAULT_GBDT_CONFIG, ...config };
  const { X, y, w, featureNames } = trainData;
  const n = X.length;
  const d = featureNames.length;
  const rng = createRng(cfg.seed);

  // Feature importance accumulator
  const featureImportance = new Float64Array(d);

  // Initial prediction: log-odds of positive class rate
  let posSum = 0;
  let totalW = 0;
  for (let i = 0; i < n; i++) {
    posSum += y[i] * w[i];
    totalW += w[i];
  }
  const baseRate = posSum / (totalW || 1);
  const initialPrediction = Math.log(Math.max(baseRate, 1e-10) / Math.max(1 - baseRate, 1e-10));

  // Current predictions (raw logits)
  const F = new Float64Array(n).fill(initialPrediction);
  let valF: Float64Array | null = null;
  if (valData) {
    valF = new Float64Array(valData.X.length).fill(initialPrediction);
  }

  const trees: DecisionNode[] = [];
  const history: GBDTModel["trainHistory"] = [];

  // Early stopping state
  let bestValLoss = Infinity;
  let bestTreeIdx = -1;
  let patienceCounter = 0;
  const useEarlyStopping = cfg.patience > 0 && valData !== null;

  for (let t = 0; t < cfg.numTrees; t++) {
    // Compute negative gradients (pseudo-residuals) for log-loss
    const gradients = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = sigmoid(F[i]);
      gradients[i] = y[i] - p; // negative gradient of log-loss
    }

    // Subsample rows
    const rowMask = new Uint8Array(n);
    const rowIndices: number[] = [];
    if (cfg.subsampleRate < 1) {
      // Reservoir sampling
      for (let i = 0; i < n; i++) {
        if (rng() < cfg.subsampleRate) {
          rowMask[i] = 1;
          rowIndices.push(i);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        rowMask[i] = 1;
        rowIndices.push(i);
      }
    }

    // Subsample features
    const featureMask = new Uint8Array(d);
    const featureIndices: number[] = [];
    for (let j = 0; j < d; j++) {
      if (rng() < cfg.featureSubsampleRate) {
        featureMask[j] = 1;
        featureIndices.push(j);
      }
    }
    if (featureIndices.length === 0 && d > 0) {
      const j = Math.floor(rng() * d);
      featureMask[j] = 1;
      featureIndices.push(j);
    }

    // Build tree on gradients
    const tree = buildTree(
      X,
      gradients,
      w,
      rowIndices,
      featureIndices,
      0,
      cfg.maxDepth,
      cfg.minSamplesLeaf,
      featureImportance,
    );

    trees.push(tree);

    // Update predictions
    for (let i = 0; i < n; i++) {
      F[i] += cfg.learningRate * predictTree(tree, X[i]);
    }

    // Compute train loss
    let trainLoss = 0;
    let trainTotalW = 0;
    for (let i = 0; i < n; i++) {
      trainLoss += w[i] * binaryCrossEntropy(y[i], sigmoid(F[i]));
      trainTotalW += w[i];
    }
    trainLoss /= trainTotalW || 1;

    // Compute val loss
    let valLoss: number | undefined;
    if (valData && valF) {
      let vl = 0;
      let vw = 0;
      for (let i = 0; i < valData.X.length; i++) {
        valF[i] += cfg.learningRate * predictTree(tree, valData.X[i]);
        vl += valData.w[i] * binaryCrossEntropy(valData.y[i], sigmoid(valF[i]));
        vw += valData.w[i];
      }
      valLoss = vl / (vw || 1);
    }

    history.push({ tree: t + 1, trainLoss, valLoss });

    if (cfg.verbose && (t + 1) % 10 === 0) {
      const valStr = valLoss !== undefined ? `, val: ${valLoss.toFixed(6)}` : "";
      console.log(`  Tree ${t + 1}/${cfg.numTrees}: train loss = ${trainLoss.toFixed(6)}${valStr}`);
    }

    // Early stopping: track best validation loss
    if (useEarlyStopping && valLoss !== undefined) {
      if (valLoss < bestValLoss - cfg.minDelta) {
        bestValLoss = valLoss;
        bestTreeIdx = t;
        patienceCounter = 0;
      } else {
        patienceCounter++;
        if (patienceCounter >= cfg.patience) {
          if (cfg.verbose) {
            console.log(`  Early stopping at tree ${t + 1} (best at tree ${bestTreeIdx + 1}, val loss: ${bestValLoss.toFixed(6)})`);
          }
          break;
        }
      }
    }
  }

  // Truncate to best tree ensemble if early stopping triggered
  if (useEarlyStopping && bestTreeIdx >= 0 && bestTreeIdx < trees.length - 1) {
    trees.length = bestTreeIdx + 1;
    history.length = bestTreeIdx + 1;
  }

  return {
    trees,
    initialPrediction,
    featureNames,
    config: cfg,
    featureImportance: Array.from(featureImportance),
    trainHistory: history,
  };
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildTree(
  X: Float64Array[],
  gradients: Float64Array,
  weights: number[],
  indices: number[],
  featureIndices: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
  featureImportance: Float64Array,
): DecisionNode | number {
  // Leaf: compute weighted mean of gradients
  if (depth >= maxDepth || indices.length < 2 * minSamplesLeaf) {
    return computeLeafValue(gradients, weights, indices);
  }

  // Find best split
  const split = findBestSplit(X, gradients, weights, indices, featureIndices, minSamplesLeaf);
  if (!split) {
    return computeLeafValue(gradients, weights, indices);
  }

  featureImportance[split.featureIndex] += split.gain;

  // Partition indices
  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (const idx of indices) {
    if (X[idx][split.featureIndex] <= split.threshold) {
      leftIndices.push(idx);
    } else {
      rightIndices.push(idx);
    }
  }

  const left = buildTree(
    X, gradients, weights, leftIndices, featureIndices,
    depth + 1, maxDepth, minSamplesLeaf, featureImportance,
  );
  const right = buildTree(
    X, gradients, weights, rightIndices, featureIndices,
    depth + 1, maxDepth, minSamplesLeaf, featureImportance,
  );

  return {
    featureIndex: split.featureIndex,
    threshold: split.threshold,
    left,
    right,
  };
}

interface SplitCandidate {
  featureIndex: number;
  threshold: number;
  gain: number;
}

function findBestSplit(
  X: Float64Array[],
  gradients: Float64Array,
  weights: number[],
  indices: number[],
  featureIndices: number[],
  minSamplesLeaf: number,
): SplitCandidate | null {
  let bestGain = 0;
  let bestSplit: SplitCandidate | null = null;

  // Precompute total gradient sum and weight
  let totalGrad = 0;
  let totalWeight = 0;
  for (const idx of indices) {
    totalGrad += gradients[idx] * weights[idx];
    totalWeight += weights[idx];
  }

  for (const fIdx of featureIndices) {
    // Sort indices by feature value
    const sorted = indices.slice().sort((a, b) => X[a][fIdx] - X[b][fIdx]);

    let leftGrad = 0;
    let leftWeight = 0;
    let leftCount = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const idx = sorted[i];
      leftGrad += gradients[idx] * weights[idx];
      leftWeight += weights[idx];
      leftCount++;

      // Skip if same feature value as next (can't split here)
      if (X[sorted[i]][fIdx] === X[sorted[i + 1]][fIdx]) continue;

      const rightCount = sorted.length - leftCount;
      if (leftCount < minSamplesLeaf || rightCount < minSamplesLeaf) continue;

      const rightGrad = totalGrad - leftGrad;
      const rightWeight = totalWeight - leftWeight;

      // Gain = G_L^2/H_L + G_R^2/H_R - G^2/H
      // For squared error on gradients: gain = leftGrad^2/leftWeight + rightGrad^2/rightWeight - totalGrad^2/totalWeight
      const gain =
        (leftGrad * leftGrad) / (leftWeight || 1) +
        (rightGrad * rightGrad) / (rightWeight || 1) -
        (totalGrad * totalGrad) / (totalWeight || 1);

      if (gain > bestGain) {
        bestGain = gain;
        bestSplit = {
          featureIndex: fIdx,
          threshold: (X[sorted[i]][fIdx] + X[sorted[i + 1]][fIdx]) / 2,
          gain,
        };
      }
    }
  }

  return bestSplit;
}

function computeLeafValue(
  gradients: Float64Array,
  weights: number[],
  indices: number[],
): number {
  let sumGrad = 0;
  let sumWeight = 0;
  for (const idx of indices) {
    sumGrad += gradients[idx] * weights[idx];
    sumWeight += weights[idx];
  }
  return sumGrad / (sumWeight || 1);
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

function predictTree(node: DecisionNode | number, x: Float64Array): number {
  if (typeof node === "number") return node;
  if (x[node.featureIndex] <= node.threshold) {
    return predictTree(node.left, x);
  }
  return predictTree(node.right, x);
}

export function predictGBDT(model: GBDTModel, x: Float64Array): number {
  let logit = model.initialPrediction;
  for (const tree of model.trees) {
    logit += model.config.learningRate * predictTree(tree, x);
  }
  return sigmoid(logit);
}

export function predictGBDTBatch(model: GBDTModel, X: Float64Array[]): number[] {
  return X.map((x) => predictGBDT(model, x));
}

// ---------------------------------------------------------------------------
// Feature importance
// ---------------------------------------------------------------------------

export function getGBDTFeatureImportance(model: GBDTModel): FeatureImportance[] {
  const total = model.featureImportance.reduce((a, b) => a + b, 0) || 1;
  return model.featureNames
    .map((name, i) => ({
      name,
      importance: model.featureImportance[i] / total,
    }))
    .sort((a, b) => b.importance - a.importance);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedGBDTModel {
  trees: (SerializedNode | number)[];
  initialPrediction: number;
  featureNames: string[];
  learningRate: number;
}

interface SerializedNode {
  f: number; // featureIndex
  t: number; // threshold
  l: SerializedNode | number; // left
  r: SerializedNode | number; // right
}

function serializeNode(node: DecisionNode | number): SerializedNode | number {
  if (typeof node === "number") return node;
  return {
    f: node.featureIndex,
    t: node.threshold,
    l: serializeNode(node.left),
    r: serializeNode(node.right),
  };
}

function deserializeNode(data: SerializedNode | number): DecisionNode | number {
  if (typeof data === "number") return data;
  return {
    featureIndex: data.f,
    threshold: data.t,
    left: deserializeNode(data.l),
    right: deserializeNode(data.r),
  };
}

export function serializeGBDT(model: GBDTModel): SerializedGBDTModel {
  return {
    trees: model.trees.map(serializeNode) as (SerializedNode | number)[],
    initialPrediction: model.initialPrediction,
    featureNames: model.featureNames,
    learningRate: model.config.learningRate,
  };
}

export function deserializeGBDT(data: SerializedGBDTModel): GBDTModel {
  return {
    trees: data.trees.map(deserializeNode) as DecisionNode[],
    initialPrediction: data.initialPrediction,
    featureNames: data.featureNames,
    config: { ...DEFAULT_GBDT_CONFIG, learningRate: data.learningRate },
    featureImportance: new Array(data.featureNames.length).fill(0),
    trainHistory: [],
  };
}
