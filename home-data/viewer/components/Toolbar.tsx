/**
 * Top toolbar with format tabs, search input, minimum-games filter, sort
 * selector, source filter and dark-mode toggle.
 *
 * All state is lifted into <App /> so this component is purely presentational.
 */

import type { FormatMeta } from "../../types/analytics";
import { useLang } from "../LanguageContext";
import type { SortKey, SourceFilter } from "../utils";

interface ToolbarProps {
  formats: FormatMeta[];
  activeFormat: string;
  onFormatChange: (key: string) => void;

  query: string;
  onQueryChange: (value: string) => void;

  minGames: number;
  onMinGamesChange: (value: number) => void;

  sortKey: SortKey;
  onSortChange: (value: SortKey) => void;

  source: SourceFilter;
  onSourceChange: (value: SourceFilter) => void;

  dark: boolean;
  onToggleDark: () => void;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "rank", label: "Rank" },
  { value: "usage", label: "Usage %" },
  { value: "winRate", label: "Win rate" },
  { value: "name", label: "Name" },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "any", label: "All" },
  { value: "pikalytics", label: "Pikalytics" },
  { value: "vgcpast", label: "vgcpast" },
  { value: "both", label: "Both" },
];

export function Toolbar(props: ToolbarProps) {
  const {
    formats,
    activeFormat,
    onFormatChange,
    query,
    onQueryChange,
    minGames,
    onMinGamesChange,
    sortKey,
    onSortChange,
    source,
    onSourceChange,
    dark,
    onToggleDark,
  } = props;
  const { lang, toggleLang } = useLang();

  return (
    <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold text-gray-100">
            Champions Meta Viewer
          </h1>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            Track D
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded border border-gray-800 bg-gray-900 p-1">
          {formats.map((fmt) => (
            <button
              key={fmt.formatKey}
              type="button"
              onClick={() => onFormatChange(fmt.formatKey)}
              className={[
                "rounded px-2 py-1 text-xs transition",
                fmt.formatKey === activeFormat
                  ? "bg-blue-500/80 text-white"
                  : "text-gray-300 hover:bg-gray-800",
              ].join(" ")}
              title={`${fmt.display} - ${fmt.pokemon.length} Pokemon / ${fmt.totalReplays} replays`}
            >
              {fmt.display}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="検索 / Search..."
            className="w-40 rounded border border-gray-800 bg-gray-900 px-2 py-1 text-sm text-gray-100 placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
          />

          <label className="flex items-center gap-1 text-xs text-gray-300">
            <span>Min games</span>
            <input
              type="number"
              min={0}
              step={10}
              value={minGames}
              onChange={(e) => onMinGamesChange(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded border border-gray-800 bg-gray-900 px-2 py-1 text-right text-sm tabular-nums text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-1 text-xs text-gray-300">
            <span>Sort</span>
            <select
              value={sortKey}
              onChange={(e) => onSortChange(e.target.value as SortKey)}
              className="rounded border border-gray-800 bg-gray-900 px-1 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1 text-xs text-gray-300">
            <span>Source</span>
            <select
              value={source}
              onChange={(e) => onSourceChange(e.target.value as SourceFilter)}
              className="rounded border border-gray-800 bg-gray-900 px-1 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={toggleLang}
            className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-300 hover:bg-gray-800"
            title={
              lang === "ja"
                ? "Switch to English (現在: 日本語)"
                : "日本語に切り替え (current: English)"
            }
            aria-label="toggle language"
          >
            {lang === "ja" ? "JA" : "EN"}
          </button>

          <button
            type="button"
            onClick={onToggleDark}
            className="rounded border border-gray-800 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
            title="Toggle theme"
          >
            {dark ? "Dark" : "Light"}
          </button>
        </div>
      </div>
    </header>
  );
}
