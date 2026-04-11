import { readFileSync } from "node:fs";

const meta = JSON.parse(
  readFileSync("home-data/storage/analysis/2026-04-08-meta.json", "utf8"),
);
const fmt = meta.formats.find((f) => f.formatKey === "gen9ou");
const o = fmt.pokemon.find((p) => p.name === "Ogerpon-Wellspring");
console.log("Ogerpon-Wellspring:");
console.log("  topBuild:", o?.topBuild);
console.log("  notes:", o?.notes);
console.log("  moves count:", o?.moves?.length, "first:", o?.moves?.[0]);
console.log("  abilities count:", o?.abilities?.length, "first:", o?.abilities?.[0]);

// Check if there's also a generic "Ogerpon" entry
const ogerpon = fmt.pokemon.find((p) => p.name === "Ogerpon");
console.log("\nOgerpon (base):");
console.log("  found:", !!ogerpon);
if (ogerpon) console.log("  topBuild:", ogerpon.topBuild);

// Audit: does the JSON file `pokemon` field always match the file name?
import { readdirSync } from "node:fs";
const files = readdirSync("home-data/storage/pikalytics/2026-04-08/gen9ou/").filter(
  (f) => f.endsWith(".json") && f !== "_index.json",
);
let mismatches = [];
for (const f of files) {
  const p = JSON.parse(
    readFileSync(`home-data/storage/pikalytics/2026-04-08/gen9ou/${f}`, "utf8"),
  );
  const expected = f.replace(/\.json$/, "");
  if (p.pokemon !== expected) {
    mismatches.push({ file: expected, pokemon: p.pokemon });
  }
}
console.log("\nFile-name vs pokemon-field mismatches:", mismatches.length);
for (const m of mismatches) console.log(" ", m);
