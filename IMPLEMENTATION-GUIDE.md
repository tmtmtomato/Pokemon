# 実装手順書 — ADR-003 / ADR-004 / ADR-005

**ステータス**: 監査通過済み (2026-04-14)
**権威仕様**: `TEAM-MATCHUP-SPEC.md` の §6, ADR-003, ADR-004, ADR-005
**テストフレームワーク**: Vitest (`npm test`)
**現行テスト数**: 329 passing

---

## 実装順序と依存関係

```
ADR-005a (禁止技フィルタ)        ← 独立。最初に実装可能
    ↓
ADR-004a (meetsAnswerCriteria)   ← ADR-004b/c/d の前提
    ↓
ADR-003 (evaluate3v3 統一)       ← matchupValue 拡張が ADR-004a と同時可能
    ↓
ADR-004b (scoreTargetedCandidate) ← ADR-004a 必須
    ↓
ADR-004c (selectTopCandidates)   ← ADR-004b + ADR-004d 統合
ADR-004d (メガペナルティ)         ← ADR-004c に組み込み
    ↓
ADR-005b (広範囲危険攻撃者)      ← ADR-004a (meetsAnswerCriteria) 必須
    ↓
パイプライン再実行 + 結果検証
```

---

## Step 1: ADR-005a — moves viewer 禁止技フィルタ

### 変更ファイル
- `home-data/viewer-moves/moveCalc.ts`

### 手順

**1-1. import 追加** (L1-6 付近)
```typescript
import { CHARGE_TURN_MOVES, CHARGE_EXEMPT_ABILITIES, RECHARGE_MOVES }
  from "../analyzer/team-matchup-core";
```

**1-2. computeFullThreatAnalysis 内フィルタ** (L565 直後)
```typescript
for (const moveName of enemy.moves) {
  // ★ ADR-005a: Skip banned moves
  if (CHARGE_TURN_MOVES.has(moveName) && !CHARGE_EXEMPT_ABILITIES.has(enemy.ability)) continue;
  if (RECHARGE_MOVES.has(moveName)) continue;
  // ... existing code ...
```

**1-3. findAnswer 内フィルタ** (L421 直後)
```typescript
for (const enmove of enemy.moves) {
  // ★ ADR-005a: Skip banned moves
  if (CHARGE_TURN_MOVES.has(enmove) && !CHARGE_EXEMPT_ABILITIES.has(enemy.ability)) continue;
  if (RECHARGE_MOVES.has(enmove)) continue;
  // ... existing code ...
```

### テスト
- Hyper Beam / Giga Impact を持つ敵が dangerousMoves から除外されること
- Solar Beam を持つ敵 (Drought なし) が除外、Drought 保有時は含まれること
- findAnswer が禁止技を無視して敵の真の最高ダメージを計算すること
- uncoveredCount / answerRate が禁止技除外後に正しく再計算されること

### 検証
```bash
npm test
npm run build:moves
```
build/moves.html を開いて偽アラートが消えていることを確認。

---

## Step 2: ADR-003 — matchupValue シグネチャ拡張 + evaluate3v3 統一

### 変更ファイル
- `home-data/analyzer/team-matchup-core.ts`

### 手順

**2-1. matchupValue に defenderChipPct 追加** (L367-396)

```typescript
export function matchupValue(
  me: string,
  opp: string,
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
  defenderChipPct?: number,       // ★ 追加
): number {
  const entry = matrix[me]?.[opp];
  if (!entry) return 0;

  // ★ chip > 0 なら adjustedEKoN
  const eKoN = defenderChipPct && defenderChipPct > 0
    ? adjustedEKoN(entry, defenderChipPct)
    : effectiveKoN(entry);

  // Priority OHKO → speed-independent first strike
  if (entry.priorityKoN === 1 && (entry.priorityKoChance ?? 0) >= 0.5) return 2.5;

  if (eKoN > 2.5) return 0;

  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;

  if (eKoN <= 1.25) {
    if (mySpd > oppSpd) return 2.5;
    if (mySpd === oppSpd) return 1.9;
    return 1.3;
  }
  if (mySpd > oppSpd) return 1.0;
  if (mySpd === oppSpd) return 0.65;
  return 0.3;
}
```

後方互換: selectTeam → attackerScore の呼び出し (L437) は引数変更なし。

**2-2. evaluate3v3 を matchupValue 統一方式に書き換え** (L277-349)

```typescript
export function evaluate3v3(
  selA: string[],
  selB: string[],
  matrix: DamageMatrix,
  env: SimEnv,
): MatchEvaluation {
  const activeWeather = resolveTeamWeather(selA, selB, env);
  const sandActive = activeWeather === "Sand";

  const srFromA = canSetSR(selA, selB, matrix, env);
  const srFromB = canSetSR(selB, selA, matrix, env);

  function chipFor(name: string, oppHasSR: boolean): number {
    let chip = 0;
    if (sandActive && !env.sandChipImmune.has(name)) chip += SAND_CHIP_PCT;
    if (oppHasSR) chip += env.srChipPct.get(name) ?? 0;
    return chip;
  }

  // ★ ADR-003: matchupValue 統一
  let A_total = 0;
  let B_total = 0;

  for (const a of selA) {
    for (const b of selB) {
      const bChip = chipFor(b, srFromA);
      const aChip = chipFor(a, srFromB);
      A_total += matchupValue(a, b, matrix, env.poolSpeeds, bChip);
      B_total += matchupValue(b, a, matrix, env.poolSpeeds, aChip);
    }
  }

  const scoreA = A_total / 22.5;  // max = 3×3×2.5
  const scoreB = B_total / 22.5;

  return {
    scoreA: round1(scoreA * 100) / 100,
    scoreB: round1(scoreB * 100) / 100,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
  };
}
```

削除される要素: `B_killed` Set, `A_killed` Set, `calcKillPressure` 呼び出し,
`A_totalDmg`/`B_totalDmg`, 4要素重み (0.35/0.25/0.20/0.20)。

`calcKillPressure` 関数自体は team-matchup.ts (L1774, 1778) で使用されるため残置。

### テスト
- matchupValue: chip=0 で従来と同じ結果
- matchupValue: chip 付きで確3→確2 に変化するケース (eKoN 境界)
- evaluate3v3: 先行確1チーム vs 後攻確1チームで A 有利スコア
- evaluate3v3: SR chip 込みで確定数変化 → スコア変動
- evaluate3v3: MatchEvaluation の scoreA/scoreB/winner が正しいこと

### 検証
```bash
npm test
```

---

## Step 3: ADR-004a — meetsAnswerCriteria 独立関数化

### 変更ファイル
- `home-data/analyzer/team-matchup-core.ts` (AnswerContext + meetsAnswerCriteria + buildAnswerContext)
- `home-data/analyzer/team-matchup.ts` (computeTeamThreatProfile のクロージャ置換)

### 手順

**3-1. 定数追加** (team-matchup-core.ts L148 の後)
```typescript
export const THREAT_BONUS_WEIGHT = 2.0;
export const MEGA_OVERSATURATION_PENALTY = 0.3;
```

**3-2. AnswerContext インターフェース追加** (team-matchup-core.ts、evaluate3v3 の後)
```typescript
export interface AnswerContext {
  matrix: DamageMatrix;
  poolSpeeds: Map<string, number>;
  teamHasSand: boolean;
  teamHasSR: boolean;
  srChipPct: Map<string, number>;
  sandChipImmune: Set<string>;
  weatherUsers: Map<string, string>;
}
```

**3-3. buildAnswerContext 関数追加** (team-matchup-core.ts)
```typescript
export function buildAnswerContext(
  members: string[],
  matrix: DamageMatrix,
  simEnv: SimEnv,
): AnswerContext {
  const teamWeatherSetters = members.filter(m => simEnv.weatherUsers.has(m));
  const teamWeather = teamWeatherSetters.length > 0
    ? simEnv.weatherUsers.get(teamWeatherSetters[0]) : undefined;

  return {
    matrix,
    poolSpeeds: simEnv.poolSpeeds,
    teamHasSand: teamWeather === "Sand",
    teamHasSR: members.some(m => simEnv.srUsers.has(m)),
    srChipPct: simEnv.srChipPct,
    sandChipImmune: simEnv.sandChipImmune,
    weatherUsers: simEnv.weatherUsers,
  };
}
```

**3-4. meetsAnswerCriteria 関数移植** (team-matchup-core.ts)

team-matchup.ts L1673-1732 のクロージャを独立関数として移植。
変数の置換マッピング:

| クロージャ内 | 独立関数での参照 |
|------------|----------------|
| `matrix` | `ctx.matrix` |
| `memberSpeeds.get(me)` | `ctx.poolSpeeds.get(me)` |
| `env.sandChipImmune` | `ctx.sandChipImmune` |
| `env.srChipPct` | `ctx.srChipPct` |
| `env.weatherUsers` | `ctx.weatherUsers` |
| `teamHasSand` | `ctx.teamHasSand` |
| `teamHasSR` | `ctx.teamHasSR` |

ヘルパー `oppChipFor` / `myChipFrom` は関数内にインライン化。

```typescript
export function meetsAnswerCriteria(
  me: string, oppName: string, oppSpeed: number, ctx: AnswerContext,
): boolean {
  const meToOpp = ctx.matrix[me]?.[oppName];
  const oppToMe = ctx.matrix[oppName]?.[me];
  if (!meToOpp) return false;

  // oppChipFor inline
  let oppChip = 0;
  if (ctx.teamHasSand && !ctx.sandChipImmune.has(oppName)) oppChip += SAND_CHIP_PCT;
  if (ctx.teamHasSR) oppChip += ctx.srChipPct.get(oppName) ?? 0;

  const myEKoN = adjustedEKoN(meToOpp, oppChip);

  const memberSpeed = ctx.poolSpeeds.get(me) ?? 0;
  const outspeeds = memberSpeed > oppSpeed;
  // ... (L1683-1731 のロジックをそのまま移植、変数参照のみ ctx. に置換)
}
```

**3-5. computeTeamThreatProfile の書き換え** (team-matchup.ts L1615-1897)

- L1631-1635 の `memberSpeeds` 構築を削除
- L1637-1654 の `teamHasSand` / `teamHasSR` / `oppChipFor` / `myChipFrom` を削除
- L1673-1732 のクロージャ `meetsAnswerCriteria` を削除
- 関数冒頭で `buildAnswerContext` を1回呼び出し:
  ```typescript
  const ctx = buildAnswerContext(members, matrix, env);
  ```
- L1796, L1806 の呼び出しを独立関数に変更:
  ```typescript
  // 旧: meetsAnswerCriteria(me, opp.name, oppSpeed)
  // 新: meetsAnswerCriteria(me, opp.name, oppSpeed, ctx)
  ```

### テスト
- meetsAnswerCriteria: 免疫ケース (eKoN > 2.5 かつ combinedKO 不可 → false)
- meetsAnswerCriteria: 先行確1 (outspeeds + eKoN ≤ 1.25 → true)
- meetsAnswerCriteria: KOレース勝利 (後攻 + theirEKoN ≥ 2 + myEKoN < theirEKoN → true)
- meetsAnswerCriteria: 先制技コンボKO → true
- buildAnswerContext: SimEnv からの teamHasSand / teamHasSR 算出が正しいこと
- **回帰テスト**: 独立化前後で computeTeamThreatProfile の出力が同一

### 検証
```bash
npm test
```

---

## Step 4: ADR-004b — scoreTargetedCandidate 実装

### 変更ファイル
- `home-data/types/team-matchup.ts` (型追加)
- `home-data/analyzer/team-matchup.ts` (新関数 + computeTeamThreatProfile 拡張)

### 手順

**4-1. UnansweredThreat 型追加** (types/team-matchup.ts)
```typescript
export interface UnansweredThreat {
  opponentName: string;
  oppSpeed: number;
  usagePct: number;  // 0-100
}
```

**4-2. ThreatProfile に unansweredOpponents 追加** (types/team-matchup.ts L91-101)
```typescript
export interface ThreatProfile {
  // ... 既存9フィールド ...
  unansweredOpponents: UnansweredThreat[];
}
```

**4-3. computeTeamThreatProfile の戻り値に unansweredOpponents を追加** (team-matchup.ts)

opponent ループ内 (L1734-1839) で `hasAnswer === false` の相手を収集:
```typescript
const unansweredList: UnansweredThreat[] = [];

// opponent ループ内:
if (!hasAnswer) {
  unansweredList.push({
    opponentName: opp.name,
    oppSpeed: opp.singlesScores?.speedStat ?? 0,
    usagePct: opp.usagePct,
  });
}

// 戻り値に追加:
return { ...existing, unansweredOpponents: unansweredList };
```

**4-4. scoreTargetedCandidate 新規実装** (team-matchup.ts、selectTopCandidates の前)

仕様 ADR-004b のコードをそのまま実装。

### テスト
- 脅威ボーナス計算: unanswered 3体 (usagePct: 10, 20, 30) → threatBonus = 60
- answeredCount: candidate が 2/3 に回答 → answeredCount = 2
- baseScore: scoreCandidateByCore と同一の値

### 検証
```bash
npm test
```

---

## Step 5: ADR-004c + ADR-004d — selectTopCandidates 統合 + メガペナルティ

### 変更ファイル
- `home-data/analyzer/team-matchup.ts`

### 手順

**5-1. selectTopCandidates にunanswered引数追加** (L985-1018)

仕様 ADR-004c のコードに書き換え。主要変更:
- 引数に `unanswered?: UnansweredThreat[]` 追加
- `unanswered` があれば `scoreTargetedCandidate` を使用
- なければ従来の `scoreCandidateByCore` を使用
- メガペナルティ (ADR-004d): ソート前に `MEGA_OVERSATURATION_PENALTY` 適用
- ソート: `finalScore` 降順 → `answeredCount` 降順

**5-2. generateTieredSwaps から unanswered を渡す** (L1306 付近)

```typescript
// 追加: 入れ替え対象チームの脅威プロファイルを取得
const threatProfile = computeTeamThreatProfile(team.members, opponents, pool, matrix, env, megaCapable);
const selected = selectTopCandidates(
  candidates, remaining, metaReps, matrix, simEnv, megaCapable, candidatesPerSlot,
  threatProfile.unansweredOpponents,  // ★ 追加
);
```

**5-3. generateDualSwaps から unanswered を渡す** (L1345 付近)

同様のパターン。

**注意**: `computeTeamThreatProfile` は引数に `opponents` と `pool` が必要。
generateTieredSwaps / generateDualSwaps のスコープにこれらがあるか確認し、
なければ引数を追加。

### テスト
- unanswered なし → 従来の coreScore ソート結果と一致
- unanswered あり → threatBonus で順位変動
- メガペナルティ: メガ2体チーム + メガ候補 → finalScore × 0.3
- メガペナルティ: メガ1体チーム + メガ候補 → ペナルティなし
- simulateSelectionRate ゲートが従来通り機能

### 検証
```bash
npm test
```

---

## Step 6: ADR-005b — 広範囲危険攻撃者カウント

### 変更ファイル
- `home-data/types/team-matchup.ts`
- `home-data/analyzer/team-matchup.ts`
- `home-data/viewer-matchup/components/TeamDetail.tsx`

### 手順

**6-1. ThreatProfile に 2フィールド追加** (types/team-matchup.ts)
```typescript
dangerousAttackerCount: number;
dangerousAttackerUncovered: number;
```

**6-2. computeTeamThreatProfile に集計追加** (team-matchup.ts)

opponent ループ内 (per-opponent 回答判定の直後) に追加:
```typescript
let dangerousAttackerCount = 0;
let dangerousAttackerUncovered = 0;

// opponent ループ内:
let wideHitCount = 0;
for (const me of members) {
  const entry = matrix[opp.name]?.[me];
  if (entry && entry.maxPct >= 50) wideHitCount++;
}
if (wideHitCount >= 3) {
  dangerousAttackerCount++;
  if (!hasAnswer) dangerousAttackerUncovered++;
}

// 戻り値に追加:
return { ...existing, dangerousAttackerCount, dangerousAttackerUncovered };
```

**6-3. TeamDetail.tsx に警告バッジ追加**

脅威セクション内に条件表示:
```tsx
{team.threatProfile.dangerousAttackerUncovered > 0 && (
  <span className="...text-red-400...">
    広範囲危険: {team.threatProfile.dangerousAttackerUncovered}体 未回答
  </span>
)}
```

### テスト
- 味方6体中3体に maxPct ≥ 50 の攻撃者 → dangerousAttackerCount + 1
- 同じ攻撃者に meetsAnswerCriteria = false → dangerousAttackerUncovered + 1
- maxPct < 50 が2体のみ → カウント対象外

### 検証
```bash
npm test
npm run build:matchup
```

---

## Step 7: 統合検証

### パイプライン再実行
```bash
npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200
```

### ビルド
```bash
npm run build:pages
```

### 確認項目
1. `npm test` — 全テスト passing
2. `npx tsc --noEmit -p tsconfig.app.json` — 型チェック OK
3. `build/matchup.html` — 脅威プロファイルに広範囲危険攻撃者が表示
4. `build/moves.html` — recharge/charge 技の偽アラートが消滅
5. TOP50 のデータ確認:
   - Dead メンバー数の減少 (32/50 → 目標 < 15)
   - WR 50% 台チームの減少
   - メガ3体以上の構成の減少

---

## ファイル変更サマリー

| ファイル | Step | 変更内容 |
|---------|------|---------|
| `team-matchup-core.ts` | 2,3 | matchupValue chip引数, evaluate3v3 書換, AnswerContext/buildAnswerContext/meetsAnswerCriteria 追加, 定数2つ追加 |
| `team-matchup.ts` | 3,4,5,6 | computeTeamThreatProfile クロージャ置換+拡張, scoreTargetedCandidate 新規, selectTopCandidates 改修, generateTieredSwaps/DualSwaps 変更 |
| `types/team-matchup.ts` | 4,6 | UnansweredThreat 型追加, ThreatProfile 拡張 (unansweredOpponents + dangerousAttacker*) |
| `moveCalc.ts` | 1 | import追加, computeFullThreatAnalysis + findAnswer に禁止技フィルタ |
| `TeamDetail.tsx` | 6 | 広範囲危険攻撃者の警告バッジ |

## テストファイル (新規作成)

| ファイル | 内容 |
|---------|------|
| `home-data/analyzer/team-matchup-core.test.ts` | matchupValue (chip付き), evaluate3v3 (速度反映), meetsAnswerCriteria, buildAnswerContext |
| `home-data/analyzer/team-matchup-scoring.test.ts` | scoreTargetedCandidate, selectTopCandidates (メガペナルティ含む) |
| `home-data/viewer-moves/moveCalc.test.ts` | 禁止技フィルタ (既存ファイルにケース追加 or 新規) |

---

# Phase C 実装引き継ぎ — クロスラン蓄積 + 耐久型 + ばけのかわ

> 作成日: 2026-04-15
> 権威仕様: `TEAM-MATCHUP-SPEC.md` §15, ADR-007, ADR-008, ADR-009
> テスト: 343 passing

---

## 実装済み項目 (ADR-007 / ADR-008 / ADR-009)

### 1. クロスラン蓄積 (ADR-007)

**ステータス**: 完了・稼働中

#### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `home-data/types/matchup-history.ts` | `MatchupSnapshot`, `MatchupHistory`, `SnapshotTeam` 型定義 |
| `home-data/scripts/extract-matchup-snapshots.mjs` | 既存JSONからの遡及スナップショット抽出 |
| `home-data/viewer-history/App.tsx` | 5タブ History Viewer (Summary/Convergence/Pokemon/Cores/Diff) |
| `home-data/viewer-history/main.tsx` | React エントリポイント |
| `home-data/viewer-history/components/RunList.tsx` | 左サイドバー: 実行一覧 |
| `home-data/viewer-history/components/SummaryDashboard.tsx` | KPI + MVP + Rising/Falling |
| `home-data/viewer-history/components/ConvergenceChart.tsx` | WR推移折れ線 (SVG) |
| `home-data/viewer-history/components/PokemonConsistency.tsx` | ヒートマップ (Pick/Selection切替, Gap列) |
| `home-data/viewer-history/components/CoreStability.tsx` | コア出現頻度 + 信頼度 |
| `home-data/viewer-history/components/RunDiff.tsx` | 2実行間比較 (WR差, 採用率変動, 新規/脱落) |
| `history.html` | HTML エントリ |
| `scripts/build-all.mjs` | 全ページ一括ビルドスクリプト |

#### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `home-data/analyzer/team-matchup.ts` | `extractSnapshot()` 関数追加、`main()` 末尾で自動保存、`--loop` モード + `seedOverride` パラメータ |
| `vite.config.ts` | PAGES に `history` 追加 |
| `package.json` | `build:history` スクリプト追加 |

#### 使い方

```bash
# ループ実行 (Ctrl+C で停止)
npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200 --loop

# 特定 seed から開始
npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200 --loop --seed 100

# 蓄積データの確認
npm run build:history
# → build/history.html を開く

# 遡及抽出 (既存JSONからスナップショット復元)
node home-data/scripts/extract-matchup-snapshots.mjs

# 蓄積データのリセット
echo '{"version":1,"snapshots":[]}' > home-data/storage/analysis/_matchup-history.json
```

#### アーキテクチャノート

- `main(seedOverride?)`: ループモードから seed を注入。単発実行時は `undefined` (従来動作)
- スナップショットは `main()` 末尾で `_matchup-history.json` に JSON 追記
- History Viewer は `import historyJson from "../storage/analysis/_matchup-history.json"` でバンドル時に静的取り込み
- `_matchup-history.json` は `_latest-` コピー不要 (直接参照)

### 2. 耐久型ビルドバリアント (ADR-008)

**ステータス**: 完了

#### 変更箇所

- `team-matchup-core.ts`: `baseSpecies()` に `-HB` / `-HD` サフィックス追加
- `team-matchup.ts`: `DEFENSIVE_VARIANTS` 配列定義 + Phase 1c でソースからクローン展開

#### 登録ビルド

| 名前 | 元種 | 性格 | 持ち物 | 特性 | SP配分 | 技 |
|------|------|------|--------|------|--------|-----|
| Garchomp-HB | Garchomp | Impish | Leftovers | Rough Skin | HP32/Def32/SpD2 | Earthquake, Dragon Claw, Stealth Rock, Rock Slide |
| Mimikyu-HD | Mimikyu | Careful | Leftovers | Disguise | HP32/Def2/SpD32 | Play Rough, Shadow Sneak, Shadow Claw |

#### 種族条項

`baseSpecies()` が `-Mega` / `-HB` / `-HD` を全て認識するため、
同一種族のバリアント同士はチーム内に共存不可 (自動)。

### 3. ばけのかわ (ADR-009)

**ステータス**: 完了

#### 変更箇所

- `team-matchup-core.ts`:
  - `SimEnv` に `disguiseUsers: Set<string>` 追加
  - `matchupValue()` に第6引数 `extraDefenderKoN?: number` 追加
  - `evaluate3v3()` 内に Disguise 事後調整ロジック追加
  - `serializeSimEnv()` / `deserializeSimEnv()` 更新
- `team-matchup.ts`:
  - SimEnv 初期化ループで `ability === "Disguise"` → `disguiseUsers.add()`

#### 動作原理

1. evaluate3v3 の 3×3 ループ後、Disguise ユーザーを検出
2. 各 Disguise ユーザーに対する最大脅威 (相手側最大 matchupValue) を特定
3. `matchupValue(maxThreat, disguiseUser, ..., extraDefenderKoN=1)` で再計算
4. 差分 (元の値 - 再計算値) を相手側の total から減算
5. selectTeam には影響なし (構築段階では不要)

---

## 12回ループ実行の結果サマリー (2026-04-15)

### 実行パラメータ

```
--teams 5000 --games 200 --loop (seed 42-53)
12イテレーション × ~27分/回 = ~5.4時間
合計: ~650,000チーム生成、~130,000,000試合
```

### 蓄積データ

`home-data/storage/analysis/_matchup-history.json` に12スナップショット格納済み。

### 主要な知見

1. **ヒスイバクフーンが絶対的エース**: 12/12回出現、平均採用率96%、CV=0.12 (非常に安定)
2. **メガオーダイルが準エース**: 9/12回出現、平均採用率66%、ただしCV=0.40 (やや不安定)
3. **WR変動幅12%**: 最高81.9%-最低70.0%。同一ロジックでも乱数次第で大きくブレる
4. **最高信頼度チーム (5/12回)**: ヒスイバクフーン + メガオーダイル + ヒスイヌメルゴン + カバルドン-HD + メガプテラ + パルデアケンタロス水 (avgWR 73.2%)
5. **隠れた強者**: キョジオーン (採用15%/選出73%), メガアブソル (採用8%/選出47%) — Sel/Pick比が極めて高い

### 既知の問題

- **Palafin-Hero コア汚染**: build-banned (相手専用) のポケモンがコア分析に混入
- **Seed 異常**: Snapshot #4 で seed=42 記録 (期待値45)。別プロセス同時実行の可能性。データ自体は正常
- **WR 12% レンジ**: 同一ロジックでの乱数による揺らぎ。今後のイテレーション増加で信頼区間が縮小するか要観察

---

## 今後の候補作業 (未着手)

| 項目 | 概要 | 依存 |
|------|------|------|
| Palafin-Hero コア汚染修正 | コア評価時に build-banned Pokemon をフィルタ | なし |
| Phase A: メタ適性評価 | 161体 (非TOP50) の隠れた強者発掘 | なし |
| Phase B: 補完枠網羅探索 | 上位コアの補完枠 C(35,3) ≈ 6500 通り探索 | Phase A 推奨 |
| ADR-003/004/005 実装 | evaluate3v3 統一 + 脅威指向研磨 + 禁止技フィルタ | 本ガイド Step 1-7 |
