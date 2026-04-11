import type { StatID, NatureName, StatsTable } from '../../src/types.js';
import { calcHP, calcStat, getNatureModifier, validateSP } from '../../src/index.js';
import { STAT_IDS, NATURE_TABLE } from '../lib/constants';
import { STAT_JA, STAT_EN, UI } from '../lib/ja';
import { useLang } from '../lib/LangContext';

interface SPInputProps {
  sp: Record<StatID, number>;
  nature: NatureName;
  baseStats: StatsTable;
  onChangeSP: (stat: StatID, value: number) => void;
}

export default function SPInput({ sp, nature, baseStats, onChangeSP }: SPInputProps) {
  const { lang } = useLang();
  const { valid, total } = validateSP(sp);
  const remaining = 66 - total;
  const natureInfo = NATURE_TABLE[nature];
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-gray-400">
        <span>SP</span>
        <span className={valid ? 'text-green-400' : 'text-red-400'}>
          {total}/66 ({lang === 'ja' ? '残り' : 'Left:'} {remaining})
        </span>
      </div>
      {STAT_IDS.map(stat => {
        const base = baseStats[stat];
        const natMod = getNatureModifier(nature, stat);
        const final = stat === 'hp'
          ? calcHP(base, sp[stat])
          : calcStat(base, sp[stat], natMod);
        const isPlus = natureInfo.plus === stat;
        const isMinus = natureInfo.minus === stat;

        return (
          <div key={stat} className="flex items-center gap-1 text-xs">
            <span className={`w-7 text-right font-mono ${isPlus ? 'text-red-400' : isMinus ? 'text-blue-400' : 'text-gray-300'}`}>
              {statMap[stat]}
            </span>
            <span className="w-6 text-right text-gray-500">{base}</span>
            <input
              type="range"
              min={0}
              max={32}
              value={sp[stat]}
              onChange={e => onChangeSP(stat, Number(e.target.value))}
              className="flex-1 h-1.5 accent-blue-500"
            />
            <span className="w-5 text-center font-mono text-gray-400">{sp[stat]}</span>
            <span className={`w-8 text-right font-mono font-semibold ${isPlus ? 'text-red-400' : isMinus ? 'text-blue-400' : ''}`}>
              {final}
            </span>
          </div>
        );
      })}
    </div>
  );
}
