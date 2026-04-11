#!/usr/bin/env node
/**
 * build-pokemon-ja.mjs — Pokemon JP name dictionary builder.
 *
 * Reads:
 *   - home-data/storage/raw-recon/30-showdown-pokedex.js  (English name → national ID + forme)
 *   - home-data/storage/raw-recon/10-dex-ja.json          (national ID → JP base name)
 *   - home-data/i18n/pokemon-ja-overrides.json            (manual overrides for tricky forms)
 *
 * Writes:
 *   - home-data/storage/i18n/pokemon-ja.json
 *     A flat map: { "Incineroar": "ガオガエン", "Rotom-Wash": "ウォッシュロトム", ... }
 *
 * The output covers every Showdown pokedex entry (~1000+ species and forms),
 * not just the ones currently used by the viewer, so the same dictionary can
 * be reused for future formats / data sources.
 *
 * Usage:
 *   node home-data/i18n/build-pokemon-ja.mjs
 *   node home-data/i18n/build-pokemon-ja.mjs --check   # also reports unresolved viewer names
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SHOWDOWN_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/30-showdown-pokedex.js",
);
const HOME_DEX_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/10-dex-ja.json",
);
const OVERRIDES_PATH = resolve(__dirname, "pokemon-ja-overrides.json");
const META_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/analysis/2026-04-08-meta.json",
);
const OUT_DIR = resolve(REPO_ROOT, "home-data/storage/i18n");
const OUT_PATH = resolve(OUT_DIR, "pokemon-ja.json");

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadShowdownDex() {
  const text = readFileSync(SHOWDOWN_PATH, "utf8");
  // The file looks like:
  //   exports.BattlePokedex = { bulbasaur: {...}, ... };
  // Wrap it so we can require it as a module-style snippet.
  const exportsObj = {};
  const fn = new Function("exports", text);
  fn(exportsObj);
  if (!exportsObj.BattlePokedex) {
    throw new Error("BattlePokedex not found in Showdown pokedex.js");
  }
  return exportsObj.BattlePokedex;
}

function loadHomeDex() {
  return JSON.parse(readFileSync(HOME_DEX_PATH, "utf8"));
}

function loadOverrides() {
  const obj = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  delete obj._comment;
  return obj;
}

function loadMetaNames() {
  const meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  const names = new Set();
  for (const f of meta.formats) {
    for (const p of f.pokemon) {
      names.add(p.name);
      for (const t of p.teammates ?? []) names.add(t.name);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Form name resolution rules
// ---------------------------------------------------------------------------

/**
 * Map of Showdown `forme` value → JP name builder function.
 * Each rule receives the JP base name and returns the JP form name.
 * Returning `null` falls through to the generic fallback.
 */
const FORM_RULES = {
  // Mega evolutions
  Mega: (b) => `メガ${b}`,
  "Mega-X": (b) => `メガ${b}Ｘ`,
  "Mega-Y": (b) => `メガ${b}Ｙ`,
  Primal: (b) => `ゲンシ${b}`,

  // Regional variants
  Hisui: (b) => `ヒスイ${b}`,
  Alola: (b) => `アローラ${b}`,
  Galar: (b) => `ガラル${b}`,
  Paldea: (b) => `パルデア${b}`,

  // Forme tags
  Origin: (b) => `オリジン${b}`,
  Therian: (b) => `${b}(れいじゅう)`,
  Incarnate: (b) => `${b}(けしん)`,
  Sky: (b) => `${b}(スカイ)`,
  Land: (b) => `${b}(ランド)`,
  Attack: (b) => `${b}(アタック)`,
  Defense: (b) => `${b}(ディフェンス)`,
  Speed: (b) => `${b}(スピード)`,
  Sandy: (b) => `${b}(すなち)`,
  Trash: (b) => `${b}(ゴミ)`,
  Plant: (b) => `${b}(くさき)`,

  // Rotom appliance forms
  Wash: (b) => `ウォッシュ${b}`,
  Heat: (b) => `ヒート${b}`,
  Frost: (b) => `フロスト${b}`,
  Mow: (b) => `カット${b}`,
  Fan: (b) => `スピン${b}`,

  // Misc
  Eternal: (b) => `${b}(えいえん)`,
  Crowned: (b) => `${b}(けんおう)`,
  Hangry: (b) => `${b}(はらぺこ)`,
  "Full-Belly": (b) => `${b}(まんぷく)`,
  Busted: (b) => `${b}(ばれた)`,
  Disguised: (b) => b,
  School: (b) => `${b}(むれた)`,
  Solo: (b) => `${b}(たんどく)`,
  Midday: (b) => `${b}(まひる)`,
  Midnight: (b) => `${b}(まよなか)`,
  Dusk: (b) => `${b}(たそがれ)`,
  Dawn: (b) => `${b}(あかつき)`,
  Resolute: (b) => `${b}(かくご)`,
  Pirouette: (b) => `${b}(ステップ)`,
  Aria: (b) => `${b}(ボイス)`,
  "Aria-Step": (b) => `${b}(ステップ)`,
  Unbound: (b) => `ときはな${b}`,
  Confined: (b) => `いましめ${b}`,
  "10": (b) => `${b}(10%)`,
  "10%": (b) => `${b}(10%)`,
  Complete: (b) => `${b}(パーフェクト)`,
  "50": (b) => `${b}(50%)`,
  "50%": (b) => `${b}(50%)`,
};

/**
 * Heuristic fallback for forms not in FORM_RULES: append the forme name in
 * parentheses to make the name still recognisable.
 */
function genericFormFallback(baseJa, forme) {
  if (!forme) return baseJa;
  return `${baseJa}(${forme})`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildDictionary({ showdownDex, homeDex, overrides }) {
  const out = {};
  const stats = {
    base: 0,
    rule: 0,
    fallback: 0,
    override: 0,
    missingHomeBase: 0,
  };

  // Pre-pass: Showdown forme entries omit `num`, so build a base
  // species → num lookup so forms can resolve to a national ID via
  // their `baseSpecies` reference.
  const numByBase = new Map();
  for (const entry of Object.values(showdownDex)) {
    if (
      entry?.name &&
      typeof entry.num === "number" &&
      entry.num > 0 &&
      !entry.forme
    ) {
      numByBase.set(entry.name, entry.num);
    }
  }

  function resolveNum(entry) {
    if (typeof entry.num === "number" && entry.num > 0) return entry.num;
    if (entry.baseSpecies && numByBase.has(entry.baseSpecies)) {
      return numByBase.get(entry.baseSpecies);
    }
    return null;
  }

  for (const entry of Object.values(showdownDex)) {
    const { name, forme } = entry;
    if (!name) continue;
    const num = resolveNum(entry);
    if (num === null) continue;

    // Manual override wins over everything.
    if (overrides[name]) {
      out[name] = overrides[name];
      stats.override++;
      continue;
    }

    const baseJa = homeDex.poke[String(num)];
    if (!baseJa) {
      stats.missingHomeBase++;
      continue;
    }

    if (!forme) {
      out[name] = baseJa;
      stats.base++;
      continue;
    }

    const rule = FORM_RULES[forme];
    if (rule) {
      out[name] = rule(baseJa);
      stats.rule++;
    } else {
      out[name] = genericFormFallback(baseJa, forme);
      stats.fallback++;
    }
  }

  // Final pass: copy any override entry whose key isn't a Showdown name.
  // This handles parser artifacts (e.g. "Kommo", "Greninja-*") that we
  // still want translated even though no canonical Showdown entry exists.
  for (const [name, ja] of Object.entries(overrides)) {
    if (!out[name]) {
      out[name] = ja;
      stats.override++;
    }
  }

  return { dict: out, stats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const wantCheck = args.includes("--check");

  const showdownDex = loadShowdownDex();
  const homeDex = loadHomeDex();
  const overrides = loadOverrides();

  console.log(`[i18n] Showdown pokedex entries: ${Object.keys(showdownDex).length}`);
  console.log(`[i18n] HOME poke entries:        ${Object.keys(homeDex.poke).length}`);
  console.log(`[i18n] manual overrides:         ${Object.keys(overrides).length}`);

  const { dict, stats } = buildDictionary({ showdownDex, homeDex, overrides });

  console.log(`[i18n] dictionary size:          ${Object.keys(dict).length}`);
  console.log(`[i18n]   base species mapped:    ${stats.base}`);
  console.log(`[i18n]   form rule applied:     ${stats.rule}`);
  console.log(`[i18n]   generic fallback:      ${stats.fallback}`);
  console.log(`[i18n]   manual override:       ${stats.override}`);
  console.log(`[i18n]   missing HOME base:     ${stats.missingHomeBase}`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(dict, null, 2) + "\n", "utf8");
  console.log(`[i18n] wrote ${OUT_PATH}`);

  if (wantCheck) {
    const viewerNames = loadMetaNames();
    const missing = viewerNames.filter((n) => !dict[n]);
    console.log(`\n[i18n] check: viewer uses ${viewerNames.length} unique names`);
    if (missing.length === 0) {
      console.log("[i18n] check: all viewer names resolved ✓");
    } else {
      console.log(`[i18n] check: ${missing.length} viewer names UNRESOLVED:`);
      for (const m of missing) console.log("  -", m);
    }
  }
}

main();
