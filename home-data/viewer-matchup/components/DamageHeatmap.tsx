/**
 * 6x6 damage heatmap grid showing attacker (rows) vs defender (columns).
 *
 * Each cell is color-coded by KO potential and displays the max damage
 * percentage. Tooltips provide full detail (move name, range, KO info).
 */

import type { DamageMatrix } from "../../types/team-matchup";
import { localizePokemon, localizeMove } from "../../viewer/i18n";

interface DamageHeatmapProps {
  members: string[]; // 6 Pokemon names (rows = attackers)
  matrix: DamageMatrix; // full damage matrix
  lang: "ja" | "en";
  defenders?: string[]; // optional different defender set (for simulator)
}

/** Abbreviate a Pokemon display name to ~6 chars for compact headers. */
function abbreviate(name: string, lang: "ja" | "en"): string {
  const display = localizePokemon(name, lang);
  return display.length > 6 ? display.slice(0, 5) + "\u2026" : display;
}

/** Return a Tailwind class string for cell background based on damage output. */
function cellColor(maxPct: number, koN: number): string {
  if (koN === 1) return "bg-emerald-600/80 text-white"; // OHKO = bright green
  if (koN === 2) return "bg-lime-600/60 text-white"; // 2HKO = lime
  if (maxPct >= 40) return "bg-yellow-600/50 text-gray-100"; // good chunk
  if (maxPct >= 20) return "bg-orange-600/30 text-gray-200"; // moderate
  return "bg-gray-800/50 text-gray-500"; // low damage
}

/** Build a human-readable tooltip string for one matchup cell. */
function cellTooltip(
  attacker: string,
  defender: string,
  bestMove: string,
  minPct: number,
  maxPct: number,
  koN: number,
  lang: "ja" | "en"
): string {
  const atkName = localizePokemon(attacker, lang);
  const defName = localizePokemon(defender, lang);
  const range = `${minPct.toFixed(1)}-${maxPct.toFixed(1)}%`;
  const koLabel =
    koN === 1
      ? "OHKO"
      : koN === 2
        ? "2HKO"
        : koN === 3
          ? "3HKO"
          : koN === 4
            ? "4HKO"
            : lang === "ja"
              ? "確定数なし"
              : "No KO";
  const moveName = localizeMove(bestMove, lang);
  return `${atkName} -> ${defName}\n${moveName}: ${range} (${koLabel})`;
}

export function DamageHeatmap({
  members,
  matrix,
  lang,
  defenders: defendersProp,
}: DamageHeatmapProps) {
  const defenders = defendersProp ?? members;

  return (
    <div>
      {/* Section title */}
      <h3 className="mb-2 text-xs font-bold text-gray-200">
        {lang === "ja" ? "対面ダメージ表" : "Damage Heatmap"}
      </h3>

      <div className="overflow-x-auto">
        <table className="text-[10px] tabular-nums border-separate border-spacing-0">
          {/* Column headers (defenders) */}
          <thead>
            <tr>
              {/* Top-left empty corner cell */}
              <th className="w-12 h-10" />
              {defenders.map((def) => (
                <th
                  key={def}
                  className="w-12 h-10 text-center text-gray-400 font-medium align-bottom pb-1"
                  title={localizePokemon(def, lang)}
                >
                  {abbreviate(def, lang)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {members.map((atk) => (
              <tr key={atk}>
                {/* Row header (attacker) */}
                <td
                  className="w-12 h-10 text-right pr-1 text-gray-400 font-medium align-middle"
                  title={localizePokemon(atk, lang)}
                >
                  {abbreviate(atk, lang)}
                </td>

                {defenders.map((def) => {
                  // Same-Pokemon cell
                  if (atk === def) {
                    return (
                      <td
                        key={def}
                        className="w-12 h-10 text-center align-middle bg-gray-900/60 text-gray-600"
                      >
                        &mdash;
                      </td>
                    );
                  }

                  const entry = matrix[atk]?.[def];

                  // Missing data fallback
                  if (!entry) {
                    return (
                      <td
                        key={def}
                        className="w-12 h-10 text-center align-middle bg-gray-800/30 text-gray-600"
                      >
                        ?
                      </td>
                    );
                  }

                  const { bestMove, minPct, maxPct, koN } = entry;
                  const color = cellColor(maxPct, koN);
                  const tooltip = cellTooltip(
                    atk,
                    def,
                    bestMove,
                    minPct,
                    maxPct,
                    koN,
                    lang
                  );

                  return (
                    <td
                      key={def}
                      className={`w-12 h-10 text-center align-middle rounded-sm ${color}`}
                      title={tooltip}
                    >
                      <div className="leading-tight">
                        <span className="text-[11px] font-semibold">
                          {Math.round(maxPct)}
                        </span>
                        {koN === 1 && (
                          <div className="text-[8px] leading-none opacity-80">
                            KO
                          </div>
                        )}
                        {koN === 2 && (
                          <div className="text-[8px] leading-none opacity-80">
                            2
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
