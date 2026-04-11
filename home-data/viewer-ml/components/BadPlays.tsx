/**
 * Bad Plays tab — common mistake patterns detected by the move advisor.
 */

import { useMemo, useState } from "react";
import type { BadPlayEntry } from "../../types/ml-viewer";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon } from "../../viewer/i18n";
import { severityColor, severityLabel, badPlayDescJa } from "../utils";

type SortKey = "impact" | "frequency" | "severity";

interface Props {
  data: BadPlayEntry[];
  totalReplays?: number;
}

export function BadPlays({ data, totalReplays }: Props) {
  const { lang } = useLang();
  const [sort, setSort] = useState<SortKey>("impact");

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      if (sort === "frequency") return b.frequency - a.frequency;
      if (sort === "severity") return b.avgSeverity - a.avgSeverity;
      // impact = frequency * severity
      return b.frequency * b.avgSeverity - a.frequency * a.avgSeverity;
    });
  }, [data, sort]);

  const maxFreq = Math.max(...data.map((d) => d.frequency), 1);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-4">
        <h2 className="text-lg font-bold text-gray-100">
          {lang === "ja" ? "悪手パターン" : "Common Bad Plays"}
        </h2>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          {lang === "ja" ? "ソート" : "Sort"}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="impact">{lang === "ja" ? "影響度" : "Impact"}</option>
            <option value="frequency">{lang === "ja" ? "頻度" : "Frequency"}</option>
            <option value="severity">{lang === "ja" ? "深刻度" : "Severity"}</option>
          </select>
        </label>
        <span className="text-xs text-gray-500">
          {data.length} {lang === "ja" ? "パターン" : "patterns"}
        </span>
      </div>

      <p className="mb-4 text-[11px] text-gray-500">
        {lang === "ja"
          ? `${totalReplays ? totalReplays.toLocaleString() : "?"}件のリプレイから、敗北時に低スコア（<0.4）だった行動パターンを検出。頻度と深刻度の両方が高いほど避けるべき。`
          : `Detected from ${totalReplays ? totalReplays.toLocaleString() : "?"} replays: move patterns with low predicted scores (<0.4) in losing games. Higher frequency + severity = bigger mistake.`}
      </p>

      <div className="space-y-1">
        {sorted.map((bp, i) => {
          // Parse "Species: description"
          const colonIdx = bp.description.indexOf(":");
          const species = colonIdx > 0 ? bp.description.slice(0, colonIdx) : "";
          const desc = colonIdx > 0 ? bp.description.slice(colonIdx + 1).trim() : bp.description;

          return (
            <div
              key={i}
              className="group flex items-center gap-3 rounded bg-gray-900/60 px-3 py-2.5 hover:bg-gray-800/60"
            >
              {/* Rank */}
              <span className="w-6 shrink-0 text-right text-[10px] text-gray-600">
                {i + 1}
              </span>

              {/* Species badge */}
              {species && (
                <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300">
                  {localizePokemon(species, lang)}
                </span>
              )}

              {/* Description */}
              <span className="flex-1 text-xs text-gray-200">
                {lang === "ja" ? badPlayDescJa(desc) : desc}
              </span>

              {/* Frequency bar */}
              <div className="flex w-32 items-center gap-2">
                <div className="h-2 w-16 overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full rounded bg-orange-500/60"
                    style={{ width: `${(bp.frequency / maxFreq) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">{bp.frequency}x</span>
              </div>

              {/* Severity */}
              <span className={`w-16 text-right text-xs ${severityColor(bp.avgSeverity)}`}>
                {severityLabel(bp.avgSeverity, lang)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
