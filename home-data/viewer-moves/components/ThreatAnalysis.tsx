import React, { useMemo, useState } from "react";
import type { PoolMember, RankedTeam } from "../../types/team-matchup";
import { localizePokemon, localizeMove, localizeType, type Lang } from "../../viewer/i18n";
import {
  computeFullThreatAnalysis,
  computeTeamThreat,
  type ThreatLevel,
  type ThreatResult,
  type DangerousMove,
  type TeamThreatResult,
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

function koLabel(koN: number, lang: Lang): string {
  if (koN <= 0 || koN > 4) return lang === "ja" ? "確5+" : "5+HKO";
  const labels = lang === "ja"
    ? ["", "確1", "確2", "確3", "確4"]
    : ["", "OHKO", "2HKO", "3HKO", "4HKO"];
  return labels[koN];
}

interface Props {
  pool: PoolMember[];
  topTeams: RankedTeam[];
  lang: Lang;
}

export default function ThreatAnalysis({ pool, topTeams, lang }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    topTeams.length > 0 ? topTeams[0].teamId : "",
  );

  const poolByName = useMemo(
    () => new Map(pool.map((p) => [p.name, p])),
    [pool],
  );

  const selectedTeam = topTeams.find((t) => t.teamId === selectedTeamId);

  const myTeam: PoolMember[] = useMemo(() => {
    if (!selectedTeam) return [];
    return selectedTeam.members
      .map((name) => poolByName.get(name))
      .filter((p): p is PoolMember => !!p);
  }, [selectedTeam, poolByName]);

  // Full threat analysis (computed once when team changes)
  const analysis = useMemo(() => {
    if (myTeam.length === 0) return null;
    return computeFullThreatAnalysis(myTeam, pool);
  }, [myTeam, pool]);

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

  if (!selectedTeam || !analysis) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        {lang === "ja" ? "チームを選択してください" : "Select a team"}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-4xl">
      {/* Team header + selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-100">
          {lang === "ja" ? "脅威分析" : "Threat Analysis"}
        </h2>
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
      </div>

      {/* Team members summary */}
      <div className="flex flex-wrap gap-1.5">
        {myTeam.map((m) => (
          <span key={m.name} className="bg-gray-800 rounded px-2 py-1 text-xs text-gray-300 flex items-center gap-1">
            {localizePokemon(m.name, lang)}
            {m.types.map((t) => (
              <span key={t} className={`${TYPE_COLORS[t] ?? "bg-gray-500"} rounded px-1 py-0.5 text-[8px] text-white`}>
                {t}
              </span>
            ))}
          </span>
        ))}
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

      {/* Section 2: Threat Ranking */}
      <ThreatRankingSection threats={analysis.threats} lang={lang} />

      {/* Section 3: Coverage Gaps */}
      {analysis.coverageGaps.length > 0 && (
        <CoverageGapsSection gaps={analysis.coverageGaps} threats={analysis.threats} lang={lang} />
      )}

      {/* Section 4: Dangerous Teams */}
      {dangerousTeams.length > 0 && (
        <DangerousTeamsSection teams={dangerousTeams} lang={lang} />
      )}
    </div>
  );
}

// ─── Section Components ──────────────────────────────────────

function ThreatRankingSection({ threats, lang }: { threats: ThreatResult[]; lang: Lang }) {
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
                    <span className="text-gray-200">{localizePokemon(t.opponent.name, lang)}</span>
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
                    <span className="text-gray-500 ml-1">{koLabel(t.ourBest.koN, lang)}</span>
                    <div className="text-[10px] text-gray-600">
                      {localizePokemon(t.ourBest.member, lang)} / {localizeMove(t.ourBest.move, lang)}
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="text-gray-300 tabular-nums">{t.theirBest.maxPct.toFixed(1)}%</span>
                    <span className="text-gray-500 ml-1">{koLabel(t.theirBest.koN, lang)}</span>
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
};

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
            !dm.answer ? "bg-red-900/20 border border-red-800/40" : "bg-gray-800/30"
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
                  <span className="text-gray-500 ml-1">
                    ({dm.answer.ourDmg.toFixed(0)}% {koLabel(dm.answer.ourKoN, lang)})
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
                  <span className="text-gray-600 ml-0.5">{koLabel(tgt.koN, lang)}</span>
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
