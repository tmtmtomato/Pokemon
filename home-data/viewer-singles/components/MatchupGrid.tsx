/**
 * Matchup display component showing best/worst offensive and defensive matchups.
 */

import type { MatchupSummary } from "../../types/singles-ranking";
import { localizePokemon, localizeMove } from "../../viewer/i18n";

interface MatchupGridProps {
  title: string;
  matchups: MatchupSummary[];
  lang: "ja" | "en";
  mode: "offensive" | "defensive";
}

function koLabel(koN: number, koChance: number): string {
  if (koN === 0) return "-";
  const pctStr = koChance >= 1 ? "" : ` (${(koChance * 100).toFixed(0)}%)`;
  if (koN === 1) return `OHKO${pctStr}`;
  return `${koN}HKO${pctStr}`;
}

function koColor(koN: number, mode: "offensive" | "defensive"): string {
  if (mode === "offensive") {
    if (koN === 1) return "text-emerald-400";
    if (koN === 2) return "text-lime-400";
    if (koN <= 3) return "text-yellow-400";
    return "text-gray-500";
  }
  // defensive: being hit
  if (koN === 1) return "text-rose-400";
  if (koN === 2) return "text-orange-400";
  if (koN <= 3) return "text-yellow-400";
  return "text-emerald-400";
}

/** Deduplicate matchups: keep only the best per target Pokemon name */
function dedupeByTarget(matchups: MatchupSummary[]): MatchupSummary[] {
  const seen = new Set<string>();
  const result: MatchupSummary[] = [];
  for (const m of matchups) {
    if (!seen.has(m.targetName)) {
      seen.add(m.targetName);
      result.push(m);
    }
    if (result.length >= 5) break;
  }
  return result;
}

export function MatchupGrid({ title, matchups, lang, mode }: MatchupGridProps) {
  const deduped = dedupeByTarget(matchups);

  if (!deduped.length) return null;

  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold text-gray-400 mb-1">{title}</h4>
      <div className="space-y-1">
        {deduped.map((m, i) => {
          const target = lang === "ja" ? localizePokemon(m.targetName, "ja") : m.targetName;
          const move = lang === "ja" ? localizeMove(m.bestMove, "ja") : m.bestMove;
          return (
            <div key={`${m.targetName}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate text-gray-200" title={m.targetName}>
                {target}
              </span>
              <span className="w-24 shrink-0 truncate text-gray-500" title={m.bestMove}>
                {move}
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums text-gray-400">
                {m.minPct.toFixed(1)}-{m.maxPct.toFixed(1)}%
              </span>
              <span className={`w-16 shrink-0 text-right tabular-nums font-medium ${koColor(m.koN, mode)}`}>
                {koLabel(m.koN, m.koChance)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
