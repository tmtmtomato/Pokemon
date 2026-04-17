import type { PoolMember } from "../../types/team-matchup";
import type { Lang } from "../../viewer/i18n";
import { localizePokemon, localizeType } from "../../viewer/i18n";
import type { ToughOpponent } from "../builderCalc";

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-400", Grass: "bg-green-500", Ice: "bg-cyan-300",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-600",
  Flying: "bg-indigo-300", Psychic: "bg-pink-500", Bug: "bg-lime-500",
  Rock: "bg-yellow-700", Ghost: "bg-purple-800", Dragon: "bg-indigo-600",
  Dark: "bg-gray-800", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

interface Props {
  toughOpponents: ToughOpponent[];
  poolByName: Map<string, PoolMember>;
  team: string[];
  totalPool: number;
  lang: Lang;
}

export function GapAnalysis({ toughOpponents, team, totalPool, lang }: Props) {
  if (team.length === 0) {
    return (
      <div className="p-2 text-sm text-gray-500">
        {lang === "ja"
          ? "ポケモンを選んで構築を開始しましょう"
          : "Pick a Pokemon to start building"}
      </div>
    );
  }

  const answeredCount = totalPool - team.length - toughOpponents.length;
  const answeredPct = totalPool > 0 ? Math.round((answeredCount / (totalPool - team.length)) * 100) : 0;

  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {lang === "ja" ? "キツい相手" : "Tough Opponents"}
        </h3>
        <span className="text-xs text-gray-500">
          {toughOpponents.length} / {totalPool - team.length}
        </span>
      </div>

      {/* Coverage bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
          <span>{lang === "ja" ? "カバー率" : "Coverage"}</span>
          <span>{answeredPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded bg-gray-700">
          <div
            className="h-full rounded bg-green-500 transition-all"
            style={{ width: `${answeredPct}%` }}
          />
        </div>
      </div>

      {/* Tough opponent list */}
      <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
        {toughOpponents.map((t) => (
          <div
            key={t.name}
            className="flex items-center gap-1.5 rounded bg-gray-800/50 px-2 py-1"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {localizePokemon(t.name, lang)}
              </div>
              <div className="flex gap-0.5">
                {t.types.map((tp) => (
                  <span
                    key={tp}
                    className={`${TYPE_COLORS[tp] ?? "bg-gray-600"} rounded px-0.5 text-[9px] text-white`}
                  >
                    {localizeType(tp, lang)}
                  </span>
                ))}
              </div>
            </div>
            <span className="text-[10px] text-gray-500 whitespace-nowrap">
              {t.usagePct.toFixed(1)}%
            </span>
            {t.usagePct >= 5 && (
              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" title="High usage" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
