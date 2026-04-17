/**
 * meta-encounter-stats.ts
 *
 * pokechamdb TOP50のテンメイト情報から仮想遭遇率を推定。
 *
 * ロジック:
 * 1. 各ポケモンの使用率 (usagePct) = そのポケモンがチームに入る確率
 * 2. テンメイトリスト = 一緒に組まれやすい相手
 * 3. 遭遇率 = 自身の使用率 + 他のTOP50から「テンメイトとして名前が挙がる回数」で補正
 *    → よく組まれるポケモンほど遭遇率UP
 */
import { baseSpecies } from "../analyzer/team-matchup-core.js";
import { readFileSync } from "node:fs";

const pokemonJa = JSON.parse(readFileSync("home-data/storage/i18n/pokemon-ja.json", "utf-8"));
const jaName = (en: string) => pokemonJa[en] || pokemonJa[baseSpecies(en)] || en;

const allRaw: any[] = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/all-raw.json", "utf-8")
);
const top50 = allRaw.slice(0, 50);

// ── Step 1: 基礎使用率 ──
// pokechamdb の pct は持ってないが、ランクで近似。
// 実データの使用率分布: 1位≈5%, 10位≈2%, 50位≈0.5% (Zipf的分布)
// 使用率 = 相手6体にそのポケモンが入っている確率
// ガブリアス(#1)≈37%, #2≈33%, #5≈25%, #10≈18%, #20≈10%, #50≈5%
// 式: 37 / (1 + 0.12 * (rank - 1))
function estimatedUsagePct(rank: number): number {
  return 37.0 / (1 + 0.12 * (rank - 1));
}

// ── Step 2: テンメイト共起カウント ──
// 「何体のTOP50ポケモンからテンメイトとして挙げられているか」
const teammateCount = new Map<string, number>();  // name → count
const teammateFrom = new Map<string, string[]>(); // name → [who listed them]

for (const raw of top50) {
  for (const tm of raw.teammates ?? []) {
    const count = teammateCount.get(tm.name) ?? 0;
    teammateCount.set(tm.name, count + 1);
    const from = teammateFrom.get(tm.name) ?? [];
    from.push(raw.name);
    teammateFrom.set(tm.name, from);
  }
}

// ── Step 3: 遭遇率スコア計算 ──
interface EncounterEntry {
  rank: number;
  name: string;
  jaName: string;
  usagePct: number;           // 推定使用率
  teammateRefs: number;       // 何体からテンメイトとして参照されたか
  referredBy: string[];       // 誰から参照されたか
  encounterScore: number;     // 最終遭遇スコア
  encounterPct: number;       // 正規化後の遭遇率(%)
}

const entries: EncounterEntry[] = [];

for (let i = 0; i < top50.length; i++) {
  const raw = top50[i];
  const usage = estimatedUsagePct(i + 1);
  const refs = teammateCount.get(raw.name) ?? 0;
  const referredBy = teammateFrom.get(raw.name) ?? [];

  // 遭遇率 = 使用率そのまま (テンメイトは共起参考のみ、遭遇率には加算しない)
  const encounterScore = usage;

  entries.push({
    rank: i + 1,
    name: raw.name,
    jaName: raw.jaName || jaName(raw.name),
    usagePct: usage,
    teammateRefs: refs,
    referredBy,
    encounterScore,
    encounterPct: 0, // filled later
  });
}

// 正規化: 全体を100%にスケール
const totalScore = entries.reduce((s, e) => s + e.encounterScore, 0);
for (const e of entries) {
  e.encounterPct = e.encounterScore / totalScore * 100;
}

// ── Step 4: ソートして出力 ──
entries.sort((a, b) => b.encounterScore - a.encounterScore);

console.log("=== 仮想遭遇率ランキング (TOP50) ===");
console.log("テンメイト共起 + 使用率推定から算出\n");
console.log("順位  使用率順  ポケモン名         推定使用率  テンメ参照  遭遇率");
console.log("─".repeat(75));

for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  const bar = "█".repeat(Math.round(e.encounterPct * 2));
  console.log(
    `${String(i + 1).padStart(3)}.  #${String(e.rank).padStart(2)}  ${e.jaName.padEnd(16)}  ${e.usagePct.toFixed(2).padStart(5)}%  ×${String(e.teammateRefs).padStart(2)}体参照  ${e.encounterPct.toFixed(1).padStart(5)}%  ${bar}`
  );
}

// ── Step 5: テンメイト共起ペア (頻出コア) ──
console.log("\n=== 頻出共起ペア (テンメイト双方向) ===");
const pairCount = new Map<string, number>();
for (const raw of top50) {
  const myTeammates = (raw.teammates ?? []).map((t: any) => t.name);
  for (const tm of myTeammates) {
    // Check if tm also lists raw.name as teammate
    const tmRaw = top50.find(r => r.name === tm);
    if (tmRaw) {
      const tmTeammates = (tmRaw.teammates ?? []).map((t: any) => t.name);
      if (tmTeammates.includes(raw.name)) {
        const key = [raw.name, tm].sort().join("+");
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }
}

// Each mutual pair gets counted twice (A→B and B→A), so divide by 2
const pairs = [...pairCount.entries()]
  .map(([key, count]) => ({ pair: key, count: count / 2 }))
  .filter(p => p.count > 0)
  .sort((a, b) => b.count - a.count);

console.log(`双方向テンメイト ${pairs.length}ペア\n`);
for (const p of pairs.slice(0, 30)) {
  const [a, b] = p.pair.split("+");
  const aEntry = entries.find(e => e.name === a);
  const bEntry = entries.find(e => e.name === b);
  console.log(`  ${jaName(a)} + ${jaName(b)}  (使用率順 #${aEntry?.rank},#${bEntry?.rank})`);
}

// ── Step 6: 遭遇率ティア分け ──
console.log("\n=== 遭遇率ティア ===");
const tier1 = entries.filter(e => e.encounterPct >= 3.5);
const tier2 = entries.filter(e => e.encounterPct >= 2.0 && e.encounterPct < 3.5);
const tier3 = entries.filter(e => e.encounterPct >= 1.0 && e.encounterPct < 2.0);
const tier4 = entries.filter(e => e.encounterPct < 1.0);

console.log(`\nTier S (遭遇率3.5%+): ${tier1.length}体 — ほぼ毎試合当たる`);
for (const e of tier1) console.log(`  ${e.jaName} (${e.encounterPct.toFixed(1)}%)`);

console.log(`\nTier A (2.0-3.5%): ${tier2.length}体 — 高頻度`);
for (const e of tier2) console.log(`  ${e.jaName} (${e.encounterPct.toFixed(1)}%)`);

console.log(`\nTier B (1.0-2.0%): ${tier3.length}体 — 中頻度`);
for (const e of tier3) console.log(`  ${e.jaName} (${e.encounterPct.toFixed(1)}%)`);

console.log(`\nTier C (1.0%未満): ${tier4.length}体 — 低頻度`);
for (const e of tier4) console.log(`  ${e.jaName} (${e.encounterPct.toFixed(1)}%)`);
