/**
 * logistic.ts — L2-regularized logistic regression with mini-batch SGD.
 *
 * Binary classification: P(y=1|x) = sigmoid(w·x + b).
 * Training uses gradient descent on cross-entropy + L2 penalty.
 */

import type { Dataset, FeatureImportance } from "../types.js";
import {
  binaryCrossEntropy,
  createRng,
  sigmoid,
  shuffleIndices,
  vecDot,
  zeros,
} from "./matrix.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogisticConfig {
  learningRate: number;
  lambda: number; // L2 regularization strength
  epochs: number;
  batchSize: number;
  patience: number; // early stopping (epochs without val improvement)
  seed: number;
  verbose: boolean;
}

export interface LogisticModel {
  weights: Float64Array;
  bias: number;
  featureNames: string[];
  config: LogisticConfig;
  trainHistory: { epoch: number; trainLoss: number; valLoss?: number }[];
}

export const DEFAULT_LOGISTIC_CONFIG: LogisticConfig = {
  learningRate: 0.01,
  lambda: 0.001,
  epochs: 100,
  batchSize: 32,
  patience: 10,
  seed: 42,
  verbose: false,
};

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export function trainLogistic(
  trainData: Dataset,
  valData: Dataset | null,
  config: Partial<LogisticConfig> = {},
): LogisticModel {
  const cfg = { ...DEFAULT_LOGISTIC_CONFIG, ...config };
  const { X, y, w, featureNames } = trainData;
  const n = X.length;
  const d = featureNames.length;
  const rng = createRng(cfg.seed);

  // Initialize weights to small random values
  const weights = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    weights[i] = (rng() - 0.5) * 0.01;
  }
  let bias = 0;

  const history: LogisticModel["trainHistory"] = [];
  let bestValLoss = Infinity;
  let bestWeights = new Float64Array(weights);
  let bestBias = bias;
  let patienceCounter = 0;

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    // Shuffle training data
    const indices = shuffleIndices(n, rng);

    // Mini-batch SGD
    for (let start = 0; start < n; start += cfg.batchSize) {
      const end = Math.min(start + cfg.batchSize, n);
      const batchSize = end - start;

      // Accumulate gradients
      const gradW = zeros(d);
      let gradB = 0;
      let totalWeight = 0;

      for (let bi = start; bi < end; bi++) {
        const idx = indices[bi];
        const xi = X[idx];
        const yi = y[idx];
        const wi = w[idx];

        const pred = sigmoid(vecDot(weights, xi) + bias);
        const error = (pred - yi) * wi;
        totalWeight += wi;

        for (let j = 0; j < d; j++) {
          gradW[j] += error * xi[j];
        }
        gradB += error;
      }

      // Average gradients + L2 regularization
      const scale = 1 / (totalWeight || 1);
      for (let j = 0; j < d; j++) {
        weights[j] -= cfg.learningRate * (gradW[j] * scale + cfg.lambda * weights[j]);
      }
      bias -= cfg.learningRate * gradB * scale;
    }

    // Compute training loss
    const trainLoss = computeWeightedLoss(X, y, w, weights, bias, cfg.lambda);

    // Compute validation loss if available
    let valLoss: number | undefined;
    if (valData) {
      valLoss = computeWeightedLoss(
        valData.X,
        valData.y,
        valData.w,
        weights,
        bias,
        cfg.lambda,
      );

      // Early stopping
      if (valLoss < bestValLoss - 1e-6) {
        bestValLoss = valLoss;
        bestWeights = new Float64Array(weights);
        bestBias = bias;
        patienceCounter = 0;
      } else {
        patienceCounter++;
        if (patienceCounter >= cfg.patience) {
          if (cfg.verbose) {
            console.log(`  Early stopping at epoch ${epoch + 1} (val loss: ${valLoss.toFixed(6)})`);
          }
          history.push({ epoch: epoch + 1, trainLoss, valLoss });
          break;
        }
      }
    }

    history.push({ epoch: epoch + 1, trainLoss, valLoss });

    if (cfg.verbose && (epoch + 1) % 10 === 0) {
      const valStr = valLoss !== undefined ? `, val: ${valLoss.toFixed(6)}` : "";
      console.log(`  Epoch ${epoch + 1}: train loss = ${trainLoss.toFixed(6)}${valStr}`);
    }
  }

  // Restore best weights if we used validation
  if (valData) {
    weights.set(bestWeights);
    bias = bestBias;
  }

  return {
    weights: new Float64Array(weights),
    bias,
    featureNames,
    config: cfg,
    trainHistory: history,
  };
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

export function predictLogistic(model: LogisticModel, x: Float64Array): number {
  return sigmoid(vecDot(model.weights, x) + model.bias);
}

export function predictLogisticBatch(model: LogisticModel, X: Float64Array[]): number[] {
  return X.map((x) => predictLogistic(model, x));
}

// ---------------------------------------------------------------------------
// Feature importance
// ---------------------------------------------------------------------------

export function getLogisticFeatureImportance(model: LogisticModel): FeatureImportance[] {
  return model.featureNames
    .map((name, i) => ({ name, importance: Math.abs(model.weights[i]) }))
    .sort((a, b) => b.importance - a.importance);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedLogisticModel {
  weights: number[];
  bias: number;
  featureNames: string[];
}

export function serializeLogistic(model: LogisticModel): SerializedLogisticModel {
  return {
    weights: Array.from(model.weights),
    bias: model.bias,
    featureNames: model.featureNames,
  };
}

export function deserializeLogistic(data: SerializedLogisticModel): LogisticModel {
  return {
    weights: new Float64Array(data.weights),
    bias: data.bias,
    featureNames: data.featureNames,
    config: DEFAULT_LOGISTIC_CONFIG,
    trainHistory: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeWeightedLoss(
  X: Float64Array[],
  y: number[],
  w: number[],
  weights: Float64Array,
  bias: number,
  lambda: number,
): number {
  let totalLoss = 0;
  let totalWeight = 0;
  for (let i = 0; i < X.length; i++) {
    const pred = sigmoid(vecDot(weights, X[i]) + bias);
    totalLoss += w[i] * binaryCrossEntropy(y[i], pred);
    totalWeight += w[i];
  }
  // Add L2 penalty
  let l2 = 0;
  for (let j = 0; j < weights.length; j++) {
    l2 += weights[j] * weights[j];
  }
  return totalLoss / (totalWeight || 1) + (lambda / 2) * l2;
}
