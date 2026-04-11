import { useState, useCallback } from 'react';
import type { StatID, NatureName, TypeName } from '../../src/types.js';
import type { CalcAction, PokemonFormState } from '../hooks/useCalc';
import { getSpecies, getAllSpeciesNames, getAllMoveNames } from '../../src/data/index.js';
import { ALL_NATURES, TERA_TYPES, NATURE_TABLE } from '../lib/constants';
import {
  POKEMON_JA, ABILITY_JA, MOVE_JA, ITEM_JA, TYPE_JA, NATURE_JA,
  STAT_JA, STAT_EN, UI, t,
} from '../lib/ja';
import { useLang } from '../lib/LangContext';
import {
  Party, PartyMember, defaultMember,
  loadParties, addParty, updateParty, deleteParty as removeParty,
  partyToShowdown, fromShowdown,
} from '../lib/party';
import SearchSelect from './SearchSelect';
import ItemSelector from './ItemSelector';
import SPInput from './SPInput';
import { pokemonFront } from '../lib/sprites';

interface PartyPanelProps {
  open: boolean;
  onClose: () => void;
  dispatch: React.Dispatch<CalcAction>;
}

const allSpecies = getAllSpeciesNames();
const allMoves = getAllMoveNames();

export default function PartyPanel({ open, onClose, dispatch }: PartyPanelProps) {
  const { lang } = useLang();
  const [parties, setParties] = useState<Party[]>(() => loadParties());
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(parties[0]?.id ?? null);
  const [selectedMemberIdx, setSelectedMemberIdx] = useState<number>(0);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [copyMsg, setCopyMsg] = useState(false);

  if (!open) return null;

  const party = parties.find(p => p.id === selectedPartyId) ?? null;
  const member = party?.members[selectedMemberIdx] ?? null;

  // === Party CRUD ===
  const handleNewParty = () => {
    const name = lang === 'ja' ? `パーティ ${parties.length + 1}` : `Party ${parties.length + 1}`;
    const p = addParty(name);
    setParties(loadParties());
    setSelectedPartyId(p.id);
    setSelectedMemberIdx(0);
  };

  const handleDeleteParty = () => {
    if (!party) return;
    removeParty(party.id);
    const updated = loadParties();
    setParties(updated);
    setSelectedPartyId(updated[0]?.id ?? null);
    setSelectedMemberIdx(0);
  };

  const handleRenameParty = (name: string) => {
    if (!party) return;
    const updated = { ...party, name };
    updateParty(updated);
    setParties(loadParties());
  };

  // === Member CRUD ===
  const updateMember = useCallback((idx: number, patch: Partial<PartyMember>) => {
    if (!party) return;
    const members = [...party.members];
    members[idx] = { ...members[idx], ...patch };
    const updated = { ...party, members };
    updateParty(updated);
    setParties(loadParties());
  }, [party]);

  const handleAddMember = () => {
    if (!party || party.members.length >= 6) return;
    const updated = { ...party, members: [...party.members, defaultMember()] };
    updateParty(updated);
    setParties(loadParties());
    setSelectedMemberIdx(updated.members.length - 1);
  };

  const handleDeleteMember = (idx: number) => {
    if (!party) return;
    const members = party.members.filter((_, i) => i !== idx);
    const updated = { ...party, members };
    updateParty(updated);
    setParties(loadParties());
    if (selectedMemberIdx >= members.length) {
      setSelectedMemberIdx(Math.max(0, members.length - 1));
    }
  };

  const handleSetSpecies = (idx: number, species: string) => {
    const data = getSpecies(species);
    updateMember(idx, {
      species,
      ability: data?.abilities[0] ?? '',
      item: '',
      teraType: '',
      moves: ['', '', '', ''],
    });
  };

  // === Showdown ===
  const handleExport = () => {
    if (!party) return;
    const text = partyToShowdown(party);
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg(true);
      setTimeout(() => setCopyMsg(false), 2000);
    });
  };

  const handleImport = () => {
    if (!party || !importText.trim()) return;
    const members = fromShowdown(importText);
    const updated = { ...party, members: members.slice(0, 6) };
    updateParty(updated);
    setParties(loadParties());
    setShowImport(false);
    setImportText('');
    setSelectedMemberIdx(0);
  };

  // === Load into calculator ===
  const loadIntoCalc = (side: 'attacker' | 'defender') => {
    if (!member || !member.species) return;
    const pokemon: PokemonFormState = {
      species: member.species,
      sp: { ...member.sp },
      nature: member.nature,
      ability: member.ability,
      item: member.item,
      teraType: member.teraType,
      isTera: false,
      isStellarFirstUse: member.teraType === 'Stellar',
      status: '',
      curHP: 100,
      boosts: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      isMega: false,
    };
    dispatch({ type: 'LOAD_POKEMON', side, pokemon });
    // Also set first move if available
    if (member.moves[0]) {
      dispatch({ type: 'SET_MOVE', name: member.moves[0] });
    }
    onClose();
  };

  const speciesData = member?.species ? getSpecies(member.species) : null;
  const abilities = speciesData?.abilities ?? [];
  const baseStats = speciesData?.baseStats ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto">
      <div className="bg-gray-900 w-full max-w-3xl my-4 mx-2 rounded-lg border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <h2 className="text-lg font-bold">{UI.party[lang]}</h2>
          <button
            className="px-3 py-1 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700"
            onClick={onClose}
          >
            {UI.close[lang]}
          </button>
        </div>

        {/* Party tabs */}
        <div className="flex items-center gap-1 p-2 border-b border-gray-800 overflow-x-auto">
          {parties.map(p => (
            <button
              key={p.id}
              className={`px-3 py-1.5 rounded text-xs whitespace-nowrap transition ${
                p.id === selectedPartyId
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              onClick={() => { setSelectedPartyId(p.id); setSelectedMemberIdx(0); }}
            >
              {p.name}
            </button>
          ))}
          <button
            className="px-3 py-1.5 rounded text-xs bg-gray-800 text-green-400 hover:bg-gray-700"
            onClick={handleNewParty}
          >
            + {UI.newParty[lang]}
          </button>
        </div>

        {!party ? (
          <div className="p-8 text-center text-gray-500">{UI.noParties[lang]}</div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Party name editor + actions */}
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                value={party.name}
                onChange={e => handleRenameParty(e.target.value)}
              />
              <button
                className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700"
                onClick={handleExport}
              >
                {copyMsg ? UI.copied[lang] : UI.exportShowdown[lang]}
              </button>
              <button
                className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700"
                onClick={() => setShowImport(!showImport)}
              >
                {UI.importShowdown[lang]}
              </button>
              <button
                className="px-2 py-1 rounded text-xs bg-red-900/50 text-red-400 hover:bg-red-900"
                onClick={handleDeleteParty}
              >
                {UI.deleteParty[lang]}
              </button>
            </div>

            {/* Showdown import area */}
            {showImport && (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-xs font-mono h-32 resize-y"
                  placeholder="Paste Showdown format here..."
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
                    onClick={handleImport}
                  >
                    {UI.importShowdown[lang]}
                  </button>
                  <button
                    className="px-3 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700"
                    onClick={() => { setShowImport(false); setImportText(''); }}
                  >
                    {UI.cancel[lang]}
                  </button>
                </div>
              </div>
            )}

            {/* Member slots (6 icons) */}
            <div className="flex gap-2">
              {party.members.map((m, i) => (
                <button
                  key={i}
                  className={`relative w-14 h-14 rounded border transition flex items-center justify-center ${
                    i === selectedMemberIdx
                      ? 'border-blue-500 bg-gray-800'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedMemberIdx(i)}
                >
                  {m.species ? (
                    <img
                      src={pokemonFront(getSpecies(m.species)?.id ?? 0)}
                      alt={m.species}
                      className="w-12 h-12 object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="text-gray-600 text-lg">?</span>
                  )}
                  <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-gray-700 text-[10px] text-gray-400 flex items-center justify-center">
                    {i + 1}
                  </span>
                </button>
              ))}
              {party.members.length < 6 && (
                <button
                  className="w-14 h-14 rounded border border-dashed border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400 flex items-center justify-center text-xl"
                  onClick={handleAddMember}
                >
                  +
                </button>
              )}
            </div>

            {/* Member editor */}
            {member && (
              <div className="border border-gray-800 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">#{selectedMemberIdx + 1}</span>
                  <button
                    className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400 hover:bg-red-900"
                    onClick={() => handleDeleteMember(selectedMemberIdx)}
                  >
                    {UI.deleteMember[lang]}
                  </button>
                </div>

                {/* Species */}
                <SearchSelect
                  label={UI.pokemon[lang]}
                  options={allSpecies}
                  value={member.species}
                  onChange={v => handleSetSpecies(selectedMemberIdx, v)}
                  displayMap={POKEMON_JA}
                />

                {/* Nature + Ability */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">{UI.nature[lang]}</label>
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm"
                      value={member.nature}
                      onChange={e => updateMember(selectedMemberIdx, { nature: e.target.value as NatureName })}
                    >
                      {ALL_NATURES.map(n => {
                        const info = NATURE_TABLE[n];
                        const statMap = lang === 'ja' ? STAT_JA : STAT_EN;
                        const suffix = info.plus ? ` (+${statMap[info.plus]} -${statMap[info.minus!]})` : '';
                        return <option key={n} value={n}>{t(n, NATURE_JA, lang)}{suffix}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">{UI.ability[lang]}</label>
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm"
                      value={member.ability}
                      onChange={e => updateMember(selectedMemberIdx, { ability: e.target.value })}
                    >
                      {abilities.map(a => <option key={a} value={a}>{t(a, ABILITY_JA, lang)}</option>)}
                    </select>
                  </div>
                </div>

                {/* Item */}
                <ItemSelector
                  value={member.item}
                  species={member.species}
                  onChange={v => updateMember(selectedMemberIdx, { item: v })}
                />

                {/* Tera Type */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{UI.teraType[lang]}</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm"
                    value={member.teraType}
                    onChange={e => updateMember(selectedMemberIdx, {
                      teraType: e.target.value as TypeName | 'Stellar' | '',
                    })}
                  >
                    <option value="">{UI.teraNone[lang]}</option>
                    {TERA_TYPES.map(tp => <option key={tp} value={tp}>{t(tp, TYPE_JA, lang)}</option>)}
                  </select>
                </div>

                {/* SP */}
                {speciesData && (
                  <SPInput
                    sp={member.sp}
                    nature={member.nature}
                    baseStats={baseStats}
                    onChangeSP={(stat, val) => {
                      const newSp = { ...member.sp, [stat]: Math.max(0, Math.min(32, val)) };
                      updateMember(selectedMemberIdx, { sp: newSp });
                    }}
                  />
                )}

                {/* Moves (4 slots) */}
                <div className="space-y-1">
                  <label className="block text-xs text-gray-400">{UI.move[lang]}</label>
                  {([0, 1, 2, 3] as const).map(i => (
                    <SearchSelect
                      key={i}
                      label={`${UI.moveSlot[lang]}${i + 1}`}
                      options={allMoves}
                      value={member.moves[i]}
                      onChange={v => {
                        const moves = [...member.moves] as [string, string, string, string];
                        moves[i] = v;
                        updateMember(selectedMemberIdx, { moves });
                      }}
                      displayMap={MOVE_JA}
                    />
                  ))}
                </div>

                {/* Load into calc */}
                <div className="flex gap-2 pt-2">
                  <button
                    className="flex-1 py-2 rounded text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
                    onClick={() => loadIntoCalc('attacker')}
                  >
                    {UI.setAttacker[lang]}
                  </button>
                  <button
                    className="flex-1 py-2 rounded text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 transition"
                    onClick={() => loadIntoCalc('defender')}
                  >
                    {UI.setDefender[lang]}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
