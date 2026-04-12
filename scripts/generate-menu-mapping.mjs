#!/usr/bin/env node
/**
 * Generate mapping from species.json keys to menu sprite filenames.
 * Handles edge cases: hyphenated base names, -F→Female, etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MENU_DIR = path.join(ROOT, 'build', 'sprites', 'pokemon', 'menu');

const species = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'species.json'), 'utf-8'));

// Read downloaded files and parse
const files = fs.readdirSync(MENU_DIR).filter(f => f.endsWith('.png'));
const dexFiles = new Map(); // dexNum -> [{ file, form }]
for (const file of files) {
  const match = file.match(/^(\d+)(?:-(.+))?\.png$/);
  if (!match) continue;
  const dexNum = parseInt(match[1], 10);
  const form = match[2]?.replace(/_/g, ' ') || null; // restore spaces
  if (!dexFiles.has(dexNum)) dexFiles.set(dexNum, []);
  dexFiles.get(dexNum).push({ file, form });
}

// Build set of all base species names (keys with no form suffix)
const allKeys = new Set(Object.keys(species));

// For a species key, determine the base name and form suffix
// e.g. "Tauros-Paldea-Aqua" → base="Tauros", form="Paldea Aqua"
// e.g. "Kommo-o" → base="Kommo-o", form=null
function splitSpeciesKey(key) {
  // Try progressively longer base names
  const parts = key.split('-');
  for (let i = 1; i < parts.length; i++) {
    const baseName = parts.slice(0, i).join('-');
    const formSuffix = parts.slice(i).join('-');
    // Check if baseName exists as a species key (confirming it's a valid base)
    if (allKeys.has(baseName)) {
      return { baseName, formSuffix };
    }
  }
  // No split found - entire key is the base name
  return { baseName: key, formSuffix: null };
}

// Form suffix aliases (species.json suffix → sprite form name)
const FORM_ALIASES = {
  'F': 'Female',
  'Four': null, // Maushold-Four = base form (4 is default)
  'Masterpiece': null, // Sinistcha-Masterpiece = base sprite
  'Paldea Aqua': 'Paldea Aqua',
  'Paldea Blaze': 'Paldea Blaze',
  'Paldea Combat': 'Paldea Combat',
};

const mapping = {};

for (const [key, data] of Object.entries(species)) {
  const dexNum = data.id;
  const entries = dexFiles.get(dexNum);
  if (!entries) continue;

  const { baseName, formSuffix } = splitSpeciesKey(key);

  if (!formSuffix) {
    // Base form
    const baseEntry = entries.find(e => e.form === null);
    if (baseEntry) {
      mapping[key] = baseEntry.file;
    }
  } else {
    // Form variant
    const aliased = FORM_ALIASES[formSuffix] !== undefined
      ? FORM_ALIASES[formSuffix]
      : formSuffix;

    if (aliased === null) {
      // Maps to base form (e.g. Maushold-Four)
      const baseEntry = entries.find(e => e.form === null);
      if (baseEntry) mapping[key] = baseEntry.file;
    } else {
      // Try to match form name (with space/hyphen/underscore variants)
      const normalize = s => s.toLowerCase().replace(/[-_ ]/g, '');
      const target = normalize(aliased);
      const entry = entries.find(e =>
        e.form && normalize(e.form) === target
      );
      if (entry) {
        mapping[key] = entry.file;
      }
    }
  }

  // Also add mega entries if base species has mega data
  if (!formSuffix && data.mega) {
    const megaEntry = entries.find(e => e.form === 'Mega');
    if (megaEntry) mapping[`${key}-Mega`] = megaEntry.file;

    const megaX = entries.find(e => e.form === 'Mega X');
    if (megaX) mapping[`${key}-Mega-X`] = megaX.file;

    const megaY = entries.find(e => e.form === 'Mega Y');
    if (megaY) mapping[`${key}-Mega-Y`] = megaY.file;
  }
}

// Save mapping
const mapPath = path.join(MENU_DIR, 'mapping.json');
fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2));

const speciesKeys = Object.keys(species);
const mappedSpecies = speciesKeys.filter(k => mapping[k]);
const unmappedSpecies = speciesKeys.filter(k => !mapping[k]);

console.log(`Total sprites: ${files.length}`);
console.log(`Mapping entries: ${Object.keys(mapping).length} (incl. megas)`);
console.log(`Species mapped: ${mappedSpecies.length}/${speciesKeys.length}`);
console.log();

if (unmappedSpecies.length > 0) {
  console.log(`Unmapped species (${unmappedSpecies.length}):`);
  for (const name of unmappedSpecies) {
    const id = species[name].id;
    const available = dexFiles.get(id);
    if (available) {
      console.log(`  ${name} (id:${id}) - sprites: ${available.map(e => e.form || 'base').join(', ')}`);
    }
  }
  console.log();
  console.log(`Species without any sprites (${unmappedSpecies.filter(n => !dexFiles.has(species[n].id)).length}):`);
  unmappedSpecies.filter(n => !dexFiles.has(species[n].id)).forEach(n =>
    console.log(`  ${n} (id:${species[n].id})`)
  );
}
