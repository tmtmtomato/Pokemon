#!/usr/bin/env node
/**
 * Quick reporting helper: list every Pokemon currently confirmed in the
 * Pokemon Champions VGC 2026 preview pokedex (i.e. present in Pikalytics
 * `championspreview`) and show its observed Reg M-A win rate.
 *
 * Usage:
 *   node home-data/analyzer/list-champions-roster.mjs
 *   node home-data/analyzer/list-champions-roster.mjs --json
 *   node home-data/analyzer/list-champions-roster.mjs --date 2026-04-08
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { json: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--date") out.date = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? "2026-04-08";

// 1. Pikalytics championspreview index = canonical roster
const pikaIndexPath = resolve(
  __dirname,
  "..",
  "storage",
  "pikalytics",
  date,
  "championspreview",
  "_index.json",
);
const pikaIndex = JSON.parse(readFileSync(pikaIndexPath, "utf8"));

// 2. vgcpast meta snapshot for win rates / sample sizes
const metaPath = resolve(
  __dirname,
  "..",
  "storage",
  "analysis",
  `${date}-meta.json`,
);
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const fmt = meta.formats.find((f) => f.formatKey === "championspreview");
if (!fmt) {
  console.error("championspreview format not found in", metaPath);
  process.exit(1);
}

// vgcpast preserves form names exactly (e.g. "Rotom-Wash",
// "Arcanine-Hisui"), so we look up by exact canonical name only — any
// form-stripping fallback would mix unrelated formes together.
const vgcByName = new Map();
for (const p of fmt.pokemon) {
  const games =
    p.notes
      .find((n) => n.startsWith("vgcpast"))
      ?.match(/(\d+) games/)?.[1] ?? null;
  vgcByName.set(p.name, {
    winRate: p.winRate ?? null,
    games: games ? Number(games) : 0,
  });
}

function lookupVgc(name) {
  return vgcByName.get(name) ?? { winRate: null, games: 0 };
}

const roster = pikaIndex.topPokemon.map((entry) => {
  const v = lookupVgc(entry.name);
  return {
    rank: entry.rank,
    name: entry.name,
    usagePct: entry.usagePct,
    winRate: v.winRate,
    games: v.games,
  };
});

if (args.json) {
  console.log(JSON.stringify(roster, null, 2));
  process.exit(0);
}

console.log("format:", fmt.display);
console.log("data date:", date);
console.log(
  "officially listed (Pikalytics championspreview index):",
  roster.length,
);
console.log("vgcpast Reg M-A + Pre-Champions VGC replays:", fmt.totalReplays);
console.log();

const header = "rank | name                    | usage%  | winrate% | games";
console.log(header);
console.log("-".repeat(header.length));
for (const p of roster) {
  const wr =
    p.winRate !== null && p.winRate !== undefined
      ? p.winRate.toFixed(2).padStart(7)
      : "   N/A ";
  const games = p.games > 0 ? String(p.games) : "-";
  console.log(
    String(p.rank).padStart(4),
    "|",
    p.name.padEnd(23),
    "|",
    p.usagePct.toFixed(2).padStart(6),
    "|",
    wr,
    "|",
    games.padStart(5),
  );
}
