/**
 * Move Quality tab — species-level move quality scores.
 */

import { useMemo, useState } from "react";
import type { SpeciesMoveQuality } from "../../types/ml-viewer";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon, localizeMove } from "../../viewer/i18n";
import { fmtScore, scoreBg, scoreColor } from "../utils";

interface Props {
  data: SpeciesMoveQuality[];
}

export function MoveQuality({ data }: Props) {
  const { lang } = useLang();
  const [selectedSpecies, setSelectedSpecies] = useState<string>(
    () => data[0]?.species ?? "",
  );
  const [query, setQuery] = useState("");

  const filteredSpecies = useMemo(() => {
    if (!query) return data;
    const q = query.toLowerCase();
    return data.filter(
      (d) =>
        d.species.toLowerCase().includes(q) ||
        localizePokemon(d.species, "ja").includes(q),
    );
  }, [data, query]);

  const selected = useMemo(
    () => data.find((d) => d.species === selectedSpecies),
    [data, selectedSpecies],
  );

  return (
    <div className="mx-auto flex max-w-5xl gap-4" style={{ height: "calc(100vh - 120px)" }}>
      {/* Left: Species list */}
      <aside className="viewer-scroll flex w-56 shrink-0 flex-col overflow-y-auto rounded border border-gray-800 bg-gray-900/40">
        <div className="sticky top-0 border-b border-gray-800 bg-gray-900 p-2">
          <input
            type="text"
            placeholder={lang === "ja" ? "検索..." : "Search..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <ul className="divide-y divide-gray-800/50">
          {filteredSpecies.map((sp) => (
            <li key={sp.species}>
              <button
                onClick={() => setSelectedSpecies(sp.species)}
                className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                  selectedSpecies === sp.species
                    ? "bg-blue-600/20 text-blue-300"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <div className="font-medium">{localizePokemon(sp.species, lang)}</div>
                <div className="text-[10px] text-gray-500">{sp.moves.length} moves</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Right: Move quality detail */}
      <div className="viewer-scroll flex-1 overflow-y-auto">
        {selected ? (
          <div>
            <h2 className="mb-3 text-lg font-bold text-gray-100">
              {localizePokemon(selected.species, lang)}
              <span className="ml-2 text-sm font-normal text-gray-500">
                — {lang === "ja" ? "技品質スコア" : "Move Quality Scores"}
              </span>
            </h2>

            <div className="space-y-1.5">
              {selected.moves.map((move) => (
                <div
                  key={move.name}
                  className="flex items-center gap-3 rounded bg-gray-900/60 px-3 py-2"
                >
                  <div className="w-36 shrink-0 text-xs text-gray-200">
                    {localizeMove(move.name, lang)}
                  </div>

                  {/* Score bar */}
                  <div className="h-3 flex-1 overflow-hidden rounded bg-gray-800">
                    <div
                      className={`h-full rounded ${scoreBg(move.avgScore)}`}
                      style={{ width: `${move.avgScore * 100}%` }}
                    />
                  </div>

                  <span className={`w-14 text-right text-xs font-mono ${scoreColor(move.avgScore)}`}>
                    {fmtScore(move.avgScore)}
                  </span>

                  <span className="w-12 text-right text-[10px] text-gray-600">
                    n={move.usageCount}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11px] text-gray-600">
              {lang === "ja"
                ? "スコアは「この技を使ったとき勝率が高いか」のGBDT予測値。高い=勝ちに貢献、低い=負けパターンに多い。"
                : "Score = GBDT-predicted probability that using this move leads to a win. Higher = more correlated with winning."}
            </p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {lang === "ja" ? "ポケモンを選択してください" : "Select a Pokemon"}
          </div>
        )}
      </div>
    </div>
  );
}
