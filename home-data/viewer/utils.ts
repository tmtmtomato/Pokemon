/**
 * Pure helper functions for the Champions Meta Viewer.
 *
 * These are kept free of React / DOM so that they can be unit-tested in
 * isolation under `home-data/vitest.config.ts`.
 */

import type { FormatMeta, PokemonMeta } from "../types/analytics";
import { comparePokemonName, localizePokemon, type Lang } from "./i18n";

export type SortKey = "usage" | "winRate" | "name" | "rank";

/** Source filter for the toolbar: match both, or require a specific source. */
export type SourceFilter = "any" | "pikalytics" | "vgcpast" | "both";

/**
 * Case-insensitive substring search against the Pokemon name. Matches
 * either the canonical English name or its localized JP form so users
 * can search in either language.
 * An empty query is treated as a match-all.
 */
export function matchesQuery(name: string, query: string): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (name.toLowerCase().includes(needle)) return true;
  const ja = localizePokemon(name);
  return ja !== name && ja.toLowerCase().includes(needle);
}

/**
 * Tries to extract the vgcpast game count from the `notes` array. We don't
 * have a first-class numeric field, but every note produced by Track C's
 * merge step formats vgcpast coverage as `vgcpast <N> games (...)`.
 * Returns 0 when no such note is present.
 */
export function extractVgcpastGames(mon: PokemonMeta): number {
  for (const note of mon.notes) {
    const m = /vgcpast\s+(\d+)\s+games/i.exec(note);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** Returns true when the Pokemon has at least one Pikalytics-derived note. */
export function hasPikalyticsNote(mon: PokemonMeta): boolean {
  return mon.notes.some((n) => /pikalytics/i.test(n));
}

/** Returns true when the Pokemon has at least one vgcpast-derived note. */
export function hasVgcpastNote(mon: PokemonMeta): boolean {
  return mon.notes.some((n) => /vgcpast/i.test(n));
}

/**
 * Apply query / minimum-vgcpast-games / source filters to a list of
 * Pokemon, preserving the original order.
 */
export function filterPokemon(
  list: PokemonMeta[],
  query: string,
  minGames: number,
  source: SourceFilter = "any",
): PokemonMeta[] {
  return list.filter((mon) => {
    if (!matchesQuery(mon.name, query)) return false;
    if (minGames > 0 && extractVgcpastGames(mon) < minGames) return false;
    if (source === "pikalytics" && !hasPikalyticsNote(mon)) return false;
    if (source === "vgcpast" && !hasVgcpastNote(mon)) return false;
    if (source === "both" && !(hasPikalyticsNote(mon) && hasVgcpastNote(mon))) {
      return false;
    }
    return true;
  });
}

/**
 * Return a new array sorted by the selected key. "rank" uses the authoritative
 * rank field (ascending) so that output matches the upstream Pikalytics order.
 *
 * When sorting by "name", the `lang` parameter controls the collation:
 *   - `"ja"` (default): 五十音順 (gojuon order via `localeCompare('ja')`)
 *   - `"en"`: standard English alphabetical order
 */
export function sortPokemon(list: PokemonMeta[], by: SortKey, lang: Lang = "ja"): PokemonMeta[] {
  const sorted = list.slice();
  switch (by) {
    case "usage":
      sorted.sort((a, b) => b.usagePct - a.usagePct);
      break;
    case "winRate":
      sorted.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
      break;
    case "name":
      sorted.sort((a, b) => comparePokemonName(a.name, b.name, lang));
      break;
    case "rank":
    default:
      sorted.sort((a, b) => a.rank - b.rank);
      break;
  }
  return sorted;
}

/**
 * Format a 0-100 percentage with fixed precision, avoiding trailing zeros
 * for integer values (e.g. 100 → "100%", 41.092 → "41.09%").
 */
export function formatPct(pct: number | undefined, digits = 2): string {
  if (pct === undefined || Number.isNaN(pct)) return "-";
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct.toFixed(digits)}%`;
}

/**
 * Bar-graph width: clamps `pct` to 0-100 and returns a CSS width string.
 * Used by <UsageBar /> to drive the horizontal bar width via Tailwind style.
 */
export function barWidth(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `${clamped.toFixed(2)}%`;
}

/** Convenience selector that returns the top-ranked Pokemon for a format. */
export function pickDefaultPokemon(fmt: FormatMeta): PokemonMeta | undefined {
  if (!fmt.pokemon.length) return undefined;
  // rank 1 may not be at index 0 if the JSON was not pre-sorted; search.
  let best = fmt.pokemon[0];
  for (const mon of fmt.pokemon) {
    if (mon.rank < best.rank) best = mon;
  }
  return best;
}
