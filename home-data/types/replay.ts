/**
 * Type definitions for the vgcpast.es replay scraper / parser pipeline (Track B).
 *
 * These shapes mirror the Showdown protocol log embedded in each replay HTML
 * (see <script type="text/plain" class="battle-log-data">). One ParsedReplay
 * captures everything we need for downstream meta aggregation: players, the
 * teampreview rosters, the Pokemon actually brought to battle, revealed
 * moves/items/abilities/tera, and a flat event timeline for matchup mining.
 *
 * Side keys are always normalised to "p1" / "p2"; the protocol uses "p1a"
 * and "p1b" for active slots in doubles which we strip when keying mons.
 */

/**
 * One entry from a tier listing page, e.g. an `<a href>` link in
 * `https://replays.vgcpast.es/Gen9VGCRegulationM-A/`.
 */
export interface ListingEntry {
  /** Tier as it appears in the URL, e.g. "Gen9VGCRegulationM-A". */
  tier: string;
  /** File-system safe variant of the tier (no parentheses). */
  safeTier: string;
  /** Raw filename, e.g. "Gen9VGCRegulationM-A_9wtt_VerdugoMC_battle-...html". */
  file: string;
  /** Absolute fetch URL for the replay. */
  url: string;
  /** Battle id, e.g. "716983". */
  battleId: string;
  /** Lowercased tier slug embedded in the filename, e.g. "gen9vgcregulationma". */
  tierLower: string;
  /** Player 1 username (URL component). */
  p1: string;
  /** Player 2 username (URL component). */
  p2: string;
  /** Optional anti-scrape token if the filename includes one. */
  token?: string;
  /** True when a token segment is present. */
  hasToken: boolean;
}

export interface ReplayPlayer {
  /** "p1" or "p2". */
  side: "p1" | "p2";
  /** Showdown username as it appears in `|player|p1|9wtt|169|1109`. */
  name: string;
  /** Avatar id reported by the protocol. */
  avatar?: string;
  /** Initial rating reported by the protocol (number) when present. */
  rating?: number;
}

export interface ReplayMon {
  /** Canonical species name with formes preserved verbatim, e.g. "Gengar-Mega". */
  species: string;
  /** Optional forme tag derived from a hyphen suffix, e.g. "Mega". */
  forme?: string;
  /** Always 50 in VGC, but parsed from the protocol details string. */
  level: number;
  /** "M" / "F" if reported. */
  gender?: "M" | "F";
  /** True when the protocol details string contains "shiny". */
  shiny?: boolean;
  /** Item revealed via -mega, -heal [from] item, -enditem, -item, etc. */
  itemRevealed?: string;
  /** Ability revealed via -ability or |raw|...Ability is:... */
  abilityRevealed?: string;
  /** Distinct moves observed via |move| events, in first-use order. */
  movesRevealed: string[];
  /** Tera type from |-terastallize|side: nick|TYPE. */
  teraType?: string;
  /** True if the mon used Terastallize at any point. */
  teraUsed?: boolean;
  /** True if the mon Mega Evolved at any point. */
  megaEvolved?: boolean;
}

export interface ReplayTeam {
  side: "p1" | "p2";
  /** Showdown username (mirrored from ReplayPlayer for convenience). */
  player: string;
  /** Pokemon actually switched in during the battle. */
  brought: ReplayMon[];
  /** All teampreview entries (always length 6 for full teams). */
  preview: ReplayMon[];
  /** Number of Pokemon the player must bring (`|teamsize|p1|N`). */
  bringCount: number;
}

export interface ReplayEvent {
  turn: number;
  /** Actor nick / side label as it appears in the protocol (e.g. "p1a: Gengar"). */
  actor?: string;
  /** Target nick / side label. */
  target?: string;
  kind:
    | "move"
    | "switch"
    | "faint"
    | "mega"
    | "tera"
    | "ability"
    | "item"
    | "weather"
    | "field";
  /** Free-form detail string (the move name, item name, etc.). */
  detail: string;
}

export interface ParsedReplay {
  /** Battle id (e.g. "716983"). */
  id: string;
  /** Pretty tier name from `|tier|`, e.g. "[Gen 9] VGC Regulation M-A". */
  tier: string;
  /** Tier key as it appears in the URL path. */
  tierKey: string;
  gametype: "singles" | "doubles" | "triples" | "multi" | "freeforall";
  rated: boolean;
  /** ISO timestamp from the first `|t:|<unix>` line. Empty string if absent. */
  startedAt: string;
  players: ReplayPlayer[];
  /** Username of `|win|...`, when present. */
  winner?: string;
  /** Rating delta extracted from `|raw|<name>'s rating: A &rarr; B`. */
  ratingChange?: { name: string; before: number; after: number; delta: number }[];
  turns: number;
  teams: ReplayTeam[];
  events: ReplayEvent[];
  source: {
    tierDir: string;
    file: string;
    url: string;
    size: number;
    hash: string;
  };
}
