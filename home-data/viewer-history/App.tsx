import { useState } from "react";
import historyJson from "../storage/analysis/_matchup-history.json";
import type { MatchupHistory } from "../types/matchup-history";
import { useLang } from "../viewer/LanguageContext";
import { RunList } from "./components/RunList";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { ConvergenceChart } from "./components/ConvergenceChart";
import { PokemonConsistency } from "./components/PokemonConsistency";
import { CoreStability } from "./components/CoreStability";
import { RunDiff } from "./components/RunDiff";

const data = historyJson as unknown as MatchupHistory;

type Tab = "summary" | "convergence" | "pokemon" | "cores" | "diff";

export default function App() {
  const { lang, toggleLang } = useLang();
  const [dark, setDark] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("summary");

  const toggleDark = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  const snapshots = data.snapshots;

  const tabs: { key: Tab; label: string; labelJa: string }[] = [
    { key: "summary", label: "Summary", labelJa: "サマリー" },
    { key: "convergence", label: "Convergence", labelJa: "収束" },
    { key: "pokemon", label: "Pokemon", labelJa: "ポケモン安定性" },
    { key: "cores", label: "Cores", labelJa: "コア安定性" },
    { key: "diff", label: "Diff", labelJa: "実行比較" },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700 bg-gray-900 shrink-0">
        <h1 className="font-bold text-lg">
          {lang === "ja" ? "実行履歴分析" : "Run History Analysis"}
        </h1>
        <span className="text-gray-400 text-sm">
          {snapshots.length} {lang === "ja" ? "回の実行" : "runs"}
        </span>
        <div className="flex gap-1 ml-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 rounded text-sm ${
                tab === t.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {lang === "ja" ? t.labelJa : t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={toggleLang} className="px-2 py-1 rounded bg-gray-800 text-sm">
            {lang === "ja" ? "EN" : "JA"}
          </button>
          <button onClick={toggleDark} className="px-2 py-1 rounded bg-gray-800 text-sm">
            {dark ? "☀" : "☾"}
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        <RunList
          snapshots={snapshots}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
          lang={lang}
        />
        <div className="flex-1 overflow-y-auto viewer-scroll p-4">
          {snapshots.length === 0 ? (
            <div className="text-gray-500 text-center mt-20">
              {lang === "ja" ? "履歴データなし" : "No history data"}
            </div>
          ) : tab === "summary" ? (
            <SummaryDashboard snapshots={snapshots} lang={lang} />
          ) : tab === "convergence" ? (
            <ConvergenceChart snapshots={snapshots} selectedIdx={selectedIdx} lang={lang} />
          ) : tab === "pokemon" ? (
            <PokemonConsistency snapshots={snapshots} selectedIdx={selectedIdx} lang={lang} />
          ) : tab === "cores" ? (
            <CoreStability snapshots={snapshots} lang={lang} />
          ) : (
            <RunDiff snapshots={snapshots} lang={lang} />
          )}
        </div>
      </div>
    </div>
  );
}
