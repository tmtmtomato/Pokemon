import React from "react";
import type { RankedTeam } from "../../types/team-matchup";
import { localizePokemon, type Lang } from "../../viewer/i18n";

interface Props {
  teams: RankedTeam[];
  selected: string | null;
  onSelect: (teamId: string) => void;
  lang: Lang;
}

export default function TeamSidebar({ teams, selected, onSelect, lang }: Props) {
  return (
    <div className="w-56 shrink-0 border-r border-gray-700 overflow-y-auto viewer-scroll">
      {teams.slice(0, 50).map((t) => (
        <button
          key={t.teamId}
          onClick={() => onSelect(t.teamId)}
          className={`w-full text-left px-2.5 py-2 border-l-2 transition text-xs ${
            t.teamId === selected
              ? "border-blue-500 bg-gray-800/80"
              : "border-transparent hover:bg-gray-800/40"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-500 w-5 text-right tabular-nums shrink-0">#{t.rank}</span>
            <div className="flex-1 min-w-0">
              <span className="text-emerald-400 tabular-nums font-medium">
                {(t.winRate * 100).toFixed(1)}%
              </span>
              <span className="text-gray-600 text-[10px] ml-1">
                {t.wins}W/{t.losses}L
              </span>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 truncate pl-7">
            {t.members.map((name) => localizePokemon(name, lang)).join(", ")}
          </div>
        </button>
      ))}
    </div>
  );
}
