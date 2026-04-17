import type { MatchupSnapshot } from "../../types/matchup-history";

interface Props {
  snapshots: MatchupSnapshot[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  lang: string;
}

export function RunList({ snapshots, selectedIdx, onSelect, lang }: Props) {
  return (
    <div className="w-64 border-r border-gray-700 overflow-y-auto viewer-scroll shrink-0">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-800 font-bold">
        {lang === "ja" ? "実行一覧" : "Run List"}
      </div>
      {snapshots.map((s, i) => {
        const wr = (s.topTeamWinRate * 100).toFixed(1);
        const date = s.dateArg;
        const time = s.generatedAt?.slice(11, 16) ?? "";
        const isSelected = selectedIdx === i;

        return (
          <button
            key={i}
            onClick={() => onSelect(isSelected ? null : i)}
            className={`w-full text-left px-3 py-2 border-b border-gray-800 text-sm hover:bg-gray-800 ${
              isSelected ? "bg-gray-800 border-l-2 border-l-blue-500" : ""
            }`}
          >
            <div className="flex justify-between">
              <span className="font-mono text-gray-200">#{i + 1}</span>
              <span className="text-gray-400">{date}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-400">{time}</span>
              <span className={`font-bold ${
                s.topTeamWinRate >= 0.80 ? "text-green-400" :
                s.topTeamWinRate >= 0.70 ? "text-yellow-400" : "text-red-400"
              }`}>
                WR {wr}%
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {s.config.totalTeams}T / {s.config.gamesPerTeam}G / Pool:{s.poolStats.total}
            </div>
          </button>
        );
      })}
    </div>
  );
}
