import type { FieldSnapshot } from '../hooks/useTracker';
import type { Weather, Terrain } from '../../src/types.js';
import { WEATHERS, TERRAINS } from '../../app/lib/constants';
import { WEATHER_JA, TERRAIN_JA, UI } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';

interface Props {
  field: FieldSnapshot;
  onChange: (updates: Partial<FieldSnapshot>) => void;
}

// ─── Attacker-side toggles ───
type AtkSideKey = keyof FieldSnapshot['attackerSide'];
interface SideToggle<K extends string = string> {
  key: K;
  uiKey: keyof typeof UI;
  short: { ja: string; en: string };
}

const ATK_TOGGLES: SideToggle<AtkSideKey>[] = [
  { key: 'isHelpingHand',  uiKey: 'helpingHand',  short: { ja: 'てだすけ', en: 'Help' } },
  { key: 'isBattery',      uiKey: 'battery',      short: { ja: 'バッテリー', en: 'Batt' } },
  { key: 'isPowerSpot',    uiKey: 'powerSpot',    short: { ja: 'Pスポット', en: 'PSpot' } },
  { key: 'isSteelySpirit', uiKey: 'steelySpirit', short: { ja: 'はがね魂', en: 'Steel' } },
  { key: 'isFlowerGift',   uiKey: 'flowerGift',   short: { ja: 'フラワー', en: 'Flower' } },
  { key: 'isFriendGuard',  uiKey: 'friendGuard',  short: { ja: 'フレガ', en: 'FGuard' } },
];

// ─── Defender-side toggles ───
type DefSideKey = keyof FieldSnapshot['defenderSide'];
const DEF_TOGGLES: SideToggle<DefSideKey>[] = [
  { key: 'isReflect',      uiKey: 'reflect',      short: { ja: 'リフレ', en: 'Reflect' } },
  { key: 'isLightScreen',  uiKey: 'lightScreen',  short: { ja: 'ひかかべ', en: 'LScreen' } },
  { key: 'isAuroraVeil',   uiKey: 'auroraVeil',   short: { ja: 'オーロラ', en: 'AVeil' } },
  { key: 'isFriendGuard',  uiKey: 'friendGuard',  short: { ja: 'フレガ', en: 'FGuard' } },
];

// ─── Global field toggles ───
type GlobalKey = 'isGravity' | 'isFairyAura' | 'isDarkAura' | 'isAuraBreak'
  | 'isBeadsOfRuin' | 'isTabletsOfRuin' | 'isSwordOfRuin' | 'isVesselOfRuin';

interface GlobalToggle {
  key: GlobalKey;
  uiKey: keyof typeof UI;
  short: { ja: string; en: string };
  color: string;
}

const GLOBAL_TOGGLES: GlobalToggle[] = [
  { key: 'isGravity',       uiKey: 'gravity',       short: { ja: '重力', en: 'Grav' },    color: 'bg-purple-600' },
  { key: 'isFairyAura',     uiKey: 'fairyAura',     short: { ja: 'Fオーラ', en: 'FAura' }, color: 'bg-pink-600' },
  { key: 'isDarkAura',      uiKey: 'darkAura',      short: { ja: 'Dオーラ', en: 'DAura' }, color: 'bg-gray-600' },
  { key: 'isAuraBreak',     uiKey: 'auraBreak',     short: { ja: 'Aブレイク', en: 'ABrk' }, color: 'bg-yellow-700' },
  { key: 'isBeadsOfRuin',   uiKey: 'beadsOfRuin',   short: { ja: 'たま', en: 'Beads' },    color: 'bg-red-800' },
  { key: 'isTabletsOfRuin', uiKey: 'tabletsOfRuin', short: { ja: 'おふだ', en: 'Tabl' },   color: 'bg-red-800' },
  { key: 'isSwordOfRuin',   uiKey: 'swordOfRuin',   short: { ja: 'つるぎ', en: 'Sword' },  color: 'bg-red-800' },
  { key: 'isVesselOfRuin',  uiKey: 'vesselOfRuin',  short: { ja: 'うつわ', en: 'Vessel' }, color: 'bg-red-800' },
];

export default function FieldConditionBar({ field, onChange }: Props) {
  const { lang } = useLang();

  return (
    <div className="space-y-1.5">
      {/* Row 1: Weather + Terrain */}
      <div className="flex gap-2">
        <select
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
          value={field.weather}
          onChange={e => onChange({ weather: e.target.value as Weather | '' })}
        >
          <option value="">{UI.weatherNone[lang]}</option>
          {WEATHERS.map(w => (
            <option key={w} value={w}>{lang === 'ja' && WEATHER_JA[w] ? WEATHER_JA[w] : w}</option>
          ))}
        </select>
        <select
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
          value={field.terrain}
          onChange={e => onChange({ terrain: e.target.value as Terrain | '' })}
        >
          <option value="">{UI.terrainNone[lang]}</option>
          {TERRAINS.map(tr => (
            <option key={tr} value={tr}>{lang === 'ja' && TERRAIN_JA[tr] ? TERRAIN_JA[tr] : tr}</option>
          ))}
        </select>
      </div>

      {/* Row 2: Attacker-side supports (blue) */}
      <div>
        <div className="text-[9px] text-gray-600 mb-0.5">{UI.atkSide[lang]}</div>
        <div className="flex flex-wrap gap-1">
          {ATK_TOGGLES.map(tog => {
            const active = field.attackerSide[tog.key];
            return (
              <button
                key={tog.key}
                className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                  active ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
                title={UI[tog.uiKey][lang]}
                onClick={() => onChange({
                  attackerSide: { ...field.attackerSide, [tog.key]: !active },
                })}
              >
                {tog.short[lang]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: Defender-side screens (orange) */}
      <div>
        <div className="text-[9px] text-gray-600 mb-0.5">{UI.defSide[lang]}</div>
        <div className="flex flex-wrap gap-1">
          {DEF_TOGGLES.map(tog => {
            const active = field.defenderSide[tog.key];
            return (
              <button
                key={tog.key}
                className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                  active ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
                title={UI[tog.uiKey][lang]}
                onClick={() => onChange({
                  defenderSide: { ...field.defenderSide, [tog.key]: !active },
                })}
              >
                {tog.short[lang]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 4: Global field effects */}
      <div>
        <div className="text-[9px] text-gray-600 mb-0.5">{UI.fieldAbilities[lang]}</div>
        <div className="flex flex-wrap gap-1">
          {GLOBAL_TOGGLES.map(tog => {
            const active = field[tog.key];
            return (
              <button
                key={tog.key}
                className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                  active ? `${tog.color} text-white` : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
                title={UI[tog.uiKey][lang]}
                onClick={() => onChange({ [tog.key]: !active })}
              >
                {tog.short[lang]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
