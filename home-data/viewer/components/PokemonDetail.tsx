/**
 * Right-pane detail view for the selected Pokemon. Shows the top rows of
 * each distribution (moves/abilities/items/tera/teammates) rendered with
 * <UsageBar />, and includes metadata such as rank, usage%, win rate, and
 * the free-form notes that document which source each field came from.
 */

import type { PokemonMeta, TopBuild, WeightedRow } from "../../types/analytics";
import { useLang } from "../LanguageContext";
import {
  localizeAbility,
  localizeItem,
  localizeMove,
  localizePokemon,
  natureLabel,
} from "../i18n";
import type { Lang } from "../i18n";
import { PokemonIcon } from "../PokemonIcon";
import { formatPct } from "../utils";
import { UsageBar } from "./UsageBar";

const STAT_LABELS: { en: string; ja: string }[] = [
  { en: "HP", ja: "HP" },
  { en: "Atk", ja: "攻" },
  { en: "Def", ja: "防" },
  { en: "SpA", ja: "特攻" },
  { en: "SpD", ja: "特防" },
  { en: "Spe", ja: "速" },
];

function TopBuildSection({ build, lang }: { build: TopBuild; lang: Lang }) {
  const evs = build.evs.split("/").map((s) => Number(s));
  const heading = lang === "ja" ? "型調整 / Top Build" : "Top Build / 型調整";
  const adoption = lang === "ja" ? "採用率" : "Adoption";
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        {heading}
      </h3>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <div className="text-base font-semibold text-gray-100">
          {natureLabel(build.nature, lang)}
        </div>
        <div className="text-xs text-gray-400">
          {adoption}{" "}
          <span className="tabular-nums text-emerald-300">
            {build.pct.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1 text-center">
        {STAT_LABELS.map((label, i) => {
          const v = evs[i] ?? 0;
          const isMax = v === 252;
          const isZero = v === 0;
          return (
            <div
              key={label.en}
              className={[
                "rounded border px-1 py-1.5",
                isMax
                  ? "border-emerald-600/60 bg-emerald-900/30 text-emerald-200"
                  : isZero
                    ? "border-gray-800 bg-gray-900/50 text-gray-600"
                    : "border-amber-600/40 bg-amber-900/20 text-amber-200",
              ].join(" ")}
            >
              <div className="text-[9px] uppercase tracking-wide text-gray-400">
                {lang === "ja" ? label.ja : label.en}
              </div>
              <div className="text-sm font-semibold tabular-nums">{v}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] tabular-nums text-gray-500">
        EV: {build.evs}
      </div>
    </section>
  );
}

interface PokemonDetailProps {
  mon: PokemonMeta | undefined;
  formatDisplay: string;
  /** 1-indexed display rank reflecting current sort/filter order. */
  displayRank?: number;
}

const MAX_ROWS_PER_SECTION = 10;

function Section({
  title,
  rows,
  accent,
  emptyLabel,
  localize,
  showWinRate,
}: {
  title: string;
  rows: WeightedRow[] | undefined;
  accent: "blue" | "emerald" | "amber" | "pink" | "violet";
  emptyLabel?: string;
  /** Optional row-name transformer (used to JP-localize moves/teammates). */
  localize?: (name: string) => string;
  /** When true, pass each row's winRate to UsageBar for color display. */
  showWinRate?: boolean;
}) {
  const top = (rows ?? []).slice(0, MAX_ROWS_PER_SECTION);
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      {top.length === 0 ? (
        <div className="text-sm text-gray-500">{emptyLabel ?? "No data"}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {top.map((row) => (
            <UsageBar
              key={row.name}
              label={localize ? localize(row.name) : row.name}
              pct={row.pct}
              accent={accent}
              winRate={showWinRate ? row.winRate : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function PokemonDetail({ mon, formatDisplay, displayRank }: PokemonDetailProps) {
  const { lang } = useLang();
  if (!mon) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-gray-500">
        {lang === "ja"
          ? "左のリストからポケモンを選んでください。"
          : "Select a Pokemon from the left pane."}
      </div>
    );
  }

  const primaryName = localizePokemon(mon.name, lang);
  const subName =
    lang === "ja"
      ? primaryName !== mon.name
        ? mon.name
        : undefined
      : localizePokemon(mon.name, "ja") !== mon.name
        ? localizePokemon(mon.name, "ja")
        : undefined;

  // Section titles localized inline so the JSX stays compact.
  const t =
    lang === "ja"
      ? {
          rank: "順位",
          usage: "使用率",
          winRate: "勝率",
          selectionRate: "選出率",
          registered: "構築採用",
          sources: "出典",
          none: "(なし)",
          moves: "技 / Top Moves",
          abilities: "特性 / Top Abilities",
          items: "持ち物 / Top Items",
          tera: "テラスタイプ / Tera Types",
          teammates: "選出相方 / Selection Teammates",
          partymates: "構築相方 / Party Teammates",
        }
      : {
          rank: "Rank",
          usage: "Usage",
          winRate: "Win rate",
          selectionRate: "Selection rate",
          registered: "Registered",
          sources: "Sources",
          none: "(none)",
          moves: "Top Moves",
          abilities: "Top Abilities",
          items: "Top Items",
          tera: "Tera Types",
          teammates: "Selection Teammates",
          partymates: "Party Teammates",
        };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">
              {formatDisplay}
            </div>
            <h2 className="text-2xl font-bold text-gray-50">
              <PokemonIcon name={mon.name} size="w-8 h-8" /> {primaryName}
            </h2>
            {subName && (
              <div className="text-xs text-gray-500">{subName}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-gray-500">{t.rank}</div>
            <div className="text-2xl font-bold tabular-nums text-gray-100">
              #{displayRank ?? mon.rank}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase text-gray-500">{t.usage}</div>
            <div className="text-lg tabular-nums text-blue-300">
              {formatPct(mon.usagePct)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500">
              {t.winRate}
            </div>
            <div className="text-lg tabular-nums text-emerald-300">
              {formatPct(mon.winRate, 2)}
            </div>
          </div>
          {mon.selectionRate !== undefined && (
            <div>
              <div className="text-[10px] uppercase text-gray-500">
                {t.selectionRate}
              </div>
              <div className="text-lg tabular-nums text-amber-300">
                {formatPct(mon.selectionRate, 1)}
              </div>
              {mon.registered !== undefined && (
                <div className="text-[10px] tabular-nums text-gray-500">
                  {t.registered}: {mon.registered}
                </div>
              )}
            </div>
          )}
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase text-gray-500">
              {t.sources}
            </div>
            <div className="flex flex-wrap gap-1">
              {mon.notes.length === 0 ? (
                <span className="text-xs text-gray-500">{t.none}</span>
              ) : (
                mon.notes.map((note) => (
                  <span
                    key={note}
                    className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300"
                  >
                    {note}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </header>

      {mon.topBuild && <TopBuildSection build={mon.topBuild} lang={lang} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title={t.moves}
          rows={mon.moves}
          accent="blue"
          localize={(n) => localizeMove(n, lang)}
          showWinRate
        />
        <Section
          title={t.abilities}
          rows={mon.abilities}
          accent="emerald"
          localize={(n) => localizeAbility(n, lang)}
        />
        <Section
          title={t.items}
          rows={mon.items}
          accent="amber"
          localize={(n) => localizeItem(n, lang)}
        />
        {mon.teraTypes && mon.teraTypes.length > 0 && (
          <Section title={t.tera} rows={mon.teraTypes} accent="violet" />
        )}
        <Section
          title={t.teammates}
          rows={mon.teammates}
          accent="pink"
          localize={(n) => localizePokemon(n, lang)}
        />
        {mon.partymates && mon.partymates.length > 0 && (
          <Section
            title={t.partymates}
            rows={mon.partymates}
            accent="violet"
            localize={(n) => localizePokemon(n, lang)}
          />
        )}
      </div>
    </div>
  );
}
