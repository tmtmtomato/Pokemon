/**
 * Pure utility functions for the team analysis viewer.
 */

import type { Lang } from "../viewer/i18n";
import type { SelectionEntry } from "../types/team-analysis";

/**
 * Compute co-selection rate for a pair of species within a team's
 * selection data. Returns 0-100 percentage.
 */
export function pairCoSelectionRate(
  selections: SelectionEntry[],
  a: string,
  b: string,
): number {
  let total = 0;
  let together = 0;
  for (const sel of selections) {
    total += sel.count;
    if (sel.species.includes(a) && sel.species.includes(b)) {
      together += sel.count;
    }
  }
  return total > 0 ? (together / total) * 100 : 0;
}

/** Generate all C(n,2) pairs from an array. */
export function allPairs<T>(arr: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      pairs.push([arr[i], arr[j]]);
    }
  }
  return pairs;
}

/** Sample-size confidence label. */
export function confidenceLabel(
  n: number,
  lang: Lang,
): string | undefined {
  if (n < 5) return lang === "ja" ? "参考値" : "Ref. only";
  if (n < 10) return lang === "ja" ? "少量サンプル" : "Small sample";
  return undefined;
}

/** Format a percentage to a fixed number of decimal places. */
export function fmtPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/**
 * Wilson Score Lower Bound (95% confidence).
 *
 * Returns the lower bound of the confidence interval for observed win rate,
 * penalizing small sample sizes. Ideal for ranking items by "true" quality.
 *
 * @param wins  Number of wins
 * @param n     Total games played
 * @returns     Lower bound as percentage (0-100)
 */
export function wilsonLower(wins: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96; // 95% confidence
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return ((centre - spread) / denom) * 100;
}

/** Deviation label for co-selection rate vs 40% random baseline. */
export function coSelLabel(
  rate: number,
  lang: Lang,
): { text: string; color: string } | undefined {
  if (rate >= 55) {
    return {
      text: lang === "ja" ? "セット運用" : "Set play",
      color: "text-emerald-400",
    };
  }
  if (rate <= 25) {
    return {
      text: lang === "ja" ? "出し分け" : "Split",
      color: "text-amber-400",
    };
  }
  return undefined;
}
