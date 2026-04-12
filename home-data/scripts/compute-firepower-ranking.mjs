#!/usr/bin/env node
/**
 * Pokemon Champions 火力指数ランキング
 *
 * 火力指数 = 実数値 × 技威力 × タイプ一致補正 × 特性補正 × アイテム補正
 *
 * データソース: team-matchup.json のプールデータ (217体)
 *   - Champions環境に実在するポケモンのみ
 *   - 技はプール内の実際の採用技のみ (各ポケモン最大4技)
 *
 * 前提: SP=32 (最大振り) + 有利性格 (いじっぱり/ひかえめ)
 * アイテム:
 *   - メガシンカ: メガストーン固定 (補正なし)
 *   - 非メガ: いのちのたま (~1.3x) を基本採用
 *     ※ 根性+かえんだまなど特殊ケースも考慮
 *
 * ※ こだわりシリーズは Champions 環境に存在しない
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const species = JSON.parse(readFileSync(resolve(root, 'src/data/species.json'), 'utf-8'));
const movesData = JSON.parse(readFileSync(resolve(root, 'src/data/moves.json'), 'utf-8'));

// Load the latest team-matchup analysis (Champions pool)
function loadLatestMatchup() {
  const analysisDir = resolve(root, 'home-data/storage/analysis');
  const files = readdirSync(analysisDir)
    .filter(f => f.endsWith('-team-matchup.json'))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error('No team-matchup analysis found');
  const path = resolve(analysisDir, files[0]);
  console.log(`  Data: ${files[0]}`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

import { readdirSync } from 'fs';

// ===== Stat Calculation (Champions SP System) =====
const IV = 31;
const LEVEL = 50;

function calcStat(base, sp = 0, natureMod = 1.0) {
  const raw = Math.floor(((2 * base + IV) * LEVEL) / 100) + 5 + sp;
  return Math.floor(raw * natureMod);
}

// ===== Ability Modifiers =====

function getAbilityStatMod(ability, category, hasStatusItem) {
  switch (ability) {
    case 'Huge Power':
    case 'Pure Power':
      return category === 'Physical' ? 2.0 : 1.0;
    case 'Gorilla Tactics':
      return category === 'Physical' ? 1.5 : 1.0;
    case 'Solar Power':
      return category === 'Special' ? 1.5 : 1.0;
    case 'Guts':
      return (category === 'Physical' && hasStatusItem) ? 1.5 : 1.0;
    default:
      return 1.0;
  }
}

function getAbilityBpMod(ability, move) {
  const flags = move.flags || {};
  switch (ability) {
    case 'Sheer Force':
      return move.secondaryEffect ? 1.3 : 1.0;
    case 'Tough Claws':
      return flags.contact ? 1.3 : 1.0;
    case 'Iron Fist':
      return flags.punch ? 1.2 : 1.0;
    case 'Strong Jaw':
      return flags.bite ? 1.5 : 1.0;
    case 'Mega Launcher':
      return flags.pulse ? 1.5 : 1.0;
    case 'Sharpness':
      return flags.slicing ? 1.5 : 1.0;
    case 'Punk Rock':
      return flags.sound ? 1.3 : 1.0;
    case 'Technician':
      return move.basePower <= 60 ? 1.5 : 1.0;
    case 'Reckless':
      return move.recoil ? 1.2 : 1.0;
    case 'Sand Force':
      return ['Rock', 'Ground', 'Steel'].includes(move.type) ? 1.3 : 1.0;
    default:
      return 1.0;
  }
}

function getStabMod(ability, moveType, pokemonTypes) {
  const isStab = pokemonTypes.includes(moveType);
  if (!isStab) return 1.0;
  return ability === 'Adaptability' ? 2.0 : 1.5;
}

const ATE_MAP = {
  'Dragonize': 'Dragon',
  'Pixilate': 'Fairy',
  'Aerilate': 'Flying',
  'Refrigerate': 'Ice',
};

function getAteMoveType(ability, moveType, moveCategory) {
  if (moveCategory === 'Status') return moveType;
  if (moveType !== 'Normal') return moveType;
  return ATE_MAP[ability] || moveType;
}

function getAteBpMod(ability, moveType, moveCategory) {
  if (moveCategory === 'Status') return 1.0;
  if (moveType !== 'Normal') return 1.0;
  return ATE_MAP[ability] ? 1.2 : 1.0;
}

function getParentalBondMod(ability) {
  return ability === 'Parental Bond' ? 1.25 : 1.0;
}

function getFacadeBpMod(ability, moveName, hasStatusItem) {
  if (moveName === 'Facade' && ability === 'Guts' && hasStatusItem) return 2.0;
  return 1.0;
}

// ===== Resolve base stats for a pool member =====
function getBaseStats(poolMember) {
  const poke = species[poolMember.name];
  if (poke) {
    if (poolMember.isMega && poke.mega) return poke.mega.baseStats;
    return poke.baseStats;
  }
  // Try base name for forms like "Mega X" that might be stored differently
  for (const [, sp] of Object.entries(species)) {
    if (sp.name === poolMember.name) {
      if (poolMember.isMega && sp.mega) return sp.mega.baseStats;
      return sp.baseStats;
    }
  }
  return null;
}

// ===== Item configurations =====
function getItemConfigs(ability, isMega) {
  if (isMega) {
    return [{ name: '(Mega Stone)', statMult: 1.0, finalMult: 1.0, isStatusItem: false }];
  }

  const configs = [
    { name: 'Life Orb', statMult: 1.0, finalMult: 5324 / 4096, isStatusItem: false },
  ];

  if (ability === 'Guts') {
    configs.push({ name: 'Flame Orb', statMult: 1.0, finalMult: 1.0, isStatusItem: true });
  }

  return configs;
}

// ===== Compute Firepower for a single pool member =====
function computeFirepower(poolMember) {
  const baseStats = getBaseStats(poolMember);
  if (!baseStats) return null;

  const moves = poolMember.moves;
  if (!moves || moves.length === 0) return null;

  const ability = poolMember.ability;
  const types = poolMember.types;
  const isMega = poolMember.isMega;
  const results = [];

  const itemConfigs = getItemConfigs(ability, isMega);

  for (const itemCfg of itemConfigs) {
    for (const cat of ['Physical', 'Special']) {
      const baseStat = cat === 'Physical' ? baseStats.atk : baseStats.spa;
      const maxStat = calcStat(baseStat, 32, 1.1);
      const abilityStatMod = getAbilityStatMod(ability, cat, itemCfg.isStatusItem);
      const effectiveStat = Math.floor(maxStat * abilityStatMod);

      let bestMove = null;
      let bestIndex = 0;

      for (const moveName of moves) {
        const move = movesData[moveName];
        if (!move) continue;
        if (move.category !== cat) continue;
        if (move.basePower === 0) continue;
        if (move.bpModifier === 'foul_play') continue;
        if (move.overrideOffensiveStat === 'def') continue;

        const effectiveType = getAteMoveType(ability, move.type, move.category);
        const ateBpMod = getAteBpMod(ability, move.type, move.category);
        const abilityBpMod = getAbilityBpMod(ability, move);
        const stabMod = getStabMod(ability, effectiveType, types);
        const parentalMod = getParentalBondMod(ability);
        const facadeMod = getFacadeBpMod(ability, move.name, itemCfg.isStatusItem);

        const effectiveBP = move.basePower * ateBpMod * abilityBpMod * stabMod * parentalMod * facadeMod * itemCfg.finalMult;
        const index = effectiveStat * effectiveBP;

        if (index > bestIndex) {
          bestIndex = index;
          bestMove = {
            name: move.name,
            type: effectiveType,
            originalType: move.type,
            basePower: move.basePower,
            category: cat,
            effectiveBP: Math.round(effectiveBP * 10) / 10,
            isStab: types.includes(effectiveType),
            hasRecoil: !!move.recoil,
            ateConvert: move.type !== effectiveType,
          };
        }
      }

      if (bestMove) {
        results.push({
          pokemon: poolMember.name,
          types,
          ability,
          isMega,
          item: itemCfg.name,
          stat: effectiveStat,
          statBase: baseStat,
          statName: cat === 'Physical' ? 'Atk' : 'SpA',
          move: bestMove,
          firepowerIndex: Math.round(bestIndex),
        });
      }
    }
  }

  if (results.length === 0) return null;
  return results.sort((a, b) => b.firepowerIndex - a.firepowerIndex);
}

// ===== Main =====
function main() {
  const matchup = loadLatestMatchup();
  const pool = matchup.pool;

  console.log(`  Pool: ${pool.length} Pokemon (Champions環境)`);

  const allResults = [];

  for (const member of pool) {
    const results = computeFirepower(member);
    if (results && results.length > 0) {
      allResults.push(results[0]); // best config per Pokemon
    }
  }

  const ranked = allResults.sort((a, b) => b.firepowerIndex - a.firepowerIndex);

  // Save JSON output
  const output = {
    generatedAt: new Date().toISOString(),
    description: 'Pokemon Champions 火力指数ランキング',
    formula: '実数値 × 技威力 × タイプ一致 × 特性 × アイテム',
    assumptions: {
      sp: 32,
      nature: '有利性格 (1.1x)',
      itemMega: 'メガストーン固定 (補正なし)',
      itemNonMega: 'いのちのたま (~1.3x)',
      itemGuts: 'かえんだま (根性1.5x + Facade2x)',
    },
    poolSize: pool.length,
    ranking: ranked.map((r, i) => ({
      rank: i + 1,
      pokemon: r.pokemon,
      types: r.types,
      ability: r.ability,
      isMega: r.isMega,
      item: r.isMega ? r.pokemon.replace(/^.*/, m => `${m} Stone`) : r.item,
      statName: r.statName,
      statValue: r.stat,
      statBase: r.statBase,
      move: r.move.name,
      moveType: r.move.type,
      moveBasePower: r.move.basePower,
      moveCategory: r.move.category,
      effectiveBP: r.move.effectiveBP,
      isStab: r.move.isStab,
      hasRecoil: r.move.hasRecoil,
      ateConvert: r.move.ateConvert,
      firepowerIndex: r.firepowerIndex,
    })),
  };

  const outPath = resolve(root, 'home-data/storage/analysis/firepower-ranking.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`  Output: ${outPath}`);
  console.log(`  Ranked: ${ranked.length} Pokemon`);
  console.log('');

  // Print top 50 summary to console
  console.log('  Top 50:');
  for (let i = 0; i < Math.min(50, ranked.length); i++) {
    const r = ranked[i];
    const recoil = r.move.hasRecoil ? '*' : '';
    const ate = r.move.ateConvert ? '†' : '';
    const tag = r.isMega ? '[M]' : '';
    const pokeName = (r.pokemon + ' ' + tag).trim();
    const itemDisplay = r.isMega ? '-' : r.item;
    console.log(
      `  ${String(i + 1).padStart(4)}. ${pokeName.padEnd(20)} ${r.ability.padEnd(16)} ${itemDisplay.padEnd(12)} ${r.move.name}${recoil}${ate} → ${r.firepowerIndex.toLocaleString()}`
    );
  }
}

main();
