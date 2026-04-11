#!/usr/bin/env node
/**
 * build-items-ja.mjs — Item JP name dictionary builder.
 *
 * Reads:
 *   - home-data/storage/raw-recon/30-showdown-items.js      (English name → national item ID)
 *   - home-data/storage/raw-recon/11-itemname_ja.json       (national ID → JP item name)
 *   - home-data/i18n/items-ja-overrides.json                (manual overrides for Champions mega stones etc.)
 *
 * Writes:
 *   - home-data/storage/i18n/items-ja.json
 *     A flat map: { "Leftovers": "たべのこし", "Choice Band": "こだわりハチマキ", ... }
 *
 * Usage:
 *   node home-data/i18n/build-items-ja.mjs
 *   node home-data/i18n/build-items-ja.mjs --check   # also reports unresolved viewer item names
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SHOWDOWN_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/30-showdown-items.js",
);
const HOME_ITEMS_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/raw-recon/11-itemname_ja.json",
);
const OVERRIDES_PATH = resolve(__dirname, "items-ja-overrides.json");
const META_PATH = resolve(
  REPO_ROOT,
  "home-data/storage/analysis/2026-04-08-meta.json",
);
const OUT_DIR = resolve(REPO_ROOT, "home-data/storage/i18n");
const OUT_PATH = resolve(OUT_DIR, "items-ja.json");

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadShowdownItems() {
  const text = readFileSync(SHOWDOWN_PATH, "utf8");
  const exportsObj = {};
  const fn = new Function("exports", text);
  fn(exportsObj);
  if (!exportsObj.BattleItems) {
    throw new Error("BattleItems not found in Showdown items.js");
  }
  return exportsObj.BattleItems;
}

function loadHomeItems() {
  const data = JSON.parse(readFileSync(HOME_ITEMS_PATH, "utf8"));
  return data.itemname ?? {};
}

function loadOverrides() {
  const obj = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  delete obj._comment;
  return obj;
}

function loadMetaItemNames() {
  const meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  const names = new Set();
  for (const f of meta.formats) {
    for (const p of f.pokemon) {
      for (const r of p.items ?? []) names.add(r.name);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildDictionary({ showdownItems, homeItems, overrides }) {
  const out = {};
  const stats = { mapped: 0, override: 0, missingHome: 0, skipped: 0 };

  for (const entry of Object.values(showdownItems)) {
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
    const ja = homeItems[String(num)];
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

  const showdownItems = loadShowdownItems();
  const homeItems = loadHomeItems();
  const overrides = loadOverrides();

  console.log(
    `[i18n] Showdown items entries: ${Object.keys(showdownItems).length}`,
  );
  console.log(
    `[i18n] HOME itemname entries:  ${Object.keys(homeItems).length}`,
  );
  console.log(
    `[i18n] manual overrides:       ${Object.keys(overrides).length}`,
  );

  const { dict, stats } = buildDictionary({ showdownItems, homeItems, overrides });

  console.log(`[i18n] dictionary size:        ${Object.keys(dict).length}`);
  console.log(`[i18n]   mapped via HOME:      ${stats.mapped}`);
  console.log(`[i18n]   manual override:      ${stats.override}`);
  console.log(`[i18n]   missing HOME entry:   ${stats.missingHome}`);
  console.log(`[i18n]   skipped (nonstandard):${stats.skipped}`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(dict, null, 2) + "\n", "utf8");
  console.log(`[i18n] wrote ${OUT_PATH}`);

  if (wantCheck) {
    const viewerItems = loadMetaItemNames();
    const missing = viewerItems.filter((n) => !dict[n]);
    console.log(
      `\n[i18n] check: viewer uses ${viewerItems.length} unique item names`,
    );
    if (missing.length === 0) {
      console.log("[i18n] check: all viewer items resolved ✓");
    } else {
      console.log(`[i18n] check: ${missing.length} viewer items UNRESOLVED:`);
      for (const m of missing) console.log("  -", m);
    }
  }
}

main();
