/**
 * Sticky top toolbar for the team matchup viewer.
 * Provides sort selection, search, stats, language toggle, and dark mode toggle.
 */

import type { SortKey } from "../App";
import type { PokemonTeamStats } from "../../types/team-matchup";

interface MatchupToolbarProps {
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  query: string;
  onQueryChange: (q: string) => void;
  lang: "ja" | "en";
  onToggleLang: () => void;
  dark: boolean;
  onToggleDark: () => void;
  config: { totalTeams: number; gamesPerTeam: number; poolSize: number };
  pokemonStats: PokemonTeamStats[];
}

const SORT_OPTIONS: { key: SortKey; labelJa: string; labelEn: string }[] = [
  { key: "combined", labelJa: "総合", labelEn: "Combined" },
  { key: "winRate", labelJa: "勝率", labelEn: "Win Rate" },
  { key: "avgScore", labelJa: "スコア", labelEn: "Score" },
  { key: "dominance", labelJa: "支配力", labelEn: "Dominance" },
];

export function MatchupToolbar({
  sortKey,
  onSortChange,
  query,
  onQueryChange,
  lang,
  onToggleLang,
  dark,
  onToggleDark,
  config,
}: MatchupToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-900/95 px-4 py-2 backdrop-blur">
      {/* Title */}
      <h1 className="text-sm font-bold text-gray-100 mr-2">
        {lang === "ja" ? "チーム選出分析" : "Team Matchup Analysis"}
      </h1>

      {/* Sort buttons */}
      <div className="flex gap-1">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            className={`rounded px-2 py-0.5 text-xs transition ${
              sortKey === opt.key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            {lang === "ja" ? opt.labelJa : opt.labelEn}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={lang === "ja" ? "検索..." : "Search..."}
        className="w-36 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <span className="text-[10px] text-gray-500 tabular-nums">
        {config.poolSize} mon / {config.totalTeams} teams / {config.gamesPerTeam} games
      </span>

      {/* Language toggle */}
      <button
        onClick={onToggleLang}
        className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition"
      >
        {lang === "ja" ? "EN" : "JA"}
      </button>

      {/* Dark mode toggle */}
      <button
        onClick={onToggleDark}
        className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition"
        title={dark ? "Light mode" : "Dark mode"}
      >
        {dark ? "Light" : "Dark"}
      </button>
    </div>
  );
}
