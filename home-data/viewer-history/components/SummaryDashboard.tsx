import { useMemo } from "react";
import type { MatchupSnapshot } from "../../types/matchup-history";
import { localizePokemon } from "../../viewer/i18n";

interface Props {
  snapshots: MatchupSnapshot[];
  lang: string;
}

/** Aggregate dashboard: cross-run totals, MVP Pokemon, rising/falling trends. */
export function SummaryDashboard({ snapshots, lang }: Props) {
  const stats = useMemo(() => {
    if (snapshots.length === 0) return null;

    const wrValues = snapshots.map((s) => s.topTeamWinRate * 100);
    const avgWR = wrValues.reduce((a, b) => a + b, 0) / wrValues.length;
    const bestWR = Math.max(...wrValues);
    const worstWR = Math.min(...wrValues);

    // Most-picked Pokemon across all runs (by avg pick rate)
    const pickTotals = new Map<string, { total: number; count: number }>();
    for (const s of snapshots) {
      for (const [name, rate] of Object.entries(s.pokemonPickRates)) {
        const e = pickTotals.get(name) ?? { total: 0, count: 0 };
        e.total += rate;
        e.count++;
        pickTotals.set(name, e);
      }
    }
    const mvpPokemon = [...pickTotals.entries()]
      .map(([name, { total, count }]) => ({
        name,
        avgPick: total / snapshots.length,
        runCount: count,
      }))
      .sort((a, b) => b.avgPick - a.avgPick)
      .slice(0, 10);

    // Rising/Falling: compare last 2 runs if available
    let risers: { name: string; delta: number }[] = [];
    let fallers: { name: string; delta: number }[] = [];
    if (snapshots.length >= 2) {
      const prev = snapshots[snapshots.length - 2].pokemonPickRates;
      const curr = snapshots[snapshots.length - 1].pokemonPickRates;
      const allNames = new Set([...Object.keys(prev), ...Object.keys(curr)]);
      const deltas = [...allNames].map((name) => ({
        name,
        delta: (curr[name] ?? 0) - (prev[name] ?? 0),
      }));
      risers = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
      fallers = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    }

    // Most frequent team members across all top-1 teams
    const top1Members = new Map<string, number>();
    for (const s of snapshots) {
      if (s.topTeams.length > 0) {
        for (const m of s.topTeams[0].members) {
          top1Members.set(m, (top1Members.get(m) ?? 0) + 1);
        }
      }
    }
    const consistentTop1 = [...top1Members.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return { avgWR, bestWR, worstWR, wrValues, mvpPokemon, risers, fallers, consistentTop1 };
  }, [snapshots]);

  if (!stats) {
    return <div className="text-gray-500 text-center mt-20">No data</div>;
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">
        {lang === "ja" ? "サマリーダッシュボード" : "Summary Dashboard"}
      </h2>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KPI label={lang === "ja" ? "実行回数" : "Total Runs"} value={`${snapshots.length}`} />
        <KPI label={lang === "ja" ? "平均WR" : "Avg WR"} value={`${stats.avgWR.toFixed(1)}%`} />
        <KPI label={lang === "ja" ? "最高WR" : "Best WR"} value={`${stats.bestWR.toFixed(1)}%`} sub={`worst: ${stats.worstWR.toFixed(1)}%`} />
        <KPI
          label={lang === "ja" ? "WR変動幅" : "WR Range"}
          value={`${(stats.bestWR - stats.worstWR).toFixed(1)}%`}
          sub={stats.bestWR - stats.worstWR > 10 ? (lang === "ja" ? "不安定" : "unstable") : (lang === "ja" ? "安定" : "stable")}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* MVP Pokemon */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold text-sm text-gray-300 mb-3">
            {lang === "ja" ? "MVP ポケモン (平均採用率)" : "MVP Pokemon (Avg Pick Rate)"}
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {stats.mvpPokemon.map((p, i) => (
                <tr key={p.name} className="border-t border-gray-800/50">
                  <td className="py-1 text-gray-500 w-6">{i + 1}</td>
                  <td className="py-1 font-mono">{localizePokemon(p.name, lang)}</td>
                  <td className="py-1 text-right font-bold">{(p.avgPick * 100).toFixed(0)}%</td>
                  <td className="py-1 text-right text-gray-500 text-xs">{p.runCount}/{snapshots.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top-1 team consistency */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold text-sm text-gray-300 mb-3">
            {lang === "ja" ? "TOP1構築 常連メンバー" : "Top-1 Team Regulars"}
          </h3>
          {stats.consistentTop1.length > 0 ? (
            <div className="space-y-2">
              {stats.consistentTop1.map(([name, count]) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="font-mono text-sm">{localizePokemon(name, lang)}</div>
                  <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded"
                      style={{ width: `${(count / snapshots.length) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400">{count}/{snapshots.length}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Rising / Falling */}
      {(stats.risers.length > 0 || stats.fallers.length > 0) && (
        <div className="grid grid-cols-2 gap-6 mt-6">
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="font-bold text-sm text-green-400 mb-2">
              {lang === "ja" ? "直近で上昇" : "Rising (Last 2 Runs)"}
            </h3>
            {stats.risers.length > 0 ? (
              <div className="space-y-1">
                {stats.risers.map((r) => (
                  <div key={r.name} className="flex justify-between text-sm">
                    <span className="font-mono">{localizePokemon(r.name, lang)}</span>
                    <span className="text-green-400 font-bold">+{(r.delta * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-xs">—</div>
            )}
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="font-bold text-sm text-red-400 mb-2">
              {lang === "ja" ? "直近で下落" : "Falling (Last 2 Runs)"}
            </h3>
            {stats.fallers.length > 0 ? (
              <div className="space-y-1">
                {stats.fallers.map((r) => (
                  <div key={r.name} className="flex justify-between text-sm">
                    <span className="font-mono">{localizePokemon(r.name, lang)}</span>
                    <span className="text-red-400 font-bold">{(r.delta * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-xs">—</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
