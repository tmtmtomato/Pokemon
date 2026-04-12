// 攻撃系特性の実装テスト: ごりむちゅう / パンクロック / アナライズ
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

// ヘルパー: 2つのシナリオのダメージ比を計算
function damageRatio(a: ReturnType<typeof calculate>, b: ReturnType<typeof calculate>): number {
  return a.range()[0] / b.range()[0];
}

describe('Gorilla Tactics（ごりむちゅう）', () => {

  it('ごりむちゅう: 物理攻撃力が1.5倍になる', () => {
    const withGT = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Gorilla Tactics',
    });
    const withoutGT = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Veil',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const gtResult = calculate(withGT, defender, move, field);
    const noGTResult = calculate(withoutGT, defender, move, field);

    const ratio = damageRatio(gtResult, noGTResult);
    expect(ratio).toBeCloseTo(1.5, 0);
  });

  it('ごりむちゅう: 特殊技には効果なし', () => {
    const withGT = new Pokemon({
      name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest', ability: 'Gorilla Tactics',
    });
    const withoutGT = new Pokemon({
      name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest', ability: 'Sand Veil',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, spd: 32 } });
    const move = new Move('Flamethrower');
    const field = new Field({ gameType: 'Singles' });

    const gtResult = calculate(withGT, defender, move, field);
    const noGTResult = calculate(withoutGT, defender, move, field);

    expect(gtResult.range()[0]).toBe(noGTResult.range()[0]);
  });

  it('ごりむちゅう: タイプ強化アイテムと重複して適用される', () => {
    const gtWithItem = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
      ability: 'Gorilla Tactics', item: 'Soft Sand',
    });
    const itemOnly = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
      ability: 'Sand Veil', item: 'Soft Sand',
    });
    const defender = new Pokemon({ name: 'Excadrill', sp: { hp: 32, def: 32 } });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    const gtItemResult = calculate(gtWithItem, defender, move, field);
    const itemResult = calculate(itemOnly, defender, move, field);

    // ごりむちゅう（1.5倍）がSoft Sand（1.2倍）に追加で乗る
    const ratio = damageRatio(gtItemResult, itemResult);
    expect(ratio).toBeCloseTo(1.5, 0);
  });
});

describe('Punk Rock（パンクロック）', () => {

  it('パンクロック(攻撃): 音技のダメージが約1.3倍になる', () => {
    const withPR = new Pokemon({
      name: 'Gardevoir', sp: { spa: 32 }, nature: 'Modest', ability: 'Punk Rock',
    });
    const withoutPR = new Pokemon({
      name: 'Gardevoir', sp: { spa: 32 }, nature: 'Modest', ability: 'Trace',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Hyper Voice');
    const field = new Field({ gameType: 'Singles' });

    const prResult = calculate(withPR, defender, move, field);
    const noPRResult = calculate(withoutPR, defender, move, field);

    const ratio = damageRatio(prResult, noPRResult);
    expect(ratio).toBeCloseTo(1.3, 0);
  });

  it('パンクロック(攻撃): 非音技には効果なし', () => {
    const withPR = new Pokemon({
      name: 'Gardevoir', sp: { spa: 32 }, nature: 'Modest', ability: 'Punk Rock',
    });
    const withoutPR = new Pokemon({
      name: 'Gardevoir', sp: { spa: 32 }, nature: 'Modest', ability: 'Trace',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, spd: 32 } });
    const move = new Move('Moonblast'); // 非音技
    const field = new Field({ gameType: 'Singles' });

    const prResult = calculate(withPR, defender, move, field);
    const noPRResult = calculate(withoutPR, defender, move, field);

    expect(prResult.range()[0]).toBe(noPRResult.range()[0]);
  });

  it('パンクロック(防御): 音技の被ダメージが0.5倍になる', () => {
    const defenderPR = new Pokemon({
      name: 'Gardevoir', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Punk Rock',
    });
    const defenderNoPR = new Pokemon({
      name: 'Gardevoir', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Trace',
    });
    const attacker = new Pokemon({ name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest' });
    const move = new Move('Hyper Voice');
    const field = new Field({ gameType: 'Singles' });

    const vsPR = calculate(attacker, defenderPR, move, field);
    const vsNoPR = calculate(attacker, defenderNoPR, move, field);

    const ratio = vsPR.range()[0] / vsNoPR.range()[0];
    expect(ratio).toBeCloseTo(0.5, 0);
  });

  it('パンクロック(防御): 非音技の被ダメージには効果なし', () => {
    const defenderPR = new Pokemon({
      name: 'Gardevoir', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Punk Rock',
    });
    const defenderNoPR = new Pokemon({
      name: 'Gardevoir', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Trace',
    });
    const attacker = new Pokemon({ name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest' });
    const move = new Move('Flamethrower'); // 非音技
    const field = new Field({ gameType: 'Singles' });

    const vsPR = calculate(attacker, defenderPR, move, field);
    const vsNoPR = calculate(attacker, defenderNoPR, move, field);

    expect(vsPR.range()[0]).toBe(vsNoPR.range()[0]);
  });

  it('パンクロック(防御): かたやぶりで貫通される', () => {
    const defenderPR = new Pokemon({
      name: 'Gardevoir', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Punk Rock',
    });
    const defenderNoPR = new Pokemon({
      name: 'Gardevoir', sp: { hp: 32, spd: 32 }, nature: 'Careful', ability: 'Trace',
    });
    // かたやぶり持ちの攻撃者
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { spa: 32 }, nature: 'Modest', ability: 'Mold Breaker',
    });
    const move = new Move('Hyper Voice');
    const field = new Field({ gameType: 'Singles' });

    const vsPR = calculate(attacker, defenderPR, move, field);
    const vsNoPR = calculate(attacker, defenderNoPR, move, field);

    // かたやぶりでPunk Rockの防御効果が無視されるので同じダメージ
    expect(vsPR.range()[0]).toBe(vsNoPR.range()[0]);
  });
});

describe('Analytic（アナライズ）', () => {

  it('アナライズ: ダメージが約1.3倍になる', () => {
    const withAnalytic = new Pokemon({
      name: 'Excadrill', sp: { atk: 32 }, nature: 'Adamant', ability: 'Analytic',
    });
    const withoutAnalytic = new Pokemon({
      name: 'Excadrill', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sand Rush',
    });
    const defender = new Pokemon({ name: 'Garchomp', sp: { hp: 32, def: 32 } });
    const move = new Move('Iron Head');
    const field = new Field({ gameType: 'Singles' });

    const analyticResult = calculate(withAnalytic, defender, move, field);
    const noAnalyticResult = calculate(withoutAnalytic, defender, move, field);

    const ratio = damageRatio(analyticResult, noAnalyticResult);
    expect(ratio).toBeCloseTo(1.3, 0);
  });
});
