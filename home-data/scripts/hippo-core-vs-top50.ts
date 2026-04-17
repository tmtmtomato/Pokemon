/**
 * hippo-core-vs-top50.ts
 *
 * 3体コア (カバルドン + メガルカリオ + イダイトウ♀) vs pokechamdb TOP50
 * 各TOP50相手に対し、コア3体それぞれの個別matchup結果を表示。
 * "勝てるのか" = 先制確1を取れるメンバーがいるか、で判定。
 */
import {
  effectiveKoN,
  adjustedEKoN,
  baseSpecies,
  isSandChipImmune,
  MEGA_POOL_SUFFIX,
  WEATHER_ABILITIES,
  STEALTH_ROCK_USERS,
  DISGUISE_ABILITY,
  SAND_CHIP_PCT,
} from "../analyzer/team-matchup-core.js";
import type { DamageMatrix, DamageMatrixEntry } from "../analyzer/team-matchup-core.js";
import { getEffectiveness } from "../../src/index.js";
import { getSpecies } from "../../src/data/index.js";
import { readFileSync, existsSync } from "node:fs";

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

// ── Core team ──
const CORE = ["Hippowdon", "Lucario-Mega", "Basculegion-F"];
const CORE_JA = CORE.map(n => jaName(n));

// ── SR chip for each defender (assuming Hippo sets SR) ──
function srChipPct(name: string): number {
  const types = poolTypes.get(name) ?? [];
  return getEffectiveness("Rock" as TypeName, types as TypeName[]) / 8 * 100;
}

// ── Sand chip (Hippo's Sand Stream active) ──
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

// ── Map pokechamdb name to pool name (handle mega) ──
function toPoolName(raw: any): string {
  const primaryItem = raw.items?.[0]?.name || "";
  const hasMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite";
  return hasMega ? raw.name + "-Mega" : raw.name;
}

// ── Speed strings ──
function speedInfo(me: string, opp: string): string {
  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;
  if (mySpd > oppSpd) return "先制";
  if (mySpd === oppSpd) return "同速";
  return "後手";
}

// ── Evaluate core vs each top50 ──
interface MatchResult {
  rank: number;
  oppName: string;
  oppJa: string;
  oppSpeed: number;
  results: {
    coreName: string;
    coreJa: string;
    ko: string;         // core → opp KO label
    koWithChip: string;  // with sand+SR chip
    oppKo: string;       // opp → core KO label
    speed: string;       // 先制/後手/同速
    verdict: string;     // ◎/○/△/×
  }[];
  bestVerdict: string;   // best among 3 members
}

const results: MatchResult[] = [];

for (let i = 0; i < top50Raw.length; i++) {
  const raw = top50Raw[i];
  const oppPoolName = toPoolName(raw);
  if (!matrix[oppPoolName] && !matrix[raw.name]) continue;
  const opp = matrix[oppPoolName] ? oppPoolName : raw.name;

  const oppSpd = poolSpeeds.get(opp) ?? 0;
  const chipPct = (sandChip(opp) ? SAND_CHIP_PCT : 0) + srChipPct(opp);

  const memberResults = CORE.map((me, idx) => {
    const entry = matrix[me]?.[opp];
    const oppEntry = matrix[opp]?.[me];
    const eKoN = effectiveKoN(entry);
    const chipEKoN = chipPct > 0 ? adjustedEKoN(entry, chipPct) : eKoN;
    const oppEKoN = effectiveKoN(oppEntry);
    const spd = speedInfo(me, opp);
    const mySpd = poolSpeeds.get(me) ?? 0;

    // Verdict (相手の返しも考慮):
    // ◎ = 先制確1 (完全処理 — 被弾ゼロ)
    // ○ = 確1後手(相打ち覚悟) / 先制確2で返しが確2以上(2発目打てる)
    // △ = 先制確2だが返し確1(2発目打てない) / 乱1 / chip確1
    // × = 確3以上 (無理)
    const oppCanOHKO = oppEKoN <= 1.25; // opponent can OHKO us (guaranteed or high-chance)

    let verdict = "×";
    if (eKoN <= 1.0 && mySpd > oppSpd) verdict = "◎";        // first-strike guaranteed OHKO
    else if (eKoN <= 1.0 && mySpd === oppSpd) verdict = "○";  // speed-tie OHKO
    else if (eKoN <= 1.0 && !oppCanOHKO) verdict = "○";       // slower OHKO but we survive the hit
    else if (eKoN <= 1.0) verdict = "△";                      // slower OHKO and opponent OHKOs us → coin flip
    else if (eKoN <= 1.25 && mySpd > oppSpd) verdict = "○";   // first-strike random OHKO
    else if (chipEKoN <= 1.0 && mySpd > oppSpd && !oppCanOHKO) verdict = "○"; // chip-assisted OHKO first, survive return
    else if (chipEKoN <= 1.0 && mySpd > oppSpd) verdict = "△"; // chip OHKO first but return KOs us
    else if (eKoN <= 2.0 && mySpd > oppSpd && !oppCanOHKO) verdict = "○"; // first-strike 2HKO, survive return
    else if (eKoN <= 2.0 && mySpd > oppSpd) verdict = "△";    // first-strike 2HKO but return KOs us
    else if (eKoN <= 1.25) verdict = "△";                     // slower random OHKO
    else if (chipEKoN <= 1.0) verdict = "△";                  // chip OHKO but slower
    else if (eKoN <= 2.0) verdict = "△";                      // slower 2HKO

    return {
      coreName: me,
      coreJa: CORE_JA[idx],
      ko: koLabel(entry),
      koWithChip: chipPct > 0 ? koLabel(entry) + `→chip込${koLabel({ ...entry!, koN: Math.ceil((100 - chipPct) / (entry?.maxPct || 100)), koChance: 1 } as any)}` : "",
      oppKo: koLabel(oppEntry),
      speed: spd,
      verdict,
    };
  });

  // Best verdict priority: ◎ > ○ > △ > ×
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
console.log("=== 3体コア vs pokechamdb TOP50 ===");
console.log(`コア: ${CORE_JA.join(" / ")}`);
console.log(`速度: カバ=${poolSpeeds.get("Hippowdon")}, メガルカリオ=${poolSpeeds.get("Lucario-Mega")}, イダイトウ♀=${poolSpeeds.get("Basculegion-F")}`);
console.log("");

// Group by verdict
const groups = { "◎": [] as MatchResult[], "○": [] as MatchResult[], "△": [] as MatchResult[], "×": [] as MatchResult[] };
for (const r of results) {
  (groups[r.bestVerdict as keyof typeof groups] ?? groups["×"]).push(r);
}

for (const [verdict, label] of [["◎", "完全処理 (先制確1)"], ["○", "処理可能 (確1後手/先制乱1/chip確1)"], ["△", "怪しい (先制確2/乱1後手)"], ["×", "処理不能 (確3以上)"]] as const) {
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

// List problem Pokemon (× and △)
if (groups["×"].length > 0) {
  console.log(`\n── 枠4-6で対策が必要な相手 ──`);
  for (const r of groups["×"]) {
    console.log(`  ★ ${r.oppJa} (#${r.rank}, S${r.oppSpeed})`);
    for (const m of r.results) {
      console.log(`    ${m.coreJa}: ${m.ko} ${m.speed}`);
    }
  }
}
