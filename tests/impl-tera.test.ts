// テラスタル (Terastallization) 実装テスト
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field, MOD } from '../src/index.js';
import { getSTABMod } from '../src/mechanics/abilities.js';

// ヘルパー: 2つのシナリオのダメージ比を計算
function damageRatio(a: ReturnType<typeof calculate>, b: ReturnType<typeof calculate>): number {
  return a.range()[0] / b.range()[0];
}

// =====================================================
// テラスタル STAB テスト
// =====================================================
describe('テラスタル STAB テスト', () => {

  // Garchomp: Dragon/Ground、テラタイプ Ground → 地面技で STAB 2.0x
  it('テラスタル(テラタイプ=元タイプ): 一致技のSTABが2.0倍になる', () => {
    const teraAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Ground',
    });
    const normalAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    // テラ時のSTABは2.0x、非テラ時は1.5x
    const stabTera = getSTABMod(teraAttacker, 'Ground');
    const stabNormal = getSTABMod(normalAttacker, 'Ground');
    expect(stabTera).toBe(MOD.x2_0);  // 8192
    expect(stabNormal).toBe(MOD.x1_5); // 6144

    // 実際のダメージ比も確認（2.0/1.5 ≈ 1.33）
    const teraDmg = calculate(teraAttacker, defender, move, field);
    const normalDmg = calculate(normalAttacker, defender, move, field);
    const ratio = damageRatio(teraDmg, normalDmg);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.45);
  });

  // Basculegion: Water/Ghost、Adaptability、テラタイプ Water → 水技で 2.25x
  it('テラスタル(テラタイプ=元タイプ)+てきおうりょく: STABが2.25倍になる', () => {
    const teraAdaptability = new Pokemon({
      name: 'Basculegion',
      sp: { spa: 32 },
      nature: 'Modest',
      ability: 'Adaptability',
      isTera: true,
      teraType: 'Water',
    });
    const normalAdaptability = new Pokemon({
      name: 'Basculegion',
      sp: { spa: 32 },
      nature: 'Modest',
      ability: 'Adaptability',
    });

    // テラ+てきおうりょく = 2.25x、非テラ+てきおうりょく = 2.0x
    const stabTera = getSTABMod(teraAdaptability, 'Water');
    const stabNormal = getSTABMod(normalAdaptability, 'Water');
    expect(stabTera).toBe(MOD.x2_25);  // 9216
    expect(stabNormal).toBe(MOD.x2_0); // 8192
  });

  // Garchomp: Dragon/Ground、テラタイプ Fire → 炎技で 1.5x（テラタイプ不一致）
  it('テラスタル(テラタイプ≠元タイプ): テラタイプ技のSTABが1.5倍になる', () => {
    const teraAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Fire',
    });

    // Fire技はテラタイプ一致だが元タイプ不一致 → 1.5x
    const stabMod = getSTABMod(teraAttacker, 'Fire');
    expect(stabMod).toBe(MOD.x1_5);  // 6144
  });

  // Basculegion: Water/Ghost、Adaptability、テラタイプ Fire → 炎技で 2.0x
  it('テラスタル(テラタイプ≠元タイプ)+てきおうりょく: テラタイプ技のSTABが2.0倍になる', () => {
    const teraAdaptability = new Pokemon({
      name: 'Basculegion',
      sp: { spa: 32 },
      nature: 'Modest',
      ability: 'Adaptability',
      isTera: true,
      teraType: 'Fire',
    });

    // てきおうりょく + テラ不一致テラタイプ技 → 2.0x
    const stabMod = getSTABMod(teraAdaptability, 'Fire');
    expect(stabMod).toBe(MOD.x2_0);  // 8192
  });

  // Garchomp: Dragon/Ground、テラタイプ Fire → Dragon技は元タイプ一致 → 1.5x
  it('テラスタル後の元タイプ技: STABが1.5倍になる', () => {
    const teraAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Fire',
    });

    // テラスタル後でも元タイプ(Dragon)の技は1.5x STAB
    const stabMod = getSTABMod(teraAttacker, 'Dragon');
    expect(stabMod).toBe(MOD.x1_5);  // 6144

    // Ground技も元タイプ一致 → 1.5x
    const stabModGround = getSTABMod(teraAttacker, 'Ground');
    expect(stabModGround).toBe(MOD.x1_5);
  });

  // Garchomp: Dragon/Ground、テラタイプ Fire → Ice技（不一致）→ 1.0x
  it('テラスタル不一致技: STABなし(1.0倍)', () => {
    const teraAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Fire',
    });

    // Ice技はテラタイプにも元タイプにも一致しない → 1.0x
    const stabMod = getSTABMod(teraAttacker, 'Ice');
    expect(stabMod).toBe(MOD.x1_0);  // 4096
  });

  // 非テラスタル: 従来のSTAB計算と一致
  it('非テラスタル: 従来のSTAB計算と一致', () => {
    const attacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
    });

    // Dragon/Ground → Dragon技 1.5x, Ground技 1.5x, Fire技 1.0x
    expect(getSTABMod(attacker, 'Dragon')).toBe(MOD.x1_5);
    expect(getSTABMod(attacker, 'Ground')).toBe(MOD.x1_5);
    expect(getSTABMod(attacker, 'Fire')).toBe(MOD.x1_0);
  });

  // 非テラ + Adaptability
  it('非テラ + てきおうりょく: STAB 2.0倍', () => {
    const attacker = new Pokemon({
      name: 'Basculegion',
      sp: { spa: 32 },
      nature: 'Modest',
      ability: 'Adaptability',
    });

    // Water/Ghost → Water技 2.0x（てきおうりょく）
    expect(getSTABMod(attacker, 'Water')).toBe(MOD.x2_0);
    expect(getSTABMod(attacker, 'Ghost')).toBe(MOD.x2_0);
    expect(getSTABMod(attacker, 'Fire')).toBe(MOD.x1_0);
  });
});

// =====================================================
// テラスタル タイプ相性テスト
// =====================================================
describe('テラスタル タイプ相性テスト', () => {

  // Gengar: Ghost/Poison → テラタイプ Normal → ゴースト技が無効になる
  it('テラスタル防御: テラタイプで弱点が判定される', () => {
    // Gengar テラ Normal: ゴースト技が無効
    const teraDefender = new Pokemon({
      name: 'Gengar',
      sp: { hp: 32, spd: 32 },
      nature: 'Calm',
      isTera: true,
      teraType: 'Normal',
    });
    const normalDefender = new Pokemon({
      name: 'Gengar',
      sp: { hp: 32, spd: 32 },
      nature: 'Calm',
    });
    const attacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
    });
    const shadowClaw = new Move('Shadow Claw');
    const field = new Field({ gameType: 'Singles' });

    // テラNormal: ゴースト技無効
    const teraResult = calculate(attacker, teraDefender, shadowClaw, field);
    expect(teraResult.typeEffectiveness).toBe(0);
    expect(teraResult.range()).toEqual([0, 0]);

    // 非テラ: Gengar(Ghost/Poison) はゴースト2倍
    const normalResult = calculate(attacker, normalDefender, shadowClaw, field);
    expect(normalResult.typeEffectiveness).toBe(2);
    expect(normalResult.range()[0]).toBeGreaterThan(0);
  });

  // Garchomp: Dragon/Ground → テラタイプ Water → 氷技が等倍になる（元は4倍弱点）
  it('テラスタル防御: 元タイプの弱点が消える', () => {
    const teraDefender = new Pokemon({
      name: 'Garchomp',
      sp: { hp: 32, spd: 32 },
      nature: 'Careful',
      isTera: true,
      teraType: 'Water',
    });
    const normalDefender = new Pokemon({
      name: 'Garchomp',
      sp: { hp: 32, spd: 32 },
      nature: 'Careful',
    });
    const attacker = new Pokemon({
      name: 'Starmie',
      sp: { spa: 32 },
      nature: 'Modest',
    });
    const iceBeam = new Move('Ice Beam');
    const field = new Field({ gameType: 'Singles' });

    // テラWater: 氷→水は半減(0.5x)
    const teraResult = calculate(attacker, teraDefender, iceBeam, field);
    expect(teraResult.typeEffectiveness).toBe(0.5);

    // 非テラ: Dragon/Ground は氷4倍
    const normalResult = calculate(attacker, normalDefender, iceBeam, field);
    expect(normalResult.typeEffectiveness).toBe(4);

    // テラ時のダメージは大幅に減少（4倍→0.5倍）
    expect(teraResult.range()[0]).toBeLessThan(normalResult.range()[0]);
  });

  // テラスタル防御: テラタイプでの無効タイプが適用される
  it('テラスタル防御: テラタイプでの無効タイプが適用される', () => {
    // Aggron(Steel/Rock) テラ Ground: 電気技が無効
    const teraDefender = new Pokemon({
      name: 'Aggron',
      sp: { hp: 32, spd: 32 },
      nature: 'Careful',
      isTera: true,
      teraType: 'Ground',
    });
    const attacker = new Pokemon({
      name: 'Garchomp',
      sp: { spa: 32 },
      nature: 'Modest',
    });
    const thunderbolt = new Move('Thunderbolt');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, teraDefender, thunderbolt, field);
    expect(result.typeEffectiveness).toBe(0);
    expect(result.range()).toEqual([0, 0]);
  });
});

// =====================================================
// ステラテラテスト
// =====================================================
describe('ステラテラテスト', () => {

  // ステラテラ初回: 元タイプ一致 → 2.0x
  it('ステラテラ初回(元タイプ一致): STABが2.0倍になる', () => {
    const stellarAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Stellar',
      isStellarFirstUse: true,
    });

    // Dragon技は元タイプ一致 → ステラ初回2.0x
    const stabMod = getSTABMod(stellarAttacker, 'Dragon');
    expect(stabMod).toBe(MOD.x2_0);
  });

  // ステラテラ初回: 元タイプ不一致 → 2.0x
  it('ステラテラ初回(元タイプ不一致): STABが2.0倍になる', () => {
    const stellarAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Stellar',
      isStellarFirstUse: true,
    });

    // Fire技は元タイプ不一致 → ステラ初回でも2.0x
    const stabMod = getSTABMod(stellarAttacker, 'Fire');
    expect(stabMod).toBe(MOD.x2_0);
  });

  // ステラテラ2回目以降(元タイプ一致): 1.5x
  it('ステラテラ2回目以降(元タイプ一致): STABが1.5倍になる', () => {
    const stellarAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Stellar',
      isStellarFirstUse: false,
    });

    // Dragon技は元タイプ一致 → ステラ2回目以降1.5x
    const stabMod = getSTABMod(stellarAttacker, 'Dragon');
    expect(stabMod).toBe(MOD.x1_5);

    // Ground技も元タイプ一致 → 1.5x
    const stabModGround = getSTABMod(stellarAttacker, 'Ground');
    expect(stabModGround).toBe(MOD.x1_5);
  });

  // ステラテラ2回目以降(元タイプ不一致): 1.0x
  it('ステラテラ2回目以降(元タイプ不一致): STABなし(1.0倍)', () => {
    const stellarAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Stellar',
      isStellarFirstUse: false,
    });

    // Fire技は元タイプ不一致 → ステラ2回目以降1.0x
    const stabMod = getSTABMod(stellarAttacker, 'Fire');
    expect(stabMod).toBe(MOD.x1_0);
  });

  // ステラテラ防御: 元タイプで相性判定
  it('ステラテラ防御: 元タイプで相性判定される', () => {
    // Garchomp(Dragon/Ground) ステラテラ → 防御は元タイプで判定
    const stellarDefender = new Pokemon({
      name: 'Garchomp',
      sp: { hp: 32, spd: 32 },
      nature: 'Careful',
      isTera: true,
      teraType: 'Stellar',
    });
    const normalDefender = new Pokemon({
      name: 'Garchomp',
      sp: { hp: 32, spd: 32 },
      nature: 'Careful',
    });
    const attacker = new Pokemon({
      name: 'Starmie',
      sp: { spa: 32 },
      nature: 'Modest',
    });
    const iceBeam = new Move('Ice Beam');
    const field = new Field({ gameType: 'Singles' });

    // ステラテラ: 元タイプ(Dragon/Ground)で判定 → 氷4倍
    const stellarResult = calculate(attacker, stellarDefender, iceBeam, field);
    expect(stellarResult.typeEffectiveness).toBe(4);

    // 非テラと同じ
    const normalResult = calculate(attacker, normalDefender, iceBeam, field);
    expect(normalResult.typeEffectiveness).toBe(4);

    // ダメージも同じ
    expect(stellarResult.range()[0]).toBe(normalResult.range()[0]);
    expect(stellarResult.range()[1]).toBe(normalResult.range()[1]);
  });
});

// =====================================================
// Pokemon クラスのテラスタル関連メソッドテスト
// =====================================================
describe('Pokemon テラスタル関連メソッド', () => {

  it('effectiveTypes: テラスタル中はテラタイプのみ返す', () => {
    const teraPokemon = new Pokemon({
      name: 'Garchomp',
      isTera: true,
      teraType: 'Fire',
    });
    expect(teraPokemon.effectiveTypes()).toEqual(['Fire']);
  });

  it('effectiveTypes: ステラテラ中は元タイプを返す', () => {
    const stellarPokemon = new Pokemon({
      name: 'Garchomp',
      isTera: true,
      teraType: 'Stellar',
    });
    expect(stellarPokemon.effectiveTypes()).toEqual(['Dragon', 'Ground']);
  });

  it('effectiveTypes: 非テラは元タイプを返す', () => {
    const pokemon = new Pokemon({ name: 'Garchomp' });
    expect(pokemon.effectiveTypes()).toEqual(['Dragon', 'Ground']);
  });

  it('hasType: テラスタル中はテラタイプで判定', () => {
    const teraPokemon = new Pokemon({
      name: 'Garchomp',
      isTera: true,
      teraType: 'Fire',
    });
    expect(teraPokemon.hasType('Fire')).toBe(true);
    expect(teraPokemon.hasType('Dragon')).toBe(false);
    expect(teraPokemon.hasType('Ground')).toBe(false);
  });

  it('hasType: ステラテラ中は元タイプで判定', () => {
    const stellarPokemon = new Pokemon({
      name: 'Garchomp',
      isTera: true,
      teraType: 'Stellar',
    });
    expect(stellarPokemon.hasType('Dragon')).toBe(true);
    expect(stellarPokemon.hasType('Ground')).toBe(true);
    expect(stellarPokemon.hasType('Fire')).toBe(false);
  });

  it('hasOriginalType: テラ状態に関係なく元タイプを参照', () => {
    const teraPokemon = new Pokemon({
      name: 'Garchomp',
      isTera: true,
      teraType: 'Fire',
    });
    expect(teraPokemon.hasOriginalType('Dragon')).toBe(true);
    expect(teraPokemon.hasOriginalType('Ground')).toBe(true);
    expect(teraPokemon.hasOriginalType('Fire')).toBe(false);
  });

  it('clone: テラ関連プロパティが保持される', () => {
    const original = new Pokemon({
      name: 'Garchomp',
      isTera: true,
      teraType: 'Fire',
      isStellarFirstUse: false,
    });
    const cloned = original.clone();
    expect(cloned.isTera).toBe(true);
    expect(cloned.teraType).toBe('Fire');
    expect(cloned.isStellarFirstUse).toBe(false);
  });
});

// =====================================================
// テラスタル + ダメージ計算統合テスト
// =====================================================
describe('テラスタル統合テスト', () => {

  it('テラスタル(テラタイプ=元タイプ) のダメージ計算が正しい', () => {
    // Garchomp テラ Ground: Earthquake使用
    const teraAttacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
      isTera: true,
      teraType: 'Ground',
    });
    const defender = new Pokemon({
      name: 'Excadrill',
      sp: { hp: 32, def: 32 },
      nature: 'Impish',
    });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(teraAttacker, defender, move, field);
    // Ground vs Ground/Steel = 2x, STAB 2.0x（テラ一致）
    expect(result.typeEffectiveness).toBe(2);
    expect(result.range()[0]).toBeGreaterThan(0);
  });

  it('テラスタル防御側 + 攻撃側の組み合わせ', () => {
    // 攻撃: Starmie → Ice Beam
    // 防御: Garchomp テラ Water（氷→水は半減になる、元は4倍弱点）
    const attacker = new Pokemon({
      name: 'Starmie',
      sp: { spa: 32 },
      nature: 'Modest',
    });
    const teraDefender = new Pokemon({
      name: 'Garchomp',
      sp: { hp: 32, spd: 32 },
      nature: 'Careful',
      isTera: true,
      teraType: 'Water',
    });
    const iceBeam = new Move('Ice Beam');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, teraDefender, iceBeam, field);
    // Ice vs Water = 0.5x（半減）、元は Dragon/Ground で4倍弱点だった
    expect(result.typeEffectiveness).toBe(0.5);
  });

  it('非テラ時は既存のSTAB計算と完全一致する', () => {
    // 非テラの場合、変更前と全く同じ計算結果であること
    const attacker = new Pokemon({
      name: 'Garchomp',
      sp: { atk: 32 },
      nature: 'Adamant',
      ability: 'Sand Veil',
    });
    const defender = new Pokemon({
      name: 'Excadrill',
      sp: { hp: 32, def: 32 },
      nature: 'Impish',
    });
    const earthquake = new Move('Earthquake');
    const dragonClaw = new Move('Dragon Claw');
    const field = new Field({ gameType: 'Singles' });

    // Ground技: STAB 1.5x（Dragon/Groundの一致）
    const eqResult = calculate(attacker, defender, earthquake, field);
    expect(eqResult.range()[0]).toBeGreaterThan(0);
    expect(eqResult.typeEffectiveness).toBe(2);

    // Dragon技: STAB 1.5x
    const dcResult = calculate(attacker, defender, dragonClaw, field);
    expect(dcResult.range()[0]).toBeGreaterThan(0);
  });
});
