import { readFileSync } from "fs";
const moves = JSON.parse(readFileSync("src/data/moves.json", "utf-8"));
const singles = JSON.parse(readFileSync("home-data/storage/analysis/2026-04-10-singles.json", "utf-8"));

const pm = [];
for (const [k, m] of Object.entries(moves)) {
  if (m.priority >= 1 && m.category !== "Status") {
    pm.push({ name: k, p: m.priority, t: m.type, bp: m.basePower });
  }
}
pm.sort((a, b) => b.p - a.p || b.bp - a.bp);
console.log("Priority damaging moves:");
for (const m of pm) console.log(`  +${m.p} ${m.name} (${m.t}, BP:${m.bp})`);

const pn = new Set(pm.map(m => m.name));
console.log("\nPool users:");
for (const p of singles.pokemon) {
  const found = (p.builds[0]?.moves ?? []).filter(m => pn.has(m));
  if (found.length) console.log(`  ${p.name} -> ${found.join(", ")}`);
}
