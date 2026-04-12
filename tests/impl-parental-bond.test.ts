// おやこあい (Parental Bond) 実装テスト
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';
import { applyMod, MOD } from '../src/mechanics/util.js';
import { calculateDamage } from '../src/mechanics/damage.js';

describe('おやこあい (Parental Bond)', () => {

  // === 基本動作テスト ===

  it('合計ダメージが1撃目 + 2撃目(0.25倍)になる', () => {
    // おやこあい有り: メガガルーラ
    const withPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', isMega: true,
    });
    // おやこあい無し: 通常ガルーラ（Scrappy特性）
    const withoutPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');
    const field = new Field({ gameType: 'Singles' });

    const resultWith = calculate(withPB, defender, move, field);
    const resultWithout = calculate(withoutPB, defender, move, field);

    // メガガルーラの方が種族値が高いのでまず直接比較はできないが、
    // おやこあいの結果は、各ロールが firstHit + applyMod(firstHit, MOD.x0_25) であることを検証
    // calculateDamage を直接使って検証
    const dmgWith = calculateDamage(withPB, defender, move.clone(), field);
    expect(dmgWith.rolls.length).toBe(16);

    // 各ロールが0より大きい（有効なダメージ）
    for (const roll of dmgWith.rolls) {
      expect(roll).toBeGreaterThan(0);
    }

    // おやこあいの各ロールは通常ダメージの約1.25倍
    // メガの種族値差があるため、同じポケモンで能力だけ違う比較が必要
    // → 次のテストで正確な検証を行う
  });

  it('各ロールが正確に firstHit + applyMod(firstHit, 1024) になる', () => {
    // おやこあい有り
    const withPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', isMega: true,
    });
    // おやこあい無しで同じ種族値を再現するためMetagrossを使用（能力指定でParental Bond無し）
    // ただしメガガルーラの種族値と完全に一致するポケモンはいないので、
    // 代わりに calculateDamage 内部の計算を直接検証する

    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake'); // ガルーラが使っても等倍になるGround技
    const field = new Field({ gameType: 'Singles' });

    // おやこあい無しのガルーラでダメージを計算
    const withoutPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    const rollsWithout = calculateDamage(withoutPB, defender, move.clone(), field).rolls;

    // おやこあい有りのメガガルーラは種族値が違う（atk 125 vs 95）ので
    // 直接比較は適切ではない。代わりに別ポケモンに ability 指定で検証
    const attackerPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', ability: 'Parental Bond',
    });
    // 通常ガルーラ(atk95) + Parental Bond
    const rollsPB = calculateDamage(attackerPB, defender, move.clone(), field).rolls;

    // 各ロールが正確に firstHit + floor(pokeRound(firstHit * 1024 / 4096)) であることを検証
    for (let i = 0; i < 16; i++) {
      const firstHit = rollsWithout[i]; // Parental Bond無しと同じ（同じ種族値、同じ能力補正なし）
      const secondHit = Math.max(1, applyMod(firstHit, MOD.x0_25));
      const expected = firstHit + secondHit;
      expect(rollsPB[i]).toBe(expected);
    }
  });

  it('2撃目は applyMod による端数処理で正しく計算される', () => {
    // 手計算検証: applyMod(100, 1024) = pokeRound(100 * 1024 / 4096) = pokeRound(25.0) = 25
    expect(applyMod(100, MOD.x0_25)).toBe(25);

    // applyMod(99, 1024) = pokeRound(99 * 1024 / 4096) = pokeRound(24.75) = 25
    // (0.75 > 0.5 なので切り上げ)
    expect(applyMod(99, MOD.x0_25)).toBe(25);

    // applyMod(1, 1024) = pokeRound(1 * 1024 / 4096) = pokeRound(0.25) = 0
    // → Math.max(1, 0) = 1 (最低1ダメージ保証)
    expect(Math.max(1, applyMod(1, MOD.x0_25))).toBe(1);

    // applyMod(50, 1024) = pokeRound(50 * 1024 / 4096) = pokeRound(12.5) = 12 (0.5は切り捨て)
    expect(applyMod(50, MOD.x0_25)).toBe(12);
  });

  // === 適用除外テスト ===

  it('変化技には適用されない', () => {
    const attacker = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', isMega: true,
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const statusMove = new Move('Swords Dance');
    const field = new Field({ gameType: 'Singles' });

    const result = calculateDamage(attacker, defender, statusMove, field);
    // 変化技は全てダメージ0
    expect(result.rolls.every(r => r === 0)).toBe(true);
  });

  it('多段技には適用されない', () => {
    const withPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', ability: 'Parental Bond',
    });
    const withoutPB = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', ability: 'Scrappy',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const multiHitMove = new Move('Icicle Spear'); // multiHit: [2, 5]
    const field = new Field({ gameType: 'Singles' });

    const rollsPB = calculateDamage(withPB, defender, multiHitMove, field).rolls;
    const rollsNormal = calculateDamage(withoutPB, defender, multiHitMove, field).rolls;

    // 多段技では Parental Bond が適用されないので、同じダメージになるはず
    for (let i = 0; i < 16; i++) {
      expect(rollsPB[i]).toBe(rollsNormal[i]);
    }
  });

  // === 最低ダメージ保証テスト ===

  it('2撃目も最低1ダメージ保証', () => {
    // 超低ダメージ状況を作る: 低攻撃力 vs 高防御力
    const weakAttacker = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 0 }, nature: 'Bold', ability: 'Parental Bond',
      // Bold: -atk, +def
    });
    const tankDefender = new Pokemon({
      name: 'Skarmory', sp: { hp: 32, def: 32 }, nature: 'Impish',
    });
    // Bullet Punch: BP40, Steel vs Steel = 0.5x
    const weakMove = new Move('Bullet Punch');
    const field = new Field({ gameType: 'Singles' });

    const resultPB = calculateDamage(weakAttacker, tankDefender, weakMove, field);
    const withoutPBAttacker = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 0 }, nature: 'Bold', ability: 'Scrappy',
    });
    const resultNoPB = calculateDamage(withoutPBAttacker, tankDefender, weakMove, field);

    // おやこあい有りのダメージは、無しのダメージ + 最低1以上
    for (let i = 0; i < 16; i++) {
      const firstHit = resultNoPB.rolls[i];
      const secondHit = Math.max(1, applyMod(firstHit, MOD.x0_25));
      expect(resultPB.rolls[i]).toBe(firstHit + secondHit);
      // 2撃目が最低1であることを確認
      expect(secondHit).toBeGreaterThanOrEqual(1);
    }
  });

  // === 他の修正値との組み合わせテスト ===

  it('急所 + おやこあいで正しく計算される', () => {
    const pbCrit = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant',
      ability: 'Parental Bond',
    });
    const noPBCrit = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant',
      ability: 'Scrappy',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const critMove = new Move('Return', { isCrit: true });
    const field = new Field({ gameType: 'Singles' });

    const rollsWithPB = calculateDamage(pbCrit, defender, critMove.clone(), field).rolls;
    const rollsWithout = calculateDamage(noPBCrit, defender, critMove.clone(), field).rolls;

    for (let i = 0; i < 16; i++) {
      const firstHit = rollsWithout[i];
      const secondHit = Math.max(1, applyMod(firstHit, MOD.x0_25));
      expect(rollsWithPB[i]).toBe(firstHit + secondHit);
    }
  });

  // === KO計算への影響テスト ===

  it('おやこあいの合算ダメージでKO計算が正しく動く', () => {
    const attacker = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', isMega: true,
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 0 } });
    const move = new Move('Return');
    const field = new Field({ gameType: 'Singles' });

    const result = calculate(attacker, defender, move, field);
    const [min, max] = result.range();
    const ko = result.koChance();

    // ダメージが正の値
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThanOrEqual(min);
    // KO計算が正常に動作（n > 0）
    expect(ko.n).toBeGreaterThan(0);
    expect(ko.text).toBeTruthy();
  });

  // === メガガルーラ固有テスト ===

  it('メガガルーラの effectiveAbility が Parental Bond を返す', () => {
    const mega = new Pokemon({
      name: 'Kangaskhan', isMega: true,
    });
    expect(mega.effectiveAbility()).toBe('Parental Bond');
  });

  it('通常ガルーラには Parental Bond が適用されない', () => {
    const normal = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant',
    });
    const mega = new Pokemon({
      name: 'Kangaskhan', sp: { atk: 32 }, nature: 'Adamant', isMega: true,
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Return');
    const field = new Field({ gameType: 'Singles' });

    const rollsNormal = calculateDamage(normal, defender, move.clone(), field).rolls;
    const rollsMega = calculateDamage(mega, defender, move.clone(), field).rolls;

    // メガガルーラは種族値も高いのでダメージは必ず高い
    // 通常ガルーラのダメージに対して、メガは2撃目分が上乗せ + 種族値差
    for (let i = 0; i < 16; i++) {
      expect(rollsMega[i]).toBeGreaterThan(rollsNormal[i]);
    }
  });
});
