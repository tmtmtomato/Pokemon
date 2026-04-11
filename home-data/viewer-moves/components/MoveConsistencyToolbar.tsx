import React from "react";
import type { Lang } from "../../viewer/i18n";

type Mode = "individual" | "team" | "threat";

interface Props {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  query: string;
  onQueryChange: (q: string) => void;
  lang: Lang;
  onToggleLang: () => void;
  dark: boolean;
  onToggleDark: () => void;
  poolSize: number;
  teamCount: number;
}

export default function MoveConsistencyToolbar({
  mode,
  onModeChange,
  query,
  onQueryChange,
  lang,
  onToggleLang,
  dark,
  onToggleDark,
  poolSize,
  teamCount,
}: Props) {
  const tabs: { key: Mode; labelJa: string; labelEn: string }[] = [
    { key: "individual", labelJa: "個体分析", labelEn: "Individual" },
    { key: "team", labelJa: "チーム分析", labelEn: "Team" },
    { key: "threat", labelJa: "脅威分析", labelEn: "Threat" },
  ];

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-900/95 px-4 py-2 backdrop-blur">
      <span className="text-sm font-bold text-gray-100">
        {lang === "ja" ? "技一貫性ビューア" : "Move Consistency"}
      </span>

      {/* Mode tabs */}
      <div className="flex rounded overflow-hidden border border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onModeChange(tab.key)}
            className={`px-3 py-0.5 text-xs transition ${
              mode === tab.key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {lang === "ja" ? tab.labelJa : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Search (individual mode) */}
      {mode === "individual" && (
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={lang === "ja" ? "検索..." : "Search..."}
          className="w-36 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 placeholder-gray-600 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      )}

      <div className="flex-1" />

      <span className="text-[10px] text-gray-500 tabular-nums">
        {poolSize} {lang === "ja" ? "ポケモン" : "Pokemon"} / {teamCount} {lang === "ja" ? "チーム" : "teams"}
      </span>

      <button
        onClick={onToggleLang}
        className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700"
      >
        {lang === "ja" ? "EN" : "JA"}
      </button>
      <button
        onClick={onToggleDark}
        className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700"
      >
        {dark ? (lang === "ja" ? "ライト" : "Light") : (lang === "ja" ? "ダーク" : "Dark")}
      </button>
    </div>
  );
}
