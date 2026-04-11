import { useState } from 'react';
import type { TrackerAction, MyPokemonSlot, OpponentPokemonSlot, FieldSnapshot, TurnEntry as TurnEntryType } from '../hooks/useTracker';
import type { StatID } from '../../src/types.js';
import { getMove, getAllMoveNames } from '../../src/data/index.js';
import { POKEMON_JA, MOVE_JA, t } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';
import { BOOST_STAT_IDS } from '../../app/lib/constants';
import { STAT_JA, STAT_EN } from '../../app/lib/ja';
import { TYPE_COLORS } from '../../app/lib/constants';
import SearchSelect from '../../app/components/SearchSelect';
import DamageInput from './DamageInput';
import FieldConditionBar from './FieldConditionBar';

const allMoves = getAllMoveNames();

interface Props {
  myTeam: MyPokemonSlot[];
  opponentTeam: OpponentPokemonSlot[];
  currentField: FieldSnapshot;
  dispatch: React.Dispatch<TrackerAction>;
}

/** Compact ±boost spinner for a single stat */
function BoostSpinner({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-[9px] text-gray-500 w-5 text-right">{label}</span>
      <button
        className="w-4 h-4 rounded bg-gray-800 text-gray-500 hover:bg-gray-700 text-[10px] leading-none flex items-center justify-center"
        onClick={() => onChange(Math.max(-6, value - 1))}
      >-</button>
      <span className={`w-5 text-center text-[10px] font-mono ${
        value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-600'
      }`}>
        {value > 0 ? `+${value}` : value}
      </span>
      <button
        className="w-4 h-4 rounded bg-gray-800 text-gray-500 hover:bg-gray-700 text-[10px] leading-none flex items-center justify-center"
        onClick={() => onChange(Math.min(6, value + 1))}
      >+</button>
    </div>
  );
}

export default function TurnEntry({ myTeam, opponentTeam, currentField, dispatch }: Props) {
  const { lang } = useLang();
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;

  const [attackerSide, setAttackerSide] = useState<'mine' | 'opponent'>('mine');
  const [attackerSlot, setAttackerSlot] = useState(0);
  const [defenderSlot, setDefenderSlot] = useState(0);
  const [moveName, setMoveName] = useState('');
  const [damagePercent, setDamagePercent] = useState(0);
  const [isCrit, setIsCrit] = useState(false);
  const [isSpread, setIsSpread] = useState(false);
  const [atkBoosts, setAtkBoosts] = useState<Partial<Record<StatID, number>>>({});
  const [defBoosts, setDefBoosts] = useState<Partial<Record<StatID, number>>>({});
  const [showField, setShowField] = useState(false);
  const [showBoosts, setShowBoosts] = useState(false);

  const attackerTeam = attackerSide === 'mine' ? myTeam : opponentTeam;
  const defenderTeam = attackerSide === 'mine' ? opponentTeam : myTeam;

  // When attacking with my Pokemon, only show its learned moves
  const availableMoves = attackerSide === 'mine' && myTeam[attackerSlot]?.moves?.length
    ? myTeam[attackerSlot].moves.filter(m => m !== '')
    : allMoves;

  const moveData = moveName ? getMove(moveName) : null;

  const canSubmit = attackerTeam[attackerSlot]?.species && defenderTeam[defenderSlot]?.species && moveName && damagePercent > 0;

  const hasBoosts = Object.values(atkBoosts).some(v => v !== 0) || Object.values(defBoosts).some(v => v !== 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const turn: Omit<TurnEntryType, 'id' | 'turnNumber'> = {
      attackerSide,
      attackerSlot,
      defenderSlot,
      moveName,
      isCrit,
      isSpread,
      observedDamagePercent: damagePercent,
      field: currentField,
      attackerBoosts: atkBoosts,
      defenderBoosts: defBoosts,
      attackerStatus: '',
      defenderStatus: '',
    };
    dispatch({ type: 'ADD_TURN', turn });
    setMoveName('');
    setDamagePercent(0);
    setIsCrit(false);
    setIsSpread(false);
    setAtkBoosts({});
    setDefBoosts({});
  };

  const pokemonName = (slot: { species: string }) =>
    slot.species ? t(slot.species, POKEMON_JA, lang) : '---';

  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 space-y-2">
      <div className="text-xs font-semibold text-gray-400 mb-1">
        {lang === 'ja' ? 'ターン記録' : 'Record Turn'}
      </div>

      {/* Attacker side toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        {(['mine', 'opponent'] as const).map(side => (
          <button
            key={side}
            className={`flex-1 py-1.5 text-xs font-semibold transition ${
              attackerSide === side
                ? side === 'opponent' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-500'
            }`}
            onClick={() => {
              setAttackerSide(side);
              setMoveName('');
            }}
          >
            {side === 'opponent'
              ? (lang === 'ja' ? '相手→自分' : 'Opp → Me')
              : (lang === 'ja' ? '自分→相手' : 'Me → Opp')
            }
          </button>
        ))}
      </div>

      {/* Attacker + Defender selectors */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500">
            {attackerSide === 'opponent'
              ? (lang === 'ja' ? '相手 (攻撃)' : 'Opponent (Atk)')
              : (lang === 'ja' ? '自分 (攻撃)' : 'My (Atk)')
            }
          </label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
            value={attackerSlot}
            onChange={e => {
              setAttackerSlot(Number(e.target.value));
              setMoveName('');
            }}
          >
            {attackerTeam.map((slot, i) => (
              <option key={i} value={i} disabled={!slot.species}>
                {pokemonName(slot)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500">
            {attackerSide === 'opponent'
              ? (lang === 'ja' ? '自分 (防御)' : 'My (Def)')
              : (lang === 'ja' ? '相手 (防御)' : 'Opponent (Def)')
            }
          </label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
            value={defenderSlot}
            onChange={e => setDefenderSlot(Number(e.target.value))}
          >
            {defenderTeam.map((slot, i) => (
              <option key={i} value={i} disabled={!slot.species}>
                {pokemonName(slot)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Move + preview */}
      <div>
        <SearchSelect
          label={lang === 'ja' ? 'わざ' : 'Move'}
          options={availableMoves}
          value={moveName}
          onChange={setMoveName}
          displayMap={MOVE_JA}
        />
        {/* Move preview badge */}
        {moveData && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
              style={{ backgroundColor: TYPE_COLORS[moveData.type] }}
            >
              {moveData.type}
            </span>
            <span className={`text-[10px] ${moveData.category === 'Physical' ? 'text-orange-400' : 'text-blue-400'}`}>
              {moveData.category === 'Physical' ? (lang === 'ja' ? '物理' : 'Physical') : (lang === 'ja' ? '特殊' : 'Special')}
            </span>
            <span className="text-[10px] text-gray-400">
              {lang === 'ja' ? `威力${moveData.basePower}` : `BP ${moveData.basePower}`}
            </span>
          </div>
        )}
      </div>

      {/* Crit + Spread + Damage in one row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className={`px-2 py-1 rounded text-xs transition ${
            isCrit ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
          onClick={() => setIsCrit(!isCrit)}
        >
          {lang === 'ja' ? '急所' : 'Crit'}
        </button>
        <button
          className={`px-2 py-1 rounded text-xs transition ${
            isSpread ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
          onClick={() => setIsSpread(!isSpread)}
        >
          {lang === 'ja' ? '全体技' : 'Spread'}
        </button>
        <div className="flex-1" />
        <DamageInput value={damagePercent} onChange={setDamagePercent} />
      </div>

      {/* Collapsible: Field conditions */}
      <button
        className="text-[10px] text-gray-500 hover:text-gray-300 transition flex items-center gap-1"
        onClick={() => setShowField(!showField)}
      >
        <span>{showField ? '▲' : '▼'}</span>
        <span>{lang === 'ja' ? 'フィールド条件' : 'Field conditions'}</span>
        {(currentField.weather || currentField.terrain) && (
          <span className="text-blue-400 ml-1">●</span>
        )}
      </button>
      {showField && (
        <FieldConditionBar
          field={currentField}
          onChange={updates => dispatch({ type: 'SET_FIELD', updates })}
        />
      )}

      {/* Collapsible: Boosts */}
      <button
        className="text-[10px] text-gray-500 hover:text-gray-300 transition flex items-center gap-1"
        onClick={() => setShowBoosts(!showBoosts)}
      >
        <span>{showBoosts ? '▲' : '▼'}</span>
        <span>{lang === 'ja' ? 'ランク補正' : 'Boosts'}</span>
        {hasBoosts && <span className="text-green-400 ml-1">●</span>}
      </button>
      {showBoosts && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] text-gray-600 mb-1">
              {lang === 'ja' ? '攻撃側' : 'Attacker'}
            </div>
            <div className="space-y-0.5">
              {BOOST_STAT_IDS.map(stat => (
                <BoostSpinner
                  key={stat}
                  label={statMap[stat]}
                  value={atkBoosts[stat] ?? 0}
                  onChange={v => setAtkBoosts({ ...atkBoosts, [stat]: v })}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-600 mb-1">
              {lang === 'ja' ? '防御側' : 'Defender'}
            </div>
            <div className="space-y-0.5">
              {BOOST_STAT_IDS.map(stat => (
                <BoostSpinner
                  key={stat}
                  label={statMap[stat]}
                  value={defBoosts[stat] ?? 0}
                  onChange={v => setDefBoosts({ ...defBoosts, [stat]: v })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        className={`w-full py-2 rounded-lg text-sm font-semibold transition ${
          canSubmit
            ? 'bg-green-600 text-white hover:bg-green-500'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {lang === 'ja' ? '記録' : 'Record'}
      </button>
    </div>
  );
}
