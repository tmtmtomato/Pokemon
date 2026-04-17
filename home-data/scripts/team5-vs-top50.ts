/**
 * team5-vs-top50.ts
 *
 * 5体構築 vs pokechamdb TOP50
 * カバルドン / イダイトウ♀ / メガルカリオ / メガマフォクシー / キラフロル
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

// ── Team ──
const TEAM = ["Hippowdon", "Basculegion-F", "Lucario-Mega", "Delphox-Mega", "Glimmora"];
const TEAM_JA = TEAM.map(n => jaName(n));

// ── SR chip for each defender ──
function srChipPct(name: string): number {
  const types = poolTypes.get(name) ?? [];
  return getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100;
}

// ── Sand chip ──
function sandChip(name: string): boolean {
  const types = poolTypes.get(name) ?? [];
  const ability = poolMap.get(name)?.ability ?? "";
  return !isSandChipImmune(types as string[], ability);
}

// ── KO label ──
function koLabel(entry: DamageMatrixEntry | undefined | null): string {
  if (!entry || !entry.koN) return "---";
  const koN = entry.koN;
  const koChance = entry.koChance ?? 0;
  if (koChance >= 1.0) return `確${koN}`;
  return `乱${koN}(${Math.round(koChance * 100)}%)`;
}

// ── Map pokechamdb name to pool name ──
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

// ── Speed ──
function speedInfo(me: string, opp: string): string {
  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;
  if (mySpd > oppSpd) return "先制";
  if (mySpd === oppSpd) return "同速";
  return "後手";
}

// ── Evaluate ──
interface MemberResult {
  coreName: string;
  coreJa: string;
  ko: string;
  oppKo: string;
  speed: string;
  verdict: string;
}

interface MatchResult {
  rank: number;
  oppName: string;
  oppJa: string;
  oppSpeed: number;
  results: MemberResult[];
  bestVerdict: string;
}

const results: MatchResult[] = [];

for (let i = 0; i < top50Raw.length; i++) {
  const raw = top50Raw[i];
  const oppPoolName = toPoolName(raw);
  if (!matrix[oppPoolName] && !matrix[raw.name]) continue;
  const opp = matrix[oppPoolName] ? oppPoolName : raw.name;

  const oppSpd = poolSpeeds.get(opp) ?? 0;
  const chipPct = (sandChip(opp) ? SAND_CHIP_PCT : 0) + srChipPct(opp);

  const memberResults: MemberResult[] = TEAM.map((me, idx) => {
    const entry = matrix[me]?.[opp];
    const oppEntry = matrix[opp]?.[me];
    const eKoN = effectiveKoN(entry);
    const chipEKoN = chipPct > 0 ? adjustedEKoN(entry, chipPct) : eKoN;
    const oppEKoN = effectiveKoN(oppEntry);
    const spd = speedInfo(me, opp);
    const mySpd = poolSpeeds.get(me) ?? 0;

    const oppCanOHKO = oppEKoN <= 1.25;

    let verdict = "×";
    if (eKoN <= 1.0 && mySpd > oppSpd) verdict = "◎";
    else if (eKoN <= 1.0 && mySpd === oppSpd) verdict = "○";
    else if (eKoN <= 1.0 && !oppCanOHKO) verdict = "○";
    else if (eKoN <= 1.0) verdict = "△";
    else if (eKoN <= 1.25 && mySpd > oppSpd) verdict = "○";
    else if (chipEKoN <= 1.0 && mySpd > oppSpd && !oppCanOHKO) verdict = "○";
    else if (chipEKoN <= 1.0 && mySpd > oppSpd) verdict = "△";
    else if (eKoN <= 2.0 && mySpd > oppSpd && !oppCanOHKO) verdict = "○";
    else if (eKoN <= 2.0 && mySpd > oppSpd) verdict = "△";
    else if (eKoN <= 1.25) verdict = "△";
    else if (chipEKoN <= 1.0) verdict = "△";
    else if (eKoN <= 2.0) verdict = "△";

    return {
      coreName: me,
      coreJa: TEAM_JA[idx],
      ko: koLabel(entry),
      oppKo: koLabel(oppEntry),
      speed: spd,
      verdict,
    };
  });

  const priority = { "◎": 0, "○": 1, "△": 2, "×": 3 };
  const best = memberResults.reduce((a, b) =>
    (priority[a.verdict as keyof typeof priority] ?? 3) <= (priority[b.verdict as keyof typeof priority] ?? 3) ? a : b
  );

  results.push({
    rank: i + 1,
    oppName: opp,
    oppJa: jaName(opp),
    oppSpeed: oppSpd,
    results: memberResults,
    bestVerdict: best.verdict,
  });
}

// ── Output ──
console.log("=== 5体構築 vs pokechamdb TOP50 ===");
console.log(`構築: ${TEAM_JA.join(" / ")}`);
console.log(`速度: ${TEAM.map(n => `${jaName(n)}=S${poolSpeeds.get(n)}`).join(", ")}`);
console.log("");

const groups = { "◎": [] as MatchResult[], "○": [] as MatchResult[], "△": [] as MatchResult[], "×": [] as MatchResult[] };
for (const r of results) {
  (groups[r.bestVerdict as keyof typeof groups] ?? groups["×"]).push(r);
}

for (const [verdict, label] of [
  ["◎", "完全処理 (先制確1)"],
  ["○", "処理可能 (確1後手/先制乱1/先制確2耐え)"],
  ["△", "怪しい (先制確2落ち/乱1/chip確1)"],
  ["×", "処理不能 (確3以上)"],
] as const) {
  const group = groups[verdict];
  if (group.length === 0) continue;
  console.log(`\n── ${verdict} ${label} (${group.length}体) ──`);

  for (const r of group) {
    const chipPct = (sandChip(r.oppName) ? SAND_CHIP_PCT : 0) + srChipPct(r.oppName);
    const chipStr = chipPct > 0 ? ` [chip ${chipPct.toFixed(1)}%]` : "";
    console.log(`  #${r.rank} ${r.oppJa} (S${r.oppSpeed})${chipStr}`);
    for (const m of r.results) {
      const oppKoStr = m.oppKo !== "---" ? ` ← ${m.oppKo}` : "";
      console.log(`    ${m.coreJa}: ${m.ko} ${m.speed}${oppKoStr}  ${m.verdict}`);
    }
  }
}

// Summary
console.log("\n── 集計 ──");
console.log(`◎ 完全処理: ${groups["◎"].length}体`);
console.log(`○ 処理可能: ${groups["○"].length}体`);
console.log(`△ 怪しい:   ${groups["△"].length}体`);
console.log(`× 処理不能: ${groups["×"].length}体`);

// Problem Pokemon
const problems = [...groups["×"], ...groups["△"]];
if (problems.length > 0) {
  console.log(`\n── キツい相手一覧 (△×) ──`);
  // Sort: × first, then △, then by rank
  problems.sort((a, b) => {
    if (a.bestVerdict !== b.bestVerdict) return a.bestVerdict === "×" ? -1 : 1;
    return a.rank - b.rank;
  });
  for (const r of problems) {
    const marker = r.bestVerdict === "×" ? "★" : "▲";
    console.log(`  ${marker} ${r.oppJa} (#${r.rank}, S${r.oppSpeed}) ${r.bestVerdict}`);
    for (const m of r.results) {
      const oppKoStr = m.oppKo !== "---" ? ` ← ${m.oppKo}` : "";
      console.log(`    ${m.coreJa}: ${m.ko} ${m.speed}${oppKoStr}  ${m.verdict}`);
    }
  }
}
