/**
 * Extract embedded dex dictionaries from bundle.js for the Japanese locale.
 *
 * The bundle contains a literal `this.dex = {poke:[...], pokeType:[...],
 * waza:{1:"はたく",...}, tokusei:{...}, seikaku:{...}, teraType:{...}}` block,
 * one per language. We locate the Japanese block (the first one) and parse it
 * with a tiny JS-literal evaluator.
 *
 * Output: 10-dex-ja.json with normalized shape:
 *   {
 *     poke:     { "1": "フシギダネ", ... },   // pokemon ID (1-based) → name
 *     pokeType: { "0": "ノーマル", ... },    // type ID → name
 *     waza:     { "1": "はたく", ... },       // move ID → name
 *     tokusei:  { "1": "あくしゅう", ... },  // ability ID → name
 *     seikaku:  { "0": "がんばりや", ... },  // nature ID → name
 *     teraType: { "0": "ノーマル", ..., "99": "ステラ" }
 *   }
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const BUNDLE = join(ROOT, "home-data", "storage", "raw-recon", "00-bundle.js");
const OUT_DIR = join(ROOT, "home-data", "storage", "raw-recon");

/** Find matching closing brace/bracket starting at `start` (which points at the opening one). */
function findMatching(src: string, start: number): number {
  const open = src[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) throw new Error(`not a brace at ${start}: ${open}`);
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  throw new Error("unterminated");
}

/**
 * Convert a JS object literal with bare numeric keys (e.g. `{1:"a",2:"b"}`)
 * into JSON form with quoted string keys.
 */
function jsLiteralToJson(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      // copy string literal as-is
      const start = i;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      out += src.slice(start, i);
      continue;
    }
    // After { or , a key may follow
    if (c === "{" || c === ",") {
      out += c;
      i++;
      while (i < src.length && /\s/.test(src[i])) {
        out += src[i];
        i++;
      }
      const m = src.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*|[0-9]+)\s*:/);
      if (m) {
        out += `"${m[1]}":`;
        i += m[0].length;
        continue;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

async function main(): Promise<void> {
  const bundle = await readFile(BUNDLE, "utf-8");

  // Locate the Japanese dex literal: first occurrence of `this.dex={poke:[`
  const idx = bundle.indexOf("this.dex={poke:[");
  if (idx === -1) throw new Error("Japanese dex not found");
  const objStart = bundle.indexOf("{", idx);
  const objEnd = findMatching(bundle, objStart);
  const objText = bundle.slice(objStart, objEnd);

  console.log(`Japanese dex object: ${objText.length} bytes`);

  // Convert JS literal → JSON and parse
  const jsonText = jsLiteralToJson(objText);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, "10-dex-ja-debug.json"), jsonText, "utf-8");
    throw new Error(
      `JSON.parse failed: ${(e as Error).message}\nDebug dump saved`,
    );
  }

  // Normalize: convert `poke` and `pokeType` arrays to id→name maps so all
  // dictionaries have the same shape.
  const out: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      const map: Record<string, string> = {};
      for (let i = 0; i < value.length; i++) {
        // Pokemon are 1-indexed (id 1 = フシギダネ at array index 0). Types are
        // 0-indexed. For poke we shift to 1-based to match the IDs used in
        // pdetail/pokemon-ranking.
        const k = key === "poke" ? String(i + 1) : String(i);
        map[k] = value[i] as string;
      }
      out[key] = map;
    } else if (value && typeof value === "object") {
      out[key] = value as Record<string, string>;
    }
  }

  console.log("\n--- Extracted dictionaries ---");
  for (const [k, v] of Object.entries(out)) {
    const entries = Object.entries(v);
    const sample = entries
      .slice(0, 3)
      .map(([id, name]) => `${id}=${name}`)
      .join(", ");
    console.log(`  ${k}: ${entries.length} entries (${sample}...)`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "10-dex-ja.json"),
    JSON.stringify(out, null, 2),
    "utf-8",
  );
  console.log(`\nSaved → ${join(OUT_DIR, "10-dex-ja.json")}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
