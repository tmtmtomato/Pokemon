/**
 * Left sidebar: scrollable list of ranked teams with win-rate mini bars.
 */

import type { RankedTeam } from "../../types/team-matchup";
import { localizePokemon } from "../../viewer/i18n";

interface TeamRankListProps {
  teams: RankedTeam[];
  selected: string; // teamId
  onSelect: (teamId: string) => void;
  lang: "ja" | "en";
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

/** Abbreviate a Pokemon name to fit the compact 3-per-row layout. */
function abbreviate(name: string, lang: "ja" | "en"): string {
  const display = lang === "ja" ? localizePokemon(name, "ja") : name;
  // Truncate long names so three fit in a row
  return display.length > 6 ? display.slice(0, 5) + "\u2026" : display;
}

export function TeamRankList({ teams, selected, onSelect, lang }: TeamRankListProps) {
  if (!teams.length) {
    return (
      <div className="w-72 shrink-0 border-r border-gray-700 p-4 text-center text-sm text-gray-500">
        {lang === "ja" ? "該当なし" : "No results"}
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 border-r border-gray-700 overflow-y-auto viewer-scroll">
      {teams.map((t) => {
        const isSelected = t.teamId === selected;
        const wrPct = (t.winRate * 100).toFixed(1);
        const members = t.members;
        const row1 = members.slice(0, 3);
        const row2 = members.slice(3, 6);

        return (
          <button
            key={t.teamId}
            onClick={() => onSelect(t.teamId)}
            className={`w-full text-left px-3 py-2 border-l-2 transition ${
              isSelected
                ? "border-blue-500 bg-gray-800/80"
                : "border-transparent hover:bg-gray-800/40"
            }`}
          >
            {/* Line 1: rank + win rate */}
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-gray-500 tabular-nums">
                #{t.rank}
              </span>
              <span className="text-xs text-gray-200 tabular-nums">
                WR: {wrPct}%
              </span>
            </div>

            {/* Line 2-3: 6 Pokemon names in 2 rows of 3 */}
            <div className="mt-0.5 grid grid-cols-3 gap-x-1">
              {row1.map((name) => (
                <span key={name} className="text-[10px] text-gray-400 truncate">
                  {abbreviate(name, lang)}
                </span>
              ))}
              {row2.map((name) => (
                <span key={name} className="text-[10px] text-gray-400 truncate">
                  {abbreviate(name, lang)}
                </span>
              ))}
            </div>

            {/* Win rate mini bar */}
            <div className="mt-1">
              <MiniBar value={t.winRate * 100} color="bg-emerald-500/70" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
