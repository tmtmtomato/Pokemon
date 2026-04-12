// フィールド特性テスト: 破滅系特性4種 + フェアリーオーラ/ダークオーラ/オーラブレイク
import { describe, it, expect } from 'vitest';
import { calculate, Pokemon, Move, Field } from '../src/index.js';

// ===== 破滅系特性（わざわいシリーズ）テスト =====

describe('破滅系特性: わざわいのうつわ (Tablets of Ruin) — 攻撃側の物理攻撃力0.75倍', () => {

  const physicalAttacker = () => new Pokemon({
    name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
  });
  const defender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, def: 32 }, nature: 'Impish',
  });

  it('Tablets of Ruin: 物理攻撃のダメージが減少する', () => {
    const move = new Move('Earthquake');
    const noRuin = calculate(physicalAttacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(physicalAttacker(), defender(), move,
      new Field({ gameType: 'Singles', isTabletsOfRuin: true }));

    // Atk が 0.75倍されるのでダメージが減少する
    expect(withRuin.range()[0]).toBeLessThan(noRuin.range()[0]);
    // 比率は約0.75に近い
    const ratio = withRuin.range()[0] / noRuin.range()[0];
    expect(ratio).toBeCloseTo(0.75, 1);
  });

  it('Tablets of Ruin: 特殊攻撃には影響なし', () => {
    const specialAttacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const def = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
    });
    const move = new Move('Flamethrower');

    const noRuin = calculate(specialAttacker, def, move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(specialAttacker, def, move,
      new Field({ gameType: 'Singles', isTabletsOfRuin: true }));

    // 特殊攻撃なので Tablets of Ruin は影響しない
    expect(withRuin.range()[0]).toBe(noRuin.range()[0]);
  });
});

describe('破滅系特性: わざわいのおふだ (Vessel of Ruin) — 攻撃側の特殊攻撃力0.75倍', () => {

  const specialAttacker = () => new Pokemon({
    name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
  });
  const defender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
  });

  it('Vessel of Ruin: 特殊攻撃のダメージが減少する', () => {
    const move = new Move('Flamethrower');
    const noRuin = calculate(specialAttacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(specialAttacker(), defender(), move,
      new Field({ gameType: 'Singles', isVesselOfRuin: true }));

    expect(withRuin.range()[0]).toBeLessThan(noRuin.range()[0]);
    const ratio = withRuin.range()[0] / noRuin.range()[0];
    expect(ratio).toBeCloseTo(0.75, 1);
  });

  it('Vessel of Ruin: 物理攻撃には影響なし', () => {
    const physAttacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const def = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, def: 32 }, nature: 'Impish',
    });
    const move = new Move('Earthquake');

    const noRuin = calculate(physAttacker, def, move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(physAttacker, def, move,
      new Field({ gameType: 'Singles', isVesselOfRuin: true }));

    expect(withRuin.range()[0]).toBe(noRuin.range()[0]);
  });
});

describe('破滅系特性: わざわいのつるぎ (Sword of Ruin) — 防御側の物理防御0.75倍', () => {

  const attacker = () => new Pokemon({
    name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
  });
  const defender = () => new Pokemon({
    name: 'Excadrill', sp: { hp: 32, def: 32 }, nature: 'Impish',
  });

  it('Sword of Ruin: 物理攻撃のダメージが増加する（防御低下のため）', () => {
    const move = new Move('Earthquake');
    const noRuin = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles', isSwordOfRuin: true }));

    // Def が 0.75倍されるのでダメージが増加する
    expect(withRuin.range()[0]).toBeGreaterThan(noRuin.range()[0]);
  });

  it('Sword of Ruin: 特殊防御には影響なし', () => {
    const spAttacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const def = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
    });
    const move = new Move('Flamethrower');

    const noRuin = calculate(spAttacker, def, move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(spAttacker, def, move,
      new Field({ gameType: 'Singles', isSwordOfRuin: true }));

    // 特殊技なので Sword of Ruin は影響しない
    expect(withRuin.range()[0]).toBe(noRuin.range()[0]);
  });
});

describe('破滅系特性: わざわいのたま (Beads of Ruin) — 防御側の特殊防御0.75倍', () => {

  const attacker = () => new Pokemon({
    name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
  });
  const defender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
  });

  it('Beads of Ruin: 特殊攻撃のダメージが増加する（特防低下のため）', () => {
    const move = new Move('Flamethrower');
    const noRuin = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles', isBeadsOfRuin: true }));

    // SpD が 0.75倍されるのでダメージが増加する
    expect(withRuin.range()[0]).toBeGreaterThan(noRuin.range()[0]);
  });

  it('Beads of Ruin: 物理防御には影響なし', () => {
    const physAttacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant',
    });
    const def = new Pokemon({
      name: 'Excadrill', sp: { hp: 32, def: 32 }, nature: 'Impish',
    });
    const move = new Move('Earthquake');

    const noRuin = calculate(physAttacker, def, move,
      new Field({ gameType: 'Singles' }));
    const withRuin = calculate(physAttacker, def, move,
      new Field({ gameType: 'Singles', isBeadsOfRuin: true }));

    // 物理技なので Beads of Ruin は影響しない
    expect(withRuin.range()[0]).toBe(noRuin.range()[0]);
  });
});

// ===== オーラ特性テスト =====

describe('フェアリーオーラ (Fairy Aura)', () => {

  const attacker = () => new Pokemon({
    name: 'Clefable', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce',
  });
  const defender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
  });

  it('Fairy Aura: フェアリー技のダメージが約1.33倍になる', () => {
    const move = new Move('Moonblast');
    const noAura = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withAura = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles', isFairyAura: true }));

    const ratio = withAura.range()[0] / noAura.range()[0];
    expect(ratio).toBeCloseTo(1.33, 1);
  });

  it('Fairy Aura: 非フェアリー技には効果なし', () => {
    const move = new Move('Flamethrower');
    const spAttacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const noAura = calculate(spAttacker, defender(), move,
      new Field({ gameType: 'Singles' }));
    const withAura = calculate(spAttacker, defender(), move,
      new Field({ gameType: 'Singles', isFairyAura: true }));

    expect(withAura.range()[0]).toBe(noAura.range()[0]);
  });
});

describe('ダークオーラ (Dark Aura)', () => {

  const attacker = () => new Pokemon({
    name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
  });
  const defender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
  });

  it('Dark Aura: あく技のダメージが約1.33倍になる', () => {
    const move = new Move('Dark Pulse');
    const noAura = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withAura = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles', isDarkAura: true }));

    const ratio = withAura.range()[0] / noAura.range()[0];
    expect(ratio).toBeCloseTo(1.33, 1);
  });

  it('Dark Aura: 非あく技には効果なし', () => {
    const move = new Move('Flamethrower');
    const noAura = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles' }));
    const withAura = calculate(attacker(), defender(), move,
      new Field({ gameType: 'Singles', isDarkAura: true }));

    expect(withAura.range()[0]).toBe(noAura.range()[0]);
  });
});

describe('オーラブレイク (Aura Break)', () => {

  const defender = () => new Pokemon({
    name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
  });

  it('Aura Break: フェアリーオーラが0.75倍に反転する', () => {
    const attacker = new Pokemon({
      name: 'Clefable', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce',
    });
    const move = new Move('Moonblast');

    const noAura = calculate(attacker, defender(), move,
      new Field({ gameType: 'Singles' }));
    const withAuraBreak = calculate(attacker, defender(), move,
      new Field({ gameType: 'Singles', isFairyAura: true, isAuraBreak: true }));

    // オーラブレイクにより 1.33倍 → 0.75倍に反転
    const ratio = withAuraBreak.range()[0] / noAura.range()[0];
    expect(ratio).toBeCloseTo(0.75, 1);
  });

  it('Aura Break: ダークオーラが0.75倍に反転する', () => {
    const attacker = new Pokemon({
      name: 'Charizard', sp: { spa: 32 }, nature: 'Modest', ability: 'Blaze',
    });
    const move = new Move('Dark Pulse');

    const noAura = calculate(attacker, defender(), move,
      new Field({ gameType: 'Singles' }));
    const withAuraBreak = calculate(attacker, defender(), move,
      new Field({ gameType: 'Singles', isDarkAura: true, isAuraBreak: true }));

    const ratio = withAuraBreak.range()[0] / noAura.range()[0];
    expect(ratio).toBeCloseTo(0.75, 1);
  });

  it('Aura Break単体: オーラなしでは効果なし', () => {
    const attacker = new Pokemon({
      name: 'Clefable', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce',
    });
    const move = new Move('Moonblast');

    const noBreak = calculate(attacker, defender(), move,
      new Field({ gameType: 'Singles' }));
    const withBreak = calculate(attacker, defender(), move,
      new Field({ gameType: 'Singles', isAuraBreak: true }));

    // Fairy Aura がないので Aura Break だけでは何も変わらない
    expect(withBreak.range()[0]).toBe(noBreak.range()[0]);
  });
});

// ===== 特性自動検出テスト =====

describe('特性自動検出: フィールドフラグ不要でポケモンの特性から自動適用', () => {

  it('Mega Floette (Fairy Aura): フィールドフラグなしでフェアリー技が1.33倍', () => {
    // Mega Floette has Fairy Aura — should auto-apply without field flag
    const megaFloette = new Pokemon({
      name: 'Floette', sp: { spa: 32 }, nature: 'Modest',
      item: 'Floettite', isMega: true,
    });
    const defender = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful',
    });
    const moonblast = new Move('Moonblast');
    const field = new Field({ gameType: 'Singles' });

    // Verify Mega Floette has Fairy Aura
    expect(megaFloette.effectiveAbility()).toBe('Fairy Aura');

    // Auto-detection: no field flag set, but Fairy Aura should still boost
    const result = calculate(megaFloette, defender, moonblast, field);

    // Compare with manual field flag (should match)
    const manualResult = calculate(
      new Pokemon({ name: 'Floette', sp: { spa: 32 }, nature: 'Modest', item: 'Floettite', isMega: true }),
      new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful' }),
      new Move('Moonblast'),
      new Field({ gameType: 'Singles', isFairyAura: true }),
    );

    expect(result.range()[0]).toBe(manualResult.range()[0]);
    expect(result.range()[1]).toBe(manualResult.range()[1]);
  });

  it('Fairy Aura: 防御側が持っていてもフェアリー技が1.33倍', () => {
    const attacker = new Pokemon({
      name: 'Clefable', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce',
    });
    const megaFloette = new Pokemon({
      name: 'Floette', sp: { hp: 32, spd: 32 }, nature: 'Calm',
      item: 'Floettite', isMega: true,
    });
    const moonblast = new Move('Moonblast');

    const autoResult = calculate(attacker, megaFloette, moonblast, new Field({ gameType: 'Singles' }));
    const noAuraResult = calculate(
      new Pokemon({ name: 'Clefable', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce' }),
      new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, spd: 32 }, nature: 'Careful' }),
      new Move('Moonblast'),
      new Field({ gameType: 'Singles' }),
    );

    // Auto-detected Fairy Aura should boost damage compared to no aura at all
    // (different defenders, but the ratio check confirms aura is active)
    const manualResult = calculate(
      new Pokemon({ name: 'Clefable', sp: { spa: 32 }, nature: 'Modest', ability: 'Magic Bounce' }),
      new Pokemon({ name: 'Floette', sp: { hp: 32, spd: 32 }, nature: 'Calm', item: 'Floettite', isMega: true }),
      new Move('Moonblast'),
      new Field({ gameType: 'Singles', isFairyAura: true }),
    );

    expect(autoResult.range()[0]).toBe(manualResult.range()[0]);
  });

  it('Ruin特性: 攻撃側のSword of Ruinが自動検出される', () => {
    // While no Champions Pokemon has this, test the auto-detection mechanism
    const attacker = new Pokemon({
      name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant', ability: 'Sword of Ruin',
    });
    const defender = new Pokemon({
      name: 'Kangaskhan', sp: { hp: 32, def: 32 }, nature: 'Impish',
    });
    const move = new Move('Earthquake');
    const field = new Field({ gameType: 'Singles' });

    // Auto-detected: no field flag
    const autoResult = calculate(attacker, defender, move, field);
    // Manual: with field flag
    const manualResult = calculate(
      new Pokemon({ name: 'Garchomp', sp: { atk: 32 }, nature: 'Adamant' }),
      new Pokemon({ name: 'Kangaskhan', sp: { hp: 32, def: 32 }, nature: 'Impish' }),
      new Move('Earthquake'),
      new Field({ gameType: 'Singles', isSwordOfRuin: true }),
    );

    expect(autoResult.range()[0]).toBe(manualResult.range()[0]);
  });
});
