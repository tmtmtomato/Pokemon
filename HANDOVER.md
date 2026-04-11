# UI開発 引き継ぎ書

> 作成日: 2026-03-30
> 対象: 次フェーズの UI/UX 実装担当（Claude含む）

---

## 1. 現状サマリ

| 項目 | 状態 |
|------|------|
| 計算エンジン | **完成** — 全修正値・全特性・テラスタル対応済 |
| テスト | **291 passing** (16ファイル) |
| 外部検証 | Smogon Calc 26/26一致、ポケソル 5/5一致 |
| UI | **未着手** — HTML/CSS/JS 一切なし |
| ビルド | `tsc` → `dist/` (ESM, declaration付) |
| バンドラー | **未設定** (Vite等の導入が必要) |

---

## 2. 公開API

### 2.1 メインエントリ: `calculate()`

```typescript
import { calculate, Pokemon, Move, Field } from './src/index.js';

const result = calculate(
  new Pokemon({ name: 'Garchomp', sp: { atk: 32, spe: 32, hp: 2 }, nature: 'Jolly' }),
  new Pokemon({ name: 'Metagross', sp: { hp: 32, def: 32, spd: 2 }, nature: 'Impish' }),
  new Move('Earthquake'),
  new Field({ gameType: 'Doubles' }),
);

result.range();        // [116, 138]  (ダメージ実数値)
result.percentRange(); // [67.1, 79.8] (HP%表示)
result.koChance();     // { chance: 0, n: 2, text: 'guaranteed 2HKO' }
result.desc();         // "Garchomp Earthquake vs Metagross: 116-138 (67.1-79.8%) -- guaranteed 2HKO"
result.rolls;          // number[16] — 全16乱数ロール
```

**特徴**: `calculate()` は全入力を clone するため、呼び出し元のオブジェクトは変更されない。

### 2.2 Pokemon クラス

```typescript
new Pokemon({
  name: string,              // 必須: 種族名 (species.json のキー)
  sp?: { atk?: number, ... },  // SP配分 (0-32/stat, 合計66)
  nature?: NatureName,       // 性格 (デフォルト: 'Hardy')
  ability?: string,          // 特性 (デフォルト: 種族の第1特性)
  item?: string,             // 持ち物 (デフォルト: なし)
  moves?: string[],          // 技リスト (表示用)
  status?: StatusName,       // 状態異常: 'brn'|'par'|'psn'|'tox'|'slp'|'frz'
  curHP?: number,            // 現在HP% (0-100, デフォルト: 100)
  boosts?: { atk?: number, ... },  // 能力ランク (-6〜+6)
  isMega?: boolean,          // メガシンカ状態
  teraType?: TypeName | 'Stellar',  // テラスタルタイプ
  isTera?: boolean,          // テラスタル中か
  isStellarFirstUse?: boolean,      // ステラ初回使用フラグ
})
```

**主要プロパティ/メソッド**:
- `pokemon.rawStats` — 計算済み実数値 (StatsTable)
- `pokemon.maxHP()` — 最大HP
- `pokemon.stat(statId)` — ブースト適用後のステータス
- `pokemon.effectiveAbility()` — 有効特性 (メガ考慮)
- `pokemon.types` — 元タイプ配列
- `pokemon.effectiveTypes()` — テラスタル考慮後のタイプ
- `pokemon.species` — SpeciesData (種族値、メガデータ等)

### 2.3 Move クラス

```typescript
new Move(name: string, options?: { isCrit?: boolean, hits?: number })
```

- `move.isPhysical()` / `move.isSpecial()` / `move.makesContact()`
- `move.isSpread` — 範囲技フラグ (UIでトグルする必要あり)

### 2.4 Field クラス

```typescript
new Field({
  gameType?: 'Singles' | 'Doubles',  // デフォルト: 'Doubles'
  weather?: Weather,
  terrain?: Terrain,
  // フィールド全体
  isGravity?: boolean,
  isFairyAura?: boolean,
  isDarkAura?: boolean,
  isAuraBreak?: boolean,
  isBeadsOfRuin?: boolean,
  isTabletsOfRuin?: boolean,
  isSwordOfRuin?: boolean,
  isVesselOfRuin?: boolean,
  // 攻撃側サイド
  attackerSide?: {
    isReflect?, isLightScreen?, isAuroraVeil?,
    isHelpingHand?, isTailwind?,
    isFriendGuard?, isBattery?, isPowerSpot?,
    isFlowerGift?, isSteelySpirit?,
  },
  // 防御側サイド
  defenderSide?: { /* 同上 */ },
})
```

### 2.5 データ取得 (ドロップダウン/検索用)

```typescript
import { getAllSpeciesNames, getAllMoveNames, getAllItemNames, getAllAbilityNames,
         getSpecies, getMove, getItem } from './src/data/index.js';

getAllSpeciesNames();  // string[208] — 全ポケモン名
getAllMoveNames();     // string[39]  — 全技名
getAllItemNames();     // string[39]  — 全アイテム名
getAllAbilityNames();  // string[84]  — 全特性名

const species = getSpecies('Garchomp');
species.baseStats;    // { hp:108, atk:130, def:95, spa:80, spd:85, spe:102 }
species.types;        // ['Dragon', 'Ground']
species.abilities;    // ['Rough Skin', 'Sand Veil']
species.mega;         // { stone:'Garchompite', types:[...], baseStats:{...}, ability:'Sand Force' }
```

### 2.6 ユーティリティ

```typescript
import { validateSP, calcHP, calcStat, getNatureModifier } from './src/index.js';
import { getEffectiveness, getEffectivenessLabel } from './src/index.js';

validateSP({ atk: 32, spe: 32, hp: 2 });  // { valid: true, total: 66 }
validateSP({ atk: 32, spe: 32, hp: 3 });  // { valid: false, total: 67 }

getEffectiveness('Ice', ['Dragon', 'Ground']);  // 4
getEffectivenessLabel(4);  // "Extremely effective"
getEffectivenessLabel(0.25);  // "Mostly ineffective"
```

---

## 3. データ構造

### 3.1 ファイル一覧

| ファイル | 件数 | 内容 |
|---------|------|------|
| `src/data/species.json` | 208 | 全ポケモン (種族値、タイプ、特性、メガ、isNFE) |
| `src/data/moves.json` | 39 | 技 (タイプ、威力、分類、フラグ) |
| `src/data/items.json` | 39 | アイテム (statBoost、conditionalDamage、resistBerry、megaStone) |
| `src/data/abilities.json` | 84 | 特性 (name、effect) |
| `src/data/typechart.json` | 18x18 | タイプ相性 (sparse format, 1.0は省略) |

### 3.2 メガシンカの判定

```typescript
const species = getSpecies('Kangaskhan');
if (species.mega) {
  // メガストーン名: species.mega.stone → 'Kangaskhanite'
  // メガ後の種族値: species.mega.baseStats
  // メガ後の特性: species.mega.ability → 'Parental Bond'
  // メガ後のタイプ: species.mega.types
}
// UI: pokemon.item がメガストーン名と一致したらメガシンカボタンを表示
```

### 3.3 SP バリデーション

- 各ステータス: 0〜32
- 合計: 66以下
- `validateSP()` で検証可能
- 定番配分: 32/32/2 (ASベース), 32/0/32/0/0/2 (HBベース) etc.

---

## 4. UIで必要な入力フィールド

### 4.1 ポケモン設定 (攻撃側/防御側 各1セット)

| フィールド | 型 | UI候補 | 備考 |
|-----------|-----|--------|------|
| 種族 | string | 検索付きドロップダウン | 208体、選択時に種族値等を自動反映 |
| SP配分 | 0-32 x6 | スライダー or 数値入力 | 合計66制限、リアルタイムバリデーション |
| 性格 | NatureName | ドロップダウン (25種) | 上昇/下降ステータスをハイライト |
| 特性 | string | ドロップダウン | 選択した種族の abilities[] からフィルタ |
| 持ち物 | string | 検索付きドロップダウン | メガストーン選択時はメガトグル表示 |
| テラスタル | TypeName+Stellar | ドロップダウン (19種) | 有効時 isTera=true |
| 状態異常 | StatusName | ボタングループ | なし/やけど/まひ/毒/もうどく |
| 現在HP | 0-100 | スライダー or % 入力 | |
| 能力ランク | -6〜+6 x5 | +-ボタン | atk/def/spa/spd/spe |

### 4.2 技設定

| フィールド | 型 | UI候補 | 備考 |
|-----------|-----|--------|------|
| 技名 | string | 検索付きドロップダウン | 39技 |
| 急所 | boolean | トグル | |
| 範囲技 | boolean | トグル | isSpread (ダブル時のみ表示) |

### 4.3 フィールド設定

| フィールド | 型 | UI候補 | 備考 |
|-----------|-----|--------|------|
| ゲームモード | GameType | シングル/ダブル切替 | デフォルト: ダブル |
| 天候 | Weather | ドロップダウン | なし/晴/雨/砂/雪 |
| テライン | Terrain | ドロップダウン | なし/エレキ/グラス/サイコ/ミスト |
| 壁 (各サイド) | boolean x3 | トグル | リフレクター/ひかりのかべ/オーロラベール |
| てだすけ | boolean | トグル | 攻撃側サイドのみ |
| フレンドガード | boolean | トグル | 防御側サイドのみ |
| その他味方特性 | boolean x4 | トグル | Battery/PowerSpot/SteelySpirit/FlowerGift |
| 破滅系特性 | boolean x4 | トグル | Tablets/Vessel/Sword/Beads of Ruin |
| オーラ系 | boolean x3 | トグル | FairyAura/DarkAura/AuraBreak |

---

## 5. 結果の表示

### 5.1 Result オブジェクトから得られる情報

```typescript
const r = calculate(atk, def, move, field);

// 基本表示
r.desc()             // "Garchomp Earthquake vs Metagross: 116-138 (67.1-79.8%) -- guaranteed 2HKO"
r.range()            // [116, 138]
r.percentRange()     // [67.1, 79.8]

// KO確率
r.koChance()         // { chance: 1.0, n: 2, text: 'guaranteed 2HKO' }
r.koChance(100)      // カスタムHP指定でのKO判定

// 詳細
r.rolls              // [116, 117, 118, ..., 138]  (16個)
r.moveType           // 'Ground' (特性でタイプ変更後)
r.typeEffectiveness  // 1 (等倍)
r.isCrit             // false
```

### 5.2 表示フォーマット推奨

```
ガブリアス の じしん vs メタグロス
116 - 138 ダメージ (67.1% - 79.8%)
確定2発

[============================      ]  ← HPバー

乱数ロール: 116, 117, 118, 120, 121, 122, 123, 124, 126, 127, 128, 130, 131, 132, 133, 138
```

---

## 6. 技術スタックの推奨

### 6.1 確定事項

- TypeScript (ES2022, ESM)
- 計算エンジン: `src/` 配下は変更不要
- テスト: Vitest (`npm test`)

### 6.2 未決定 (UI実装時に選択)

| 項目 | 候補 | 備考 |
|------|------|------|
| バンドラー | **Vite** (推奨) | tsconfig の moduleResolution: 'bundler' と相性良 |
| UIフレームワーク | React / Preact / Vanilla | SPEC.mdではモバイルファースト指定 |
| CSS | Tailwind / CSS Modules | |
| ホスティング | Vercel / Cloudflare Pages | 静的サイトで十分 |

### 6.3 Vite導入の最小手順

```bash
npm install -D vite @vitejs/plugin-react   # or vanilla
# vite.config.ts を作成
# index.html をルートに作成
# npm run dev で開発サーバー起動
```

---

## 7. SPEC.md から抜粋: UI要件

### 7.1 MVP 機能 (Section 5.1)
- ポケモン選択 (208体)
- SP配分入力 (0-32/stat, 合計66)
- 性格選択 (25種)
- 技選択 (4枠)
- 持ち物・特性選択
- フィールド条件
- メガシンカトグル
- ダメージ範囲表示 (実数値 + HP%)
- KO確率表示
- 全16乱数ロール表示

### 7.2 差別化機能 (Section 5.2)
- **1 vs Team / Team vs 1 / Team vs Team** マルチ計算
- **SP最適化ツール** (確定1発に必要な最小SP算出)
- **素早さ比較統合**
- **チームインポート** (Showdown形式)
- **ワンタップ積み技反映** (つるぎのまい → Atk+2 自動)
- **残留ダメージ込みKO計算** (SR/天候/やどりぎ等)

### 7.3 デザイン方針 (Section 6)
- **モバイルファースト** (スマホで対戦中に片手操作)
- **ダブルバトルがデフォルト**
- VGC競技勢ターゲット

---

## 8. 既知の制限事項

| 制限 | 影響 | 対応方針 |
|------|------|---------|
| 技データ39件のみ | 主要技は網羅、マイナー技は未収録 | moves.json に追記で拡張可能 |
| ポケモン208体 | SV S40 使用率Top + Champions全メガ | species.json に追記で拡張可能 |
| Analytic (アナライズ) | エンジンは常時1.3倍適用 | UIで「後攻」トグル時のみ特性を設定 |
| Hydro Steam 未収録 | 晴れ時の特殊水技 | moves.json追記 + bpModifier追加で対応 |
| GlaiveRush 未収録 | 被ダメ2倍状態 | Field に isGlaiveRush フラグ追加で対応 |
| KO計算が簡易版 | 残留ダメージ未考慮 | result.ts の koChance() を拡張 |

---

## 9. ファイル構成 (現在)

```
c:\Pokemon\
├── package.json
├── tsconfig.json
├── SPEC.md                    # 896行の包括的仕様書
├── AUDIT-REPORT.md            # Phase 1 監査レポート
├── CROSS-VALIDATION-REPORT.md # Phase 4 外部検証レポート
├── HANDOVER.md                # ← この文書
├── src/
│   ├── index.ts               # 公開API exports
│   ├── calculate.ts           # calculate() メイン関数
│   ├── pokemon.ts             # Pokemon クラス
│   ├── move.ts                # Move クラス
│   ├── field.ts               # Field + Side クラス
│   ├── result.ts              # Result クラス (ダメージ/KO/desc)
│   ├── types.ts               # 全型定義
│   ├── mechanics/
│   │   ├── damage.ts          # コアダメージ計算エンジン
│   │   ├── stats.ts           # ステータス計算 (SP system)
│   │   ├── util.ts            # 4096-base 固定小数点演算
│   │   ├── type-effectiveness.ts  # タイプ相性
│   │   ├── abilities.ts       # 特性によるダメージ修正
│   │   ├── items.ts           # アイテムによるダメージ修正
│   │   └── moves.ts           # 特殊技の処理
│   └── data/
│       ├── species.json       # 208 ポケモン
│       ├── moves.json         # 39 技
│       ├── items.json         # 39 アイテム
│       ├── abilities.json     # 84 特性
│       ├── typechart.json     # 18x18 タイプ相性表
│       └── index.ts           # データローダー
├── tests/                     # 16ファイル, 291テスト
└── scripts/
    └── pokesol-compare.mjs    # ポケソル比較スクリプト
```

---

## 10. ビルドと確認方法

**開発サーバーは使用しない。** 常にビルド済みファイルをブラウザで直接開く。

```bash
cd c:\Pokemon

# ビルド (viteSingleFile で JS/CSS が HTML に埋め込まれる)
npm run build:calc           # → build/calc.html (ダメージ計算機)
npm run build:tracker        # → build/tracker.html (バトルトラッカー)
npm run build:ui             # 両方ビルド

# 確認: build/*.html をブラウザで直接開く (サーバー不要)

# テスト実行
npm test

# TypeScript コンパイル (型チェックのみ)
npm run build
```

コード変更時は必ず「変更→テスト→ビルド→ブラウザ確認」のサイクルで進行する。
