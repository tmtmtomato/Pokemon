# Champions バトルトラッカー 実装仕様書

> 作成日: 2026-03-30
> 対象: バトルトラッカーモジュール (`tracker/`)

---

## 1. 目的

バトル中に観測したダメージ%を記録し、逆算によって**相手ポケモンの型(性格・SP配分・持ち物・特性)**を推定するツール。既存のダメージ計算エンジン (`src/`) を再利用し、全数探索で候補を列挙する。

---

## 2. アーキテクチャ概要

### 2.1 ビルド構成

```
index.html           → app/main.tsx    (ダメージ計算機)
index-tracker.html   → tracker/main.tsx (バトルトラッカー)  ← 本仕様の対象
```

- **Vite マルチエントリ**: `VITE_ENTRY` 環境変数で `calc` / `tracker` を切替
- **viteSingleFile**: JS/CSS を HTML に埋め込み、サーバー不要で動作
- **共有レイヤ**: `src/` (計算エンジン), `app/lib/` (i18n, constants, sprites), `app/components/` (SearchSelect, ItemSelector, PokemonSprite)
- **TypeScript**: `tsconfig.app.json` に `tracker/**/*` を include

### 2.3 ビルド→開くワークフロー

**開発サーバーは使用しない。** コード変更後は必ずビルドし、成果物を直接開く。

```bash
# ビルド
npm run build:tracker        # → build/tracker.html
npm run build:calc           # → build/calc.html
npm run build:ui             # → 両方

# 確認: build/*.html をブラウザで直接開く (サーバー不要)
```

全てのコード変更は「変更→テスト→ビルド→ブラウザ確認」のサイクルで進行する。

### 2.2 ディレクトリ構成

```
tracker/
├── main.tsx                     # ReactDOM エントリ
├── TrackerApp.tsx               # ルート (setup → battle → review フェーズ)
├── hooks/
│   ├── useTracker.ts            # useReducer (状態管理 + localStorage 永続化)
│   └── useInference.ts          # 推論フック (useMemo でターン/チーム変更時に再計算)
├── engine/
│   ├── inference.ts             # コア推論 (Mode A: 被弾推論, Mode B: 与ダメ推論)
│   ├── inference-types.ts       # 型定義 + アイテム定数 + 許容誤差関数
│   ├── candidate-filter.ts      # ターン横断絞り込み + SP密度ヒストグラム + Tier分類
│   ├── sp-priors.ts             # ベイズ事前分布 (種族値ベースのSP配分傾向)
│   └── showdown-format.ts       # Showdown/PokePaste形式 import/export (SP↔EV変換)
├── components/
│   ├── TeamSetup.tsx            # チーム設定画面
│   ├── TeamLibrary.tsx          # チーム保存/読込/プリセット/import/export
│   ├── MySlotCard.tsx           # 自分のポケモン1体 (フル構成入力)
│   ├── OpponentSlotCard.tsx     # 相手のポケモン1体 (種族+判明情報入力)
│   ├── BattleLog.tsx            # ターンログ一覧
│   ├── TurnEntry.tsx            # ターン入力フォーム
│   ├── TurnCard.tsx             # 記録済みターン表示 (展開可能)
│   ├── DamageInput.tsx          # ダメージ% 入力 (±ボタン付き)
│   ├── FieldConditionBar.tsx    # フィールド条件トグル
│   ├── InferencePanel.tsx       # 推定結果パネル
│   ├── OpponentCard.tsx         # 相手1体の推定サマリ (SP密度バー付き)
│   └── StatRangeBar.tsx         # SP密度ヒートバー (8ビン)
└── presets/
    ├── index.ts                 # プリセットチームローダー
    ├── standard.txt             # サンプルチーム (5種)
    ├── sand.txt, sun.txt, dragon.txt, mega-kangaskhan.txt
    └── raw.d.ts                 # ?raw import 宣言
```

---

## 3. 状態管理 (useTracker)

### 3.1 TrackerState

```typescript
interface TrackerState {
  phase: 'setup' | 'battle' | 'review';
  myTeam: MyPokemonSlot[];       // 1-6体 (フル構成)
  opponentTeam: OpponentPokemonSlot[];  // 1-6体 (種族+判明情報)
  turns: TurnEntry[];            // 記録済みターン
  currentField: FieldSnapshot;   // 現在のフィールド条件
}
```

### 3.2 主要アクション

| アクション | 説明 | 備考 |
|-----------|------|------|
| `SET_MY_SPECIES` | 種族変更 (特性自動設定、他リセット) | bounds check |
| `SET_MY_SP` | SP値変更 (0-32 clamp) | bounds check |
| `SET_MY_MOVE` | 技変更 (4枠) | 配列自動拡張 |
| `LOAD_MY_TEAM` | チーム一括読込 | import/preset用 |
| `SET_OPPONENT_SPECIES` | 相手種族変更 (判明情報リセット) | bounds check |
| `REVEAL_ABILITY/ITEM/TERA` | 判明情報記録 | bounds check |
| `ADD_TURN` | ターン追加 (ID/番号自動付与、技自動記録) | |
| `DELETE_TURN` | ターン削除 (リナンバー + knownMoves再構築) | |
| `SET_FIELD` | フィールド条件変更 | shallow merge |
| `RESET` | 全状態リセット (新規オブジェクト生成) | |

### 3.3 永続化

- **localStorage** キー: `champions-tracker`
- **スキーマ移行**: `migrateMySlot()` / `migrateOpponentSlot()` で欠損フィールドを補完
- **turnCounter** 復元: 保存済みターン数から復元

---

## 4. 推論エンジン (inference.ts)

### 4.1 Mode A: 相手が攻撃 → 攻撃ステータス推定

**既知**: 自分のポケモン (全ビルド)、技、フィールド
**未知**: 相手の性格、攻撃SP、持ち物、特性

**探索空間**: 性格(25) × 攻撃SP(0-32) × 持ち物(~8) × 特性(1-3) ≈ 20,000通り

```
for 性格 in ALL_NATURES:
  for sp in 0..32:
    for item in getAttackerItems(moveType):
      for ability in abilities:
        result = calculate(candidate, myPokemon, move, field)
        if any roll matches observed%:
          → 候補に追加
```

**攻撃側アイテム候補**:
- '' (なし/非ダメージ系), Choice Band, Choice Specs, Life Orb, Expert Belt, Muscle Band, Wise Glasses
- + 技タイプに合致するタイプ強化アイテム (18種)

### 4.2 Mode B: 自分が攻撃 → 防御ステータス推定

**既知**: 自分のポケモン (全ビルド)、技、フィールド
**未知**: 相手のHP SP、防御SP、性格、持ち物、特性

**探索空間**: 性格(25) × HP_SP(0-32) × 防御SP(0-32) × 持ち物(~4) × 特性(1-3) ≈ 800,000通り

- `hpSP + defSP > 66` の枝刈り
- 抵抗きのみは弱点技の場合のみ列挙
- Eviolite は NFE ポケモンのみ列挙
- 超効果判定は dummy calculate() で実際に算出 (M-3)

**防御側アイテム候補**:
- '' (なし), Assault Vest, Eviolite (NFEのみ), 対応する抵抗きのみ (弱点時のみ)

### 4.3 ダメージ一致判定

```typescript
function matchesPercent(rollDmg, defenderMaxHP, observedPercent): boolean {
  const rollPercent = (rollDmg / defenderMaxHP) * 100;
  return Math.abs(rollPercent - observedPercent) <= getDamageTolerance(defenderMaxHP);
}
```

- **基本許容誤差**: ±1.0%
- **HP依存補正**: `Math.max(1.0, (100/maxHP) * 1.5)` — 低HPポケモンは1ダメージの%が大きい

### 4.4 推論結果

```typescript
interface TurnInference {
  turnId: string;
  opponentSlot: number;
  mode: 'A' | 'B';
  candidates: Candidate[];      // マッチした候補ビルド群
  inferredStats: StatID[];       // 推論対象ステータス ['atk'] or ['hp','def']
}

interface Candidate {
  nature: NatureName;
  sp: Partial<StatsTable>;
  item: string;
  ability: string;
  matchedRolls: number[];        // マッチしたロール番号 (0-15)
}
```

---

## 5. ターン横断絞り込み (candidate-filter.ts)

### 5.1 aggregateSlotInference()

1. **性格・持ち物・特性の集合交差**: 各ターンの候補から抽出し、ターン間で intersection
2. **SP範囲の収束**: 各ターンの推論対象ステータスの候補SP値の min/max を交差
3. **SP予算制約**: 6ステータスの最小値合計 > 66 → 矛盾 (空集合を返す)
4. **残余予算制限**: 各ステータスの上限 = min + 残余予算
5. **一貫候補の抽出**: getConsistentCandidates() でクロスターンマッチング
6. **事前確率による重み付け**: SP配分の役割ベース重み × マッチロール数でスコアリング
7. **SP密度ヒストグラム**: 8ビン (0-3, 4-7, ..., 28-32) に加重分布
8. **Tier分類**: heavy/moderate/light/none/unknown

### 5.2 クロスターン候補マッチング

**同モード** (Mode A + Mode A, または Mode B + Mode B):
- `candidateKeyFull` = `nature|item|ability|sp_values` — SP値まで一致を要求

**クロスモード** (Mode A + Mode B):
- `candidateKeyBase` = `nature|item|ability` — SP値は比較不能 (異なるステータスを推論)

### 5.3 SP密度の重み付け (sp-priors.ts)

種族値に基づく統計的な SP 配分傾向をベイジアン事前確率として適用:

| 役割 | 条件 | SP傾向 |
|------|------|--------|
| primary | 主力攻撃/HP | SP 28-32 に高重み (4.0x) |
| secondary | 2番目の重点ステータス | SP 24-32 に高重み (3.5x) |
| flex | どちらの方向もありうる | 0-4 (1.5x) + 24+ (2.0x) の二峰分布 |
| leftover | 余りポイント | SP 0-4 に高重み (2.0x) |
| dump | 不要ステータス | SP 0 に高重み (3.0x) |

分類ロジック:
- **壁 (isWall)**: bulkScore > offenseScore + 20 → HP=primary, 高い方の防御=secondary
- **攻撃型 (isOffensive)**: offenseScore > bulkScore - 10 → 攻撃=primary, 素早さor HP=secondary
- **バランス型**: HP=primary, 攻撃=flex, 両防御=flex

---

## 6. Showdown 形式 (showdown-format.ts)

### 6.1 SP ↔ EV 変換

```
SP → EV: sp === 32 ? 252 : sp * 8
EV → SP: ev >= 252 ? 32 : Math.floor(ev / 8)
```

### 6.2 エクスポート

```
Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
Tera Type: Ground
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Swords Dance
- Protect
```

### 6.3 インポート

- `Nickname (Species) @ Item` パターン対応
- 性別 `(M)` / `(F)` の除去
- `Trait:` / `Ability:` 両方対応
- メガ特性の受入 (`speciesData.mega?.ability`)
- Level, IVs, Shiny 等は無視 (Champions には不要)

---

## 7. UIコンポーネント

### 7.1 フェーズ遷移

```
setup → battle → review
  ↕       ↕       ↕
(タブ切替で自由に遷移可能)
```

### 7.2 TeamSetup (setup フェーズ)

- **自分のチーム** (1-6体): 種族、性格、特性、持ち物、技4枠、テラスタル、SP配分 (合計66バリデーション)
- **相手のチーム** (1-6体): 種族のみ必須、特性/持ち物/テラスタル/ニックネームは任意
- **TeamLibrary**: 保存/読込/プリセット/Showdown形式 import/export
- **開始条件**: 両チーム最低1体ずつ種族設定済み

### 7.3 BattleLog (battle フェーズ)

**TurnEntry (入力フォーム)**:
- 攻撃方向トグル: 相手→自分 / 自分→相手
- 攻撃側/防御側ポケモン選択
- 技選択 (SearchSelect、タイプ/分類/威力プレビュー付き)
- 急所/全体技トグル
- ダメージ% 入力 (±1ボタン、数値直入力)
- フィールド条件 (折りたたみ): 天候、テライン、壁、味方支援、破滅系、オーラ系
- ランク補正 (折りたたみ): 攻撃側/防御側 各5ステータス ±6

**TurnCard (記録済みターン)**:
- コンパクト表示: ターン番号、スプライト、攻撃→防御、技バッジ、ダメージ%
- 展開時: フィールド効果バッジ群、ランク補正表示
- 削除ボタン (knownMoves 再構築)

### 7.4 InferencePanel (battle/review フェーズ)

**OpponentCard (相手1体あたり)**:
- 判明情報バッジ (特性、持ち物、テラスタル)
- 絞り込み進捗バー (≤3: ほぼ特定, ≤10: かなり絞込, ≤30: ある程度, ≤100: 絞込中, >100: 不足)
- 最有力候補表示 (性格、持ち物、特性、SP値)
- 推定性格リスト (≤8なら全列挙、>8なら件数表示)
- 推定持ち物/特性リスト (未判明時のみ表示)
- SP密度ヒートバー: 6ステータス × 8ビン、Tier分類 (heavy/moderate/light/none/unknown)、SP範囲表示

---

## 8. フィールド条件

### 8.1 FieldSnapshot 構造

```typescript
interface FieldSnapshot {
  gameType: 'Singles' | 'Doubles';
  weather: Weather | '';
  terrain: Terrain | '';
  // グローバル
  isGravity, isFairyAura, isDarkAura, isAuraBreak: boolean;
  isBeadsOfRuin, isTabletsOfRuin, isSwordOfRuin, isVesselOfRuin: boolean;
  // 攻撃側サイド
  attackerSide: {
    isReflect, isLightScreen, isAuroraVeil: boolean;
    isHelpingHand, isBattery, isPowerSpot: boolean;
    isSteelySpirit, isFlowerGift, isFriendGuard: boolean;
  };
  // 防御側サイド
  defenderSide: {
    isReflect, isLightScreen, isAuroraVeil, isFriendGuard: boolean;
  };
}
```

### 8.2 フィールドの視点

FieldSnapshot の `attackerSide` / `defenderSide` は**記録時の攻撃者/防御者視点**で設定される。推論エンジンへの受け渡し時にスワップは不要。

---

## 9. i18n (国際化)

- **LangContext**: `ja` / `en` 切替
- 全UIテキスト: 三項演算子 `lang === 'ja' ? '日本語' : 'English'`
- ポケモン名/技名/特性名/持ち物名/タイプ名/性格名: `t(key, MAP, lang)` ヘルパー
- `app/lib/ja.ts` の翻訳テーブルを共有

---

## 10. テスト

### 10.1 tracker-inference.test.ts (4テスト)

1. **Mode A — 既知ビルドの検出**: Adamant CB Garchomp → EQ → Cresselia で順方向計算、逆算で元ビルドが候補に含まれること
2. **Mode A — 特殊技**: Modest Choice Specs Flutter Mane → Moonblast → Incineroar
3. **Mode A — 判明特性による絞り込み**: knownAbility 設定時に候補が減少すること
4. **Mode B — 防御ビルド検出**: Garchomp → Crunch → Cresselia で防御側ビルドが候補に含まれること
5. **Cross-turn aggregation**: 2ターンの横断で性格・持ち物セットが収束すること

### 10.2 検証方針

- **ラウンドトリップ**: 既知の型で `calculate()` → `inferTurn()` → 元の型が候補に存在
- **絞り込み**: ターン追加で候補数が単調減少 (または維持)
- **SP予算**: 合計66超の候補が除外されること

---

## 11. 既知の制限事項

| 制限 | 影響 | 対応方針 |
|------|------|---------|
| 同期実行 (Web Worker なし) | Mode B は ~800K 通りで遅延の可能性 | TODO コメントあり、要パフォーマンス計測 |
| ステータス異常の推論未対応 | やけど時の攻撃半減を考慮しない | TurnEntry に status フィールドはあるが UI から入力不可 |
| テラスタル時の防御推論 | 相手の Tera Type 未知時は防御側タイプ相性が不確定 | knownTeraType 設定時のみ正確 |
| Parental Bond の逆算 | 2回攻撃の合算ダメージ% 入力方法が不明確 | ユーザーが合算%を入力する前提 |
| 探索アイテムの網羅性 | Leftovers, Sitrus Berry 等の非ダメージ系は '' (なし) として扱う | ダメージ計算に影響しないアイテムは区別不要 |
| NFE判定の精度 | species.json の isNFE フラグ依存 | データ不備があれば Eviolite 候補漏れ |
