/**
 * Reusable horizontal score bar for 0-100 numeric scores.
 * Similar to UsageBar in the meta viewer, but styled for power rankings.
 */

interface ScoreBarProps {
  label: string;
  value: number; // 0-100
  accent?: "blue" | "emerald" | "amber" | "rose" | "violet" | "cyan" | "teal" | "orange";
  showValue?: boolean;
}

const ACCENT_CLASSES: Record<NonNullable<ScoreBarProps["accent"]>, string> = {
  blue: "bg-blue-500/80",
  emerald: "bg-emerald-500/80",
  amber: "bg-amber-500/80",
  rose: "bg-rose-500/80",
  violet: "bg-violet-500/80",
  cyan: "bg-cyan-500/80",
  teal: "bg-teal-500/80",
  orange: "bg-orange-500/80",
};

export function ScoreBar({ label, value, accent = "blue", showValue = true }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-28 shrink-0 truncate text-gray-300" title={label}>
        {label}
      </div>
      <div className="relative h-4 flex-1 rounded bg-gray-800/70 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded ${ACCENT_CLASSES[accent]}`}
          style={{ width: `${clamped.toFixed(1)}%` }}
        />
      </div>
      {showValue && (
        <div className="w-14 shrink-0 text-right tabular-nums text-gray-300">
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </div>
      )}
    </div>
  );
}
