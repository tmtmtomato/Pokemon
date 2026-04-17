import type { Lang } from "../../viewer/i18n";
import { localizePokemon } from "../../viewer/i18n";
import type { ComplementScore } from "../builderCalc";

interface Props {
  suggestions: ComplementScore[];
  lang: Lang;
  onSelect: (name: string) => void;
}

export function ComplementPanel({ suggestions, lang, onSelect }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {lang === "ja" ? "おすすめ補完" : "Suggested Picks"}
      </h3>
      <div className="flex flex-col gap-1">
        {suggestions.map((s, i) => (
          <button
            key={s.name}
            onClick={() => onSelect(s.name)}
            className="flex items-start gap-2 rounded border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-left hover:border-gray-500 hover:bg-gray-800 transition-colors"
          >
            <span className="text-[10px] text-gray-500 mt-0.5 w-4 text-right shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {localizePokemon(s.name, lang)}
              </div>
              {/* Score bar */}
              <div className="mt-0.5 h-1 w-full rounded bg-gray-700">
                <div
                  className="h-full rounded bg-blue-500 transition-all"
                  style={{ width: `${Math.round(s.totalScore * 100)}%` }}
                />
              </div>
              {/* Reasons */}
              <div className="text-[10px] text-gray-500 mt-0.5">
                {s.reasons.length > 0
                  ? s.reasons.join(" · ")
                  : `${s.toughsCovered} answers`}
              </div>
              {/* Top answered threats */}
              {s.answersNames.length > 0 && (
                <div className="text-[9px] text-green-500/70 truncate mt-0.5">
                  → {s.answersNames.slice(0, 3).map((n) => localizePokemon(n, lang)).join(", ")}
                  {s.answersNames.length > 3 && ` +${s.answersNames.length - 3}`}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
