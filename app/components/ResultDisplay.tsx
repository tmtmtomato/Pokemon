import { useState } from 'react';
import type { Result } from '../../src/index.js';
import { POKEMON_JA, MOVE_JA, koTextJa, koTextEn, effectivenessTextJa, effectivenessTextEn, UI, t } from '../lib/ja';
import { useLang } from '../lib/LangContext';
import HPBar from './HPBar';

interface ResultDisplayProps {
  result: Result | null;
}

export default function ResultDisplay({ result }: ResultDisplayProps) {
  const [showRolls, setShowRolls] = useState(false);
  const { lang } = useLang();

  if (!result) {
    return (
      <div className="text-center text-gray-600 py-4 text-sm">
        {UI.selectPrompt[lang]}
      </div>
    );
  }

  const [minDmg, maxDmg] = result.range();
  const [minPct, maxPct] = result.percentRange();
  const ko = result.koChance();

  const minRemaining = Math.max(0, 100 - maxPct);
  const maxRemaining = Math.max(0, 100 - minPct);

  const koColor = ko.n === 1
    ? (ko.chance >= 1 ? 'text-red-400' : 'text-orange-400')
    : ko.n === 2
      ? 'text-yellow-400'
      : 'text-green-400';

  const atkName = t(result.attackerName, POKEMON_JA, lang);
  const defName = t(result.defenderName, POKEMON_JA, lang);
  const moveName = t(result.moveName, MOVE_JA, lang);

  const koText = lang === 'ja' ? koTextJa(ko.chance, ko.n) : koTextEn(ko.chance, ko.n);
  const effText = lang === 'ja' ? effectivenessTextJa(result.typeEffectiveness) : effectivenessTextEn(result.typeEffectiveness);

  return (
    <div className="space-y-2 bg-gray-900 rounded-lg p-3">
      {/* 説明行 */}
      <p className="text-sm text-gray-300">
        {lang === 'ja'
          ? `${atkName} の ${moveName} → ${defName}`
          : `${atkName}'s ${moveName} vs ${defName}`}
      </p>

      {/* ダメージ数値 */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">
          {minDmg} - {maxDmg}
        </span>
        <span className="text-lg text-gray-400 tabular-nums">
          ({minPct.toFixed(1)}% - {maxPct.toFixed(1)}%)
        </span>
      </div>

      {/* KO確率 */}
      <p className={`text-sm font-semibold ${koColor}`}>
        {koText}
      </p>

      {/* HPバー */}
      <HPBar minRemaining={minRemaining} maxRemaining={maxRemaining} />

      {/* 相性 */}
      {effText && (
        <span className={`text-xs ${
          result.typeEffectiveness > 1 ? 'text-green-400' : 'text-red-400'
        }`}>
          {effText}
        </span>
      )}

      {/* 乱数ロール */}
      <button
        className="text-xs text-gray-500 hover:text-gray-300"
        onClick={() => setShowRolls(!showRolls)}
      >
        {showRolls ? UI.hideRolls[lang] : UI.showRolls[lang]}
      </button>
      {showRolls && (
        <div className="text-xs font-mono text-gray-400 flex flex-wrap gap-x-2">
          {result.rolls.map((r, i) => (
            <span key={i}>{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}
