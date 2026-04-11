#!/usr/bin/env node
/**
 * Comprehensive sprite downloader for Pokemon Champions Calc
 *
 * Downloads from PokeAPI GitHub + Pokemon Showdown:
 *   - Pokemon official artwork (475x475) — all 1025 base + forms
 *   - Pokemon front sprites (96x96) — all, normal + shiny
 *   - Item sprites (30x30) — all ~905
 *   - Type icons (32x14) — 19 types from Showdown
 *   - Category icons — Physical/Special/Status from Showdown
 *
 * Usage: node scripts/download-sprites.mjs [--force]
 *   --force: re-download existing files
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public', 'sprites');
const FORCE = process.argv.includes('--force');
const BATCH = 20;

// GitHub raw base for PokeAPI sprites
const GH = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
// Showdown sprites
const SD = 'https://play.pokemonshowdown.com/sprites';

// ── Helpers ──────────────────────────────────────────────

async function download(urlOrUrls, outPath) {
  if (!FORCE && existsSync(outPath)) return 'skip';
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    } catch {
      continue;
    }
  }
  return 'fail';
}

async function batchDownload(tasks, label) {
  const stats = { ok: 0, skip: 0, fail: 0 };
  console.log(`\n📦 ${label} (${tasks.length} files)`);

  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(t => download(t.url, t.out))
    );
    for (const r of results) stats[r]++;

    const done = Math.min(i + BATCH, tasks.length);
    if (done % 100 === 0 || done === tasks.length) {
      console.log(`  ${done}/${tasks.length} — DL:${stats.ok} Skip:${stats.skip} Fail:${stats.fail}`);
    }
  }

  console.log(`  ✓ Done: ${stats.ok} new, ${stats.skip} cached, ${stats.fail} failed`);
  return stats;
}

// ── Directory setup ──────────────────────────────────────

const dirs = [
  'pokemon/artwork',
  'pokemon/artwork-shiny',
  'pokemon/front',
  'pokemon/front-shiny',
  'items',
  'types',
  'categories',
];
for (const d of dirs) mkdirSync(join(PUBLIC, d), { recursive: true });

// ── 1. Pokemon IDs ───────────────────────────────────────

// Base forms: 1-1025, Alternate forms: 10001-10277
const BASE_MAX = 1025;
const FORM_MIN = 10001;
const FORM_MAX = 10277;

const pokemonIds = [];
for (let id = 1; id <= BASE_MAX; id++) pokemonIds.push(id);
for (let id = FORM_MIN; id <= FORM_MAX; id++) pokemonIds.push(id);

// ── 2. Pokemon artwork (official-artwork) ────────────────

const artworkTasks = pokemonIds.map(id => ({
  url: `${GH}/pokemon/other/official-artwork/${id}.png`,
  out: join(PUBLIC, 'pokemon', 'artwork', `${id}.png`),
}));

const artworkShinyTasks = pokemonIds.map(id => ({
  url: `${GH}/pokemon/other/official-artwork/shiny/${id}.png`,
  out: join(PUBLIC, 'pokemon', 'artwork-shiny', `${id}.png`),
}));

// ── 3. Pokemon front sprites ─────────────────────────────

const frontTasks = pokemonIds.map(id => ({
  url: `${GH}/pokemon/${id}.png`,
  out: join(PUBLIC, 'pokemon', 'front', `${id}.png`),
}));

const frontShinyTasks = pokemonIds.map(id => ({
  url: `${GH}/pokemon/shiny/${id}.png`,
  out: join(PUBLIC, 'pokemon', 'front-shiny', `${id}.png`),
}));

// ── 4. Items ─────────────────────────────────────────────

// Fetch item list from PokeAPI to get all names
console.log('Fetching item list from PokeAPI...');
const itemNames = [];
let itemUrl = 'https://pokeapi.co/api/v2/item?limit=2000';
const itemRes = await fetch(itemUrl);
if (itemRes.ok) {
  const data = await itemRes.json();
  for (const item of data.results) {
    itemNames.push(item.name);
  }
}
console.log(`Found ${itemNames.length} items`);

// Try main dir first, then gen9, gen8 as fallbacks for newer items
const itemTasks = itemNames.map(name => ({
  url: [
    `${GH}/items/${name}.png`,
    `${GH}/items/gen9/${name}.png`,
    `${GH}/items/gen8/${name}.png`,
  ],
  out: join(PUBLIC, 'items', `${name}.png`),
}));

// ── 5. Type icons (from Showdown) ────────────────────────

const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy', 'Stellar',
];

const typeTasks = TYPES.map(t => ({
  url: `${SD}/types/${t}.png`,
  out: join(PUBLIC, 'types', `${t}.png`),
}));

// ── 6. Category icons (from Showdown) ────────────────────

const CATEGORIES = ['Physical', 'Special', 'Status'];
const catTasks = CATEGORIES.map(c => ({
  url: `${SD}/categories/${c}.png`,
  out: join(PUBLIC, 'categories', `${c}.png`),
}));

// ── Execute ──────────────────────────────────────────────

console.log(`\n=== Pokemon Champions Sprite Downloader ===`);
console.log(`Target: ${PUBLIC}`);
console.log(`Pokemon IDs: ${pokemonIds.length} (1-${BASE_MAX} + ${FORM_MIN}-${FORM_MAX})`);
console.log(`Items: ${itemNames.length}`);
console.log(`Force re-download: ${FORCE}\n`);

const totals = { ok: 0, skip: 0, fail: 0 };

function addStats(s) {
  totals.ok += s.ok;
  totals.skip += s.skip;
  totals.fail += s.fail;
}

addStats(await batchDownload(typeTasks, 'Type Icons'));
addStats(await batchDownload(catTasks, 'Category Icons'));
addStats(await batchDownload(artworkTasks, 'Pokemon Artwork'));
addStats(await batchDownload(artworkShinyTasks, 'Pokemon Artwork (Shiny)'));
addStats(await batchDownload(frontTasks, 'Pokemon Front Sprites'));
addStats(await batchDownload(frontShinyTasks, 'Pokemon Front Sprites (Shiny)'));
addStats(await batchDownload(itemTasks, 'Item Sprites'));

console.log(`\n=== TOTAL ===`);
console.log(`Downloaded: ${totals.ok}`);
console.log(`Cached: ${totals.skip}`);
console.log(`Failed: ${totals.fail}`);
console.log(`\nSprites saved to: ${PUBLIC}`);

// ── Generate manifest ────────────────────────────────────

// Write a manifest of what was downloaded for quick reference
const manifest = {
  generatedAt: new Date().toISOString(),
  pokemonIds: { base: [1, BASE_MAX], forms: [FORM_MIN, FORM_MAX] },
  categories: dirs,
  types: TYPES,
  moveCategories: CATEGORIES,
  itemCount: itemNames.length,
  totals,
};
writeFileSync(join(PUBLIC, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Manifest written to sprites/manifest.json');
