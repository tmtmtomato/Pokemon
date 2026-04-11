/**
 * parse-markdown.ts — Track A
 *
 * Pure parser that turns a Pikalytics AI Pokemon markdown document into a
 * structured `PikalyticsPokemonStats`. Uses only `node:fs/promises` and
 * regular expressions, no third-party markdown libraries.
 *
 * Sections handled (any may be missing):
 *   - Quick Info table (Format, Game, Data Date, Pokemon name from H1)
 *   - Common Moves       → moves
 *   - Common Abilities   → abilities
 *   - Common Items       → items
 *   - Common Teammates   → teammates
 *   - Tera Types         → teraTypes (optional)
 *   - Common Spreads     → spreads (optional)
 *   - Base Stats         → baseStats { hp, atk, def, spa, spd, spe, bst }
 *
 * CLI:
 *   npx tsx home-data/pikalytics/parse-markdown.ts <path-to-md> [--out file.json]
 *
 * If `--out` is omitted, the parsed JSON is written to a sibling `.json`
 * file (and also printed to stdout).
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  PikalyticsBaseStats,
  PikalyticsPokemonStats,
  SpreadRow,
  UsageRow,
} from "../types/pikalytics.js";

const __filename = fileURLToPath(import.meta.url);

/**
 * Extract a `## SectionName` block from markdown.
 *
 * Returns the body lines between `## name` and the next `## ` heading or
 * end-of-file. Returns `null` if the section is absent.
 *
 * Matching is case-insensitive and tolerates extra trailing words after the
 * given name (e.g. "Common Moves" matches "## Common Moves" but also
 * "## Common Moves for Incineroar"). It will NOT match "## FAQ".
 */
export function extractSection(md: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Find the heading line itself.
  const headingRe = new RegExp(`^##\\s+${escaped}\\b[^\\n]*$`, "im");
  const headingMatch = headingRe.exec(md);
  if (!headingMatch) return null;
  // Slice everything after the heading line and stop at the next "## " heading.
  const startIdx = headingMatch.index + headingMatch[0].length;
  const tail = md.slice(startIdx);
  const nextHeading = tail.search(/^##\s/m);
  const body = nextHeading >= 0 ? tail.slice(0, nextHeading) : tail;
  return body.replace(/^\r?\n+/, "");
}

/**
 * Parse usage rows of the form `- **Name**: 12.345%` from a section body.
 * Tolerates leading whitespace, alternative bullets (*) and missing bold.
 */
export function parseUsageRows(body: string | null): UsageRow[] {
  if (!body) return [];
  const rows: UsageRow[] = [];
  const lineRe =
    /^\s*[-*]\s+(?:\*\*)?([^*][^:\n]*?)(?:\*\*)?\s*[:\-—]\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
  for (const line of body.split(/\r?\n/)) {
    const m = lineRe.exec(line);
    if (m) {
      const name = m[1]!.trim().replace(/^\*\*|\*\*$/g, "");
      const pct = Number(m[2]);
      if (name && Number.isFinite(pct)) {
        rows.push({ name, pct });
      }
    }
  }
  return rows;
}

/**
 * Parse spread rows. The Pikalytics format varies across Pokemon, so this
 * matcher is intentionally loose: it looks for `EV — Nature — pct%` style
 * lines and falls back to extracting any `(stat-spread)|(nature)|(pct)` row.
 */
export function parseSpreadRows(body: string | null): SpreadRow[] {
  if (!body) return [];
  const rows: SpreadRow[] = [];
  // Pattern A: `- 252 HP / 252 Atk / 4 Spe (Adamant): 12.345%`
  const reA =
    /^\s*[-*]\s+([0-9 /A-Za-z.]+?)\s*\(([A-Za-z]+)\)\s*[:\-—]\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
  // Pattern B: `- **Adamant** 252/252/0/0/0/4: 12.345%`
  const reB =
    /^\s*[-*]\s+(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s+([0-9 /]+?)\s*[:\-—]\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
  // Pattern C: table row `| 252/252/4 | Adamant | 12.345% |`
  const reC =
    /^\s*\|\s*([0-9 /A-Za-z.]+?)\s*\|\s*([A-Za-z]+)\s*\|\s*([0-9]+(?:\.[0-9]+)?)\s*%/;
  for (const line of body.split(/\r?\n/)) {
    let m = reA.exec(line);
    if (m) {
      rows.push({
        ev: m[1]!.trim(),
        nature: m[2]!.trim(),
        pct: Number(m[3]),
      });
      continue;
    }
    m = reB.exec(line);
    if (m) {
      rows.push({
        ev: m[2]!.trim(),
        nature: m[1]!.trim(),
        pct: Number(m[3]),
      });
      continue;
    }
    m = reC.exec(line);
    if (m) {
      rows.push({
        ev: m[1]!.trim(),
        nature: m[2]!.trim(),
        pct: Number(m[3]),
      });
      continue;
    }
  }
  return rows;
}

/**
 * Parse the Quick Info table that contains the Format, Game and Data Date
 * cells. Returns the values as a partial record.
 */
export function parseQuickInfo(md: string): {
  format?: string;
  game?: string;
  dataDate?: string;
} {
  const section = extractSection(md, "Quick Info");
  if (!section) return {};
  const out: { format?: string; game?: string; dataDate?: string } = {};
  // Match table rows: | **Format** | Pokemon Champions VGC 2026 (`championspreview`) |
  const rowRe =
    /^\s*\|\s*\*?\*?([^|*]+?)\*?\*?\s*\|\s*([^|]+?)\s*\|\s*$/;
  for (const line of section.split(/\r?\n/)) {
    const m = rowRe.exec(line);
    if (!m) continue;
    const key = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    if (key === "format") {
      // Prefer the backticked code if present.
      const code = /`([^`]+)`/.exec(value);
      out.format = code ? code[1]!.trim() : value;
    } else if (key === "game") {
      out.game = value;
    } else if (key === "data date") {
      out.dataDate = value;
    }
  }
  return out;
}

/**
 * Parse the Pokemon name from the leading H1 (`# Name - ...`).
 */
export function parsePokemonName(md: string): string {
  const m = /^#\s+([^\n#-]+?)(?:\s*[-–—]\s*|\s*$)/m.exec(md);
  if (!m) return "";
  return m[1]!.trim();
}

/**
 * Parse the Base Stats table.
 */
export function parseBaseStats(md: string): PikalyticsBaseStats {
  // Look for any "Base Stats" section/heading; in the fixture, the table
  // appears under a Q&A "What are the base stats for X?" line, so we
  // scan the whole document for the rows directly.
  const result: PikalyticsBaseStats = {
    hp: 0,
    atk: 0,
    def: 0,
    spa: 0,
    spd: 0,
    spe: 0,
    bst: 0,
  };
  const rowRe =
    /^\s*\|\s*\*?\*?([A-Za-z. ]+?)\*?\*?\s*\|\s*\*?\*?([0-9]+)\*?\*?\s*\|\s*$/;
  for (const line of md.split(/\r?\n/)) {
    const m = rowRe.exec(line);
    if (!m) continue;
    const key = m[1]!.trim().toLowerCase();
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    switch (key) {
      case "hp":
        result.hp = value;
        break;
      case "attack":
      case "atk":
        result.atk = value;
        break;
      case "defense":
      case "def":
        result.def = value;
        break;
      case "sp. atk":
      case "sp.atk":
      case "special attack":
      case "spa":
        result.spa = value;
        break;
      case "sp. def":
      case "sp.def":
      case "special defense":
      case "spd":
        result.spd = value;
        break;
      case "speed":
      case "spe":
        result.spe = value;
        break;
      case "bst":
      case "total":
        result.bst = value;
        break;
    }
  }
  // Fallback: derive BST if missing.
  if (result.bst === 0) {
    result.bst =
      result.hp + result.atk + result.def + result.spa + result.spd + result.spe;
  }
  return result;
}

/**
 * Top-level parser. Always returns a `PikalyticsPokemonStats`, even if some
 * sections are missing (the corresponding arrays will be empty / fields blank).
 */
export function parsePikalyticsMarkdown(md: string): PikalyticsPokemonStats {
  const quick = parseQuickInfo(md);
  const moves = parseUsageRows(extractSection(md, "Common Moves"));
  const abilities = parseUsageRows(extractSection(md, "Common Abilities"));
  const items = parseUsageRows(extractSection(md, "Common Items"));
  const teammates = parseUsageRows(extractSection(md, "Common Teammates"));
  const teraTypes = parseUsageRows(extractSection(md, "Tera Types"));
  const teraTypes2 = teraTypes.length
    ? teraTypes
    : parseUsageRows(extractSection(md, "Common Tera Types"));
  const spreadsBody =
    extractSection(md, "Common Spreads") ?? extractSection(md, "EV Spreads");
  const spreads = parseSpreadRows(spreadsBody);
  const baseStats = parseBaseStats(md);
  const pokemon = parsePokemonName(md);

  const result: PikalyticsPokemonStats = {
    pokemon,
    format: quick.format ?? "",
    game: quick.game ?? "",
    dataDate: quick.dataDate ?? "",
    moves,
    abilities,
    items,
    teammates,
    baseStats,
    rawMarkdown: md,
  };
  if (teraTypes2.length > 0) result.teraTypes = teraTypes2;
  if (spreads.length > 0) result.spreads = spreads;
  return result;
}

interface CliArgs {
  input: string;
  out?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { input: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      args.out = argv[i + 1]!;
      i++;
    } else if (!args.input && a && !a.startsWith("--")) {
      args.input = a;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.input) {
    console.error(
      "[parse-markdown] usage: tsx parse-markdown.ts <path-to.md> [--out file.json]",
    );
    process.exit(2);
  }
  const md = await readFile(args.input, "utf8");
  const parsed = parsePikalyticsMarkdown(md);
  const json = JSON.stringify(parsed, null, 2);
  const outPath = args.out ?? args.input.replace(/\.md$/i, ".json");
  await writeFile(outPath, json, "utf8");
  console.log(`[parse-markdown] wrote ${outPath}`);
  console.log(json);
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[parse-markdown] FAILED:", err);
    process.exit(1);
  });
}

