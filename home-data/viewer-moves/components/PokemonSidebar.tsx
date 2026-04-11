import React from "react";
import type { PoolMember } from "../../types/team-matchup";
import { localizePokemon, type Lang } from "../../viewer/i18n";

interface Props {
  pool: PoolMember[];
  selected: string | null;
  onSelect: (name: string) => void;
  query: string;
  lang: Lang;
}

export default function PokemonSidebar({ pool, selected, onSelect, query, lang }: Props) {
  const filtered = query
    ? pool.filter((p) => {
        const q = query.toLowerCase();
        const ja = localizePokemon(p.name, "ja").toLowerCase();
        return p.name.toLowerCase().includes(q) || ja.includes(q);
      })
    : pool;

  return (
    <div className="w-56 shrink-0 border-r border-gray-700 overflow-y-auto viewer-scroll">
      {filtered.map((p, i) => (
        <button
          key={p.name}
          onClick={() => onSelect(p.name)}
          className={`w-full text-left px-2.5 py-1.5 border-l-2 transition text-xs ${
            p.name === selected
              ? "border-blue-500 bg-gray-800/80"
              : "border-transparent hover:bg-gray-800/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-6 text-right tabular-nums shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-gray-200 truncate">
                {localizePokemon(p.name, lang)}
              </div>
              {lang === "ja" && (
                <div className="text-[10px] text-gray-500 truncate">{p.name}</div>
              )}
            </div>
            <span className="text-gray-500 tabular-nums text-[10px] shrink-0">
              {(p.overallScore ?? 0).toFixed(1)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
