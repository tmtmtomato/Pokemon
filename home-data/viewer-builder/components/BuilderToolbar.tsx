import type { Lang } from "../../viewer/i18n";

const ALL_TYPES = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug",
  "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
];

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  filterType: string | null;
  onFilterTypeChange: (t: string | null) => void;
  lang: Lang;
  onToggleLang: () => void;
  dark: boolean;
  onToggleDark: () => void;
  teamSize: number;
  onClearAll: () => void;
}

export function BuilderToolbar({
  query, onQueryChange,
  filterType, onFilterTypeChange,
  lang, onToggleLang,
  dark, onToggleDark,
  teamSize, onClearAll,
}: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-gray-700 bg-gray-900 px-4 py-2">
      <h1 className="text-lg font-bold whitespace-nowrap">
        {lang === "ja" ? "構築ガイド" : "Team Builder"}
      </h1>

      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={lang === "ja" ? "ポケモン検索..." : "Search..."}
        className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm w-40"
      />

      <select
        value={filterType ?? ""}
        onChange={(e) => onFilterTypeChange(e.target.value || null)}
        className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm"
      >
        <option value="">{lang === "ja" ? "全タイプ" : "All Types"}</option>
        {ALL_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <span className="text-sm text-gray-400">{teamSize}/6</span>

      {teamSize > 0 && (
        <button
          onClick={onClearAll}
          className="rounded bg-red-800 px-2 py-1 text-xs hover:bg-red-700"
        >
          {lang === "ja" ? "リセット" : "Clear"}
        </button>
      )}

      <div className="ml-auto flex gap-2">
        <button
          onClick={onToggleLang}
          className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-700"
        >
          {lang === "ja" ? "EN" : "JA"}
        </button>
        <button
          onClick={onToggleDark}
          className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-700"
        >
          {dark ? "Light" : "Dark"}
        </button>
      </div>
    </header>
  );
}
