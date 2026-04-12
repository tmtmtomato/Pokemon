#!/usr/bin/env node
/**
 * Pokemon Champions 火力指数ランキング (全攻撃技リスト版)
 *
 * Each Pokemon lists ALL learnable attack moves with firepower index.
 *
 * Data sources:
 *   - team-matchup.json pool → confirmed Champions Pokemon
 *   - species.json → base stats, types, abilities, mega data
 *   - learnsets.json → full move availability per Pokemon
 *   - moves.json → move details (BP, type, category, flags)
 *
 * Assumptions:
 *   SP=32, +nature (Adamant physical / Modest special)
 *   Non-mega item: type-matching boost (~1.2x = 4915/4096)
 *   Mega item: Mega Stone (no damage bonus)
 *   Guts users: also compared with Flame Orb (1.5x Atk + Facade 2x)
 *
 * ※ いのちのたま / こだわり系は Champions 環境に存在しない
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const species = JSON.parse(readFileSync(resolve(root, 'src/data/species.json'), 'utf-8'));
const movesData = JSON.parse(readFileSync(resolve(root, 'src/data/moves.json'), 'utf-8'));
const learnsets = JSON.parse(readFileSync(resolve(root, 'home-data/storage/learnsets.json'), 'utf-8'));

// ===== Load confirmed Champions pool =====
function loadPool() {
  const dir = resolve(root, 'home-data/storage/analysis');
  const files = readdirSync(dir)
    .filter(f => f.endsWith('-team-matchup.json'))
    .sort().reverse();
  if (files.length === 0) throw new Error('No team-matchup file found');
  console.log(`  Data: ${files[0]}`);
  return JSON.parse(readFileSync(resolve(dir, files[0]), 'utf-8')).pool;
}

// ===== SP-system stat calculation =====
const IV = 31, LEVEL = 50;
function calcStat(base, sp = 0, natureMod = 1.0) {
  const raw = Math.floor(((2 * base + IV) * LEVEL) / 100) + 5 + sp;
  return Math.floor(raw * natureMod);
}

// ===== Type-matching items (all 4915/4096 ≈ 1.2x) =====
const TYPE_ITEMS = {
  Fire: 'Charcoal', Water: 'Mystic Water', Grass: 'Miracle Seed',
  Electric: 'Magnet', Ice: 'Never-Melt Ice', Dragon: 'Dragon Fang',
  Fighting: 'Black Belt', Normal: 'Silk Scarf', Poison: 'Poison Barb',
  Ground: 'Soft Sand', Flying: 'Sharp Beak', Psychic: 'Twisted Spoon',
  Bug: 'Silver Powder', Rock: 'Hard Stone', Ghost: 'Spell Tag',
  Dark: 'Black Glasses', Steel: 'Metal Coat', Fairy: 'Fairy Feather',
};
const TYPE_ITEM_MOD = 4915 / 4096;

// ===== -ate ability map =====
const ATE_MAP = {
  Dragonize: 'Dragon', Pixilate: 'Fairy',
  Aerilate: 'Flying', Refrigerate: 'Ice',
};

// ===== Ability modifiers =====
function getAbilityStatMod(ability, category, hasStatusItem) {
  switch (ability) {
    case 'Huge Power': case 'Pure Power':
      return category === 'Physical' ? 2.0 : 1.0;
    case 'Gorilla Tactics':
      return category === 'Physical' ? 1.5 : 1.0;
    case 'Solar Power':
      return category === 'Special' ? 1.5 : 1.0;
    case 'Guts':
      return (category === 'Physical' && hasStatusItem) ? 1.5 : 1.0;
    default: return 1.0;
  }
}

function getAbilityBpMod(ability, move, effectiveType) {
  const flags = move.flags || {};
  switch (ability) {
    case 'Sheer Force':  return move.secondaryEffect ? 1.3 : 1.0;
    case 'Tough Claws':  return flags.contact ? 1.3 : 1.0;
    case 'Iron Fist':    return flags.punch ? 1.2 : 1.0;
    case 'Strong Jaw':   return flags.bite ? 1.5 : 1.0;
    case 'Mega Launcher':return flags.pulse ? 1.5 : 1.0;
    case 'Sharpness':    return flags.slicing ? 1.5 : 1.0;
    case 'Punk Rock':    return flags.sound ? 1.3 : 1.0;
    case 'Technician':   return move.basePower <= 60 ? 1.5 : 1.0;
    case 'Reckless':     return move.recoil ? 1.2 : 1.0;
    case 'Sand Force':   return ['Rock','Ground','Steel'].includes(effectiveType) ? 1.3 : 1.0;
    case 'Fairy Aura':   return effectiveType === 'Fairy' ? 1.33 : 1.0;
    case 'Dark Aura':    return effectiveType === 'Dark' ? 1.33 : 1.0;
    default: return 1.0;
  }
}

function getStabMod(ability, moveType, pokemonTypes) {
  if (!pokemonTypes.includes(moveType)) return 1.0;
  return ability === 'Adaptability' ? 2.0 : 1.5;
}

function getParentalBondMod(ability) {
  return ability === 'Parental Bond' ? 1.25 : 1.0;
}

// ===== Multi-hit expected total BP =====
function getMultiHitFactor(move) {
  if (!move.multiHit) return 1;
  if (typeof move.multiHit === 'number') return move.multiHit;
  // [2,5] → P(2)=35%, P(3)=35%, P(4)=15%, P(5)=15% → expected 3.1
  return 3.1;
}

// ===== Pick best offensive ability from array =====
function pickBestAbility(abilities) {
  if (!abilities || abilities.length === 0) return 'unknown';
  // Prioritize abilities that boost firepower
  const offensivePriority = [
    'Huge Power','Pure Power','Gorilla Tactics','Guts','Solar Power',
    'Adaptability','Sheer Force','Tough Claws','Strong Jaw','Mega Launcher',
    'Sharpness','Iron Fist','Punk Rock','Technician','Reckless','Sand Force',
    'Fairy Aura','Dark Aura',
  ];
  for (const a of offensivePriority) {
    if (abilities.includes(a)) return a;
  }
  return abilities[0];
}

// ===== Build form list: pool + all megas from species.json =====
function buildFormList(pool) {
  const poolNames = new Set();
  for (const p of pool) poolNames.add(p.name);

  // Also include Pokemon with mega data in species.json (even if not in pool)
  const allNames = new Set(poolNames);
  for (const [name, sp] of Object.entries(species)) {
    if (sp.mega && learnsets[name]) allNames.add(name);
  }

  const forms = [];

  for (const name of allNames) {
    const sp = species[name];
    if (!sp) continue;
    const ls = learnsets[name];
    if (!ls || ls.length === 0) continue;

    // Base form
    const ability = pickBestAbility(sp.abilities);
    forms.push({
      name,
      types: sp.types,
      ability,
      baseStats: sp.baseStats,
      isMega: false,
      moves: ls,
    });

    // Mega form
    if (sp.mega) {
      forms.push({
        name,
        types: sp.mega.types || sp.types,
        ability: sp.mega.ability,
        baseStats: sp.mega.baseStats,
        isMega: true,
        moves: ls,
      });
    }
  }

  return forms;
}

// ===== Compute all attack moves for one form =====
function computeAllMoves(form) {
  const { name, types, ability, baseStats, isMega, moves: moveList } = form;

  const atkBase = baseStats.atk;
  const spaBase = baseStats.spa;
  const defBase = baseStats.def;
  const atkStat = calcStat(atkBase, 32, 1.1);
  const spaStat = calcStat(spaBase, 32, 1.1);
  const defStat = calcStat(defBase, 32, 1.1);

  const results = [];

  const itemConfigs = isMega
    ? [{ label: 'Mega Stone', typeMod: 1.0, isStatusItem: false }]
    : ability === 'Guts'
      ? [
          { label: 'type-match', typeMod: TYPE_ITEM_MOD, isStatusItem: false },
          { label: 'Flame Orb', typeMod: 1.0, isStatusItem: true },
        ]
      : [{ label: 'type-match', typeMod: TYPE_ITEM_MOD, isStatusItem: false }];

  for (const moveName of moveList) {
    const move = movesData[moveName];
    if (!move) continue;
    if (move.category === 'Status') continue;
    if (move.basePower === 0) continue;
    if (move.useTargetOffensiveStat) continue; // Foul Play

    for (const itemCfg of itemConfigs) {
      const cat = move.category;

      let stat, statName, statBase;
      if (move.overrideOffensiveStat === 'def') {
        stat = defStat; statName = 'Def'; statBase = defBase;
      } else if (cat === 'Physical') {
        stat = atkStat; statName = 'Atk'; statBase = atkBase;
      } else {
        stat = spaStat; statName = 'SpA'; statBase = spaBase;
      }

      const abilityStatMod = getAbilityStatMod(ability, cat, itemCfg.isStatusItem);
      const effectiveStat = Math.floor(stat * abilityStatMod);

      // -ate conversion
      let effectiveType = move.type;
      let ateBpMod = 1.0;
      let ateConvert = false;
      if (move.type === 'Normal' && ATE_MAP[ability]) {
        effectiveType = ATE_MAP[ability];
        ateBpMod = 1.2;
        ateConvert = true;
      }

      // Facade doubling with Guts + status
      let facadeMod = 1.0;
      if (move.name === 'Facade' && ability === 'Guts' && itemCfg.isStatusItem) {
        facadeMod = 2.0;
      }

      const abilityBpMod = getAbilityBpMod(ability, move, effectiveType);
      const stabMod = getStabMod(ability, effectiveType, types);
      const parentalMod = getParentalBondMod(ability);
      const multiHitFactor = getMultiHitFactor(move);
      const itemMod = itemCfg.typeMod;

      const effectiveBP = move.basePower * multiHitFactor * ateBpMod * abilityBpMod
        * stabMod * parentalMod * facadeMod * itemMod;
      const firepowerIndex = Math.round(effectiveStat * effectiveBP);

      const itemName = isMega ? '(Mega Stone)'
        : itemCfg.isStatusItem ? 'Flame Orb'
        : TYPE_ITEMS[effectiveType] || '(none)';

      results.push({
        moveName: move.name,
        moveType: effectiveType,
        originalType: move.type,
        basePower: move.basePower,
        category: cat,
        effectiveBP: Math.round(effectiveBP * 10) / 10,
        firepowerIndex,
        isStab: types.includes(effectiveType),
        hasRecoil: !!move.recoil,
        ateConvert,
        multiHit: move.multiHit || null,
        item: itemName,
        statName,
        statValue: effectiveStat,
        statBase,
      });
    }
  }

  // Guts: keep best item config per move
  if (ability === 'Guts' && !isMega) {
    const bestByMove = new Map();
    for (const r of results) {
      if (!bestByMove.has(r.moveName) || r.firepowerIndex > bestByMove.get(r.moveName).firepowerIndex) {
        bestByMove.set(r.moveName, r);
      }
    }
    return [...bestByMove.values()].sort((a, b) => b.firepowerIndex - a.firepowerIndex);
  }

  return results.sort((a, b) => b.firepowerIndex - a.firepowerIndex);
}

// ===== Main =====
function main() {
  const pool = loadPool();
  const forms = buildFormList(pool);

  console.log(`  Pool: ${pool.length} entries`);
  console.log(`  Forms: ${forms.length} (base + mega)`);

  const ranking = [];

  for (const form of forms) {
    const moves = computeAllMoves(form);
    if (moves.length === 0) continue;

    ranking.push({
      pokemon: form.name,
      types: form.types,
      ability: form.ability,
      isMega: form.isMega,
      atkStat: calcStat(form.baseStats.atk, 32, 1.1),
      atkBase: form.baseStats.atk,
      spaStat: calcStat(form.baseStats.spa, 32, 1.1),
      spaBase: form.baseStats.spa,
      bestFirepowerIndex: moves[0].firepowerIndex,
      moves,
    });
  }

  ranking.sort((a, b) => b.bestFirepowerIndex - a.bestFirepowerIndex);
  ranking.forEach((r, i) => { r.rank = i + 1; });

  const output = {
    generatedAt: new Date().toISOString(),
    description: 'Pokemon Champions 火力指数ランキング (全攻撃技)',
    formula: '実数値 × 実効威力 (BP × STAB × 特性 × アイテム)',
    assumptions: {
      sp: 32,
      nature: '有利性格 (1.1x): いじっぱり(物理) / ひかえめ(特殊)',
      itemNonMega: 'タイプ強化アイテム (~1.2x = 4915/4096)',
      itemMega: 'メガストーン固定 (補正なし)',
      itemGuts: 'かえんだま (根性1.5x + Facade2x) と比較',
    },
    totalForms: ranking.length,
    ranking,
  };

  const outPath = resolve(root, 'home-data/storage/analysis/firepower-ranking.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`  Output: ${outPath}`);
  console.log(`  Ranked: ${ranking.length} forms`);

  const totalMoves = ranking.reduce((sum, r) => sum + r.moves.length, 0);
  console.log(`  Total move entries: ${totalMoves}`);

  // Top 30 summary
  console.log('\n  Top 30:');
  for (let i = 0; i < Math.min(30, ranking.length); i++) {
    const r = ranking[i];
    const tag = r.isMega ? '[M]' : '';
    const name = `${r.pokemon} ${tag}`.trim();
    const best = r.moves?.[0];
    if (!best) continue;
    const mn = String(best.moveName ?? '?');
    const it = String(best.item ?? '-');
    console.log(
      `  ${String(i + 1).padStart(4)}. ${name.padEnd(22)} ${String(r.ability).padEnd(16)} ${mn.padEnd(18)} ${it.padEnd(14)} → ${best.firepowerIndex.toLocaleString()}`
    );
  }
}

main();
