/**
 * Toolbar with tab switcher, language toggle, and dark mode toggle.
 */

import { useLang } from "../../viewer/LanguageContext";

export type Tab = "teams" | "cores";

interface TeamsToolbarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  dark: boolean;
  onToggleDark: () => void;
}

export function TeamsToolbar({
  tab,
  onTabChange,
  dark,
  onToggleDark,
}: TeamsToolbarProps) {
  const { lang, toggleLang } = useLang();

  const tabs: { key: Tab; label: string }[] = [
    { key: "teams", label: lang === "ja" ? "構築一覧" : "Team List" },
    { key: "cores", label: lang === "ja" ? "コア分析" : "Core Analysis" },
  ];

  return (
    <header className="flex items-center gap-4 border-b border-gray-800 bg-gray-900/80 px-4 py-2">
      <h1 className="text-sm font-bold tracking-wide text-gray-200">
        {lang === "ja" ? "構築・選出分析" : "Team Analysis"}
      </h1>

      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={[
              "rounded px-3 py-1 text-xs font-medium transition",
              tab === t.key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={toggleLang}
        className="rounded bg-gray-800 px-2 py-1 text-[11px] font-bold text-gray-300 hover:text-white transition"
        title="Toggle language"
      >
        {lang === "ja" ? "EN" : "JA"}
      </button>
      <button
        type="button"
        onClick={onToggleDark}
        className="rounded bg-gray-800 px-2 py-1 text-[11px] text-gray-300 hover:text-white transition"
        title="Toggle dark mode"
      >
        {dark ? "Light" : "Dark"}
      </button>
    </header>
  );
}
