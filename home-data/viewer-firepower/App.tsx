/**
 * Champions Firepower Ranking Viewer — all-moves edition.
 *
 * Each Pokemon shows ALL learnable attack moves with firepower index.
 * Click a Pokemon row to expand / collapse its move list.
 */

import { useMemo, useState, useEffect } from "react";
import { useLang } from "../viewer/LanguageContext";
import {
  localizePokemon,
  localizeMove,
  localizeAbility,
  localizeItem,
  localizeType,
  localizedSearchKey,
  type Lang,
} from "../viewer/i18n";
import rankingJson from "../storage/analysis/firepower-ranking.json";

// ===== Types =====
interface MoveEntry {
  moveName: string;
  moveType: string;
  originalType: string;
  basePower: number;
  category: string;
  effectiveBP: number;
  firepowerIndex: number;
  isStab: boolean;
  hasRecoil: boolean;
  ateConvert: boolean;
  multiHit: number | [number, number] | null;
  item: string;
  statName: string;
  statValue: number;
  statBase: number;
}

interface PokemonEntry {
  rank: number;
  pokemon: string;
  types: string[];
  ability: string;
  isMega: boolean;
  atkStat: number;
  atkBase: number;
  spaStat: number;
  spaBase: number;
  bestFirepowerIndex: number;
  moves: MoveEntry[];
}

interface RankingData {
  generatedAt: string;
  description: string;
  formula: string;
  assumptions: {
    sp: number;
    nature: string;
    itemNonMega: string;
    itemMega: string;
    itemGuts: string;
  };
  totalForms: number;
  ranking: PokemonEntry[];
}

const DATA: RankingData = rankingJson as unknown as RankingData;

// ===== Type colors =====
const TYPE_COLORS: Record<string, string> = {
  Normal: "bg-gray-500", Fire: "bg-orange-500", Water: "bg-blue-500",
  Electric: "bg-yellow-500", Grass: "bg-green-500", Ice: "bg-cyan-400",
  Fighting: "bg-red-700", Poison: "bg-purple-500", Ground: "bg-amber-700",
  Flying: "bg-sky-400", Psychic: "bg-pink-500", Bug: "bg-lime-600",
  Rock: "bg-yellow-800", Ghost: "bg-indigo-600", Dragon: "bg-indigo-500",
  Dark: "bg-gray-700", Steel: "bg-gray-400", Fairy: "bg-pink-300",
};

function TypeBadge({ type, lang }: { type: string; lang: Lang }) {
  return (
    <span className={`${TYPE_COLORS[type] ?? "bg-gray-600"} text-white text-[10px] leading-none px-1.5 py-0.5 rounded inline-block`}>
      {localizeType(type, lang)}
    </span>
  );
}

function CatBadge({ cat }: { cat: string }) {
  const cls = cat === "Physical"
    ? "bg-red-900/60 text-red-300"
    : "bg-blue-900/60 text-blue-300";
  const label = cat === "Physical" ? "物理" : "特殊";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full bg-gray-800 rounded h-3.5 overflow-hidden">
      <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ===== Main App =====
export default function App() {
  const { lang, toggleLang } = useLang();
  const [dark, setDark] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [megaFilter, setMegaFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      document.body.classList.add("bg-gray-950", "text-gray-100");
      document.body.classList.remove("bg-gray-100", "text-gray-900");
    } else {
      root.classList.remove("dark");
      document.body.classList.remove("bg-gray-950", "text-gray-100");
      document.body.classList.add("bg-gray-100", "text-gray-900");
    }
  }, [dark]);

  const maxIndex = DATA.ranking[0]?.bestFirepowerIndex ?? 1;

  const filtered = useMemo(() => {
    let result = DATA.ranking;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => {
        const key = localizedSearchKey(r.pokemon).toLowerCase();
        return key.includes(q);
      });
    }
    if (typeFilter !== "all") {
      result = result.filter((r) => r.types.includes(typeFilter));
    }
    if (catFilter !== "all") {
      result = result.filter((r) =>
        r.moves.some((m) => m.category === catFilter),
      );
    }
    if (megaFilter === "mega") {
      result = result.filter((r) => r.isMega);
    } else if (megaFilter === "normal") {
      result = result.filter((r) => !r.isMega);
    }
    return result;
  }, [search, typeFilter, catFilter, megaFilter]);

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    DATA.ranking.forEach((r) => r.types.forEach((t) => set.add(t)));
    return [...set].sort();
  }, []);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const keys = filtered.map((r) => `${r.pokemon}-${r.isMega}`);
    setExpanded(new Set(keys));
  };

  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">
            {lang === "ja" ? "火力指数ランキング — 全攻撃技" : "Firepower Index — All Moves"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {lang === "ja"
              ? `${DATA.totalForms}体 | ${DATA.formula} | SP=32, 有利性格, タイプ強化アイテム(非メガ)`
              : `${DATA.totalForms} forms | ${DATA.formula} | SP=32, +nature, type-boost item(non-mega)`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleLang} className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600">
            {lang === "ja" ? "EN" : "JA"}
          </button>
          <button onClick={() => setDark(!dark)} className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600">
            {dark ? "Light" : "Dark"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder={lang === "ja" ? "ポケモン検索..." : "Search Pokemon..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm w-48 focus:outline-none focus:border-blue-500"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm">
          <option value="all">{lang === "ja" ? "全タイプ" : "All Types"}</option>
          {allTypes.map((t) => <option key={t} value={t}>{localizeType(t, lang)}</option>)}
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm">
          <option value="all">{lang === "ja" ? "物理/特殊" : "Phys/Spec"}</option>
          <option value="Physical">{lang === "ja" ? "物理" : "Physical"}</option>
          <option value="Special">{lang === "ja" ? "特殊" : "Special"}</option>
        </select>
        <select value={megaFilter} onChange={(e) => setMegaFilter(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm">
          <option value="all">{lang === "ja" ? "全形態" : "All Forms"}</option>
          <option value="mega">{lang === "ja" ? "メガのみ" : "Mega Only"}</option>
          <option value="normal">{lang === "ja" ? "非メガのみ" : "Non-Mega Only"}</option>
        </select>
        <span className="text-sm text-gray-400 self-center">
          {filtered.length} / {DATA.ranking.length}
        </span>
        <button onClick={expandAll} className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600">
          {lang === "ja" ? "全展開" : "Expand"}
        </button>
        <button onClick={collapseAll} className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600">
          {lang === "ja" ? "全閉じ" : "Collapse"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-left text-gray-400">
              <th className="py-2 px-2 w-10">#</th>
              <th className="py-2 px-2">{lang === "ja" ? "ポケモン" : "Pokemon"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "タイプ" : "Type"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "特性" : "Ability"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "最強技" : "Best Move"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "持ち物" : "Item"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "実効BP" : "Eff.BP"}</th>
              <th className="py-2 px-2 w-56">{lang === "ja" ? "火力指数" : "Index"}</th>
              <th className="py-2 px-2 w-10">{lang === "ja" ? "技数" : "#"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const key = `${r.pokemon}-${r.isMega}`;
              const isOpen = expanded.has(key);
              const best = r.moves[0];
              return (
                <PokemonRow
                  key={key}
                  entry={r}
                  best={best}
                  isOpen={isOpen}
                  maxIndex={maxIndex}
                  lang={lang}
                  catFilter={catFilter}
                  onToggle={() => toggleExpand(key)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>* = {lang === "ja" ? "反動技" : "Recoil move"} | † = {lang === "ja" ? "-ate変換技" : "-ate converted"}</p>
        <p>{lang === "ja"
          ? "メガシンカ: メガストーン固定 (アイテム補正なし) | 非メガ: タイプ強化アイテム (~1.2x)"
          : "Mega: Mega Stone (no item mod) | Non-mega: Type-boost item (~1.2x)"}</p>
        <p>{lang === "ja"
          ? "根性持ち: かえんだま (1.5x Atk + Facade 2x) と比較し高い方を採用"
          : "Guts users: compared with Flame Orb (1.5x Atk + Facade 2x), best picked"}</p>
        <p>{lang === "ja"
          ? "クリックで全攻撃技を展開表示"
          : "Click a row to expand all attack moves"}</p>
      </div>
    </div>
  );
}

// ===== Pokemon row + expandable moves (fragment to avoid <> in table) =====
function PokemonRow({
  entry: r, best, isOpen, maxIndex, lang, catFilter, onToggle,
}: {
  entry: PokemonEntry;
  best: MoveEntry;
  isOpen: boolean;
  maxIndex: number;
  lang: Lang;
  catFilter: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-800 hover:bg-gray-900/50 cursor-pointer" onClick={onToggle}>
        <td className="py-1 px-2 text-gray-500">{r.rank}</td>
        <td className="py-1 px-2 font-medium whitespace-nowrap">
          {localizePokemon(r.pokemon, lang)}
          {r.isMega && <span className="ml-1 text-xs text-purple-400 font-normal">MEGA</span>}
        </td>
        <td className="py-1 px-2 whitespace-nowrap">
          <span className="inline-flex gap-1">
            {r.types.map((t) => <TypeBadge key={t} type={t} lang={lang} />)}
          </span>
        </td>
        <td className="py-1 px-2 text-gray-300 whitespace-nowrap text-xs">
          {localizeAbility(r.ability, lang)}
        </td>
        <td className="py-1 px-2 whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <span>
              {localizeMove(best.moveName, lang)}
              {best.hasRecoil && <span className="text-red-400" title="反動技">*</span>}
              {best.ateConvert && <span className="text-purple-400" title="-ate変換">†</span>}
            </span>
            <CatBadge cat={best.category} />
            <TypeBadge type={best.moveType} lang={lang} />
          </span>
        </td>
        <td className="py-1 px-2 text-gray-300 text-xs whitespace-nowrap">
          {r.isMega ? "-" : localizeItem(best.item, lang)}
        </td>
        <td className="py-1 px-2 text-right tabular-nums">{best.effectiveBP}</td>
        <td className="py-1 px-2">
          <div className="flex items-center gap-2">
            <Bar value={r.bestFirepowerIndex} max={maxIndex} color="bg-orange-500" />
            <span className="text-xs tabular-nums w-16 text-right">
              {r.bestFirepowerIndex.toLocaleString()}
            </span>
          </div>
        </td>
        <td className="py-1 px-2 text-center text-gray-500 text-xs">
          {isOpen ? "▲" : "▼"}{r.moves.length}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={9} className="p-0">
            <MoveList moves={r.moves} maxIndex={maxIndex} isMega={r.isMega} lang={lang} catFilter={catFilter} />
          </td>
        </tr>
      )}
    </>
  );
}

// ===== Move list sub-table =====
function MoveList({
  moves, maxIndex, isMega, lang, catFilter,
}: {
  moves: MoveEntry[];
  maxIndex: number;
  isMega: boolean;
  lang: Lang;
  catFilter: string;
}) {
  const filtered = catFilter === "all" ? moves : moves.filter((m) => m.category === catFilter);

  return (
    <div className="bg-gray-900/60 border-l-2 border-orange-500/30 ml-4 mb-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="py-1 px-2 text-left w-8"></th>
            <th className="py-1 px-2 text-left">{lang === "ja" ? "技" : "Move"}</th>
            <th className="py-1 px-2 text-left">{lang === "ja" ? "タイプ" : "Type"}</th>
            <th className="py-1 px-2 text-right">BP</th>
            <th className="py-1 px-2 text-left">{lang === "ja" ? "持ち物" : "Item"}</th>
            <th className="py-1 px-2 text-left">{lang === "ja" ? "実数値" : "Stat"}</th>
            <th className="py-1 px-2 text-right">{lang === "ja" ? "実効BP" : "Eff.BP"}</th>
            <th className="py-1 px-2 w-48">{lang === "ja" ? "火力指数" : "Index"}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m, i) => (
            <tr key={`${m.moveName}-${m.item}`} className="border-b border-gray-800/50 hover:bg-gray-800/40">
              <td className="py-0.5 px-2 text-gray-600">{i + 1}</td>
              <td className="py-0.5 px-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <span>
                    {localizeMove(m.moveName, lang)}
                    {m.hasRecoil && <span className="text-red-400">*</span>}
                    {m.ateConvert && <span className="text-purple-400">†</span>}
                    {m.multiHit && <span className="text-yellow-400" title="連続技">×</span>}
                  </span>
                  <CatBadge cat={m.category} />
                </span>
              </td>
              <td className="py-0.5 px-2">
                <TypeBadge type={m.moveType} lang={lang} />
                {m.isStab && <span className="ml-1 text-yellow-500 text-[9px]">STAB</span>}
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">{m.basePower}</td>
              <td className="py-0.5 px-2 text-gray-400 whitespace-nowrap">
                {isMega ? "-" : localizeItem(m.item, lang)}
              </td>
              <td className="py-0.5 px-2 whitespace-nowrap tabular-nums">
                <span className="text-gray-500">{m.statName}</span>
                <span className="ml-1">{m.statValue}</span>
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">{m.effectiveBP}</td>
              <td className="py-0.5 px-2">
                <div className="flex items-center gap-1.5">
                  <Bar value={m.firepowerIndex} max={maxIndex} color={i === 0 ? "bg-orange-500" : "bg-orange-800"} />
                  <span className="tabular-nums w-14 text-right">
                    {m.firepowerIndex.toLocaleString()}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
