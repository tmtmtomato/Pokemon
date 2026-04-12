import React, { useMemo, useState } from "react";
import type { PoolMember, RankedTeam, PokemonTeamStats } from "../../types/team-matchup";
import { localizePokemon, localizeMove, localizeType, localizeItem, localizeAbility, natureDisplay, comparePokemonName, type Lang } from "../../viewer/i18n";
import {
  computeFullThreatAnalysis,
  computeTeamThreat,
  computeAdoptionReasons,
  findSolutions,
  getSRChipPct,
  getMetaTier,
  type SRConfig,
  type ThreatLevel,
  type ThreatResult,
  type DangerousMove,
  type TeamThreatResult,
  type ThreatAnalysisResult,
  type ThreatSolution,
  type MetaTier,
  type WeightedRankingEntry,
} from "../moveCalc";

const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-500", Grass: "bg-green-500", Ice: "bg-cyan-400",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-700",
  Flying: "bg-sky-400", Psychic: "bg-pink-500", Bug: "bg-lime-600",
  Rock: "bg-yellow-800", Ghost: "bg-indigo-600", Dragon: "bg-indigo-500",
  Dark: "bg-gray-700", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

const THREAT_BADGE: Record<ThreatLevel, { label: string; labelJa: string; cls: string }> = {
  critical: { label: "CRITICAL", labelJa: "危険", cls: "bg-red-600 text-white" },
  high:     { label: "HIGH",     labelJa: "高",   cls: "bg-orange-600 text-white" },
  medium:   { label: "MED",      labelJa: "中",   cls: "bg-yellow-600 text-white" },
  low:      { label: "LOW",      labelJa: "低",   cls: "bg-green-700 text-white" },
};

function koLabel(koN: number, koChance: number, lang: Lang): string {
  if (koN <= 0 || koN > 4) return lang === "ja" ? "確5+" : "5+HKO";
  const guaranteed = koChance >= 1;
  if (lang === "ja") {
    const prefix = guaranteed ? "確" : "乱";
    return `${prefix}${koN}`;
  }
  if (guaranteed) {
    return ["", "OHKO", "2HKO", "3HKO", "4HKO"][koN];
  }
  return `${(koChance * 100).toFixed(0)}% ${["", "OHKO", "2HKO", "3HKO", "4HKO"][koN]}`;
}

interface MetaRankingEntry {
  name: string;
  isMega: boolean;
  weightedWinRate: number;
}

interface Props {
  pool: PoolMember[];
  topTeams: RankedTeam[];
  pokemonStats: PokemonTeamStats[];
  metaRanking: MetaRankingEntry[];
  lang: Lang;
}

export default function ThreatAnalysis({ pool, topTeams, pokemonStats, metaRanking, lang }: Props) {
  const [inputMode, setInputMode] = useState<"preset" | "custom">("preset");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    topTeams.length > 0 ? topTeams[0].teamId : "",
  );
  const [customSlots, setCustomSlots] = useState<(PoolMember | null)[]>([null, null, null, null, null, null]);
  const [ourSR, setOurSR] = useState(false);
  const [enemySR, setEnemySR] = useState(false);

  const poolByName = useMemo(
    () => new Map(pool.map((p) => [p.name, p])),
    [pool],
  );

  const selectedTeam = topTeams.find((t) => t.teamId === selectedTeamId);

  const myTeam: PoolMember[] = useMemo(() => {
    if (inputMode === "preset") {
      if (!selectedTeam) return [];
      return selectedTeam.members
        .map((name) => poolByName.get(name))
        .filter((p): p is PoolMember => !!p);
    }
    return customSlots.filter((p): p is PoolMember => p !== null);
  }, [inputMode, selectedTeam, customSlots, poolByName]);

  const srConfig = useMemo<SRConfig | undefined>(() => {
    if (!ourSR && !enemySR) return undefined;
    return { ourSR, enemySR };
  }, [ourSR, enemySR]);

  // Full threat analysis (computed once when team/SR changes)
  const analysis = useMemo(() => {
    if (myTeam.length === 0) return null;
    return computeFullThreatAnalysis(myTeam, pool, srConfig);
  }, [myTeam, pool, srConfig]);

  // Gap solutions for uncovered threats
  const gapSolutions = useMemo(() => {
    if (!analysis) return [];
    const uncovered = analysis.dangerousMoves.filter((dm) => !dm.answer);
    if (uncovered.length === 0) return [];
    const teamNames = new Set(myTeam.map((m) => m.name));
    return findSolutions(uncovered, pool, teamNames);
  }, [analysis, myTeam, pool]);

  // Adoption reasons per member
  const adoptionReasons = useMemo(() => {
    if (myTeam.length === 0 || !analysis) return new Map<string, { answerCount: number; exclusiveAnswerCount: number; exclusiveVs: string[]; uniqueTypes: string[]; selectionRate: number }>();
    const reasons = computeAdoptionReasons(myTeam, analysis);
    // Compute selection rate from commonSelections (only for preset mode)
    const team = inputMode === "preset" ? selectedTeam : null;
    const totalGames = team?.commonSelections?.reduce((s, p) => s + p.frequency, 0) ?? 0;
    const selCounts = new Map<string, number>();
    for (const sel of team?.commonSelections ?? []) {
      for (const name of sel.members) {
        selCounts.set(name, (selCounts.get(name) ?? 0) + sel.frequency);
      }
    }
    const result = new Map<string, typeof reasons[0] & { selectionRate: number }>();
    for (const r of reasons) {
      result.set(r.name, {
        ...r,
        selectionRate: totalGames > 0 ? Math.round((selCounts.get(r.name) ?? 0) / totalGames * 100) : 0,
      });
    }
    return result;
  }, [myTeam, analysis, selectedTeam, inputMode]);

  // Meta tier grouped list for display
  const metaTierGroups = useMemo(() => {
    const tiers: { tier: MetaTier; label: string; members: PoolMember[] }[] = [
      { tier: "S", label: "S", members: [] },
      { tier: "A", label: "A", members: [] },
      { tier: "B", label: "B", members: [] },
      { tier: "C", label: "C", members: [] },
      { tier: "D", label: "D", members: [] },
      { tier: "E", label: "E", members: [] },
      { tier: "Mega", label: "Mega", members: [] },
    ];
    for (const p of pool) {
      const t = getMetaTier(p.name, p.isMega);
      const group = tiers.find((g) => g.tier === t);
      if (group) group.members.push(p);
    }
    return tiers.filter((g) => g.members.length > 0);
  }, [pool]);

  // Weighted 1v1 ranking from pre-computed meta ranking data
  const weightedRanking = useMemo((): WeightedRankingEntry[] => {
    const rankMap = new Map<string, MetaRankingEntry>();
    for (const r of metaRanking) {
      // Key by name+mega to handle dual-form Pokemon
      rankMap.set(r.name + (r.isMega ? "::mega" : ""), r);
    }
    return pool
      .map((p) => {
        const entry = rankMap.get(p.name + (p.isMega ? "::mega" : ""));
        const weightedWinRate = entry?.weightedWinRate ?? 0;
        const overallScore = p.overallScore ?? 0;
        const composite = weightedWinRate * 0.6 + overallScore * 0.4;
        return {
          member: p,
          tier: getMetaTier(p.name, p.isMega),
          metaWeight: 0, // not needed for display
          weightedWinRate,
          rawWinRate: p.winRate1v1 ?? 0,
          composite,
        };
      })
      .sort((a, b) => b.composite - a.composite);
  }, [pool, metaRanking]);

  // Dangerous teams from top 50
  const dangerousTeams = useMemo(() => {
    if (myTeam.length === 0) return [];
    const teamNames = new Set(myTeam.map((m) => m.name));
    return topTeams
      .filter((t) => t.teamId !== selectedTeamId)
      .slice(0, 50)
      .map((t) => {
        const oppMembers = t.members
          .map((name) => poolByName.get(name))
          .filter((p): p is PoolMember => !!p);
        const result = computeTeamThreat(myTeam, oppMembers);
        return { team: t, ...result };
      })
      .sort((a, b) => b.overallDifficulty - a.overallDifficulty)
      .slice(0, 15);
  }, [myTeam, topTeams, selectedTeamId, poolByName]);

  // Custom mode helper: set a slot
  function setCustomSlot(index: number, name: string) {
    const next = [...customSlots];
    next[index] = name ? poolByName.get(name) ?? null : null;
    setCustomSlots(next);
  }

  function loadPresetToCustom(teamId: string) {
    const team = topTeams.find((t) => t.teamId === teamId);
    if (!team) return;
    const slots: (PoolMember | null)[] = team.members.map((n) => poolByName.get(n) ?? null);
    while (slots.length < 6) slots.push(null);
    setCustomSlots(slots);
    setInputMode("custom");
  }

  return (
    <div className="space-y-6 p-4 max-w-4xl">
      {/* Team header + mode selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-100">
            {lang === "ja" ? "脅威分析" : "Threat Analysis"}
          </h2>
          <div className="flex rounded overflow-hidden border border-gray-700">
            <button
              onClick={() => setInputMode("preset")}
              className={`px-2 py-0.5 text-xs ${inputMode === "preset" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
            >
              Top50
            </button>
            <button
              onClick={() => setInputMode("custom")}
              className={`px-2 py-0.5 text-xs ${inputMode === "custom" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
            >
              {lang === "ja" ? "カスタム" : "Custom"}
            </button>
          </div>
          {inputMode === "preset" && (
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 border border-gray-700 focus:ring-1 focus:ring-blue-500"
            >
              {topTeams.slice(0, 50).map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  #{t.rank} ({(t.winRate * 100).toFixed(1)}%) {t.members.join("/")}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Custom team input */}
        {inputMode === "custom" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 border border-gray-700 focus:ring-1 focus:ring-blue-500"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) loadPresetToCustom(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">
                  {lang === "ja" ? "Top50から読込..." : "Load from Top 50..."}
                </option>
                {topTeams.slice(0, 50).map((t) => (
                  <option key={t.teamId} value={t.teamId}>
                    #{t.rank} ({(t.winRate * 100).toFixed(1)}%) {t.members.slice(0, 3).join("/")}...
                  </option>
                ))}
              </select>
              <button
                onClick={() => setCustomSlots([null, null, null, null, null, null])}
                className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              >
                {lang === "ja" ? "クリア" : "Clear"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <select
                  key={i}
                  value={customSlots[i]?.name ?? ""}
                  onChange={(e) => setCustomSlot(i, e.target.value)}
                  className="rounded bg-gray-800 px-1.5 py-1 text-xs text-gray-300 border border-gray-700 truncate focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">
                    {lang === "ja" ? `スロット${i + 1}` : `Slot ${i + 1}`}
                  </option>
                  {[...pool].sort((a, b) => comparePokemonName(a.name, b.name, lang)).map((p) => (
                    <option key={p.name} value={p.name}>
                      {localizePokemon(p.name, lang)}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stealth Rock toggles */}
      {myTeam.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap text-xs bg-gray-800/50 rounded px-3 py-1.5 border border-gray-700">
          <span className="text-gray-400 font-medium">
            {lang === "ja" ? "ステルスロック" : "Stealth Rock"}
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={ourSR} onChange={(e) => setOurSR(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 w-3.5 h-3.5" />
            <span className={ourSR ? "text-blue-400" : "text-gray-400"}>
              {lang === "ja" ? "味方SR展開" : "Our SR"}
            </span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={enemySR} onChange={(e) => setEnemySR(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500 focus:ring-offset-0 w-3.5 h-3.5" />
            <span className={enemySR ? "text-red-400" : "text-gray-400"}>
              {lang === "ja" ? "相手SR想定" : "Enemy SR"}
            </span>
          </label>
        </div>
      )}

      {/* Show prompt if no team selected */}
      {myTeam.length === 0 && (
        <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
          {lang === "ja" ? "チームを選択してください" : "Select a team"}
        </div>
      )}

      {!analysis && myTeam.length > 0 && (
        <div className="text-gray-500 text-xs">
          {lang === "ja" ? "分析中..." : "Analyzing..."}
        </div>
      )}

      {/* All analysis sections — only when analysis is ready */}
      {analysis && <>

      {/* Team members summary with adoption reasons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {myTeam.map((m) => {
          const adopt = adoptionReasons.get(m.name);
          return (
            <div key={m.name} className="bg-gray-800 rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-gray-200 font-medium">{localizePokemon(m.name, lang)}</span>
                {m.types.map((t) => (
                  <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-500"} rounded px-1 py-0 text-[8px] text-white`}>
                    {t}
                  </span>
                ))}
                {m.isMega && <span className="text-amber-400 text-[9px] font-bold">MEGA</span>}
                {enemySR && (() => {
                  const chip = getSRChipPct(m.types);
                  return chip >= 25
                    ? <span className="text-red-400 text-[9px] font-bold">SR {chip}%</span>
                    : chip > 6.25
                    ? <span className="text-yellow-400 text-[9px]">SR {chip}%</span>
                    : <span className="text-gray-500 text-[9px]">SR {chip}%</span>;
                })()}
              </div>
              <div className="text-[10px] text-gray-400 space-y-0.5">
                <div>{natureDisplay(m.nature, lang)} / {localizeItem(m.item, lang)}</div>
                <div>{localizeAbility(m.ability, lang)}</div>
                <div><SpSpread sp={m.sp} compact /></div>
              </div>
              {/* Adoption reasons */}
              {adopt && (
                <div className="mt-1 pt-1 border-t border-gray-700 text-[10px] space-y-0.5">
                  <div className="flex gap-2 flex-wrap">
                    {adopt.selectionRate > 0 && (
                      <span className={`${adopt.selectionRate >= 80 ? "text-emerald-400" : adopt.selectionRate >= 50 ? "text-blue-400" : "text-gray-400"}`}>
                        {lang === "ja" ? `選出${adopt.selectionRate}%` : `Pick ${adopt.selectionRate}%`}
                      </span>
                    )}
                    <span className="text-gray-400">
                      {lang === "ja" ? `回答${adopt.answerCount}件` : `${adopt.answerCount} ans`}
                    </span>
                    {adopt.exclusiveAnswerCount > 0 && (
                      <span className="text-amber-400 font-medium">
                        {lang === "ja" ? `唯一${adopt.exclusiveAnswerCount}件` : `${adopt.exclusiveAnswerCount} excl`}
                      </span>
                    )}
                  </div>
                  {adopt.uniqueTypes.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-gray-500">{lang === "ja" ? "固有打点:" : "Unique:"}</span>
                      {adopt.uniqueTypes.map((t) => (
                        <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-500"} rounded px-1 py-0 text-[8px] text-white`}>
                          {localizeType(t, lang)}
                        </span>
                      ))}
                    </div>
                  )}
                  {adopt.exclusiveVs.length > 0 && (
                    <div className="text-gray-500 truncate" title={adopt.exclusiveVs.join(", ")}>
                      {lang === "ja" ? "専任:" : "Sole vs:"}{" "}
                      <span className="text-amber-300">
                        {adopt.exclusiveVs.slice(0, 3).map((n) => localizePokemon(n, lang)).join(", ")}
                        {adopt.exclusiveVs.length > 3 && ` +${adopt.exclusiveVs.length - 3}`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Answer rate summary */}
      {analysis.dangerousMoves.length > 0 && (
        <div className={`rounded px-3 py-2 text-xs flex items-center gap-3 ${
          analysis.uncoveredCount > 0 ? "bg-red-900/30 border border-red-800/50" : "bg-emerald-900/30 border border-emerald-800/50"
        }`}>
          <span className="text-gray-300 font-medium">
            {lang === "ja" ? "脅威回答率" : "Threat Answer Rate"}
          </span>
          <span className={`font-bold tabular-nums ${
            analysis.answerRate >= 80 ? "text-emerald-400" :
            analysis.answerRate >= 50 ? "text-amber-400" : "text-red-400"
          }`}>
            {analysis.answerRate}%
          </span>
          <span className="text-gray-500">
            ({analysis.dangerousMoves.length - analysis.uncoveredCount}/{analysis.dangerousMoves.length}
            {lang === "ja" ? " 回答あり" : " answered"})
          </span>
          {analysis.uncoveredCount > 0 && (
            <span className="text-red-400">
              {analysis.uncoveredCount} {lang === "ja" ? "件の未回答脅威" : "uncovered"}
            </span>
          )}
        </div>
      )}

      {/* Section 1: Dangerous Moves (promoted — most actionable) */}
      {analysis.dangerousMoves.length > 0 && (
        <DangerousMovesSection moves={analysis.dangerousMoves} lang={lang} />
      )}

      {/* Section 2: Gap Solutions (when there are uncovered threats) */}
      {gapSolutions.length > 0 && (
        <GapSolutionsSection solutions={gapSolutions} lang={lang} />
      )}

      {/* Section 3: Threat Ranking */}
      <ThreatRankingSection threats={analysis.threats} lang={lang} srConfig={srConfig} />

      {/* Section 4: Coverage Gaps */}
      {analysis.coverageGaps.length > 0 && (
        <CoverageGapsSection gaps={analysis.coverageGaps} threats={analysis.threats} lang={lang} />
      )}

      {/* Section 5: Dangerous Teams */}
      {dangerousTeams.length > 0 && (
        <DangerousTeamsSection teams={dangerousTeams} lang={lang} />
      )}

      </>}

      {/* Pool-level rankings (always visible) */}
      {metaTierGroups.length > 0 && (
        <MetaTierSection groups={metaTierGroups} lang={lang} />
      )}
      {weightedRanking.length > 0 && (
        <WeightedRankingSection ranking={weightedRanking} lang={lang} />
      )}
    </div>
  );
}

// ─── Section Components ──────────────────────────────────────

function ThreatRankingSection({ threats, lang, srConfig }: { threats: ThreatResult[]; lang: Lang; srConfig?: SRConfig }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? threats : threats.slice(0, 15);

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2">
        {lang === "ja" ? "脅威ランキング" : "Threat Ranking"}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500">
              <th className="text-left py-1 px-2">{lang === "ja" ? "相手" : "Opponent"}</th>
              <th className="text-left py-1 px-2">{lang === "ja" ? "我方最善" : "Our Best"}</th>
              <th className="text-left py-1 px-2">{lang === "ja" ? "相手最善" : "Their Best"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "速度" : "Speed"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "脅威度" : "Threat"}</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((t) => {
              const badge = THREAT_BADGE[t.threatLevel];
              return (
                <tr key={t.opponent.name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-200">{localizePokemon(t.opponent.name, lang)}</span>
                      {srConfig?.ourSR && (() => {
                        const chip = getSRChipPct(t.opponent.types);
                        return chip >= 25
                          ? <span className="text-red-400 text-[9px]">SR-{chip}%</span>
                          : chip > 6.25
                          ? <span className="text-yellow-500 text-[9px]">SR-{chip}%</span>
                          : <span className="text-gray-600 text-[9px]">SR-{chip}%</span>;
                      })()}
                    </div>
                    <div className="flex gap-0.5 mt-0.5">
                      {t.opponent.types.map((tp) => (
                        <span key={tp} className={`${TYPE_COLORS[tp] ?? "bg-gray-500"} rounded px-1 py-0 text-[8px] text-white`}>
                          {tp}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="text-gray-300 tabular-nums">{t.ourBest.maxPct.toFixed(1)}%</span>
                    <span className="text-gray-500 ml-1">{koLabel(t.ourBest.koN, t.ourBest.koChance, lang)}</span>
                    <div className="text-[10px] text-gray-600">
                      {localizePokemon(t.ourBest.member, lang)} / {localizeMove(t.ourBest.move, lang)}
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="text-gray-300 tabular-nums">{t.theirBest.maxPct.toFixed(1)}%</span>
                    <span className="text-gray-500 ml-1">{koLabel(t.theirBest.koN, t.theirBest.koChance, lang)}</span>
                    <div className="text-[10px] text-gray-600">
                      {localizeMove(t.theirBest.move, lang)} → {localizePokemon(t.theirBest.target, lang)}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`text-[10px] ${
                      t.speedMatchup === "faster" ? "text-emerald-400" :
                      t.speedMatchup === "slower" ? "text-red-400" : "text-gray-500"
                    }`}>
                      {t.speedMatchup === "faster" ? (lang === "ja" ? "先手" : "FAST") :
                       t.speedMatchup === "slower" ? (lang === "ja" ? "後手" : "SLOW") :
                       (lang === "ja" ? "同速" : "TIE")}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`${badge.cls} rounded px-1.5 py-0.5 text-[10px] font-medium`}>
                      {lang === "ja" ? badge.labelJa : badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {threats.length > 15 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-[10px] text-blue-400 hover:text-blue-300"
        >
          {showAll
            ? (lang === "ja" ? "折りたたむ" : "Show less")
            : (lang === "ja" ? `全${threats.length}体を表示` : `Show all ${threats.length}`)}
        </button>
      )}
    </div>
  );
}

function CoverageGapsSection({ gaps, threats, lang }: { gaps: string[]; threats: ThreatResult[]; lang: Lang }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2">
        {lang === "ja" ? "カバレッジギャップ" : "Coverage Gaps"}
        <span className="ml-2 text-xs text-gray-500 font-normal">
          {lang === "ja" ? "抜群技を持たないタイプ" : "Types without SE coverage"}
        </span>
      </h3>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {gaps.map((type) => (
          <span key={type} className={`${TYPE_COLORS[type] ?? "bg-gray-500"} rounded px-2 py-1 text-xs text-white`}>
            {localizeType(type, lang)}
          </span>
        ))}
      </div>
      {/* Show pool Pokemon that exploit these gaps */}
      <div className="text-[10px] text-gray-500">
        {lang === "ja" ? "該当タイプのポケモン:" : "Pokemon with these types:"}
        <span className="text-gray-400 ml-1">
          {threats
            .filter((t) => t.opponent.types.some((tp) => gaps.includes(tp)))
            .slice(0, 10)
            .map((t) => localizePokemon(t.opponent.name, lang))
            .join(", ")}
        </span>
      </div>
    </div>
  );
}

const ANSWER_LABELS: Record<string, { ja: string; en: string; cls: string }> = {
  immune_threat:  { ja: "無効受け",   en: "Immune",   cls: "text-emerald-400" },
  resist_threat:  { ja: "半減受け",   en: "Resist",   cls: "text-green-400" },
  outspeed_ohko:  { ja: "上から確1",  en: "Revenge",  cls: "text-blue-400" },
  "1v1_winner":   { ja: "対面勝ち",   en: "1v1 Win",  cls: "text-sky-400" },
};

const SP_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const SP_LABELS = ["H", "A", "B", "C", "D", "S"] as const;

function SpSpread({ sp, compact = false }: {
  sp: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  compact?: boolean;
}) {
  return (
    <span className="inline-flex gap-1 text-[10px] tabular-nums">
      {SP_KEYS.map((key, i) => {
        const v = sp[key];
        if (compact && v === 0) return null;
        return (
          <span key={key} className={v >= 32 ? "text-emerald-400 font-bold" : v > 0 ? "text-gray-300" : "text-gray-600"}>
            {SP_LABELS[i]}{v}
          </span>
        );
      })}
    </span>
  );
}

function DangerousMovesSection({ moves, lang }: { moves: DangerousMove[]; lang: Lang }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2">
        {lang === "ja" ? "危険な技と回答" : "Dangerous Moves & Answers"}
        <span className="ml-2 text-xs text-gray-500 font-normal">
          {lang === "ja" ? "味方3体以上に刺さる技" : "Hits 3+ team members"}
        </span>
      </h3>
      <div className="space-y-1.5">
        {moves.slice(0, 20).map((dm, i) => (
          <div key={`${dm.user}-${dm.move}-${i}`} className={`rounded px-3 py-1.5 text-xs ${
            !dm.answer && !dm.speedTieAnswer ? "bg-red-900/20 border border-red-800/40"
            : !dm.answer && dm.speedTieAnswer ? "bg-amber-900/20 border border-amber-800/40"
            : "bg-gray-800/30"
          }`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`${TYPE_COLORS[dm.moveType] ?? "bg-gray-500"} rounded px-1 py-0 text-[9px] text-white`}>
                {dm.moveType}
              </span>
              <span className="text-gray-200 font-medium">{localizeMove(dm.move, lang)}</span>
              <span className="text-gray-500">by {localizePokemon(dm.user, lang)}</span>
              <span className="text-red-400 text-[10px]">
                {dm.targets.length}/{6} {lang === "ja" ? "体" : "hit"}
                {dm.ohkoCount > 0 && (
                  <span className="text-red-500 ml-1">
                    ({dm.ohkoCount} {lang === "ja" ? "確1" : "OHKO"})
                  </span>
                )}
              </span>
              <span className="flex-1" />
              {/* Answer badge */}
              {dm.answer ? (
                <span className={`text-[10px] ${ANSWER_LABELS[dm.answer.reason]?.cls ?? "text-gray-400"}`}>
                  {lang === "ja" ? ANSWER_LABELS[dm.answer.reason]?.ja : ANSWER_LABELS[dm.answer.reason]?.en}
                  : {localizePokemon(dm.answer.member, lang)}
                  {dm.answer.speedTie && (
                    <span className="text-amber-400 ml-1">
                      ({lang === "ja" ? "同速" : "TIE"})
                    </span>
                  )}
                  <span className="text-gray-500 ml-1">
                    ({dm.answer.ourDmg.toFixed(0)}% {koLabel(dm.answer.ourKoN, dm.answer.ourKoChance, lang)})
                  </span>
                </span>
              ) : dm.speedTieAnswer ? (
                <span className="text-[10px] text-amber-400">
                  {lang === "ja" ? "同速" : "SPEED TIE"}
                  : {localizePokemon(dm.speedTieAnswer.member, lang)}
                  <span className="text-gray-500 ml-1">
                    ({dm.speedTieAnswer.ourDmg.toFixed(0)}% {koLabel(dm.speedTieAnswer.ourKoN, dm.speedTieAnswer.ourKoChance, lang)})
                  </span>
                </span>
              ) : (
                <span className="text-[10px] text-red-400 font-medium">
                  {lang === "ja" ? "回答なし" : "NO ANSWER"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[10px] text-gray-500">
              {dm.targets.map((tgt) => (
                <span key={tgt.name}>
                  {localizePokemon(tgt.name, lang)}{" "}
                  <span className={`tabular-nums ${tgt.koN === 1 ? "text-red-400" : "text-gray-400"}`}>
                    {tgt.maxPct.toFixed(0)}%
                  </span>
                  <span className="text-gray-600 ml-0.5">{koLabel(tgt.koN, tgt.koChance, lang)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DangerousTeamsSection({
  teams,
  lang,
}: {
  teams: { team: RankedTeam; overallDifficulty: number; worstMatchups: { ours: string; theirs: string; theirDmg: number }[] }[];
  lang: Lang;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2">
        {lang === "ja" ? "厳しいチーム構成" : "Dangerous Teams"}
      </h3>
      <div className="space-y-2">
        {teams.slice(0, 10).map((dt) => (
          <div key={dt.team.teamId} className="bg-gray-800/30 rounded px-3 py-2 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-400">#{dt.team.rank}</span>
              <span className="text-emerald-400 tabular-nums">
                {(dt.team.winRate * 100).toFixed(1)}%
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                dt.overallDifficulty >= 70 ? "bg-red-600/80 text-white" :
                dt.overallDifficulty >= 50 ? "bg-orange-600/80 text-white" :
                "bg-gray-700 text-gray-300"
              }`}>
                {lang === "ja" ? "難易度" : "Diff"} {dt.overallDifficulty}
              </span>
            </div>
            <div className="text-[10px] text-gray-400 mb-1">
              {dt.team.members.map((n) => localizePokemon(n, lang)).join(", ")}
            </div>
            {dt.worstMatchups.length > 0 && (
              <div className="text-[10px] text-gray-500">
                {lang === "ja" ? "問題:" : "Issues:"}{" "}
                {dt.worstMatchups.slice(0, 3).map((wm, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {localizePokemon(wm.theirs, lang)} → {localizePokemon(wm.ours, lang)}{" "}
                    <span className="text-red-400">{wm.theirDmg.toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GapSolutionsSection({
  solutions,
  lang,
}: {
  solutions: ThreatSolution[];
  lang: Lang;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? solutions : solutions.slice(0, 10);

  // Compute "best additions": Pokemon that solve the most gaps
  const solverCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sol of solutions) {
      const seen = new Set<string>();
      for (const c of sol.candidates) {
        if (!seen.has(c.member.name)) {
          counts.set(c.member.name, (counts.get(c.member.name) ?? 0) + 1);
          seen.add(c.member.name);
        }
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [solutions]);

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2">
        {lang === "ja" ? "未ケア脅威の解決策" : "Gap Solutions"}
      </h3>

      {/* Best additions summary */}
      {solverCounts.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-800/40 rounded px-3 py-2 mb-3 text-xs space-y-0.5">
          {solverCounts.map(([name, count]) => (
            <div key={name} className="text-blue-300">
              {lang === "ja"
                ? `${localizePokemon(name, lang)} を追加すると ${count}件 の未ケア脅威が解消`
                : `Adding ${localizePokemon(name, lang)} solves ${count} uncovered threat(s)`}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {displayed.map((sol) => (
          <div key={`${sol.user}::${sol.move}`} className="bg-gray-800/30 rounded px-3 py-2">
            {/* Threat header */}
            <div className="flex items-center gap-1.5 mb-1.5 text-xs">
              <span className="text-red-400 font-medium">
                {localizePokemon(sol.user, lang)}
              </span>
              <span className="text-gray-400">{lang === "ja" ? "の" : "'s"}</span>
              <span className="text-gray-200 font-medium">{localizeMove(sol.move, lang)}</span>
              <span className={`${TYPE_COLORS[sol.moveType] ?? "bg-gray-500"} rounded px-1 py-0 text-[8px] text-white`}>
                {sol.moveType}
              </span>
            </div>

            {/* Solution candidates */}
            {sol.candidates.length > 0 ? (
              <div className="space-y-0.5 ml-2">
                {sol.candidates.map((c) => {
                  const label = ANSWER_LABELS[c.answer.reason];
                  return (
                    <div key={c.member.name} className="text-[10px] flex items-center gap-1.5">
                      <span className="text-gray-500">→</span>
                      <span className="text-gray-200">{localizePokemon(c.member.name, lang)}</span>
                      <span className={label?.cls ?? "text-gray-400"}>
                        ({lang === "ja" ? label?.ja : label?.en})
                      </span>
                      <span className="text-gray-400 tabular-nums">
                        {c.answer.ourDmg.toFixed(0)}% {koLabel(c.answer.ourKoN, c.answer.ourKoChance, lang)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[10px] text-red-400 ml-2">
                {lang === "ja" ? "プール内に解決策なし" : "No solution in pool"}
              </div>
            )}
          </div>
        ))}
      </div>

      {solutions.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300"
        >
          {showAll
            ? (lang === "ja" ? "▲ 折りたたむ" : "▲ Collapse")
            : (lang === "ja" ? `▼ 全${solutions.length}件を表示` : `▼ Show all ${solutions.length}`)}
        </button>
      )}
    </div>
  );
}

// ─── Ranking Section Components ──────────────────────────────

const TIER_BADGE: Record<MetaTier, { cls: string; text: string }> = {
  S:    { cls: "bg-red-600 text-white",    text: "S" },
  A:    { cls: "bg-orange-500 text-white", text: "A" },
  B:    { cls: "bg-yellow-600 text-white", text: "B" },
  C:    { cls: "bg-blue-600 text-white",   text: "C" },
  D:    { cls: "bg-indigo-600 text-white",  text: "D" },
  E:    { cls: "bg-gray-600 text-white",   text: "E" },
  Mega: { cls: "bg-amber-500 text-black",  text: "M" },
  "-":  { cls: "bg-gray-800 text-gray-500", text: "-" },
};

function MetaTierSection({ groups, lang }: {
  groups: { tier: MetaTier; label: string; members: PoolMember[] }[];
  lang: Lang;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2 flex items-center gap-2">
        {lang === "ja" ? "メタティア (採用優先度)" : "Meta Tiers (Priority)"}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-blue-400 hover:text-blue-300 font-normal"
        >
          {expanded ? (lang === "ja" ? "▲ 閉じる" : "▲ Hide") : (lang === "ja" ? "▼ 展開" : "▼ Show")}
        </button>
      </h3>
      {expanded && (
        <div className="space-y-1.5">
          {groups.map((g) => {
            const badge = TIER_BADGE[g.tier];
            return (
              <div key={g.tier} className="flex items-start gap-2">
                <span className={`${badge.cls} rounded px-1.5 py-0.5 text-[10px] font-bold min-w-[28px] text-center flex-shrink-0`}>
                  {badge.text}
                </span>
                <div className="flex flex-wrap gap-1">
                  {g.members.map((m) => (
                    <span key={m.name + (m.isMega ? "-mega" : "")} className="text-[10px] text-gray-300 bg-gray-800/50 rounded px-1.5 py-0.5">
                      {localizePokemon(m.name, lang)}
                      {m.isMega && <span className="text-amber-400 ml-0.5">M</span>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="text-[9px] text-gray-600 mt-1">
            {lang === "ja"
              ? "※ S=10倍, A/Mega=9倍, B=8倍, C=7倍, D=6倍, E=5倍, 無印=1倍 の重みで対面勝率を計算"
              : "Weight: S=10×, A/Mega=9×, B=8×, C=7×, D=6×, E=5×, Untiered=1×"}
          </div>
        </div>
      )}
    </div>
  );
}

function WeightedRankingSection({ ranking, lang }: { ranking: WeightedRankingEntry[]; lang: Lang }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? ranking : ranking.slice(0, 30);

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-200 mb-2">
        {lang === "ja" ? "総合ポケモンランキング" : "Overall Pokemon Ranking"}
        <span className="ml-2 text-xs text-gray-500 font-normal">
          {lang === "ja" ? "メタ重み付き対面勝率×60% + 戦闘力×40%" : "Meta-weighted 1v1 Win × 60% + Power × 40%"}
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500">
              <th className="text-center py-1 px-1 w-8">#</th>
              <th className="text-left py-1 px-2">{lang === "ja" ? "ポケモン" : "Pokemon"}</th>
              <th className="text-center py-1 px-1">{lang === "ja" ? "ティア" : "Tier"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "総合" : "Score"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "重み付勝率" : "W.Win%"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "素勝率" : "Raw%"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "戦闘力" : "Power"}</th>
              <th className="text-center py-1 px-2">{lang === "ja" ? "速度" : "Speed"}</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((r, i) => {
              const badge = TIER_BADGE[r.tier];
              return (
                <tr key={r.member.name + (r.member.isMega ? "-M" : "")} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-1 px-1 text-center text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="py-1 px-2">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-200">{localizePokemon(r.member.name, lang)}</span>
                      {r.member.isMega && <span className="text-amber-400 text-[9px] font-bold">M</span>}
                    </div>
                    <div className="flex gap-0.5 mt-0.5">
                      {r.member.types.map((t) => (
                        <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-500"} rounded px-1 py-0 text-[8px] text-white`}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-1 px-1 text-center">
                    <span className={`${badge.cls} rounded px-1 py-0.5 text-[9px] font-bold`}>
                      {badge.text}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span className={`tabular-nums font-bold ${
                      r.composite >= 60 ? "text-amber-400" :
                      r.composite >= 45 ? "text-blue-400" : "text-gray-400"
                    }`}>
                      {r.composite.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span className={`tabular-nums ${
                      r.weightedWinRate >= 70 ? "text-emerald-400" :
                      r.weightedWinRate >= 50 ? "text-gray-300" : "text-red-400"
                    }`}>
                      {r.weightedWinRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span className="text-gray-500 tabular-nums">
                      {r.rawWinRate > 0 ? `${r.rawWinRate.toFixed(1)}%` : "-"}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span className="text-gray-400 tabular-nums">
                      {r.member.overallScore ? r.member.overallScore.toFixed(1) : "-"}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span className={`text-[10px] tabular-nums ${
                      r.member.speedTier === "fast" ? "text-emerald-400" :
                      r.member.speedTier === "mid" ? "text-gray-400" : "text-red-400"
                    }`}>
                      {r.member.speedStat ?? "-"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[9px] text-gray-600">
        {lang === "ja"
          ? "※ 総合 = メタ重み付き対面勝率×60% + 戦闘力×40% (Sティア相手に勝つ=10倍加点)"
          : "Score = Meta-weighted Win% × 60% + Power × 40% (Beating S-tier = 10× bonus)"}
      </div>
      {ranking.length > 30 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-[10px] text-blue-400 hover:text-blue-300"
        >
          {showAll
            ? (lang === "ja" ? "折りたたむ" : "Show less")
            : (lang === "ja" ? `全${ranking.length}体を表示` : `Show all ${ranking.length}`)}
        </button>
      )}
    </div>
  );
}
