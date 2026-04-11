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

/**
 * Selection algorithm: given our 6-member team and the opponent's 6,
 * pick the best 3 with assigned roles (ace / secondary / complement).
 * Enforces mega exclusivity: max 1 mega per selection.
 */
function selectTeam(
  myTeam: string[],
  oppTeam: string[],
  matrix: DamageMatrix,
  megaCapable: Set<string>,
): SelectionResult {
  // Score each member as attacker
  const scores = myTeam.map((me) => {
    let kills = 0;
    let totalDmg = 0;
    for (const opp of oppTeam) {
      const entry = matrix[me]?.[opp];
      if (!entry) continue;
      if (entry.koN >= 1 && entry.koN <= 2 && entry.koChance >= 0.5) kills++;
      totalDmg += entry.maxPct;
    }
    return {
      name: me,
      score: 0.6 * (kills / 6) + 0.4 * (totalDmg / 600),
      kills,
    };
  });
  scores.sort((a, b) => b.score - a.score);

  const selected: string[] = [scores[0].name]; // ace
  const roles: Role[] = ["ace"];

  // Secondary?
  for (const cand of scores.slice(1)) {
    if (selected.length >= 2) break;
    if (cand.score < 0.3) break;
    // Mega constraint: max 1 mega in selection
    const hasMega = selected.some((s) => megaCapable.has(s));
    if (hasMega && megaCapable.has(cand.name)) continue;
    selected.push(cand.name);
    roles.push("secondary");
    break;
  }

  // Fill complement
  while (selected.length < 3) {
    let best = "";
    let bestScore = -1;
    for (const me of myTeam) {
      if (selected.includes(me)) continue;
      // Mega constraint
      const hasMega = selected.some((s) => megaCapable.has(s));
      if (hasMega && megaCapable.has(me)) continue;

      let defVal = 0;
      let offVal = 0;
      for (const opp of oppTeam) {
        // Defense: can tank threats to our selected members
        const isThreat = selected.some((s) => {
          const e = matrix[opp]?.[s];
          return e && e.koN === 1 && e.koChance >= 0.5;
        });
        if (isThreat) {
          const canTank = !(
            matrix[opp]?.[me]?.koN === 1 &&
            matrix[opp]?.[me]?.koChance >= 0.5
          );
          const canHit = (matrix[me]?.[opp]?.maxPct ?? 0) >= 30;
          if (canTank && canHit) defVal++;
        }
        // Offense: cover opponents not yet covered by selected
        const uncovered = !selected.some((s) => {
          const e = matrix[s]?.[opp];
          return e && e.koN >= 1 && e.koN <= 2 && e.koChance >= 0.5;
        });
        if (
          uncovered &&
          matrix[me]?.[opp]?.koN &&
          matrix[me][opp].koN <= 2 &&
          matrix[me][opp].koChance >= 0.5
        ) {
          offVal++;
        }
      }
      const sc = 0.5 * defVal + 0.5 * offVal;
      if (sc > bestScore) {
        bestScore = sc;
        best = me;
      }
    }
    if (!best) best = myTeam.find((m) => !selected.includes(m))!;
    selected.push(best);
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
    return selectTeam(myTeam, oppTeam, matrix, megaCapable);
  }, [myTeam, oppTeam, matrix, allFilled, megaCapable]);

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
