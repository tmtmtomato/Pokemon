import type { StatID } from '../../src/types.js';
import { BOOST_STAT_IDS } from '../lib/constants';
import { STAT_JA, STAT_EN } from '../lib/ja';
import { useLang } from '../lib/LangContext';

interface BoostControlProps {
  boosts: Record<StatID, number>;
  onChangeBoost: (stat: StatID, value: number) => void;
}

export default function BoostControl({ boosts, onChangeBoost }: BoostControlProps) {
  const { lang } = useLang();
  const hasAny = BOOST_STAT_IDS.some(s => boosts[s] !== 0);
  if (!hasAny && false) return null; // always show for now
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {BOOST_STAT_IDS.map(stat => (
        <div key={stat} className="flex items-center gap-1 text-xs">
          <span className="text-gray-400 w-7">{statMap[stat]}</span>
          <button
            className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            onClick={() => onChangeBoost(stat, Math.max(-6, boosts[stat] - 1))}
          >−</button>
          <button
            className={`w-6 h-6 rounded text-xs font-mono ${
              boosts[stat] > 0 ? 'text-red-400' : boosts[stat] < 0 ? 'text-blue-400' : 'text-gray-500'
            }`}
            onClick={() => onChangeBoost(stat, 0)}
            title="Reset"
          >
            {boosts[stat] > 0 ? `+${boosts[stat]}` : boosts[stat]}
          </button>
          <button
            className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            onClick={() => onChangeBoost(stat, Math.min(6, boosts[stat] + 1))}
          >+</button>
        </div>
      ))}
    </div>
  );
}
