/**
 * Horizontal bar graph row used inside Pokemon detail sections.
 *
 * The bar is rendered with a flex layout: label on the left, a relative
 * positioned track that contains the fill element on the right, and the
 * numeric percentage after the track. Widths come from `barWidth(pct)`
 * so that tests can assert the math without touching DOM.
 *
 * When an optional `winRate` is provided (vgcpast move data), a small
 * colored indicator is shown to the right of the percentage:
 *   - Green (emerald) when winRate >= 55%
 *   - Red (rose) when winRate <= 45%
 *   - Gray when in between (neutral)
 */

import { barWidth, formatPct } from "../utils";

interface UsageBarProps {
  label: string;
  pct: number;
  accent?: "blue" | "emerald" | "amber" | "pink" | "violet";
  /** Optional win rate (0-100) when this row was used. Shown as a colored badge. */
  winRate?: number;
}

const ACCENT_CLASSES: Record<NonNullable<UsageBarProps["accent"]>, string> = {
  blue: "bg-blue-500/80",
  emerald: "bg-emerald-500/80",
  amber: "bg-amber-500/80",
  pink: "bg-pink-500/80",
  violet: "bg-violet-500/80",
};

function winRateColor(wr: number): string {
  if (wr >= 55) return "text-emerald-400";
  if (wr <= 45) return "text-rose-400";
  return "text-gray-500";
}

export function UsageBar({ label, pct, accent = "blue", winRate }: UsageBarProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-40 shrink-0 truncate text-gray-200" title={label}>
        {label}
      </div>
      <div className="relative h-4 flex-1 rounded bg-gray-800/70 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${ACCENT_CLASSES[accent]}`}
          style={{ width: barWidth(pct) }}
        />
      </div>
      <div className="w-16 shrink-0 text-right tabular-nums text-gray-300">
        {formatPct(pct)}
      </div>
      {winRate !== undefined && (
        <div
          className={`w-14 shrink-0 text-right text-[10px] tabular-nums ${winRateColor(winRate)}`}
          title={`Win rate: ${winRate.toFixed(1)}%`}
        >
          wr {winRate.toFixed(0)}%
        </div>
      )}
    </div>
  );
}
