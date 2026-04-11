import type { PokemonFormState, CalcAction } from '../hooks/useCalc';
import type { NatureName, TypeName } from '../../src/types.js';
import { getSpecies, getItem, getAllSpeciesNames } from '../../src/data/index.js';
import { ALL_NATURES, TERA_TYPES, NATURE_TABLE, TYPE_COLORS } from '../lib/constants';
import { POKEMON_JA, ABILITY_JA, TYPE_JA, NATURE_JA, STAT_JA, STAT_EN, STATUS_JA, STATUS_EN, UI, t } from '../lib/ja';
import { useLang } from '../lib/LangContext';
import SearchSelect from './SearchSelect';
import ItemSelector from './ItemSelector';
import SPInput from './SPInput';
import BoostControl from './BoostControl';
import PokemonSprite from './PokemonSprite';

interface PokemonPanelProps {
  pokemon: PokemonFormState;
  side: 'attacker' | 'defender';
  dispatch: React.Dispatch<CalcAction>;
}

const allSpecies = getAllSpeciesNames();

export default function PokemonPanel({ pokemon, side, dispatch }: PokemonPanelProps) {
  const { lang } = useLang();
  const speciesData = pokemon.species ? getSpecies(pokemon.species) : null;
  const abilities = speciesData?.abilities ?? [];
  const baseStats = speciesData?.baseStats ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  const itemData = pokemon.item ? getItem(pokemon.item) : null;
  const canMega = !!(itemData?.megaStone && itemData.megaStone === pokemon.species);
  const megaData = speciesData?.mega;

  const types = pokemon.isMega && megaData ? megaData.types : speciesData?.types ?? [];
  const statMap = lang === 'ja' ? STAT_JA : STAT_EN;
  const statusMap = lang === 'ja' ? STATUS_JA : STATUS_EN;

  return (
    <div className="space-y-3">
      {/* スプライト + ポケモン選択 */}
      <PokemonSprite
        id={speciesData?.id}
        name={pokemon.species || ''}
        isMega={pokemon.isMega}
        isTera={pokemon.isTera}
        teraType={pokemon.teraType || undefined}
      />

      <SearchSelect
        label={UI.pokemon[lang]}
        options={allSpecies}
        value={pokemon.species}
        onChange={v => dispatch({ type: 'SET_SPECIES', side, species: v })}
        displayMap={POKEMON_JA}
      />

      {/* タイプ表示 */}
      {types.length > 0 && (
        <div className="flex gap-1 justify-center">
          {types.map(tp => (
            <span
              key={tp}
              className="px-2 py-0.5 rounded text-xs font-semibold text-white"
              style={{ backgroundColor: TYPE_COLORS[tp] }}
            >
              {t(tp, TYPE_JA, lang)}
            </span>
          ))}
          {pokemon.isTera && pokemon.teraType && (
            <span
              className="px-2 py-0.5 rounded text-xs font-semibold text-white border border-white/30"
              style={{ backgroundColor: TYPE_COLORS[pokemon.teraType] ?? '#888' }}
            >
              {UI.teraLabel[lang]} {t(pokemon.teraType, TYPE_JA, lang)}
            </span>
          )}
        </div>
      )}

      {/* 性格 + 特性 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">{UI.nature[lang]}</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm"
            value={pokemon.nature}
            onChange={e => dispatch({ type: 'SET_NATURE', side, nature: e.target.value as NatureName })}
          >
            {ALL_NATURES.map(n => {
              const info = NATURE_TABLE[n];
              const suffix = info.plus ? ` (+${statMap[info.plus]} -${statMap[info.minus!]})` : '';
              return <option key={n} value={n}>{t(n, NATURE_JA, lang)}{suffix}</option>;
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{UI.ability[lang]}</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm"
            value={pokemon.ability}
            onChange={e => dispatch({ type: 'SET_ABILITY', side, ability: e.target.value })}
          >
            {abilities.map(a => <option key={a} value={a}>{t(a, ABILITY_JA, lang)}</option>)}
          </select>
        </div>
      </div>

      {/* もちもの + メガ */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <ItemSelector
            value={pokemon.item}
            species={pokemon.species}
            onChange={v => dispatch({ type: 'SET_ITEM', side, item: v })}
          />
        </div>
        {canMega && (
          <button
            className={`px-3 py-2 rounded text-sm font-semibold transition ${
              pokemon.isMega
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-purple-500'
            }`}
            onClick={() => dispatch({ type: 'SET_MEGA', side, isMega: !pokemon.isMega })}
          >
            {UI.mega[lang]}
          </button>
        )}
      </div>

      {/* テラスタル */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">{UI.teraType[lang]}</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm"
            value={pokemon.teraType}
            onChange={e => dispatch({
              type: 'SET_TERA_TYPE', side,
              teraType: e.target.value as TypeName | 'Stellar' | '',
            })}
          >
            <option value="">{UI.teraNone[lang]}</option>
            {TERA_TYPES.map(tp => <option key={tp} value={tp}>{t(tp, TYPE_JA, lang)}</option>)}
          </select>
        </div>
        {pokemon.teraType && (
          <div className="flex items-end">
            <button
              className={`w-full px-3 py-2 rounded text-sm transition ${
                pokemon.isTera
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-teal-500'
              }`}
              onClick={() => dispatch({ type: 'SET_IS_TERA', side, isTera: !pokemon.isTera })}
            >
              {pokemon.isTera ? UI.teraActive[lang] : UI.teraOff[lang]}
            </button>
          </div>
        )}
      </div>

      {/* SP配分 */}
      {speciesData && (
        <SPInput
          sp={pokemon.sp}
          nature={pokemon.nature}
          baseStats={pokemon.isMega && megaData ? megaData.baseStats : baseStats}
          onChangeSP={(stat, val) => dispatch({ type: 'SET_SP', side, stat, value: val })}
        />
      )}

      {/* 状態異常 + HP */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">{UI.status[lang]}</label>
          <div className="flex flex-wrap gap-1">
            {(['', 'brn', 'par', 'psn', 'tox', 'slp', 'frz'] as const).map(s => (
              <button
                key={s}
                className={`px-2 py-1 rounded text-xs transition ${
                  pokemon.status === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                onClick={() => dispatch({ type: 'SET_STATUS', side, status: s as any })}
              >
                {statusMap[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{UI.hp[lang]}: {pokemon.curHP}%</label>
          <input
            type="range"
            min={1}
            max={100}
            value={pokemon.curHP}
            onChange={e => dispatch({ type: 'SET_HP', side, curHP: Number(e.target.value) })}
            className="w-full accent-green-500"
          />
        </div>
      </div>

      {/* 能力ランク */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">{UI.boosts[lang]}</label>
        <BoostControl
          boosts={pokemon.boosts}
          onChangeBoost={(stat, val) => dispatch({ type: 'SET_BOOST', side, stat, value: val })}
        />
      </div>
    </div>
  );
}
