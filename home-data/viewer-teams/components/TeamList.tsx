/**
 * Left-pane team list. Displays rank, 6 species, count, and win rate.
 */

import type { TeamEntry } from "../../types/team-analysis";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon } from "../../viewer/i18n";
import { confidenceLabel, fmtPct } from "../utils";

export type TeamSort = "count" | "winRate";

interface TeamListProps {
  teams: TeamEntry[];
  selected: string | undefined;
  onSelect: (key: string) => void;
  sort: TeamSort;
  onSortChange: (sort: TeamSort) => void;
}

export function TeamList({ teams, selected, onSelect, sort, onSortChange }: TeamListProps) {
  const { lang } = useLang();

  if (!teams.length) {
    return (
      <div className="p-4 text-sm text-gray-400">
        {lang === "ja" ? "データがありません。" : "No data available."}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-800 bg-gray-900/40 px-3 py-1.5">
        {(["count", "winRate"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSortChange(s)}
            className={[
              "rounded px-2 py-0.5 text-[10px] transition",
              sort === s
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700",
            ].join(" ")}
          >
            {s === "count"
              ? lang === "ja" ? "出現数順" : "By Count"
              : lang === "ja" ? "勝率順" : "By Win Rate"}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-gray-800">
      {teams.map((team, index) => {
        const isSelected = team.key === selected;
        const badge = confidenceLabel(team.count, lang);
        return (
          <li key={team.key}>
            <button
              type="button"
              onClick={() => onSelect(team.key)}
              className={[
                "flex w-full flex-col gap-1 px-3 py-2 text-left transition",
                "hover:bg-gray-800/60",
                isSelected
                  ? "bg-gray-800/80 border-l-4 border-blue-500"
                  : "border-l-4 border-transparent",
              ].join(" ")}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs tabular-nums text-gray-500">
                  #{index + 1}
                </span>
                <span className={`text-xs tabular-nums ${sort === "count" ? "text-gray-300" : "text-gray-500"}`}>
                  {team.count}{lang === "ja" ? "回" : "x"}
                </span>
                <span className={`text-xs tabular-nums ${sort === "winRate" ? "text-gray-300" : "text-gray-500"}`}>
                  wr {fmtPct(team.winRate)}
                </span>
                {badge && (
                  <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-300">
                    {badge}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-gray-200">
                {team.species.map((sp) => (
                  <span key={sp}>{localizePokemon(sp, lang)}</span>
                ))}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
