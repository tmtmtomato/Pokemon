/**
 * Team Rankings tab — top teams by predicted win rate.
 */

import { useMemo, useState } from "react";
import type { TeamRanking } from "../../types/ml-viewer";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon } from "../../viewer/i18n";
import { PokemonIcon } from "../../viewer/PokemonIcon";
import { fmtPct } from "../utils";

type SortKey = "predicted" | "observed" | "count";

interface Props {
  rankings: TeamRanking[];
}

export function TeamRankings({ rankings }: Props) {
  const { lang } = useLang();
  const [minCount, setMinCount] = useState(5);
  const [sort, setSort] = useState<SortKey>("predicted");

  const filtered = useMemo(() => {
    const items = rankings.filter((t) => t.count >= minCount);
    return items.sort((a, b) => {
      if (sort === "predicted") return b.predictedWinRate - a.predictedWinRate;
      if (sort === "observed") return b.observedWinRate - a.observedWinRate;
      return b.count - a.count;
    });
  }, [rankings, minCount, sort]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-bold text-gray-100">
          {lang === "ja" ? "チームランキング" : "Team Rankings"}
        </h2>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          {lang === "ja" ? "最低試合数" : "Min games"}
          <input
            type="number"
            min={1}
            max={100}
            value={minCount}
            onChange={(e) => setMinCount(Math.max(1, Number(e.target.value)))}
            className="w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          {lang === "ja" ? "ソート" : "Sort"}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="predicted">{lang === "ja" ? "予測勝率" : "Predicted WR"}</option>
            <option value="observed">{lang === "ja" ? "実測勝率" : "Observed WR"}</option>
            <option value="count">{lang === "ja" ? "試合数" : "Game count"}</option>
          </select>
        </label>
        <span className="text-xs text-gray-500">
          {filtered.length} / {rankings.length} {lang === "ja" ? "チーム" : "teams"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="px-2 py-2 w-10">#</th>
              <th className="px-2 py-2">{lang === "ja" ? "チーム構成" : "Team"}</th>
              <th className="px-2 py-2 w-36">{lang === "ja" ? "予測勝率" : "Predicted"}</th>
              <th className="px-2 py-2 w-24">{lang === "ja" ? "実測勝率" : "Observed"}</th>
              <th className="px-2 py-2 w-16">{lang === "ja" ? "試合数" : "Games"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((team, i) => (
              <tr
                key={team.key}
                className="border-b border-gray-800/50 hover:bg-gray-900/50"
              >
                <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {team.species.map((sp) => (
                      <span
                        key={sp}
                        className="rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-200 inline-flex items-center gap-0.5"
                      >
                        <PokemonIcon name={sp} size="w-4 h-4" />
                        {localizePokemon(sp, lang)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded bg-gray-800">
                      <div
                        className="h-full rounded bg-blue-500"
                        style={{ width: `${team.predictedWinRate * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-200">{fmtPct(team.predictedWinRate)}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-gray-300">{fmtPct(team.observedWinRate)}</td>
                <td className="px-2 py-2 text-gray-500">{team.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 100 && (
        <p className="mt-2 text-center text-xs text-gray-500">
          {lang === "ja" ? `上位100チームを表示中 (全${filtered.length}チーム)` : `Showing top 100 of ${filtered.length} teams`}
        </p>
      )}
    </div>
  );
}
