/**
 * Left sidebar: scrollable list of ranked Pokemon with mini score bars.
 */

import type { RankedPokemon } from "../../types/singles-ranking";
import type { SortKey } from "../App";
import { localizePokemon } from "../../viewer/i18n";

interface PokemonRankListProps {
  pokemon: RankedPokemon[];
  selected: string;
  onSelect: (name: string) => void;
  lang: "ja" | "en";
  sortKey: SortKey;
}

/** Mini inline bar for the sidebar */
function MiniBar({ value, color }: { value: number; color: string }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-1.5 w-full rounded bg-gray-800/60 overflow-hidden">
      <div className={`absolute inset-y-0 left-0 rounded ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function scoreForSort(p: RankedPokemon, sortKey: SortKey): number {
  switch (sortKey) {
    case "offensive": return p.scores.offensiveScore;
    case "defensive": return p.scores.defensiveScore;
    case "sustained": return p.scores.sustainedScore;
    case "speed": return p.scores.speedAdvantage;
    case "usage": return p.usagePct;
    default: return p.scores.overallScore;
  }
}

function scoreLabel(sortKey: SortKey, lang: "ja" | "en"): string {
  switch (sortKey) {
    case "offensive": return lang === "ja" ? "ATK" : "ATK";
    case "defensive": return lang === "ja" ? "DEF" : "DEF";
    case "sustained": return lang === "ja" ? "継戦" : "SUS";
    case "speed": return lang === "ja" ? "速度" : "SPE";
    case "usage": return lang === "ja" ? "使用率" : "Usage";
    default: return lang === "ja" ? "総合" : "Overall";
  }
}

export function PokemonRankList({ pokemon, selected, onSelect, lang, sortKey }: PokemonRankListProps) {
  if (!pokemon.length) {
    return (
      <div className="w-64 shrink-0 border-r border-gray-700 p-4 text-center text-sm text-gray-500">
        {lang === "ja" ? "該当なし" : "No results"}
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 border-r border-gray-700 overflow-y-auto viewer-scroll">
      {pokemon.map((p, i) => {
        const isSelected = p.name === selected;
        const displayName = lang === "ja" ? localizePokemon(p.name, "ja") : p.name;
        const subName = lang === "ja" ? p.name : localizePokemon(p.name, "ja");
        const sv = scoreForSort(p, sortKey);

        return (
          <button
            key={p.name}
            onClick={() => onSelect(p.name)}
            className={`w-full text-left px-3 py-2 border-l-2 transition ${
              isSelected
                ? "border-blue-500 bg-gray-800/80"
                : "border-transparent hover:bg-gray-800/40"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-gray-500 tabular-nums w-5 shrink-0 text-right">
                {i + 1}
              </span>
              <span className="text-sm text-gray-100 truncate font-medium">{displayName}</span>
              <span className="text-[10px] text-gray-500 truncate">{subName}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 pl-7">
              <span className="text-[10px] text-gray-500 w-10 shrink-0">
                {scoreLabel(sortKey, lang)}
              </span>
              <MiniBar
                value={sv}
                color={
                  sortKey === "offensive"
                    ? "bg-rose-500/70"
                    : sortKey === "defensive"
                      ? "bg-cyan-500/70"
                      : sortKey === "sustained"
                        ? "bg-orange-500/70"
                        : sortKey === "speed"
                          ? "bg-teal-500/70"
                          : sortKey === "usage"
                            ? "bg-amber-500/70"
                            : "bg-blue-500/70"
                }
              />
              <span className="text-[10px] text-gray-400 tabular-nums w-10 text-right shrink-0">
                {sortKey === "usage" ? `${sv.toFixed(1)}%` : sortKey === "speed" ? `${sv.toFixed(0)}%` : sv.toFixed(1)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
