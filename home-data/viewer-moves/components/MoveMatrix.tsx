import React, { useMemo } from "react";
import type { PoolMember } from "../../types/team-matchup";
import { computeMoveMatrix, type MoveMatrixData } from "../moveCalc";
import { localizePokemon, localizeMove, type Lang } from "../../viewer/i18n";

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-500", Grass: "bg-green-500", Ice: "bg-cyan-400",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-700",
  Flying: "bg-sky-400", Psychic: "bg-pink-500", Bug: "bg-lime-600",
  Rock: "bg-yellow-800", Ghost: "bg-indigo-600", Dragon: "bg-indigo-500",
  Dark: "bg-gray-700", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

function koLabel(koN: number, koChance: number): string {
  if (koN === 0) return "-";
  const prefix = koN === 1 ? "確1" : koN === 2 ? "確2" : koN === 3 ? "確3" : "確4";
  if (koChance >= 1.0) return prefix;
  return `${prefix} ${Math.round(koChance * 100)}%`;
}

function koLabelEn(koN: number, koChance: number): string {
  if (koN === 0) return "-";
  const prefix = koN === 1 ? "OHKO" : koN === 2 ? "2HKO" : koN === 3 ? "3HKO" : "4HKO";
  if (koChance >= 1.0) return prefix;
  return `${prefix} ${Math.round(koChance * 100)}%`;
}

function cellColor(effectiveness: number, maxPct: number): string {
  if (effectiveness === 0) return "bg-gray-900/50 text-gray-600";
  if (effectiveness < 1) return "bg-red-900/30 text-red-400/80";
  if (effectiveness > 1 && maxPct >= 100) return "bg-emerald-900/60 text-emerald-300";
  if (effectiveness > 1) return "bg-emerald-900/30 text-emerald-400/80";
  if (maxPct >= 100) return "bg-lime-900/40 text-lime-300";
  if (maxPct >= 50) return "bg-gray-800/50 text-gray-200";
  return "bg-gray-800/30 text-gray-400";
}

interface Props {
  attacker: PoolMember;
  opponents: PoolMember[];
  lang: Lang;
}

export default function MoveMatrix({ attacker, opponents, lang }: Props) {
  const matrix: MoveMatrixData = useMemo(
    () => computeMoveMatrix(attacker, opponents),
    [attacker, opponents],
  );

  if (matrix.rows.length === 0) {
    return (
      <div className="text-gray-500 text-xs py-4 text-center">
        {lang === "ja" ? "技データなし" : "No move data"}
      </div>
    );
  }

  const validOpponents = opponents.filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left px-2 py-1.5 text-gray-400 font-medium w-36">
                {lang === "ja" ? "技" : "Move"}
              </th>
              {validOpponents.map((opp, i) => (
                <th key={i} className="text-center px-1 py-1.5 text-gray-400 font-medium min-w-[72px]">
                  <div className="truncate max-w-[72px]" title={opp.name}>
                    {localizePokemon(opp.name, lang)}
                  </div>
                </th>
              ))}
              <th className="text-center px-2 py-1.5 text-gray-400 font-medium w-16">
                {lang === "ja" ? "一貫性" : "Cover"}
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.moveName} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`${TYPE_COLORS[row.moveType] ?? "bg-gray-500"} rounded px-1 py-0.5 text-[10px] text-white leading-none`}>
                      {row.moveType.slice(0, 3)}
                    </span>
                    <span className="text-gray-200 font-medium truncate" title={row.moveName}>
                      {localizeMove(row.moveName, lang)}
                    </span>
                  </div>
                </td>
                {row.results.map((r, i) => (
                  <td key={i} className="px-1 py-1.5 text-center">
                    {r ? (
                      <div className={`rounded px-1 py-0.5 ${cellColor(r.effectiveness, r.maxPct)}`}>
                        <div className="tabular-nums text-[11px] font-medium">{r.maxPct.toFixed(1)}%</div>
                        <div className="text-[9px] opacity-80">
                          {lang === "ja" ? koLabel(r.koN, r.koChance) : koLabelEn(r.koN, r.koChance)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <div className="h-1.5 w-10 rounded bg-gray-800/60 overflow-hidden">
                      <div
                        className="h-full bg-blue-500/70 rounded"
                        style={{ width: `${row.consistency}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-gray-300 text-[10px]">{row.consistency}%</span>
                  </div>
                  {row.seCount > 0 && (
                    <div className="text-[9px] text-emerald-500 mt-0.5">
                      SE×{row.seCount}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matrix.bestCombo && (
        <div className="bg-gray-800/40 rounded px-3 py-2 text-xs">
          <span className="text-gray-400">
            {lang === "ja" ? "最適2技: " : "Best 2-move: "}
          </span>
          <span className="text-gray-200 font-medium">
            {matrix.bestCombo.moves.map((m) => localizeMove(m, lang)).join(" + ")}
          </span>
          <span className="text-blue-400 ml-2">
            = {matrix.bestCombo.coverage}% {lang === "ja" ? "カバー" : "coverage"}
          </span>
        </div>
      )}
    </div>
  );
}
