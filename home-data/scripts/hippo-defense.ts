/**
 * Hippowdon Defensive Optimization
 *
 * Compare Impish vs Careful × SP splits to find which build survives the most attacks.
 * Key metric: "2耐え" = not OHKOd (can always set SR + 1 more action)
 *
 * Important: Draco Meteor is single-use (C-2 penalty), so treat it as a 1-shot threat.
 * Solar Beam requires charge in sand → also treated specially.
 *
 * For each build:
 *   - Count how many meta attacks it survives (not OHKOd)
 *   - Show which attacks flip between 確2 and 確3 (with Sitrus) across builds
 */

import { calculate, Pokemon, Move, Field } from "../../src/index.js";
import { getSpecies, getMove as getMoveData } from "../../src/data/index.js";
import { readFileSync } from "node:fs";

const top30Raw = JSON.parse(
  readFileSync("home-data/storage/pokechamdb/top30-raw.json", "utf-8")
);

const field = new Field({ gameType: "Singles", weather: "Sand" });

// ── Draco Meteor users: only hit once, so only OHKO matters ──
const SINGLE_USE_MOVES = new Set(["Draco Meteor", "Overheat"]);
// Solar Beam needs charge in sand (Hippowdon sets sand) → practically unusable turn 1
// Exception: Mega Charizard Y sets sun with Drought, overriding sand if slower...
// but Charizard is faster. Actually Drought sets on switch-in.
// If Charizard Mega Y switches in vs Hippowdon, weather = Sun (Charizard is slower? No, it depends)
// Hippowdon base speed 47, Mega Charizard Y base speed 100 → Charizard is faster
// Sand Stream vs Drought: both trigger on switch-in. Slower setter wins.
// Hippowdon is SLOWER → Sand overwrites Drought. So Sand stays.
// But if Charizard is already on field and Hippowdon switches in → Sand overwrites.
// For lead Hippowdon vs lead Charizard: both switch in turn 1, Hippowdon slower → Sand stays.
// So Solar Beam DOES need charge turn. But Mega Meganium has "Mega Sol" ability...
// Let's just flag it and keep it in the analysis.

// ── Meta attacks against Hippowdon ──────────────────────────────────────
interface MetaAttack {
  pokemon: string;
  rank: number;
  move: string;
  movePct: number;
  category: "Physical" | "Special";
  attacker: any;
  isSingleUse: boolean;
  notes: string;
}

const metaAttacks: MetaAttack[] = [];

for (const raw of top30Raw) {
  const species = getSpecies(raw.name);
  if (!species || raw.name === "Hippowdon") continue;

  const primaryItem = raw.items?.[0]?.name || "";
  const isMega = primaryItem.endsWith("ite") && primaryItem !== "Eviolite" && !!species.mega;
  const nature = raw.natures?.[0]?.name || "Hardy";
  const ability = isMega ? species.mega.ability : (raw.abilities?.[0]?.name || species.abilities[0]);
  const sp = raw.spreads?.[0] || {};

  const attacker = new Pokemon({ name: raw.name, sp, nature, ability, item: primaryItem, isMega });

  for (const m of raw.moves) {
    if (m.pct < 5) continue;
    const md = getMoveData(m.name);
    if (!md || md.category === "Status" || md.basePower <= 0) continue;

    let notes = "";
    const isSingleUse = SINGLE_USE_MOVES.has(m.name);
    if (isSingleUse) notes = "単発技(C/A-2)";
    if (m.name === "Solar Beam" && !isMega) notes = "砂下要チャージ";
    // Mega Meganium has Mega Sol which may set sun...
    if (m.name === "Solar Beam" && raw.name === "Meganium") notes = "メガソル→即発動";

    metaAttacks.push({
      pokemon: raw.name,
      rank: raw.rank,
      move: m.name,
      movePct: m.pct,
      category: md.category as "Physical" | "Special",
      attacker,
      isSingleUse,
      notes,
    });
  }
}

console.log(`Total meta attacks to evaluate: ${metaAttacks.length}\n`);

// ── Hippowdon builds to compare ───────────────────────────────────────────
const builds = [
  // Impish (+Def)
  { label: "わんぱく H32/B32/D2",  nature: "Impish",  sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 } },
  { label: "わんぱく H32/B22/D12", nature: "Impish",  sp: { hp: 32, atk: 0, def: 22, spa: 0, spd: 12, spe: 0 } },
  { label: "わんぱく H32/B16/D18", nature: "Impish",  sp: { hp: 32, atk: 0, def: 16, spa: 0, spd: 18, spe: 0 } },
  { label: "わんぱく H32/B2/D32",  nature: "Impish",  sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  // Careful (+SpD)
  { label: "しんちょう H32/B32/D2",  nature: "Careful", sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 } },
  { label: "しんちょう H32/B22/D12", nature: "Careful", sp: { hp: 32, atk: 0, def: 22, spa: 0, spd: 12, spe: 0 } },
  { label: "しんちょう H32/B16/D18", nature: "Careful", sp: { hp: 32, atk: 0, def: 16, spa: 0, spd: 18, spe: 0 } },
  { label: "しんちょう H32/B2/D32",  nature: "Careful", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
  // Reference: Adamant (current)
  { label: "いじっぱり H32/B2/D32", nature: "Adamant", sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 } },
];

// ── Calculate each build vs all attacks ───────────────────────────────────
interface BuildResult {
  label: string;
  nature: string;
  hp: number;
  def: number;
  spd: number;
  atk: number;
  // Per-attack results
  attacks: {
    pokemon: string;
    move: string;
    movePct: number;
    category: string;
    minPct: number;
    maxPct: number;
    koN: number;
    koChance: number;
    sitrusSurvive3: boolean; // survives 2 hits with Sitrus?
    isSingleUse: boolean;
    notes: string;
  }[];
  // Aggregates
  surviveOHKO: number;     // not OHKOd (main metric)
  survive2withSitrus: number; // survives 2 hits with Sitrus (確3以上)
}

const buildResults: BuildResult[] = [];

for (const build of builds) {
  const hippo = new Pokemon({
    name: "Hippowdon",
    sp: build.sp,
    nature: build.nature,
    ability: "Sand Stream",
    item: "Sitrus Berry",
  });

  const maxHP = hippo.maxHP();
  const sitrusHeal = Math.floor(maxHP * 0.25);

  const attacks: BuildResult["attacks"] = [];
  let surviveOHKO = 0;
  let survive2withSitrus = 0;

  for (const ma of metaAttacks) {
    try {
      const move = new Move(ma.move);
      const result = calculate(ma.attacker, hippo, move, field);
      const [minPct, maxPct] = result.percentRange();
      const rolls = result.rolls as number[];
      const ko = result.koChance();
      const koN = ko?.n ?? 99;
      const koChance = ko?.chance ?? 0;

      const isOHKO = koN === 1 && koChance >= 0.5;

      // Sitrus 2-hit survival: simulate all roll combos
      let surviveCount = 0;
      const totalCombos = rolls.length * rolls.length;
      for (const r1 of rolls) {
        for (const r2 of rolls) {
          let rem = maxHP - r1;
          if (rem <= 0) continue;
          if (rem <= Math.floor(maxHP * 0.5)) rem += sitrusHeal;
          rem -= r2;
          if (rem > 0) surviveCount++;
        }
      }
      const sitrusSurvive3 = surviveCount / totalCombos > 0.5; // >50% chance to survive 2 hits

      if (!isOHKO) surviveOHKO++;
      if (sitrusSurvive3 || koN >= 3) survive2withSitrus++;

      attacks.push({
        pokemon: ma.pokemon,
        move: ma.move,
        movePct: ma.movePct,
        category: ma.category,
        minPct,
        maxPct,
        koN,
        koChance,
        sitrusSurvive3,
        isSingleUse: ma.isSingleUse,
        notes: ma.notes,
      });
    } catch (e) {
      attacks.push({
        pokemon: ma.pokemon,
        move: ma.move,
        movePct: ma.movePct,
        category: ma.category,
        minPct: 0,
        maxPct: 0,
        koN: 99,
        koChance: 0,
        sitrusSurvive3: true,
        isSingleUse: ma.isSingleUse,
        notes: "calc error",
      });
      surviveOHKO++;
      survive2withSitrus++;
    }
  }

  buildResults.push({
    label: build.label,
    nature: build.nature,
    hp: maxHP,
    def: hippo.stat("def"),
    spd: hippo.stat("spd"),
    atk: hippo.stat("atk"),
    attacks,
    surviveOHKO,
    survive2withSitrus,
  });
}

// ── Display: Build comparison summary ─────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════════");
console.log("  ビルド比較サマリー");
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("Build                    | HP  | B   | D   | A   | 非確1 | オボン2耐え");
console.log("-------------------------|-----|-----|-----|-----|-------|----------");
for (const br of buildResults) {
  const label = br.label.padEnd(24);
  console.log(`${label} | ${br.hp} | ${String(br.def).padStart(3)} | ${String(br.spd).padStart(3)} | ${String(br.atk).padStart(3)} | ${String(br.surviveOHKO).padStart(3)}/${metaAttacks.length} | ${String(br.survive2withSitrus).padStart(3)}/${metaAttacks.length}`);
}

// ── Display: What changes between builds? ─────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("  確定数が変わる対面 (ビルド間の差分)");
console.log("  ※流星群/オバヒは単発技として記載 (確1でなければ実質問題なし)");
console.log("═══════════════════════════════════════════════════════════════\n");

// Group attacks by pokemon+move
const attackKeys = new Map<string, number>();
for (let i = 0; i < metaAttacks.length; i++) {
  attackKeys.set(`${metaAttacks[i].pokemon}|${metaAttacks[i].move}`, i);
}

// Find attacks where KO threshold differs across builds
for (const [key, idx] of attackKeys) {
  const ma = metaAttacks[idx];
  const resultsPerBuild = buildResults.map(br => br.attacks[idx]);

  // Check if any difference in survival
  const ohkoResults = resultsPerBuild.map(r => r.koN === 1 && r.koChance >= 0.5);
  const sitrusResults = resultsPerBuild.map(r => r.sitrusSurvive3);

  const hasOHKODiff = ohkoResults.some(v => v !== ohkoResults[0]);
  const hasSitrusDiff = sitrusResults.some(v => v !== sitrusResults[0]);

  if (!hasOHKODiff && !hasSitrusDiff) continue;

  const catMark = ma.category === "Physical" ? "物理" : "特殊";
  const singleMark = ma.isSingleUse ? " [単発]" : "";
  const notesMark = ma.notes ? ` (${ma.notes})` : "";

  console.log(`${ma.pokemon}(#${ma.rank}) ${ma.move} [${catMark}]${singleMark}${notesMark}:`);

  for (let i = 0; i < buildResults.length; i++) {
    const br = buildResults[i];
    const r = resultsPerBuild[i];

    let koLabel: string;
    if (r.koN === 1 && r.koChance >= 1.0) koLabel = "確1";
    else if (r.koN === 1) koLabel = `乱1(${(r.koChance * 100).toFixed(0)}%)`;
    else if (r.koN === 2 && r.koChance >= 1.0) koLabel = "確2";
    else if (r.koN === 2) koLabel = `乱2(${(r.koChance * 100).toFixed(0)}%)`;
    else koLabel = `確${r.koN}+`;

    const sitrusLabel = r.sitrusSurvive3 ? "オボン2耐え○" : "オボン2耐え×";
    const mark = (r.koN === 1 && r.koChance >= 0.5) ? "★確1★" : "";

    console.log(`  ${br.label.padEnd(26)} ${r.minPct.toFixed(1)}-${r.maxPct.toFixed(1)}% ${koLabel.padEnd(12)} ${sitrusLabel} ${mark}`);
  }
  console.log();
}

// ── OHKO threats per build ────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  確1される技一覧 (各ビルド)");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const br of buildResults) {
  const ohkos = br.attacks.filter(a => a.koN === 1 && a.koChance >= 0.5);
  console.log(`${br.label} (B${br.def}/D${br.spd}):`);
  if (ohkos.length === 0) {
    console.log("  確1なし！");
  } else {
    for (const a of ohkos) {
      const cat = a.category === "Physical" ? "物" : "特";
      const chance = a.koChance >= 1.0 ? "確定" : `${(a.koChance * 100).toFixed(0)}%`;
      const note = a.notes ? ` [${a.notes}]` : "";
      const single = a.isSingleUse ? " [単発]" : "";
      console.log(`  ${a.pokemon} ${a.move}(${cat}): ${a.minPct.toFixed(1)}-${a.maxPct.toFixed(1)}% ${chance}${single}${note}`);
    }
  }
  console.log();
}

// ── Physical vs Special threat breakdown ──────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  物理/特殊の脅威内訳 — 確2以上の攻撃数");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const br of buildResults) {
  const phys2hko = br.attacks.filter(a => a.category === "Physical" && a.koN <= 2 && !a.isSingleUse);
  const spec2hko = br.attacks.filter(a => a.category === "Special" && a.koN <= 2 && !a.isSingleUse);
  const physOHKO = br.attacks.filter(a => a.category === "Physical" && a.koN === 1 && a.koChance >= 0.5);
  const specOHKO = br.attacks.filter(a => a.category === "Special" && a.koN === 1 && a.koChance >= 0.5);

  console.log(`${br.label} (B${br.def}/D${br.spd}):`);
  console.log(`  物理: 確1=${physOHKO.length}  確2以内=${phys2hko.length}  |  特殊: 確1=${specOHKO.length}  確2以内=${spec2hko.length}`);
}
