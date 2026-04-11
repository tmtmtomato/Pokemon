/**
 * game-state-features.ts — Turn-by-turn game state reconstruction and
 * feature extraction for the move advisor model.
 *
 * Walks the replay event timeline and reconstructs observable game state
 * (active mons, faints, weather/field) without HP data.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedReplay, ReplayEvent } from "../../types/replay.js";
import { normalizeMega } from "./replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpeciesData {
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
}

interface TypeChart {
  [attackType: string]: { [defType: string]: number };
}

interface MoveData {
  type: string;
  category: string;
  basePower: number;
  priority?: number;
}

export interface GameState {
  turn: number;
  /** Active mons per slot: { "p1a": "Incineroar", "p1b": "Garchomp", ... } */
  active: Record<string, string | null>;
  /** Fainted mons per side */
  fainted: { p1: Set<string>; p2: Set<string> };
  /** Current weather */
  weather: string | null;
  /** Current terrain/field effects */
  fields: Set<string>;
  /** Moves used this turn (for ordering analysis) */
  turnMoveOrder: string[];
  /** Nickname → species mapping */
  nickToSpecies: Record<string, string>;
}

export interface MoveFeatureVector {
  features: Float64Array;
  moveUsed: string;
  actor: string; // species
  target: string | null; // species
  won: boolean;
  turn: number;
  totalTurns: number;
}

export const MOVE_FEATURE_DIM = 20;

// ---------------------------------------------------------------------------
// Cached data
// ---------------------------------------------------------------------------

let cachedSpecies: Record<string, SpeciesData> | null = null;
let cachedTypeChart: TypeChart | null = null;
let cachedMoves: Record<string, MoveData> | null = null;

// ---------------------------------------------------------------------------
// Supplementary move data for VGC moves not in the calc engine's moves.json.
// Only fields needed for ML features: type, category, basePower, priority.
// ---------------------------------------------------------------------------

const SUPPLEMENTAL_MOVES: Record<string, MoveData> = {
  // Priority moves
  "Fake Out":      { type: "Normal",   category: "Physical", basePower: 40,  priority: 3 },
  "Ice Shard":     { type: "Ice",      category: "Physical", basePower: 40,  priority: 1 },
  "Aqua Jet":      { type: "Water",    category: "Physical", basePower: 40,  priority: 1 },
  "Mach Punch":    { type: "Fighting", category: "Physical", basePower: 40,  priority: 1 },
  "Quick Attack":  { type: "Normal",   category: "Physical", basePower: 40,  priority: 1 },
  "Shadow Sneak":  { type: "Ghost",    category: "Physical", basePower: 40,  priority: 1 },
  "First Impression": { type: "Bug",   category: "Physical", basePower: 90,  priority: 2 },
  "Grassy Glide":  { type: "Grass",    category: "Physical", basePower: 55,  priority: 1 },
  "Accelerock":    { type: "Rock",     category: "Physical", basePower: 40,  priority: 1 },
  "Jet Punch":     { type: "Water",    category: "Physical", basePower: 60,  priority: 1 },
  "Wide Guard":    { type: "Rock",     category: "Status",   basePower: 0,   priority: 3 },
  "Quick Guard":   { type: "Fighting", category: "Status",   basePower: 0,   priority: 3 },
  "Follow Me":     { type: "Normal",   category: "Status",   basePower: 0,   priority: 2 },
  "Rage Powder":   { type: "Bug",      category: "Status",   basePower: 0,   priority: 2 },
  "Ally Switch":   { type: "Psychic",  category: "Status",   basePower: 0,   priority: 2 },

  // Negative priority
  "Trick Room":    { type: "Psychic",  category: "Status",   basePower: 0,   priority: -7 },

  // Status moves
  "Will-O-Wisp":   { type: "Fire",     category: "Status",   basePower: 0 },
  "Calm Mind":     { type: "Psychic",  category: "Status",   basePower: 0 },
  "Encore":        { type: "Normal",   category: "Status",   basePower: 0 },
  "Substitute":    { type: "Normal",   category: "Status",   basePower: 0 },
  "Taunt":         { type: "Dark",     category: "Status",   basePower: 0 },
  "Nasty Plot":    { type: "Dark",     category: "Status",   basePower: 0 },
  "Tailwind":      { type: "Flying",   category: "Status",   basePower: 0 },
  "Helping Hand":  { type: "Normal",   category: "Status",   basePower: 0 },
  "Thunder Wave":  { type: "Electric", category: "Status",   basePower: 0 },
  "Stealth Rock":  { type: "Rock",     category: "Status",   basePower: 0 },
  "Swords Dance":  { type: "Normal",   category: "Status",   basePower: 0 },
  "Iron Defense":  { type: "Steel",    category: "Status",   basePower: 0 },
  "Bulk Up":       { type: "Fighting", category: "Status",   basePower: 0 },
  "Light Screen":  { type: "Psychic",  category: "Status",   basePower: 0 },
  "Reflect":       { type: "Psychic",  category: "Status",   basePower: 0 },
  "Roost":         { type: "Flying",   category: "Status",   basePower: 0 },
  "Aurora Veil":   { type: "Ice",      category: "Status",   basePower: 0 },
  "Haze":          { type: "Ice",      category: "Status",   basePower: 0 },
  "Parting Shot":  { type: "Dark",     category: "Status",   basePower: 0 },
  "Trick":         { type: "Psychic",  category: "Status",   basePower: 0 },
  "Spore":         { type: "Grass",    category: "Status",   basePower: 0 },
  "Sleep Powder":  { type: "Grass",    category: "Status",   basePower: 0 },
  "Yawn":          { type: "Normal",   category: "Status",   basePower: 0 },
  "Recover":       { type: "Normal",   category: "Status",   basePower: 0 },
  "Synthesis":     { type: "Grass",    category: "Status",   basePower: 0 },
  "Leech Seed":    { type: "Grass",    category: "Status",   basePower: 0 },
  "Spikes":        { type: "Ground",   category: "Status",   basePower: 0 },
  "Toxic":         { type: "Poison",   category: "Status",   basePower: 0 },
  "Toxic Spikes":  { type: "Poison",   category: "Status",   basePower: 0 },
  "Curse":         { type: "Ghost",    category: "Status",   basePower: 0 },
  "Dragon Dance":  { type: "Dragon",   category: "Status",   basePower: 0 },
  "Rain Dance":    { type: "Water",    category: "Status",   basePower: 0 },
  "Sunny Day":     { type: "Fire",     category: "Status",   basePower: 0 },
  "Sandstorm":     { type: "Rock",     category: "Status",   basePower: 0 },
  "Snowscape":     { type: "Ice",      category: "Status",   basePower: 0 },
  "Imprison":      { type: "Psychic",  category: "Status",   basePower: 0 },
  "Disable":       { type: "Normal",   category: "Status",   basePower: 0 },
  "Perish Song":   { type: "Normal",   category: "Status",   basePower: 0 },
  "Safeguard":     { type: "Normal",   category: "Status",   basePower: 0 },
  "Coaching":      { type: "Fighting", category: "Status",   basePower: 0 },
  "Decorate":      { type: "Fairy",    category: "Status",   basePower: 0 },
  "Quiver Dance":  { type: "Bug",      category: "Status",   basePower: 0 },
  "Shell Smash":   { type: "Normal",   category: "Status",   basePower: 0 },
  "Belly Drum":    { type: "Normal",   category: "Status",   basePower: 0 },
  "U-turn":        { type: "Bug",      category: "Physical", basePower: 70 },
  "Volt Switch":   { type: "Electric", category: "Special",  basePower: 70 },

  // Damaging specials
  "Hydro Pump":    { type: "Water",    category: "Special",  basePower: 110 },
  "Blizzard":      { type: "Ice",      category: "Special",  basePower: 110 },
  "Thunder":       { type: "Electric", category: "Special",  basePower: 110 },
  "Focus Blast":   { type: "Fighting", category: "Special",  basePower: 120 },
  "Overheat":      { type: "Fire",     category: "Special",  basePower: 130 },
  "Draco Meteor":  { type: "Dragon",   category: "Special",  basePower: 130 },
  "Leaf Storm":    { type: "Grass",    category: "Special",  basePower: 130 },
  "Meteor Beam":   { type: "Rock",     category: "Special",  basePower: 120 },
  "Dragon Pulse":  { type: "Dragon",   category: "Special",  basePower: 85 },
  "Flash Cannon":  { type: "Steel",    category: "Special",  basePower: 80 },
  "Air Slash":     { type: "Flying",   category: "Special",  basePower: 75 },
  "Bug Buzz":      { type: "Bug",      category: "Special",  basePower: 90 },
  "Psyshock":      { type: "Psychic",  category: "Special",  basePower: 80 },
  "Giga Drain":    { type: "Grass",    category: "Special",  basePower: 75 },
  "Scald":         { type: "Water",    category: "Special",  basePower: 80 },
  "Power Gem":     { type: "Rock",     category: "Special",  basePower: 80 },
  "Lava Plume":    { type: "Fire",     category: "Special",  basePower: 80 },
  "Snarl":         { type: "Dark",     category: "Special",  basePower: 55 },
  "Icy Wind":      { type: "Ice",      category: "Special",  basePower: 55 },
  "Electroweb":    { type: "Electric", category: "Special",  basePower: 55 },
  "Discharge":     { type: "Electric", category: "Special",  basePower: 80 },
  "Muddy Water":   { type: "Water",    category: "Special",  basePower: 90 },
  "Surf":          { type: "Water",    category: "Special",  basePower: 90 },
  "Expanding Force": { type: "Psychic", category: "Special", basePower: 80 },
  "Stored Power":  { type: "Psychic",  category: "Special",  basePower: 20 },
  "Weather Ball":  { type: "Normal",   category: "Special",  basePower: 50 },
  "Tera Blast":    { type: "Normal",   category: "Special",  basePower: 80 },
  "Hyper Voice":   { type: "Normal",   category: "Special",  basePower: 90 },

  // Damaging physicals
  "Brave Bird":    { type: "Flying",   category: "Physical", basePower: 120 },
  "Superpower":    { type: "Fighting", category: "Physical", basePower: 120 },
  "Play Rough":    { type: "Fairy",    category: "Physical", basePower: 90 },
  "Wild Charge":   { type: "Electric", category: "Physical", basePower: 90 },
  "Stomping Tantrum": { type: "Ground", category: "Physical", basePower: 75 },
  "Heavy Slam":    { type: "Steel",    category: "Physical", basePower: 80 },
  "Low Kick":      { type: "Fighting", category: "Physical", basePower: 80 },
  "Dual Wingbeat": { type: "Flying",   category: "Physical", basePower: 40 },
  "Zen Headbutt":  { type: "Psychic",  category: "Physical", basePower: 80 },
  "Thunder Punch": { type: "Electric", category: "Physical", basePower: 75 },
  "Ice Punch":     { type: "Ice",      category: "Physical", basePower: 75 },
  "Fire Punch":    { type: "Fire",     category: "Physical", basePower: 75 },
  "Throat Chop":   { type: "Dark",     category: "Physical", basePower: 80 },
  "Seed Bomb":     { type: "Grass",    category: "Physical", basePower: 80 },
  "Drain Punch":   { type: "Fighting", category: "Physical", basePower: 75 },
  "Rock Tomb":     { type: "Rock",     category: "Physical", basePower: 60 },
  "Poison Jab":    { type: "Poison",   category: "Physical", basePower: 80 },
  "Waterfall":     { type: "Water",    category: "Physical", basePower: 80 },
  "X-Scissor":     { type: "Bug",      category: "Physical", basePower: 80 },
  "Crunch":        { type: "Dark",     category: "Physical", basePower: 80 },
  "Outrage":       { type: "Dragon",   category: "Physical", basePower: 120 },
  "Head Smash":    { type: "Rock",     category: "Physical", basePower: 150 },
  "Gunk Shot":     { type: "Poison",   category: "Physical", basePower: 120 },
  "Sacred Sword":  { type: "Fighting", category: "Physical", basePower: 90 },
  "Psyblade":      { type: "Psychic",  category: "Physical", basePower: 80 },
  "Spirit Break":  { type: "Fairy",    category: "Physical", basePower: 75 },
  "Liquidation":   { type: "Water",    category: "Physical", basePower: 85 },
  "Iron Head":     { type: "Steel",    category: "Physical", basePower: 80 },
  "Headlong Rush": { type: "Ground",   category: "Physical", basePower: 120 },
};

async function ensureData() {
  if (!cachedSpecies) {
    const path = resolve(__dirname, "..", "..", "..", "src", "data", "species.json");
    cachedSpecies = JSON.parse(await readFile(path, "utf-8"));
  }
  if (!cachedTypeChart) {
    const path = resolve(__dirname, "..", "..", "..", "src", "data", "typechart.json");
    cachedTypeChart = JSON.parse(await readFile(path, "utf-8"));
  }
  if (!cachedMoves) {
    const baseMoves = JSON.parse(
      await readFile(resolve(__dirname, "..", "..", "..", "src", "data", "moves.json"), "utf-8"),
    );
    // Merge supplementary VGC moves (base moves take priority)
    cachedMoves = { ...SUPPLEMENTAL_MOVES, ...baseMoves };
  }
}

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

/**
 * Parse actor string like "p1a: Incineroar" → { side: "p1", slot: "a", nick: "Incineroar" }
 */
function parseActor(actor: string): { side: string; slot: string; nick: string } | null {
  const match = actor.match(/^(p[12])([ab]):\s*(.+)$/);
  if (!match) return null;
  return { side: match[1], slot: match[2], nick: match[3] };
}

/**
 * Reconstruct game states and extract move features from a replay.
 */
export async function extractMoveFeatures(replay: ParsedReplay): Promise<MoveFeatureVector[]> {
  await ensureData();

  const features: MoveFeatureVector[] = [];
  const winner = replay.winner;
  if (!winner) return features;

  // Determine winner side
  const winnerSide = replay.players.find((p) => p.name === winner)?.side;
  if (!winnerSide) return features;

  // Build nickname → species mapping from events
  const nickToSpecies: Record<string, string> = {};
  for (const team of replay.teams) {
    for (const mon of [...team.preview, ...team.brought]) {
      // We'll map when we see switch events
    }
  }

  // State initialization
  const state: GameState = {
    turn: 0,
    active: { p1a: null, p1b: null, p2a: null, p2b: null },
    fainted: { p1: new Set(), p2: new Set() },
    weather: null,
    fields: new Set(),
    turnMoveOrder: [],
    nickToSpecies,
  };

  // Track consecutive Protects per mon
  const protectCount: Record<string, number> = {};
  // Track last move used per mon
  const lastMove: Record<string, string> = {};

  let currentTurn = 0;

  for (const event of replay.events) {
    // Reset turn-level tracking
    if (event.turn !== currentTurn) {
      currentTurn = event.turn;
      state.turn = currentTurn;
      state.turnMoveOrder = [];
    }

    switch (event.kind) {
      case "switch": {
        const parsed = event.actor ? parseActor(event.actor) : null;
        if (parsed) {
          const slotKey = `${parsed.side}${parsed.slot}`;
          const species = normalizeMega(event.detail);
          state.active[slotKey] = species;
          nickToSpecies[`${parsed.side}:${parsed.nick}`] = species;
          nickToSpecies[`${parsed.side}:${species}`] = species;
        }
        break;
      }
      case "faint": {
        const parsed = event.actor ? parseActor(event.actor) : null;
        if (parsed) {
          const species = nickToSpecies[`${parsed.side}:${parsed.nick}`] ?? parsed.nick;
          const side = parsed.side as "p1" | "p2";
          state.fainted[side].add(normalizeMega(species));
          state.active[`${parsed.side}${parsed.slot}`] = null;
        }
        break;
      }
      case "weather": {
        state.weather = event.detail === "none" ? null : event.detail;
        break;
      }
      case "field": {
        // Handle field start/end
        if (event.detail.startsWith("end:")) {
          state.fields.delete(event.detail.slice(4).trim());
        } else {
          state.fields.add(event.detail);
        }
        break;
      }
      case "move": {
        const actorParsed = event.actor ? parseActor(event.actor) : null;
        if (!actorParsed) break;

        const actorSide = actorParsed.side as "p1" | "p2";
        const actorSpecies = nickToSpecies[`${actorParsed.side}:${actorParsed.nick}`]
          ?? normalizeMega(actorParsed.nick);
        const moveName = event.detail;

        // Resolve target species
        let targetSpecies: string | null = null;
        if (event.target) {
          const targetParsed = parseActor(event.target);
          if (targetParsed) {
            targetSpecies = nickToSpecies[`${targetParsed.side}:${targetParsed.nick}`]
              ?? normalizeMega(targetParsed.nick);
          }
        }

        // Determine if this player won
        const actorWon = actorSide === winnerSide;

        // Extract feature vector
        const vec = computeMoveFeatures(
          actorSpecies,
          moveName,
          targetSpecies,
          state,
          actorSide,
          protectCount,
          lastMove,
          replay.turns,
        );

        features.push({
          features: vec,
          moveUsed: moveName,
          actor: actorSpecies,
          target: targetSpecies,
          won: actorWon,
          turn: state.turn,
          totalTurns: replay.turns,
        });

        // Update tracking
        state.turnMoveOrder.push(actorSpecies);
        const monKey = `${actorSide}:${actorSpecies}`;
        if (moveName === "Protect" || moveName === "Detect") {
          protectCount[monKey] = (protectCount[monKey] ?? 0) + 1;
        } else {
          protectCount[monKey] = 0;
        }
        lastMove[monKey] = moveName;
        break;
      }
      case "mega": {
        const parsed = event.actor ? parseActor(event.actor) : null;
        if (parsed) {
          const species = normalizeMega(event.detail);
          state.active[`${parsed.side}${parsed.slot}`] = species;
          nickToSpecies[`${parsed.side}:${parsed.nick}`] = species;
        }
        break;
      }
    }
  }

  return features;
}

// ---------------------------------------------------------------------------
// Feature computation (20 dims)
// ---------------------------------------------------------------------------

function computeMoveFeatures(
  actorSpecies: string,
  moveName: string,
  targetSpecies: string | null,
  state: GameState,
  actorSide: "p1" | "p2",
  protectCount: Record<string, number>,
  lastMoveMap: Record<string, string>,
  totalTurns: number,
): Float64Array {
  const vec = new Float64Array(MOVE_FEATURE_DIM);
  const actorData = cachedSpecies![actorSpecies];
  const moveData = cachedMoves![moveName];
  const oppSide = actorSide === "p1" ? "p2" : "p1";

  // [0] Type effectiveness vs target
  if (targetSpecies && moveData) {
    const targetData = cachedSpecies![targetSpecies];
    if (targetData) {
      let eff = 1;
      for (const defType of targetData.types) {
        eff *= cachedTypeChart![moveData.type]?.[defType] ?? 1;
      }
      vec[0] = eff / 4; // normalize 4x → 1.0
    }
  }

  // [1] STAB (move type matches actor type)
  if (actorData && moveData) {
    vec[1] = actorData.types.includes(moveData.type) ? 1 : 0;
  }

  // [2] Is physical move
  vec[2] = moveData?.category === "Physical" ? 1 : 0;

  // [3] Is special move
  vec[3] = moveData?.category === "Special" ? 1 : 0;

  // [4] Base power (normalized)
  vec[4] = moveData ? moveData.basePower / 150 : 0;

  // [5] Is status move
  vec[5] = moveData?.category === "Status" ? 1 : 0;

  // [6] Is Protect/Detect
  vec[6] = moveName === "Protect" || moveName === "Detect" ? 1 : 0;

  // [7] Turn number (normalized)
  vec[7] = totalTurns > 0 ? state.turn / totalTurns : 0;

  // [8] Faint differential (positive = winning)
  const myFaints = state.fainted[actorSide].size;
  const oppFaints = state.fainted[oppSide as "p1" | "p2"].size;
  vec[8] = (oppFaints - myFaints) / 4; // normalize

  // [9] My remaining mons
  const myBrought = actorSide === "p1"
    ? 4 - state.fainted.p1.size
    : 4 - state.fainted.p2.size;
  vec[9] = myBrought / 4;

  // [10] Opponent remaining mons
  const oppBrought = oppSide === "p1"
    ? 4 - state.fainted.p1.size
    : 4 - state.fainted.p2.size;
  vec[10] = oppBrought / 4;

  // [11] Partner active (is there a mon in the other slot)
  const mySlots = actorSide === "p1" ? ["p1a", "p1b"] : ["p2a", "p2b"];
  const partnerActive = mySlots.some((s) =>
    state.active[s] !== null && state.active[s] !== actorSpecies
  );
  vec[11] = partnerActive ? 1 : 0;

  // [12] Actor speed (relative to max in game)
  const maxSpeed = Math.max(
    ...Object.values(state.active)
      .filter(Boolean)
      .map((s) => cachedSpecies![s!]?.baseStats.spe ?? 0),
    1,
  );
  vec[12] = actorData ? actorData.baseStats.spe / maxSpeed : 0;

  // [13] Moved first this turn (proxy for speed)
  vec[13] = state.turnMoveOrder.length === 0 ? 1 : 0; // first mover

  // [14] Weather favorable
  if (moveData && state.weather) {
    const favorable =
      (state.weather === "Sun" && moveData.type === "Fire") ||
      (state.weather === "Rain" && moveData.type === "Water") ||
      (state.weather === "Sandstorm" && moveData.type === "Rock");
    vec[14] = favorable ? 1 : 0;
  }

  // [15] Consecutive Protects
  const monKey = `${actorSide}:${actorSpecies}`;
  vec[15] = Math.min(1, (protectCount[monKey] ?? 0) / 2);

  // [16] Move is repeated from last turn
  vec[16] = lastMoveMap[monKey] === moveName ? 1 : 0;

  // [17] Is priority move
  vec[17] = moveData?.priority && moveData.priority > 0 ? 1 : 0;

  // [18] Is spread move (targets multiple)
  const SPREAD_MOVES = new Set([
    "Earthquake", "Rock Slide", "Heat Wave", "Dazzling Gleam", "Surf",
    "Muddy Water", "Snarl", "Blizzard", "Discharge", "Icy Wind",
    "Electroweb", "Lava Plume", "Hyper Voice", "Expanding Force",
  ]);
  vec[18] = SPREAD_MOVES.has(moveName) ? 1 : 0;

  // [19] Is switching (this will be 0 for moves; switch events are tracked separately)
  vec[19] = 0;

  return vec;
}

/** Feature names for move features. */
export const MOVE_FEATURE_NAMES: string[] = [
  "type_eff_vs_target", "is_stab", "is_physical", "is_special",
  "base_power", "is_status", "is_protect",
  "turn_normalized", "faint_differential", "my_remaining", "opp_remaining",
  "partner_active", "speed_relative", "moved_first",
  "weather_favorable", "consecutive_protects", "move_repeated",
  "is_priority", "is_spread", "is_switch",
];
