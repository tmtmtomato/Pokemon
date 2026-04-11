/**
 * Type definitions for ML Insights Viewer data.
 */

export interface FeatureImportanceEntry {
  name: string;
  importance: number;
}

export interface FoldMetric {
  accuracy: number;
  logLoss: number;
  auc: number;
}

// --- Team Eval Model ---

export interface TeamRanking {
  species: string[];
  key: string;
  predictedWinRate: number;
  count: number;
  observedWinRate: number;
}

export interface TeamEvalModel {
  generatedAt: string;
  modelType: "logistic" | "gbdt";
  metrics: {
    foldMetrics: FoldMetric[];
    meanAccuracy: number;
    meanLogLoss: number;
    meanAuc: number;
    stdAccuracy: number;
    stdLogLoss: number;
    stdAuc: number;
  };
  featureImportance: FeatureImportanceEntry[];
  teamRankings: TeamRanking[];
}

// --- Selection Model ---

export interface SelectionModel {
  generatedAt: string;
  metrics: {
    perMonAccuracy: number;
    top4ExactMatch: number;
    top4Overlap: number;
    logLoss: number;
    cvScores: number[];
  };
  featureImportance: FeatureImportanceEntry[];
}

// --- Move Advisor Model ---

export interface MoveQualityEntry {
  name: string;
  avgScore: number;
  usageCount: number;
}

export interface SpeciesMoveQuality {
  species: string;
  moves: MoveQualityEntry[];
}

export interface BadPlayEntry {
  description: string;
  frequency: number;
  avgSeverity: number;
}

export interface MoveAdvisorModel {
  generatedAt: string;
  totalReplays?: number;
  totalActions?: number;
  metrics: {
    accuracy: number;
    logLoss: number;
    auc: number;
  };
  featureImportance: FeatureImportanceEntry[];
  speciesMoveQuality: SpeciesMoveQuality[];
  commonBadPlays: BadPlayEntry[];
}

// --- Combined ---

export interface MLViewerData {
  teamEval: TeamEvalModel;
  selection: SelectionModel;
  moveAdvisor: MoveAdvisorModel;
}
