#!/usr/bin/env node
/**
 * build-abilities-ja.mjs — Ability JP name dictionary builder.
 *
 * Reads:
 *   - home-data/storage/raw-recon/30-showdown-abilities.js  (English name → national ability ID)
 *   - home-data/storage/raw-recon/10-dex-ja.json            (national ID → JP ability name, under `tokusei`)
 *   - home-data/i18n/abilities-ja-overrides.json            (manual overrides for Champions-specific abilities)
 *
 * Writes:
 *   - home-data/storage/i18n/abilities-ja.json
 *     A flat map: { "Intimidate": "いかく", "Protosynthesis": "こだいかっせい", ... }
 *
 * Usage:
 *   node home-data/i18n/build-abilities-ja.mjs
 *   node home-data/i18n/build-abilities-ja.mjs --check   # also reports unresolved viewer ability names
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SHOWDOWN_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/30-showdown-abilities.js",
);
const HOME_DEX_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/10-dex-ja.json",
);
const OVERRIDES_PATH = resolve(__dirname, "abilities-ja-overrides.json");
const META_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/analysis/2026-04-08-meta.json",
);
const OUT_DIR = resolve(REPO_ROOT, "home-data/storage/i18n");
const OUT_PATH = resolve(OUT_DIR, "abilities-ja.json");

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadShowdownAbilities() {
  const text = readFileSync(SHOWDOWN_PATH, "utf8");
  const exportsObj = {};
  const fn = new Function("exports", text);
  fn(exportsObj);
  if (!exportsObj.BattleAbilities) {
    throw new Error("BattleAbilities not found in Showdown abilities.js");
  }
  return exportsObj.BattleAbilities;
}

function loadHomeDex() {
  return JSON.parse(readFileSync(HOME_DEX_PATH, "utf8"));
}

function loadOverrides() {
  const obj = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  delete obj._comment;
  return obj;
}

function loadMetaAbilityNames() {
  const meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  const names = new Set();
  for (const f of meta.formats) {
    for (const p of f.pokemon) {
      for (const r of p.abilities ?? []) names.add(r.name);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildDictionary({ showdownAbilities, homeDex, overrides }) {
  const out = {};
  const stats = { mapped: 0, override: 0, missingHome: 0, skipped: 0 };
  const tokuseiJa = homeDex.tokusei ?? {};

  for (const entry of Object.values(showdownAbilities)) {
    if (!entry?.name) continue;
    const name = entry.name;

    if (entry.isNonstandard && entry.isNonstandard !== "Past") {
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
    const ja = tokuseiJa[String(num)];
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

  const showdownAbilities = loadShowdownAbilities();
  const homeDex = loadHomeDex();
  const overrides = loadOverrides();

  console.log(
    `[i18n] Showdown abilities entries: ${Object.keys(showdownAbilities).length}`,
  );
  console.log(
    `[i18n] HOME tokusei entries:       ${Object.keys(homeDex.tokusei ?? {}).length}`,
  );
  console.log(
    `[i18n] manual overrides:           ${Object.keys(overrides).length}`,
  );

  const { dict, stats } = buildDictionary({
    showdownAbilities,
    homeDex,
    overrides,
  });

  console.log(`[i18n] dictionary size:            ${Object.keys(dict).length}`);
  console.log(`[i18n]   mapped via HOME:          ${stats.mapped}`);
  console.log(`[i18n]   manual override:          ${stats.override}`);
  console.log(`[i18n]   missing HOME entry:       ${stats.missingHome}`);
  console.log(`[i18n]   skipped (nonstandard):    ${stats.skipped}`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(dict, null, 2) + "\n", "utf8");
  console.log(`[i18n] wrote ${OUT_PATH}`);

  if (wantCheck) {
    const viewerAbilities = loadMetaAbilityNames();
    const missing = viewerAbilities.filter((n) => !dict[n]);
    console.log(
      `\n[i18n] check: viewer uses ${viewerAbilities.length} unique ability names`,
    );
    if (missing.length === 0) {
      console.log("[i18n] check: all viewer abilities resolved ✓");
    } else {
      console.log(
        `[i18n] check: ${missing.length} viewer abilities UNRESOLVED:`,
      );
      for (const m of missing) console.log("  -", m);
    }
  }
}

main();
