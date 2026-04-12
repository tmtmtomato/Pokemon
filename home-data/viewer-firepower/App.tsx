/**
 * Root component for the Champions Firepower Ranking Viewer.
 *
 * The ranking JSON is imported statically so Vite bakes it into the
 * bundle that `viteSingleFile()` then inlines into build/firepower.html.
 */

import { useEffect, useMemo, useState } from "react";
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
interface RankingEntry {
  rank: number;
  pokemon: string;
  types: string[];
  ability: string;
  isMega: boolean;
  item: string;
  statName: string;
  statValue: number;
  statBase: number;
  move: string;
  moveType: string;
  moveBasePower: number;
  moveCategory: string;
  effectiveBP: number;
  isStab: boolean;
  hasRecoil: boolean;
  ateConvert: boolean;
  firepowerIndex: number;
}

interface RankingData {
  generatedAt: string;
  description: string;
  formula: string;
  assumptions: {
    sp: number;
    nature: string;
    itemMega: string;
    itemNonMega: string;
    itemGuts: string;
  };
  poolSize: number;
  ranking: RankingEntry[];
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

// ===== Category badge =====
function CatBadge({ cat }: { cat: string }) {
  const cls = cat === "Physical"
    ? "bg-red-900/60 text-red-300"
    : "bg-blue-900/60 text-blue-300";
  const label = cat === "Physical" ? "物理" : "特殊";
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

// ===== Bar component =====
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full bg-gray-800 rounded h-4 overflow-hidden">
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

  const maxIndex = DATA.ranking[0]?.firepowerIndex ?? 1;

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
      result = result.filter((r) => r.moveCategory === catFilter);
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">
            {lang === "ja" ? "火力指数ランキング" : "Firepower Index Ranking"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {lang === "ja"
              ? `${DATA.poolSize}体 | ${DATA.formula} | SP=32, 有利性格, いのちのたま(非メガ)`
              : `${DATA.poolSize} Pokemon | ${DATA.formula} | SP=32, +nature, Life Orb(non-mega)`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleLang}
            className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600"
          >
            {lang === "ja" ? "EN" : "JA"}
          </button>
          <button
            onClick={() => setDark(!dark)}
            className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600"
          >
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
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
        >
          <option value="all">{lang === "ja" ? "全タイプ" : "All Types"}</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>{localizeType(t, lang)}</option>
          ))}
        </select>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
        >
          <option value="all">{lang === "ja" ? "物理/特殊" : "Phys/Spec"}</option>
          <option value="Physical">{lang === "ja" ? "物理" : "Physical"}</option>
          <option value="Special">{lang === "ja" ? "特殊" : "Special"}</option>
        </select>
        <select
          value={megaFilter}
          onChange={(e) => setMegaFilter(e.target.value)}
          className="px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
        >
          <option value="all">{lang === "ja" ? "全形態" : "All Forms"}</option>
          <option value="mega">{lang === "ja" ? "メガのみ" : "Mega Only"}</option>
          <option value="normal">{lang === "ja" ? "非メガのみ" : "Non-Mega Only"}</option>
        </select>
        <span className="text-sm text-gray-400 self-center">
          {filtered.length} / {DATA.ranking.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-left text-gray-400">
              <th className="py-2 px-2 w-12">#</th>
              <th className="py-2 px-2">{lang === "ja" ? "ポケモン" : "Pokemon"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "タイプ" : "Type"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "特性" : "Ability"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "持ち物" : "Item"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "実数値" : "Stat"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "技" : "Move"}</th>
              <th className="py-2 px-2">{lang === "ja" ? "実効威力" : "Eff.BP"}</th>
              <th className="py-2 px-2 w-64">{lang === "ja" ? "火力指数" : "Index"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={`${r.pokemon}-${r.isMega}`}
                className="border-b border-gray-800 hover:bg-gray-900/50"
              >
                <td className="py-1 px-2 text-gray-500">{r.rank}</td>
                <td className="py-1 px-2 font-medium whitespace-nowrap">
                  {localizePokemon(r.pokemon, lang)}
                  {r.isMega && (
                    <span className="ml-1 text-xs text-purple-400 font-normal">MEGA</span>
                  )}
                </td>
                <td className="py-1 px-2 whitespace-nowrap">
                  <span className="inline-flex gap-1">
                    {r.types.map((t) => <TypeBadge key={t} type={t} lang={lang} />)}
                  </span>
                </td>
                <td className="py-1 px-2 text-gray-300 whitespace-nowrap">
                  {localizeAbility(r.ability, lang)}
                </td>
                <td className="py-1 px-2 text-gray-300 whitespace-nowrap">
                  {r.isMega ? "-" : localizeItem(r.item, lang)}
                </td>
                <td className="py-1 px-2 whitespace-nowrap">
                  <span className="text-gray-400 text-xs">{r.statName}</span>
                  <span className="ml-1">{r.statValue}</span>
                </td>
                <td className="py-1 px-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <span>
                      {localizeMove(r.move, lang)}
                      {r.hasRecoil && <span className="text-red-400" title="反動技">*</span>}
                      {r.ateConvert && <span className="text-purple-400" title="-ate変換">†</span>}
                    </span>
                    <CatBadge cat={r.moveCategory} />
                    <TypeBadge type={r.moveType} lang={lang} />
                  </span>
                </td>
                <td className="py-1 px-2 text-right tabular-nums">{r.effectiveBP}</td>
                <td className="py-1 px-2">
                  <div className="flex items-center gap-2">
                    <Bar value={r.firepowerIndex} max={maxIndex} color="bg-orange-500" />
                    <span className="text-xs tabular-nums w-16 text-right">
                      {r.firepowerIndex.toLocaleString()}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>* = {lang === "ja" ? "反動技" : "Recoil move"} | † = {lang === "ja" ? "-ate変換技 (ノーマル→別タイプ)" : "-ate converted (Normal→other type)"}</p>
        <p>{lang === "ja" ? "メガシンカはメガストーン固定 (アイテム補正なし) / 非メガはいのちのたま (~1.3x)" : "Mega: fixed Mega Stone (no item mod) / Non-mega: Life Orb (~1.3x)"}</p>
        <p>{lang === "ja" ? "根性持ちはかえんだま (1.5x Atk + Facade 2x) と比較し高い方を採用" : "Guts users: compared with Flame Orb (1.5x Atk + Facade 2x), best picked"}</p>
      </div>
    </div>
  );
}
