import { readFileSync } from "node:fs";

const meta = JSON.parse(
  readFileSync("home-data/storage/analysis/2026-04-08-meta.json", "utf8"),
);

for (const fmt of meta.formats) {
  const top50 = fmt.pokemon.filter((p) => p.rank >= 1 && p.rank <= 50);
  const withBuild = top50.filter((p) => p.topBuild);
  const missing = top50.filter((p) => !p.topBuild);
  console.log(
    `\n${fmt.formatKey}: top-50 with topBuild = ${withBuild.length}/${top50.length}`,
  );
  if (missing.length) {
    console.log(
      `  missing:`,
      missing.map((p) => `#${p.rank} ${p.name}`),
    );
  }
  for (const p of withBuild.slice(0, 5)) {
    console.log(
      `  #${p.rank} ${p.name}: ${p.topBuild.nature} ${p.topBuild.evs} (${p.topBuild.pct}%)`,
    );
  }
}
