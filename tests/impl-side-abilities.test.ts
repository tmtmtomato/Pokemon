// 味方支援特性テスト: Battery, Power Spot, Steely Spirit, Flower Gift
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

// 比率確認用ヘルパー: 最小ロール同士の比率
function damageRatio(with_: number[], without: number[]): number {
  return with_[0] / without[0];
}

// === 共通ファクトリ ===
const physicalAttacker = () => new Pokemon({
  name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
});
const specialAttacker = () => new Pokemon({
  name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
});
const neutralDefender = () => new Pokemon({
  name: 'Kangaskhan', sp: { hp: 32, def: 32, spd: 32 }, nature: 'Careful',
});
const steelAttacker = () => new Pokemon({
  name: 'Metagross', sp: { atk: 32 }, nature: 'Adamant', ability: 'Clear Body',
});

// =============================================================================
// Battery（バッテリー）
// =============================================================================
describe('Battery（バッテリー）', () => {

  it('バッテリー: 味方の特殊技が約1.3倍になる', () => {
    const atk = specialAttacker();
    const def = neutralDefender();
    const move = new Move('Flamethrower');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withBattery = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isBattery: true } }));

    const ratio = damageRatio(withBattery.rolls, without.rolls);
    // 4096ベース丸めにより正確に1.3にはならない（±数%の誤差あり）
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it('バッテリー: 物理技には効果なし', () => {
    const atk = physicalAttacker();
    const def = neutralDefender();
    const move = new Move('Dragon Claw');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withBattery = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isBattery: true } }));

    expect(withBattery.rolls[0]).toBe(without.rolls[0]);
  });

  it('バッテリー: フラグなしで効果なし', () => {
    const atk = specialAttacker();
    const def = neutralDefender();
    const move = new Move('Flamethrower');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withoutFlag = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isBattery: false } }));

    expect(withoutFlag.rolls[0]).toBe(without.rolls[0]);
  });
});

// =============================================================================
// Power Spot（パワースポット）
// =============================================================================
describe('Power Spot（パワースポット）', () => {

  it('パワースポット: 味方の物理技が約1.3倍になる', () => {
    const atk = physicalAttacker();
    const def = neutralDefender();
    const move = new Move('Dragon Claw');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withPowerSpot = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isPowerSpot: true } }));

    const ratio = damageRatio(withPowerSpot.rolls, without.rolls);
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it('パワースポット: 味方の特殊技にも効果あり', () => {
    const atk = specialAttacker();
    const def = neutralDefender();
    const move = new Move('Flamethrower');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withPowerSpot = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isPowerSpot: true } }));

    const ratio = damageRatio(withPowerSpot.rolls, without.rolls);
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it('パワースポット: フラグなしで効果なし', () => {
    const atk = physicalAttacker();
    const def = neutralDefender();
    const move = new Move('Dragon Claw');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withoutFlag = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isPowerSpot: false } }));

    expect(withoutFlag.rolls[0]).toBe(without.rolls[0]);
  });
});

// =============================================================================
// Steely Spirit（はがねのせいしん）
// =============================================================================
describe('Steely Spirit（はがねのせいしん）', () => {

  it('はがねのせいしん: 鋼タイプ技が約1.5倍になる', () => {
    const atk = steelAttacker();
    const def = neutralDefender();
    const move = new Move('Iron Head');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withSteely = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isSteelySpirit: true } }));

    const ratio = damageRatio(withSteely.rolls, without.rolls);
    // 4096ベース丸めにより正確に1.5にはならない（±数%の誤差あり）
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it('はがねのせいしん: 非鋼技には効果なし', () => {
    const atk = steelAttacker();
    const def = neutralDefender();
    const move = new Move('Earthquake');

    const without = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withSteely = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isSteelySpirit: true } }));

    expect(withSteely.rolls[0]).toBe(without.rolls[0]);
  });
});

// =============================================================================
// Flower Gift（フラワーギフト）
// =============================================================================
describe('Flower Gift（フラワーギフト）', () => {

  it('フラワーギフト晴れ: 物理攻撃の攻撃力が1.5倍', () => {
    const atk = physicalAttacker();
    const def = neutralDefender();
    const move = new Move('Dragon Claw');

    const noGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', weather: 'Sun' }));
    const withGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', weather: 'Sun', attackerSide: { isFlowerGift: true } }));

    const ratio = damageRatio(withGift.rolls, noGift.rolls);
    expect(ratio).toBeCloseTo(1.5, 1);
  });

  it('フラワーギフト晴れ: 被特殊ダメージが減少（SpD 1.5倍）', () => {
    const atk = specialAttacker();
    const def = neutralDefender();
    const move = new Move('Flamethrower');

    // 晴れでの比較 — defenderSide に isFlowerGift を設定
    const noGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', weather: 'Sun' }));
    const withGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', weather: 'Sun', defenderSide: { isFlowerGift: true } }));

    // SpD 1.5倍でダメージ減少（比率は約 1/1.5 ≒ 0.667）
    const ratio = damageRatio(withGift.rolls, noGift.rolls);
    expect(ratio).toBeLessThan(1.0);
    expect(ratio).toBeGreaterThanOrEqual(0.63);
    expect(ratio).toBeLessThanOrEqual(0.70);
  });

  it('フラワーギフト晴れなし: 効果なし', () => {
    const atk = physicalAttacker();
    const def = neutralDefender();
    const move = new Move('Dragon Claw');

    // 天候なし — フラワーギフトは発動しない
    const noGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles' }));
    const withGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', attackerSide: { isFlowerGift: true } }));

    expect(withGift.rolls[0]).toBe(noGift.rolls[0]);
  });

  it('フラワーギフト: 特殊攻撃力には影響なし', () => {
    const atk = specialAttacker();
    const def = neutralDefender();
    const move = new Move('Flamethrower');

    // attackerSide.isFlowerGift=true + Sun でも特殊攻撃力には影響なし
    const noGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', weather: 'Sun' }));
    const withGift = calculate(atk, def, move,
      new Field({ gameType: 'Doubles', weather: 'Sun', attackerSide: { isFlowerGift: true } }));

    expect(withGift.rolls[0]).toBe(noGift.rolls[0]);
  });
});
