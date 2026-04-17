import { evaluate3v3, baseSpecies, isSandChipImmune } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync } from "fs";
import type { TypeName } from "../../src/types.js";

console.log("Loading data...");
const data = JSON.parse(readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8"));
const matrix = data.damageMatrix;
const pool = data.pool;

console.log("Building env...");
const poolTypes = new Map<string, string[]>();
const poolSpeeds = new Map<string, number>();
const poolAbilities = new Map<string, string>();
const WA: Record<string, string> = { "Sand Stream": "Sand", "Drought": "Sun", "Drizzle": "Rain", "Snow Warning": "Hail" };

const env = {
  weatherUsers: new Map<string, string>(),
  sandChipImmune: new Set<string>(),
  srUsers: new Set<string>(),
  srChipPct: new Map<string, number>(),
  poolTypes,
  poolAbilities,
  poolSpeeds,
  disguiseUsers: new Set<string>(),
};

for (const p of pool) {
  poolSpeeds.set(p.name, p.speedStat ?? 0);
  const sp = getSpecies(baseSpecies(p.name));
  const t = (sp?.types ?? []) as string[];
  poolTypes.set(p.name, t);
  poolAbilities.set(p.name, p.ability ?? "");
  if (WA[p.ability]) env.weatherUsers.set(p.name, WA[p.ability]);
  if (isSandChipImmune(t, p.ability)) env.sandChipImmune.add(p.name);
  if (p.moves?.includes("Stealth Rock")) env.srUsers.add(p.name);
  env.srChipPct.set(p.name, getEffectiveness("Rock" as TypeName, t as TypeName[]) / 8 * 100);
  if (p.ability === "Disguise") env.disguiseUsers.add(p.name);
}

console.log("Running evaluate3v3...");
const r = evaluate3v3(
  ["Lucario-Mega", "Delphox-Mega", "Meowscarada"],
  ["Garchomp", "Primarina", "Corviknight"],
  matrix,
  env,
);
console.log("scoreA:", r.scoreA, "scoreB:", r.scoreB, "winner:", r.winner);
