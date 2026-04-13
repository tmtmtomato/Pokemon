/**
 * Right panel: detailed score breakdown and build info for a selected Pokemon.
 */

import { useState, useEffect } from "react";
import type { RankedPokemon, PokemonBuild, MoveStats } from "../../types/singles-ranking";
import { localizePokemon, localizeMove, localizeItem, localizeNature, localizeAbility, localizeType } from "../../viewer/i18n";
import { PokemonIcon } from "../../viewer/PokemonIcon";
import { ScoreBar } from "./ScoreBar";
import { MatchupGrid } from "./MatchupGrid";

interface PokemonPowerDetailProps {
  pokemon: RankedPokemon;
  lang: "ja" | "en";
}

const SP_LABELS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const;
const SP_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

function spColor(val: number): string {
  if (val >= 32) return "text-emerald-400 font-bold";
  if (val > 0) return "text-gray-300";
  return "text-gray-600";
}

function BuildTab({
  build,
  lang,
  index,
  isActive,
  onClick,
}: {
  build: PokemonBuild;
  lang: "ja" | "en";
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const nature = lang === "ja" ? localizeNature(build.config.nature, "ja") : build.config.nature;
  const item = lang === "ja" ? localizeItem(build.config.item, "ja") : build.config.item;
  const shortLabel = `${nature}/${item}`;
  return (
    <button
      onClick={onClick}
      className={`rounded-t px-3 py-1 text-xs transition truncate max-w-48 ${
        isActive
          ? "bg-gray-800 text-gray-100 border-b-2 border-blue-500"
          : "bg-gray-900 text-gray-500 hover:bg-gray-800/60 hover:text-gray-300"
      }`}
      title={`Build ${index + 1}: ${build.config.nature} / ${build.config.item}`}
    >
      {shortLabel}
    </button>
  );
}

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-400", Grass: "bg-green-500", Ice: "bg-cyan-400",
  Fighting: "bg-red-600", Poison: "bg-purple-500", Ground: "bg-amber-600",
  Flying: "bg-sky-400", Psychic: "bg-pink-500", Bug: "bg-lime-500",
  Rock: "bg-yellow-700", Ghost: "bg-indigo-500", Dragon: "bg-violet-600",
  Dark: "bg-gray-700", Steel: "bg-slate-400", Fairy: "bg-pink-300",
};

function MoveStatsTable({ moveStats, lang }: { moveStats: MoveStats[]; lang: "ja" | "en" }) {
  if (!moveStats || moveStats.length === 0) return null;

  const headers = lang === "ja"
    ? ["技", "タイプ", "一貫性", "抜群", "平均ダメ", "確1率", "確2率"]
    : ["Move", "Type", "Coverage", "SE%", "AvgDmg", "OHKO%", "2HKO%"];

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 mb-2">
        {lang === "ja" ? "技別スコア" : "Per-Move Stats"}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              {headers.map((h) => (
                <th key={h} className="text-left py-1 px-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {moveStats.map((ms) => (
              <tr key={ms.name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-1.5 px-2 text-gray-200 font-medium">
                  {lang === "ja" ? localizeMove(ms.name, "ja") : ms.name}
                </td>
                <td className="py-1.5 px-2">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] text-white ${TYPE_COLORS[ms.type] ?? "bg-gray-600"}`}>
                    {localizeType(ms.type, lang)}
                  </span>
                </td>
                <td className="py-1.5 px-2 tabular-nums text-gray-300">
                  <CellBar value={ms.coverage} color="bg-blue-500/60" />
                </td>
                <td className="py-1.5 px-2 tabular-nums text-emerald-400">
                  <CellBar value={ms.seCoverage} color="bg-emerald-500/60" />
                </td>
                <td className="py-1.5 px-2 tabular-nums text-gray-300">
                  {ms.avgDamage.toFixed(1)}%
                </td>
                <td className={`py-1.5 px-2 tabular-nums ${ms.ohkoRate > 0 ? "text-rose-400" : "text-gray-600"}`}>
                  {ms.ohkoRate.toFixed(1)}%
                </td>
                <td className={`py-1.5 px-2 tabular-nums ${ms.twoHkoRate > 20 ? "text-amber-400" : ms.twoHkoRate > 0 ? "text-gray-300" : "text-gray-600"}`}>
                  {ms.twoHkoRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Tiny inline bar with numeric label for table cells */
function CellBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-2 w-16 rounded bg-gray-800/70 overflow-hidden">
        <div className={`absolute inset-y-0 left-0 rounded ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span>{value.toFixed(1)}%</span>
    </div>
  );
}

function BuildDetail({ build, lang }: { build: PokemonBuild; lang: "ja" | "en" }) {
  const c = build.config;
  return (
    <div className="space-y-4">
      {/* Config summary */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-300">
        <span>
          <span className="text-gray-500">{lang === "ja" ? "性格" : "Nature"}: </span>
          {lang === "ja" ? localizeNature(c.nature, "ja") : c.nature}
        </span>
        <span>
          <span className="text-gray-500">{lang === "ja" ? "持ち物" : "Item"}: </span>
          {lang === "ja" ? localizeItem(c.item, "ja") : c.item}
        </span>
        <span>
          <span className="text-gray-500">{lang === "ja" ? "特性" : "Ability"}: </span>
          {lang === "ja" ? localizeAbility(c.ability, "ja") : c.ability}
        </span>
        {c.isMega && <span className="text-amber-400 font-bold">MEGA</span>}
        <span className="text-gray-600">
          wt: {(c.weight * 100).toFixed(1)}%
        </span>
      </div>

      {/* SP spread + speed info */}
      <div className="flex items-end gap-6">
        <div className="flex gap-4">
          {SP_KEYS.map((key, i) => (
            <div key={key} className="text-center">
              <div className="text-[10px] text-gray-500">{SP_LABELS[i]}</div>
              <div className={`text-sm tabular-nums ${spColor(c.sp[key])}`}>{c.sp[key]}</div>
            </div>
          ))}
        </div>
        {/* Per-build speed metrics */}
        <div className="flex gap-4 text-xs border-l border-gray-700 pl-4">
          <div className="text-center">
            <div className="text-[10px] text-gray-500">{lang === "ja" ? "実数値" : "Speed"}</div>
            <div className="text-sm tabular-nums text-teal-400 font-semibold">{build.scores.speedStat}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500">{lang === "ja" ? "上取り" : "Adv"}</div>
            <div className="text-sm tabular-nums text-teal-400">{build.scores.speedAdvantage.toFixed(0)}%</div>
          </div>
          <span className={`self-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
            build.scores.speedTier === "fast" ? "bg-emerald-400/15 text-emerald-400"
              : build.scores.speedTier === "mid" ? "bg-yellow-400/15 text-yellow-400"
              : "bg-red-400/15 text-red-400"
          }`}>
            {build.scores.speedTier === "fast" ? (lang === "ja" ? "高速" : "Fast")
              : build.scores.speedTier === "mid" ? (lang === "ja" ? "中速" : "Mid")
              : (lang === "ja" ? "低速" : "Slow")}
          </span>
        </div>
      </div>

      {/* Per-move stats table */}
      <MoveStatsTable moveStats={build.moveStats} lang={lang} />

      {/* Defensive scores */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 mb-2">
          {lang === "ja" ? "防御指標" : "Defensive Scores"}
        </h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ScoreBar label={lang === "ja" ? "耐久一貫" : "Def.Cons."} value={build.scores.defensiveConsistency} accent="cyan" />
          <ScoreBar label={lang === "ja" ? "被確1回避" : "Survival"} value={build.scores.survivalRate} accent="emerald" />
          <ScoreBar label={lang === "ja" ? "耐久指数" : "Tankiness"} value={Math.min(100, build.scores.tankinessIndex * 20)} accent="violet" />
        </div>
      </div>

      {/* Matchups */}
      <div className="grid grid-cols-2 gap-4">
        <MatchupGrid
          title={lang === "ja" ? "確1取れる相手" : "Best Offensive"}
          matchups={build.bestOffensiveMatchups}
          lang={lang}
          mode="offensive"
        />
        <MatchupGrid
          title={lang === "ja" ? "脅威となる攻撃" : "Most Threatening"}
          matchups={build.mostThreateningAttackers}
          lang={lang}
          mode="defensive"
        />
        <MatchupGrid
          title={lang === "ja" ? "通らない相手" : "Worst Offensive"}
          matchups={build.worstOffensiveMatchups}
          lang={lang}
          mode="offensive"
        />
        <MatchupGrid
          title={lang === "ja" ? "受けやすい相手" : "Best Defensive"}
          matchups={build.bestDefensiveMatchups}
          lang={lang}
          mode="defensive"
        />
      </div>
    </div>
  );
}

export function PokemonPowerDetail({ pokemon, lang }: PokemonPowerDetailProps) {
  const [activeBuild, setActiveBuild] = useState(0);
  const p = pokemon;
  const displayName = lang === "ja" ? localizePokemon(p.name, "ja") : p.name;
  const subName = lang === "ja" ? p.name : localizePokemon(p.name, "ja");

  // Reset build tab when Pokemon changes
  useEffect(() => setActiveBuild(0), [p.name]);
  const build = p.builds[activeBuild] ?? p.builds[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PokemonIcon name={p.name} size="w-8 h-8" />
        <span className="text-2xl font-bold text-gray-100">{displayName}</span>
        <span className="text-sm text-gray-500">{subName}</span>
        <span className="text-xs text-gray-500 ml-auto tabular-nums">
          {lang === "ja" ? "使用率" : "Usage"}: {p.usagePct.toFixed(2)}%
          <span className="ml-2">#{p.usageRank}</span>
        </span>
      </div>

      {/* Type coverage summary */}
      {(p.seHitTypes.length > 0 || p.seWeakTypes.length > 0) && (
        <div className="flex flex-wrap gap-4 text-xs">
          {p.seHitTypes.length > 0 && (
            <span>
              <span className="text-gray-500">{lang === "ja" ? "抜群取れる" : "SE hit"}: </span>
              <span className="text-emerald-400">{p.seHitTypes.map(t => localizeType(t, lang)).join(", ")}</span>
            </span>
          )}
          {p.seWeakTypes.length > 0 && (
            <span>
              <span className="text-gray-500">{lang === "ja" ? "弱点" : "Weak to"}: </span>
              <span className="text-rose-400">{p.seWeakTypes.map(t => localizeType(t, lang)).join(", ")}</span>
            </span>
          )}
        </div>
      )}

      {/* Overall scores */}
      <div className="rounded bg-gray-800/50 p-3 space-y-1">
        <h3 className="text-xs font-semibold text-gray-400 mb-2">
          {lang === "ja" ? "総合スコア (使用率加重平均)" : "Overall Scores (usage-weighted)"}
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ScoreBar label={lang === "ja" ? "総合" : "Overall"} value={p.scores.overallScore} accent="blue" />
          <ScoreBar label={lang === "ja" ? "継戦力" : "Sustained"} value={p.scores.sustainedScore} accent="orange" />
          <ScoreBar label={lang === "ja" ? "攻撃総合" : "Atk.Score"} value={p.scores.offensiveScore} accent="rose" />
          <ScoreBar label={lang === "ja" ? "防御総合" : "Def.Score"} value={p.scores.defensiveScore} accent="cyan" />
          <ScoreBar label={lang === "ja" ? "1v1勝率" : "Win 1v1"} value={p.scores.winRate1v1} accent="violet" />
          <ScoreBar label={lang === "ja" ? "速度優位" : "Spd.Adv"} value={p.scores.speedAdvantage} accent="teal" />
        </div>
        {/* Sweep potential badge */}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="text-gray-500">{lang === "ja" ? "連続KO期待値" : "Sweep potential"}:</span>
          <span className={`rounded px-1.5 py-0.5 font-semibold leading-none tabular-nums ${
            p.scores.sweepPotential >= 3.0 ? "bg-orange-400/15 text-orange-400 border border-orange-400/30"
              : p.scores.sweepPotential >= 2.0 ? "bg-amber-400/15 text-amber-400 border border-amber-400/30"
              : "bg-gray-400/15 text-gray-400 border border-gray-400/30"
          }`}>
            ×{p.scores.sweepPotential.toFixed(1)}
          </span>
        </div>
        {/* Speed summary */}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="text-gray-500">{lang === "ja" ? "素早さ実数値" : "Speed stat"}:</span>
          <span className="text-gray-200 tabular-nums font-semibold">{Math.round(p.scores.speedStat)}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
            p.scores.speedTier === "fast" ? "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30"
              : p.scores.speedTier === "mid" ? "bg-yellow-400/15 text-yellow-400 border border-yellow-400/30"
              : "bg-red-400/15 text-red-400 border border-red-400/30"
          }`}>
            {p.scores.speedTier === "fast" ? (lang === "ja" ? "高速" : "Fast")
              : p.scores.speedTier === "mid" ? (lang === "ja" ? "中速" : "Mid")
              : (lang === "ja" ? "低速" : "Slow")}
          </span>
          <span className="text-gray-500 ml-2">{lang === "ja" ? "上取れる率" : "Outspeed"}:</span>
          <span className="text-teal-400 tabular-nums">{p.scores.speedAdvantage.toFixed(1)}%</span>
        </div>
      </div>

      {/* Build tabs */}
      {p.builds.length > 1 && (
        <div className="flex gap-1 border-b border-gray-700 overflow-x-auto">
          {p.builds.map((b, i) => (
            <BuildTab
              key={i}
              build={b}
              lang={lang}
              index={i}
              isActive={i === activeBuild}
              onClick={() => setActiveBuild(i)}
            />
          ))}
        </div>
      )}

      {/* Active build detail */}
      {build && <BuildDetail build={build} lang={lang} />}
    </div>
  );
}
