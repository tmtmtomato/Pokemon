import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLang } from '../lib/LangContext';

interface SearchSelectProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Map from option key to display label (e.g. Japanese name) */
  displayMap?: Record<string, string>;
}

export default function SearchSelect({ label, options, value, onChange, placeholder, displayMap }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();

  const display = (key: string) => (lang === 'ja' && displayMap?.[key]) ? displayMap[key] : key;

  // Sort options: Japanese mode → gojuon order, English mode → alphabetical
  const sortedOptions = useMemo(() => {
    if (lang === 'ja' && displayMap) {
      return [...options].sort((a, b) => {
        const ja = displayMap[a] ?? a;
        const jb = displayMap[b] ?? b;
        return ja.localeCompare(jb, 'ja');
      });
    }
    return [...options].sort((a, b) => a.localeCompare(b, 'en'));
  }, [options, lang, displayMap]);

  const filtered = query
    ? sortedOptions.filter(o => {
        const q = query.toLowerCase();
        return o.toLowerCase().includes(q) || (displayMap?.[o] ?? '').toLowerCase().includes(q);
      })
    : sortedOptions;

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
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        ref={inputRef}
        type="text"
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        placeholder={placeholder ?? (lang === 'ja' ? `${label}を検索...` : `Search ${label}...`)}
        value={open ? query : display(value)}
        onChange={e => { setQuery(e.target.value); setHighlightIdx(0); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); setHighlightIdx(0); }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-gray-800 border border-gray-700 rounded shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === highlightIdx ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'
              } ${opt === value ? 'font-semibold' : ''}`}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
            >
              {display(opt)}
              {lang === 'ja' && displayMap?.[opt] && (
                <span className="ml-2 text-xs text-gray-500">{opt}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
