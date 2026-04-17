import type { Lang } from "../../viewer/i18n";
import { localizePokemon } from "../../viewer/i18n";
import type { PoolMember } from "../../types/team-matchup";
import type { SpeedTierEntry, ScarfSpeedInfo } from "../spAnalysisCalc";
import { computeActualSpeed } from "../spAnalysisCalc";

interface Props {
  entries: SpeedTierEntry[];
  member: PoolMember;
  lang: Lang;
  scarfInfo: ScarfSpeedInfo;
}

export function SpeedTierTable({ entries, member, lang, scarfInfo }: Props) {
  const mySpeed = computeActualSpeed(member);

  if (entries.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-2">
        {lang === "ja" ? "速度データなし" : "No speed data available"}
      </div>
    );
  }

  // Find insertion points for markers
  const markerIndex = entries.findIndex((e) => e.speed < mySpeed);
  const scarfMarkerIndex = entries.findIndex((e) => e.speed < scarfInfo.scarfSpeed);
  const currentSP = member.sp.spe;

  return (
    <div className="text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 text-[10px] text-gray-500 px-2 py-1 border-b border-gray-700">
        <span className="w-10 text-right">
          {lang === "ja" ? "実数値" : "Speed"}
        </span>
        <span className="flex-1">
          {lang === "ja" ? "ポケモン" : "Pokemon"}
        </span>
        <span className="w-12 text-right">
          {lang === "ja" ? "使用率" : "Usage"}
        </span>
        <span className="w-28 text-right">
          {lang === "ja" ? "S調整" : "SP Adjust"}
        </span>
        <span className="w-16 text-right">
          {lang === "ja" ? "対面逆転" : "Flips"}
        </span>
      </div>

      <div className="grid gap-0.5 mt-1">
        {entries.map((e, i) => {
          // Row styling: scarf tiers get purple, normal tiers green/blue/gray
          const rowStyle = e.isScarf
            ? (e.inAdjustableRange
              ? (e.currentlyOutspeeds
                ? "bg-purple-500/20 border border-purple-400/40"
                : "bg-purple-500/10 border border-purple-400/30")
              : "bg-gray-900/10 opacity-25")
            : e.inAdjustableRange
              ? (e.currentlyOutspeeds
                ? "bg-green-500/20 border border-green-400/40"
                : "bg-sky-500/20 border border-sky-400/40")
              : "bg-gray-900/10 opacity-25";

          // Separator at adjustable range boundary
          const prev = i > 0 ? entries[i - 1] : null;
          const showSeparator = prev !== null
            && prev.inAdjustableRange !== e.inAdjustableRange;

          return (
            <div key={e.speed}>
              {showSeparator && (
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 border-t border-dashed border-gray-500" />
                  <span className="text-[9px] text-gray-500 shrink-0">
                    {e.inAdjustableRange
                      ? (lang === "ja" ? "▼ S調整圏内" : "▼ Adjustable")
                      : (lang === "ja" ? "▼ S調整圏外" : "▼ Out of range")}
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-500" />
                </div>
              )}
              {i === scarfMarkerIndex && scarfMarkerIndex !== markerIndex && (
                <ScarfMarker speed={scarfInfo.scarfSpeed} currentSP={currentSP} name={member.name} lang={lang} />
              )}
              {i === markerIndex && (
                <>
                  {scarfMarkerIndex === markerIndex && (
                    <ScarfMarker speed={scarfInfo.scarfSpeed} currentSP={currentSP} name={member.name} lang={lang} />
                  )}
                  <SpeedMarker speed={mySpeed} currentSP={currentSP} name={member.name} lang={lang} />
                </>
              )}
              <div className={`flex items-center gap-2 rounded px-2 py-1 ${rowStyle}`}>
                {/* Speed value */}
                <span className={`w-10 text-right font-mono ${e.isScarf ? "text-purple-400" : "text-gray-400"}`}>
                  {e.speed}
                </span>

                {/* Pokemon names with speed tags */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-x-1.5 gap-y-0">
                    {e.pokemon.map((p, pi) => (
                      <span key={`${p.name}-${pi}`} className="whitespace-nowrap">
                        {p.tag && (
                          <span className={
                            p.tag === "拘" ? "text-purple-400"
                            : p.tag === "最" ? "text-red-400"
                            : p.tag === "準" ? "text-orange-400"
                            : "text-gray-500"
                          }>
                            {p.tag}
                          </span>
                        )}
                        {localizePokemon(p.name, lang)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Usage sum */}
                <span className="w-12 text-right text-gray-500 shrink-0">
                  {e.usagePctSum.toFixed(1)}%
                </span>

                {/* SP adjustment info */}
                <span className={`w-28 text-right shrink-0 font-mono ${
                  e.currentlyOutspeeds
                    ? (e.spReductionMargin >= 3
                      ? "text-green-500"
                      : e.spReductionMargin >= 1
                        ? "text-yellow-400"
                        : "text-orange-400")
                    : e.reachable
                      ? "text-blue-400"
                      : "text-gray-600"
                }`}>
                  {e.currentlyOutspeeds
                    ? (e.spReductionMargin === 0
                      ? (lang === "ja" ? "余裕なし（ギリ抜き）" : "No margin")
                      : (lang === "ja"
                        ? `S${e.totalSPNeeded}まで抜き(-${e.spReductionMargin})`
                        : `S${e.totalSPNeeded} ok (-${e.spReductionMargin})`))
                    : e.totalSPNeeded <= 32
                      ? (e.additionalSPNeeded === 0
                        ? (lang === "ja" ? "同速" : "Tie")
                        : `+${e.additionalSPNeeded} → S${e.totalSPNeeded}`)
                      : (lang === "ja" ? "届かない" : "Can't")}
                </span>

                {/* Matchup flips */}
                <span className={`w-16 text-right shrink-0 ${
                  !e.currentlyOutspeeds && e.matchupFlips > 0
                    ? "text-yellow-400"
                    : "text-transparent"
                }`}>
                  {!e.currentlyOutspeeds && e.matchupFlips > 0
                    ? (lang === "ja"
                      ? `${e.matchupFlips}件逆転`
                      : `${e.matchupFlips} flip`)
                    : "—"}
                </span>
              </div>
            </div>
          );
        })}
        {/* Bottom markers if they come after all entries */}
        {scarfMarkerIndex === -1 && markerIndex !== -1 && (
          <ScarfMarker speed={scarfInfo.scarfSpeed} currentSP={currentSP} name={member.name} lang={lang} />
        )}
        {markerIndex === -1 && (
          <>
            <ScarfMarker speed={scarfInfo.scarfSpeed} currentSP={currentSP} name={member.name} lang={lang} />
            <SpeedMarker speed={mySpeed} currentSP={currentSP} name={member.name} lang={lang} />
          </>
        )}
      </div>
    </div>
  );
}

function SpeedMarker(
  { speed, currentSP, name, lang }: { speed: number; currentSP: number; name: string; lang: Lang },
) {
  return (
    <div className="flex items-center gap-2 rounded bg-yellow-900/30 border border-yellow-700/50 px-2 py-1.5 my-0.5">
      <span className="w-10 text-right font-mono text-yellow-400 font-bold">
        {speed}
      </span>
      <span className="text-yellow-400 font-semibold text-xs">
        {localizePokemon(name, lang)}
        <span className="ml-1 text-yellow-500/70">
          {lang === "ja" ? `（現在 S${currentSP}）` : ` (S${currentSP})`}
        </span>
      </span>
    </div>
  );
}

function ScarfMarker(
  { speed, currentSP, name, lang }: { speed: number; currentSP: number; name: string; lang: Lang },
) {
  return (
    <div className="flex items-center gap-2 rounded bg-purple-900/30 border border-purple-700/50 px-2 py-1.5 my-0.5">
      <span className="w-10 text-right font-mono text-purple-400 font-bold">
        {speed}
      </span>
      <span className="text-purple-400 font-semibold text-xs">
        <span className="text-purple-300">拘</span>
        {localizePokemon(name, lang)}
        <span className="ml-1 text-purple-500/70">
          {lang === "ja" ? `（スカーフ S${currentSP}）` : ` (Scarf S${currentSP})`}
        </span>
      </span>
    </div>
  );
}
