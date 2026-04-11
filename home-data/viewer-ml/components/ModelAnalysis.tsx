/**
 * Model Analysis tab — metrics + feature importance for all 3 models.
 */

import { useState } from "react";
import type {
  TeamEvalModel,
  SelectionModel,
  MoveAdvisorModel,
  FeatureImportanceEntry,
} from "../../types/ml-viewer";
import { useLang } from "../../viewer/LanguageContext";
import { fmtPct, fmtScore, featureLabel } from "../utils";

interface Props {
  teamEval: TeamEvalModel;
  selection: SelectionModel;
  moveAdvisor: MoveAdvisorModel;
}

type ModelKey = "teamEval" | "selection" | "moveAdvisor";

const MODEL_LABELS: Record<ModelKey, [string, string]> = {
  teamEval: ["チーム評価", "Team Evaluation"],
  selection: ["選出予測", "Selection Prediction"],
  moveAdvisor: ["技選択アドバイザー", "Move Advisor"],
};

export function ModelAnalysis({ teamEval, selection, moveAdvisor }: Props) {
  const { lang } = useLang();
  const [openModel, setOpenModel] = useState<ModelKey>("teamEval");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h2 className="text-lg font-bold text-gray-100">
        {lang === "ja" ? "モデル分析" : "Model Analysis"}
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label={MODEL_LABELS.teamEval[lang === "ja" ? 0 : 1]}
          metrics={[
            ["AUC", fmtScore(teamEval.metrics.meanAuc, 4)],
            [lang === "ja" ? "精度" : "Accuracy", fmtPct(teamEval.metrics.meanAccuracy)],
            ["LogLoss", fmtScore(teamEval.metrics.meanLogLoss, 4)],
            [lang === "ja" ? "特徴量" : "Features", "140"],
            [lang === "ja" ? "サンプル" : "Samples", "~46K"],
          ]}
          active={openModel === "teamEval"}
          onClick={() => setOpenModel("teamEval")}
        />
        <MetricCard
          label={MODEL_LABELS.selection[lang === "ja" ? 0 : 1]}
          metrics={[
            ["AUC", fmtScore(selection.metrics.cvScores.reduce((a, b) => a + b) / selection.metrics.cvScores.length, 4)],
            [lang === "ja" ? "精度" : "Accuracy", fmtPct(selection.metrics.perMonAccuracy)],
            [lang === "ja" ? "完全一致" : "Exact Match", fmtPct(selection.metrics.top4ExactMatch)],
            [lang === "ja" ? "一致数" : "Overlap", `${selection.metrics.top4Overlap.toFixed(2)} / 4`],
            [lang === "ja" ? "サンプル" : "Samples", "~282K"],
          ]}
          active={openModel === "selection"}
          onClick={() => setOpenModel("selection")}
        />
        <MetricCard
          label={MODEL_LABELS.moveAdvisor[lang === "ja" ? 0 : 1]}
          metrics={[
            ["AUC", fmtScore(moveAdvisor.metrics.auc, 4)],
            [lang === "ja" ? "精度" : "Accuracy", fmtPct(moveAdvisor.metrics.accuracy)],
            ["LogLoss", fmtScore(moveAdvisor.metrics.logLoss, 4)],
            [lang === "ja" ? "特徴量" : "Features", "20"],
            [lang === "ja" ? "サンプル" : "Samples", "~489K"],
          ]}
          active={openModel === "moveAdvisor"}
          onClick={() => setOpenModel("moveAdvisor")}
        />
      </div>

      {/* Feature Importance */}
      <div className="rounded border border-gray-800 bg-gray-900/40 p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-200">
          {MODEL_LABELS[openModel][lang === "ja" ? 0 : 1]}
          {" — "}
          {lang === "ja" ? "特徴量重要度" : "Feature Importance"}
        </h3>
        <FeatureImportanceChart
          features={
            openModel === "teamEval"
              ? teamEval.featureImportance
              : openModel === "selection"
                ? selection.featureImportance
                : moveAdvisor.featureImportance
          }
          maxItems={openModel === "moveAdvisor" ? 20 : 25}
        />
      </div>

      {/* Explanation */}
      <div className="text-[11px] text-gray-500">
        {lang === "ja" ? (
          <p>
            3つのGBDTモデルが23,929件のVGCダブルスリプレイから学習。
            チーム評価は自チーム+相手チームの140次元マッチアップ特徴量、
            選出予測は58次元のper-mon特徴量、
            技選択は20次元のゲーム状態特徴量を使用。
            全モデルで早期停止付き勾配ブースティング（100-200木）を採用。
          </p>
        ) : (
          <p>
            Three GBDT models trained on 23,929 VGC doubles replays.
            Team eval uses 140-dim matchup features (my team + opponent team + cross features),
            selection uses 58-dim per-mon features,
            move advisor uses 20-dim game state features.
            All models use gradient boosting with early stopping (100-200 trees).
          </p>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function MetricCard({
  label,
  metrics,
  active,
  onClick,
}: {
  label: string;
  metrics: [string, string][];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded border p-3 text-left transition-colors ${
        active
          ? "border-blue-500 bg-blue-600/10"
          : "border-gray-800 bg-gray-900/40 hover:border-gray-700"
      }`}
    >
      <div className="mb-2 text-xs font-bold text-gray-200">{label}</div>
      <dl className="space-y-1">
        {metrics.map(([k, v]) => (
          <div key={k} className="flex justify-between text-[11px]">
            <dt className="text-gray-500">{k}</dt>
            <dd className="font-mono text-gray-300">{v}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

function FeatureImportanceChart({
  features,
  maxItems,
}: {
  features: FeatureImportanceEntry[];
  maxItems: number;
}) {
  const { lang } = useLang();
  const topFeatures = features.slice(0, maxItems);
  const maxImp = topFeatures[0]?.importance ?? 1;

  return (
    <div className="space-y-1">
      {topFeatures.map((f) => (
        <div key={f.name} className="flex items-center gap-2">
          <span className="w-48 shrink-0 truncate text-right text-[11px] text-gray-400">
            {featureLabel(f.name, lang)}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-gray-800">
            <div
              className="h-full rounded bg-emerald-500/60"
              style={{ width: `${(f.importance / maxImp) * 100}%` }}
            />
          </div>
          <span className="w-14 text-right font-mono text-[10px] text-gray-500">
            {(f.importance * 100).toFixed(1)}%
          </span>
        </div>
      ))}
      {features.length > maxItems && (
        <p className="mt-1 text-center text-[10px] text-gray-600">
          +{features.length - maxItems} {lang === "ja" ? "件の特徴量" : "more features"}
        </p>
      )}
    </div>
  );
}
