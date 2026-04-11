import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getAllItemNames, getItem } from '../../src/data/index.js';
import { ITEM_JA, UI, t } from '../lib/ja';
import { useLang } from '../lib/LangContext';
import { itemSprite } from '../lib/sprites';

interface ItemSelectorProps {
  value: string;
  species: string;
  onChange: (value: string) => void;
}

type ItemCategory = 'battle' | 'berry' | 'mega';

const CATEGORY_LABELS: Record<ItemCategory, { ja: string; en: string }> = {
  battle: { ja: '戦闘', en: 'Battle' },
  berry: { ja: 'きのみ', en: 'Berry' },
  mega: { ja: 'メガ', en: 'Mega' },
};

// Pre-categorize items
const allItems = getAllItemNames();
const categorized = (() => {
  const battle: string[] = [];
  const berry: string[] = [];
  const mega: string[] = [];
  for (const name of allItems) {
    const data = getItem(name);
    if (data?.megaStone) {
      mega.push(name);
    } else if (data?.resistBerry || name.endsWith(' Berry')) {
      berry.push(name);
    } else {
      battle.push(name);
    }
  }
  return { battle, berry, mega };
})();

export default function ItemSelector({ value, species, onChange }: ItemSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ItemCategory>('battle');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();

  const display = (key: string) => (lang === 'ja' && ITEM_JA[key]) ? ITEM_JA[key] : key;

  // Filter mega stones: only show the one matching current species
  const megaForSpecies = useMemo(() => {
    return categorized.mega.filter(name => {
      const data = getItem(name);
      return data?.megaStone === species;
    });
  }, [species]);

  const hasMega = megaForSpecies.length > 0;

  // Available tabs
  const availableTabs: ItemCategory[] = useMemo(() => {
    const tabs: ItemCategory[] = ['battle', 'berry'];
    if (hasMega) tabs.push('mega');
    return tabs;
  }, [hasMega]);

  // When species changes and current tab is mega but no mega available, reset
  useEffect(() => {
    if (tab === 'mega' && !hasMega) setTab('battle');
  }, [hasMega, tab]);

  // Get items for current tab
  const tabItems = useMemo(() => {
    switch (tab) {
      case 'battle': return categorized.battle;
      case 'berry': return categorized.berry;
      case 'mega': return megaForSpecies;
    }
  }, [tab, megaForSpecies]);

  // Sort by display name
  const sortedItems = useMemo(() => {
    return [...tabItems].sort((a, b) => {
      const da = display(a);
      const db = display(b);
      return da.localeCompare(db, lang);
    });
  }, [tabItems, lang]);

  // Filter by search query (across all categories)
  const filtered = useMemo(() => {
    if (!query) return sortedItems;
    const q = query.toLowerCase();
    // Search across ALL items, not just current tab
    const allCandidates = [...categorized.battle, ...categorized.berry, ...megaForSpecies];
    return allCandidates.filter(o =>
      o.toLowerCase().includes(q) || (ITEM_JA[o] ?? '').toLowerCase().includes(q)
    ).sort((a, b) => display(a).localeCompare(display(b), lang));
  }, [query, sortedItems, megaForSpecies, lang]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, open]);

  const handleSelect = useCallback((val: string) => {
    onChange(val);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx]);
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-gray-400 mb-1">{UI.item[lang]}</label>
      <div className="relative">
        {/* Item icon in input */}
        {!open && value && (
          <img
            src={itemSprite(value)}
            alt=""
            className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 object-contain pointer-events-none"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          className={`w-full bg-gray-800 border border-gray-700 rounded py-2 text-sm focus:outline-none focus:border-blue-500 ${
            !open && value ? 'pl-8 pr-3' : 'px-3'
          }`}
          placeholder={UI.itemNone[lang]}
          value={open ? query : (value ? display(value) : '')}
          onChange={e => { setQuery(e.target.value); setHighlightIdx(0); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(''); setHighlightIdx(0); }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg">
          {/* Category tabs */}
          {!query && (
            <div className="flex border-b border-gray-700">
              {/* None option */}
              <button
                className="px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700"
                onMouseDown={e => { e.preventDefault(); handleSelect(''); }}
              >
                {UI.itemNone[lang]}
              </button>
              <div className="flex ml-auto">
                {availableTabs.map(t => (
                  <button
                    key={t}
                    className={`px-3 py-1.5 text-xs transition ${
                      tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'
                    }`}
                    onMouseDown={e => { e.preventDefault(); setTab(t); setHighlightIdx(0); }}
                  >
                    {CATEGORY_LABELS[t][lang]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Item list */}
          {filtered.length > 0 && (
            <ul ref={listRef} className="max-h-52 overflow-y-auto">
              {filtered.map((opt, i) => (
                <li
                  key={opt}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                    i === highlightIdx ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'
                  } ${opt === value ? 'font-semibold' : ''}`}
                  onMouseEnter={() => setHighlightIdx(i)}
                  onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
                >
                  <img
                    src={itemSprite(opt)}
                    alt=""
                    className="w-5 h-5 object-contain shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span>
                    {display(opt)}
                    {lang === 'ja' && ITEM_JA[opt] && (
                      <span className="ml-2 text-xs text-gray-500">{opt}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {filtered.length === 0 && query && (
            <div className="px-3 py-2 text-xs text-gray-500">
              {lang === 'ja' ? '見つかりません' : 'No results'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
