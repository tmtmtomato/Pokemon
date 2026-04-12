import React from "react";
import type { PoolMember, RankedTeam } from "../../types/team-matchup";
import { localizePokemon, localizeMove, localizeItem, localizeAbility, natureDisplay, type Lang } from "../../viewer/i18n";
import MoveMatrix from "./MoveMatrix";
import OpponentSelector from "./OpponentSelector";

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-500", Grass: "bg-green-500", Ice: "bg-cyan-400",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-700",
  Flying: "bg-sky-400", Psychic: "bg-pink-500", Bug: "bg-lime-600",
  Rock: "bg-yellow-800", Ghost: "bg-indigo-600", Dragon: "bg-indigo-500",
  Dark: "bg-gray-700", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

interface Props {
  pokemon: PoolMember;
  opponents: (PoolMember | null)[];
  onSetOpponents: (opps: (PoolMember | null)[]) => void;
  pool: PoolMember[];
  topTeams: RankedTeam[];
  lang: Lang;
}

export default function MoveConsistencyDetail({
  pokemon,
  opponents,
  onSetOpponents,
  pool,
  topTeams,
  lang,
}: Props) {
  const validOpponents = opponents.filter((o): o is PoolMember => o !== null);

  return (
    <div className="space-y-4 p-4">
      {/* Pokemon header */}
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-100">
            {localizePokemon(pokemon.name, lang)}
          </h2>
          {lang === "ja" && (
            <div className="text-xs text-gray-500">{pokemon.name}</div>
          )}
        </div>
        <div className="flex gap-1">
          {pokemon.types.map((t) => (
            <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-500"} rounded px-1.5 py-0.5 text-[10px] text-white`}>
              {t}
            </span>
          ))}
        </div>
        {pokemon.isMega && (
          <span className="rounded bg-purple-600/60 px-1.5 py-0.5 text-[10px] text-purple-200">
            MEGA
          </span>
        )}
      </div>

      {/* Build info */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        <span>
          {lang === "ja" ? "性格" : "Nature"}: <span className="text-gray-300">{natureDisplay(pokemon.nature, lang)}</span>
        </span>
        <span>
          {lang === "ja" ? "持ち物" : "Item"}: <span className="text-gray-300">{localizeItem(pokemon.item, lang)}</span>
        </span>
        <span>
          {lang === "ja" ? "特性" : "Ability"}: <span className="text-gray-300">{localizeAbility(pokemon.ability, lang)}</span>
        </span>
        <span>
          SP: <span className="text-gray-300 tabular-nums">
            {(["hp","atk","def","spa","spd","spe"] as const).map((k, i) => {
              const v = pokemon.sp[k];
              const l = ["H","A","B","C","D","S"][i];
              return <span key={k} className={`mr-1 ${v >= 32 ? "text-emerald-400 font-bold" : v > 0 ? "text-gray-300" : "text-gray-600"}`}>{l}{v}</span>;
            })}
          </span>
        </span>
        <span>
          {lang === "ja" ? "技" : "Moves"}: <span className="text-gray-300">{pokemon.moves.map((m) => localizeMove(m, lang)).join(", ")}</span>
        </span>
      </div>

      {/* Singles scores compact */}
      <div className="flex gap-3 text-xs">
        <div className="bg-gray-800/50 rounded px-2.5 py-1.5">
          <span className="text-gray-500">{lang === "ja" ? "総合" : "Overall"}: </span>
          <span className="text-blue-400 font-medium tabular-nums">{(pokemon.overallScore ?? 0).toFixed(1)}</span>
        </div>
        <div className="bg-gray-800/50 rounded px-2.5 py-1.5">
          <span className="text-gray-500">ATK: </span>
          <span className="text-rose-400 font-medium tabular-nums">{(pokemon.offensiveScore ?? 0).toFixed(1)}</span>
        </div>
        <div className="bg-gray-800/50 rounded px-2.5 py-1.5">
          <span className="text-gray-500">DEF: </span>
          <span className="text-cyan-400 font-medium tabular-nums">{(pokemon.defensiveScore ?? 0).toFixed(1)}</span>
        </div>
        <div className="bg-gray-800/50 rounded px-2.5 py-1.5">
          <span className="text-gray-500">SPE: </span>
          <span className="text-teal-400 font-medium tabular-nums">{pokemon.speedStat ?? 0}</span>
        </div>
      </div>

      {/* Opponent selector */}
      <OpponentSelector
        opponents={opponents}
        onSetOpponents={onSetOpponents}
        pool={pool}
        topTeams={topTeams}
        lang={lang}
      />

      {/* Move Matrix */}
      {validOpponents.length > 0 ? (
        <MoveMatrix attacker={pokemon} opponents={validOpponents} lang={lang} />
      ) : (
        <div className="text-center text-gray-500 text-xs py-8">
          {lang === "ja"
            ? "相手チームを選択すると技一貫性マトリックスが表示されます"
            : "Select opponent team to see move consistency matrix"}
        </div>
      )}
    </div>
  );
}
