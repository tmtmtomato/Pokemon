import { useState, useMemo } from "react";
import matchupJson from "../storage/analysis/2026-04-10-team-matchup.json";
import type { TeamMatchupResult, RankedTeam } from "../types/team-matchup";
import { useLang } from "../viewer/LanguageContext";
import { localizePokemon } from "../viewer/i18n";
import { MatchupToolbar } from "./components/MatchupToolbar";
import { SimInfoPanel } from "./components/SimInfoPanel";
import { TeamRankList } from "./components/TeamRankList";
import { TeamDetail } from "./components/TeamDetail";

const data = matchupJson as unknown as TeamMatchupResult;

export type SortKey = "combined" | "winRate" | "avgScore" | "dominance";

export default function App() {
  const { lang, toggleLang } = useLang();
  const [dark, setDark] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(data.topTeams[0]?.teamId ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("combined");
  const [query, setQuery] = useState("");
  const [showSimInfo, setShowSimInfo] = useState(false);

  const toggleDark = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  const sorted = useMemo(() => {
    let list = [...data.topTeams];

    if (query) {
      const q = query.toLowerCase();
      list = list.filter((t) =>
        t.members.some((m) => {
          const en = m.toLowerCase();
          const ja = localizePokemon(m, "ja").toLowerCase();
          return en.includes(q) || ja.includes(q);
        }),
      );
    }

    list.sort((a, b) => {
      if (sortKey === "avgScore") return b.avgScore - a.avgScore;
      if (sortKey === "dominance") {
        const da = a.threatProfile?.dominanceScore ?? 0;
        const db = b.threatProfile?.dominanceScore ?? 0;
        return db - da || b.winRate - a.winRate;
      }
      if (sortKey === "combined") {
        // Same formula as pipeline ranking: 0.6*WR + 0.4*dominance
        const sa = 0.6 * (a.winRate * 100) + 0.4 * (a.threatProfile?.dominanceScore ?? 0);
        const sb = 0.6 * (b.winRate * 100) + 0.4 * (b.threatProfile?.dominanceScore ?? 0);
        return sb - sa || b.winRate - a.winRate;
      }
      return b.winRate - a.winRate;
    });

    return list;
  }, [sortKey, query]);

  const selectedTeam = data.topTeams.find((t) => t.teamId === selectedId);

  return (
    <div className="flex flex-col h-screen">
      <MatchupToolbar
        sortKey={sortKey}
        onSortChange={setSortKey}
        query={query}
        onQueryChange={setQuery}
        lang={lang}
        onToggleLang={toggleLang}
        dark={dark}
        onToggleDark={toggleDark}
        config={data.config}
        pokemonStats={data.pokemonStats}
        showSimInfo={showSimInfo}
        onToggleSimInfo={() => setShowSimInfo((v) => !v)}
      />
      {showSimInfo && <SimInfoPanel lang={lang} onClose={() => setShowSimInfo(false)} />}
      <div className="flex flex-1 overflow-hidden">
        <TeamRankList
          teams={sorted}
          selected={selectedId}
          onSelect={setSelectedId}
          lang={lang}
        />
        <div className="flex-1 overflow-y-auto viewer-scroll p-4">
          {selectedTeam ? (
            <TeamDetail
              team={selectedTeam}
              pool={data.pool}
              matrix={data.damageMatrix}
              pokemonStats={data.pokemonStats}
              lang={lang}
            />
          ) : (
            <div className="text-gray-500 text-center mt-20">
              {lang === "ja" ? "チームを選択してください" : "Select a team"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
