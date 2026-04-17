import { useState, useMemo } from "react";
import type { PoolMember, DamageMatrix } from "../../types/team-matchup";
import type { Lang } from "../../viewer/i18n";
import { localizePokemon, localizeMove, localizeType, localizeNature } from "../../viewer/i18n";
import type { RoleClassification, MatchupDetail, MatchupColor } from "../builderCalc";
import { getRoleLabel } from "../builderCalc";
import type { SPGridData } from "../spAnalysisCalc";
import {
  analyzeSpeedTiers,
  computeDefensiveAnalysis,
  computeOffensiveAnalysis,
  koLabel,
} from "../spAnalysisCalc";
import { DefensiveThresholds } from "./DefensiveThresholds";
import { OffensiveThresholds } from "./OffensiveThresholds";
import { SpeedTierTable } from "./SpeedTierTable";

function formatSP(sp: PoolMember["sp"]): string {
  return `${sp.hp}-${sp.atk}-${sp.def}-${sp.spa}-${sp.spd}-${sp.spe}`;
}

const COLOR_MAP: Record<MatchupColor, string> = {
  favorable: "bg-green-900/40 border-green-700/50",
  marginal: "bg-yellow-900/30 border-yellow-700/50",
  unfavorable: "bg-red-900/30 border-red-700/50",
};

const VALUE_COLOR: Record<MatchupColor, string> = {
  favorable: "text-green-400",
  marginal: "text-yellow-400",
  unfavorable: "text-red-400",
};

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-400", Grass: "bg-green-500", Ice: "bg-cyan-300",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-600",
  Flying: "bg-indigo-300", Psychic: "bg-pink-500", Bug: "bg-lime-500",
  Rock: "bg-yellow-700", Ghost: "bg-purple-800", Dragon: "bg-indigo-600",
  Dark: "bg-gray-800", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

type MatchupFilter = "all" | "favorable" | "marginal" | "unfavorable";
type MainTab = "matchups" | "defensive" | "offensive" | "speed";

interface Props {
  name: string;
  member: PoolMember;
  role: RoleClassification;
  matchups: MatchupDetail[];
  pool: PoolMember[];
  matrix: DamageMatrix;
  poolSpeeds: Map<string, number>;
  spGrid?: SPGridData;
  lang: Lang;
}

export function PokemonRoleCard({ name, member, role, matchups, pool, matrix, poolSpeeds, spGrid, lang }: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("matchups");
  const [matchupFilter, setMatchupFilter] = useState<MatchupFilter>("all");

  const filtered = matchupFilter === "all" ? matchups : matchups.filter((m) => m.color === matchupFilter);

  const counts = {
    favorable: matchups.filter((m) => m.color === "favorable").length,
    marginal: matchups.filter((m) => m.color === "marginal").length,
    unfavorable: matchups.filter((m) => m.color === "unfavorable").length,
  };

  // Lazy computation: only compute active SP analysis tab
  // Grid-based: margins + upgrades computed in a single pass per direction
  const defAnalysis = useMemo(
    () => mainTab === "defensive"
      ? computeDefensiveAnalysis(member, pool, matrix, spGrid)
      : { safeMargins: [], upgrades: [] },
    [member, pool, matrix, spGrid, mainTab],
  );

  const offAnalysis = useMemo(
    () => mainTab === "offensive"
      ? computeOffensiveAnalysis(member, pool, matrix, spGrid)
      : { safeMargins: [], upgrades: [] },
    [member, pool, matrix, spGrid, mainTab],
  );

  const speedData = useMemo(
    () => mainTab === "speed"
      ? analyzeSpeedTiers(member, pool, matrix, poolSpeeds)
      : { tiers: [], scarfInfo: { scarfSpeed: 0, scarfMinSpeed: 0, scarfMaxSpeed: 0 } },
    [member, pool, matrix, poolSpeeds, mainTab],
  );

  const tabs: { key: MainTab; label: string }[] = [
    { key: "matchups", label: lang === "ja" ? "役割相手" : "Matchups" },
    { key: "defensive", label: lang === "ja" ? "防御閾値" : "Defensive" },
    { key: "offensive", label: lang === "ja" ? "攻撃閾値" : "Offensive" },
    { key: "speed", label: lang === "ja" ? "素早さ" : "Speed" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-xl font-bold">{localizePokemon(name, lang)}</h2>
        <div className="flex flex-wrap gap-1 mt-1">
          {member.types.map((t) => (
            <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-600"} rounded px-1.5 py-0.5 text-xs text-white`}>
              {localizeType(t, lang)}
            </span>
          ))}
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
            {localizeNature(member.nature, lang)}
          </span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
            {member.item}
          </span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
            {member.ability}
          </span>
        </div>

        {/* SP spread */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-400">SP:</span>
          <span className="font-mono text-xs text-gray-300">{formatSP(member.sp)}</span>
          <span className="text-[10px] text-gray-500">(H-A-B-C-D-S)</span>
        </div>

        {/* Moves */}
        <div className="mt-1 flex flex-wrap gap-1">
          {member.moves.map((m) => (
            <span key={m} className="rounded bg-gray-800 border border-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
              {localizeMove(m, lang)}
            </span>
          ))}
        </div>

        {/* Role badges + stats */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex gap-1">
            <span className="rounded bg-blue-800 px-2 py-0.5 text-xs text-blue-200">
              {getRoleLabel(role.primary)}
            </span>
            {role.secondary.map((r) => (
              <span key={r} className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                {getRoleLabel(r)}
              </span>
            ))}
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-green-400">{role.ohkoCount} <span className="text-gray-500">確1</span></span>
            <span className="text-yellow-400">{role.twoHkoCount} <span className="text-gray-500">確2</span></span>
            <span className="text-red-400">{role.cannotBeatCount} <span className="text-gray-500">{lang === "ja" ? "キツい" : "Lose"}</span></span>
            <span className="text-blue-400">{role.offensiveSpread}% <span className="text-gray-500">{lang === "ja" ? "カバー" : "Cov"}</span></span>
          </div>
        </div>
      </div>

      {/* Main 4-tab navigation */}
      <div className="flex gap-1 mb-2 border-b border-gray-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`rounded-t px-3 py-1 text-xs font-medium transition-colors ${
              mainTab === t.key
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {mainTab === "matchups" && (
        <div>
          {/* Matchup sub-filter */}
          <div className="flex gap-1 mb-2">
            {(["all", "unfavorable", "marginal", "favorable"] as MatchupFilter[]).map((f) => {
              const label =
                f === "all" ? `${lang === "ja" ? "全て" : "All"} (${matchups.length})`
                : f === "favorable" ? `${lang === "ja" ? "有利" : "Win"} (${counts.favorable})`
                : f === "marginal" ? `${lang === "ja" ? "微妙" : "Even"} (${counts.marginal})`
                : `${lang === "ja" ? "不利" : "Lose"} (${counts.unfavorable})`;
              return (
                <button
                  key={f}
                  onClick={() => setMatchupFilter(f)}
                  className={`rounded px-2 py-0.5 text-xs transition-colors
                    ${matchupFilter === f ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Matchup list */}
          <div className="grid gap-0.5">
            {filtered.map((m) => (
              <div
                key={m.opponent}
                className={`flex items-center gap-2 rounded border px-2 py-1 ${COLOR_MAP[m.color]}`}
              >
                <span className={`w-8 text-right font-mono text-xs ${VALUE_COLOR[m.color]}`}>
                  {m.value.toFixed(1)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium">
                    {localizePokemon(m.opponent, lang)}
                  </span>
                  <span className="ml-1.5">
                    {m.opponentTypes.map((t) => (
                      <span
                        key={t}
                        className={`${TYPE_COLORS[t] ?? "bg-gray-600"} ml-0.5 inline-block rounded px-0.5 text-[9px] text-white`}
                      >
                        {localizeType(t, lang)}
                      </span>
                    ))}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">
                  {localizeMove(m.bestMove, lang)}
                </span>
                <span className="text-[10px] text-gray-500 shrink-0 w-16 text-right">
                  {koLabel(m.koN, m.koChance)}
                </span>
                <span className="text-[10px] text-gray-500 shrink-0 w-20 text-right">
                  {m.minPct > 0 ? `${m.minPct.toFixed(1)}-${m.maxPct.toFixed(1)}%` : "0%"}
                </span>
                <span className={`text-[10px] shrink-0 w-4 text-center
                  ${m.speedComparison === "faster" ? "text-green-500" : m.speedComparison === "slower" ? "text-red-500" : "text-gray-500"}`}>
                  {m.speedComparison === "faster" ? "↑" : m.speedComparison === "slower" ? "↓" : "="}
                </span>
                <span className="text-[10px] text-gray-600 shrink-0 w-10 text-right">
                  {m.opponentUsagePct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mainTab === "defensive" && <DefensiveThresholds safeMargins={defAnalysis.safeMargins} upgrades={defAnalysis.upgrades} lang={lang} />}
      {mainTab === "offensive" && <OffensiveThresholds safeMargins={offAnalysis.safeMargins} upgrades={offAnalysis.upgrades} lang={lang} />}
      {mainTab === "speed" && (
        <SpeedTierTable entries={speedData.tiers} member={member} lang={lang} scarfInfo={speedData.scarfInfo} />
      )}
    </div>
  );
}
