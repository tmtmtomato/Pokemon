import { useLang } from '../../app/lib/LangContext';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function DamageInput({ value, onChange }: Props) {
  const { lang } = useLang();

  const adjust = (delta: number) => {
    const next = Math.max(0, Math.min(100, +(value + delta).toFixed(1)));
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1">
      <label className="text-[10px] text-gray-500 shrink-0">
        {lang === 'ja' ? 'ダメージ%' : 'Dmg%'}
      </label>
      <button
        className="w-6 h-6 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 text-xs font-bold"
        onClick={() => adjust(-1)}
        aria-label={lang === 'ja' ? 'ダメージ%を減らす' : 'Decrease damage %'}
      >
        -
      </button>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-center"
        value={value}
        onChange={e => {
          // L-8: Handle empty input (set to 0 when cleared)
          if (e.target.value === '' || e.target.value === '-') {
            onChange(0);
            return;
          }
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(0, Math.min(100, v)));
        }}
      />
      <button
        className="w-6 h-6 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 text-xs font-bold"
        onClick={() => adjust(1)}
        aria-label={lang === 'ja' ? 'ダメージ%を増やす' : 'Increase damage %'}
      >
        +
      </button>
      <span className="text-xs text-gray-500">%</span>
    </div>
  );
}
