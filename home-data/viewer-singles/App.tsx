import { useState, useMemo } from "react";
import singlesJson from "../storage/analysis/2026-04-10-singles.json";
import type { SinglesRanking, RankedPokemon } from "../types/singles-ranking";
import { useLang } from "../viewer/LanguageContext";
import { localizePokemon } from "../viewer/i18n";
import { PokemonRankList } from "./components/PokemonRankList";
import { PokemonPowerDetail } from "./components/PokemonPowerDetail";
import { RankingToolbar } from "./components/RankingToolbar";

const data = singlesJson as unknown as SinglesRanking;

export type SortKey = "overall" | "offensive" | "defensive" | "sustained" | "speed" | "usage";

export default function App() {
  const { lang, toggleLang } = useLang();
  const [dark, setDark] = useState(true);
  const [selected, setSelected] = useState<string>(data.pokemon[0]?.name ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [query, setQuery] = useState("");

  // Dark mode
  const toggleDark = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  // Sort + filter
  const sorted = useMemo(() => {
    let list = [...data.pokemon];

    // Filter by search
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => {
        const en = p.name.toLowerCase();
        const ja = localizePokemon(p.name, "ja").toLowerCase();
        return en.includes(q) || ja.includes(q);
      });
    }

    // Sort
    list.sort((a, b) => {
      switch (sortKey) {
        case "offensive":
          return b.scores.offensiveScore - a.scores.offensiveScore;
        case "defensive":
          return b.scores.defensiveScore - a.scores.defensiveScore;
        case "sustained":
          return b.scores.sustainedScore - a.scores.sustainedScore;
        case "speed":
          return b.scores.speedAdvantage - a.scores.speedAdvantage;
        case "usage":
          return a.usageRank - b.usageRank;
        default:
          return b.scores.overallScore - a.scores.overallScore;
      }
    });
    return list;
  }, [sortKey, query]);

  const selectedPokemon = data.pokemon.find((p) => p.name === selected);

  return (
    <div className="flex flex-col h-screen">
      <RankingToolbar
        sortKey={sortKey}
        onSortChange={setSortKey}
        query={query}
        onQueryChange={setQuery}
        lang={lang}
        onToggleLang={toggleLang}
        dark={dark}
        onToggleDark={toggleDark}
        totalPokemon={data.totalPokemon}
        totalBuilds={data.totalBuilds}
        totalCalcs={data.totalCalculations}
      />
      <div className="flex flex-1 overflow-hidden">
        <PokemonRankList
          pokemon={sorted}
          selected={selected}
          onSelect={setSelected}
          lang={lang}
          sortKey={sortKey}
        />
        <div className="flex-1 overflow-y-auto viewer-scroll p-4">
          {selectedPokemon ? (
            <PokemonPowerDetail pokemon={selectedPokemon} lang={lang} />
          ) : (
            <div className="text-gray-500 text-center mt-20">
              {lang === "ja" ? "ポケモンを選択してください" : "Select a Pokemon"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
