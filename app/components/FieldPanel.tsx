import type { FieldFormState, CalcAction } from '../hooks/useCalc';
import type { GameType, Weather, Terrain } from '../../src/types.js';
import { useState } from 'react';
import { WEATHERS, TERRAINS } from '../lib/constants';
import { WEATHER_JA, TERRAIN_JA, UI, t } from '../lib/ja';
import { useLang } from '../lib/LangContext';

interface FieldPanelProps {
  field: FieldFormState;
  dispatch: React.Dispatch<CalcAction>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`px-2 py-1 rounded text-xs transition ${
        value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
      }`}
      onClick={() => onChange(!value)}
    >
      {label}
    </button>
  );
}

export default function FieldPanel({ field, dispatch }: FieldPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const { lang } = useLang();

  return (
    <div className="border border-gray-800 rounded">
      <div className="flex items-center gap-2 p-2 flex-wrap">
        {/* バトル形式 */}
        <div className="flex rounded overflow-hidden border border-gray-700">
          {(['Singles', 'Doubles'] as const).map(gt => (
            <button
              key={gt}
              className={`px-3 py-1 text-xs ${
                field.gameType === gt ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
              }`}
              onClick={() => dispatch({ type: 'SET_GAME_TYPE', gameType: gt as GameType })}
            >
              {gt === 'Singles' ? UI.singles[lang] : UI.doubles[lang]}
            </button>
          ))}
        </div>

        {/* 天候 */}
        <select
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
          value={field.weather}
          onChange={e => dispatch({ type: 'SET_WEATHER', weather: e.target.value as Weather | '' })}
        >
          <option value="">{UI.weatherNone[lang]}</option>
          {WEATHERS.map(w => <option key={w} value={w}>{t(w, WEATHER_JA, lang)}</option>)}
        </select>

        {/* フィールド */}
        <select
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
          value={field.terrain}
          onChange={e => dispatch({ type: 'SET_TERRAIN', terrain: e.target.value as Terrain | '' })}
        >
          <option value="">{UI.terrainNone[lang]}</option>
          {TERRAINS.map(tr => <option key={tr} value={tr}>{t(tr, TERRAIN_JA, lang)}</option>)}
        </select>

        <button
          className="ml-auto text-xs text-gray-500 hover:text-gray-300"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? UI.close[lang] : UI.details[lang]}
        </button>
      </div>

      {expanded && (
        <div className="p-2 pt-0 space-y-2 border-t border-gray-800">
          {/* 攻撃側 */}
          <div>
            <span className="text-xs text-gray-500">{UI.atkSide[lang]}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              <Toggle label={UI.helpingHand[lang]} value={field.attackerSide.isHelpingHand}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isHelpingHand', value: v })} />
              <Toggle label={UI.reflect[lang]} value={field.attackerSide.isReflect}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isReflect', value: v })} />
              <Toggle label={UI.lightScreen[lang]} value={field.attackerSide.isLightScreen}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isLightScreen', value: v })} />
              <Toggle label={UI.auroraVeil[lang]} value={field.attackerSide.isAuroraVeil}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isAuroraVeil', value: v })} />
              <Toggle label={UI.battery[lang]} value={field.attackerSide.isBattery}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isBattery', value: v })} />
              <Toggle label={UI.powerSpot[lang]} value={field.attackerSide.isPowerSpot}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isPowerSpot', value: v })} />
              <Toggle label={UI.steelySpirit[lang]} value={field.attackerSide.isSteelySpirit}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isSteelySpirit', value: v })} />
              <Toggle label={UI.flowerGift[lang]} value={field.attackerSide.isFlowerGift}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'attacker', flag: 'isFlowerGift', value: v })} />
            </div>
          </div>

          {/* 防御側 */}
          <div>
            <span className="text-xs text-gray-500">{UI.defSide[lang]}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              <Toggle label={UI.reflect[lang]} value={field.defenderSide.isReflect}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'defender', flag: 'isReflect', value: v })} />
              <Toggle label={UI.lightScreen[lang]} value={field.defenderSide.isLightScreen}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'defender', flag: 'isLightScreen', value: v })} />
              <Toggle label={UI.auroraVeil[lang]} value={field.defenderSide.isAuroraVeil}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'defender', flag: 'isAuroraVeil', value: v })} />
              <Toggle label={UI.friendGuard[lang]} value={field.defenderSide.isFriendGuard}
                onChange={v => dispatch({ type: 'SET_SIDE_FLAG', side: 'defender', flag: 'isFriendGuard', value: v })} />
            </div>
          </div>

          {/* フィールド特性 */}
          <div>
            <span className="text-xs text-gray-500">{UI.fieldAbilities[lang]}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              <Toggle label={UI.fairyAura[lang]} value={field.isFairyAura}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isFairyAura', value: v })} />
              <Toggle label={UI.darkAura[lang]} value={field.isDarkAura}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isDarkAura', value: v })} />
              <Toggle label={UI.auraBreak[lang]} value={field.isAuraBreak}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isAuraBreak', value: v })} />
              <Toggle label={UI.beadsOfRuin[lang]} value={field.isBeadsOfRuin}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isBeadsOfRuin', value: v })} />
              <Toggle label={UI.tabletsOfRuin[lang]} value={field.isTabletsOfRuin}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isTabletsOfRuin', value: v })} />
              <Toggle label={UI.swordOfRuin[lang]} value={field.isSwordOfRuin}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isSwordOfRuin', value: v })} />
              <Toggle label={UI.vesselOfRuin[lang]} value={field.isVesselOfRuin}
                onChange={v => dispatch({ type: 'SET_FIELD_FLAG', flag: 'isVesselOfRuin', value: v })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
