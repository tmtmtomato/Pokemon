import { useState, useMemo } from "react";
import type { PoolMember, DamageMatrix } from "../../types/team-matchup";
import type { Lang } from "../../viewer/i18n";
import { localizePokemon, localizeType, localizeMove, localizeNature } from "../../viewer/i18n";

function formatSP(sp: PoolMember["sp"]): string {
  return `${sp.hp}-${sp.atk}-${sp.def}-${sp.spa}-${sp.spd}-${sp.spe}`;
}

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-400", Grass: "bg-green-500", Ice: "bg-cyan-300",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-600",
  Flying: "bg-indigo-300", Psychic: "bg-pink-500", Bug: "bg-lime-500",
  Rock: "bg-yellow-700", Ghost: "bg-purple-800", Dragon: "bg-indigo-600",
  Dark: "bg-gray-800", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

type SortKey = "complement" | "overall" | "name" | "speed" | "usage";

interface Props {
  pool: PoolMember[];
  complementMap: Map<string, number>;
  poolByName: Map<string, PoolMember>;
  poolSpeeds: Map<string, number>;
  matrix: DamageMatrix;
  lang: Lang;
  teamSize: number;
  onSelect: (name: string) => void;
}

export function PoolBrowser({
  pool, complementMap, lang, teamSize, onSelect,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>(teamSize > 0 ? "complement" : "overall");

  const sorted = useMemo(() => {
    const list = [...pool];
    switch (sortKey) {
      case "complement":
        list.sort((a, b) => (complementMap.get(b.name) ?? 0) - (complementMap.get(a.name) ?? 0));
        break;
      case "overall":
        list.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
        break;
      case "name":
        list.sort((a, b) => {
          const aName = localizePokemon(a.name, lang);
          const bName = localizePokemon(b.name, lang);
          return aName.localeCompare(bName, lang === "ja" ? "ja" : "en");
        });
        break;
      case "speed":
        list.sort((a, b) => (b.speedStat ?? 0) - (a.speedStat ?? 0));
        break;
      case "usage":
        list.sort((a, b) => b.usagePct - a.usagePct);
        break;
    }
    return list;
  }, [pool, sortKey, complementMap, lang]);

  return (
    <div>
      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">
          {lang === "ja" ? "並び替え:" : "Sort:"}
        </span>
        {(["complement", "overall", "usage", "speed", "name"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`rounded px-2 py-0.5 text-xs transition-colors
              ${sortKey === k ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
          >
            {{
              complement: lang === "ja" ? "補完" : "Complement",
              overall: lang === "ja" ? "総合" : "Overall",
              usage: lang === "ja" ? "使用率" : "Usage",
              speed: lang === "ja" ? "素早さ" : "Speed",
              name: lang === "ja" ? "名前" : "Name",
            }[k]}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{pool.length} {lang === "ja" ? "体" : ""}</span>
      </div>

      {/* List */}
      <div className="grid gap-1">
        {sorted.map((p) => {
          const compScore = complementMap.get(p.name) ?? 0;
          return (
            <button
              key={p.name}
              onClick={() => onSelect(p.name)}
              className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800/30 px-3 py-1.5 text-left hover:border-gray-500 hover:bg-gray-800 transition-colors"
            >
              {/* Complement score indicator */}
              {teamSize > 0 && (
                <div className="w-8 shrink-0">
                  <div className="h-1 rounded bg-gray-700">
                    <div
                      className="h-full rounded bg-blue-500"
                      style={{ width: `${Math.min(compScore * 100, 100)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-center text-gray-500">
                    {Math.round(compScore * 100)}
                  </div>
                </div>
              )}

              {/* Name + types */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {localizePokemon(p.name, lang)}
                </div>
                <div className="flex gap-0.5 mt-0.5">
                  {p.types.map((t) => (
                    <span
                      key={t}
                      className={`${TYPE_COLORS[t] ?? "bg-gray-600"} rounded px-0.5 text-[9px] text-white`}
                    >
                      {localizeType(t, lang)}
                    </span>
                  ))}
                  {p.isMega && (
                    <span className="rounded bg-gradient-to-r from-purple-600 to-pink-600 px-0.5 text-[9px] text-white">
                      Mega
                    </span>
                  )}
                </div>
              </div>

              {/* Nature + SP + Moves */}
              <div className="shrink-0 text-[10px] text-gray-400 text-right space-y-0.5">
                <div>{localizeNature(p.nature, lang)} / {p.item}</div>
                <div className="font-mono text-gray-500">{formatSP(p.sp)}</div>
              </div>
              <div className="shrink-0 w-32 text-[9px] text-gray-500 truncate text-right" title={p.moves.join(", ")}>
                {p.moves.map((m) => localizeMove(m, lang)).join(", ")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
