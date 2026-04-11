import { readdirSync, readFileSync } from "fs";

const tiers = ["Gen9VGCRegulationM-A", "Gen9VGCRegulationM-A_Bo3_", "Gen9Pre-ChampionsVGC"];

for (const tier of tiers) {
  const dir = `home-data/storage/vgcpast/parsed/${tier}`;
  let files;
  try {
    files = readdirSync(dir).filter(f => f.endsWith(".json") && !f.startsWith("_"));
  } catch {
    console.log(`${tier}: no dir`);
    continue;
  }

  let hasPreview = 0, hasBrought = 0, total = 0;
  const teamSizes = {};
  const teamKeys = {};  // canonical 6-mon key → count

  for (const f of files) {
    const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    total++;
    for (const team of r.teams) {
      if (team.preview.length > 0) hasPreview++;
      if (team.brought.length > 0) hasBrought++;
      const sz = team.preview.length;
      teamSizes[sz] = (teamSizes[sz] || 0) + 1;

      // Canonical team key
      if (team.preview.length >= 4) {
        const key = team.preview.map(m => m.species).sort().join(" / ");
        teamKeys[key] = (teamKeys[key] || 0) + 1;
      }
    }
  }

  console.log(`\n${tier}: ${total} replays, sides with preview=${hasPreview} brought=${hasBrought}`);
  console.log(`  preview sizes:`, teamSizes);

  // Top teams
  const sorted = Object.entries(teamKeys).sort((a, b) => b[1] - a[1]);
  console.log(`  unique teams: ${sorted.length}`);
  console.log(`  top 10 teams:`);
  for (const [key, count] of sorted.slice(0, 10)) {
    console.log(`    ${count}x  ${key}`);
  }

  // Distribution of team frequency
  const freqDist = {};
  for (const [, count] of sorted) {
    const bucket = count >= 10 ? "10+" : count >= 5 ? "5-9" : count >= 3 ? "3-4" : count >= 2 ? "2" : "1";
    freqDist[bucket] = (freqDist[bucket] || 0) + 1;
  }
  console.log(`  frequency distribution:`, freqDist);
}
