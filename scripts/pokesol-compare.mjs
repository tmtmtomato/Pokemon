/**
 * ポケソル (sv.pokesol.com/calc) との自動比較スクリプト v3
 *
 * 戦略: 性格補正x1.0、特性なし、アイテムなしの「素の計算式」で比較。
 * これにより MUI ドロップダウン/トグル操作の不安定さを回避し、
 * ポケモン・技・努力値のみで純粋なダメージ計算ロジックを検証する。
 *
 * ポケソルのスライダーは max=32 (0-32) 。SP値をそのまま渡す。
 */
import { chromium } from 'playwright';
import { calculate, Pokemon, Move, Field } from '../src/index.ts';

const POKEMON_JP = {
  'Garchomp': 'ガブリアス',
  'Metagross': 'メタグロス',
  'Corviknight': 'アーマーガア',
  'Dragonite': 'カイリュー',
  'Heatran': 'ヒードラン',
};

const MOVE_JP = {
  'Earthquake': 'じしん',
  'Crunch': 'かみくだく',
  'Dragon Claw': 'ドラゴンクロー',
  'Flamethrower': 'かえんほうしゃ',
};

// Test cases: all use nature x1.0 / no ability / no item
const TEST_CASES = [
  {
    id: 'PK-1', label: 'STAB+SE: ガブリアス(A252) じしん vs メタグロス(HB252)',
    atkPoke: 'Garchomp', move: 'Earthquake', atkSp: 32,
    defPoke: 'Metagross', hpSp: 32, defSp: 32,
    crit: false,
    our: { a: { name: 'Garchomp', sp: { atk: 32 } }, d: { name: 'Metagross', sp: { hp: 32, def: 32 } }, move: 'Earthquake' },
  },
  {
    id: 'PK-2', label: 'Neutral: ガブリアス(A252) かみくだく vs アーマーガア(HB252)',
    atkPoke: 'Garchomp', move: 'Crunch', atkSp: 32,
    defPoke: 'Corviknight', hpSp: 32, defSp: 32,
    crit: false,
    our: { a: { name: 'Garchomp', sp: { atk: 32 } }, d: { name: 'Corviknight', sp: { hp: 32, def: 32 } }, move: 'Crunch' },
  },
  {
    id: 'PK-3', label: 'Dragon SE: ガブリアス(A252) ドラゴンクロー vs カイリュー(HB252)',
    atkPoke: 'Garchomp', move: 'Dragon Claw', atkSp: 32,
    defPoke: 'Dragonite', hpSp: 32, defSp: 32,
    crit: false,
    our: { a: { name: 'Garchomp', sp: { atk: 32 } }, d: { name: 'Dragonite', sp: { hp: 32, def: 32 } }, move: 'Dragon Claw' },
  },
  {
    id: 'PK-4', label: 'Zero invest: ガブリアス(A0) じしん vs メタグロス(HB0)',
    atkPoke: 'Garchomp', move: 'Earthquake', atkSp: 0,
    defPoke: 'Metagross', hpSp: 0, defSp: 0,
    crit: false,
    our: { a: { name: 'Garchomp', sp: { atk: 0 } }, d: { name: 'Metagross', sp: { hp: 0, def: 0 } }, move: 'Earthquake' },
  },
  {
    id: 'PK-5', label: '急所: ガブリアス(A252) じしん crit vs メタグロス(HB252)',
    atkPoke: 'Garchomp', move: 'Earthquake', atkSp: 32,
    defPoke: 'Metagross', hpSp: 32, defSp: 32,
    crit: true,
    our: { a: { name: 'Garchomp', sp: { atk: 32 } }, d: { name: 'Metagross', sp: { hp: 32, def: 32 } }, move: 'Earthquake', crit: true },
  },
];

async function selectAutocomplete(page, nth, text) {
  const cb = page.locator('input[role="combobox"]').nth(nth);
  await cb.click();
  await cb.fill('');
  await page.waitForTimeout(300);
  await cb.fill(text);
  await page.waitForTimeout(800);
  try {
    await page.locator('.MuiAutocomplete-option').first().waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('.MuiAutocomplete-option').first().click();
  } catch {
    await cb.press('Enter');
  }
  await page.waitForTimeout(500);
}

async function main() {
  console.log('=== ポケソル Cross-Validation (性格x1.0, 特性なし, アイテムなし) ===\n');

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const tc of TEST_CASES) {
    console.log(`\n--- ${tc.id}: ${tc.label} ---`);
    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

    try {
      await page.goto('https://sv.pokesol.com/calc', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // 1. Set attacker Pokemon (combobox 0)
      await selectAutocomplete(page, 0, POKEMON_JP[tc.atkPoke]);

      // 2. Set move (combobox 1)
      await selectAutocomplete(page, 1, MOVE_JP[tc.move]);

      // 3. Set attacker EV slider — ensure nature is x1.0 first
      // Click x1.0 (MIDDLE) on attacker's toggle to ensure neutral
      const atkMiddle = page.locator('button[value="MIDDLE"]').first();
      await atkMiddle.click();
      await page.waitForTimeout(200);

      // Set attack EV slider (first range input)
      await page.locator('input[type="range"]').nth(0).fill(String(tc.atkSp));
      await page.waitForTimeout(300);

      // 4. Set defender Pokemon (last combobox)
      const comboCount = await page.locator('input[role="combobox"]').count();
      await selectAutocomplete(page, comboCount - 1, POKEMON_JP[tc.defPoke]);
      await page.waitForTimeout(500);

      // 5. Set defender EVs — all range sliders after the first one
      const sliderCount = await page.locator('input[type="range"]').count();
      console.log(`  Slider count: ${sliderCount}`);

      // Slider indices after Pokemon selection may vary
      // Re-query and set HP EV (2nd slider), Def EV (3rd slider)
      if (sliderCount >= 3) {
        await page.locator('input[type="range"]').nth(1).fill(String(tc.hpSp));
        await page.waitForTimeout(200);
        await page.locator('input[type="range"]').nth(2).fill(String(tc.defSp));
        await page.waitForTimeout(200);
      }

      // 6. Ensure defender nature is x1.0 — scroll down and click
      // Find all MIDDLE buttons and click the ones on the defender side
      const middleButtons = page.locator('button[value="MIDDLE"]');
      const middleCount = await middleButtons.count();
      console.log(`  MIDDLE button count: ${middleCount}`);
      for (let i = 1; i < middleCount; i++) {
        try {
          await middleButtons.nth(i).scrollIntoViewIfNeeded();
          await middleButtons.nth(i).click({ timeout: 2000 });
          await page.waitForTimeout(100);
        } catch { /* skip hidden ones */ }
      }

      // 7. Critical hit
      if (tc.crit) {
        const critCb = page.locator('text=急所').first();
        await critCb.scrollIntoViewIfNeeded();
        await critCb.click();
        await page.waitForTimeout(300);
      }

      // 8. Wait for calculation
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `scripts/pokesol-${tc.id}.png` });

      // 9. Read actual stat values displayed
      const atkStatValue = await page.evaluate(() => {
        const els = document.querySelectorAll('*');
        for (const el of els) {
          if (el.textContent?.includes('実数値') && el.textContent?.includes('努力値') && el.textContent?.includes('個体値')) {
            const match = el.textContent.match(/実数値\s*(\d+)/);
            if (match) return +match[1];
          }
        }
        return null;
      });
      console.log(`  Attacker stat (実数値): ${atkStatValue}`);

      // 10. Read damage
      const pokesolResult = await page.evaluate(() => {
        const text = document.body.innerText;
        const m = text.match(/(\d+)\s*~\s*(\d+)\s*\([\d.]+\s*~\s*[\d.]+%\)/);
        if (m) return { min: +m[1], max: +m[2], raw: m[0] };
        return null;
      });

      // Our calculation (all Hardy nature = x1.0 on all stats)
      const a = new Pokemon(tc.our.a);
      const d = new Pokemon(tc.our.d);
      const m = new Move(tc.our.move, { isCrit: tc.our.crit ?? false });
      const r = calculate(a, d, m, new Field({ gameType: 'Singles' }));
      const [ourMin, ourMax] = r.range();

      if (pokesolResult) {
        const minD = ourMin - pokesolResult.min, maxD = ourMax - pokesolResult.max;
        const exact = minD === 0 && maxD === 0;
        const close = Math.abs(minD) <= 1 && Math.abs(maxD) <= 1;
        console.log(`  ポケソル: ${pokesolResult.raw}`);
        console.log(`  当ツール: ${ourMin} ~ ${ourMax}`);
        console.log(`  ${exact ? '✅ 完全一致' : close ? '⚠️ ±1差' : `❌ 不一致 (min差=${minD}, max差=${maxD})`}`);
        results.push({ id: tc.id, label: tc.label, pokesol: `${pokesolResult.min}~${pokesolResult.max}`, ours: `${ourMin}~${ourMax}`, minD, maxD, status: exact ? '✅一致' : close ? '⚠️±1' : '❌不一致' });
      } else {
        console.log(`  ⚠️ 読取失敗 (当ツール: ${ourMin}~${ourMax})`);
        results.push({ id: tc.id, label: tc.label, pokesol: '読取失敗', ours: `${ourMin}~${ourMax}`, status: '⚠️読取失敗' });
      }

    } catch (err) {
      console.log(`  ❌ Error: ${err.message.split('\n')[0]}`);
      await page.screenshot({ path: `scripts/pokesol-${tc.id}-error.png` }).catch(() => {});
      results.push({ id: tc.id, label: tc.label, status: '❌Error' });
    }

    await page.close();
  }

  await browser.close();

  console.log('\n\n=== 比較結果サマリ ===\n');
  console.log('| # | テスト | ポケソル | 当ツール | min差 | max差 | 結果 |');
  console.log('|---|--------|---------|---------|-------|-------|------|');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.label} | ${r.pokesol || '-'} | ${r.ours || '-'} | ${r.minD ?? '-'} | ${r.maxD ?? '-'} | ${r.status} |`);
  }
}

main().catch(console.error);
