import { useState } from "react";
import type { Lang } from "../../viewer/i18n";
import { localizePokemon, localizeMove } from "../../viewer/i18n";
import type {
  DefensiveSafeMarginEntry,
  DefensiveConstrainer,
  DefensiveUpgradeEntry,
  DefensiveUpgrader,
} from "../spAnalysisCalc";
import { koLabel, koColor } from "../spAnalysisCalc";

const STAT_LABEL: Record<string, Record<string, string>> = {
  hp:  { ja: "HP", en: "HP" },
  def: { ja: "B", en: "Def" },
  spd: { ja: "D", en: "SpD" },
};

/** Format attacker's offensive investment: e.g. "A32+補正" or "C20" */
function formatOffInvestment(
  c: { category: string; attackerOffensiveSP: number; attackerNatMod: number },
  lang: Lang,
): string {
  const statChar = c.category === "Physical" ? "A" : "C";
  const boost = c.attackerNatMod >= 1.1
    ? (lang === "ja" ? "+補正" : "+Nat")
    : c.attackerNatMod <= 0.9
      ? (lang === "ja" ? "-補正" : "-Nat")
      : "";
  return `${statChar}${c.attackerOffensiveSP}${boost}`;
}

type SubTab = "reduction" | "upgrade";

interface Props {
  safeMargins: DefensiveSafeMarginEntry[];
  upgrades: DefensiveUpgradeEntry[];
  lang: Lang;
}

export function DefensiveThresholds({ safeMargins, upgrades, lang }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("reduction");
  const hasReduction = safeMargins.length > 0;
  const hasUpgrade = upgrades.length > 0 && upgrades.some((u) => u.upgraders.length > 0);

  return (
    <div className="text-xs">
      {/* Sub-tab switcher */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setSubTab("reduction")}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            subTab === "reduction"
              ? "bg-orange-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          {lang === "ja" ? "▼ 削減余裕" : "▼ Reduction"}
        </button>
        <button
          onClick={() => setSubTab("upgrade")}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            subTab === "upgrade"
              ? "bg-green-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          {lang === "ja" ? "▲ 追加効果" : "▲ Upgrade"}
        </button>
      </div>

      {/* Reduction content */}
      {subTab === "reduction" && (
        hasReduction ? (
          <div className="space-y-3">
            {safeMargins.map((m) => {
              const label = STAT_LABEL[m.stat]?.[lang] ?? m.stat.toUpperCase();
              const allOK = m.safeReduction >= m.currentSP;

              return (
                <div key={m.stat} className="rounded border border-gray-700 bg-gray-800/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 border-b border-gray-700">
                    <span className="font-semibold text-gray-300">
                      {label}
                      <span className="text-gray-500 font-normal ml-1">
                        ({lang === "ja" ? `現在S${m.currentSP}` : `S${m.currentSP}`})
                      </span>
                    </span>
                    <span className={`ml-auto text-xs font-bold ${
                      allOK ? "text-green-400"
                      : m.safeReduction === 0 ? "text-red-400"
                      : m.safeReduction <= 3 ? "text-yellow-400"
                      : "text-blue-400"
                    }`}>
                      {allOK
                        ? (lang === "ja" ? "全削OK" : "All safe")
                        : m.safeReduction === 0
                          ? (lang === "ja" ? "余裕なし" : "No margin")
                          : (lang === "ja" ? `安全: -${m.safeReduction}まで` : `Safe: -${m.safeReduction}`)}
                    </span>
                  </div>

                  {!allOK && m.constrainers.length > 0 && (
                    <div className="divide-y divide-gray-700/50 max-w-2xl max-h-[28rem] overflow-y-auto">
                      {m.constrainers.map((c, i) => (
                        <ConstrainerRow key={`${c.attackerName}-${c.moveName}`} c={c} isFirst={i === 0} lang={lang} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-green-400 py-2">
            {lang === "ja"
              ? "耐久SPに制約なし — 自由に削減可能"
              : "No defensive SP constraints — safe to reduce"}
          </div>
        )
      )}

      {/* Upgrade content */}
      {subTab === "upgrade" && (
        hasUpgrade ? (
          <div className="space-y-3">
            {upgrades.map((u) => {
              if (u.upgraders.length === 0) return null;
              const label = STAT_LABEL[u.stat]?.[lang] ?? u.stat.toUpperCase();

              return (
                <div key={u.stat} className="rounded border border-gray-700 bg-gray-800/40 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 border-b border-gray-700">
                    <span className="font-semibold text-gray-300">
                      {label}
                      <span className="text-gray-500 font-normal ml-1">
                        ({lang === "ja" ? `現在S${u.currentSP}` : `S${u.currentSP}`})
                      </span>
                    </span>
                    <span className={`ml-auto text-xs font-bold ${
                      u.cheapestUpgrade <= 2 ? "text-green-400"
                      : u.cheapestUpgrade <= 4 ? "text-blue-400"
                      : "text-gray-400"
                    }`}>
                      {lang === "ja"
                        ? `最安: +${u.cheapestUpgrade}`
                        : `Cheapest: +${u.cheapestUpgrade}`}
                    </span>
                  </div>

                  <div className="divide-y divide-gray-700/50 max-w-2xl">
                    {u.upgraders.map((up, i) => (
                      <UpgraderRow key={`${up.attackerName}-${up.moveName}`} u={up} isFirst={i === 0} lang={lang} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-gray-500 py-2">
            {lang === "ja"
              ? "SP追加で改善できる対面なし"
              : "No upgradeable matchups"}
          </div>
        )
      )}
    </div>
  );
}

/** Row for a constrainer (SP reduction worsens survival) */
function ConstrainerRow(
  { c, isFirst, lang }: { c: DefensiveConstrainer; isFirst: boolean; lang: Lang },
) {
  const rowBg = c.margin === 0
    ? "bg-red-900/15"
    : c.margin <= 3
      ? "bg-yellow-900/10"
      : "";

  const hasTransition = c.margin > 0
    && (c.worsenedKoN !== c.currentKoN
      || c.worsenedKoChance !== c.currentKoChance);

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 ${rowBg}`}>
      <span className={`w-14 shrink-0 font-mono text-right text-[11px] ${
        c.margin === 0
          ? "text-red-400 font-bold"
          : c.margin <= 3
            ? "text-yellow-400"
            : "text-blue-400"
      }`}>
        {c.margin === 0
          ? (lang === "ja" ? "限界" : "None")
          : `-${c.margin}`}
      </span>

      <span className={`shrink-0 truncate max-w-[7rem] ${
        isFirst ? "font-medium text-gray-200" : "text-gray-300"
      }`}>
        {localizePokemon(c.attackerName, lang)}
      </span>

      <span className={`text-[10px] shrink-0 font-mono ${
        c.attackerNatMod >= 1.1 ? "text-orange-400"
        : c.attackerOffensiveSP >= 16 ? "text-sky-400"
        : "text-gray-300"
      }`}>
        {formatOffInvestment(c, lang)}
      </span>

      <span className="text-[10px] text-gray-400 truncate min-w-0">
        {localizeMove(c.moveName, lang)}
        <span className="text-gray-600 ml-0.5">
          ({c.category === "Physical"
            ? (lang === "ja" ? "物" : "P")
            : (lang === "ja" ? "特" : "S")})
        </span>
      </span>

      <span className={`text-[10px] shrink-0 w-6 text-center ${
        c.speedComparison === "faster" ? "text-red-400"
        : c.speedComparison === "slower" ? "text-green-400"
        : "text-gray-500"
      }`}>
        {c.speedComparison === "faster"
          ? (lang === "ja" ? "先" : "1")
          : c.speedComparison === "slower"
            ? (lang === "ja" ? "後" : "2")
            : "="}
      </span>

      <span className="shrink-0 font-mono text-xs ml-auto">
        {hasTransition ? (
          <>
            <span className={koColor(c.currentKoN, c.currentKoChance)}>
              {koLabel(c.currentKoN, c.currentKoChance)}
            </span>
            <span className="text-gray-500 mx-0.5">→</span>
            <span className={koColor(c.worsenedKoN, c.worsenedKoChance)}>
              {koLabel(c.worsenedKoN, c.worsenedKoChance)}
            </span>
          </>
        ) : (
          <span className={koColor(c.currentKoN, c.currentKoChance)}>
            {koLabel(c.currentKoN, c.currentKoChance)}
          </span>
        )}
      </span>

      <span className="text-[10px] text-gray-600 shrink-0 w-10 text-right">
        {c.attackerUsagePct.toFixed(1)}%
      </span>
    </div>
  );
}

/** Row for an upgrader (SP increase improves survival) */
function UpgraderRow(
  { u, isFirst, lang }: { u: DefensiveUpgrader; isFirst: boolean; lang: Lang },
) {
  const rowBg = u.spNeeded <= 2
    ? "bg-green-900/15"
    : u.spNeeded <= 4
      ? "bg-blue-900/10"
      : "";

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 ${rowBg}`}>
      <span className={`w-14 shrink-0 font-mono text-right text-[11px] ${
        u.spNeeded <= 2
          ? "text-green-400 font-bold"
          : u.spNeeded <= 4
            ? "text-blue-400"
            : "text-gray-400"
      }`}>
        +{u.spNeeded}
      </span>

      <span className={`shrink-0 truncate max-w-[7rem] ${
        isFirst ? "font-medium text-gray-200" : "text-gray-300"
      }`}>
        {localizePokemon(u.attackerName, lang)}
      </span>

      <span className={`text-[10px] shrink-0 font-mono ${
        u.attackerNatMod >= 1.1 ? "text-orange-400"
        : u.attackerOffensiveSP >= 16 ? "text-sky-400"
        : "text-gray-300"
      }`}>
        {formatOffInvestment(u, lang)}
      </span>

      <span className="text-[10px] text-gray-400 truncate min-w-0">
        {localizeMove(u.moveName, lang)}
        <span className="text-gray-600 ml-0.5">
          ({u.category === "Physical"
            ? (lang === "ja" ? "物" : "P")
            : (lang === "ja" ? "特" : "S")})
        </span>
      </span>

      <span className={`text-[10px] shrink-0 w-6 text-center ${
        u.speedComparison === "faster" ? "text-red-400"
        : u.speedComparison === "slower" ? "text-green-400"
        : "text-gray-500"
      }`}>
        {u.speedComparison === "faster"
          ? (lang === "ja" ? "先" : "1")
          : u.speedComparison === "slower"
            ? (lang === "ja" ? "後" : "2")
            : "="}
      </span>

      <span className="shrink-0 font-mono text-xs ml-auto">
        <span className={koColor(u.currentKoN, u.currentKoChance)}>
          {koLabel(u.currentKoN, u.currentKoChance)}
        </span>
        <span className="text-gray-500 mx-0.5">→</span>
        <span className={koColor(u.improvedKoN, u.improvedKoChance)}>
          {koLabel(u.improvedKoN, u.improvedKoChance)}
        </span>
      </span>

      <span className="text-[10px] text-gray-600 shrink-0 w-10 text-right">
        {u.attackerUsagePct.toFixed(1)}%
      </span>
    </div>
  );
}
