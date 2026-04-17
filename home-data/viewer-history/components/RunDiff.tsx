import { useMemo, useState } from "react";
import type { MatchupSnapshot } from "../../types/matchup-history";
import { localizePokemon } from "../../viewer/i18n";

interface Props {
  snapshots: MatchupSnapshot[];
  lang: string;
}

interface DiffEntry {
  name: string;
  prev: number;
  curr: number;
  delta: number;
}

/** Compare two runs side-by-side: pick rate deltas, team changes, config diffs. */
export function RunDiff({ snapshots, lang }: Props) {
  const [runA, setRunA] = useState(Math.max(0, snapshots.length - 2));
  const [runB, setRunB] = useState(snapshots.length - 1);

  const diff = useMemo(() => {
    if (snapshots.length < 2) return null;
    const a = snapshots[runA];
    const b = snapshots[runB];

    // Pick rate diff
    const allNames = new Set([
      ...Object.keys(a.pokemonPickRates),
      ...Object.keys(b.pokemonPickRates),
    ]);
    const pickDiffs: DiffEntry[] = [...allNames]
      .map((name) => ({
        name,
        prev: a.pokemonPickRates[name] ?? 0,
        curr: b.pokemonPickRates[name] ?? 0,
        delta: (b.pokemonPickRates[name] ?? 0) - (a.pokemonPickRates[name] ?? 0),
      }))
      .filter((d) => Math.abs(d.delta) > 0.001);
    pickDiffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // New entrants (0 → >0)
    const newEntrants = pickDiffs.filter((d) => d.prev === 0 && d.curr > 0);
    // Departed (>0 → 0)
    const departed = pickDiffs.filter((d) => d.prev > 0 && d.curr === 0);

    // Top team comparison
    const topA = a.topTeams[0];
    const topB = b.topTeams[0];

    // Config diff
    const configChanges: string[] = [];
    if (a.config.totalTeams !== b.config.totalTeams) configChanges.push(`teams: ${a.config.totalTeams} → ${b.config.totalTeams}`);
    if (a.config.gamesPerTeam !== b.config.gamesPerTeam) configChanges.push(`games: ${a.config.gamesPerTeam} → ${b.config.gamesPerTeam}`);
    if (a.config.poolSize !== b.config.poolSize) configChanges.push(`pool: ${a.config.poolSize} → ${b.config.poolSize}`);

    return { a, b, pickDiffs, newEntrants, departed, topA, topB, configChanges };
  }, [snapshots, runA, runB]);

  if (snapshots.length < 2) {
    return (
      <div className="text-gray-500 text-center mt-20">
        {lang === "ja" ? "比較には2回以上の実行が必要です" : "Need at least 2 runs to compare"}
      </div>
    );
  }

  if (!diff) return null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-lg font-bold">
          {lang === "ja" ? "実行間比較" : "Run Comparison"}
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={runA}
            onChange={(e) => setRunA(Number(e.target.value))}
            className="bg-gray-800 rounded px-2 py-1 text-gray-200"
          >
            {snapshots.map((s, i) => (
              <option key={i} value={i}>#{i + 1} ({s.dateArg})</option>
            ))}
          </select>
          <span className="text-gray-500">→</span>
          <select
            value={runB}
            onChange={(e) => setRunB(Number(e.target.value))}
            className="bg-gray-800 rounded px-2 py-1 text-gray-200"
          >
            {snapshots.map((s, i) => (
              <option key={i} value={i}>#{i + 1} ({s.dateArg})</option>
            ))}
          </select>
        </div>
      </div>

      {/* WR comparison */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <DiffStat
          label="Top WR"
          a={`${(diff.a.topTeamWinRate * 100).toFixed(1)}%`}
          b={`${(diff.b.topTeamWinRate * 100).toFixed(1)}%`}
          delta={(diff.b.topTeamWinRate - diff.a.topTeamWinRate) * 100}
          suffix="%"
        />
        <DiffStat
          label={lang === "ja" ? "プールサイズ" : "Pool Size"}
          a={`${diff.a.config.poolSize}`}
          b={`${diff.b.config.poolSize}`}
          delta={diff.b.config.poolSize - diff.a.config.poolSize}
        />
        <DiffStat
          label={lang === "ja" ? "ピック種数" : "Picked Species"}
          a={`${Object.keys(diff.a.pokemonPickRates).length}`}
          b={`${Object.keys(diff.b.pokemonPickRates).length}`}
          delta={Object.keys(diff.b.pokemonPickRates).length - Object.keys(diff.a.pokemonPickRates).length}
        />
      </div>

      {/* Config changes */}
      {diff.configChanges.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded px-3 py-2 mb-6 text-xs text-yellow-300">
          {lang === "ja" ? "設定変更: " : "Config changes: "}
          {diff.configChanges.join(" | ")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Top team comparison */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold text-sm text-gray-300 mb-3">
            {lang === "ja" ? "TOP1構築の比較" : "Top-1 Team Comparison"}
          </h3>
          {diff.topA && diff.topB && (
            <div className="space-y-3">
              <TeamBox
                label={`#${runA + 1}`}
                team={diff.topA}
                lang={lang}
                highlight={diff.topB.members}
              />
              <TeamBox
                label={`#${runB + 1}`}
                team={diff.topB}
                lang={lang}
                highlight={diff.topA.members}
              />
            </div>
          )}
        </div>

        {/* New entrants + departed */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold text-sm text-green-400 mb-2">
            {lang === "ja" ? "新規参入" : "New Entrants"} ({diff.newEntrants.length})
          </h3>
          <div className="space-y-1 mb-4 max-h-32 overflow-y-auto">
            {diff.newEntrants.slice(0, 10).map((d) => (
              <div key={d.name} className="flex justify-between text-sm">
                <span className="font-mono">{localizePokemon(d.name, lang)}</span>
                <span className="text-green-400">{(d.curr * 100).toFixed(0)}%</span>
              </div>
            ))}
            {diff.newEntrants.length === 0 && <div className="text-gray-500 text-xs">—</div>}
          </div>
          <h3 className="font-bold text-sm text-red-400 mb-2">
            {lang === "ja" ? "脱落" : "Departed"} ({diff.departed.length})
          </h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {diff.departed.slice(0, 10).map((d) => (
              <div key={d.name} className="flex justify-between text-sm">
                <span className="font-mono">{localizePokemon(d.name, lang)}</span>
                <span className="text-red-400">{(d.prev * 100).toFixed(0)}%→0</span>
              </div>
            ))}
            {diff.departed.length === 0 && <div className="text-gray-500 text-xs">—</div>}
          </div>
        </div>
      </div>

      {/* Full pick rate diff table */}
      <div className="mt-6">
        <h3 className="font-bold text-sm text-gray-300 mb-2">
          {lang === "ja" ? "採用率変動 (上位20)" : "Pick Rate Changes (Top 20)"}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-700">
              <th className="text-left px-2 py-1">{lang === "ja" ? "ポケモン" : "Pokemon"}</th>
              <th className="text-right px-2 py-1">#{runA + 1}</th>
              <th className="text-right px-2 py-1">#{runB + 1}</th>
              <th className="text-right px-2 py-1">{lang === "ja" ? "変動" : "Delta"}</th>
            </tr>
          </thead>
          <tbody>
            {diff.pickDiffs.slice(0, 20).map((d) => (
              <tr key={d.name} className="border-t border-gray-800/50">
                <td className="px-2 py-1 font-mono">{localizePokemon(d.name, lang)}</td>
                <td className="px-2 py-1 text-right text-gray-400">{(d.prev * 100).toFixed(0)}%</td>
                <td className="px-2 py-1 text-right text-gray-300">{(d.curr * 100).toFixed(0)}%</td>
                <td className={`px-2 py-1 text-right font-bold ${
                  d.delta > 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {d.delta > 0 ? "+" : ""}{(d.delta * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffStat({ label, a, b, delta, suffix = "" }: {
  label: string; a: string; b: string; delta: number; suffix?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="flex items-center justify-center gap-2 mt-1">
        <span className="text-gray-400">{a}</span>
        <span className="text-gray-600">→</span>
        <span className="text-gray-200 font-bold">{b}</span>
      </div>
      <div className={`text-sm font-bold mt-1 ${
        delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-gray-500"
      }`}>
        {delta > 0 ? "+" : ""}{delta.toFixed(1)}{suffix}
      </div>
    </div>
  );
}

function TeamBox({ label, team, lang, highlight }: {
  label: string;
  team: { members: string[]; winRate: number; deadMemberCount: number };
  lang: string;
  highlight: string[];
}) {
  return (
    <div className="bg-gray-800 rounded p-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>WR {(team.winRate * 100).toFixed(1)}% | Dead: {team.deadMemberCount}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {team.members.map((m) => (
          <span
            key={m}
            className={`px-1.5 py-0.5 rounded text-xs ${
              highlight.includes(m)
                ? "bg-blue-900/50 text-blue-300"
                : "bg-gray-700 text-gray-300"
            }`}
          >
            {localizePokemon(m, lang)}
          </span>
        ))}
      </div>
    </div>
  );
}
