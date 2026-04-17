/**
 * team5-find-6th-v2.ts
 *
 * メガカイリューは砂+SRでマルチスケイル崩壊→実質処理可能として除外。
 * 残りの弱点補完候補を探索。
 */
import {
  effectiveKoN,
  adjustedEKoN,
  baseSpecies,
  isSandChipImmune,
  SAND_CHIP_PCT,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, DamageMatrixEntry } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

type TypeName = Parameters<typeof getEffectiveness>[0];

const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;

const teamMatchup = JSON.parse(
  readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8")
);
const matrix: DamageMatrix = teamMatchup.damageMatrix;
const pool: any[] = teamMatchup.pool;
const allRaw: any[] = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/all-raw.json", "utf-8")
);
const top50Raw = allRaw.slice(0, 50);

const poolMap = new Map<string, any>();
const poolSpeeds = new Map<string, number>();
const poolTypes = new Map<string, string[]>();
for (const p of pool) {
  poolMap.set(p.name, p);
  poolSpeeds.set(p.name, p.speedStat ?? 0);
  const species = getSpecies(baseSpecies(p.name));
  poolTypes.set(p.name, (species?.types ?? []) as string[]);
}

const TEAM = ["Hippowdon", "Basculegion-F", "Lucario-Mega", "Delphox-Mega", "Glimmora"];
const teamSet = new Set(TEAM);
const teamBaseSet = new Set(TEAM.map(n => baseSpecies(n)));

function srChipPct(name: string): number {
  const types = poolTypes.get(name) ?? [];
  return getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100;
}
function sandChip(name: string): boolean {
  const types = poolTypes.get(name) ?? [];
  const ability = poolMap.get(name)?.ability ?? "";
  return !isSandChipImmune(types as string[], ability);
}

function koLabel(entry: DamageMatrixEntry | undefined | null): string {
  if (!entry || !entry.koN) return "---";
  if ((entry.koChance ?? 0) >= 1.0) return `確${entry.koN}`;
  return `乱${entry.koN}(${Math.round((entry.koChance ?? 0) * 100)}%)`;
}

function getVerdict(me: string, opp: string, chipPct: number): string {
  const entry = matrix[me]?.[opp];
  const oppEntry = matrix[opp]?.[me];
  const eKoN = effectiveKoN(entry);
  const chipEKoN = chipPct > 0 ? adjustedEKoN(entry, chipPct) : eKoN;
  const oppEKoN = effectiveKoN(oppEntry);
  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;
  const oppCanOHKO = oppEKoN <= 1.25;

  if (eKoN <= 1.0 && mySpd > oppSpd) return "◎";
  if (eKoN <= 1.0 && mySpd === oppSpd) return "○";
  if (eKoN <= 1.0 && !oppCanOHKO) return "○";
  if (eKoN <= 1.0) return "△";
  if (eKoN <= 1.25 && mySpd > oppSpd) return "○";
  if (chipEKoN <= 1.0 && mySpd > oppSpd && !oppCanOHKO) return "○";
  if (chipEKoN <= 1.0 && mySpd > oppSpd) return "△";
  if (eKoN <= 2.0 && mySpd > oppSpd && !oppCanOHKO) return "○";
  if (eKoN <= 2.0 && mySpd > oppSpd) return "△";
  if (eKoN <= 1.25) return "△";
  if (chipEKoN <= 1.0) return "△";
  if (eKoN <= 2.0) return "△";
  return "×";
}

function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

const verdictPriority: Record<string, number> = { "◎": 0, "○": 1, "△": 2, "×": 3 };

// ── Build opponent info (exclude Dragonite-Mega from × because sand breaks Multiscale) ──
interface OppInfo {
  rank: number;
  name: string;
  chipPct: number;
  currentBest: string;
  currentBestMember: string;
}

const oppInfos: OppInfo[] = [];

for (let i = 0; i < top50Raw.length; i++) {
  const raw = top50Raw[i];
  const oppPoolName = toPoolName(raw);
  const opp = matrix[oppPoolName] ? oppPoolName : (matrix[raw.name] ? raw.name : null);
  if (!opp) continue;

  const chipPct = (sandChip(opp) ? SAND_CHIP_PCT : 0) + srChipPct(opp);

  let bestVerdict = "×";
  let bestMember = "";
  for (const me of TEAM) {
    const v = getVerdict(me, opp, chipPct);
    if ((verdictPriority[v] ?? 3) < (verdictPriority[bestVerdict] ?? 3)) {
      bestVerdict = v;
      bestMember = me;
    }
  }

  // Override: Dragonite-Mega → treat as ○ (sand breaks Multiscale, matrix shows halved damage)
  if (opp === "Dragonite-Mega" && bestVerdict === "×") {
    bestVerdict = "○";
    bestMember = "Basculegion-F"; // 乱2(80%) → real damage ~doubled = 確1 class
  }

  oppInfos.push({ rank: i + 1, name: opp, chipPct, currentBest: bestVerdict, currentBestMember: bestMember });
}

// ── Identify weaknesses ──
const problems = oppInfos.filter(o => o.currentBest === "×" || o.currentBest === "△");
const borderline = oppInfos.filter(o => {
  if (o.currentBest !== "○") return false;
  let goodCount = 0;
  for (const me of TEAM) {
    const v = getVerdict(me, o.name, o.chipPct);
    if (v === "◎" || v === "○") goodCount++;
  }
  // Also count Dragonite-Mega override
  if (o.name === "Dragonite-Mega") return false; // sand handles it
  return goodCount <= 1;
});

const targetOpps = [...problems, ...borderline];

console.log("=== 補完対象（マルチスケイル崩壊考慮後） ===");
for (const o of targetOpps) {
  const details: string[] = [];
  for (const me of TEAM) {
    const entry = matrix[me]?.[o.name];
    const oppEntry = matrix[o.name]?.[me];
    const v = getVerdict(me, o.name, o.chipPct);
    const spd = (poolSpeeds.get(me) ?? 0) > (poolSpeeds.get(o.name) ?? 0) ? "先制" :
                (poolSpeeds.get(me) ?? 0) === (poolSpeeds.get(o.name) ?? 0) ? "同速" : "後手";
    if (v === "◎" || v === "○") {
      details.push(`${jaName(me)}${v}`);
    }
  }
  const handleStr = details.length > 0 ? details.join(", ") : "処理不能";
  console.log(`  #${o.rank} ${jaName(o.name)} (S${poolSpeeds.get(o.name)}) [現${o.currentBest}] — ${handleStr}`);
}

// ── Evaluate candidates ──
interface CandidateScore {
  name: string;
  nameJa: string;
  speed: number;
  types: string[];
  upgrades: { opp: string; oppJa: string; rank: number; from: string; to: string;
              ko: string; oppKo: string; speed: string }[];
  upgradeScore: number;
  totalUpgrades: number;
}

const candidates: CandidateScore[] = [];

for (const p of pool) {
  if (teamSet.has(p.name) || teamBaseSet.has(baseSpecies(p.name))) continue;
  if (!matrix[p.name]) continue;

  const upgrades: CandidateScore["upgrades"] = [];
  let upgradeScore = 0;
  let totalUpgrades = 0;

  for (const o of oppInfos) {
    const candidateVerdict = getVerdict(p.name, o.name, o.chipPct);
    const currentPri = verdictPriority[o.currentBest] ?? 3;
    const candidatePri = verdictPriority[candidateVerdict] ?? 3;

    if (candidatePri < currentPri) {
      totalUpgrades++;
      const isTarget = targetOpps.some(t => t.name === o.name);
      if (isTarget) {
        const entry = matrix[p.name]?.[o.name];
        const oppEntry = matrix[o.name]?.[p.name];
        const mySpd = poolSpeeds.get(p.name) ?? 0;
        const oppSpd = poolSpeeds.get(o.name) ?? 0;
        upgrades.push({
          opp: o.name, oppJa: jaName(o.name), rank: o.rank,
          from: o.currentBest, to: candidateVerdict,
          ko: koLabel(entry), oppKo: koLabel(oppEntry),
          speed: mySpd > oppSpd ? "先制" : mySpd === oppSpd ? "同速" : "���手",
        });
        const severity = currentPri - candidatePri;
        const baseWeight = o.currentBest === "×" ? 3 : o.currentBest === "△" ? 2 : 1;
        const rankWeight = 1 + (50 - o.rank) / 50;
        upgradeScore += severity * baseWeight * rankWeight;
      }
    }
  }

  if (upgrades.length > 0 || totalUpgrades >= 3) {
    candidates.push({
      name: p.name, nameJa: jaName(p.name),
      speed: poolSpeeds.get(p.name) ?? 0,
      types: poolTypes.get(p.name) ?? [],
      upgrades, upgradeScore, totalUpgrades,
    });
  }
}

candidates.sort((a, b) => b.upgradeScore - a.upgradeScore || b.totalUpgrades - a.totalUpgrades);

// ── Output ──
// Separate mega vs non-mega (team already has 2 megas: Lucario-Mega + Delphox-Mega)
const nonMega = candidates.filter(c => !c.name.includes("-Mega"));
const mega = candidates.filter(c => c.name.includes("-Mega"));

console.log(`\n=== 非メガ枠6候補 TOP15 ===`);
for (let i = 0; i < Math.min(15, nonMega.length); i++) {
  const c = nonMega[i];
  console.log(`\n${i + 1}. ${c.nameJa} (${c.name}, S${c.speed}, ${c.types.join("/")}) — スコア${c.upgradeScore.toFixed(1)}, 全体+${c.totalUpgrades}`);
  for (const u of c.upgrades) {
    console.log(`   #${u.rank} ${u.oppJa}: ${u.from}→${u.to} (${u.ko} ${u.speed} ← ${u.oppKo})`);
  }
}

console.log(`\n=== メガ枠候補 TOP5 (既にメガ2体、入替前提) ===`);
for (let i = 0; i < Math.min(5, mega.length); i++) {
  const c = mega[i];
  console.log(`\n${i + 1}. ${c.nameJa} (S${c.speed}, ${c.types.join("/")}) — スコア${c.upgradeScore.toFixed(1)}, 全体+${c.totalUpgrades}`);
  for (const u of c.upgrades) {
    console.log(`   #${u.rank} ${u.oppJa}: ${u.from}→${u.to} (${u.ko} ${u.speed} ← ${u.oppKo})`);
  }
}
