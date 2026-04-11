import React from "react";
import type {
  RankedTeam,
  PoolMember,
  DamageMatrix,
  PokemonTeamStats,
} from "../../types/team-matchup";
import {
  localizePokemon,
  localizeMove,
  localizeItem,
  localizeAbility,
  localizeNature,
  localizeType,
} from "../../viewer/i18n";
import type { Lang } from "../../viewer/i18n";
import { DamageHeatmap } from "./DamageHeatmap";
import { SelectionSimulator } from "./SelectionSimulator";

interface TeamDetailProps {
  team: RankedTeam;
  pool: PoolMember[];
  matrix: DamageMatrix;
  pokemonStats: PokemonTeamStats[];
  lang: "ja" | "en";
}

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500",
  Fire: "bg-orange-500",
  Water: "bg-blue-500",
  Electric: "bg-yellow-400",
  Grass: "bg-green-500",
  Ice: "bg-cyan-400",
  Fighting: "bg-red-600",
  Poison: "bg-purple-500",
  Ground: "bg-amber-600",
  Flying: "bg-sky-400",
  Psychic: "bg-pink-500",
  Bug: "bg-lime-500",
  Rock: "bg-yellow-700",
  Ghost: "bg-indigo-500",
  Dragon: "bg-violet-600",
  Dark: "bg-gray-700",
  Steel: "bg-slate-400",
  Fairy: "bg-pink-300",
};

function TypeBadge({ type, lang }: { type: string; lang: Lang }) {
  const colorClass = TYPE_COLORS[type] ?? "bg-gray-600";
  return (
    <span
      className={`${colorClass} inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white`}
    >
      {localizeType(type, lang)}
    </span>
  );
}

export function TeamDetail({
  team,
  pool,
  matrix,
  pokemonStats,
  lang,
}: TeamDetailProps) {
  const t = {
    teamLabel: lang === "ja" ? "チーム" : "Team",
    winRate: lang === "ja" ? "勝率" : "Win Rate",
    record: lang === "ja" ? "戦績" : "Record",
    avgScore: lang === "ja" ? "平均スコア" : "Avg Score",
    wins: lang === "ja" ? "勝" : "W",
    losses: lang === "ja" ? "敗" : "L",
    draws: lang === "ja" ? "分" : "D",
    teamMembers: lang === "ja" ? "チームメンバー" : "Team Members",
    selectionPatterns:
      lang === "ja"
        ? "よく出る選出パターン"
        : "Common Selection Patterns",
    typeCoverage: lang === "ja" ? "タイプ範囲" : "Type Coverage",
    offensive: lang === "ja" ? "攻撃範囲" : "Offensive",
    defensiveWeaks: lang === "ja" ? "弱点" : "Weaknesses",
    frequency: lang === "ja" ? "出現率" : "Frequency",
    winRateLabel: lang === "ja" ? "勝率" : "Win Rate",
  };

  // Look up a pool member by name
  const findPool = (name: string): PoolMember | undefined =>
    pool.find((p) => p.name === name);

  return (
    <div className="space-y-4">
      {/* ── Section 1: Header ── */}
      <div className="rounded bg-gray-800/50 p-3">
        <h2 className="text-lg font-bold text-gray-100">
          {t.teamLabel} #{team.rank}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-300">
          <span>
            {t.winRate}:{" "}
            <span className="font-semibold text-gray-100">
              {(team.winRate * 100).toFixed(1)}%
            </span>
          </span>
          <span>
            {t.record}:{" "}
            <span className="text-green-400">
              {team.wins}
              {t.wins}
            </span>
            {" / "}
            <span className="text-red-400">
              {team.losses}
              {t.losses}
            </span>
            {" / "}
            <span className="text-gray-400">
              {team.draws}
              {t.draws}
            </span>
          </span>
          <span>
            {t.avgScore}:{" "}
            <span className="font-semibold text-gray-100">
              {team.avgScore.toFixed(1)}
            </span>
          </span>
        </div>
      </div>

      {/* ── Section 2: Team Members ── */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">
          {t.teamMembers}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {team.members.map((name) => {
            const member = findPool(name);
            return (
              <div key={name} className="rounded bg-gray-800/50 p-3">
                {/* Name */}
                <div className="text-sm font-semibold text-gray-100 mb-1">
                  {localizePokemon(name, lang)}
                </div>

                {/* Type badges */}
                {member && (
                  <div className="flex gap-1 mb-2">
                    {member.types.map((type) => (
                      <TypeBadge key={type} type={type} lang={lang} />
                    ))}
                  </div>
                )}

                {/* Build info */}
                {member && (
                  <div className="text-xs text-gray-300 space-y-0.5 mb-2">
                    <div>{localizeNature(member.nature, lang)}</div>
                    <div>{localizeItem(member.item, lang)}</div>
                    <div>{localizeAbility(member.ability, lang)}</div>
                    {member.isMega && (
                      <div className="text-amber-400 font-bold text-[10px]">MEGA</div>
                    )}
                  </div>
                )}

                {/* Singles ranking scores */}
                {member && member.overallScore != null && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400 tabular-nums">
                      {lang === "ja" ? "総合" : "OVR"} {member.overallScore.toFixed(1)}
                    </span>
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400 tabular-nums">
                      {lang === "ja" ? "攻" : "ATK"} {member.offensiveScore?.toFixed(1)}
                    </span>
                    <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-400 tabular-nums">
                      {lang === "ja" ? "防" : "DEF"} {member.defensiveScore?.toFixed(1)}
                    </span>
                    {member.sustainedScore != null && (
                      <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-400 tabular-nums">
                        {lang === "ja" ? "継戦" : "SUS"} {member.sustainedScore.toFixed(1)}
                      </span>
                    )}
                    {member.sweepPotential != null && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                        member.sweepPotential >= 3.0 ? "bg-orange-400/15 text-orange-400"
                          : member.sweepPotential >= 2.0 ? "bg-amber-400/15 text-amber-400"
                          : "bg-gray-400/15 text-gray-400"
                      }`}>
                        ×{member.sweepPotential.toFixed(1)}
                      </span>
                    )}
                    {member.speedTier && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                        member.speedTier === "fast" ? "bg-emerald-400/15 text-emerald-400"
                          : member.speedTier === "mid" ? "bg-yellow-400/15 text-yellow-400"
                          : "bg-red-400/15 text-red-400"
                      }`}>
                        S{member.speedStat}
                      </span>
                    )}
                  </div>
                )}

                {/* Moves */}
                {member && member.moves.length > 0 && (
                  <ul className="text-xs text-gray-500 space-y-0.5">
                    {member.moves.map((move) => (
                      <li key={move}>- {localizeMove(move, lang)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Selection Patterns ── */}
      {team.commonSelections.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 mb-2">
            {t.selectionPatterns}
          </h3>
          <div className="space-y-2">
            {team.commonSelections.slice(0, 3).map((pattern, i) => (
              <div key={i} className="rounded bg-gray-800/50 p-3">
                {/* Pokemon names */}
                <div className="flex gap-2 text-sm text-gray-100 mb-2">
                  {pattern.members.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-gray-700 px-2 py-0.5"
                    >
                      {localizePokemon(name, lang)}
                    </span>
                  ))}
                </div>
                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-300">
                  <span>
                    {t.frequency}:{" "}
                    {(pattern.frequency * 100).toFixed(1)}%
                  </span>
                  <span>
                    {t.winRateLabel}:{" "}
                    {(pattern.winRate * 100).toFixed(1)}%
                  </span>
                </div>
                {/* Win rate bar */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-700">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(pattern.winRate * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4: Type Profile ── */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 mb-2">
          {t.typeCoverage}
        </h3>
        <div className="rounded bg-gray-800/50 p-3 space-y-3">
          {/* Offensive types */}
          <div>
            <span className="text-xs font-medium text-green-400">
              {t.offensive}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {team.typeProfile.offensiveTypes.map((type) => (
                <TypeBadge key={type} type={type} lang={lang} />
              ))}
              {team.typeProfile.offensiveTypes.length === 0 && (
                <span className="text-xs text-gray-500">-</span>
              )}
            </div>
          </div>
          {/* Defensive weaknesses */}
          <div>
            <span className="text-xs font-medium text-red-400">
              {t.defensiveWeaks}
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {team.typeProfile.defensiveWeaks.map((type) => (
                <TypeBadge key={type} type={type} lang={lang} />
              ))}
              {team.typeProfile.defensiveWeaks.length === 0 && (
                <span className="text-xs text-gray-500">-</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 5: Damage Heatmap ── */}
      <DamageHeatmap members={team.members} matrix={matrix} lang={lang} />

      {/* ── Section 6: Selection Simulator ── */}
      <SelectionSimulator
        myTeam={team.members}
        pool={pool}
        matrix={matrix}
        lang={lang}
      />
    </div>
  );
}
