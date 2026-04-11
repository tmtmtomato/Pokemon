/**
 * Right-pane core detail: partial pick patterns, top teams containing
 * this core, and companion Pokemon for the remaining 3 slots.
 */

import type { CoreEntry } from "../../types/team-analysis";
import { useLang } from "../../viewer/LanguageContext";
import { localizePokemon } from "../../viewer/i18n";
import { UsageBar } from "../../viewer/components/UsageBar";
import { fmtPct } from "../utils";

interface CoreDetailProps {
  core: CoreEntry | undefined;
}

export function CoreDetail({ core }: CoreDetailProps) {
  const { lang } = useLang();

  if (!core) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-gray-500">
        {lang === "ja"
          ? "左のリストからコアを選んでください。"
          : "Select a core from the left pane."}
      </div>
    );
  }

  const t =
    lang === "ja"
      ? {
          overview: "コア概要",
          teamCount: "出現",
          coPickRate: "同時選出率",
          coPickWinRate: "同時選出時勝率",
          partial: "部分選出パターン",
          allThree: "3体全員",
          topTeams: "このコアを含む構築",
          companions: "残り3枠の頻出ポケモン",
          times: "回",
        }
      : {
          overview: "Core Overview",
          teamCount: "Appearances",
          coPickRate: "Co-pick Rate",
          coPickWinRate: "Co-pick Win Rate",
          partial: "Partial Pick Patterns",
          allThree: "All 3",
          topTeams: "Teams with This Core",
          companions: "Frequent Companions",
          times: "x",
        };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <header className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h2 className="mb-1 text-xs uppercase tracking-wider text-gray-500">
          {t.overview}
        </h2>
        <div className="flex flex-wrap gap-x-2 text-lg font-bold text-gray-50">
          {core.species.map((sp, i) => (
            <span key={sp}>
              {localizePokemon(sp, lang)}
              {i < core.species.length - 1 && (
                <span className="text-gray-600"> /</span>
              )}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase text-gray-500">
              {t.teamCount}
            </div>
            <div className="text-lg tabular-nums text-blue-300">
              {core.teamCount}{t.times}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500">
              {t.coPickRate}
            </div>
            <div className="text-lg tabular-nums text-amber-300">
              {fmtPct(core.coPickRate)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500">
              {t.coPickWinRate}
            </div>
            <div className="text-lg tabular-nums text-emerald-300">
              {fmtPct(core.coPickWinRate)}
            </div>
          </div>
        </div>
      </header>

      {/* Partial Pick Patterns */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {t.partial}
        </h3>
        <div className="flex flex-col gap-2">
          {/* All 3 co-picked */}
          <div className="flex items-center gap-2 rounded bg-gray-800/40 px-3 py-1.5 text-sm">
            <span className="flex-1 text-gray-200 font-medium">
              {t.allThree}:{" "}
              {core.species
                .map((sp) => localizePokemon(sp, lang))
                .join(" / ")}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-gray-400">
              {core.coPickCount}{t.times} ({fmtPct(core.coPickRate)})
            </span>
            <span
              className={`shrink-0 tabular-nums text-xs ${
                core.coPickWinRate >= 55
                  ? "text-emerald-400"
                  : core.coPickWinRate <= 45
                    ? "text-rose-400"
                    : "text-gray-500"
              }`}
            >
              wr {fmtPct(core.coPickWinRate)}
            </span>
          </div>

          {/* 2-of-3 pairs */}
          {core.partialPicks.map((pp) => {
            const pairLabel = pp.pair
              .map((sp) => localizePokemon(sp, lang))
              .join(" + ");
            const pairRate =
              core.teamCount > 0
                ? (pp.count / core.teamCount) * 100
                : 0;
            return (
              <div
                key={pp.pair.join("-")}
                className="flex items-center gap-2 rounded bg-gray-800/40 px-3 py-1.5 text-sm"
              >
                <span className="flex-1 text-gray-300 truncate">
                  {pairLabel}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-gray-400">
                  {pp.count}{t.times} ({fmtPct(pairRate)})
                </span>
                <span
                  className={`shrink-0 tabular-nums text-xs ${
                    pp.winRate >= 55
                      ? "text-emerald-400"
                      : pp.winRate <= 45
                        ? "text-rose-400"
                        : "text-gray-500"
                  }`}
                >
                  wr {fmtPct(pp.winRate)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top Teams */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {t.topTeams} TOP {Math.min(core.topTeams.length, 10)}
        </h3>
        {core.topTeams.length === 0 ? (
          <div className="text-sm text-gray-500">No data</div>
        ) : (
          <div className="flex flex-col gap-2">
            {core.topTeams.slice(0, 10).map((tt, i) => {
              // Show the 3 companions (not in core)
              const companions = tt.teamKey
                .split(" / ")
                .filter((sp) => !core.species.includes(sp));
              return (
                <div
                  key={tt.teamKey}
                  className="flex items-baseline gap-2 rounded bg-gray-800/40 px-3 py-1.5 text-sm"
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-gray-500">
                    {i + 1}.
                  </span>
                  <span className="flex-1 text-gray-300 truncate">
                    +{" "}
                    {companions
                      .map((sp) => localizePokemon(sp, lang))
                      .join(" / ")}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-gray-400">
                    {tt.count}{t.times}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums text-xs ${
                      tt.winRate >= 55
                        ? "text-emerald-400"
                        : tt.winRate <= 45
                          ? "text-rose-400"
                          : "text-gray-500"
                    }`}
                  >
                    wr {fmtPct(tt.winRate)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Companion Pokemon */}
      <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          {t.companions}
        </h3>
        <div className="flex flex-col gap-2">
          {core.companions.slice(0, 15).map((c) => (
            <UsageBar
              key={c.name}
              label={localizePokemon(c.name, lang)}
              pct={c.pct}
              accent="emerald"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
