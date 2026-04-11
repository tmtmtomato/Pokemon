# バトルトラッカー 包括的監査レポート

> 監査日: 2026-03-30
> 監査手法: 4つの専門サブエージェントによる並列監査
> 対象: `tracker/` モジュール全ファイル (28ファイル, 210KB)

---

## 監査結果サマリ

| 重大度 | 件数 | 説明 |
|--------|------|------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 10 | 推論バグ 3件, 状態管理 2件, UI/i18n 3件, ビルド 2件 |
| LOW | 11 | 推論 2件, 状態管理 4件, UI 4件, ビルド 1件 |
| SUGGESTION | 7 | 推論 2件, 状態管理 1件, UI 4件 |

**テスト**: 322/322 passing (全18ファイル)
**TypeScript (tracker/)**: エラー 0件

---

## MEDIUM (10件)

### 推論エンジン (3件)

#### M-1: Mode A/B で isMega が Pokemon コンストラクタに渡されていない
**ファイル**: [inference.ts:100-110](tracker/engine/inference.ts#L100-L110), [inference.ts:209-219](tracker/engine/inference.ts#L209-L219)

Mode A の defender (自分のポケモン) と Mode B の attacker (自分のポケモン) を構築する際、`mySlot.isMega` が `Pokemon` コンストラクタに渡されていない。メガシンカ中のポケモンが関与するターンで、誤った種族値・タイプ・特性が使われ、推論結果が不正確になる。

```typescript
// 現状 (Mode A, line 100-110)
const defenderConfig = {
  name: mySlot.species,
  nature: mySlot.nature,
  // ... isMega がない
};

// 修正
const defenderConfig = {
  name: mySlot.species,
  nature: mySlot.nature,
  isMega: mySlot.isMega,  // ← 追加
  // ...
};
```

#### M-2: Mode A で相手のテラスタル情報が attacker に渡されていない
**ファイル**: [inference.ts:146-154](tracker/engine/inference.ts#L146-L154)

Mode A (相手が攻撃) で候補の attacker を構築する際、`opponentSlot.knownTeraType` が渡されていない。相手がテラスタル中にSTAB計算が不正確になる。Mode B (line 276) では正しく渡されている。

```typescript
// 現状 (line 146-154)
const attacker = new Pokemon({
  name: opponentSlot.species,
  nature,
  sp: attackerSP,
  ability,
  item,
  // teraType, isTera がない
});

// 修正
const attacker = new Pokemon({
  name: opponentSlot.species,
  nature,
  sp: attackerSP,
  ability,
  item,
  teraType: opponentSlot.knownTeraType || undefined,
  isTera: !!opponentSlot.knownTeraType,
  boosts: turn.attackerBoosts as Partial<StatsTable>,
  status: turn.attackerStatus || undefined,
});
```

#### M-3: テスト不足 — Mode A/B/Cross-turn のカバレッジが薄い
**ファイル**: [tracker-inference.test.ts](tests/tracker-inference.test.ts)

現在5テストのみ。以下のシナリオが未テスト:
- 天候/テライン/壁つきの推論
- ランク補正つきの推論
- テラスタル中の推論
- メガシンカ中の推論
- Eviolite/Assault Vest/抵抗きのみ付きの防御推論 (Mode B)
- クロスモード (Mode A + Mode B) の集約
- SP予算制約 (合計66超で矛盾検出)
- 候補ゼロのエッジケース

### 状態管理 (2件)

#### M-4: REMOVE_OPPONENT_SLOT がターン参照を更新しない
**ファイル**: [useTracker.ts:236-239](tracker/hooks/useTracker.ts#L236-L239)

相手スロットを削除した後、既存の `TurnEntry` の `attackerSlot` / `defenderSlot` が古いインデックスを参照し続ける。推論結果が間違ったポケモンに対して計算される可能性がある。`REMOVE_MY_SLOT` も同様。

**対応案**: スロット削除時にそのスロットを参照するターンを削除するか、インデックスを再マッピングする。

#### M-5: loadState のフィールド移行が shallow spread
**ファイル**: [useTracker.ts:363](tracker/hooks/useTracker.ts#L363)

```typescript
currentField: { ...createFieldSnapshot(), ...(saved.currentField ?? {}) },
```

`attackerSide` / `defenderSide` が部分的に保存されていた場合 (新フィールド追加後)、saved の不完全な side オブジェクトがデフォルトを完全に上書きし、新フィールドが `undefined` になる。

**対応案**: deep merge を追加:
```typescript
currentField: {
  ...createFieldSnapshot(),
  ...(saved.currentField ?? {}),
  attackerSide: { ...createFieldSnapshot().attackerSide, ...(saved.currentField?.attackerSide ?? {}) },
  defenderSide: { ...createFieldSnapshot().defenderSide, ...(saved.currentField?.defenderSide ?? {}) },
},
```

### UI/i18n (3件)

#### M-6: OpponentSlotCard で knownMoves が翻訳されていない
**ファイル**: [OpponentSlotCard.tsx:122](tracker/components/OpponentSlotCard.tsx#L122)

```tsx
// 現状
{slot.knownMoves.map(m => (
  <span ...>{m}</span>  // 英語のまま
))}

// 修正: MOVE_JA をインポートし t() で翻訳
{slot.knownMoves.map(m => (
  <span ...>{t(m, MOVE_JA, lang)}</span>
))}
```

#### M-7: FieldConditionBar で isFriendGuard が攻撃側に配置
**ファイル**: [FieldConditionBar.tsx:26](tracker/components/FieldConditionBar.tsx#L26)

Friend Guard は味方へのダメージを軽減する特性で、防御側サイドにのみ配置すべき。ATK_TOGGLES から削除すべき。

#### M-8: gameType (Singles/Doubles) の UI 切替がない
**ファイル**: [FieldConditionBar.tsx](tracker/components/FieldConditionBar.tsx)

`FieldSnapshot.gameType` は常に 'Doubles' で固定され、UI 上に切替手段がない。Champions はダブルメインだが、シングルバトルもありえる。

### ビルド (2件)

#### M-9: src/ に13件の TypeScript 型エラー
**ファイル**: `src/mechanics/abilities.ts`, `src/data/index.ts`, `src/mechanics/damage.ts`, `app/hooks/useCalc.ts`

`npx tsc --noEmit -p tsconfig.app.json` で13件のエラー。全て `src/` と `app/` に起因し、`tracker/` にはゼロ。内訳:
- 4096リテラル型 vs number: 9件
- JSON tuple型: 2件
- isSpread プロパティ不在: 1件
- Status 比較のデッドコード: 1件

ランタイムには影響しない (Vite/Vitest は正常動作) が、strict 型安全のために修正推奨。

#### M-10: デフォルト tsconfig で import attributes エラー
**ファイル**: `tsconfig.json`

`module: 'ES2022'` が `import ... with { type: 'json' }` 構文に非対応。`tsconfig.app.json` (`module: 'ESNext'`) では正常。

---

## LOW (11件)

### 推論

#### L-1: Mode B の超効果ダミーチェックが相手テラタイプを考慮しない
**ファイル**: [inference.ts:231-239](tracker/engine/inference.ts#L231-L239)

抵抗きのみ列挙判定で dummy defender にテラタイプが設定されない。実害は限定的 (保守的フォールバック)。

#### L-2: Booster Energy が攻撃側アイテムに未収録
**ファイル**: [inference-types.ts:67-75](tracker/engine/inference-types.ts#L67-L75)

Flutter Mane / Iron Bundle 等の Protosynthesis/Quark Drive ポケモンで Booster Energy は VGC で頻出だが、特性依存の複雑な効果のため未収録。

### 状態管理

#### L-3: SET_MY_MOVE が4技上限を強制しない
**ファイル**: [useTracker.ts:200](tracker/hooks/useTracker.ts#L200)

`moveIndex` に上限チェックがなく、任意サイズの配列が作れる。UI が4枠に制限しているため実害なし。

#### L-4: LOAD_MY_TEAM が migrateMySlot を適用しない
**ファイル**: [useTracker.ts:205-206](tracker/hooks/useTracker.ts#L205-L206)

`importTeam()` / プリセットからの読込時、slot のスキーマ移行が行われない。`loadState()` の移行と不整合。

#### L-5: importTeam が isMega: false を強制
**ファイル**: [showdown-format.ts:155](tracker/engine/showdown-format.ts#L155)

export→import のラウンドトリップでメガ状態が失われる。

#### L-6: mega-kangaskhan.txt が isMega: false でも Parental Bond
**ファイル**: [presets/mega-kangaskhan.txt](tracker/presets/mega-kangaskhan.txt)

import 後に `ability: "Parental Bond"`, `isMega: false` という意味的不整合が生じる。

### UI

#### L-7: TurnEntry.tsx で技タイプバッジが未翻訳
**ファイル**: [TurnEntry.tsx:182](tracker/components/TurnEntry.tsx#L182)

`{moveData.type}` → `{t(moveData.type, TYPE_JA, lang)}` とすべき。

#### L-8: TurnCard の展開が div + onClick でキーボード操作不可
**ファイル**: [TurnCard.tsx:47](tracker/components/TurnCard.tsx#L47)

`role="button"`, `tabIndex={0}`, `onKeyDown` が未設定。

#### L-9: SP 入力で NaN が state に入る可能性
**ファイル**: [MySlotCard.tsx:156](tracker/components/MySlotCard.tsx#L156)

`Number('')` → `0` だが、`Number('abc')` → `NaN` は reducer の `Math.max(0, Math.min(32, NaN))` → `NaN` となる。`type="number"` で実害は限定的。

#### L-10: TurnCard でスロット削除後の配列外参照
**ファイル**: [TurnCard.tsx:22-23](tracker/components/TurnCard.tsx#L22-L23)

チーム変更後に古い turns がレンダリングされると `undefined` スロットを参照しうる。`?.` で部分ガードあり。

### ビルド

#### L-11: 未使用 export (PresetTeam, SavedTeam)
**ファイル**: [presets/index.ts](tracker/presets/index.ts), [TeamLibrary.tsx](tracker/components/TeamLibrary.tsx)

ローカルでのみ使用。外部からの import なし。実害なし。

---

## SUGGESTION (7件)

| # | 内容 | ファイル |
|---|------|---------|
| S-1 | SPTier 分類の閾値が非対称 (moderate だけ 0.50) — ドキュメント推奨 | candidate-filter.ts |
| S-2 | RESET 時に turnCounter もリセット (ID に Date.now() あるので無害) | useTracker.ts |
| S-3 | TurnEntry.tsx (292行) が大きい — Boosts/Field を子コンポーネント分離 | TurnEntry.tsx |
| S-4 | TurnCard のフィールドバッジ群を FieldBadges コンポーネントに抽出 | TurnCard.tsx |
| S-5 | PokemonSprite パターン (img + onError) が4箇所で重複 — 共通化 | 複数 |
| S-6 | TypeBadge パターン (タイプ色バッジ) が5箇所で重複 — 共通化 | 複数 |
| S-7 | アクティブフィールド/ブーストの色付きドット (●) に aria-label 追加 | TurnEntry.tsx |

---

## 監査ベクトル別サマリ

### A. 推論エンジン正確性
- **Mode A/B のコア列挙ロジック**: 正常 (性格25種 × SP 0-32 × アイテム × 特性)
- **ダメージ許容誤差**: 正常 (HP依存補正付き)
- **ターン横断集約**: 正常 (同モード/クロスモードの candidateKey 使い分け)
- **SP 事前分布**: 合理的 (種族値ベース、VGC メタに適合)
- **バグ**: isMega 未伝達 (M-1)、テラ未伝達 (M-2) — 特定条件下で不正確な推論

### B. 状態管理堅牢性
- **Reducer**: 全アクションに bounds check、不変更新パターン一貫
- **永続化**: try/catch 保護、スキーマ移行あり
- **バグ**: スロット削除時のターン参照不整合 (M-4)、shallow field merge (M-5)

### C. UI/i18n 整合性
- **i18n**: 95% カバー、2箇所で翻訳漏れ (M-6, L-7)
- **React パターン**: 正常 (immutable state, stable keys, controlled inputs)
- **アクセシビリティ**: 改善余地あり (aria-label 不足、キーボード操作)
- **フィールド条件**: ほぼ全網羅、FriendGuard の配置ミス (M-7)

### D. ビルド/テスト
- **テスト**: 322/322 passing、tracker 固有 5/5 passing
- **TypeScript**: tracker/ エラー 0件、src/ に13件の pre-existing エラー
- **Import パス**: 108/108 正常
- **console**: 適切な warn のみ (error ハンドラ内)

---

## 修正優先度マトリクス

| 優先度 | ID | 内容 | 工数 |
|--------|-----|------|------|
| 高 | M-1 | isMega 伝達 | 小 |
| 高 | M-2 | テラ情報伝達 (Mode A) | 小 |
| 高 | M-3 | テスト追加 (10ケース以上) | 中 |
| 中 | M-4 | スロット削除時のターン参照 | 中 |
| 中 | M-5 | フィールド deep merge | 小 |
| 中 | M-6 | knownMoves 翻訳 | 小 |
| 中 | M-7 | FriendGuard 配置修正 | 小 |
| 低 | M-8 | gameType UI | 小 |
| 低 | M-9/10 | src/ 型エラー修正 | 中 |
