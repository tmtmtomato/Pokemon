import { readFileSync, existsSync } from "fs";
import { join } from "path";

const moves = JSON.parse(readFileSync("src/data/moves.json", "utf-8"));
const moveNames = new Set(Object.keys(moves));
const pikaDir = "home-data/storage/pikalytics/2026-04-08/championspreview";
const roster = JSON.parse(readFileSync("home-data/storage/champions-roster.json", "utf-8"));

const missingMoves = new Map();
let withMoves = 0, withoutMoves = 0;

for (const name of roster) {
  const fp = join(pikaDir, name + ".json");
  if (!existsSync(fp)) continue;
  const data = JSON.parse(readFileSync(fp, "utf-8"));
  if (!data.moves || data.moves.length === 0) { withoutMoves++; continue; }
  withMoves++;
  for (const m of data.moves) {
    if (!moveNames.has(m.name)) {
      if (!missingMoves.has(m.name)) missingMoves.set(m.name, []);
      missingMoves.get(m.name).push(name);
    }
  }
}

console.log("Pokemon with moves:", withMoves, "| without:", withoutMoves);
console.log("Missing moves:", missingMoves.size);
const sorted = [...missingMoves.entries()].sort((a,b) => b[1].length - a[1].length);
for (const [mv, users] of sorted) {
  console.log(`  ${mv} (${users.length}): ${users.slice(0,4).join(", ")}`);
}
