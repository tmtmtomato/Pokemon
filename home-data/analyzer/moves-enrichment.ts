/**
 * moves-enrichment.ts
 *
 * Adds missing attacking moves to src/data/moves.json.
 * Sources:
 *   - Pikalytics data (home-data/storage/pikalytics/2026-04-08/championspreview/*.json)
 *   - Showdown BattleMovedex (home-data/storage/raw-recon/30-showdown-moves.js)
 *
 * Only Physical/Special moves with basePower > 0 are added.
 * Status moves are skipped.
 * Existing entries are never modified.
 *
 * Usage:
 *   npx tsx home-data/analyzer/moves-enrichment.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");
const RECON_DIR = resolve(ROOT, "home-data/storage/raw-recon");
const MOVES_PATH = resolve(ROOT, "src/data/moves.json");
const PIKALYTICS_DIR = resolve(
  ROOT,
  "home-data/storage/pikalytics/2026-04-08/championspreview"
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadShowdownExport(filename: string): Record<string, any> {
  const raw = readFileSync(resolve(RECON_DIR, filename), "utf-8");
  const match = raw.match(/=\s*(\{[\s\S]+\})\s*;?\s*$/);
  if (!match) throw new Error(`Cannot parse ${filename}`);
  return new Function(`return ${match[1]}`)();
}

function loadJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Convert a move name to Showdown's key format (lowercase, no spaces/hyphens/punctuation) */
function toShowdownKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-'.:%]+/g, "");
}

// ── Flag mapping ─────────────────────────────────────────────────────────────

// Flags we care about for damage calc (subset of Showdown flags)
const RELEVANT_FLAGS = [
  "contact",
  "punch",
  "sound",
  "bite",
  "bullet",
  "pulse",
  "slicing",
  "wind",
] as const;

/**
 * Convert Showdown flags (which use 1 for true) to our format (boolean true).
 * Only include flags relevant to damage calculation.
 */
function convertFlags(
  showdownFlags: Record<string, number> | undefined
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!showdownFlags) return result;
  for (const flag of RELEVANT_FLAGS) {
    if (showdownFlags[flag]) {
      result[flag] = true;
    }
  }
  return result;
}

// ── Spread targets ───────────────────────────────────────────────────────────

const SPREAD_TARGETS = new Set(["allAdjacentFoes", "allAdjacent"]);

// ── Variable base power moves ────────────────────────────────────────────────

// Moves with variable/computed base power that need representative values
const VARIABLE_BP_OVERRIDES: Record<string, number> = {
  "Low Kick": 80, // Weight-dependent; 80 is a common bracket
  "Grass Knot": 80, // Weight-dependent; same as Low Kick
  "Heavy Slam": 80, // Weight ratio; representative value
  "Heat Crash": 80, // Weight ratio; representative value
  "Gyro Ball": 80, // Speed-dependent; representative value
  "Eruption": 150, // Max HP = max power
  "Water Spout": 150, // Max HP = max power
  "Electro Ball": 80, // Speed ratio; representative value
  "Reversal": 100, // HP-dependent; representative at low HP
  "Flail": 100, // HP-dependent; representative at low HP
  "Crush Grip": 100, // HP ratio; representative value
  "Hard Press": 100, // HP ratio; representative value
  "Wring Out": 100, // HP ratio; representative value
  "Punishment": 80, // Boost-dependent; representative value
  "Power Trip": 80, // Boost-dependent
  "Stored Power": 80, // Boost-dependent
  "Last Respects": 150, // Fainted allies count; representative with 2 fainted
  "Rage Fist": 150, // Times-hit dependent; representative after several hits
};

// ── Champions PP conversion ──────────────────────────────────────────────────

/** Champions uses reduced PP: pp = Math.ceil(showdownPP * 0.6) */
function championspp(showdownPP: number): number {
  return Math.ceil(showdownPP * 0.6);
}

// ── Secondary effect detection ───────────────────────────────────────────────

/**
 * Determine if the move has a secondary effect.
 * We set secondaryEffect = true if Showdown has a `secondary` or `self.boosts` field.
 * This matches our existing convention (true = "has some side effect").
 */
function hasSecondaryEffect(sdMove: any): boolean {
  if (sdMove.secondary && sdMove.secondary.chance) return true;
  if (sdMove.secondaries && sdMove.secondaries.length > 0) return true;
  // Self stat changes (like Close Combat lowering Def/SpD, or Leaf Storm lowering SpA)
  if (sdMove.self && sdMove.self.boosts) return true;
  return false;
}

// ── Main conversion ──────────────────────────────────────────────────────────

interface OurMove {
  name: string;
  type: string;
  category: string;
  basePower: number;
  pp: number;
  accuracy: number;
  priority: number;
  flags: Record<string, boolean>;
  secondaryEffect: boolean;
  recoil?: [number, number];
  drain?: [number, number];
  multiHit?: number | [number, number];
  isSpread?: boolean;
}

function convertMove(sdMove: any): OurMove | null {
  // Skip status moves
  if (sdMove.category === "Status") return null;

  // Determine base power
  let basePower = sdMove.basePower || 0;

  // For variable-BP moves (basePowerCallback), prefer our override if available
  if (sdMove.basePowerCallback) {
    const override = VARIABLE_BP_OVERRIDES[sdMove.name];
    if (override) {
      basePower = override;
    } else if (basePower === 0) {
      // No known override and no default BP, skip
      return null;
    }
    // Otherwise keep Showdown's basePower (e.g., Eruption 150, Last Respects 50)
  }

  // Skip moves with 0 base power that aren't variable-BP (e.g., Counter, Mirror Coat)
  if (basePower === 0) return null;

  // Build our move entry
  const move: OurMove = {
    name: sdMove.name,
    type: sdMove.type,
    category: sdMove.category,
    basePower,
    pp: championspp(sdMove.pp),
    accuracy: sdMove.accuracy === true ? 101 : sdMove.accuracy,
    priority: sdMove.priority || 0,
    flags: convertFlags(sdMove.flags),
    secondaryEffect: hasSecondaryEffect(sdMove),
  };

  // Recoil
  if (sdMove.recoil) {
    move.recoil = sdMove.recoil as [number, number];
  }

  // Drain
  if (sdMove.drain) {
    move.drain = sdMove.drain as [number, number];
  }

  // Multi-hit
  if (sdMove.multihit) {
    move.multiHit = sdMove.multihit;
  }

  // Spread
  if (SPREAD_TARGETS.has(sdMove.target)) {
    move.isSpread = true;
  }

  return move;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const dryRun = process.argv.includes("--dry-run");

  // 1. Load existing moves.json
  const existingMoves: Record<string, any> = loadJson(MOVES_PATH);
  const existingKeys = new Set(Object.keys(existingMoves));
  console.log(`Existing moves in moves.json: ${existingKeys.size}`);

  // 2. Load Showdown moves
  const showdownMoves = loadShowdownExport("30-showdown-moves.js");
  console.log(
    `Showdown moves loaded: ${Object.keys(showdownMoves).length}`
  );

  // 3. Collect all moves referenced by Pikalytics Champions Pokemon
  const pikalyticsFiles = readdirSync(PIKALYTICS_DIR).filter((f) =>
    f.endsWith(".json")
  );
  const referencedMoves = new Set<string>();

  for (const file of pikalyticsFiles) {
    const data = loadJson(join(PIKALYTICS_DIR, file));
    for (const m of data.moves || []) {
      referencedMoves.add(m.name);
    }
  }
  console.log(
    `Unique moves referenced by ${pikalyticsFiles.length} Champions Pokemon: ${referencedMoves.size}`
  );

  // 4. Process each referenced move
  let added = 0;
  let skippedStatus = 0;
  let skippedAlready = 0;
  let notFound = 0;
  let skippedZeroBP = 0;
  const newMoves: Record<string, OurMove> = {};
  const notFoundList: string[] = [];

  for (const moveName of referencedMoves) {
    // Already in moves.json?
    if (existingKeys.has(moveName)) {
      skippedAlready++;
      continue;
    }

    // Look up in Showdown
    const sdKey = toShowdownKey(moveName);
    const sdMove = showdownMoves[sdKey];

    if (!sdMove) {
      notFound++;
      notFoundList.push(moveName);
      continue;
    }

    // Status move?
    if (sdMove.category === "Status") {
      skippedStatus++;
      continue;
    }

    // Convert
    const converted = convertMove(sdMove);
    if (!converted) {
      skippedZeroBP++;
      continue;
    }

    newMoves[moveName] = converted;
    added++;
  }

  // 5. Merge and sort alphabetically
  const merged = { ...existingMoves, ...newMoves };
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(merged).sort()) {
    sorted[key] = merged[key];
  }

  // 6. Write
  if (!dryRun) {
    saveJson(MOVES_PATH, sorted);
    console.log(`\nWrote ${MOVES_PATH}`);
  } else {
    console.log("\n[DRY RUN] Would write to", MOVES_PATH);
  }

  // 7. Summary
  console.log("\n=== Summary ===");
  console.log(`Attacking moves added:     ${added}`);
  console.log(`Status moves skipped:      ${skippedStatus}`);
  console.log(`Already existed:           ${skippedAlready}`);
  console.log(`Zero BP (no override):     ${skippedZeroBP}`);
  console.log(`Not found in Showdown:     ${notFound}`);
  if (notFoundList.length > 0) {
    console.log(`  Not found: ${notFoundList.join(", ")}`);
  }
  console.log(`Total moves in output:     ${Object.keys(sorted).length}`);

  // Show what was added
  if (added > 0) {
    console.log("\n=== Moves Added ===");
    for (const name of Object.keys(newMoves).sort()) {
      const m = newMoves[name];
      console.log(`  ${name} (${m.type} ${m.category} BP:${m.basePower})`);
    }
  }
}

main();
