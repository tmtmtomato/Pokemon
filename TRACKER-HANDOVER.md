# バトルトラッカー 引き継ぎ書

> 作成日: 2026-03-30
> 対象: 今後の保守・拡張担当

---

## 1. 現状サマリ

| 項目 | 状態 |
|------|------|
| 推論エンジン | **完成** — Mode A/B + ターン横断絞り込み + SP事前分布 |
| UI | **完成** — setup/battle/review 3フェーズ |
| テスト | **322 passing** (18ファイル、うちトラッカー固有 1ファイル 5テスト) |
| TypeScript | tracker/ 配下の型エラー **0件** |
| 前回監査 | 31項目 (C×3, H×4, M×12, L×12) — **全件対応済み** |
| ビルド | `npm run dev:tracker` / `npm run build:tracker` |
| i18n | 日本語/英語 完全対応 |

---

## 2. ビルドと確認方法

**開発サーバーは使用しない。** 常にビルド済みファイルをブラウザで直接開く。

```bash
# ビルド
npm run build:tracker        # → build/tracker.html
npm run build:calc           # → build/calc.html
npm run build:ui             # 両方ビルド

# 確認: build/tracker.html をブラウザで直接開く (サーバー不要)
# viteSingleFile により JS/CSS が HTML に埋め込まれる

# テスト
npm test                     # 全テスト (322)
npx vitest run tests/tracker-inference.test.ts  # トラッカー推論のみ
```

コード変更時は必ず「変更→テスト→ビルド→ブラウザ確認」のサイクルで進行する。

---

## 3. データフロー

```
[ユーザー入力]
    ↓
useTracker (useReducer + localStorage)
    ↓ state
useInference (useMemo)
    ↓ turns ごとに
inferTurn() → TurnInference (Mode A or B)
    ↓ スロットごとにグループ化
aggregateSlotInference() → SlotInference
    ↓
InferencePanel → OpponentCard → StatRangeBar
```

### 3.1 推論の流れ

1. ユーザーが TurnEntry でターンを記録
2. `useInference` が `state.turns` の変更を検知 (`useMemo`)
3. 各ターンで `inferTurn()` を実行 → `TurnInference` (候補ビルド群)
4. 同一相手スロットの TurnInference をグループ化
5. `aggregateSlotInference()` でクロスターン集約 → `SlotInference`
6. `InferencePanel` → `OpponentCard` → `StatRangeBar` で可視化

---

## 4. 主要 API

### 4.1 推論

```typescript
import { inferTurn } from './tracker/engine/inference';
import { aggregateSlotInference } from './tracker/engine/candidate-filter';

// 1ターンの推論
const inf = inferTurn(turn, myTeam, opponentTeam);
// inf.mode: 'A' | 'B'
// inf.candidates: Candidate[]
// inf.inferredStats: ['atk'] | ['hp', 'def'] | ['hp', 'spd']

// 複数ターンの集約
const slot = aggregateSlotInference([inf1, inf2], baseStats, slotNumber);
// slot.natures: Set<NatureName>
// slot.items: Set<string>
// slot.spDensity: Record<StatID, number[]>
// slot.spTier: Record<StatID, SPTier>
// slot.topCandidates: Candidate[]
```

### 4.2 Showdown 形式

```typescript
import { exportTeam, importTeam, spToEv, evToSp } from './tracker/engine/showdown-format';

const text = exportTeam(myTeam);   // → Showdown 形式文字列
const team = importTeam(text);     // → MyPokemonSlot[]
```

### 4.3 SP事前分布

```typescript
import { classifyStatRoles, spPriorWeight, candidatePriorWeight } from './tracker/engine/sp-priors';

const roles = classifyStatRoles(baseStats);
// roles.atk: 'primary' | 'secondary' | 'flex' | 'leftover' | 'dump'

const weight = spPriorWeight('primary', 32);  // → 4.0
```

---

## 5. 状態管理 (useTracker)

### 5.1 型定義

```typescript
// 自分のポケモン (フル構成)
interface MyPokemonSlot {
  species: string;
  sp: Record<StatID, number>;     // 0-32 per stat, total ≤ 66
  nature: NatureName;
  ability: string;
  item: string;
  moves: string[];                // 0-4技
  teraType: TypeName | 'Stellar' | '';
  isMega: boolean;
}

// 相手のポケモン (種族 + 判明情報)
interface OpponentPokemonSlot {
  species: string;
  knownAbility: string;           // 判明した特性
  knownItem: string;              // 判明した持ち物
  knownTeraType: TypeName | 'Stellar' | '';
  knownMoves: string[];           // 自動記録 (ターン追加時)
  nickname: string;
}

// ターン記録
interface TurnEntry {
  id: string;                     // 一意ID (turn-{timestamp}-{counter})
  turnNumber: number;             // 連番 (削除時リナンバー)
  attackerSide: 'mine' | 'opponent';
  attackerSlot: number;
  defenderSlot: number;
  moveName: string;
  isCrit: boolean;
  isSpread: boolean;
  observedDamagePercent: number;  // ユーザー入力値
  field: FieldSnapshot;
  attackerBoosts: Partial<Record<StatID, number>>;
  defenderBoosts: Partial<Record<StatID, number>>;
  attackerStatus: StatusName | '';
  defenderStatus: StatusName | '';
}
```

### 5.2 アクション一覧

| カテゴリ | アクション | 特記事項 |
|---------|-----------|---------|
| フェーズ | `SET_PHASE` | |
| 自分チーム | `SET_MY_SPECIES`, `SET_MY_POKEMON`, `SET_MY_SP`, `SET_MY_MOVE` | bounds check |
| | `ADD_MY_SLOT`, `REMOVE_MY_SLOT` | 1-6体制限 |
| | `LOAD_MY_TEAM` | import/preset |
| 相手チーム | `SET_OPPONENT_SPECIES`, `SET_OPPONENT_POKEMON` | bounds check |
| | `ADD_OPPONENT_SLOT`, `REMOVE_OPPONENT_SLOT` | 1-6体制限 |
| 判明情報 | `REVEAL_ABILITY`, `REVEAL_ITEM`, `REVEAL_TERA` | bounds check |
| フィールド | `SET_FIELD` | shallow merge |
| ターン | `ADD_TURN` | ID自動生成、技自動記録 |
| | `DELETE_TURN` | リナンバー + knownMoves再構築 |
| リセット | `RESET` | 新規オブジェクト生成 |

### 5.3 永続化

- localStorage キー: `champions-tracker`
- スキーマ移行: `migrateMySlot()` / `migrateOpponentSlot()` で欠損フィールドを補完
- JSON.stringify/parse (Set は非サポートのため推論結果は保存しない)

---

## 6. 推論エンジン詳細

### 6.1 アイテム定数 (inference-types.ts)

| 定数 | 内容 |
|------|------|
| `ATTACKER_DAMAGE_ITEMS` | '', Choice Band, Choice Specs, Life Orb, Expert Belt, Muscle Band, Wise Glasses |
| `TYPE_BOOST_ITEMS` | 18タイプ × 1アイテム (Charcoal, Mystic Water, etc.) |
| `RESIST_BERRY_TYPES` | 18タイプ × 1きのみ + Chilan Berry (Normal) |
| `DAMAGE_TOLERANCE` | 1.0 (基本許容誤差 ±%) |

### 6.2 許容誤差関数

```typescript
function getDamageTolerance(maxHP: number): number {
  const onePointPercent = 100 / maxHP;
  return Math.max(1.0, onePointPercent * 1.5);
}
```

例: HP 131 → 1.15%, HP 350 → 1.0% (基本値)

### 6.3 candidateKey 方式

| 関数 | キー形式 | 用途 |
|------|---------|------|
| `candidateKeyFull` | `nature\|item\|ability\|atk:32,hp:0,...` | 同モード同ステータス |
| `candidateKeyBase` | `nature\|item\|ability` | クロスモード |

---

## 7. UI コンポーネント マップ

```
TrackerApp
├── TeamSetup (setup)
│   ├── TeamLibrary
│   │   └── importTeam/exportTeam
│   ├── MySlotCard × 1-6
│   │   ├── SearchSelect (species)
│   │   ├── ItemSelector
│   │   ├── SearchSelect × 4 (moves)
│   │   └── SP inputs (±4 buttons, progress bar)
│   └── OpponentSlotCard × 1-6
│       ├── SearchSelect (species)
│       ├── ItemSelector
│       └── REVEAL selects (ability, tera)
├── BattleLog (battle)
│   ├── TurnEntry
│   │   ├── attacker side toggle
│   │   ├── attacker/defender selects
│   │   ├── SearchSelect (move) + preview
│   │   ├── crit/spread toggles + DamageInput
│   │   ├── FieldConditionBar (collapsible)
│   │   └── BoostSpinner × 10 (collapsible)
│   └── TurnCard × n
│       └── field badges + boost display (expandable)
└── InferencePanel (battle/review)
    └── OpponentCard × n
        ├── known info badges
        ├── narrowing progress bar
        ├── top candidate summary
        ├── nature/item/ability lists
        └── StatRangeBar × 6
```

---

## 8. 前回監査で対応した項目

### CRITICAL (3件)
- **C-1**: FieldSnapshot の攻守スワップ — **false positive** (スワップ不要を確認)
- **C-2**: Move.isSpread のオーバーライド対応
- **C-3**: ステータス異常のPokemon constructorへの受け渡し

### HIGH (4件)
- **H-1**: localStorage スキーマ移行 (migrateMySlot/migrateOpponentSlot)
- **H-2**: ja.ts のポケモン名修正 (3件)
- **H-3**: プリセットチームの特性修正 (Heatran, Clefable)
- **H-4**: Windows ビルド互換 (cross-env)

### MEDIUM (12件)
- **M-1**: candidateKey に SP 値を含める
- **M-2**: SP 範囲 min > max のガード
- **M-3**: Mode B の超効果判定を実計算
- **M-4**: HP依存の許容誤差 (getDamageTolerance)
- **M-5**: RESET で新規オブジェクト生成
- **M-6**: DELETE_TURN でリナンバー + knownMoves 再構築
- **M-7**: 全 slot-indexed アクションに bounds check
- **M-8**: useInference エラーログ
- **M-9**: StatRangeBar の i18n
- **M-10**: TurnCard の不足フィールドバッジ追加
- **M-11**: React key をインデックスから一意キーに変更
- **M-12**: tsconfig module ESNext

### LOW (12件)
- **L-1**: reduce ベースの min/max (スタックオーバーフロー防止)
- **L-2**: 空文字列アイテムのドキュメント
- **L-3**: Muscle Band / Wise Glasses 追加
- **L-4**: クロスモード候補マッチング
- **L-5**: sp-priors.ts のデッドコード削除
- **L-6**: Chilan Berry (Normal) 追加
- **L-7**: emptySlotInference にスロット番号受け渡し
- **L-8**: DamageInput の空入力ハンドリング
- **L-9**: メガ特性の import 受入
- **L-10**: テスト helper に moves フィールド追加
- **L-11**: aria-label 追加
- **L-12**: clipboard API の catch ハンドラ

---

## 9. 今後の拡張候補

| 優先度 | 内容 | 工数目安 |
|--------|------|---------|
| 高 | Web Worker 化 (Mode B 高速化) | 中 |
| 高 | E2E テスト (Playwright) | 中 |
| 中 | ステータス異常 UI 入力 | 小 |
| 中 | テラスタル推論精度向上 | 中 |
| 中 | 使用率データ連携 (事前分布の強化) | 大 |
| 低 | Parental Bond 逆算ガイド | 小 |
| 低 | モバイルレイアウト最適化 | 中 |
| 低 | calc ↔ tracker 間のデータ受け渡し | 小 |

---

## 10. ファイル変更チェックリスト

新ポケモン/技/アイテム追加時:
1. `src/data/species.json`, `moves.json`, `items.json` にエントリ追加
2. `app/lib/ja.ts` に日本語名追加
3. `tracker/engine/inference-types.ts` にダメージ関連アイテムがあれば追加
4. `npm test` で回帰テスト

推論ロジック変更時:
1. `tracker/engine/inference.ts` (Mode A/B)
2. `tracker/engine/candidate-filter.ts` (集約)
3. `tests/tracker-inference.test.ts` にテスト追加
4. 既存テストの候補検出が壊れないことを確認

UI変更時:
1. `tracker/components/` 配下
2. `app/lib/ja.ts` に翻訳追加
3. `npx tsc --noEmit -p tsconfig.app.json` で型チェック
