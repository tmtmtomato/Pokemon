/**
 * Shared ML type definitions for the Pokemon VGC analysis pipeline.
 */

// ---------------------------------------------------------------------------
// Core ML types
// ---------------------------------------------------------------------------

/** A dense feature vector backed by Float64Array. */
export type FeatureVector = Float64Array;

/** Named feature vector with metadata. */
export interface LabeledSample {
  features: FeatureVector;
  label: number; // 0 or 1 for binary classification
  weight: number; // sample importance weight
}

/** A complete dataset for training / evaluation. */
export interface Dataset {
  X: FeatureVector[]; // feature matrix (one row per sample)
  y: number[]; // labels
  w: number[]; // sample weights
  featureNames: string[];
}

/** Train/val/test split. */
export interface DataSplit {
  train: Dataset;
  val: Dataset;
  test: Dataset;
}

/** k-fold CV result. */
export interface CVResult {
  foldMetrics: { accuracy: number; logLoss: number; auc: number }[];
  meanAccuracy: number;
  meanLogLoss: number;
  meanAuc: number;
  stdAccuracy: number;
  stdLogLoss: number;
  stdAuc: number;
}

/** Feature importance entry. */
export interface FeatureImportance {
  name: string;
  importance: number;
}

// ---------------------------------------------------------------------------
// Training data shapes (output of extract-training.ts)
// ---------------------------------------------------------------------------

export interface TeamEvalSample {
  teamSpecies: string[];
  features: number[];
  won: boolean;
  rating: number;
  tier: string;
}

export interface SelectionSample {
  myPreview: string[];
  oppPreview: string[];
  myBrought: string[];
  won: boolean;
  rating: number;
  tier: string;
}

export interface ActionSample {
  turn: number;
  activeMon: string;
  partner: string | null;
  oppActive: string[];
  moveUsed: string;
  target: string | null;
  myRemaining: string[];
  oppRemaining: string[];
  weather: string | null;
  field: string | null;
  turnInGame: number;
  totalTurns: number;
  won: boolean;
  rating: number;
  tier: string;
}

export interface TrainingData {
  generatedAt: string;
  tiers: string[];
  totalReplays: number;
  teamEval: TeamEvalSample[];
  selection: SelectionSample[];
  actions: ActionSample[];
}

// ---------------------------------------------------------------------------
// Model output shapes
// ---------------------------------------------------------------------------

export interface TeamEvalOutput {
  generatedAt: string;
  modelType: "logistic" | "gbdt";
  metrics: CVResult;
  featureImportance: FeatureImportance[];
  teamRankings: {
    species: string[];
    key: string;
    predictedWinRate: number;
    count: number;
    observedWinRate: number;
  }[];
}

export interface SelectionOutput {
  generatedAt: string;
  metrics: {
    perMonAccuracy: number;
    top4ExactMatch: number;
    top4Overlap: number;
    logLoss: number;
    cvScores: number[];
  };
  featureImportance: FeatureImportance[];
}

export interface MoveAdvisorOutput {
  generatedAt: string;
  totalReplays: number;
  totalActions: number;
  metrics: { accuracy: number; logLoss: number; auc: number };
  featureImportance: FeatureImportance[];
  speciesMoveQuality: {
    species: string;
    moves: { name: string; avgScore: number; usageCount: number }[];
  }[];
  commonBadPlays: {
    description: string;
    frequency: number;
    avgSeverity: number;
  }[];
}
