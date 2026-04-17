import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { TeamMatchupResult, PoolMember } from "../types/team-matchup";
import { useLang } from "../viewer/LanguageContext";
import MoveConsistencyToolbar from "./components/MoveConsistencyToolbar";
import PokemonSidebar from "./components/PokemonSidebar";
import TeamSidebar from "./components/TeamSidebar";
import MoveConsistencyDetail from "./components/MoveConsistencyDetail";
import TeamMoveDetail from "./components/TeamMoveDetail";
import ThreatAnalysis from "./components/ThreatAnalysis";

import rawData from "../storage/analysis/_latest-team-matchup.json";
import metaRankingData from "../storage/analysis/meta-ranking.json";
const data = rawData as unknown as TeamMatchupResult;

type Mode = "individual" | "team" | "threat";

export default function App() {
  const { lang, toggleLang } = useLang();
  const [dark, setDark] = useState(true);
  const [mode, setMode] = useState<Mode>("individual");
  const [selectedPokemon, setSelectedPokemon] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<(PoolMember | null)[]>([null, null, null, null, null, null]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const pool = useMemo(() =>
    [...data.pool].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0)),
    [],
  );

  // Sort teams by compositeScore (same order as matchup viewer)
  const sortedTeams = useMemo(() =>
    [...data.topTeams].sort((a, b) =>
      (b.compositeScore ?? 0) - (a.compositeScore ?? 0) || b.winRate - a.winRate),
    [],
  );

  const poolByName = useMemo(
    () => new Map(pool.map((p) => [p.name, p])),
    [pool],
  );

  const selectedPokemonData = selectedPokemon ? poolByName.get(selectedPokemon) : null;
  const selectedTeam = selectedTeamId
    ? data.topTeams.find((t) => t.teamId === selectedTeamId)
    : null;

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <MoveConsistencyToolbar
        mode={mode}
        onModeChange={setMode}
        query={query}
        onQueryChange={setQuery}
        lang={lang}
        onToggleLang={toggleLang}
        dark={dark}
        onToggleDark={toggleDark}
        poolSize={pool.length}
        teamCount={data.topTeams.length}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar (not shown in threat mode) */}
        {mode === "individual" ? (
          <PokemonSidebar
            pool={pool}
            selected={selectedPokemon}
            onSelect={setSelectedPokemon}
            query={query}
            lang={lang}
          />
        ) : mode === "team" ? (
          <TeamSidebar
            teams={sortedTeams}
            selected={selectedTeamId}
            onSelect={setSelectedTeamId}
            lang={lang}
          />
        ) : null}

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto viewer-scroll">
          {mode === "individual" ? (
            selectedPokemonData ? (
              <MoveConsistencyDetail
                pokemon={selectedPokemonData}
                opponents={opponents}
                onSetOpponents={setOpponents}
                pool={pool}
                topTeams={data.topTeams}
                lang={lang}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                {lang === "ja"
                  ? "左からポケモンを選択してください"
                  : "Select a Pokemon from the left sidebar"}
              </div>
            )
          ) : mode === "team" ? (
            selectedTeam ? (
              <TeamMoveDetail
                team={selectedTeam}
                pool={pool}
                topTeams={data.topTeams}
                lang={lang}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                {lang === "ja"
                  ? "左からチームを選択してください"
                  : "Select a team from the left sidebar"}
              </div>
            )
          ) : (
            <ThreatAnalysis
              pool={pool}
              topTeams={data.topTeams}
              pokemonStats={data.pokemonStats}
              metaRanking={metaRankingData as { name: string; isMega: boolean; weightedWinRate: number }[]}
              lang={lang}
            />
          )}
        </div>
      </div>
    </div>
  );
}
