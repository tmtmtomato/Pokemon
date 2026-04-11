import { useState } from 'react';
import type { MyPokemonSlot, TrackerAction } from '../hooks/useTracker';
import { exportTeam, importTeam } from '../engine/showdown-format';
import { POKEMON_JA, t } from '../../app/lib/ja';
import { useLang } from '../../app/lib/LangContext';
import { PRESET_TEAMS } from '../presets';

const STORAGE_KEY = 'champions-team-library';

export interface SavedTeam {
  name: string;
  team: MyPokemonSlot[];
  savedAt: number;
}

function loadLibrary(): SavedTeam[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLibrary(lib: SavedTeam[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  } catch { /* ignore */ }
}

interface Props {
  currentTeam: MyPokemonSlot[];
  dispatch: React.Dispatch<TrackerAction>;
}

type View = 'list' | 'presets' | 'import' | 'export';

export default function TeamLibrary({ currentTeam, dispatch }: Props) {
  const { lang } = useLang();
  const [view, setView] = useState<View>('list');
  const [library, setLibrary] = useState<SavedTeam[]>(loadLibrary);
  const [saveName, setSaveName] = useState('');
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [copied, setCopied] = useState(false);

  const filledSlots = currentTeam.filter(s => s.species);

  // Load preset team
  const handleLoadPreset = (text: string) => {
    const team = importTeam(text);
    if (team.length > 0) {
      dispatch({ type: 'LOAD_MY_TEAM', team });
      setView('list');
    }
  };

  // Save current team
  const handleSave = () => {
    if (!saveName.trim() || filledSlots.length === 0) return;
    const entry: SavedTeam = { name: saveName.trim(), team: filledSlots, savedAt: Date.now() };
    const updated = [entry, ...library.filter(e => e.name !== saveName.trim())];
    setLibrary(updated);
    saveLibrary(updated);
    setSaveName('');
  };

  // Load saved team
  const handleLoad = (saved: SavedTeam) => {
    dispatch({ type: 'LOAD_MY_TEAM', team: saved.team });
  };

  // Delete saved team
  const handleDelete = (name: string) => {
    const updated = library.filter(e => e.name !== name);
    setLibrary(updated);
    saveLibrary(updated);
  };

  // Export to Showdown format
  const handleExport = () => {
    setExportText(exportTeam(currentTeam));
    setView('export');
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(exportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // L-12: Fallback if clipboard API is not available
      console.warn('Clipboard API not available');
    });
  };

  // Import from Showdown format
  const handleImport = () => {
    if (!importText.trim()) return;
    const team = importTeam(importText);
    if (team.length > 0) {
      dispatch({ type: 'LOAD_MY_TEAM', team });
      setImportText('');
      setView('list');
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 space-y-2">
      {/* Header tabs */}
      <div className="flex gap-1">
        {([
          { key: 'list' as View, ja: 'ライブラリ', en: 'Library' },
          { key: 'presets' as View, ja: 'プリセット', en: 'Presets' },
          { key: 'import' as View, ja: 'インポート', en: 'Import' },
          { key: 'export' as View, ja: 'エクスポート', en: 'Export' },
        ]).map(tab => (
          <button
            key={tab.key}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition ${
              view === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            onClick={() => {
              if (tab.key === 'export') handleExport();
              else setView(tab.key);
            }}
          >
            {lang === 'ja' ? tab.ja : tab.en}
          </button>
        ))}
      </div>

      {/* Library view */}
      {view === 'list' && (
        <div className="space-y-2">
          {/* Save current */}
          <div className="flex gap-1">
            <input
              type="text"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs"
              placeholder={lang === 'ja' ? 'パーティ名を入力...' : 'Team name...'}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <button
              className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                saveName.trim() && filledSlots.length > 0
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!saveName.trim() || filledSlots.length === 0}
              onClick={handleSave}
            >
              {lang === 'ja' ? '保存' : 'Save'}
            </button>
          </div>

          {/* Saved teams list */}
          {library.length === 0 ? (
            <div className="text-[10px] text-gray-600 text-center py-2">
              {lang === 'ja' ? '保存済みパーティがありません' : 'No saved teams'}
            </div>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {library.map(saved => (
                <div
                  key={saved.name}
                  className="flex items-center gap-2 bg-gray-800/50 rounded p-1.5 border border-gray-700/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-200 truncate">{saved.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {saved.team.map(s => t(s.species, POKEMON_JA, lang)).join(', ')}
                    </div>
                  </div>
                  <button
                    className="px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-semibold hover:bg-blue-500 shrink-0"
                    onClick={() => handleLoad(saved)}
                  >
                    {lang === 'ja' ? '読込' : 'Load'}
                  </button>
                  <button
                    className="text-gray-600 hover:text-red-400 text-xs shrink-0"
                    onClick={() => handleDelete(saved.name)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Presets view */}
      {view === 'presets' && (
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 mb-1">
            {lang === 'ja'
              ? 'サンプルパーティをワンタップで読み込み'
              : 'Load a sample team with one tap'}
          </div>
          {PRESET_TEAMS.map(preset => {
            const parsed = importTeam(preset.text);
            return (
              <div
                key={preset.id}
                className="flex items-center gap-2 bg-gray-800/50 rounded p-1.5 border border-gray-700/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-200 truncate">
                    {lang === 'ja' ? preset.name.ja : preset.name.en}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {parsed.map(s => t(s.species, POKEMON_JA, lang)).join(', ')}
                  </div>
                </div>
                <button
                  className="px-2 py-1 rounded bg-purple-600 text-white text-[10px] font-semibold hover:bg-purple-500 shrink-0"
                  onClick={() => handleLoadPreset(preset.text)}
                >
                  {lang === 'ja' ? '読込' : 'Load'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Import view */}
      {view === 'import' && (
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500">
            {lang === 'ja'
              ? 'Showdown / PokePaste形式で貼り付けてください (EV→SP自動変換)'
              : 'Paste Showdown / PokePaste format (EVs auto-converted to SP)'}
          </div>
          <textarea
            className="w-full h-40 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:border-blue-500"
            placeholder={`Garchomp @ Life Orb\nAbility: Rough Skin\nLevel: 50\nTera Type: Ground\nEVs: 252 Atk / 4 Def / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect`}
            value={importText}
            onChange={e => setImportText(e.target.value)}
          />
          <button
            className={`w-full py-2 rounded text-xs font-semibold transition ${
              importText.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!importText.trim()}
            onClick={handleImport}
          >
            {lang === 'ja' ? 'インポート実行' : 'Import Team'}
          </button>
        </div>
      )}

      {/* Export view */}
      {view === 'export' && (
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500">
            {lang === 'ja'
              ? 'Showdown / PokePaste互換形式 (SP→EV自動変換)'
              : 'Showdown / PokePaste compatible (SP auto-converted to EVs)'}
          </div>
          <textarea
            className="w-full h-40 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs font-mono resize-none"
            readOnly
            value={exportText}
          />
          <button
            className="w-full py-2 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition"
            onClick={handleCopy}
          >
            {copied
              ? (lang === 'ja' ? 'コピーしました!' : 'Copied!')
              : (lang === 'ja' ? 'クリップボードにコピー' : 'Copy to Clipboard')}
          </button>
        </div>
      )}
    </div>
  );
}
