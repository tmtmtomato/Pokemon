import { useMemo } from "react";
import type { MatchupSnapshot } from "../../types/matchup-history";
import { localizePokemon } from "../../viewer/i18n";

interface Props {
  snapshots: MatchupSnapshot[];
  lang: string;
}

interface CoreEntry {
  key: string;
  members: string[];
  appearances: number;
  avgScore: number;
  runIndices: number[];
}

/** Lists 3-Pokemon cores that appear across multiple runs. */
export function CoreStability({ snapshots, lang }: Props) {
  const cores = useMemo(() => {
    const coreMap = new Map<string, CoreEntry>();

    for (let i = 0; i < snapshots.length; i++) {
      for (const core of snapshots[i].topCores) {
        const key = [...core.members].sort().join("+");
        const existing = coreMap.get(key);
        if (existing) {
          existing.appearances++;
          existing.avgScore = (existing.avgScore * (existing.appearances - 1) + core.score) / existing.appearances;
          existing.runIndices.push(i);
        } else {
          coreMap.set(key, {
            key,
            members: [...core.members].sort(),
            appearances: 1,
            avgScore: core.score,
            runIndices: [i],
          });
        }
      }
    }

    return [...coreMap.values()]
      .sort((a, b) => b.appearances - a.appearances || b.avgScore - a.avgScore);
  }, [snapshots]);

  const multiRun = cores.filter((c) => c.appearances >= 2);
  const totalRuns = snapshots.length;

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">
        {lang === "ja" ? "コア安定性" : "Core Stability"}
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        {lang === "ja"
          ? `複数回の実行で出現した3体コア (${multiRun.length}件 / 全${cores.length}件)`
          : `Cores appearing in multiple runs (${multiRun.length} / ${cores.length} total)`}
      </p>

      {multiRun.length === 0 ? (
        <div className="text-gray-500 text-center mt-10">
          {lang === "ja"
            ? "複数回出現したコアはありません（実行回数を増やすと検出されます）"
            : "No cores found across multiple runs (run more to detect stable cores)"}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-700">
              <th className="text-left px-2 py-1">{lang === "ja" ? "コアメンバー" : "Core Members"}</th>
              <th className="text-right px-2 py-1">{lang === "ja" ? "信頼度" : "Confidence"}</th>
              <th className="text-right px-2 py-1">{lang === "ja" ? "平均スコア" : "Avg Score"}</th>
              <th className="text-left px-2 py-1">{lang === "ja" ? "出現した実行" : "Runs"}</th>
            </tr>
          </thead>
          <tbody>
            {multiRun.map((core) => {
              const confidence = core.appearances / totalRuns;
              return (
                <tr key={core.key} className="border-t border-gray-800">
                  <td className="px-2 py-2 font-mono">
                    {core.members.map(m => localizePokemon(m, lang)).join(" / ")}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className={`font-bold ${
                      confidence >= 0.8 ? "text-green-400" :
                      confidence >= 0.5 ? "text-yellow-400" : "text-gray-300"
                    }`}>
                      {core.appearances}/{totalRuns}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      ({(confidence * 100).toFixed(0)}%)
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-gray-300">
                    {(core.avgScore * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-gray-400 text-xs">
                    {core.runIndices.map((i) => `#${i + 1}`).join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Single-run cores summary */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-gray-400 mb-2">
          {lang === "ja" ? "単発コア (参考)" : "Single-Run Cores (Reference)"}
        </h3>
        <div className="text-xs text-gray-500 grid grid-cols-2 gap-1">
          {cores.filter(c => c.appearances === 1).slice(0, 20).map((core) => (
            <div key={core.key} className="bg-gray-900 rounded px-2 py-1">
              {core.members.map(m => localizePokemon(m, lang)).join(" / ")}
              <span className="text-gray-600 ml-1">
                ({(core.avgScore * 100).toFixed(0)}%, #{core.runIndices[0] + 1})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
