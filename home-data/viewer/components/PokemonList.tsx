/**
 * Left-pane Pokemon list. Displays rank, name, usage %, win rate, and the
 * data-source badges. Selected row is highlighted via a left border and
 * elevated background.
 */

import type { PokemonMeta } from "../../types/analytics";
import { useLang } from "../LanguageContext";
import { localizePokemon } from "../i18n";
import { PokemonIcon } from "../PokemonIcon";
import {
  extractVgcpastGames,
  formatPct,
  hasPikalyticsNote,
  hasVgcpastNote,
} from "../utils";

interface PokemonListProps {
  pokemon: PokemonMeta[];
  selected: string | undefined;
  onSelect: (name: string) => void;
}

export function PokemonList({ pokemon, selected, onSelect }: PokemonListProps) {
  const { lang } = useLang();
  if (!pokemon.length) {
    return (
      <div className="p-4 text-sm text-gray-400">
        No Pokemon match the current filters.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-800">
      {pokemon.map((mon, index) => {
        const isSelected = mon.name === selected;
        const games = extractVgcpastGames(mon);
        const primaryName = localizePokemon(mon.name, lang);
        const subName =
          lang === "ja"
            ? primaryName !== mon.name
              ? mon.name
              : undefined
            : localizePokemon(mon.name, "ja") !== mon.name
              ? localizePokemon(mon.name, "ja")
              : undefined;
        return (
          <li key={mon.name}>
            <button
              type="button"
              onClick={() => onSelect(mon.name)}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left transition",
                "hover:bg-gray-800/60",
                isSelected
                  ? "bg-gray-800/80 border-l-4 border-blue-500"
                  : "border-l-4 border-transparent",
              ].join(" ")}
            >
              <div className="w-8 shrink-0 text-right text-xs tabular-nums text-gray-500">
                #{index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-gray-100">
                  <PokemonIcon name={mon.name} size="w-6 h-6" />{" "}
                  {primaryName}
                </div>
                {subName && (
                  <div className="truncate text-[10px] text-gray-500">
                    {subName}
                  </div>
                )}
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                  {hasPikalyticsNote(mon) && (
                    <span className="rounded bg-blue-500/20 px-1 py-0.5 text-blue-300">
                      Pika
                    </span>
                  )}
                  {hasVgcpastNote(mon) && (
                    <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-emerald-300">
                      vgcpast {games}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm tabular-nums text-gray-200">
                  {formatPct(mon.usagePct)}
                </div>
                {mon.winRate !== undefined && (
                  <div className="text-[10px] tabular-nums text-gray-500">
                    wr {formatPct(mon.winRate, 1)}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
