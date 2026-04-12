#!/usr/bin/env node
/**
 * Download all Pokemon Champions menu sprites from Bulbagarden Archives.
 * Uses MediaWiki API to enumerate files in Category:Champions_menu_sprites
 * and download them to build/sprites/pokemon/menu/
 *
 * Usage: node scripts/download-menu-sprites.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'build', 'sprites', 'pokemon', 'menu');

const API_BASE = 'https://archives.bulbagarden.net/w/api.php';
const CONCURRENCY = 8;

// Step 1: List all files in the category via MediaWiki API
async function listCategoryFiles() {
  const files = [];
  let cmcontinue = undefined;

  while (true) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:Champions_menu_sprites',
      cmtype: 'file',
      cmlimit: '500',
      format: 'json',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);

    const resp = await fetch(`${API_BASE}?${params}`);
    const data = await resp.json();

    for (const member of data.query.categorymembers) {
      files.push(member.title); // e.g. "File:Menu CP 0025.png"
    }

    if (data.continue?.cmcontinue) {
      cmcontinue = data.continue.cmcontinue;
    } else {
      break;
    }
  }

  console.log(`Found ${files.length} files in category`);
  return files;
}

// Step 2: Get direct image URLs in batches of 50
async function getImageUrls(fileTitles) {
  const urlMap = new Map(); // title -> url
  const batchSize = 50;

  for (let i = 0; i < fileTitles.length; i += batchSize) {
    const batch = fileTitles.slice(i, i + batchSize);
    const params = new URLSearchParams({
      action: 'query',
      titles: batch.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    });

    const resp = await fetch(`${API_BASE}?${params}`);
    const data = await resp.json();

    for (const page of Object.values(data.query.pages)) {
      if (page.imageinfo?.[0]?.url) {
        urlMap.set(page.title, page.imageinfo[0].url);
      }
    }

    process.stdout.write(`\rFetched URLs: ${urlMap.size}/${fileTitles.length}`);
  }
  console.log();
  return urlMap;
}

// Step 3: Parse filename to local name
// "File:Menu CP 0025.png" -> "0025.png"
// "File:Menu CP 0003-Mega.png" -> "0003-Mega.png"
function toLocalName(title) {
  // title format: "File:Menu CP XXXX.png" or "File:Menu CP XXXX-Form.png"
  const match = title.match(/^File:Menu CP (.+)$/);
  if (!match) {
    console.warn(`Unexpected title format: ${title}`);
    return null;
  }
  // Replace spaces in form names with underscores for filesystem safety
  return match[1].replace(/ /g, '_');
}

// Step 4: Download files with concurrency control
async function downloadFiles(urlMap) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = [...urlMap.entries()];
  let completed = 0;
  let failed = 0;

  async function downloadOne(title, url) {
    const localName = toLocalName(title);
    if (!localName) return;

    const outPath = path.join(OUT_DIR, localName);

    // Skip if already downloaded
    if (fs.existsSync(outPath)) {
      completed++;
      return;
    }

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(outPath, buffer);
      completed++;
    } catch (err) {
      console.error(`\nFailed: ${localName} - ${err.message}`);
      failed++;
    }

    if (completed % 10 === 0 || completed === entries.length) {
      process.stdout.write(`\rDownloaded: ${completed}/${entries.length} (${failed} failed)`);
    }
  }

  // Run with concurrency limit
  const queue = entries.map(([title, url]) => () => downloadOne(title, url));
  const running = new Set();

  for (const task of queue) {
    const p = task().then(() => running.delete(p));
    running.add(p);
    if (running.size >= CONCURRENCY) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);

  console.log(`\nDone! ${completed} downloaded, ${failed} failed.`);
}

// Step 5: Generate mapping JSON (species name -> sprite filename)
function generateMapping() {
  const speciesPath = path.join(ROOT, 'src', 'data', 'species.json');
  const species = JSON.parse(fs.readFileSync(speciesPath, 'utf-8'));

  // Read downloaded files
  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\nGenerating mapping for ${files.length} sprites...`);

  // Build dex number -> files lookup
  // e.g. "0025.png" -> { base: "0025.png" }
  // e.g. "0003-Mega.png" -> under dex 3, form "Mega"
  const dexFiles = new Map();
  for (const file of files) {
    const match = file.match(/^(\d+)(?:-(.+))?\.png$/);
    if (!match) continue;
    const dexNum = parseInt(match[1], 10);
    const form = match[2] || null;
    if (!dexFiles.has(dexNum)) dexFiles.set(dexNum, []);
    dexFiles.get(dexNum).push({ file, form });
  }

  // Map species.json keys to sprite files
  const mapping = {};

  for (const [name, data] of Object.entries(species)) {
    const dexNum = data.id;
    const entries = dexFiles.get(dexNum);
    if (!entries) continue;

    // Base form: species name without suffix
    const nameParts = name.split('-');

    if (nameParts.length === 1) {
      // Base form: look for file without form suffix
      const baseEntry = entries.find(e => e.form === null);
      if (baseEntry) {
        mapping[name] = baseEntry.file;
      }
      // Also map mega if species has mega data
      if (data.mega) {
        const megaEntry = entries.find(e => e.form === 'Mega');
        if (megaEntry) {
          mapping[`${name}-Mega`] = megaEntry.file;
        }
        // Mega X / Mega Y
        const megaX = entries.find(e => e.form === 'Mega_X');
        if (megaX) mapping[`${name}-Mega-X`] = megaX.file;
        const megaY = entries.find(e => e.form === 'Mega_Y');
        if (megaY) mapping[`${name}-Mega-Y`] = megaY.file;
      }
    } else {
      // Regional/form variant: e.g. "Raichu-Alola" -> form "Alola"
      const formSuffix = nameParts.slice(1).join('-');
      // Try matching with underscores (filesystem) and original
      const formVariants = [
        formSuffix,
        formSuffix.replace(/-/g, '_'),
        formSuffix.replace(/-/g, ' '),
      ];
      const entry = entries.find(e =>
        e.form && formVariants.some(v =>
          e.form === v || e.form?.replace(/_/g, '-') === formSuffix
        )
      );
      if (entry) {
        mapping[name] = entry.file;
      }
    }
  }

  // Save mapping
  const mapPath = path.join(OUT_DIR, 'mapping.json');
  fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2));
  console.log(`Mapping saved: ${Object.keys(mapping).length} species mapped out of ${Object.keys(species).length}`);

  // Report unmapped species
  const unmapped = Object.keys(species).filter(k => !mapping[k]);
  if (unmapped.length > 0) {
    console.log(`\nUnmapped species (${unmapped.length}):`);
    unmapped.forEach(name => {
      const id = species[name].id;
      const available = dexFiles.get(id);
      console.log(`  ${name} (id:${id}) - available: ${available ? available.map(e => e.form || 'base').join(', ') : 'none'}`);
    });
  }
}

// Main
async function main() {
  console.log('=== Pokemon Champions Menu Sprite Downloader ===\n');

  console.log('Step 1: Listing category files...');
  const files = await listCategoryFiles();

  console.log('Step 2: Getting direct image URLs...');
  const urlMap = await getImageUrls(files);

  console.log('Step 3: Downloading sprites...');
  await downloadFiles(urlMap);

  console.log('\nStep 4: Generating species mapping...');
  generateMapping();

  console.log('\n=== Complete! ===');
  console.log(`Sprites saved to: ${OUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
