/**
 * extract-learnsets.mjs
 *
 * Extracts learnset data from Showdown's learnsets.js and outputs a compact JSON
 * mapping each Pokemon name (our format) to the set of move names (our format)
 * that it can learn.
 *
 * Only includes moves that exist in our moves.json (attacking moves we care about).
 *
 * Usage: node scripts/extract-learnsets.mjs
 * Output: home-data/storage/learnsets.json
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load our species and moves
const species = JSON.parse(readFileSync(resolve(ROOT, "src/data/species.json"), "utf8"));
const moves = JSON.parse(readFileSync(resolve(ROOT, "src/data/moves.json"), "utf8"));

// Load Showdown learnsets
const rawLearnsets = readFileSync(
  resolve(ROOT, "home-data/storage/raw-recon/30-showdown-learnsets.js"),
  "utf8",
);

// Parse the JS exports format
// Format: exports.BattleLearnsets = { pokemon: { learnset: { move: [...] } }, ... }
const learnsetData = {};
const fn = new Function("exports", rawLearnsets);
const exports = {};
fn(exports);
const battleLearnsets = exports.BattleLearnsets;

// Build move name mapping: showdown id -> our move name
const toShowdownId = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const moveIdToName = new Map();
for (const moveName of Object.keys(moves)) {
  moveIdToName.set(toShowdownId(moveName), moveName);
}

// Build species name mapping: showdown id -> our species name
const speciesIdToName = new Map();
for (const name of Object.keys(species)) {
  speciesIdToName.set(toShowdownId(name), name);
}

// Forme fallback: "Deoxys-Speed" → try "deoxys", "Palafin-Hero" → try "palafin"
function findLearnsetEntry(showdownId, ourName) {
  if (battleLearnsets[showdownId]?.learnset) return battleLearnsets[showdownId];
  // Try base forme (strip suffix after the species name)
  const baseName = ourName.split("-")[0];
  const baseId = toShowdownId(baseName);
  if (battleLearnsets[baseId]?.learnset) return battleLearnsets[baseId];
  return null;
}

// Extract learnsets for our Pokemon
const result = {};
let matched = 0;
let missing = 0;

for (const ourName of Object.keys(species)) {
  const showdownId = toShowdownId(ourName);
  const entry = findLearnsetEntry(showdownId, ourName);

  if (!entry || !entry.learnset) {
    console.warn(`  [miss] ${ourName} (${showdownId}) not found in Showdown learnsets`);
    missing++;
    continue;
  }

  const learnable = [];
  for (const moveId of Object.keys(entry.learnset)) {
    const ourMoveName = moveIdToName.get(moveId);
    if (ourMoveName) {
      learnable.push(ourMoveName);
    }
  }

  if (learnable.length > 0) {
    result[ourName] = learnable.sort();
    matched++;
  }
}

// Write output
const outPath = resolve(ROOT, "home-data/storage/learnsets.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));

console.log(`\nExtracted learnsets for ${matched} Pokemon (${missing} not found)`);
console.log(`Our moves.json has ${Object.keys(moves).length} moves`);
console.log(`Written to ${outPath}`);

// Show some samples
const samples = ["Machamp", "Pikachu", "Meganium", "Dragonite", "Kingambit", "Great Tusk"];
for (const name of samples) {
  const moves = result[name];
  if (moves) {
    console.log(`  ${name}: ${moves.length} moves → ${moves.slice(0, 8).join(", ")}...`);
  } else {
    console.log(`  ${name}: NO DATA`);
  }
}
