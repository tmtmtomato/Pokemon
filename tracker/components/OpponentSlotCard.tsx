import type { TrackerAction, OpponentPokemonSlot } from '../hooks/useTracker';
import type { TypeName } from '../../src/types.js';
import { getSpecies, getAllSpeciesNames } from '../../src/data/index.js';
import { TERA_TYPES, TYPE_COLORS } from '../../app/lib/constants';
import { POKEMON_JA, ABILITY_JA, TYPE_JA, t } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';
import { pokemonFront } from '../../app/lib/sprites';
import SearchSelect from '../../app/components/SearchSelect';
import ItemSelector from '../../app/components/ItemSelector';

const allSpecies = getAllSpeciesNames();

interface Props {
  slot: OpponentPokemonSlot;
  index: number;
  canRemove: boolean;
  dispatch: React.Dispatch<TrackerAction>;
}

export default function OpponentSlotCard({ slot, index, canRemove, dispatch }: Props) {
  const { lang } = useLang();
  const speciesData = slot.species ? getSpecies(slot.species) : null;
  const abilities = speciesData?.abilities ?? [];

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
            onChange={v => dispatch({ type: 'SET_OPPONENT_SPECIES', slot: index, species: v })}
            displayMap={POKEMON_JA}
          />
        </div>

        {canRemove && (
          <button
            className="text-gray-600 hover:text-red-400 text-xs"
            onClick={() => dispatch({ type: 'REMOVE_OPPONENT_SLOT', slot: index })}
          >
            ✕
          </button>
        )}
      </div>

      {/* Revealed info (show when species selected) */}
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

          {/* Known info row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Known Ability */}
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
              value={slot.knownAbility}
              onChange={e => dispatch({ type: 'REVEAL_ABILITY', opponentSlot: index, ability: e.target.value })}
            >
              <option value="">{lang === 'ja' ? '特性不明' : 'Ability unknown'}</option>
              {abilities.map(a => <option key={a} value={a}>{t(a, ABILITY_JA, lang)}</option>)}
            </select>

            {/* Known Tera */}
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
              value={slot.knownTeraType}
              onChange={e => {
                const v = e.target.value;
                if (v === '') {
                  dispatch({ type: 'SET_OPPONENT_POKEMON', slot: index, updates: { knownTeraType: '' } });
                } else {
                  dispatch({ type: 'REVEAL_TERA', opponentSlot: index, teraType: v as TypeName | 'Stellar' });
                }
              }}
            >
              <option value="">{lang === 'ja' ? 'テラス不明' : 'Tera unknown'}</option>
              {TERA_TYPES.map(tp => <option key={tp} value={tp}>{t(tp, TYPE_JA, lang)}</option>)}
            </select>
          </div>

          {/* Known Item */}
          <ItemSelector
            value={slot.knownItem}
            species={slot.species}
            onChange={v => dispatch({ type: 'REVEAL_ITEM', opponentSlot: index, item: v })}
          />

          {/* Known moves (read-only badges) */}
          {slot.knownMoves.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-gray-500">{lang === 'ja' ? '確認技:' : 'Known:'}</span>
              {slot.knownMoves.map(m => (
                <span key={m} className="px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-300">
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* Nickname */}
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            placeholder={lang === 'ja' ? 'ニックネーム (任意)' : 'Nickname (optional)'}
            value={slot.nickname}
            onChange={e => dispatch({ type: 'SET_OPPONENT_POKEMON', slot: index, updates: { nickname: e.target.value } })}
          />
        </div>
      )}
    </div>
  );
}
