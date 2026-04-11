/**
 * Root component for the Champions Meta Viewer.
 *
 * The merged Track C meta JSON is imported statically so that Vite bakes
 * it into the same bundle that `viteSingleFile()` then inlines into the
 * final `build/meta.html`. At runtime no network fetch is performed: the
 * snapshot lives entirely inside the HTML.
 */

import { useEffect, useMemo, useState } from "react";
import type { MetaSnapshot } from "../types/analytics";
import metaJson from "../storage/analysis/2026-04-08-meta.json";
import { PokemonDetail } from "./components/PokemonDetail";
import { PokemonList } from "./components/PokemonList";
import { Toolbar } from "./components/Toolbar";
import { useLang } from "./LanguageContext";
import {
  filterPokemon,
  pickDefaultPokemon,
  sortPokemon,
  type SortKey,
  type SourceFilter,
} from "./utils";

// Cast the imported JSON through unknown because TypeScript's
// `resolveJsonModule` infers an overly specific literal type that does
// not line up with our MetaSnapshot interface (e.g. sources arrays are
// widened to string[]).
const META: MetaSnapshot = metaJson as unknown as MetaSnapshot;

export default function App() {
  const { lang } = useLang();
  const formats = META.formats;
  const [activeFormatKey, setActiveFormatKey] = useState<string>(
    formats[0]?.formatKey ?? "",
  );
  const [query, setQuery] = useState("");
  const [minGames, setMinGames] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [source, setSource] = useState<SourceFilter>("any");
  const [dark, setDark] = useState(true);

  // Apply the dark flag to <html> so that Tailwind's `dark:` selectors
  // and the body classes defined in index-meta.html behave as expected.
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      document.body.classList.add("bg-gray-950", "text-gray-100");
      document.body.classList.remove("bg-gray-100", "text-gray-900");
    } else {
      root.classList.remove("dark");
      document.body.classList.remove("bg-gray-950", "text-gray-100");
      document.body.classList.add("bg-gray-100", "text-gray-900");
    }
  }, [dark]);

  const activeFormat = useMemo(
    () => formats.find((f) => f.formatKey === activeFormatKey) ?? formats[0],
    [formats, activeFormatKey],
  );

  // When the active format changes, reset the selection to the rank-1 mon.
  const [selectedName, setSelectedName] = useState<string | undefined>(() =>
    pickDefaultPokemon(formats[0])?.name,
  );
  useEffect(() => {
    if (!activeFormat) return;
    setSelectedName(pickDefaultPokemon(activeFormat)?.name);
  }, [activeFormatKey, activeFormat]);

  const filteredSortedList = useMemo(() => {
    if (!activeFormat) return [];
    const filtered = filterPokemon(activeFormat.pokemon, query, minGames, source);
    return sortPokemon(filtered, sortKey, lang);
  }, [activeFormat, query, minGames, source, sortKey, lang]);

  const selectedMon = useMemo(() => {
    if (!activeFormat) return undefined;
    if (!selectedName) return filteredSortedList[0];
    return (
      activeFormat.pokemon.find((p) => p.name === selectedName) ??
      filteredSortedList[0]
    );
  }, [activeFormat, filteredSortedList, selectedName]);

  if (!activeFormat) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        No format data available.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Toolbar
        formats={formats}
        activeFormat={activeFormatKey}
        onFormatChange={setActiveFormatKey}
        query={query}
        onQueryChange={setQuery}
        minGames={minGames}
        onMinGamesChange={setMinGames}
        sortKey={sortKey}
        onSortChange={setSortKey}
        source={source}
        onSourceChange={setSource}
        dark={dark}
        onToggleDark={() => setDark((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="viewer-scroll flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-gray-950">
          <div className="border-b border-gray-800 bg-gray-900/60 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400">
            {activeFormat.display}
            <div className="mt-0.5 text-[10px] text-gray-500">
              {activeFormat.pokemon.length} Pokemon ·{" "}
              {activeFormat.totalReplays} replays ·{" "}
              {activeFormat.totalTeams} teams
            </div>
          </div>
          <PokemonList
            pokemon={filteredSortedList}
            selected={selectedMon?.name}
            onSelect={setSelectedName}
          />
        </aside>

        <main className="viewer-scroll flex-1 overflow-y-auto bg-gray-950">
          <PokemonDetail
            mon={selectedMon}
            formatDisplay={activeFormat.display}
            displayRank={
              selectedMon
                ? filteredSortedList.findIndex(
                    (p) => p.name === selectedMon.name,
                  ) + 1 || undefined
                : undefined
            }
          />
        </main>
      </div>

      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 text-[11px] text-gray-500">
        Generated at {META.generatedAt} · {formats.length} formats ·
        {" "}Data: Pikalytics + vgcpast.es
      </footer>
    </div>
  );
}
