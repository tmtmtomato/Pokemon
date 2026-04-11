import type { OpponentPokemonSlot } from '../hooks/useTracker';
import type { SlotInference } from '../engine/inference-types';
import { getSpecies } from '../../src/data/index.js';
import { POKEMON_JA, ABILITY_JA, ITEM_JA, NATURE_JA, TYPE_JA, STAT_JA, STAT_EN, t } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';
import { pokemonFront } from '../../app/lib/sprites';
import { TYPE_COLORS } from '../../app/lib/constants';
import StatRangeBar from './StatRangeBar';

interface Props {
  slot: OpponentPokemonSlot;
  inference: SlotInference | undefined;
}

/** How narrowed-down the opponent's build is, based on search space elimination ratio */
function getNarrowLevel(narrowingRatio: number, uniqueBuilds: number): { color: string; barColor: string; ja: string; en: string; hintJa: string; hintEn: string; pct: number } {
  const eliminated = 1 - narrowingRatio; // fraction eliminated (0.0 to 1.0)
  if (uniqueBuilds <= 3)   return { color: 'text-green-400', barColor: 'bg-green-500', ja: 'ほぼ特定', en: 'Near certain', hintJa: '型がほぼ特定できました', hintEn: 'Build is almost identified', pct: 95 };
  if (uniqueBuilds <= 10)  return { color: 'text-green-300', barColor: 'bg-green-500', ja: 'かなり絞込済', en: 'Well narrowed', hintJa: '候補がかなり絞れています', hintEn: 'Narrowed down significantly', pct: 85 };
  if (eliminated >= 0.90)  return { color: 'text-green-300', barColor: 'bg-green-500', ja: 'かなり絞込済', en: 'Well narrowed', hintJa: `${(eliminated * 100).toFixed(0)}%の候補を排除`, hintEn: `${(eliminated * 100).toFixed(0)}% of builds eliminated`, pct: 75 };
  if (eliminated >= 0.70)  return { color: 'text-yellow-400', barColor: 'bg-yellow-500', ja: 'ある程度絞込', en: 'Partially narrowed', hintJa: `${(eliminated * 100).toFixed(0)}%の候補を排除`, hintEn: `${(eliminated * 100).toFixed(0)}% eliminated`, pct: 50 };
  if (eliminated >= 0.30)  return { color: 'text-orange-400', barColor: 'bg-orange-500', ja: '絞込中', en: 'Narrowing...', hintJa: 'もう少しダメージデータが必要です', hintEn: 'More damage data needed', pct: 25 };
  return { color: 'text-red-400', barColor: 'bg-red-500', ja: '絞込不足', en: 'Not yet narrowed', hintJa: 'ターンを重ねると絞り込めます', hintEn: 'Record more turns to narrow down', pct: 8 };
}

export default function OpponentCard({ slot, inference }: Props) {
  const { lang } = useLang();
  const speciesData = slot.species ? getSpecies(slot.species) : null;
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;

  if (!speciesData) return null;

  const hasInference = inference && inference.candidateCount > 0;
  const narrow = hasInference ? getNarrowLevel(inference.narrowingRatio, inference.uniqueBuildCount) : null;

  // Top candidate (most roll matches)
  const topCandidate = hasInference && inference.topCandidates.length > 0
    ? inference.topCandidates[0]
    : null;

  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <img
          src={pokemonFront(speciesData.id)}
          alt={slot.species}
          className="w-8 h-8 object-contain"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="flex-1">
          <div className="text-sm font-semibold">{t(slot.species, POKEMON_JA, lang)}</div>
          <div className="flex gap-1">
            {speciesData.types.map(tp => (
              <span
                key={tp}
                className="px-1 py-0 rounded text-[9px] font-semibold text-white"
                style={{ backgroundColor: TYPE_COLORS[tp] }}
              >
                {t(tp, TYPE_JA, lang)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Known info */}
      <div className="flex flex-wrap gap-1 mb-2">
        {slot.knownAbility && (
          <span className="px-1.5 py-0.5 rounded bg-purple-900/50 text-[10px] text-purple-300">
            {t(slot.knownAbility, ABILITY_JA, lang)}
          </span>
        )}
        {slot.knownItem && (
          <span className="px-1.5 py-0.5 rounded bg-yellow-900/50 text-[10px] text-yellow-300">
            {t(slot.knownItem, ITEM_JA, lang)}
          </span>
        )}
        {slot.knownTeraType && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
            style={{ backgroundColor: TYPE_COLORS[slot.knownTeraType] ?? '#44AABB' }}
          >
            Tera {t(slot.knownTeraType, TYPE_JA, lang)}
          </span>
        )}
      </div>

      {/* Narrowing status bar */}
      {hasInference && narrow && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-gray-400">
              {lang === 'ja' ? '型の絞り込み' : 'Build Narrowing'}
            </div>
            <div className={`text-[10px] font-semibold ${narrow.color}`}>
              {lang === 'ja' ? narrow.ja : narrow.en}
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${narrow.barColor}`}
              style={{ width: `${narrow.pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[9px] text-gray-500">
              {lang === 'ja' ? narrow.hintJa : narrow.hintEn}
            </div>
            <div className="text-[9px] text-gray-500">
              {lang === 'ja'
                ? `残り${inference.uniqueBuildCount.toLocaleString()}通り`
                : `${inference.uniqueBuildCount.toLocaleString()} remaining`}
            </div>
          </div>
        </div>
      )}

      {/* Inferred info */}
      {hasInference && (
        <div className="space-y-1.5">
          {/* Top candidate summary */}
          {topCandidate && (
            <div className="bg-gray-800/50 rounded p-1.5 border border-gray-700/50">
              <div className="text-[9px] text-gray-500 mb-0.5">
                {lang === 'ja' ? '最有力候補' : 'Most likely build'}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="text-gray-300">{t(topCandidate.nature, NATURE_JA, lang)}</span>
                {topCandidate.item && (
                  <span className="text-yellow-300">{t(topCandidate.item, ITEM_JA, lang)}</span>
                )}
                <span className="text-purple-300">{t(topCandidate.ability, ABILITY_JA, lang)}</span>
                {/* SP values */}
                {Object.entries(topCandidate.sp).filter(([, v]) => v !== undefined).map(([stat, v]) => (
                  <span key={stat} className="text-gray-400 font-mono">
                    {statMap[stat as keyof typeof statMap]}:{v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Inferred natures — always show count, list if ≤ 8 */}
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[10px] text-gray-500">{lang === 'ja' ? '性格:' : 'Nature:'}</span>
            {inference.natures.size <= 8 ? (
              [...inference.natures].map(n => (
                <span key={n} className="text-[10px] text-gray-300">{t(n, NATURE_JA, lang)}</span>
              ))
            ) : (
              <span className="text-[10px] text-gray-400">{inference.natures.size}{lang === 'ja' ? '通り' : ' options'}</span>
            )}
          </div>

          {/* Inferred items */}
          {!slot.knownItem && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] text-gray-500">{lang === 'ja' ? '持物:' : 'Item:'}</span>
              {inference.items.size <= 8 ? (
                [...inference.items].map(i => (
                  <span key={i || '_none'} className="text-[10px] text-gray-300">
                    {i ? t(i, ITEM_JA, lang) : (lang === 'ja' ? 'なし/他' : 'None/Other')}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-gray-400">{inference.items.size}{lang === 'ja' ? '通り' : ' options'}</span>
              )}
            </div>
          )}

          {/* Inferred abilities */}
          {!slot.knownAbility && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] text-gray-500">{lang === 'ja' ? '特性:' : 'Ability:'}</span>
              {[...inference.abilities].map(a => (
                <span key={a} className="text-[10px] text-gray-300">{t(a, ABILITY_JA, lang)}</span>
              ))}
            </div>
          )}

          {/* SP density bars — show all 6 stats with heat map */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[9px] text-gray-500">
                {lang === 'ja' ? 'SP配分の傾向' : 'SP allocation trend'}
              </div>
              <div className="flex gap-2 text-[8px] text-gray-600">
                <span>{lang === 'ja' ? '← 無振り' : '← None'}</span>
                <span>{lang === 'ja' ? '極振り →' : 'Heavy →'}</span>
              </div>
            </div>
            {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map(stat => {
              const [min, max] = inference.spRange[stat];
              return (
                <StatRangeBar
                  key={stat}
                  label={statMap[stat]}
                  density={inference.spDensity[stat]}
                  tier={inference.spTier[stat]}
                  min={min}
                  max={max}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* No inference yet */}
      {!hasInference && (
        <div className="text-[10px] text-gray-600 text-center py-2">
          {lang === 'ja'
            ? 'ダメージを記録すると、相手の型(性格・SP配分・持ち物)を推定します'
            : 'Record damage to infer opponent build (nature, SP, item)'}
        </div>
      )}
    </div>
  );
}
