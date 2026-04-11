import { readdirSync, readFileSync } from "fs";

const dir = "home-data/storage/vgcpast/parsed/Gen9Pre-ChampionsVGC";
const files = readdirSync(dir).filter(f => f.endsWith(".json") && !f.startsWith("_"));

const cores3 = {};  // 3-mon core → count
const cores4 = {};  // 4-mon core → count

// Also track: for a given team, what 4-of-6 are brought?
const teamSelections = {};  // team key → { selections: { sel key → {count, wins} }, total, wins }

for (const f of files) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const team of r.teams) {
    if (team.preview.length < 6) continue;
    const isWinner = r.winner !== undefined && team.player === r.winner;
    const species = team.preview.map(m => m.species).sort();
    const teamKey = species.join(" / ");

    // Track selections per team
    if (!teamSelections[teamKey]) {
      teamSelections[teamKey] = { selections: {}, total: 0, wins: 0 };
    }
    teamSelections[teamKey].total++;
    if (isWinner) teamSelections[teamKey].wins++;

    if (team.brought.length > 0) {
      const selKey = team.brought.map(m => m.species).sort().join(" / ");
      if (!teamSelections[teamKey].selections[selKey]) {
        teamSelections[teamKey].selections[selKey] = { count: 0, wins: 0 };
      }
      teamSelections[teamKey].selections[selKey].count++;
      if (isWinner) teamSelections[teamKey].selections[selKey].wins++;
    }

    // 3-mon cores
    for (let i = 0; i < species.length; i++) {
      for (let j = i + 1; j < species.length; j++) {
        for (let k = j + 1; k < species.length; k++) {
          const key = [species[i], species[j], species[k]].join(" / ");
          cores3[key] = (cores3[key] || 0) + 1;
        }
      }
    }
  }
}

// 3-mon cores
const sorted3 = Object.entries(cores3).sort((a, b) => b[1] - a[1]);
console.log(`=== 3-mon cores (top 15 of ${sorted3.length}) ===`);
for (const [key, count] of sorted3.slice(0, 15)) {
  console.log(`  ${count}x  ${key}`);
}

const freqDist3 = {};
for (const [, count] of sorted3) {
  const bucket = count >= 100 ? "100+" : count >= 50 ? "50-99" : count >= 20 ? "20-49" : count >= 10 ? "10-19" : "<10";
  freqDist3[bucket] = (freqDist3[bucket] || 0) + 1;
}
console.log(`  frequency dist:`, freqDist3);

// Top team selection patterns
console.log(`\n=== Selection patterns for top 3 teams ===`);
const topTeams = Object.entries(teamSelections).sort((a, b) => b[1].total - a[1].total).slice(0, 3);
for (const [teamKey, data] of topTeams) {
  const wr = data.total > 0 ? (data.wins / data.total * 100).toFixed(1) : "?";
  console.log(`\n${teamKey} (${data.total}x, wr ${wr}%)`);
  const sels = Object.entries(data.selections).sort((a, b) => b[1].count - a[1].count);
  for (const [selKey, selData] of sels.slice(0, 5)) {
    const selWr = selData.count > 0 ? (selData.wins / selData.count * 100).toFixed(1) : "?";
    const pct = (selData.count / data.total * 100).toFixed(1);
    console.log(`  ${selData.count}x (${pct}%, wr ${selWr}%) → ${selKey}`);
  }
}
