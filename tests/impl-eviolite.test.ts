// しんかのきせき (Eviolite) 実装テスト
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

describe('しんかのきせき (Eviolite)', () => {

  // テスト1: 未進化ポケモンの被物理ダメージが減少する (Def 1.5倍)
  it('未進化ポケモンの被物理ダメージが減少する (Def 1.5倍)', () => {
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    // Chansey は未進化 (isNFE: true) — ハピナスに進化可能
    const withEviolite = new Pokemon({
      name: 'Chansey', sp: { hp: 32, def: 32 }, item: 'Eviolite',
    });
    const withoutItem = new Pokemon({
      name: 'Chansey', sp: { hp: 32, def: 32 },
    });
    const move = new Move('Return'); // 物理・ノーマル技
    const field = new Field({ gameType: 'Singles' });

    const vsEviolite = calculate(attacker, withEviolite, move, field);
    const vsNoItem = calculate(attacker, withoutItem, move, field);

    // しんかのきせきで物理ダメージが軽減されるべき
    expect(vsEviolite.range()[0]).toBeLessThan(vsNoItem.range()[0]);
    // Def 1.5倍なのでダメージ比は約 1/1.5 ≒ 0.667
    const ratio = vsEviolite.range()[0] / vsNoItem.range()[0];
    expect(ratio).toBeCloseTo(1 / 1.5, 1);
  });

  // テスト2: 未進化ポケモンの被特殊ダメージが減少する (SpD 1.5倍)
  it('未進化ポケモンの被特殊ダメージが減少する (SpD 1.5倍)', () => {
    const attacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    // Porygon2 は未進化 (isNFE: true) — ポリゴンZに進化可能
    const withEviolite = new Pokemon({
      name: 'Porygon2', sp: { hp: 32, spd: 32 }, item: 'Eviolite',
    });
    const withoutItem = new Pokemon({
      name: 'Porygon2', sp: { hp: 32, spd: 32 },
    });
    const move = new Move('Flamethrower'); // 特殊・炎技
    const field = new Field({ gameType: 'Singles' });

    const vsEviolite = calculate(attacker, withEviolite, move, field);
    const vsNoItem = calculate(attacker, withoutItem, move, field);

    // しんかのきせきで特殊ダメージが軽減されるべき
    expect(vsEviolite.range()[0]).toBeLessThan(vsNoItem.range()[0]);
    // SpD 1.5倍なのでダメージ比は約 1/1.5 ≒ 0.667
    const ratio = vsEviolite.range()[0] / vsNoItem.range()[0];
    expect(ratio).toBeCloseTo(1 / 1.5, 1);
  });

  // テスト3: 最終進化ポケモンには効果なし (isNFE未設定)
  it('最終進化ポケモンには効果なし (isNFE未設定)', () => {
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    // Garchomp は最終進化系 (isNFE なし)
    const withEviolite = new Pokemon({
      name: 'Garchomp', sp: { hp: 32, def: 32 }, item: 'Eviolite',
    });
    const withoutItem = new Pokemon({
      name: 'Garchomp', sp: { hp: 32, def: 32 },
    });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const vsEviolite = calculate(attacker, withEviolite, move, field);
    const vsNoItem = calculate(attacker, withoutItem, move, field);

    // 最終進化系ではしんかのきせきは無効
    expect(vsEviolite.range()[0]).toBe(vsNoItem.range()[0]);
    expect(vsEviolite.range()[1]).toBe(vsNoItem.range()[1]);
  });

  // テスト4: Eviolite以外のアイテムでは効果なし
  it('Eviolite以外のアイテムではNFEポケモンでも防御ブーストなし', () => {
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    // Chansey (NFE) に Leftovers を持たせても防御ブーストなし
    const withLeftovers = new Pokemon({
      name: 'Chansey', sp: { hp: 32, def: 32 }, item: 'Leftovers',
    });
    const withoutItem = new Pokemon({
      name: 'Chansey', sp: { hp: 32, def: 32 },
    });
    const move = new Move('Return');
    const field = new Field({ gameType: 'Singles' });

    const vsLeftovers = calculate(attacker, withLeftovers, move, field);
    const vsNoItem = calculate(attacker, withoutItem, move, field);

    // Leftovers は戦闘中のダメージ計算に影響しない
    expect(vsLeftovers.range()[0]).toBe(vsNoItem.range()[0]);
    expect(vsLeftovers.range()[1]).toBe(vsNoItem.range()[1]);
  });

  // テスト5: とつげきチョッキとの違い確認 (チョッキはSpDのみ、きせきはDef+SpD)
  it('とつげきチョッキとの違い: チョッキはSpDのみ、きせきはDef+SpDの両方', () => {
    const physicalAttacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });

    // Porygon2 (NFE) でとつげきチョッキ vs しんかのきせき
    const withVest = new Pokemon({
      name: 'Porygon2', sp: { hp: 32, def: 32, spd: 32 }, item: 'Assault Vest',
    });
    const withEviolite = new Pokemon({
      name: 'Porygon2', sp: { hp: 32, def: 32, spd: 32 }, item: 'Eviolite',
    });
    const withoutItem = new Pokemon({
      name: 'Porygon2', sp: { hp: 32, def: 32, spd: 32 },
    });

    const physicalMove = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const vestVsPhysical = calculate(physicalAttacker, withVest, physicalMove, field);
    const evioliteVsPhysical = calculate(physicalAttacker, withEviolite, physicalMove, field);
    const noItemVsPhysical = calculate(physicalAttacker, withoutItem, physicalMove, field);

    // とつげきチョッキは物理に無効 → アイテムなしと同じダメージ
    expect(vestVsPhysical.range()[0]).toBe(noItemVsPhysical.range()[0]);
    // しんかのきせきは物理にも有効 → ダメージ軽減
    expect(evioliteVsPhysical.range()[0]).toBeLessThan(noItemVsPhysical.range()[0]);
  });

});
