import { useMemo, useState } from "react";
import type { MatchupSnapshot } from "../../types/matchup-history";
import { localizePokemon } from "../../viewer/i18n";

interface Props {
  snapshots: MatchupSnapshot[];
  selectedIdx: number | null;
  lang: string;
}

type RateMode = "pick" | "selection";

/** Heatmap of Pokemon pick/selection rates across runs. Rows = Pokemon, Cols = Runs. */
export function PokemonConsistency({ snapshots, selectedIdx, lang }: Props) {
  const [minAppearances, setMinAppearances] = useState(2);
  const [mode, setMode] = useState<RateMode>("pick");

  const { rows, maxRate } = useMemo(() => {
    const rateKey = mode === "pick" ? "pokemonPickRates" : "pokemonSelectionRates";

    // Collect all Pokemon names across all runs
    const allNames = new Set<string>();
    for (const s of snapshots) {
      for (const name of Object.keys(s[rateKey])) {
        allNames.add(name);
      }
    }

    // Build per-Pokemon row data
    const rows = [...allNames].map((name) => {
      const rates = snapshots.map((s) => s[rateKey][name] ?? 0);
      const pickRates = snapshots.map((s) => s.pokemonPickRates[name] ?? 0);
      const selRates = snapshots.map((s) => s.pokemonSelectionRates[name] ?? 0);
      const appearances = rates.filter((r) => r > 0).length;
      const avgRate = rates.reduce((a, b) => a + b, 0) / snapshots.length;
      // Gap = avg selection rate - avg pick rate (negative = bench warmer)
      const avgPick = pickRates.reduce((a, b) => a + b, 0) / snapshots.length;
      const avgSel = selRates.reduce((a, b) => a + b, 0) / snapshots.length;
      const gap = avgSel - avgPick;
      return { name, rates, appearances, avgRate, gap };
    });

    // Filter and sort by average rate desc
    const filtered = rows
      .filter((r) => r.appearances >= minAppearances)
      .sort((a, b) => b.avgRate - a.avgRate);

    const maxRate = Math.max(...filtered.flatMap((r) => r.rates), 0.01);

    return { rows: filtered, maxRate };
  }, [snapshots, minAppearances, mode]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <h2 className="text-lg font-bold">
          {lang === "ja" ? "ポケモン安定性" : "Pokemon Consistency"}
        </h2>
        <div className="flex gap-1">
          {([["pick", "採用率", "Pick Rate"], ["selection", "選出率", "Selection Rate"]] as const).map(
            ([key, ja, en]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`px-2 py-0.5 rounded text-xs ${
                  mode === key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {lang === "ja" ? ja : en}
              </button>
            ),
          )}
        </div>
        <label className="text-xs text-gray-400 flex items-center gap-1">
          {lang === "ja" ? "最低出現回数" : "Min appearances"}:
          <select
            value={minAppearances}
            onChange={(e) => setMinAppearances(Number(e.target.value))}
            className="bg-gray-800 rounded px-1 py-0.5 text-gray-200"
          >
            {[1, 2, 3, 4, 5].filter(n => n <= snapshots.length).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500">{rows.length} Pokemon</span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 text-gray-400 sticky left-0 bg-gray-950 z-10">
                {lang === "ja" ? "ポケモン" : "Pokemon"}
              </th>
              {snapshots.map((_, i) => (
                <th key={i} className={`px-1 py-1 text-center min-w-[40px] ${
                  selectedIdx === i ? "text-yellow-400" : "text-gray-500"
                }`}>
                  #{i + 1}
                </th>
              ))}
              <th className="px-2 py-1 text-right text-gray-400">
                {lang === "ja" ? "平均" : "Avg"}
              </th>
              <th className="px-2 py-1 text-right text-gray-400">
                {lang === "ja" ? "出現" : "Hits"}
              </th>
              <th className="px-2 py-1 text-right text-gray-400" title={lang === "ja" ? "選出率 - 採用率（正=選出多い、負=ベンチ多い）" : "Selection - Pick (pos=selected often, neg=bench warmer)"}>
                Gap
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-gray-800/50">
                <td className="px-2 py-1 font-mono text-gray-200 sticky left-0 bg-gray-950 z-10 whitespace-nowrap">
                  {localizePokemon(row.name, lang)}
                </td>
                {row.rates.map((rate, i) => {
                  const intensity = rate / maxRate;
                  const color = mode === "pick" ? "59,130,246" : "34,197,94";
                  const bg = rate > 0
                    ? `rgba(${color},${0.15 + intensity * 0.7})`
                    : "transparent";
                  return (
                    <td key={i} className={`px-1 py-1 text-center ${
                      selectedIdx === i ? "ring-1 ring-yellow-500/30" : ""
                    }`} style={{ background: bg }}>
                      {rate > 0 ? `${(rate * 100).toFixed(0)}` : "—"}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right font-bold text-gray-200">
                  {(row.avgRate * 100).toFixed(0)}%
                </td>
                <td className="px-2 py-1 text-right text-gray-400">
                  {row.appearances}/{snapshots.length}
                </td>
                <td className={`px-2 py-1 text-right text-xs ${
                  row.gap > 0.1 ? "text-green-400" :
                  row.gap < -0.1 ? "text-red-400" : "text-gray-500"
                }`}>
                  {row.gap > 0 ? "+" : ""}{(row.gap * 100).toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
        <span>
          {mode === "pick"
            ? (lang === "ja" ? "セルの値 = TOP50構築内の採用率(%)" : "Cell = pick rate in top-50 teams (%)")
            : (lang === "ja" ? "セルの値 = ゲーム内選出率(%)" : "Cell = in-game selection rate (%)")}
        </span>
        <div className="flex items-center gap-1 ml-2">
          <div className="w-4 h-3 rounded" style={{ background: mode === "pick" ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)" }} />
          <span>{lang === "ja" ? "低" : "Low"}</span>
          <div className="w-4 h-3 rounded" style={{ background: mode === "pick" ? "rgba(59,130,246,0.85)" : "rgba(34,197,94,0.85)" }} />
          <span>{lang === "ja" ? "高" : "High"}</span>
        </div>
        <span className="ml-3">
          Gap: {lang === "ja" ? "選出率 - 採用率（負=ベンチ要員）" : "Selection - Pick (neg = bench warmer)"}
        </span>
      </div>
    </div>
  );
}
