#!/usr/bin/env node
/**
 * build-moves-ja.mjs — Move JP name dictionary builder.
 *
 * Reads:
 *   - home-data/storage/raw-recon/30-showdown-moves.js  (English name → national move ID)
 *   - home-data/storage/raw-recon/10-dex-ja.json        (national ID → JP move name, under `waza`)
 *   - home-data/i18n/moves-ja-overrides.json            (manual overrides for missing/renamed moves)
 *
 * Writes:
 *   - home-data/storage/i18n/moves-ja.json
 *     A flat map: { "Earthquake": "じしん", "Close Combat": "インファイト", ... }
 *
 * The output covers every Showdown movedex entry (~900+ moves), not just the
 * ones currently used by the viewer, so the same dictionary can be reused
 * for future formats / data sources.
 *
 * Usage:
 *   node home-data/i18n/build-moves-ja.mjs
 *   node home-data/i18n/build-moves-ja.mjs --check   # also reports unresolved viewer move names
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SHOWDOWN_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/30-showdown-moves.js",
);
const HOME_DEX_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/10-dex-ja.json",
);
const OVERRIDES_PATH = resolve(__dirname, "moves-ja-overrides.json");
const META_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/analysis/2026-04-08-meta.json",
);
const OUT_DIR = resolve(REPO_ROOT, "home-data/storage/i18n");
const OUT_PATH = resolve(OUT_DIR, "moves-ja.json");

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadShowdownMoves() {
  const text = readFileSync(SHOWDOWN_PATH, "utf8");
  // The file looks like: exports.BattleMovedex = { absorb: {...}, ... };
  const exportsObj = {};
  const fn = new Function("exports", text);
  fn(exportsObj);
  if (!exportsObj.BattleMovedex) {
    throw new Error("BattleMovedex not found in Showdown moves.js");
  }
  return exportsObj.BattleMovedex;
}

function loadHomeDex() {
  return JSON.parse(readFileSync(HOME_DEX_PATH, "utf8"));
}

function loadOverrides() {
  const obj = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  delete obj._comment;
  return obj;
}

function loadMetaMoveNames() {
  const meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  const names = new Set();
  for (const f of meta.formats) {
    for (const p of f.pokemon) {
      for (const r of p.moves ?? []) names.add(r.name);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildDictionary({ showdownMoves, homeDex, overrides }) {
  const out = {};
  const stats = { mapped: 0, override: 0, missingHome: 0, skipped: 0 };
  const wazaJa = homeDex.waza ?? {};

  for (const entry of Object.values(showdownMoves)) {
    if (!entry?.name) continue;
    const name = entry.name;

    // Skip Z-moves and other non-standard moves we'd never see in the meta.
    if (entry.isNonstandard && entry.isNonstandard !== "Past") {
      stats.skipped++;
      continue;
    }
    if (entry.isZ || entry.isMax) {
      stats.skipped++;
      continue;
    }

    if (overrides[name]) {
      out[name] = overrides[name];
      stats.override++;
      continue;
    }

    const num = entry.num;
    if (typeof num !== "number" || num <= 0) {
      stats.skipped++;
      continue;
    }
    const ja = wazaJa[String(num)];
    if (!ja) {
      stats.missingHome++;
      continue;
    }
    out[name] = ja;
    stats.mapped++;
  }

  // Final pass: copy any override entry whose key wasn't in Showdown.
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

  const showdownMoves = loadShowdownMoves();
  const homeDex = loadHomeDex();
  const overrides = loadOverrides();

  console.log(`[i18n] Showdown movedex entries: ${Object.keys(showdownMoves).length}`);
  console.log(`[i18n] HOME waza entries:        ${Object.keys(homeDex.waza ?? {}).length}`);
  console.log(`[i18n] manual overrides:         ${Object.keys(overrides).length}`);

  const { dict, stats } = buildDictionary({ showdownMoves, homeDex, overrides });

  console.log(`[i18n] dictionary size:          ${Object.keys(dict).length}`);
  console.log(`[i18n]   mapped via HOME:        ${stats.mapped}`);
  console.log(`[i18n]   manual override:        ${stats.override}`);
  console.log(`[i18n]   missing HOME entry:     ${stats.missingHome}`);
  console.log(`[i18n]   skipped (Z/Max/etc):    ${stats.skipped}`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(dict, null, 2) + "\n", "utf8");
  console.log(`[i18n] wrote ${OUT_PATH}`);

  if (wantCheck) {
    const viewerMoves = loadMetaMoveNames();
    const missing = viewerMoves.filter((n) => !dict[n]);
    console.log(`\n[i18n] check: viewer uses ${viewerMoves.length} unique move names`);
    if (missing.length === 0) {
      console.log("[i18n] check: all viewer moves resolved ✓");
    } else {
      console.log(`[i18n] check: ${missing.length} viewer moves UNRESOLVED:`);
      for (const m of missing) console.log("  -", m);
    }
  }
}

main();
