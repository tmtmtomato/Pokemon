/**
 * import-pokechamdb.mjs
 *
 * Converts scraped pokechamdb.com TOP30 data into:
 * 1. Pikalytics-compatible JSON files at pokechamdb/singles/{Name}.json
 * 2. Nature distribution files at pokechamdb/natures/{pokemonId}.json
 *
 * Usage:
 *   node home-data/scripts/import-pokechamdb.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const STORAGE = resolve(ROOT, "home-data/storage");

// ── Nature name → index mapping (standard game order) ─────────────────────
const NATURE_NAMES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty",
  "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive",
  "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky",
];

const NATURE_TO_INDEX = new Map();
for (let i = 0; i < NATURE_NAMES.length; i++) {
  NATURE_TO_INDEX.set(NATURE_NAMES[i], i);
}

// ── Load source data ──────────────────────────────────────────────────────
// Prefer all-raw.json (full scrape), fall back to top30-raw.json (legacy)
const allRawPath = resolve(STORAGE, "pokechamdb/all-raw.json");
const top30RawPath = resolve(STORAGE, "pokechamdb/top30-raw.json");
const rawPath = existsSync(allRawPath) ? allRawPath : top30RawPath;
if (!existsSync(rawPath)) {
  console.error(`[ERROR] Raw data not found.`);
  console.error("  Run: node home-data/scripts/scrape-pokechamdb.mjs");
  process.exit(1);
}

const top30 = JSON.parse(readFileSync(rawPath, "utf-8"));
console.log(`[import-pokechamdb] Loaded ${top30.length} Pokemon from ${rawPath.split(/[\\/]/).pop()}`);

// ── Load species.json for IDs and baseStats ───────────────────────────────
const speciesJson = JSON.parse(readFileSync(resolve(ROOT, "src/data/species.json"), "utf-8"));

// ── Output directories ────────────────────────────────────────────────────
const singlesDir = resolve(STORAGE, "pokechamdb/singles");
const naturesDir = resolve(STORAGE, "pokechamdb/natures");
mkdirSync(singlesDir, { recursive: true });
mkdirSync(naturesDir, { recursive: true });

// ── Process each Pokemon ──────────────────────────────────────────────────
let pikaCount = 0;
let natureCount = 0;

for (const poke of top30) {
  const name = poke.name;
  const species = speciesJson[name];

  if (!species) {
    console.warn(`  [WARN] Species not found: ${name} — skipping`);
    continue;
  }

  // Skip entries with no move/item data (pokechamdb has no data for low-usage Pokemon)
  if ((!poke.moves || poke.moves.length === 0) && (!poke.items || poke.items.length === 0)) {
    continue;
  }

  // ── 1. Create Pikalytics-compatible JSON ──────────────────────────────

  // Convert teammates to {name, pct} array
  // all-raw.json: [{name, rank}], top30-raw.json: string[]
  const teammates = (poke.teammates || []).map((t, i) => {
    const tmName = typeof t === "string" ? t : (t.name || "");
    const tmPct = typeof t === "object" && t.pct ? t.pct : Math.round(100 - i * 15);
    return { name: tmName, pct: tmPct };
  });

  const pikaData = {
    pokemon: name,
    format: "championsSingles",
    game: "Pokemon Champions",
    dataDate: "2026-04",
    moves: (poke.moves || []).map(m => ({ name: m.name, pct: m.pct })),
    abilities: (poke.abilities || []).map(a => ({ name: a.name, pct: a.pct })),
    items: (poke.items || []).map(it => ({ name: it.name, pct: it.pct })),
    teammates,
    // Include SP spreads (pokechamdb uses 0-32 scale, same as this game)
    spreads: (poke.spreads || []).map(s => ({
      hp: s.hp, atk: s.atk, def: s.def,
      spa: s.spa, spd: s.spd, spe: s.spe,
      pct: s.pct,
    })),
    // Include baseStats for reference
    baseStats: species.baseStats,
    // Usage data from ranking
    usageRank: poke.rank,
  };

  const pikaPath = resolve(singlesDir, `${name}.json`);
  writeFileSync(pikaPath, JSON.stringify(pikaData, null, 2) + "\n", "utf-8");
  pikaCount++;

  // ── 2. Create nature distribution file ────────────────────────────────
  // Format matches raw-recon: { "id": "<natureIndex>", "val": "<pct>" }
  // stored as array inside a wrapper keyed by species id and form
  const natures = (poke.natures || [])
    .filter(n => NATURE_TO_INDEX.has(n.name))
    .map(n => ({
      id: String(NATURE_TO_INDEX.get(n.name)),
      val: String(n.pct),
    }));

  // Use species ID as filename (unique enough since forms share IDs
  // but we handle that in the loader by using name as key)
  // For pokechamdb natures we use a simpler format: keyed by pokemon name
  const natureData = {
    pokemon: name,
    speciesId: species.id,
    natures,
  };

  const naturePath = resolve(naturesDir, `${name}.json`);
  writeFileSync(naturePath, JSON.stringify(natureData, null, 2) + "\n", "utf-8");
  natureCount++;

  console.log(`  ${name} (rank ${poke.rank}): ${poke.moves?.length || 0} moves, ${poke.items?.length || 0} items, ${natures.length} natures`);
}

console.log(`\n[import-pokechamdb] Done!`);
console.log(`  Pikalytics files: ${pikaCount} → ${singlesDir}/`);
console.log(`  Nature files: ${natureCount} → ${naturesDir}/`);
