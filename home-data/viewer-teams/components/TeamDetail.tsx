/**
 * Right-pane team detail: member selection rates, top selection patterns,
 * and co-selection correlation.
 */

import type { TeamEntry } from "../../types/team-analysis";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon } from "../../viewer/i18n";
import { UsageBar } from "../../viewer/components/UsageBar";
import { allPairs, coSelLabel, fmtPct, pairCoSelectionRate } from "../utils";

interface TeamDetailProps {
  team: TeamEntry | undefined;
}

export function TeamDetail({ team }: TeamDetailProps) {
  const { lang } = useLang();

  if (!team) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-gray-500">
        {lang === "ja"
          ? "左のリストから構築を選んでください。"
          : "Select a team from the left pane."}
      </div>
    );
  }

  const t =
    lang === "ja"
      ? {
          overview: "構築概要",
          count: "出現",
          winRate: "勝率",
          selectionRate: "メンバー別 選出率",
          patterns: "選出パターン",
          coSelection: "同時選出相関",
          times: "回",
        }
      : {
          overview: "Team Overview",
          count: "Count",
          winRate: "Win Rate",
          selectionRate: "Per-Member Selection Rate",
          patterns: "Selection Patterns",
          coSelection: "Co-Selection Correlation",
          times: "x",
        };

  // Sort members by selection rate descending
  const sortedMembers = [...team.species].sort(
    (a, b) =>
      (team.perMonSelectionRate[b] ?? 0) - (team.perMonSelectionRate[a] ?? 0),
  );

  // Compute co-selection for all pairs
  const pairs = allPairs(team.species);
  const pairData = pairs
    .map(([a, b]) => ({
      a,
      b,
      rate: pairCoSelectionRate(team.selections, a, b),
    }))
    .sort((x, y) => y.rate - x.rate);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <header className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h2 className="mb-1 text-xs uppercase tracking-wider text-gray-500">
          {t.overview}
        </h2>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-lg font-bold text-gray-50">
          {team.species.map((sp, i) => (
            <span key={sp}>
              {localizePokemon(sp, lang)}
              {i < team.species.length - 1 && (
                <span className="text-gray-600"> /</span>
              )}
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-6">
          <div>
            <div className="text-[10px] uppercase text-gray-500">{t.count}</div>
            <div className="text-lg tabular-nums text-blue-300">
              {team.count}{t.times}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500">
              {t.winRate}
            </div>
            <div className="text-lg tabular-nums text-emerald-300">
              {fmtPct(team.winRate)}
            </div>
          </div>
        </div>
      </header>

      {/* Member Selection Rates */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {t.selectionRate}
        </h3>
        <div className="flex flex-col gap-2">
          {sortedMembers.map((sp) => (
            <UsageBar
              key={sp}
              label={localizePokemon(sp, lang)}
              pct={team.perMonSelectionRate[sp] ?? 0}
              accent="blue"
            />
          ))}
        </div>
      </section>

      {/* Selection Patterns */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {t.patterns} TOP {Math.min(team.selections.length, 10)}
        </h3>
        {team.selections.length === 0 ? (
          <div className="text-sm text-gray-500">No data</div>
        ) : (
          <div className="flex flex-col gap-2">
            {team.selections.slice(0, 10).map((sel, i) => (
              <div
                key={sel.key}
                className="flex items-baseline gap-2 rounded bg-gray-800/40 px-3 py-1.5 text-sm"
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-gray-500">
                  {i + 1}.
                </span>
                <span className="flex-1 text-gray-200 truncate">
                  {sel.species
                    .map((sp) => localizePokemon(sp, lang))
                    .join(" / ")}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-gray-400">
                  {sel.count}{t.times}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-gray-500">
                  ({fmtPct(sel.pickRate)})
                </span>
                <span
                  className={`shrink-0 tabular-nums text-xs ${
                    sel.winRate >= 55
                      ? "text-emerald-400"
                      : sel.winRate <= 45
                        ? "text-rose-400"
                        : "text-gray-500"
                  }`}
                >
                  wr {fmtPct(sel.winRate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Co-Selection Correlation */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {t.coSelection}
        </h3>
        <div className="mb-2 text-[10px] text-gray-500">
          {lang === "ja"
            ? "ランダム選出の期待値: 40%"
            : "Random baseline: 40%"}
        </div>
        <div className="flex flex-col gap-1">
          {pairData.map(({ a, b, rate }) => {
            const label = coSelLabel(rate, lang);
            return (
              <div
                key={`${a}-${b}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="w-64 shrink-0 truncate text-gray-300">
                  {localizePokemon(a, lang)} + {localizePokemon(b, lang)}
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums text-gray-200">
                  {fmtPct(rate, 0)}
                </span>
                {label && (
                  <span className={`text-[10px] ${label.color}`}>
                    {label.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
