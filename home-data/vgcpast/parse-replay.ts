/**
 * parse-replay.ts — Track B / step 3
 *
 * Parses a Showdown replay HTML (as served by replays.vgcpast.es) into a
 * fully structured ParsedReplay. The protocol log we care about lives inside
 * a `<script type="text/plain" class="battle-log-data">...</script>` block,
 * formatted as one `|tag|args|...` line per protocol message.
 *
 * The parser walks each line and maintains a `nick → ReplayMon` map keyed by
 * the side-stripped slot label (e.g. "p1: Gengar"). All revealed information
 * (moves, items, abilities, tera, mega) is recorded against the originating
 * mon. Side-prefixed slot labels like `p1a` and `p1b` are normalised to the
 * `p1`/`p2` side key while keeping the nickname distinct so we can resolve
 * details from the more authoritative `|switch|` events later.
 *
 * Usage as a CLI:
 *   npx tsx home-data/vgcpast/parse-replay.ts path/to/replay.html
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ParsedReplay,
  ReplayEvent,
  ReplayMon,
  ReplayPlayer,
  ReplayTeam,
} from "../types/replay.js";

const __filename = fileURLToPath(import.meta.url);

/** Decode the most common HTML entities used in `|raw|` strings. */
function decodeHtml(input: string): string {
  return input
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Strip every HTML tag from a `|raw|` payload. */
function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, "");
}

/**
 * Extract the inner text of the `<script class="battle-log-data">` block.
 * Returns an empty string if the block is missing.
 */
export function extractBattleLog(html: string): string {
  const re = /<script[^>]*class="battle-log-data"[^>]*>([\s\S]*?)<\/script>/i;
  const m = html.match(re);
  return m ? m[1] : "";
}

interface ParsedDetails {
  species: string;
  forme?: string;
  level: number;
  gender?: "M" | "F";
  shiny?: boolean;
}

/**
 * Parse a `Pokemon, L50, F, shiny` style details string. Each component
 * after the species name is comma-separated.
 */
export function parseDetailsString(details: string): ParsedDetails {
  const parts = details.split(",").map((s) => s.trim()).filter(Boolean);
  const out: ParsedDetails = {
    species: parts[0] ?? "",
    level: 50,
  };
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (/^L\d+$/i.test(p)) {
      out.level = Number(p.slice(1));
    } else if (p === "M" || p === "F") {
      out.gender = p;
    } else if (p.toLowerCase() === "shiny") {
      out.shiny = true;
    }
  }
  // Forme: split off a trailing hyphen segment if it looks like one
  // (e.g. "Gengar-Mega"). Some species legitimately have hyphens in their
  // canonical name (Hisuian forms etc.), so we keep the species verbatim
  // and only set `forme` for the well-known transient suffixes.
  const m = out.species.match(/^(.+)-(Mega(?:-X|-Y)?|Primal|Eternamax)$/);
  if (m) {
    out.forme = m[2];
  }
  return out;
}

interface SlotRef {
  side: "p1" | "p2";
  /** Active slot letter (a/b/c) when present, otherwise undefined. */
  slot?: string;
  nick: string;
  /** Combined key for the nick map: `${side}: ${nick}`. */
  nickKey: string;
}

/**
 * Parse a slot reference such as `p1a: Gengar` or `p2: Politoed` into a
 * normalised `{side, nick}` tuple.
 */
export function parseSlotRef(input: string): SlotRef | null {
  const m = input.match(/^(p[1-4])([a-d])?: (.+)$/);
  if (!m) return null;
  const side = m[1] as "p1" | "p2";
  const slot = m[2] || undefined;
  const nick = m[3];
  return { side, slot, nick, nickKey: `${side}: ${nick}` };
}

/** Lowercase, non-alphanumeric stripped slug for canonical compare. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Mutable working state used while walking the protocol log. */
interface ParserState {
  mons: Map<string, ReplayMon>;
  monsBySide: Map<"p1" | "p2", Map<string, ReplayMon>>;
  // For preview: side → list of preview mons in declaration order
  preview: Map<"p1" | "p2", ReplayMon[]>;
  brought: Map<"p1" | "p2", ReplayMon[]>;
  players: Map<"p1" | "p2", ReplayPlayer>;
  events: ReplayEvent[];
  // Active slot mapping: e.g. "p1a" → current ReplayMon
  active: Map<string, ReplayMon>;
}

function newState(): ParserState {
  return {
    mons: new Map(),
    monsBySide: new Map([
      ["p1", new Map()],
      ["p2", new Map()],
    ]),
    preview: new Map([
      ["p1", []],
      ["p2", []],
    ]),
    brought: new Map([
      ["p1", []],
      ["p2", []],
    ]),
    players: new Map(),
    events: [],
    active: new Map(),
  };
}

/** Get-or-create a ReplayMon for the given side+nick, optionally seeding species. */
function getOrCreateMon(
  state: ParserState,
  side: "p1" | "p2",
  nick: string,
  species?: string,
): ReplayMon {
  const key = `${side}: ${nick}`;
  let mon = state.mons.get(key);
  if (!mon) {
    mon = {
      species: species || nick,
      level: 50,
      movesRevealed: [],
    };
    state.mons.set(key, mon);
    state.monsBySide.get(side)!.set(nick, mon);
  } else if (species) {
    // Always trust the most recent species/details we see (switch overrides
    // earlier guesses based on the nickname).
    if (!mon.species || mon.species === nick) {
      mon.species = species;
    }
  }
  return mon;
}

/** Apply parsed details to a mon (forme/level/gender/shiny). */
function applyDetails(mon: ReplayMon, details: ParsedDetails): void {
  mon.species = details.species;
  if (details.forme !== undefined) mon.forme = details.forme;
  mon.level = details.level;
  if (details.gender) mon.gender = details.gender;
  if (details.shiny) mon.shiny = true;
}

/** Push a move into a mon's revealed list (deduped, order preserved). */
function pushMove(mon: ReplayMon, move: string): void {
  if (!mon.movesRevealed.includes(move)) mon.movesRevealed.push(move);
}

/** Convert "Gengarite" / "Leftovers" etc. to canonical form (just trims). */
function cleanItemName(raw: string): string {
  return raw.trim();
}

/**
 * Top-level entry point: parse a replay HTML into a ParsedReplay.
 */
export function parseReplay(
  html: string,
  source: ParsedReplay["source"],
): ParsedReplay {
  const log = extractBattleLog(html);
  const lines = log.split("\n");

  const state = newState();
  let gametype: ParsedReplay["gametype"] = "doubles";
  let rated = false;
  let tier = "";
  let tierKey = "";
  let winner: string | undefined;
  let turns = 0;
  let startedAt = "";
  let id = "";
  // Bring counts default to 0; updated by |teamsize|.
  const bringCount: Record<"p1" | "p2", number> = { p1: 0, p2: 0 };
  const ratingChange: NonNullable<ParsedReplay["ratingChange"]> = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.startsWith("|")) continue;
    const parts = line.split("|");
    // parts[0] is empty (string starts with |), parts[1] is the tag.
    const tag = parts[1];
    switch (tag) {
      case "gametype": {
        const g = parts[2] as ParsedReplay["gametype"];
        if (g) gametype = g;
        break;
      }
      case "tier": {
        tier = parts.slice(2).join("|");
        break;
      }
      case "rated": {
        rated = true;
        break;
      }
      case "player": {
        // |player|p1|9wtt|169|1109
        const side = parts[2] as "p1" | "p2";
        const name = parts[3];
        if (!name) break; // late "|player|p2|" line
        const avatar = parts[4] || undefined;
        const ratingStr = parts[5];
        const rating = ratingStr ? Number(ratingStr) : undefined;
        state.players.set(side, {
          side,
          name,
          avatar,
          rating: Number.isFinite(rating) ? rating : undefined,
        });
        break;
      }
      case "teamsize": {
        const side = parts[2] as "p1" | "p2";
        const n = Number(parts[3]);
        if (Number.isFinite(n)) bringCount[side] = n;
        break;
      }
      case "poke": {
        // |poke|p1|Gengar, L50, F|
        const side = parts[2] as "p1" | "p2";
        const details = parseDetailsString(parts[3] ?? "");
        const previewMon: ReplayMon = {
          species: details.species,
          forme: details.forme,
          level: details.level,
          gender: details.gender,
          shiny: details.shiny,
          movesRevealed: [],
        };
        state.preview.get(side)!.push(previewMon);
        break;
      }
      case "switch":
      case "drag": {
        // |switch|p1a: Gengar|Gengar, L50, F, shiny|100/100
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const details = parseDetailsString(parts[3] ?? "");
        const mon = getOrCreateMon(
          state,
          slotRef.side,
          slotRef.nick,
          details.species,
        );
        applyDetails(mon, details);
        // Update active slot mapping (e.g. p1a → mon)
        if (slotRef.slot) {
          state.active.set(`${slotRef.side}${slotRef.slot}`, mon);
        }
        // Track brought
        const broughtList = state.brought.get(slotRef.side)!;
        if (!broughtList.includes(mon)) broughtList.push(mon);
        state.events.push({
          turn: turns,
          actor: parts[2],
          kind: "switch",
          detail: details.species,
        });
        break;
      }
      case "detailschange":
      case "replace": {
        // |detailschange|p1a: Gengar|Gengar-Mega, L50, F, shiny
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const details = parseDetailsString(parts[3] ?? "");
        const mon = getOrCreateMon(
          state,
          slotRef.side,
          slotRef.nick,
          details.species,
        );
        applyDetails(mon, details);
        if (/-Mega(?:-X|-Y)?$/.test(details.species)) {
          mon.megaEvolved = true;
        }
        break;
      }
      case "move": {
        // |move|p1a: Gengar|Shadow Ball|p2b: Basculegion
        const slotRef = parseSlotRef(parts[2] ?? "");
        const move = parts[3];
        if (!slotRef || !move) break;
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        pushMove(mon, move);
        state.events.push({
          turn: turns,
          actor: parts[2],
          target: parts[4],
          kind: "move",
          detail: move,
        });
        break;
      }
      case "-mega": {
        // |-mega|p1a: Gengar|Gengar|Gengarite
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        mon.megaEvolved = true;
        const itemName = parts[4];
        if (itemName) mon.itemRevealed = cleanItemName(itemName);
        state.events.push({
          turn: turns,
          actor: parts[2],
          kind: "mega",
          detail: itemName ?? "",
        });
        break;
      }
      case "-terastallize": {
        // |-terastallize|p1a: nick|Fairy
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const teraType = parts[3];
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        if (teraType) mon.teraType = teraType;
        mon.teraUsed = true;
        state.events.push({
          turn: turns,
          actor: parts[2],
          kind: "tera",
          detail: teraType ?? "",
        });
        break;
      }
      case "-heal": {
        // |-heal|p2a: Archaludon|15/100|[from] item: Leftovers
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        // Look for [from] item: NAME in any later part
        for (let i = 4; i < parts.length; i++) {
          const tagPart = parts[i];
          const m = tagPart.match(/^\[from\]\s+item:\s*(.+)$/);
          if (m) {
            mon.itemRevealed = cleanItemName(m[1]);
            break;
          }
        }
        break;
      }
      case "-item": {
        // |-item|p1a: nick|Air Balloon
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const itemName = parts[3];
        if (!itemName) break;
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        mon.itemRevealed = cleanItemName(itemName);
        state.events.push({
          turn: turns,
          actor: parts[2],
          kind: "item",
          detail: itemName,
        });
        break;
      }
      case "-enditem": {
        // |-enditem|p2b: Sneasler|White Herb
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const itemName = parts[3];
        if (!itemName) break;
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        if (!mon.itemRevealed) mon.itemRevealed = cleanItemName(itemName);
        break;
      }
      case "-ability": {
        // |-ability|p2a: Archaludon|Stamina|boost
        const slotRef = parseSlotRef(parts[2] ?? "");
        if (!slotRef) break;
        const abilityName = parts[3];
        if (!abilityName) break;
        const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
        mon.abilityRevealed = abilityName;
        state.events.push({
          turn: turns,
          actor: parts[2],
          kind: "ability",
          detail: abilityName,
        });
        break;
      }
      case "-weather": {
        // |-weather|RainDance|[from] ability: Drizzle|[of] p1a: Politoed
        const detail = parts[2] ?? "";
        // Try to attribute the ability if we can
        let fromAbility: string | undefined;
        let ofSlot: string | undefined;
        for (let i = 3; i < parts.length; i++) {
          const m = parts[i].match(/^\[from\]\s+ability:\s*(.+)$/);
          if (m) fromAbility = m[1];
          const m2 = parts[i].match(/^\[of\]\s+(.+)$/);
          if (m2) ofSlot = m2[1];
        }
        if (fromAbility && ofSlot) {
          const slotRef = parseSlotRef(ofSlot);
          if (slotRef) {
            const mon = getOrCreateMon(state, slotRef.side, slotRef.nick);
            mon.abilityRevealed = fromAbility;
          }
        }
        state.events.push({
          turn: turns,
          kind: "weather",
          detail,
        });
        break;
      }
      case "-fieldstart":
      case "-fieldend":
      case "-sidestart":
      case "-sideend": {
        state.events.push({
          turn: turns,
          kind: "field",
          detail: parts.slice(2).join("|"),
        });
        break;
      }
      case "faint": {
        state.events.push({
          turn: turns,
          actor: parts[2],
          kind: "faint",
          detail: parts[2] ?? "",
        });
        break;
      }
      case "win": {
        winner = parts[2];
        break;
      }
      case "turn": {
        const n = Number(parts[2]);
        if (Number.isFinite(n)) turns = Math.max(turns, n);
        break;
      }
      case "t:": {
        if (!startedAt) {
          const unix = Number(parts[2]);
          if (Number.isFinite(unix)) {
            startedAt = new Date(unix * 1000).toISOString();
          }
        }
        break;
      }
      case "raw": {
        const payload = parts.slice(2).join("|");
        const decoded = decodeHtml(payload);
        const text = stripTags(decoded);
        // Pattern 1: "X's Ability is: Y"
        const abilityMatch = text.match(/^(.+?)'s Ability is:\s*(.+?)$/);
        if (abilityMatch) {
          const nick = abilityMatch[1].trim();
          const abilityName = abilityMatch[2].trim();
          // We don't know which side; try both.
          for (const side of ["p1", "p2"] as const) {
            const map = state.monsBySide.get(side)!;
            // Try exact nickname match first.
            const mon = map.get(nick);
            if (mon) {
              mon.abilityRevealed = abilityName;
              break;
            }
          }
          break;
        }
        // Pattern 2: "Player's rating: 1109 → 1130"
        const ratingMatch = text.match(
          /^(.+?)'s rating:\s*(\d+)\s*→\s*(\d+)/,
        );
        if (ratingMatch) {
          const name = ratingMatch[1].trim();
          const before = Number(ratingMatch[2]);
          const after = Number(ratingMatch[3]);
          ratingChange.push({ name, before, after, delta: after - before });
        }
        break;
      }
      default:
        break;
    }
  }

  // Derive id from source filename when possible.
  const fileBase = source.file.replace(/\.html$/, "");
  const idMatch = fileBase.match(/-(\d+)(?:-[a-z0-9]+)?$/);
  id = idMatch ? idMatch[1] : fileBase;
  // tierKey: derive from source.tierDir (which is the safeTier).
  tierKey = source.tierDir;

  // Build teams
  const teams: ReplayTeam[] = (["p1", "p2"] as const).map((side) => {
    const player = state.players.get(side);
    return {
      side,
      player: player?.name ?? "",
      preview: state.preview.get(side) ?? [],
      brought: state.brought.get(side) ?? [],
      bringCount: bringCount[side],
    };
  });

  const players: ReplayPlayer[] = (["p1", "p2"] as const)
    .map((side) => state.players.get(side))
    .filter((p): p is ReplayPlayer => Boolean(p));

  // Reconcile preview with brought: when a brought mon corresponds to a
  // preview entry by base species (or by slug), forward revealed info onto
  // the preview entry. This means callers reading preview lists still see
  // item/ability/move data even if they ignore brought.
  // (Aggregator works off the brought list anyway, so this is best-effort.)
  for (const team of teams) {
    for (const broughtMon of team.brought) {
      const baseSpecies = broughtMon.species.replace(
        /-(Mega(?:-X|-Y)?|Primal|Eternamax)$/,
        "",
      );
      const target = team.preview.find(
        (p) =>
          slug(p.species) === slug(baseSpecies) ||
          slug(p.species) === slug(broughtMon.species),
      );
      if (target) {
        if (broughtMon.itemRevealed && !target.itemRevealed) {
          target.itemRevealed = broughtMon.itemRevealed;
        }
        if (broughtMon.abilityRevealed && !target.abilityRevealed) {
          target.abilityRevealed = broughtMon.abilityRevealed;
        }
        if (broughtMon.teraType && !target.teraType) {
          target.teraType = broughtMon.teraType;
        }
        if (broughtMon.teraUsed) target.teraUsed = true;
        if (broughtMon.megaEvolved) target.megaEvolved = true;
        for (const m of broughtMon.movesRevealed) {
          if (!target.movesRevealed.includes(m)) target.movesRevealed.push(m);
        }
      }
    }
  }

  return {
    id,
    tier,
    tierKey,
    gametype,
    rated,
    startedAt,
    players,
    winner,
    ratingChange: ratingChange.length ? ratingChange : undefined,
    turns,
    teams,
    events: state.events,
    source,
  };
}

/** Build a `source` block from an absolute file path on disk. */
export async function buildSourceFromFile(
  filePath: string,
  tierDir = "",
  url = "",
): Promise<ParsedReplay["source"]> {
  const text = await readFile(filePath, "utf8");
  const st = await stat(filePath);
  const hash = createHash("sha1").update(text).digest("hex");
  return {
    tierDir: tierDir || basename(dirname(filePath)),
    file: basename(filePath),
    url,
    size: st.size,
    hash,
  };
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: tsx parse-replay.ts <replay.html>");
    process.exit(1);
  }
  const filePath = resolve(arg);
  const html = await readFile(filePath, "utf8");
  const source = await buildSourceFromFile(filePath);
  const parsed = parseReplay(html, source);
  console.log(JSON.stringify(parsed, null, 2));
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[parse-replay] FAILED:", err);
    process.exit(1);
  });
}
