/**
 * Fetch Pokemon HOME dictionary JSON files (JA locale).
 *
 * Discovered from bundle.js:
 *   - https://resource.pokemon-home.com/battledata/json/wazainfo_ja.json
 *   - https://resource.pokemon-home.com/battledata/json/tokuseiinfo_ja.json
 *   - https://resource.pokemon-home.com/battledata/json/iteminfo_ja.json
 *   - https://resource.pokemon-home.com/battledata/json/itemname_ja.json
 *   - https://resource.pokemon-home.com/battledata/json/zkn_form_ja.json
 *
 * Lang code mapping (from bundle.js getjson switch):
 *   1=ja, 2=us, 3=fr, 4=it, 5=de, 7=es, 8=ko, 9=sc, 10=tc, 11=es_la
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "home-data", "storage", "raw-recon");
const BASE = "https://resource.pokemon-home.com/battledata/json";

const FILES = [
  "wazainfo_ja.json",
  "tokuseiinfo_ja.json",
  "iteminfo_ja.json",
  "itemname_ja.json",
  "zkn_form_ja.json",
];

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (const name of FILES) {
    const url = `${BASE}/${name}`;
    console.log(`Fetching ${url}`);
    const res = await fetch(url);
    console.log(`  ${res.status}`);
    if (!res.ok) continue;
    const text = await res.text();
    const out = join(OUT_DIR, `11-${name}`);
    await writeFile(out, text, "utf-8");
    const size = Buffer.byteLength(text, "utf-8");
    console.log(`  saved ${out} (${(size / 1024).toFixed(1)} KB)`);

    // Inspect top-level structure
    try {
      const data = JSON.parse(text);
      const keys = Object.keys(data);
      console.log(`  top-level keys: [${keys.slice(0, 10).join(", ")}]${keys.length > 10 ? ` ... (${keys.length} total)` : ""}`);
      if (keys.length > 0) {
        const first = data[keys[0]];
        const sample = JSON.stringify(first).slice(0, 200);
        console.log(`  sample[${keys[0]}]: ${sample}`);
      }
    } catch {
      console.log(`  not JSON`);
    }
    console.log();
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
