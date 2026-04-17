import React, { useState, useMemo } from "react";
import type { PoolMember, DamageMatrix } from "../../types/team-matchup";
import { comparePokemonName, localizePokemon } from "../../viewer/i18n";
import { DamageHeatmap } from "./DamageHeatmap";

interface SelectionSimulatorProps {
  myTeam: string[]; // 6 Pokemon names
  pool: PoolMember[]; // full pool (49 Pokemon)
  matrix: DamageMatrix; // damage matrix
  lang: "ja" | "en";
}

type Role = "ace" | "secondary" | "complement";

interface SelectionResult {
  members: string[];
  roles: Role[];
}

// ── Speed-weighted matchup value (mirrors team-matchup-core.ts ADR-002) ──

function effectiveKoN(entry: { koN: number; koChance?: number } | undefined | null): number {
  if (!entry || !entry.koN) return 99;
  return entry.koN + (1 - (entry.koChance ?? 0));
}

function matchupValueLocal(
  me: string, opp: string,
  matrix: DamageMatrix, poolSpeeds: Map<string, number>,
): number {
  const entry = matrix[me]?.[opp];
  if (!entry) return 0;
  const eKoN = effectiveKoN(entry);
  if (entry.priorityKoN === 1 && (entry.priorityKoChance ?? 0) >= 0.5) return 2.5;
  if (eKoN > 2.5) return 0;
  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;
  const isOHKO = eKoN <= 1.25;
  if (isOHKO) {
    if (mySpd > oppSpd) return 2.5;
    if (mySpd === oppSpd) return 1.9;
    return 1.3;
  }
  if (mySpd > oppSpd) return 1.0;
  if (mySpd === oppSpd) return 0.65;
  return 0.3;
}

const SECONDARY_THRESHOLD = 0.4;
const SECONDARY_COVERAGE_NEEDED = 5;

/**
 * Selection algorithm: given our 6-member team and the opponent's 6,
 * pick the best 3 with assigned roles (ace / secondary / complement).
 * Uses speed-weighted matchupValue (ADR-002) for attacker scoring.
 */
function selectTeam(
  myTeam: string[],
  oppTeam: string[],
  matrix: DamageMatrix,
  megaCapable: Set<string>,
  poolSpeeds: Map<string, number>,
): SelectionResult {
  // ADR-002: attackerScore = average matchupValue
  const scores = myTeam.map((me) => {
    let totalMV = 0;
    for (const opp of oppTeam) {
      totalMV += matchupValueLocal(me, opp, matrix, poolSpeeds);
    }
    return { name: me, score: totalMV / oppTeam.length };
  });
  scores.sort((a, b) => b.score - a.score);

  const selected: string[] = [scores[0].name]; // ace
  const roles: Role[] = ["ace"];

  // Secondary?
  for (const cand of scores.slice(1)) {
    if (selected.length >= 2) break;
    if (cand.score < SECONDARY_THRESHOLD) break;
    const hasMega = selected.some((s) => megaCapable.has(s));
    if (hasMega && megaCapable.has(cand.name)) continue;

    // Coverage check
    const coveredByAce = new Set<string>();
    const coveredByCand = new Set<string>();
    for (const opp of oppTeam) {
      if (effectiveKoN(matrix[scores[0].name]?.[opp]) <= 2.5) coveredByAce.add(opp);
      if (effectiveKoN(matrix[cand.name]?.[opp]) <= 2.5) coveredByCand.add(opp);
    }
    const combined = new Set([...coveredByAce, ...coveredByCand]);
    if (combined.size >= SECONDARY_COVERAGE_NEEDED) {
      selected.push(cand.name);
      roles.push("secondary");
      break;
    }
  }

  // Fill complement
  const selectedSet = new Set(selected);
  while (selected.length < 3) {
    let best = "";
    let bestScore = -1;
    for (const me of myTeam) {
      if (selectedSet.has(me)) continue;
      const hasMega = selected.some((s) => megaCapable.has(s));
      if (hasMega && megaCapable.has(me)) continue;

      let defVal = 0;
      let offVal = 0;
      for (const opp of oppTeam) {
        const isThreat = selected.some((s) => {
          return effectiveKoN(matrix[opp]?.[s]) <= 1.5;
        });
        if (isThreat) {
          const canTank = effectiveKoN(matrix[opp]?.[me]) > 1.5;
          const canHit = (matrix[me]?.[opp]?.maxPct ?? 0) >= 30;
          if (canTank && canHit) defVal++;
        }
        const uncovered = !selected.some((s) => {
          return effectiveKoN(matrix[s]?.[opp]) <= 2.5;
        });
        if (uncovered && effectiveKoN(matrix[me]?.[opp]) <= 2.5) {
          offVal++;
        }
      }
      const sc = 0.5 * defVal + 0.5 * offVal;
      if (sc > bestScore) {
        bestScore = sc;
        best = me;
      }
    }
    if (!best) {
      for (const cand of scores) {
        if (!selectedSet.has(cand.name)) {
          const hasMega = selected.some((s) => megaCapable.has(s));
          if (hasMega && megaCapable.has(cand.name)) continue;
          best = cand.name;
          break;
        }
      }
    }
    if (!best) best = myTeam.find((m) => !selectedSet.has(m))!;
    selected.push(best);
    selectedSet.add(best);
    roles.push("complement");
  }

  return { members: selected, roles };
}

const ROLE_LABELS: Record<Role, { ja: string; en: string }> = {
  ace: { ja: "エース", en: "Ace" },
  secondary: { ja: "セカンド", en: "Secondary" },
  complement: { ja: "補完", en: "Complement" },
};

const ROLE_COLORS: Record<Role, string> = {
  ace: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  secondary: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  complement: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

export function SelectionSimulator({
  myTeam,
  pool,
  matrix,
  lang,
}: SelectionSimulatorProps) {
  const [oppTeam, setOppTeam] = useState<string[]>(["", "", "", "", "", ""]);

  const t = {
    title: lang === "ja" ? "選出シミュレータ" : "Selection Simulator",
    oppTeam: lang === "ja" ? "相手チーム" : "Opponent Team",
    recommended: lang === "ja" ? "推奨選出" : "Recommended Selection",
    selectAll:
      lang === "ja"
        ? "相手の6体を選んでください"
        : "Select all 6 opponent Pokemon",
    placeholder: "-- select --",
    reset: lang === "ja" ? "リセット" : "Reset",
    matchupDetail:
      lang === "ja" ? "選出 vs 相手 ダメージ" : "Selection vs Opponent Damage",
  };

  // Build mega-capable set from pool data
  const megaCapable = useMemo(
    () => new Set(pool.filter((p) => p.isMega).map((p) => p.name)),
    [pool],
  );

  // Build poolSpeeds map from pool data (ADR-002)
  const poolSpeeds = useMemo(
    () => new Map(pool.filter((p) => p.speedStat != null).map((p) => [p.name, p.speedStat!])),
    [pool],
  );

  // Sort pool alphabetically (EN) or in gojuon order (JA) for the dropdowns
  const sortedPool = useMemo(
    () => [...pool].sort((a, b) => comparePokemonName(a.name, b.name, lang)),
    [pool, lang],
  );

  // Set of already-chosen opponent names (to filter out duplicates from dropdowns)
  const chosenSet = useMemo(() => new Set(oppTeam.filter(Boolean)), [oppTeam]);

  // Whether all 6 opponent slots are filled
  const allFilled = oppTeam.every((name) => name !== "");

  // Run selection algorithm when all 6 are chosen
  const result: SelectionResult | null = useMemo(() => {
    if (!allFilled) return null;
    return selectTeam(myTeam, oppTeam, matrix, megaCapable, poolSpeeds);
  }, [myTeam, oppTeam, matrix, allFilled, megaCapable, poolSpeeds]);

  function handleSlotChange(index: number, value: string) {
    setOppTeam((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleReset() {
    setOppTeam(["", "", "", "", "", ""]);
  }

  return (
    <div className="rounded bg-gray-800/50 p-4 space-y-3">
      {/* ── Title ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">{t.title}</h3>
        <button
          onClick={handleReset}
          className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-600 hover:text-gray-200 transition"
        >
          {t.reset}
        </button>
      </div>

      {/* ── Opponent Team Builder ── */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-1.5">
          {t.oppTeam}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {oppTeam.map((selected, i) => (
            <select
              key={i}
              value={selected}
              onChange={(e) => handleSlotChange(i, e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none transition"
            >
              <option value="">{t.placeholder}</option>
              {sortedPool.map((p) => {
                // Show the option if it's currently selected in this slot, or not chosen elsewhere
                const available = p.name === selected || !chosenSet.has(p.name);
                if (!available) return null;
                return (
                  <option key={p.name} value={p.name}>
                    {localizePokemon(p.name, lang)}
                  </option>
                );
              })}
            </select>
          ))}
        </div>
      </div>

      {/* ── Prompt when incomplete ── */}
      {!allFilled && (
        <div className="text-xs text-gray-500 text-center py-2">
          {t.selectAll}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="space-y-3">
          {/* Recommended selection header */}
          <div className="text-xs font-medium text-gray-400">
            {t.recommended}
          </div>

          {/* Selected Pokemon with roles */}
          <div className="grid grid-cols-3 gap-2">
            {result.members.map((name, i) => {
              const role = result.roles[i];
              const roleLabel = ROLE_LABELS[role][lang];
              const roleColor = ROLE_COLORS[role];
              return (
                <div
                  key={name}
                  className="rounded bg-gray-800 border border-gray-700 p-2.5 text-center space-y-1"
                >
                  <div className="text-sm font-semibold text-gray-100">
                    {localizePokemon(name, lang)}
                  </div>
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${roleColor}`}
                  >
                    {roleLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Mini damage heatmap: selected 3 vs opponent 6 */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-1.5">
              {t.matchupDetail}
            </div>
            <DamageHeatmap
              members={result.members}
              defenders={oppTeam}
              matrix={matrix}
              lang={lang}
            />
          </div>
        </div>
      )}
    </div>
  );
}
