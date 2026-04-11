import React, { useState, useMemo } from "react";
import type { PoolMember, RankedTeam } from "../../types/team-matchup";
import { localizePokemon, type Lang } from "../../viewer/i18n";
import MoveMatrix from "./MoveMatrix";
import OpponentSelector from "./OpponentSelector";
import { computeTeamCoverage } from "../moveCalc";

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-500", Grass: "bg-green-500", Ice: "bg-cyan-400",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-700",
  Flying: "bg-sky-400", Psychic: "bg-pink-500", Bug: "bg-lime-600",
  Rock: "bg-yellow-800", Ghost: "bg-indigo-600", Dragon: "bg-indigo-500",
  Dark: "bg-gray-700", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

interface Props {
  team: RankedTeam;
  pool: PoolMember[];
  topTeams: RankedTeam[];
  lang: Lang;
}

export default function TeamMoveDetail({ team, pool, topTeams, lang }: Props) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<(PoolMember | null)[]>([null, null, null, null, null, null]);

  const poolByName = useMemo(
    () => new Map(pool.map((p) => [p.name, p])),
    [pool],
  );

  const members = useMemo(
    () => team.members.map((name) => poolByName.get(name)).filter((p): p is PoolMember => !!p),
    [team, poolByName],
  );

  const validOpponents = useMemo(
    () => opponents.filter((o): o is PoolMember => o !== null),
    [opponents],
  );

  const teamCoverage = useMemo(() => {
    if (validOpponents.length === 0) return null;
    return computeTeamCoverage(members, validOpponents);
  }, [members, validOpponents]);

  return (
    <div className="space-y-4 p-4">
      {/* Team header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-gray-100">
          {lang === "ja" ? `チーム #${team.rank}` : `Team #${team.rank}`}
        </h2>
        <span className="text-emerald-400 font-medium tabular-nums">
          {(team.winRate * 100).toFixed(1)}%
        </span>
        <span className="text-gray-500 text-xs">{team.wins}W/{team.losses}L</span>
      </div>

      {/* Opponent selector (reuses shared component) */}
      <OpponentSelector
        opponents={opponents}
        onSetOpponents={setOpponents}
        pool={pool}
        topTeams={topTeams.filter((t) => t.teamId !== team.teamId)}
        lang={lang}
      />

      {/* Team coverage summary */}
      {teamCoverage && (
        <div className="bg-gray-800/40 rounded px-3 py-2 text-xs flex items-center gap-2">
          <span className="text-gray-400">
            {lang === "ja" ? "チーム技カバレッジ:" : "Team move coverage:"}
          </span>
          <span className={`font-medium tabular-nums ${
            teamCoverage.covered === teamCoverage.total ? "text-emerald-400" : "text-amber-400"
          }`}>
            {teamCoverage.covered}/{teamCoverage.total}
            ({Math.round((teamCoverage.covered / teamCoverage.total) * 100)}%)
          </span>
        </div>
      )}

      {/* Team members with expandable move analysis */}
      {members.map((member) => {
        const isExpanded = expandedMember === member.name;
        return (
          <div key={member.name} className="border border-gray-700/50 rounded overflow-hidden">
            <button
              onClick={() => setExpandedMember(isExpanded ? null : member.name)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 bg-gray-800/30 hover:bg-gray-800/60 transition"
            >
              <span className={`text-xs transition ${isExpanded ? "rotate-90" : ""}`}>
                ▶
              </span>
              <span className="text-sm font-medium text-gray-200">
                {localizePokemon(member.name, lang)}
              </span>
              <div className="flex gap-1">
                {member.types.map((t) => (
                  <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-500"} rounded px-1 py-0.5 text-[9px] text-white`}>
                    {t}
                  </span>
                ))}
              </div>
              {member.isMega && (
                <span className="rounded bg-purple-600/60 px-1 py-0.5 text-[9px] text-purple-200">
                  MEGA
                </span>
              )}
              <div className="flex-1" />
              <span className="text-[10px] text-gray-500">
                {member.nature} / {member.item}
              </span>
            </button>

            {isExpanded && (
              <div className="px-3 py-2 border-t border-gray-700/50">
                {validOpponents.length > 0 ? (
                  <MoveMatrix attacker={member} opponents={validOpponents} lang={lang} />
                ) : (
                  <div className="text-center text-gray-500 text-xs py-4">
                    {lang === "ja"
                      ? "上から相手チームを選択してください"
                      : "Select opponents above"}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
