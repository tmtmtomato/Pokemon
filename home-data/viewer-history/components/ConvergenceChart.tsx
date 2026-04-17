import type { MatchupSnapshot } from "../../types/matchup-history";
import { localizePokemon } from "../../viewer/i18n";

interface Props {
  snapshots: MatchupSnapshot[];
  selectedIdx: number | null;
  lang: string;
}

/** Pure SVG line chart showing top team WR and composite score per run. */
export function ConvergenceChart({ snapshots, selectedIdx, lang }: Props) {
  const W = 700;
  const H = 250;
  const PAD = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const wrValues = snapshots.map((s) => s.topTeamWinRate * 100);
  const maxWR = Math.max(...wrValues, 85);
  const minWR = Math.min(...wrValues, 60);

  const x = (i: number) => PAD.left + (plotW / Math.max(snapshots.length - 1, 1)) * i;
  const y = (v: number) => PAD.top + plotH - ((v - minWR) / (maxWR - minWR)) * plotH;

  const wrLine = wrValues.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  // Selected run detail
  const sel = selectedIdx !== null ? snapshots[selectedIdx] : null;

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">
        {lang === "ja" ? "TOP1 勝率の推移" : "Top Team Win Rate Convergence"}
      </h2>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl bg-gray-900 rounded-lg">
        {/* Grid lines */}
        {[60, 70, 80, 90, 100].filter(v => v >= minWR && v <= maxWR).map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)}
              stroke="rgba(100,116,139,0.2)" strokeDasharray="4" />
            <text x={PAD.left - 5} y={y(v) + 4} textAnchor="end"
              fill="#94a3b8" fontSize="10">{v}%</text>
          </g>
        ))}

        {/* WR line */}
        <path d={wrLine} fill="none" stroke="#3b82f6" strokeWidth="2" />

        {/* Data points */}
        {wrValues.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={selectedIdx === i ? 5 : 3}
            fill={selectedIdx === i ? "#f59e0b" : "#3b82f6"} />
        ))}

        {/* X labels */}
        {snapshots.map((s, i) => (
          <text key={i} x={x(i)} y={H - 5} textAnchor="middle"
            fill="#94a3b8" fontSize="9">
            #{i + 1}
          </text>
        ))}

        {/* Selected highlight */}
        {selectedIdx !== null && (
          <line x1={x(selectedIdx)} y1={PAD.top} x2={x(selectedIdx)} y2={H - PAD.bottom}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
        )}
      </svg>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <StatBox
          label={lang === "ja" ? "平均WR" : "Avg WR"}
          value={`${(wrValues.reduce((a, b) => a + b, 0) / wrValues.length).toFixed(1)}%`}
        />
        <StatBox
          label={lang === "ja" ? "WR標準偏差" : "WR Std Dev"}
          value={`±${stddev(wrValues).toFixed(1)}%`}
        />
        <StatBox
          label={lang === "ja" ? "最高WR" : "Best WR"}
          value={`${Math.max(...wrValues).toFixed(1)}%`}
        />
      </div>

      {/* Selected run detail */}
      {sel && (
        <div className="mt-6 bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold text-sm text-gray-300 mb-2">
            Run #{(selectedIdx ?? 0) + 1} — {sel.dateArg}
          </h3>
          <div className="text-xs text-gray-400 mb-3">
            {sel.config.totalTeams} teams, {sel.config.gamesPerTeam} games, pool: {sel.poolStats.total}
          </div>
          <h4 className="text-sm font-bold text-gray-300 mb-1">
            {lang === "ja" ? "TOP 5 構築" : "Top 5 Teams"}
          </h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs">
                <th className="text-left">#</th>
                <th className="text-left">{lang === "ja" ? "メンバー" : "Members"}</th>
                <th className="text-right">WR</th>
                <th className="text-right">Dead</th>
              </tr>
            </thead>
            <tbody>
              {sel.topTeams.slice(0, 5).map((t, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="text-gray-400">{t.rank}</td>
                  <td className="py-1">
                    {t.members.map(m => localizePokemon(m, lang)).join(", ")}
                  </td>
                  <td className="text-right font-bold">{(t.winRate * 100).toFixed(1)}%</td>
                  <td className="text-right text-gray-400">{t.deadMemberCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 rounded p-3 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

function stddev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sq = arr.reduce((a, v) => a + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(sq);
}
