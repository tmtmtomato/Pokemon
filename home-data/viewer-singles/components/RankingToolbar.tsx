/**
 * Sticky top toolbar for the singles power ranking viewer.
 * Provides sort selection, search, language toggle, and dark mode toggle.
 */

import type { SortKey } from "../App";

interface RankingToolbarProps {
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  query: string;
  onQueryChange: (q: string) => void;
  lang: "ja" | "en";
  onToggleLang: () => void;
  dark: boolean;
  onToggleDark: () => void;
  totalPokemon: number;
  totalBuilds: number;
  totalCalcs: number;
}

const SORT_OPTIONS: { key: SortKey; labelJa: string; labelEn: string }[] = [
  { key: "overall", labelJa: "総合", labelEn: "Overall" },
  { key: "offensive", labelJa: "攻撃", labelEn: "Offense" },
  { key: "defensive", labelJa: "防御", labelEn: "Defense" },
  { key: "sustained", labelJa: "継戦", labelEn: "Sustained" },
  { key: "speed", labelJa: "素早さ", labelEn: "Speed" },
  { key: "usage", labelJa: "使用率", labelEn: "Usage" },
];

export function RankingToolbar({
  sortKey,
  onSortChange,
  query,
  onQueryChange,
  lang,
  onToggleLang,
  dark,
  onToggleDark,
  totalPokemon,
  totalBuilds,
  totalCalcs,
}: RankingToolbarProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-900/95 px-4 py-2 backdrop-blur">
      {/* Title */}
      <h1 className="text-sm font-bold text-gray-100 mr-2">
        {lang === "ja" ? "シングル パワーランキング" : "Singles Power Ranking"}
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
        {totalPokemon} mon / {totalBuilds} builds / {(totalCalcs / 1000).toFixed(0)}K calcs
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
