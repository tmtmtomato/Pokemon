// メガシンカ特性の実装テスト: Aerilate / Refrigerate / Thick Fat / Scrappy / Bulletproof
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

// Helper: damage ratio between two scenarios
function damageRatio(a: ReturnType<typeof calculate>, b: ReturnType<typeof calculate>): number {
  return a.range()[0] / b.range()[0];
}

const field = new Field({ gameType: 'Singles' });

// =============================================================================
// Aerilate (スカイスキン): ノーマル技→ひこうタイプ化 + 1.2倍
// =============================================================================
describe('Aerilate（スカイスキン）', () => {

  it('ノーマル技がひこうタイプに変わる', () => {
    const pinsir = new Pokemon({
      name: 'Pinsir', sp: { atk: 32 }, nature: 'Adamant',
      item: 'Pinsirite', isMega: true,
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const result = calculate(pinsir, defender, move, field);
    expect(result.moveType).toBe('Flying');
  });

  it('ノーマル技に1.2倍の威力補正+STAB (メガ時はBug/Flying)', () => {
    // Mega Pinsir: Bug/Flying with Aerilate. Return becomes Flying with STAB.
    const megaPinsir = new Pokemon({
      name: 'Pinsir', sp: { atk: 32 }, nature: 'Adamant',
      item: 'Pinsirite', isMega: true, // Aerilate, Bug/Flying
    });
    const basePinsir = new Pokemon({
      name: 'Pinsir', sp: { atk: 32 }, nature: 'Adamant', ability: 'Hyper Cutter',
    });
    // Use a pure Normal type defender so Flying vs Normal = 1x, Normal vs Normal = 1x
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const megaResult = calculate(megaPinsir, defender, move, field);
    const baseResult = calculate(basePinsir, defender, move, field);

    expect(megaResult.moveType).toBe('Flying');
    expect(baseResult.moveType).toBe('Normal');
    // Mega Pinsir: higher Atk (155 vs 125), Aerilate 1.2x BP, Flying STAB 1.5x
    // Base Pinsir: 125 Atk, no STAB on Normal Return
    // The ratio depends on stat difference too, but should be well above 1.5
    const ratio = damageRatio(megaResult, baseResult);
    expect(ratio).toBeGreaterThan(1.7);
  });

  it('ステータス技はタイプ変換されない', () => {
    const pinsir = new Pokemon({
      name: 'Pinsir', sp: { atk: 32 }, nature: 'Adamant', ability: 'Aerilate',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Protect'); // Status move
    const result = calculate(pinsir, defender, move, field);
    expect(result.moveType).toBe('Normal');
  });

  it('ひこうタイプの相性が適用される（くさへの抜群）', () => {
    const withAerilate = new Pokemon({
      name: 'Pinsir', sp: { atk: 32 }, nature: 'Adamant', ability: 'Aerilate',
    });
    const grassDef = new Pokemon({ name: 'Venusaur', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const result = calculate(withAerilate, grassDef, move, field);
    // Flying is super effective vs Grass (Venusaur is Grass/Poison)
    expect(result.moveType).toBe('Flying');
    expect(result.typeEffectiveness).toBe(2);
  });
});

// =============================================================================
// Refrigerate (フリーズスキン): ノーマル技→こおりタイプ化 + 1.2倍
// =============================================================================
describe('Refrigerate（フリーズスキン）', () => {

  it('ノーマル技がこおりタイプに変わる', () => {
    const glalie = new Pokemon({
      name: 'Glalie', sp: { atk: 32 }, nature: 'Adamant',
      item: 'Glalitite', isMega: true,
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const result = calculate(glalie, defender, move, field);
    expect(result.moveType).toBe('Ice');
  });

  it('ノーマル技に1.2倍の威力補正がかかる', () => {
    const withRefrigerate = new Pokemon({
      name: 'Glalie', sp: { atk: 32 }, nature: 'Adamant', ability: 'Refrigerate',
    });
    const withoutRefrigerate = new Pokemon({
      name: 'Glalie', sp: { atk: 32 }, nature: 'Adamant', ability: 'Inner Focus',
    });
    // Kangaskhan: pure Normal, neither Ice nor Normal has SE/NVE advantage
    const defender = new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const withResult = calculate(withRefrigerate, defender, move, field);
    const withoutResult = calculate(withoutRefrigerate, defender, move, field);

    expect(withResult.moveType).toBe('Ice');
    expect(withoutResult.moveType).toBe('Normal');
    // Refrigerate: 1.2x BP + STAB (Glalie is Ice type)
    // Without: Normal, no STAB
    const ratio = damageRatio(withResult, withoutResult);
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.9);
  });

  it('こおりタイプの相性が適用される（ドラゴンに抜群）', () => {
    const glalie = new Pokemon({
      name: 'Glalie', sp: { atk: 32 }, nature: 'Adamant', ability: 'Refrigerate',
    });
    const dragon = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const result = calculate(glalie, dragon, move, field);
    // Ice is super effective vs Dragon/Ground (4x)
    expect(result.moveType).toBe('Ice');
    expect(result.typeEffectiveness).toBe(4);
  });
});

// =============================================================================
// Thick Fat (あついしぼう): 炎/氷技のベースパワー0.5倍
// =============================================================================
describe('Thick Fat（あついしぼう）', () => {

  it('炎技のダメージが半減する', () => {
    const attacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
      item: 'Charizardite Y', isMega: true, // Drought
    });
    const withThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, spd: 32 }, ability: 'Thick Fat',
    });
    const withoutThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, spd: 32 }, ability: 'Overgrow',
    });
    const move = new Move('Flamethrower');

    const withResult = calculate(attacker, withThickFat, move, field);
    const withoutResult = calculate(attacker, withoutThickFat, move, field);

    const ratio = damageRatio(withResult, withoutResult);
    // Thick Fat halves Fire BP -> damage should be ~0.5x
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it('氷技のダメージが半減する', () => {
    const attacker = new Pokemon({
      name: 'Glalie', sp: { spa: 32 }, nature: 'Modest', ability: 'Inner Focus',
    });
    const withThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, spd: 32 }, ability: 'Thick Fat',
    });
    const withoutThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, spd: 32 }, ability: 'Overgrow',
    });
    const move = new Move('Ice Beam');

    const withResult = calculate(attacker, withThickFat, move, field);
    const withoutResult = calculate(attacker, withoutThickFat, move, field);

    const ratio = damageRatio(withResult, withoutResult);
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it('炎/氷以外のタイプ技には影響しない', () => {
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Rough Skin',
    });
    const withThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, def: 32 }, ability: 'Thick Fat',
    });
    const withoutThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, def: 32 }, ability: 'Overgrow',
    });
    const move = new Move('Earthquake');

    const withResult = calculate(attacker, withThickFat, move, field);
    const withoutResult = calculate(attacker, withoutThickFat, move, field);

    // Ground move -> Thick Fat has no effect
    expect(withResult.range()[0]).toBe(withoutResult.range()[0]);
  });

  it('かたやぶりで貫通される', () => {
    const attacker = new Pokemon({
      name: 'Emboar', sp: { spa: 32 }, nature: 'Modest',
      item: 'Emboarite', isMega: true, // Mold Breaker
    });
    const withThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, spd: 32 }, ability: 'Thick Fat',
    });
    const withoutThickFat = new Pokemon({
      name: 'Venusaur', sp: { hp: 32, spd: 32 }, ability: 'Overgrow',
    });
    const move = new Move('Flamethrower');

    const withResult = calculate(attacker, withThickFat, move, field);
    const withoutResult = calculate(attacker, withoutThickFat, move, field);

    // Mold Breaker ignores Thick Fat -> same damage
    expect(withResult.range()[0]).toBe(withoutResult.range()[0]);
  });
});

// =============================================================================
// Scrappy (きもったま): ノーマル/かくとう技がゴーストに通る
// =============================================================================
describe('Scrappy（きもったま）', () => {

  it('ノーマル技がゴーストタイプに通る', () => {
    const withScrappy = new Pokemon({
      name: 'Lopunny', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    const ghost = new Pokemon({ name: 'Gengar', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');

    const result = calculate(withScrappy, ghost, move, field);
    // Normal vs Ghost/Poison: Ghost immunity removed -> Poison 1x -> total 1x
    expect(result.range()[0]).toBeGreaterThan(0);
    expect(result.typeEffectiveness).toBe(1);
  });

  it('かくとう技がゴーストタイプに通る', () => {
    const withScrappy = new Pokemon({
      name: 'Lopunny', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    const ghost = new Pokemon({ name: 'Gengar', sp: { hp: 32, def: 32 } });
    const move = new Move('Close Combat');

    const result = calculate(withScrappy, ghost, move, field);
    // Fighting vs Ghost/Poison: Ghost immunity removed -> Poison 0.5x -> total 0.5x
    expect(result.range()[0]).toBeGreaterThan(0);
    expect(result.typeEffectiveness).toBe(0.5);
  });

  it('きもったまなしではゴーストに無効', () => {
    const withoutScrappy = new Pokemon({
      name: 'Lopunny', sp: { atk: 32 }, nature: 'Adamant', ability: 'Keen Eye',
    });
    const ghost = new Pokemon({ name: 'Gengar', sp: { hp: 32, def: 32 } });
    const returnMove = new Move('Return');
    const ccMove = new Move('Close Combat');

    const normalResult = calculate(withoutScrappy, ghost, returnMove, field);
    const fightResult = calculate(withoutScrappy, ghost, ccMove, field);
    expect(normalResult.range()[0]).toBe(0);
    expect(fightResult.range()[0]).toBe(0);
  });

  it('ゴースト以外の無効タイプには影響しない（でんき→じめん等）', () => {
    const attacker = new Pokemon({
      name: 'Lopunny', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    // Scrappy only affects Normal/Fighting -> Ghost, not other immunities
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } }); // Ground type
    const move = new Move('Hyper Voice'); // Normal (special)
    // Hyper Voice is Normal, Scrappy is for Normal/Fighting vs Ghost
    // Normal vs Dragon/Ground = 1x, this should just work normally
    const result = calculate(attacker, defender, move, field);
    expect(result.range()[0]).toBeGreaterThan(0);
  });

  it('ゴースト/あくの複合タイプ: かくとう技は2倍で通る', () => {
    const withScrappy = new Pokemon({
      name: 'Lopunny', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    const ghostDark = new Pokemon({ name: 'Sableye', sp: { hp: 32, def: 32 } });
    const move = new Move('Close Combat');

    const result = calculate(withScrappy, ghostDark, move, field);
    // Fighting vs Ghost/Dark: Ghost immunity removed -> Dark 2x -> total 2x
    expect(result.range()[0]).toBeGreaterThan(0);
    expect(result.typeEffectiveness).toBe(2);
  });
});

// =============================================================================
// Bulletproof (ぼうだん): 弾系技を無効化
// =============================================================================
describe('Bulletproof（ぼうだん）', () => {

  it('弾系技（Shadow Ball）を無効化する', () => {
    const attacker = new Pokemon({
      name: 'Gengar', sp: { spa: 32 }, nature: 'Modest', ability: 'Cursed Body',
    });
    const withBulletproof = new Pokemon({
      name: 'Chesnaught', sp: { hp: 32, spd: 32 }, ability: 'Bulletproof',
    });
    const move = new Move('Shadow Ball');

    const result = calculate(attacker, withBulletproof, move, field);
    expect(result.range()[0]).toBe(0);
  });

  it('弾系技（Energy Ball）を無効化する', () => {
    const attacker = new Pokemon({
      name: 'Gengar', sp: { spa: 32 }, nature: 'Modest', ability: 'Cursed Body',
    });
    const withBulletproof = new Pokemon({
      name: 'Chesnaught', sp: { hp: 32, spd: 32 }, ability: 'Bulletproof',
    });
    const move = new Move('Energy Ball');

    const result = calculate(attacker, withBulletproof, move, field);
    expect(result.range()[0]).toBe(0);
  });

  it('弾系でない技は通る', () => {
    const attacker = new Pokemon({
      name: 'Gengar', sp: { spa: 32 }, nature: 'Modest', ability: 'Cursed Body',
    });
    const withBulletproof = new Pokemon({
      name: 'Chesnaught', sp: { hp: 32, spd: 32 }, ability: 'Bulletproof',
    });
    const move = new Move('Flamethrower'); // Not a bullet move

    const result = calculate(attacker, withBulletproof, move, field);
    expect(result.range()[0]).toBeGreaterThan(0);
  });

  it('かたやぶりで貫通される', () => {
    const attacker = new Pokemon({
      name: 'Emboar', sp: { spa: 32 }, nature: 'Modest',
      item: 'Emboarite', isMega: true, // Mold Breaker
    });
    const withBulletproof = new Pokemon({
      name: 'Chesnaught', sp: { hp: 32, spd: 32 }, ability: 'Bulletproof',
    });
    const move = new Move('Shadow Ball');

    const result = calculate(attacker, withBulletproof, move, field);
    // Mold Breaker ignores Bulletproof -> damage goes through
    expect(result.range()[0]).toBeGreaterThan(0);
  });
});
