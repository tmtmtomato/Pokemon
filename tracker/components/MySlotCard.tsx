import type { TrackerAction, MyPokemonSlot } from '../hooks/useTracker';
import type { NatureName, TypeName } from '../../src/types.js';
import { getSpecies, getAllSpeciesNames, getAllMoveNames } from '../../src/data/index.js';
import { ALL_NATURES, TERA_TYPES, NATURE_TABLE, TYPE_COLORS } from '../../app/lib/constants';
import { POKEMON_JA, ABILITY_JA, ITEM_JA, MOVE_JA, TYPE_JA, NATURE_JA, STAT_JA, STAT_EN, UI, t } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';
import { pokemonFront } from '../../app/lib/sprites';
import SearchSelect from '../../app/components/SearchSelect';
import ItemSelector from '../../app/components/ItemSelector';

const allSpecies = getAllSpeciesNames();
const allMoves = getAllMoveNames();

interface Props {
  slot: MyPokemonSlot;
  index: number;
  canRemove: boolean;
  dispatch: React.Dispatch<TrackerAction>;
}

export default function MySlotCard({ slot, index, canRemove, dispatch }: Props) {
  const { lang } = useLang();
  const speciesData = slot.species ? getSpecies(slot.species) : null;
  const abilities = speciesData?.abilities ?? [];
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;

  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center gap-3">
        {/* Sprite */}
        {speciesData ? (
          <img
            src={pokemonFront(speciesData.id)}
            alt={slot.species}
            className="w-10 h-10 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600 text-xs">
            {index + 1}
          </div>
        )}

        {/* Species selector */}
        <div className="flex-1">
          <SearchSelect
            label=""
            options={allSpecies}
            value={slot.species}
            onChange={v => dispatch({ type: 'SET_MY_SPECIES', slot: index, species: v })}
            displayMap={POKEMON_JA}
          />
        </div>

        {canRemove && (
          <button
            className="text-gray-600 hover:text-red-400 text-xs"
            onClick={() => dispatch({ type: 'REMOVE_MY_SLOT', slot: index })}
          >
            ✕
          </button>
        )}
      </div>

      {/* Details (show when species selected) */}
      {speciesData && (
        <div className="mt-2 space-y-2">
          {/* Types */}
          <div className="flex gap-1">
            {speciesData.types.map(tp => (
              <span
                key={tp}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: TYPE_COLORS[tp] }}
              >
                {t(tp, TYPE_JA, lang)}
              </span>
            ))}
          </div>

          {/* Nature + Ability */}
          <div className="grid grid-cols-2 gap-2">
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
              value={slot.nature}
              onChange={e => dispatch({ type: 'SET_MY_POKEMON', slot: index, updates: { nature: e.target.value as NatureName } })}
            >
              {ALL_NATURES.map(n => {
                const info = NATURE_TABLE[n];
                const suffix = info.plus ? ` (+${statMap[info.plus]} -${statMap[info.minus!]})` : '';
                return <option key={n} value={n}>{t(n, NATURE_JA, lang)}{suffix}</option>;
              })}
            </select>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
              value={slot.ability}
              onChange={e => dispatch({ type: 'SET_MY_POKEMON', slot: index, updates: { ability: e.target.value } })}
            >
              {abilities.map(a => <option key={a} value={a}>{t(a, ABILITY_JA, lang)}</option>)}
            </select>
          </div>

          {/* Item */}
          <ItemSelector
            value={slot.item}
            species={slot.species}
            onChange={v => dispatch({ type: 'SET_MY_POKEMON', slot: index, updates: { item: v } })}
          />

          {/* Moves (4 slots) */}
          <div className="grid grid-cols-2 gap-1">
            {[0, 1, 2, 3].map(mi => (
              <SearchSelect
                key={mi}
                label=""
                placeholder={`${lang === 'ja' ? '技' : 'Move'} ${mi + 1}`}
                options={allMoves}
                value={slot.moves[mi] ?? ''}
                onChange={v => dispatch({ type: 'SET_MY_MOVE', slot: index, moveIndex: mi, move: v })}
                displayMap={MOVE_JA}
              />
            ))}
          </div>

          {/* Tera */}
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
            value={slot.teraType}
            onChange={e => dispatch({ type: 'SET_MY_POKEMON', slot: index, updates: { teraType: e.target.value as TypeName | 'Stellar' | '' } })}
          >
            <option value="">{lang === 'ja' ? 'テラスなし' : 'No Tera'}</option>
            {TERA_TYPES.map(tp => <option key={tp} value={tp}>{t(tp, TYPE_JA, lang)}</option>)}
          </select>

          {/* SP allocation with ±4 buttons */}
          {(() => {
            const total = Object.values(slot.sp).reduce((a, b) => a + b, 0);
            const overBudget = total > 66;
            return (
              <>
                <div className="grid grid-cols-6 gap-1">
                  {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map(stat => (
                    <div key={stat} className="text-center">
                      <div className="text-[10px] text-gray-500">{statMap[stat]}</div>
                      <div className="flex items-center">
                        <button
                          className="w-4 h-5 bg-gray-800 hover:bg-gray-700 text-gray-500 text-[10px] rounded-l border border-gray-700 shrink-0"
                          onClick={() => dispatch({ type: 'SET_MY_SP', slot: index, stat, value: slot.sp[stat] - 4 })}
                        >-</button>
                        <input
                          type="number"
                          min={0}
                          max={32}
                          className="w-full bg-gray-800 border-y border-gray-700 px-0 py-0.5 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={slot.sp[stat]}
                          onChange={e => dispatch({ type: 'SET_MY_SP', slot: index, stat, value: Number(e.target.value) })}
                        />
                        <button
                          className="w-4 h-5 bg-gray-800 hover:bg-gray-700 text-gray-500 text-[10px] rounded-r border border-gray-700 shrink-0"
                          onClick={() => dispatch({ type: 'SET_MY_SP', slot: index, stat, value: slot.sp[stat] + 4 })}
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* SP progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : total >= 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, (total / 66) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono ${overBudget ? 'text-red-400' : 'text-gray-500'}`}>
                    {total}/66
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
