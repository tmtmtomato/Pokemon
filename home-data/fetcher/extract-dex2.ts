/**
 * Extract Japanese language dex object from bundle.js by walking braces.
 * Dumps full structure so we can see all keys.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BUNDLE = join(
  process.cwd(),
  "home-data",
  "storage",
  "raw-recon",
  "00-bundle.js",
);

function findObjectEnd(src: string, startBraceIdx: number): number {
  let depth = 0;
  let i = startBraceIdx;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      // Skip string literal
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
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  throw new Error("unterminated object");
}

async function main(): Promise<void> {
  const bundle = await readFile(BUNDLE, "utf-8");

  // Find first this.dex={poke:[
  const idx = bundle.indexOf("this.dex={poke:[");
  if (idx === -1) throw new Error("not found");
  const objStart = bundle.indexOf("{", idx);
  const objEnd = findObjectEnd(bundle, objStart);
  const objText = bundle.slice(objStart, objEnd);

  console.log(`Object: ${objStart}..${objEnd} (${objEnd - objStart} bytes)`);
  console.log(`First 200: ${objText.slice(0, 200)}`);
  console.log(`Last 200: ${objText.slice(-200)}`);

  // Extract top-level keys (key:value pairs at depth 1)
  console.log("\n--- Top-level keys ---");
  let depth = 0;
  let i = 0;
  const keys: Array<{ name: string; pos: number }> = [];
  while (i < objText.length) {
    const c = objText[i];
    if (c === '"') {
      i++;
      while (i < objText.length && objText[i] !== '"') {
        if (objText[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "{" || c === "[") {
      depth++;
      i++;
      continue;
    }
    if (c === "}" || c === "]") {
      depth--;
      i++;
      continue;
    }
    if (depth === 1) {
      // Look for keyName:
      const m = objText.slice(i).match(/^([a-zA-Z_]+):/);
      if (m) {
        keys.push({ name: m[1], pos: i });
        i += m[0].length;
        continue;
      }
    }
    i++;
  }

  for (const k of keys) {
    const next = keys[keys.indexOf(k) + 1];
    const end = next ? next.pos : objText.length - 1;
    const valSnippet = objText.slice(k.pos + k.name.length + 1, Math.min(k.pos + k.name.length + 200, end));
    console.log(`  ${k.name}: ${valSnippet.slice(0, 100)}...`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
