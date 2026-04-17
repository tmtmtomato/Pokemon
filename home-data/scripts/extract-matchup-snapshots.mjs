/**
 * extract-matchup-snapshots.mjs
 *
 * Retroactively extracts compact snapshots from existing team-matchup JSON files
 * and builds the _matchup-history.json accumulation file.
 *
 * Usage:
 *   node home-data/scripts/extract-matchup-snapshots.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_DIR = resolve(__dirname, "../storage/analysis");

// Find all dated team-matchup files (exclude _latest-)
const files = readdirSync(ANALYSIS_DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}-team-matchup\.json$/.test(f))
  .sort(); // chronological order by filename

console.log(`Found ${files.length} team-matchup files to extract:`);
for (const f of files) console.log(`  ${f}`);

/** @type {import("../types/matchup-history.js").MatchupHistory} */
const history = { version: 1, snapshots: [] };

for (const file of files) {
  const dateArg = file.replace("-team-matchup.json", "");
  console.log(`\nExtracting ${file}...`);

  const raw = JSON.parse(readFileSync(resolve(ANALYSIS_DIR, file), "utf-8"));

  const topTeams = (raw.topTeams ?? []).slice(0, 10).map((t, i) => ({
    rank: t.rank ?? i + 1,
    members: t.members,
    winRate: t.winRate,
    compositeScore: t.compositeScore ?? 0,
    deadMemberCount: t.deadMemberCount ?? 0,
  }));

  const pokemonPickRates = {};
  const pokemonSelectionRates = {};
  for (const ps of raw.pokemonStats ?? []) {
    pokemonPickRates[ps.name] = Math.round(ps.pickRate * 1000) / 1000;
    pokemonSelectionRates[ps.name] = Math.round(ps.selectionRate * 1000) / 1000;
  }

  const topCores = (raw.topCores ?? []).slice(0, 10).map(c => ({
    members: c.members,
    score: Math.round(c.score * 1000) / 1000,
  }));

  const pool = raw.pool ?? [];

  /** @type {import("../types/matchup-history.js").MatchupSnapshot} */
  const snapshot = {
    generatedAt: raw.generatedAt ?? new Date(file.slice(0, 10)).toISOString(),
    dateArg,
    config: {
      totalTeams: raw.config?.totalTeams ?? 0,
      gamesPerTeam: raw.config?.gamesPerTeam ?? 0,
      poolSize: raw.config?.poolSize ?? pool.length,
      seed: 0, // seed not stored in legacy output
    },
    topTeamWinRate: topTeams[0]?.winRate ?? 0,
    topTeamCompositeScore: topTeams[0]?.compositeScore ?? 0,
    topTeams,
    pokemonPickRates,
    pokemonSelectionRates,
    topCores,
    poolStats: {
      total: pool.length,
      megas: pool.filter(p => p.isMega).length,
    },
  };

  history.snapshots.push(snapshot);

  const wr = ((snapshot.topTeamWinRate) * 100).toFixed(1);
  console.log(`  Top WR: ${wr}%, Teams: ${snapshot.config.totalTeams}, Pool: ${snapshot.poolStats.total}`);
  console.log(`  Pokemon tracked: ${Object.keys(pokemonPickRates).length}, Cores: ${topCores.length}`);
}

const outPath = resolve(ANALYSIS_DIR, "_matchup-history.json");
writeFileSync(outPath, JSON.stringify(history, null, 2) + "\n", "utf-8");

const sizeKB = Math.round(readFileSync(outPath).length / 1024);
console.log(`\nWritten ${outPath} (${sizeKB}KB, ${history.snapshots.length} snapshots)`);
