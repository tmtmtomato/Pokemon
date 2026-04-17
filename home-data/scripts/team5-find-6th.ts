/**
 * team5-find-6th.ts
 *
 * 現5体の弱点を補完する枠6候補を探索。
 * 各候補について、TOP50相手への改善度を評価。
 */
import {
  effectiveKoN,
  adjustedEKoN,
  baseSpecies,
  isSandChipImmune,
  SAND_CHIP_PCT,
  matchupValue,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, DamageMatrixEntry } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

type TypeName = Parameters<typeof getEffectiveness>[0];

// ── i18n ──
const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;

// ── Load data ──
const teamMatchup = JSON.parse(
  readFileSync("home-data/storage/analysis/_latest-team-matchup.json", "utf-8")
);
const matrix: DamageMatrix = teamMatchup.damageMatrix;
const pool: any[] = teamMatchup.pool;

const allRaw: any[] = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/all-raw.json", "utf-8")
);
const top50Raw = allRaw.slice(0, 50);

// ── Pool lookup ──
const poolMap = new Map<string, any>();
const poolSpeeds = new Map<string, number>();
const poolTypes = new Map<string, string[]>();
for (const p of pool) {
  poolMap.set(p.name, p);
  poolSpeeds.set(p.name, p.speedStat ?? 0);
  const species = getSpecies(baseSpecies(p.name));
  poolTypes.set(p.name, (species?.types ?? []) as string[]);
}

// ── Current team ──
const TEAM = ["Hippowdon", "Basculegion-F", "Lucario-Mega", "Delphox-Mega", "Glimmora"];
const teamSet = new Set(TEAM);
const teamBaseSet = new Set(TEAM.map(n => baseSpecies(n)));

// ── Chip helpers ──
function srChipPct(name: string): number {
  const types = poolTypes.get(name) ?? [];
  return getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100;
}
function sandChip(name: string): boolean {
  const types = poolTypes.get(name) ?? [];
  const ability = poolMap.get(name)?.ability ?? "";
  return !isSandChipImmune(types as string[], ability);
}

// ── Verdict logic ──
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

// ── Map pokechamdb to pool name ──
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

// ─�� Pre-compute current team's best verdict per opponent ──
const verdictPriority: Record<string, number> = { "◎": 0, "○": 1, "△": 2, "×": 3 };

interface OppInfo {
  rank: number;
  name: string;
  chipPct: number;
  currentBest: string;    // best verdict from current 5
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

  oppInfos.push({
    rank: i + 1,
    name: opp,
    chipPct,
    currentBest: bestVerdict,
    currentBestMember: bestMember,
  });
}

// ── Identify problem opponents (△ or ×, and risky ○) ──
// "Risky ○" = ○ but only one member can handle it, and that member takes big damage
const problems = oppInfos.filter(o => o.currentBest === "×" || o.currentBest === "△");
const borderline = oppInfos.filter(o => {
  if (o.currentBest !== "○") return false;
  // Count how many members have ○ or better
  let goodCount = 0;
  for (const me of TEAM) {
    const v = getVerdict(me, o.name, o.chipPct);
    if (v === "◎" || v === "○") goodCount++;
  }
  return goodCount <= 1; // only 1 member can handle → risky
});

console.log("=== 現5体の弱点 ===");
console.log(`× 処理不能: ${problems.filter(o => o.currentBest === "×").map(o => jaName(o.name)).join(", ") || "なし"}`);
console.log(`△ 怪しい: ${problems.filter(o => o.currentBest === "△").map(o => jaName(o.name)).join(", ") || "なし"}`);
console.log(`○ 単独依存: ${borderline.map(o => `${jaName(o.name)}(${jaName(o.currentBestMember)}のみ)`).join(", ") || "���し"}`);

const targetOpps = [...problems, ...borderline];
console.log(`\n補完対象: ${targetOpps.length}体`);
for (const o of targetOpps) {
  console.log(`  #${o.rank} ${jaName(o.name)} [現${o.currentBest}]`);
}

// ── Evaluate each candidate ──
interface CandidateScore {
  name: string;
  nameJa: string;
  speed: number;
  // How many problem opponents does this candidate improve?
  upgrades: { opp: string; oppJa: string; rank: number; from: string; to: string }[];
  upgradeScore: number; // weighted score
  // Also track general coverage improvement
  totalUpgrades: number; // across ALL top50
}

const candidates: CandidateScore[] = [];

for (const p of pool) {
  // Skip current team members and their base species
  if (teamSet.has(p.name) || teamBaseSet.has(baseSpecies(p.name))) continue;
  // Must have matrix data
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

      // Check if this is a target opponent
      const isTarget = targetOpps.some(t => t.name === o.name);
      if (isTarget) {
        upgrades.push({
          opp: o.name,
          oppJa: jaName(o.name),
          rank: o.rank,
          from: o.currentBest,
          to: candidateVerdict,
        });
        // Weight by severity: ×→◎ = 6, ×→○ = 4, △→◎ = 3, △→○ = 2, ○→◎ = 1
        const severity = currentPri - candidatePri;
        const baseWeight = o.currentBest === "×" ? 3 : o.currentBest === "△" ? 2 : 1;
        // Weight by usage rank (higher rank = more important)
        const rankWeight = 1 + (50 - o.rank) / 50;
        upgradeScore += severity * baseWeight * rankWeight;
      }
    }
  }

  if (upgrades.length > 0) {
    candidates.push({
      name: p.name,
      nameJa: jaName(p.name),
      speed: poolSpeeds.get(p.name) ?? 0,
      upgrades,
      upgradeScore,
      totalUpgrades,
    });
  }
}

// Sort by upgrade score
candidates.sort((a, b) => b.upgradeScore - a.upgradeScore);

// ── Output top 15 ──
console.log(`\n=== 枠6候補 TOP15 ===`);
for (let i = 0; i < Math.min(15, candidates.length); i++) {
  const c = candidates[i];
  const isMega = c.name.includes("-Mega");
  // Check conflict: team already has 2 megas
  const teamMegas = TEAM.filter(n => n.includes("-Mega")).length;
  const megaConflict = isMega && teamMegas >= 2 ? " ⚠メガ枠競合" : "";

  console.log(`\n${i + 1}. ${c.nameJa} (${c.name}, S${c.speed}) — スコア${c.upgradeScore.toFixed(1)}${megaConflict}`);
  console.log(`   補完対象 ${c.upgrades.length}体改善, TOP50全体 ${c.totalUpgrades}体改善`);
  for (const u of c.upgrades) {
    console.log(`   #${u.rank} ${u.oppJa}: ${u.from}→${u.to}`);
  }
}

// ── Also show non-mega candidates separately ──
const nonMegaCandidates = candidates.filter(c => !c.name.includes("-Mega"));
console.log(`\n=== 非メガ枠 TOP10 ===`);
for (let i = 0; i < Math.min(10, nonMegaCandidates.length); i++) {
  const c = nonMegaCandidates[i];
  console.log(`\n${i + 1}. ${c.nameJa} (S${c.speed}) — スコア${c.upgradeScore.toFixed(1)}`);
  console.log(`   補完対��� ${c.upgrades.length}体改善, TOP50全体 ${c.totalUpgrades}体改善`);
  for (const u of c.upgrades) {
    console.log(`   #${u.rank} ${u.oppJa}: ${u.from}→${u.to}`);
  }
}
