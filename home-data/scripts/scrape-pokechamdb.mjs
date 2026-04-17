#!/usr/bin/env node
/**
 * scrape-pokechamdb.mjs
 *
 * Scrapes pokechamdb.com for ALL singles Pokemon data (moves, items, natures, abilities, spreads).
 * Outputs: home-data/storage/pokechamdb/all-raw.json
 *
 * Usage:
 *   node home-data/scripts/scrape-pokechamdb.mjs [--season M-1] [--limit 50]
 *
 * The script:
 *   1. Fetches the ranking page to get all Pokemon slugs
 *   2. Fetches each Pokemon detail page and extracts embedded Next.js JSON data
 *   3. Translates JA names to EN using i18n files
 *   4. Writes all-raw.json (same format as top30-raw.json but with all Pokemon)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const STORAGE = resolve(ROOT, "home-data/storage");

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}
const SEASON = getArg("season", "M-1");
const LIMIT = parseInt(getArg("limit", "999"), 10);
const CONCURRENCY = parseInt(getArg("concurrency", "5"), 10);
const DELAY_MS = parseInt(getArg("delay", "300"), 10);

// ── Load i18n reverse maps (JA → EN) ───────────────────────────────────────
function loadReverseMap(file) {
  const data = JSON.parse(readFileSync(resolve(STORAGE, `i18n/${file}`), "utf-8"));
  const rev = {};
  // Build reverse map; for duplicates, prefer the key that's in our species.json
  for (const [en, ja] of Object.entries(data)) {
    if (!rev[ja]) rev[ja] = en;
    // For items: Sitrus Berry and Gold Berry both map to オボンのみ.
    // Prefer Sitrus Berry (the modern name).
    if (ja === "オボンのみ" && en === "Sitrus Berry") rev[ja] = en;
  }
  return rev;
}

const jaToEnPokemon = loadReverseMap("pokemon-ja.json");
const jaToEnMoves = loadReverseMap("moves-ja.json");
const jaToEnItems = loadReverseMap("items-ja.json");
const jaToEnAbilities = loadReverseMap("abilities-ja.json");

// ── Normalize fullwidth/halfwidth differences ───────────────────────────────
// pokechamdb uses halfwidth letters/digits while our i18n uses fullwidth
function normalizeJaName(ja) {
  // Halfwidth → Fullwidth: A-Z, a-z, 0-9
  return ja.replace(/[A-Za-z0-9]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
  );
}

// Build additional lookup for normalized forms
function buildNormalizedLookup(reverseMap) {
  const extra = {};
  for (const [ja, en] of Object.entries(reverseMap)) {
    // Also store halfwidth-normalized key
    const halfwidth = ja.replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );
    if (halfwidth !== ja) extra[halfwidth] = en;
  }
  return extra;
}

const normalizedMoves = buildNormalizedLookup(jaToEnMoves);
const normalizedItems = buildNormalizedLookup(jaToEnItems);

// Enhanced JA→EN lookup with normalization and prefix matching
function lookupMove(jaName) {
  if (jaToEnMoves[jaName]) return jaToEnMoves[jaName];
  if (normalizedMoves[jaName]) return normalizedMoves[jaName];
  // Try fullwidth conversion
  const fw = normalizeJaName(jaName);
  if (jaToEnMoves[fw]) return jaToEnMoves[fw];
  // Try suffix match (e.g., "まんボルト" matches "１０まんボルト")
  for (const [ja, en] of Object.entries(jaToEnMoves)) {
    if (ja.endsWith(jaName) && ja.length <= jaName.length + 3) return en;
  }
  return null;
}

function lookupItem(jaName) {
  if (jaToEnItems[jaName]) return jaToEnItems[jaName];
  if (normalizedItems[jaName]) return normalizedItems[jaName];
  const fw = normalizeJaName(jaName);
  if (jaToEnItems[fw]) return jaToEnItems[fw];
  // Suffix match for mega stones (e.g., "ユキノオーナイト" vs "ユキノオナイト")
  // Try removing ー (long vowel mark) for fuzzy match
  const stripped = jaName.replace(/ー/g, "");
  for (const [ja, en] of Object.entries(jaToEnItems)) {
    if (ja.replace(/ー/g, "") === stripped) return en;
  }
  return null;
}

// ── Nature JA → EN ──────────────────────────────────────────────────────────
const NATURE_JA_TO_EN = {
  "さみしがり": "Lonely", "いじっぱり": "Adamant", "やんちゃ": "Naughty", "ゆうかん": "Brave",
  "ずぶとい": "Bold", "わんぱく": "Impish", "のうてんき": "Lax", "のんき": "Relaxed",
  "ひかえめ": "Modest", "おっとり": "Mild", "うっかりや": "Rash", "れいせい": "Quiet",
  "おだやか": "Calm", "おとなしい": "Gentle", "しんちょう": "Careful", "なまいき": "Sassy",
  "おくびょう": "Timid", "せっかち": "Hasty", "ようき": "Jolly", "むじゃき": "Naive",
  "がんばりや": "Hardy", "すなお": "Docile", "てれや": "Bashful", "きまぐれ": "Quirky", "まじめ": "Serious",
};

// ── Slug → EN name overrides ────────────────────────────────────────────────
// pokechamdb uses slugs that may not match our species names
const SLUG_TO_EN = {
  "floette-eternal": "Floette",
  "basculegion-female": "Basculegion-F",
  "goodra-hisui": "Goodra-Hisui",
  "samurott-hisui": "Samurott-Hisui",
  "decidueye-hisui": "Decidueye-Hisui",
  "typhlosion-hisui": "Typhlosion-Hisui",
  "arcanine-hisui": "Arcanine-Hisui",
  "avalugg-hisui": "Avalugg-Hisui",
  "zoroark-hisui": "Zoroark-Hisui",
  "ninetales-alola": "Ninetales-Alola",
  "raichu-alola": "Raichu-Alola",
  "rotom-wash": "Rotom-Wash",
  "rotom-heat": "Rotom-Heat",
  "rotom-mow": "Rotom-Mow",
  "rotom-frost": "Rotom-Frost",
  "rotom-fan": "Rotom-Fan",
  "slowbro-galar": "Slowbro-Galar",
  "stunfisk-galar": "Stunfisk-Galar",
  "tauros-paldea-aqua": "Tauros-Paldea-Aqua",
  "tauros-paldea-combat": "Tauros-Paldea-Combat",
  "lycanroc-midnight": "Lycanroc-Midnight",
  "meowstic-female": "Meowstic-F",
  "mr-rime": "Mr. Rime",
};

// ── Slug → EN name from i18n ────────────────────────────────────────────────
function slugToEnName(slug, jaName) {
  // Check explicit overrides first
  if (SLUG_TO_EN[slug]) return SLUG_TO_EN[slug];

  // Try JA name lookup (strip parenthetical forms)
  const baseJa = jaName.replace(/\(.*\)/, "").trim();
  if (jaToEnPokemon[jaName]) return jaToEnPokemon[jaName];
  if (jaToEnPokemon[baseJa]) return jaToEnPokemon[baseJa];

  // Capitalize slug: "garchomp" → "Garchomp"
  return slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join("-");
}

// ── Fetch with retry ────────────────────────────────────────────────────────
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Pokemon Champions Team Builder)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ── Parse Pokemon detail page from HTML ──────────────────────────────────────
// Page text structure (after stripping tags):
//   わざ {name} {pct}% {name} {pct}% ...
//   ITEMS もちもの {name} {pct}% ...
//   ABILITY とくせい {name} {pct}% ...
//   NATURE せいかく {name} {pct}% ...
//   PARTNER 同じチーム {name} {rank} 位 ...
//   能力ポイント 人気配分ランキング 順位 HP 攻 防 特攻 特防 素早 採用率
//     {rank} {hp} {atk} {def} {spa} {spd} {spe} {pct} % ...
//   MOVE LIST ...
function parseDetailFromHtml(html) {
  const result = { moves: [], items: [], natures: [], abilities: [], spreads: [], teammates: [] };

  // Strip HTML to plain text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");

  // Section markers and their end markers
  const SECTIONS = [
    { key: "moves",     start: "わざ",       end: "ITEMS" },
    { key: "items",     start: "もちもの",     end: "ABILITY" },
    { key: "abilities", start: "とくせい",     end: "NATURE" },
    { key: "natures",   start: "せいかく",     end: "PARTNER" },
    { key: "teammates", start: "同じチーム",    end: "能力ポイント" },
    { key: "spreads",   start: "能力ポイント",  end: "MOVE LIST" },
  ];

  for (const sec of SECTIONS) {
    const startIdx = text.indexOf(sec.start);
    if (startIdx < 0) continue;
    const afterStart = startIdx + sec.start.length;
    let endIdx = text.indexOf(sec.end, afterStart);
    if (endIdx < 0) endIdx = afterStart + 3000;
    const chunk = text.slice(afterStart, endIdx).trim();

    if (sec.key === "spreads") {
      // SP spread format: rank hp atk def spa spd spe pct %
      // Skip header: "人気配分ランキング 順位 HP 攻 防 特攻 特防 素早 採用率"
      const spPattern = /(?:^|\s)(\d{1,3})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)\s*%/g;
      let m;
      while ((m = spPattern.exec(chunk)) !== null) {
        const vals = [m[2], m[3], m[4], m[5], m[6], m[7]].map(Number);
        // Validate: all values should be 0-32
        if (vals.every(v => v >= 0 && v <= 32)) {
          result.spreads.push({
            hp: vals[0], atk: vals[1], def: vals[2],
            spa: vals[3], spd: vals[4], spe: vals[5],
            pct: parseFloat(m[8]),
          });
        }
      }
    } else if (sec.key === "teammates") {
      // Format: ポケモン名 N 位
      const tmPattern = /([\u3041-\u30FF\u4E00-\u9FFF\uF900-\uFAFF（）♀♂A-Za-z.\-' ]{2,20}?)\s+(\d+)\s*位/g;
      let m;
      while ((m = tmPattern.exec(chunk)) !== null) {
        result.teammates.push({ name: m[1].trim(), rank: parseInt(m[2]) });
      }
    } else {
      // Generic: name pct% pairs
      // Pattern: Japanese/alphanumeric name followed by number%
      const pairPattern = /([\u3041-\u30FF\u4E00-\u9FFF\uF900-\uFAFF（）♀♂A-Za-z.\-' ]{2,20}?)\s+(\d+(?:\.\d+)?)\s*%/g;
      let m;
      while ((m = pairPattern.exec(chunk)) !== null) {
        const name = m[1].trim();
        // Filter out section headers that might match
        if (["わざ", "もちもの", "とくせい", "せいかく"].includes(name)) continue;
        result[sec.key].push({ name, pct: parseFloat(m[2]) });
      }
    }
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[scrape-pokechamdb] Season: ${SEASON}, Limit: ${LIMIT}, Concurrency: ${CONCURRENCY}`);

  // 1. Fetch ranking page to get all slugs
  console.log("[1/3] Fetching ranking page...");
  const rankingUrl = `https://pokechamdb.com/?format=single&season=${SEASON}`;
  const rankingHtml = await fetchWithRetry(rankingUrl);

  // Extract slugs from the ranking page
  // Pattern: /pokemon/{slug}?season=M-1&format=single
  const slugPattern = /\/pokemon\/([a-z0-9-]+)\?season=/g;
  const slugSet = new Set();
  const slugOrder = [];
  let m;
  while ((m = slugPattern.exec(rankingHtml)) !== null) {
    if (!slugSet.has(m[1])) {
      slugSet.add(m[1]);
      slugOrder.push(m[1]);
    }
  }

  // Extract JA names from Next.js embedded JSON (escaped quotes)
  // Format: "pokemonJa":"ガブリアス","pokemonSlug":"garchomp" or reverse
  const jaNames = {};
  const jaPattern = /pokemonJa[\\]*":[\\]*"([^"\\]+)[\\]*"[^}]*?pokemonSlug[\\]*":[\\]*"([^"\\]+)/g;
  while ((m = jaPattern.exec(rankingHtml)) !== null) {
    jaNames[m[2]] = m[1];
  }
  // Also try reverse order
  const jaPattern2 = /pokemonSlug[\\]*":[\\]*"([^"\\]+)[\\]*"[^}]*?pokemonJa[\\]*":[\\]*"([^"\\]+)/g;
  while ((m = jaPattern2.exec(rankingHtml)) !== null) {
    if (!jaNames[m[1]]) jaNames[m[1]] = m[2];
  }

  const slugs = slugOrder.slice(0, LIMIT);
  console.log(`  Found ${slugOrder.length} Pokemon slugs, processing ${slugs.length}`);

  // 2. Fetch each Pokemon detail page
  console.log("[2/3] Fetching detail pages...");
  const allData = [];
  const errors = [];

  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (slug, j) => {
      const rank = i + j + 1;
      const url = `https://pokechamdb.com/pokemon/${slug}?season=${SEASON}&format=single`;
      try {
        const html = await fetchWithRetry(url);
        const data = parseDetailFromHtml(html);
        const jaName = jaNames[slug] || "";
        const enName = slugToEnName(slug, jaName);

        return {
          slug,
          rank,
          name: enName,
          jaName,
          moves: data.moves.map(m => ({
            name: lookupMove(m.name) || m.name,
            pct: m.pct,
            jaName: m.name,
          })),
          items: data.items.map(it => ({
            name: lookupItem(it.name) || it.name,
            pct: it.pct,
            jaName: it.name,
          })),
          natures: data.natures.map(n => ({
            name: NATURE_JA_TO_EN[n.name] || n.name,
            pct: n.pct,
            jaName: n.name,
          })),
          abilities: data.abilities.map(a => ({
            name: jaToEnAbilities[a.name] || a.name,
            pct: a.pct,
            jaName: a.name,
          })),
          spreads: data.spreads,
          teammates: data.teammates.map(t => ({
            name: jaToEnPokemon[t.name] || t.name,
            pct: t.pct,
          })),
        };
      } catch (e) {
        errors.push({ slug, rank, error: e.message });
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) {
        allData.push(r);
        const moveCount = r.moves.length;
        const itemCount = r.items.length;
        const natCount = r.natures.length;
        const untranslatedMoves = r.moves.filter(m => m.jaName === m.name).length;
        const untranslatedItems = r.items.filter(m => m.jaName === m.name).length;
        const warn = (untranslatedMoves + untranslatedItems > 0)
          ? ` [WARN: ${untranslatedMoves} untranslated moves, ${untranslatedItems} untranslated items]`
          : "";
        console.log(`  #${r.rank} ${r.name} (${r.jaName}): ${moveCount}M ${itemCount}I ${natCount}N${warn}`);
      }
    }

    // Rate limiting
    if (i + CONCURRENCY < slugs.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Sort by rank
  allData.sort((a, b) => a.rank - b.rank);

  // 3. Write output
  console.log("[3/3] Writing output...");
  const outDir = resolve(STORAGE, "pokechamdb");
  mkdirSync(outDir, { recursive: true });

  // Write all-raw.json (comprehensive)
  const outPath = resolve(outDir, "all-raw.json");
  writeFileSync(outPath, JSON.stringify(allData, null, 2) + "\n", "utf-8");

  // Stats
  const withMoves = allData.filter(d => d.moves.length > 0).length;
  const withItems = allData.filter(d => d.items.length > 0).length;
  const withNatures = allData.filter(d => d.natures.length > 0).length;

  console.log(`\n[scrape-pokechamdb] Done!`);
  console.log(`  Total: ${allData.length} Pokemon scraped`);
  console.log(`  With moves: ${withMoves}, items: ${withItems}, natures: ${withNatures}`);
  if (errors.length > 0) {
    console.log(`  Errors (${errors.length}): ${errors.map(e => e.slug).join(", ")}`);
  }
  console.log(`  Output: ${outPath}`);
}

main().catch(e => {
  console.error("[FATAL]", e);
  process.exit(1);
});
