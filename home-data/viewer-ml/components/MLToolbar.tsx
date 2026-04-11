/**
 * Toolbar with tab navigation for the ML Insights Viewer.
 */

import { useLang } from "../../viewer/LanguageContext";
import { type Tab, tabLabel } from "../utils";

const TABS: Tab[] = ["teams", "moves", "badplays", "models"];

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  dark: boolean;
  onToggleDark: () => void;
}

export function MLToolbar({ tab, onTabChange, dark, onToggleDark }: Props) {
  const { lang, toggleLang } = useLang();

  return (
    <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-2">
        <h1 className="mr-4 text-sm font-bold tracking-wide text-gray-100">
          {lang === "ja" ? "ML Insights" : "ML Insights"}
        </h1>

        {/* Tabs */}
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {tabLabel(t, lang)}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Language toggle */}
        <button
          onClick={toggleLang}
          className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          {lang === "ja" ? "EN" : "JA"}
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDark}
          className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          {dark ? "Light" : "Dark"}
        </button>
      </div>
    </header>
  );
}
