import { useState } from 'react';
import type { TurnEntry, MyPokemonSlot, OpponentPokemonSlot } from '../hooks/useTracker';
import { getSpecies, getMove } from '../../src/data/index.js';
import { POKEMON_JA, MOVE_JA, WEATHER_JA, TERRAIN_JA, t } from '../../app/lib/ja';
import { STAT_JA, STAT_EN } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';
import { pokemonFront } from '../../app/lib/sprites';
import { TYPE_COLORS } from '../../app/lib/constants';

interface Props {
  turn: TurnEntry;
  myTeam: MyPokemonSlot[];
  opponentTeam: OpponentPokemonSlot[];
  onDelete: () => void;
}

export default function TurnCard({ turn, myTeam, opponentTeam, onDelete }: Props) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;

  const attackerSlot = turn.attackerSide === 'mine' ? myTeam[turn.attackerSlot] : opponentTeam[turn.attackerSlot];
  const defenderSlot = turn.attackerSide === 'mine' ? opponentTeam[turn.defenderSlot] : myTeam[turn.defenderSlot];

  const attackerName = attackerSlot?.species ?? '???';
  const defenderName = defenderSlot?.species ?? '???';
  const attackerData = attackerName !== '???' ? getSpecies(attackerName) : null;

  const moveData = turn.moveName ? getMove(turn.moveName) : null;

  // Check if there are any non-trivial field/boost details
  const hasBoosts = Object.values(turn.attackerBoosts).some(v => v && v !== 0)
    || Object.values(turn.defenderBoosts).some(v => v && v !== 0);
  const hasFieldEffects = turn.field.weather || turn.field.terrain
    || Object.values(turn.field.attackerSide).some(v => v)
    || Object.values(turn.field.defenderSide).some(v => v)
    || turn.field.isGravity || turn.field.isFairyAura || turn.field.isDarkAura
    || turn.field.isAuraBreak || turn.field.isBeadsOfRuin || turn.field.isTabletsOfRuin
    || turn.field.isSwordOfRuin || turn.field.isVesselOfRuin;
  const hasDetails = hasBoosts || hasFieldEffects;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800">
      {/* Main row (clickable to expand) */}
      <div
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-800/50 transition rounded-lg"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Turn number */}
        <div className="text-[10px] text-gray-600 font-mono w-5 text-center shrink-0">
          {turn.turnNumber}
        </div>

        {/* Attacker sprite */}
        {attackerData && (
          <img
            src={pokemonFront(attackerData.id)}
            alt={attackerName}
            className="w-7 h-7 object-contain shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* Arrow + move */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs">
            <span className={turn.attackerSide === 'mine' ? 'text-blue-400' : 'text-red-400'}>
              {t(attackerName, POKEMON_JA, lang)}
            </span>
            <span className="text-gray-600">→</span>
            <span className={turn.attackerSide === 'mine' ? 'text-red-400' : 'text-blue-400'}>
              {t(defenderName, POKEMON_JA, lang)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            {moveData && (
              <span
                className="px-1 py-0 rounded text-[9px] font-semibold text-white"
                style={{ backgroundColor: TYPE_COLORS[moveData.type] }}
              >
                {t(turn.moveName, MOVE_JA, lang)}
              </span>
            )}
            {moveData && (
              <span className={`text-[9px] ${moveData.category === 'Physical' ? 'text-orange-400' : 'text-blue-400'}`}>
                {moveData.category === 'Physical' ? (lang === 'ja' ? '物理' : 'Phy') : (lang === 'ja' ? '特殊' : 'Spe')}
              </span>
            )}
            {turn.isCrit && <span className="text-[9px] text-yellow-500 font-semibold">{lang === 'ja' ? '急所' : 'Crit'}</span>}
            {turn.isSpread && <span className="text-[9px] text-orange-500 font-semibold">{lang === 'ja' ? '全体' : 'Spread'}</span>}
          </div>
        </div>

        {/* Damage % */}
        <div className="text-sm font-bold text-white shrink-0">
          {turn.observedDamagePercent}%
        </div>

        {/* Expand indicator */}
        {hasDetails && (
          <span className="text-[9px] text-gray-600 shrink-0">
            {expanded ? '▲' : '▼'}
          </span>
        )}

        {/* Delete */}
        <button
          className="text-gray-600 hover:text-red-400 text-xs shrink-0"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label={lang === 'ja' ? 'このターンを削除' : 'Delete this turn'}
        >
          ✕
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-2 pb-2 pt-0 border-t border-gray-800 space-y-1">
          {/* Field conditions */}
          {hasFieldEffects && (
            <div className="flex flex-wrap gap-1">
              {turn.field.weather && (
                <span className="px-1 py-0 rounded bg-cyan-900/50 text-[9px] text-cyan-300">
                  {lang === 'ja' && WEATHER_JA[turn.field.weather] ? WEATHER_JA[turn.field.weather] : turn.field.weather}
                </span>
              )}
              {turn.field.terrain && (
                <span className="px-1 py-0 rounded bg-green-900/50 text-[9px] text-green-300">
                  {lang === 'ja' && TERRAIN_JA[turn.field.terrain] ? TERRAIN_JA[turn.field.terrain] : turn.field.terrain}
                </span>
              )}
              {turn.field.attackerSide.isHelpingHand && <span className="px-1 py-0 rounded bg-blue-900/50 text-[9px] text-blue-300">{lang === 'ja' ? 'てだすけ' : 'Help'}</span>}
              {turn.field.attackerSide.isBattery && <span className="px-1 py-0 rounded bg-blue-900/50 text-[9px] text-blue-300">{lang === 'ja' ? 'バッテリー' : 'Battery'}</span>}
              {turn.field.attackerSide.isPowerSpot && <span className="px-1 py-0 rounded bg-blue-900/50 text-[9px] text-blue-300">{lang === 'ja' ? 'Pスポット' : 'PSpot'}</span>}
              {turn.field.defenderSide.isReflect && <span className="px-1 py-0 rounded bg-orange-900/50 text-[9px] text-orange-300">{lang === 'ja' ? 'リフレ' : 'Reflect'}</span>}
              {turn.field.defenderSide.isLightScreen && <span className="px-1 py-0 rounded bg-orange-900/50 text-[9px] text-orange-300">{lang === 'ja' ? 'ひかかべ' : 'LScreen'}</span>}
              {turn.field.defenderSide.isAuroraVeil && <span className="px-1 py-0 rounded bg-orange-900/50 text-[9px] text-orange-300">{lang === 'ja' ? 'オーロラ' : 'AVeil'}</span>}
              {turn.field.isGravity && <span className="px-1 py-0 rounded bg-purple-900/50 text-[9px] text-purple-300">{lang === 'ja' ? '重力' : 'Gravity'}</span>}
              {turn.field.attackerSide.isSteelySpirit && <span className="px-1 py-0 rounded bg-gray-600/50 text-[9px] text-gray-200">{lang === 'ja' ? 'はがねのせいしん' : 'SteelySpirit'}</span>}
              {turn.field.attackerSide.isFlowerGift && <span className="px-1 py-0 rounded bg-yellow-900/50 text-[9px] text-yellow-300">{lang === 'ja' ? 'フラワーギフト' : 'FlowerGift'}</span>}
              {turn.field.defenderSide.isFriendGuard && <span className="px-1 py-0 rounded bg-pink-900/50 text-[9px] text-pink-200">{lang === 'ja' ? 'フレンドガード' : 'FriendGuard'}</span>}
              {turn.field.isFairyAura && <span className="px-1 py-0 rounded bg-pink-900/50 text-[9px] text-pink-300">{lang === 'ja' ? 'フェアリーオーラ' : 'FairyAura'}</span>}
              {turn.field.isDarkAura && <span className="px-1 py-0 rounded bg-gray-700/50 text-[9px] text-gray-300">{lang === 'ja' ? 'ダークオーラ' : 'DarkAura'}</span>}
              {turn.field.isAuraBreak && <span className="px-1 py-0 rounded bg-red-900/50 text-[9px] text-red-300">{lang === 'ja' ? 'オーラブレイク' : 'AuraBreak'}</span>}
              {turn.field.isBeadsOfRuin && <span className="px-1 py-0 rounded bg-purple-900/50 text-[9px] text-purple-300">{lang === 'ja' ? 'わざわいのたま' : 'Beads'}</span>}
              {turn.field.isTabletsOfRuin && <span className="px-1 py-0 rounded bg-purple-900/50 text-[9px] text-purple-300">{lang === 'ja' ? 'わざわいのおふだ' : 'Tablets'}</span>}
              {turn.field.isSwordOfRuin && <span className="px-1 py-0 rounded bg-purple-900/50 text-[9px] text-purple-300">{lang === 'ja' ? 'わざわいのつるぎ' : 'Sword'}</span>}
              {turn.field.isVesselOfRuin && <span className="px-1 py-0 rounded bg-purple-900/50 text-[9px] text-purple-300">{lang === 'ja' ? 'わざわいのうつわ' : 'Vessel'}</span>}
            </div>
          )}

          {/* Boosts */}
          {hasBoosts && (
            <div className="flex gap-4 text-[9px]">
              {Object.entries(turn.attackerBoosts).some(([, v]) => v && v !== 0) && (
                <div>
                  <span className="text-gray-500">{lang === 'ja' ? '攻撃側:' : 'Atk:'} </span>
                  {Object.entries(turn.attackerBoosts).filter(([, v]) => v && v !== 0).map(([stat, v]) => (
                    <span key={stat} className={v! > 0 ? 'text-green-400' : 'text-red-400'}>
                      {statMap[stat as keyof typeof statMap]} {v! > 0 ? `+${v}` : v}{' '}
                    </span>
                  ))}
                </div>
              )}
              {Object.entries(turn.defenderBoosts).some(([, v]) => v && v !== 0) && (
                <div>
                  <span className="text-gray-500">{lang === 'ja' ? '防御側:' : 'Def:'} </span>
                  {Object.entries(turn.defenderBoosts).filter(([, v]) => v && v !== 0).map(([stat, v]) => (
                    <span key={stat} className={v! > 0 ? 'text-green-400' : 'text-red-400'}>
                      {statMap[stat as keyof typeof statMap]} {v! > 0 ? `+${v}` : v}{' '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
