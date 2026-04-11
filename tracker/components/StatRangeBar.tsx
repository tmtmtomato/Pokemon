import type { SPDensity, SPTier } from '../engine/inference-types';
import { useLang } from '../../app/lib/LangContext';

interface Props {
  label: string;
  density: SPDensity;   // 8 bins, each 0.0-1.0
  tier: SPTier;
  min: number;
  max: number;
}

const TIER_LABEL: Record<SPTier, { ja: string; en: string; color: string }> = {
  heavy:    { ja: '厚い', en: 'Heavy', color: 'text-orange-400' },
  moderate: { ja: '中振り', en: 'Mid', color: 'text-yellow-400' },
  light:    { ja: '薄め', en: 'Light', color: 'text-blue-300' },
  none:     { ja: '無振り', en: 'None', color: 'text-gray-400' },
  unknown:  { ja: '—', en: '—', color: 'text-gray-600' },
};

/** Density heat bar: 8 bins, higher density = brighter color */
export default function StatRangeBar({ label, density, tier, min, max }: Props) {
  const { lang } = useLang();
  const maxDensity = Math.max(...density, 0.01); // avoid div-by-0
  const hasData = density.some(d => d > 0);
  const tierInfo = TIER_LABEL[tier];

  return (
    <div className={`flex items-center gap-1.5 ${!hasData ? 'opacity-30' : ''}`}>
      {/* Stat label */}
      <div className="text-[10px] text-gray-500 w-5 text-right shrink-0">{label}</div>

      {/* Density heat bar */}
      <div className="flex-1 flex h-4 gap-px">
        {density.map((d, i) => {
          const intensity = d / maxDensity;
          const alpha = hasData ? Math.max(0.08, intensity * 0.9) : 0.05;
          // Color: green for high-SP bins, blue for mid, gray for low
          let hue: string;
          if (i >= 6) hue = `rgba(251, 146, 60, ${alpha})`; // orange for 24-32
          else if (i >= 4) hue = `rgba(250, 204, 21, ${alpha})`; // yellow for 16-23
          else if (i >= 2) hue = `rgba(96, 165, 250, ${alpha})`; // blue for 8-15
          else hue = `rgba(156, 163, 175, ${alpha})`; // gray for 0-7

          return (
            <div
              key={i}
              className="flex-1 rounded-sm relative"
              style={{ backgroundColor: hue }}
              title={hasData ? `SP ${i * 4}–${i === 7 ? 32 : i * 4 + 3}: ${Math.round(d * 100)}%` : ''}
            />
          );
        })}
      </div>

      {/* Tier label */}
      <div className={`text-[10px] w-10 text-right shrink-0 font-semibold ${tierInfo.color}`}>
        {lang === 'ja' ? tierInfo.ja : tierInfo.en}
      </div>

      {/* SP range */}
      <div className="text-[9px] text-gray-500 w-10 text-right shrink-0 font-mono">
        {!hasData ? '—' : min === max ? String(min) : `${min}-${max}`}
      </div>
    </div>
  );
}
