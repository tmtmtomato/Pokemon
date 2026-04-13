/**
 * Left-pane core list. Displays rank, 3 species, team count,
 * co-pick rate, and co-pick win rate.
 */

import type { CoreEntry } from "../../types/team-analysis";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon } from "../../viewer/i18n";
import { PokemonIcon } from "../../viewer/PokemonIcon";
import { confidenceLabel, fmtPct } from "../utils";

interface CoreListProps {
  cores: CoreEntry[];
  selected: string | undefined;
  onSelect: (key: string) => void;
}

export function CoreList({ cores, selected, onSelect }: CoreListProps) {
  const { lang } = useLang();

  if (!cores.length) {
    return (
      <div className="p-4 text-sm text-gray-400">
        {lang === "ja" ? "データがありません。" : "No data available."}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-800">
      {cores.map((core, index) => {
        const isSelected = core.key === selected;
        const badge = confidenceLabel(core.teamCount, lang);
        return (
          <li key={core.key}>
            <button
              type="button"
              onClick={() => onSelect(core.key)}
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
                <span className="text-xs tabular-nums text-gray-300">
                  {core.teamCount}{lang === "ja" ? "回" : "x"}
                </span>
                <span className="text-xs tabular-nums text-blue-300">
                  {lang === "ja" ? "同時選出" : "Co-pick"}{" "}
                  {fmtPct(core.coPickRate, 0)}
                </span>
                <span className="text-xs tabular-nums text-gray-500">
                  wr {fmtPct(core.coPickWinRate)}
                </span>
                {badge && (
                  <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-300">
                    {badge}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-[11px] text-gray-200 items-center">
                {core.species.map((sp) => (
                  <span key={sp} className="inline-flex items-center">
                    <PokemonIcon name={sp} size="w-5 h-5" />
                  </span>
                ))}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
