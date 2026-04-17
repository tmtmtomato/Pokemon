import type { PoolMember } from "../../types/team-matchup";
import type { Lang } from "../../viewer/i18n";
import { localizePokemon, localizeMove, localizeNature } from "../../viewer/i18n";

function formatSP(sp: PoolMember["sp"]): string {
  return `${sp.hp}-${sp.atk}-${sp.def}-${sp.spa}-${sp.spd}-${sp.spe}`;
}
import type { RoleClassification, ToughOpponent, TeamSummaryStats } from "../builderCalc";
import { getRoleLabel } from "../builderCalc";

interface Props {
  team: string[];
  poolByName: Map<string, PoolMember>;
  memberRoles: Map<string, RoleClassification>;
  summary: TeamSummaryStats;
  toughOpponents: ToughOpponent[];
  lang: Lang;
}

export function TeamSummary({
  team, poolByName, memberRoles, summary, toughOpponents, lang,
}: Props) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-4">
        {lang === "ja" ? "チームサマリー" : "Team Summary"}
      </h2>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label={lang === "ja" ? "カバー率" : "Coverage"}
          value={`${summary.coveragePct}%`}
          color={summary.coveragePct >= 80 ? "text-green-400" : summary.coveragePct >= 60 ? "text-yellow-400" : "text-red-400"}
        />
        <StatCard
          label={lang === "ja" ? "キツい相手" : "Tough Opp."}
          value={String(summary.toughOpponentCount)}
          color={summary.toughOpponentCount <= 5 ? "text-green-400" : summary.toughOpponentCount <= 15 ? "text-yellow-400" : "text-red-400"}
        />
        <StatCard
          label={lang === "ja" ? "平均MV" : "Avg MV"}
          value={summary.avgBestValue.toFixed(2)}
          color="text-blue-400"
        />
        <StatCard
          label="Mega"
          value={`${summary.megaCount}/2`}
          color="text-purple-400"
          sub={summary.hasSRSetter ? "SR ✓" : "SR ✗"}
        />
      </div>

      {/* Team members grid */}
      <h3 className="text-sm font-semibold text-gray-400 mb-2">
        {lang === "ja" ? "メンバー" : "Members"}
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {team.map((name) => {
          const member = poolByName.get(name);
          const role = memberRoles.get(name);
          if (!member || !role) return null;
          return (
            <div
              key={name}
              className="rounded border border-gray-700 bg-gray-800/50 p-2"
            >
              <div className="text-sm font-semibold">
                {localizePokemon(name, lang)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {localizeNature(member.nature, lang)} / {member.item}
              </div>
              <div className="text-[10px] font-mono text-gray-500">
                {formatSP(member.sp)}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">
                {member.moves.map((m) => localizeMove(m, lang)).join(" / ")}
              </div>
              <div className="text-[10px] text-blue-400 mt-1">
                {getRoleLabel(role.primary)}
                <span className="text-gray-500 ml-1">
                  {lang === "ja" ? "攻" : "Off"}: {role.offensiveSpread}%
                  {" · "}
                  {lang === "ja" ? "耐" : "Def"}: {role.defensiveSpread}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Remaining tough opponents */}
      {toughOpponents.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            {lang === "ja" ? "残りのキツい相手" : "Remaining Tough Opponents"}
            <span className="ml-2 text-xs text-gray-500">({toughOpponents.length})</span>
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {toughOpponents.slice(0, 20).map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between rounded bg-red-900/20 border border-red-800/30 px-2 py-1"
              >
                <span className="text-xs">{localizePokemon(t.name, lang)}</span>
                <span className="text-[10px] text-gray-500">{t.usagePct.toFixed(1)}%</span>
              </div>
            ))}
            {toughOpponents.length > 20 && (
              <div className="text-xs text-gray-500 col-span-2 text-center py-1">
                +{toughOpponents.length - 20} more
              </div>
            )}
          </div>
        </>
      )}

      {toughOpponents.length === 0 && (
        <div className="rounded border border-green-700 bg-green-900/20 p-4 text-center text-green-400">
          {lang === "ja"
            ? "全メタプールに対して回答あり！"
            : "Full meta coverage achieved!"}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label, value, color, sub,
}: {
  label: string; value: string; color: string; sub?: string;
}) {
  return (
    <div className="rounded border border-gray-700 bg-gray-800/50 p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
