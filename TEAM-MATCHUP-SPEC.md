# 3/6 シングル選出メタ構築システム — 仕様書

## 1. 概要

### 目的

ポケモンシングルバトル (6体構築 → 3体選出) において、
**現メタ環境で最も強い構築を自動探索し、その強さの根拠と改善余地を可視化する**システム。

プレイヤーが回答を得たい問い:

- 「今のメタで最も勝率の高い6体構築は何か？」
- 「その構築は何に強く、何に弱いのか？」
- 「弱点を補うにはどのメンバーを入れ替えるべきか？」

### 成功基準

1. **勝率の信頼性**: TOP構築の勝率が1000ゲーム以上の試行で安定する (±2%以内)
2. **実行間の再現性**: 同一メタデータに対し、上位5構築の顔ぶれが概ね一致する
3. **構造的健全性**: TOP構築が重大な未回答脅威 (使用率加重 ≥ 5%) を持たない、
   または持つ場合はその事実が明示される
4. **改善指針の提供**: 死に枠・行き止まり・未回答脅威が定量的に示され、
   次のアクションが明確になる

### 手段

既存のダメージ計算エンジンを活用し、以下を実現する：

1. **ダメージ行列の事前計算**: 257×257の全対面ダメージを1回だけ計算
2. **構築生成 (探索+構造)**: ランダム大量生成 + コアシード構築で広く深く探索
3. **選出アルゴリズム**: 相手の6体に対し最適な3体を自動選出
4. **3v3マッチ評価**: 両者の選出3体同士の有利不利を判定
5. **反復研磨**: 弱点を持つメンバーを脅威を解消できる候補に入れ替え
6. **構造分析**: 脅威プロファイル・行き止まり判定で構築の質を評価
7. **HTMLビューア**: 結果を対話的に表示 (matchup viewer + moves viewer)

---

## 2. データ基盤

### 既存データ (再利用)
| データ | パス | 用途 |
|--------|------|------|
| Pikalyticsインデックス | `storage/pikalytics/2026-04-08/gen9ou/_index.json` | 上位50体リスト+使用率 |
| Pikalytics個別 | `storage/pikalytics/2026-04-08/gen9ou/{Name}.json` | 技/持ち物/特性/採用率 |
| raw-recon性格 | `storage/raw-recon/03-pdetail-*-single.json` | 性格分布 |
| species.json | `src/data/species.json` | 種族値・タイプ・メガ |
| moves.json | `src/data/moves.json` | 技データ |
| 計算エンジン | `src/` | `calculate()`, `Pokemon`, `Move`, `Field` |

### 既存パイプラインからの流用
`singles-ranking.ts` の `generateBuilds()` と `runCalc()` をそのまま利用。
ビルド生成ロジック（性格×持ち物×特性、メガ石自動追加）は同一。

---

## 3. ダメージ行列 (事前計算)

全257エントリの「代表ビルド」同士のダメージを1回だけ計算し、以降の選出・評価で高速参照する。

### 代表ビルド
各ポケモンの**最高ウェイトのビルド**を代表として使用。
（weight = 性格率 × 持ち物率 × 特性率 の正規化値）

### 行列エントリ

```typescript
interface DamageMatrixEntry {
  bestMove: string;       // 最大ダメージ技名
  minPct: number;         // 85%乱数のダメ%
  maxPct: number;         // 100%乱数のダメ%
  koN: number;            // 確定KOに必要な打数 (0=4発以内KO不可)
  koChance: number;       // KO確率 (0.0-1.0)
  effectiveness: number;  // タイプ相性倍率
}

// matrix[attacker][defender] = DamageMatrixEntry
type DamageMatrix = Record<string, Record<string, DamageMatrixEntry>>;
```

### 計算量
- 49体 × 49体 × 平均3.5技 ≈ **8,400回** (数秒で完了)
- 各ペアで最良技 (maxPct最大) を `bestMove` として記録

---

## 4. 構築生成

### 方式: モンテカルロ・ランダムサンプリング

```
N_TEAMS = 10,000       // 生成する構築数
TEAM_SIZE = 6          // 1構築のポケモン数
MAX_MEGAS_PER_TEAM = 2 // メガ枠の上限 (選出時は排他)
```

### アルゴリズム
1. 49体のプールからランダムに6体を選択（重複なし）
2. メガ進化可能なポケモンが3体以上なら再抽選
3. 生成した構築に一意IDを付与

### 使用率重み付き抽選 (オプション)
完全ランダムだと弱ポケモンが多い構築ばかりになるため、
使用率に比例した重み付き抽選を行う：

```typescript
// 重み = sqrt(usagePct) で、上位をやや優遇しつつ多様性を確保
weight(pokemon) = Math.sqrt(pokemon.usagePct)
```

---

## 5. 選出アルゴリズム

### 入力
- **myTeam**: 自分の6体 (名前のリスト)
- **oppTeam**: 相手の6体 (名前のリスト)
- **matrix**: ダメージ行列
- **poolSpeeds**: ポケモン名→素早さ実数値のマップ

### Step 1: 速度加重キル評価 (matchupValue)

各 (味方, 相手) ペアに**速度×KO速度**の加重スコアを付与する。
OHKOと2HKOの実戦的価値差を正しく反映するため、二値カウントではなく
KO速度と先後関係に基づく連続値を使用する。

#### スコアテーブル

| 状況 | 値 | 根拠 |
| ------ | ----- | ------ |
| 先行1HKO | 2.5 | 被弾0。HP温存して次のターゲットへ。ゲーム支配 |
| 後攻1HKO | 1.3 | 被弾1回。消耗は先行2HKOと同等だが、選出抑制効果で加点 |
| 先行2HKO | 1.0 | **基準点**。被弾1回で処理完了 |
| 後攻2HKO | 0.3 | 被弾2回。3体選出で3回攻撃するチャンスがなく、回答として機能しにくい |
| 速度タイ | 先行値×0.5 + 後攻値×0.5 | 50%で先行/後攻 |
| 先制技1HKO | 2.5 | 速度不問で先手保証。先行1HKOと同等 |
| 3HKO以上 | 0 | 実質処理不可 |

**設計意図**: 後攻1HKOで6体に一貫していても、合計3回被弾するため生き残れない。
先行1HKOが2体にしか刺さらなくても被弾0で次に移行でき、継続戦闘力で勝る。
この差を「一貫性」ではなく「1対面あたりの戦闘価値」で評価することで、
スペシャリストが得意対面で正しく選出される。

```typescript
function matchupValue(
  me: string, opp: string,
  matrix: DamageMatrix, poolSpeeds: Map<string, number>,
): number {
  const entry = matrix[me]?.[opp];
  if (!entry) return 0;

  const eKoN = effectiveKoN(entry);

  // Priority OHKO → speed-independent first strike
  if (entry.priorityKoN === 1 && entry.priorityKoChance >= 0.5) return 2.5;

  if (eKoN > 2.5) return 0;       // 3HKO+ → can't effectively KO

  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;
  const isOHKO = eKoN <= 1.25;

  if (isOHKO) {
    if (mySpd > oppSpd) return 2.5;       // 先行1HKO
    if (mySpd === oppSpd) return 1.9;      // (2.5+1.3)/2
    return 1.3;                            // 後攻1HKO
  }
  // 2HKO
  if (mySpd > oppSpd) return 1.0;          // 先行2HKO
  if (mySpd === oppSpd) return 0.65;       // (1.0+0.3)/2
  return 0.3;                              // 後攻2HKO
}
```

### Step 1b: attackerScore

```typescript
function attackerScore(
  me: string, opponents: string[],
  matrix: DamageMatrix, poolSpeeds: Map<string, number>,
): number {
  let total = 0;
  for (const opp of opponents) {
    total += matchupValue(me, opp, matrix, poolSpeeds);
  }
  return total / opponents.length;
}
```

### Step 2: アタッカー1〜2体を選出

1. 味方6体をattackerScoreで降順ソート
2. 1位を「エース」として選出
3. 2位のスコアが閾値以上 (≥0.4) かつエースと合わせて相手6体中5体以上をカバーできる場合、2体目も選出
4. **メガ排他制約**: エースがメガなら2体目はメガ不可

### Step 3: 補完ポケモンの選出

残りの味方から「補完スコア」を計算：

```typescript
function complementScore(
  candidate: string,
  selectedAttackers: string[],
  opponents: string[],
): number {
  // A. 選出アタッカーへの脅威に対する受け
  let defenseValue = 0;
  for (const opp of opponents) {
    // 相手oppが選出アタッカーのどれかをOHKOできる場合
    const isThreateningToUs = selectedAttackers.some(
      atk => matrix[opp][atk].koN === 1 && matrix[opp][atk].koChance >= 0.5
    );
    if (isThreateningToUs) {
      // このcandidateはそのoppの攻撃を耐えられるか？
      const canTank = matrix[opp][candidate].koN !== 1 || matrix[opp][candidate].koChance < 0.5;
      // このcandidateはそのoppに打点があるか？
      const canHitBack = matrix[candidate][opp].maxPct >= 30;
      if (canTank && canHitBack) defenseValue += 1;
    }
  }

  // B. アタッカーで突破できない相手への回答
  let offenseValue = 0;
  for (const opp of opponents) {
    const uncoveredByAttackers = !selectedAttackers.some(
      atk => matrix[atk][opp].koN <= 2 && matrix[atk][opp].koChance >= 0.5
    );
    if (uncoveredByAttackers) {
      if (matrix[candidate][opp].koN <= 2 && matrix[candidate][opp].koChance >= 0.5) {
        offenseValue += 1;
      }
    }
  }

  return 0.5 * defenseValue + 0.5 * offenseValue;
}
```

### Step 4: 3体確定まで繰り返し

選出が3体未満の場合、Step 3を繰り返す。
残りの味方全員のcomplementScoreが0の場合は、attackerScore最高の未選出ポケモンを選ぶ（フォールバック）。

### Step 5: 最終出力

```typescript
interface Selection {
  members: string[];   // 選出3体の名前
  roles: ("ace" | "secondary" | "complement")[];
}
```

---

## 6. 3v3 マッチ評価

### 入力

- **selA**: チームAの選出3体
- **selB**: チームBの選出3体
- **matrix**: ダメージ行列
- **env**: SimEnv (poolSpeeds, SR/weather/chip 情報)

### 設計方針 (ADR-003)

`selectTeam` (§5) と `evaluate3v3` の評価基準を **`matchupValue` 一本で統一** する。

**旧設計の問題**: evaluate3v3 は kills / killPressure / survive / avgDmg の
4要素モデルで、速度を一切考慮しなかった。`selectTeam` が matchupValue で
「先行確1だから選出する」と決めても、evaluate3v3 が `eKoN <= 2.5` の二値で
先後差を消してしまい、「選出の良さが勝率に反映されない」構造だった。

**改修**: 4要素モデルを廃止し、既存の `matchupValue()` で全ペアを評価する。
matchupValue は速度・確定数・先制技を連続値 (0〜2.5) で統合済みであり、
4要素が個別に捉えていた情報を全て包含する:

| 旧4要素 | matchupValue での表現 |
|---------|---------------------|
| kills (Set, 二値) | 確1: 2.5/1.3、確2: 1.0/0.3、確3+: 0 — 連続値でキル品質を区別 |
| killPressure (eKoNベース連続値) | 確1/確2の段階+先後が倍率に直接反映 |
| survive (被KO Set, 二値) | 相手側の matchupValue が低い = 自分が倒されにくい |
| avgDmg (maxPct合計) | 確3以上 = 0 で切り捨て。実戦で確3+は機能しないため妥当 |

### matchupValue のシグネチャ拡張

evaluate3v3 では SR/天候による chip ダメージで実効確定数が変化する。
現行 `matchupValue` は `effectiveKoN()` (chip 非考慮) を使用しているため、
オプショナル引数 `defenderChipPct` を追加し `adjustedEKoN()` を使えるようにする。

```typescript
export function matchupValue(
  me: string,
  opp: string,
  matrix: DamageMatrix,
  poolSpeeds: Map<string, number>,
  defenderChipPct?: number,       // ★ 追加 (default: 0)
): number {
  const entry = matrix[me]?.[opp];
  if (!entry) return 0;

  // chip > 0 なら adjustedEKoN、なければ従来の effectiveKoN
  const eKoN = defenderChipPct && defenderChipPct > 0
    ? adjustedEKoN(entry, defenderChipPct)
    : effectiveKoN(entry);

  // Priority OHKO → speed-independent first strike
  if (entry.priorityKoN === 1 && (entry.priorityKoChance ?? 0) >= 0.5) return 2.5;

  if (eKoN > 2.5) return 0; // 3HKO+ → can't effectively KO

  const mySpd = poolSpeeds.get(me) ?? 0;
  const oppSpd = poolSpeeds.get(opp) ?? 0;

  if (eKoN <= 1.25) {                     // 確1
    if (mySpd > oppSpd) return 2.5;        // first-strike 1HKO
    if (mySpd === oppSpd) return 1.9;      // (2.5+1.3)/2
    return 1.3;                            // slower 1HKO
  }
  // 確2
  if (mySpd > oppSpd) return 1.0;          // first-strike 2HKO
  if (mySpd === oppSpd) return 0.65;       // (1.0+0.3)/2
  return 0.3;                              // slower 2HKO
}
```

**後方互換**: `defenderChipPct` は optional。既存の `selectTeam` → `attackerScore` 呼び出しは
引数変更なしで従来通り動作する。

### スコア計算

```typescript
function evaluate3v3(selA, selB, matrix, env) {
  // SR/weather 判定: 既存ロジック維持
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

  // ★ matchupValue 統一 (ADR-003)
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

  // 正規化: 最大 = 3×3×2.5 = 22.5
  const scoreA = A_total / 22.5;
  const scoreB = B_total / 22.5;

  return {
    scoreA: round1(scoreA * 100) / 100,
    scoreB: round1(scoreB * 100) / 100,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
  };
}
```

### 廃止する要素

| 廃止 | 理由 |
|------|------|
| `B_killed` / `A_killed` (Set) | 二値キル判定 → matchupValue の連続値に包含 |
| `calcKillPressure()` | eKoN→連続値変換 → matchupValue の倍率に包含 |
| `A_totalDmg` / `B_totalDmg` | 確3+の打点 → 実戦無意味。matchupValue が 0 で正しく無視 |
| 4要素の重み (0.35/0.25/0.20/0.20) | 要素が1つに統合されたため重み調整不要 |
| `pairKills()` (旧 ADR-003 案) | matchupValue の劣化再実装だったため不採用 |

---

## 7. パイプライン全体フロー (13フェーズ)

### 設計思想

パイプラインは **「広く探索 → 構造的に絞り込み → 深く研磨」** の3段階で構成される。

1. **広い探索** (Phase 1-4): ランダム20,000チーム生成で解空間を広くカバー。
   「見落とし」を減らすための量的アプローチ。
2. **構造的絞り込み** (Phase 5-7): 3-Core評価で**強い3体コア**を特定し、
   コアシード構築を生成。ランダム探索が見つけにくいシナジーのある構成を補完。
3. **深い研磨** (Phase 8-13): 上位チームの弱点を特定し、
   脅威を解消できるメンバーへの入れ替えで構築を最適化。
   行き止まりを早期検出して研磨予算を有望な構成に集中させる。

各フェーズの存在理由: ランダム探索だけでは強いコアを見つけにくく、
コアシードだけでは意外な補完を見つけにくい。研磨なしでは局所最適に留まる。
三者の組み合わせが**探索の広さと深さの両立**を実現する。

### アーキテクチャ

```
home-data/analyzer/
  team-matchup.ts          # メインオーケストレーター (async, worker_threads並列)
  team-matchup-core.ts     # 共有純粋関数 (evaluate3v3, selectTeam, etc.)
  team-matchup-worker.ts   # ワーカースレッド (matchups/cores タスク)
```

並列化: `worker_threads` で CPU バウンドなフェーズ (4, 5, 7, 8, 9-11, 13) を並列実行。
デフォルト: `--workers <CPUコア数, 最大10>`

### 構築禁止リスト (Build-Banned)

特定ポケモンをチーム構築から除外するが、対戦相手プール・脅威分析・出力JSONには残す。
例: Palafin-Hero (デフォルトフォルムがMightyでないため先発以外不可)

```typescript
const TEAM_BUILD_BANNED = new Set(["Palafin-Hero"]);
const buildPool = expandedPool.filter(p => !TEAM_BUILD_BANNED.has(p.name));
```

### フェーズ概要

```
[1/13] Pool building
       singles-ranking出力からビルドロード → メガ分離 → 拡張プール (~257エントリ)
       品質ゲート: 技数 < 2 の個体を除外
       build-banned ポケモンを構築プールから分離
                 ↓
[2/13] ダメージ行列計算
       257×257×平均3.5技 ≈ 252,000回 → DamageMatrix + SimEnv
                 ↓
[3/13] 構築生成 (モンテカルロ)
       20,000チーム × 6体 (アイテム排他 + 種族排他 + 役割検証 + build-banned除外)
       roleScore < 25 のメンバーがいるチームは棄却
                 ↓
[4/13] ラウンドロビン評価 (並列)
       各チーム vs ランダム200対戦相手 → selectTeam + evaluate3v3
       対戦相手は build-banned 含む全チームプール
                 ↓
[5/13] 3-Core メタ評価 (並列)
       メタ代表 150 チーム抽出 → 全有効3体コンボ (~2.4M) を評価
       → 上位200コア + ポケモン別コア統計
                 ↓
[6/13] コアシード構築生成
       上位100コア × 各20バリアント = ~2,000チーム
       scoreCandidateByCore() で補完メンバーを選択
                 ↓
[7/13] コアシード構築評価 (並列)
       コアシードチーム × 200ゲーム
                 ↓
[8/13] 反復研磨 (8ラウンド, 並列)
       上位300チームの低選出メンバーを入れ替え
       R1: 全チーム研磨 + 行き止まり候補判定
       R2: 全チーム研磨 + 2R連続均等 → 確定行き止まり
       R3-5: 確定行き止まり除外 + 空き枠に新規候補投入
       R6-7: Dual-swap (<25%のペアを交換)
       R8:   最終研磨
       ★ 脅威指向候補選択 → §7c / 行き止まり検出 → §7d
                 ↓
[9/13] 再評価 (top 200 + 確定行き止まり × 1,000 games)
       上位200チーム + 確定行き止まりを呼び戻して大量対戦で安定化
                 ↓
[10-11/13] エリート研磨 + 最終再評価
       5ラウンドのエリート研磨 (top-200 + 100 diversity challengers)
       確定行き止まりは研磨スキップ、最終再評価には参加
       最終再評価: top 512 + 確定行き止まり × 1,000 games → WR安定化
       eliteOverrides で結果をOVERWRITE (マージではない)
                 ↓
[12/13] ランキング + 脅威分析 + ★行き止まり検出
       compositeScore = 0.6 × WR% + 0.4 × dominance でソート
       脅威プロファイル計算 → 行き止まり判定 → §7d参照
       topTeams (50) + deadEndTeams (WR<80%行き止まり) 分離
                 ↓
[13/13] 安定コア検出 + 網羅的探索
       4+メンバーが5+ラウンド連続でACE(≥30%選出)のチーム = 安定コア
       安定コアの残りスロットを全候補で網羅的に試行
       → stableCores + exhaustiveResults
                 ↓
Output: {date}-team-matchup.json
```

### 定数一覧

| 定数 | 値 | 用途 |
|------|-----|------|
| `DEAD_SEL_THRESHOLD` | 0.15 | 死に枠判定閾値 (選出率<15%) |
| `HARD_WEAK_THRESHOLD` | 0.10 | Tier1研磨閾値 (選出率<10%) |
| `ACE_THRESHOLD` | 0.30 | エース判定 (選出率≥30%) |
| `STABLE_STREAK_MIN` | 5 | 安定コア: 最小連続ラウンド数 |
| `STABLE_CORE_MIN_MEMBERS` | 4 | 安定コア: 最小エース数 |
| `REEVAL_GAMES` | 1000 | 再評価/エリート評価のゲーム数 |
| `FINAL_REEVAL_TOP_N` | 512 | 最終再評価対象チーム数 |
| `DIVERSITY_CHALLENGER_COUNT` | 100 | エリート評価の多様性チャレンジャー数 |
| `POST_REEVAL_REFINE_ROUNDS` | 5 | エリート研磨ラウンド数 |
| `DEAD_END_WR_THRESHOLD` | 0.80 | 行き止まり除外WR閾値 |
| `DEAD_END_USAGE_THRESHOLD` | 5.0 | 行き止まり判定: 未回答使用率合計の閾値 (%) |
| `DEAD_END_STABLE_ROUNDS` | 2 | 行き止まり確定に必要な連続均等選出ラウンド数 |
| `THREAT_BONUS_WEIGHT` | 2.0 | 脅威指向研磨: 脅威解消ボーナスの重み |

### 計算量見積もり (10ワーカー)

| フェーズ | 計算量 | 所要時間 |
|---------|--------|---------|
| ダメージ行列 | ~252,000回 calculate() | ~8s |
| 構築生成 | 20,000チーム | ~1s |
| ラウンドロビン | 4,000,000 matchups | ~10s |
| 3-Core評価 | ~2.4M × 150 reps | ~220s |
| コアシード+評価 | ~2,000 × 200 | ~1s |
| 反復研磨 (8R) | ~42,000 × 200 | ~290s |
| 再評価+エリート | ~512,000 + ~1.5M | ~120s |
| 安定コア+網羅 | ~10K combos × 500 | ~370s |
| **合計** | ~31M matchups | **~18分** |

---

## 7b. 3-Core メタ評価 (Phase 5) ★NEW

### なぜこのフェーズが必要か

ランダム生成 (Phase 3-4) は解空間を広くカバーするが、**シナジーのある3体コア**を
偶然見つけられるとは限らない。本フェーズは全有効3体コンボ (~2.4M通り) を
網羅的に評価し、ランダム探索では発見困難な強力コアを特定する。

これにより:

- Phase 6 のコアシード構築生成に**根拠のある骨格**を提供
- Phase 8 の研磨で候補をスコアリングする際の**評価基盤**を提供
- 実行間の結果安定性を高める (コアは毎回の実行で再現されやすい)

### メタ代表の抽出
Phase 4 の `teamSelections` から全チーム横断で3体選出パターンの頻度を集計。
上位100パターンを「メタ代表」として正規化した重み (合計=1) で使用。

### 3体コンボ列挙
- プールをbaseSpeciesでグループ化 (~200種族)
- 3重ループで全種族トリプルを列挙、各形態の組み合わせを展開
- 制約: **同種族不可** + **メガ最大1体** (selectTeamと同じ制約)
- 結果: ~2,436,000通り (257エントリ、57メガ持ち種のプールで)

### スコアリング
各コンボを100メタ代表に対して `evaluate3v3()` で評価:
- 勝ち: weight × 1.0、引分: weight × 0.5、負け: 0
- コンボスコア = 重み付き勝率 (0-1)

### 出力データ
- **topCores (200)**: 上位200の3体コア (メンバー、スコア、勝数)
- **pokemonCoreStats**: ポケモン別コア統計 (平均スコア、最大スコア、トリオ数、トップパートナー10体)
- **metaRepresentatives**: 評価に使用したメタ代表100チーム

### コアガイド精練への活用
死に枠入れ替え候補を `scoreCandidateByCore()` でランキング:
1. 候補Xと残り5体からC(5,2)=10ペアを生成
2. 各ペア + 候補で3体コンボ形成 (メガ制約チェック)
3. 各コンボを150メタ代表に対して evaluate3v3 で評価
4. 有効コンボのスコア平均 → 候補スコア
5. 上位候補のみフルシミュレーションに進む

---

## 7c. 脅威指向研磨 (Threat-Targeted Refinement) ★NEW

### 目的と意図

**解決する問題**: 従来の研磨は `scoreCandidateByCore()` のみで候補をランキングしていた。
このスコアは「メタ代表に対するトリオ勝率の平均」であり、チームの**具体的な未回答脅威**を考慮しない。
結果として、研磨で「平均的に強い」ポケモンが選ばれるが、そのチーム固有の弱点が放置される。

**達成すべき状態**: 研磨後のチームが、研磨前に存在した未回答脅威を解消している。
特に使用率の高い相手への未回答が優先的に解消される。

**手段**: 入れ替え候補を選ぶ際、チームの未回答脅威を解消できるポケモンに**ボーナスを与える**。
基本スコア (コアガイド) はそのまま維持し、脅威解消を加算する二段階スコアリング。
基本スコアを残すことで「脅威は解消するが全体的に弱い」候補が過度に優遇されることを防ぐ。

### アルゴリズム

#### Step 1: 未回答脅威の特定
入れ替え対象チームに対して `computeTeamThreatProfile()` を呼び出し、`unansweredOpponents` を取得。

```typescript
interface UnansweredThreat {
  opponentName: string;
  usagePct: number;       // 使用率 (ボーナス重み)
  theirBestKoN: number;   // 相手の最良KO数
  theirBestTarget: string; // 最も刺される味方
}
```

#### Step 2: 候補スコアリング
```typescript
function scoreTargetedCandidate(
  candidate, remaining, unanswered, metaReps, matrix, simEnv, megaCapable,
): { baseScore: number; threatBonus: number; answeredCount: number } {
  const baseScore = scoreCandidateByCore(candidate, remaining, metaReps, ...);

  let threatBonus = 0;
  let answeredCount = 0;
  for (const threat of unanswered) {
    if (meetsAnswerCriteria(candidate, threat.opponentName, oppSpeed, ctx)) {
      threatBonus += threat.usagePct;  // 使用率加重
      answeredCount++;
    }
  }
  return { baseScore, threatBonus, answeredCount };
}
```

#### Step 3: 最終スコア
```
finalScore = baseScore + THREAT_BONUS_WEIGHT × threatBonus
```
- `THREAT_BONUS_WEIGHT = 2.0` (脅威解消はコアスコアの2倍の重み)
- 同スコア時は `answeredCount` が多い方を優先

#### Step 4: フォールバック
未回答を解消できる候補がゼロの場合、`baseScore` のみでランキング (デグレードなし)。

### meetsAnswerCriteria の独立関数化

現在はクロージャとして `computeTeamThreatProfile()` 内部に定義されている。
研磨フェーズから呼び出すため、以下のコンテキスト引数を追加して独立関数に抽出:

```typescript
interface AnswerContext {
  matrix: DamageMatrix;
  simEnv: SimEnv;
  teamHasSand: boolean;
  teamHasSR: boolean;
  megaCapable: Set<string>;
}

function meetsAnswerCriteria(
  me: string, oppName: string, oppSpeed: number, ctx: AnswerContext,
): boolean { /* 既存ロジック移植 */ }
```

### AnswerContext は入れ替え後のチーム構成から算出する

`teamHasSand` や `teamHasSR` はチームメンバーの能力に依存する。
入れ替え対象メンバーが砂嵐起動者 (例: Tyranitar の Sand Stream) やステロ要員の場合、
入れ替え後にチーム能力が変わる。

```typescript
// ✗ 入れ替え前のコンテキストを使うと、砂嵐チップ込みの回答判定が不正確になる
const ctx = buildAnswerContext(currentMembers, ...);

// ✓ 入れ替え後のメンバーでコンテキストを再構築
const postSwapMembers = [...remaining, candidate];
const ctx = buildAnswerContext(postSwapMembers, matrix, simEnv, megaCapable);
```

`buildAnswerContext()` のコスト: メンバー6体の特性/技を走査するだけ (< 1μs)。

### 既知の制限: 入れ替えによる回答喪失

死に枠Aを候補Bに入れ替える際、Aが別の脅威への唯一の回答だった場合、
入れ替えで新たな未回答が生まれる可能性がある。

**現仕様ではこの回帰リスクをスコアリングに組み込まない。** 理由:

- 死に枠 = 選出率 < 15%。ほとんどの対戦で選出されていない
- 選出されないメンバーの「回答能力」は机上の空論である蓋然性が高い
- 回帰ペナルティを導入すると、低使用率の脅威への回答が死に枠を固定化してしまい、
  入れ替え自体が抑制される過剰補正になる
- 仮に回帰が発生しても、後続の再評価 (Phase 9, 11) でWRに反映されるため、
  致命的な回帰は最終ランキングで自然に排除される

将来的に「対面別選出率」を追跡できるようになれば、
「Dragapult 入り対面では選出率 80%」のようなケースを検出して
精密な回帰判定が可能になるが、現時点ではデータ不足のため見送る。

### 適用フェーズ

Phase 8 (反復研磨) の全ラウンド + Phase 10 (エリート研磨) に適用。

### 追加計算コスト

各ラウンド: 300チーム × ~10未回答 × 50候補 = ~150,000回 `meetsAnswerCriteria()`。
1回 < 1μs → ラウンドあたり < 0.2秒。**性能影響は無視できる**。

---

## 7d. 行き止まり検出 (Dead-End Detection) ★NEW

### なぜこの検出が必要か

**解決する問題**: 均等に選出される (全メンバー ≥ 15% 選出率) のに未回答がある構成は、
入れ替え対象メンバーがなく研磨で改善不能。にもかかわらず研磨枠を占有し続ける。

**達成すべき状態**:

1. 改善不能なチームを早期に識別し、研磨予算を有望な構成に集中させる
2. ただし改善不能でも勝率が高いチームは最終結果に含める (戦力外にはしない)
3. 使用率の低いニッチ相手への未回答は「重大な穴」とは見なさない

**手段**: 使用率加重で重大な穴のみを検出し、2ラウンドの安定性確認後に研磨から除外。
除外後は空き枠に新規候補を投入。最終再評価には呼び戻して公平に競わせる。

### 定義 (使用率加重)

単純な `unansweredCount > 0` では使用率圏外のニッチ相手への未回答だけで
行き止まり判定されてしまう。使用率加重で重大な穴のみを検出する:

```typescript
// 未回答の「重さ」= 未回答対面の使用率合計
const unansweredWeight = unansweredOpponents
  .reduce((sum, opp) => sum + opp.usagePct, 0);

deadEnd = (deadMemberCount === 0) && (unansweredWeight >= DEAD_END_USAGE_THRESHOLD)
```

- `deadMemberCount === 0`: 全メンバーの選出率 ≥ DEAD_SEL_THRESHOLD (15%)
- `unansweredWeight ≥ 5.0`: 未回答対面の使用率合計が 5% 以上
- 使用率 0.3% のニッチ相手のみ未回答 → `unansweredWeight = 0.3` → deadEnd **ではない**
- 使用率 TOP10 に穴 → `unansweredWeight >> 5.0` → deadEnd

### growthPotential との排他関係
- `growthPotential = (deadMemberCount > 0)` — 入れ替え可能な死に枠がある
- `deadEnd`: 上記定義 — 入れ替え不能かつ重大な未回答あり
- **排他**: `deadEnd` は `deadMemberCount === 0` を要求するため、両方 true にはならない

### 段階的行き止まり処理

行き止まりの検出と処理は **3段階** で行う:

#### Stage 1: 候補判定 (Phase 8, Round 1-2)

```
Round 1: 全上位チームを通常通り研磨
  → 各チームの deadEnd 候補フラグを計算
  → deadEnd候補 = deadMemberCount === 0 && unansweredWeight ≥ 5.0

Round 2: deadEnd候補チームの選出率安定性を確認
  → 2ラウンド連続で均等選出が安定 (全メンバー ≥ 15%) → 「確定行き止まり」
  → 1ラウンドだけ均等 → まだ候補のまま (環境変化で偏りが出る可能性)
```

**安定性チェックの根拠**: 研磨で他チームが入れ替わると対戦環境が変わり、
選出バランスが崩れて死に枠が発生する可能性がある。2ラウンド連続確認で偽陽性を防ぐ。

#### Stage 2: 研磨からの除外 (Phase 8, Round 3-8)

```
確定行き止まりチーム → 研磨プールから除外
  → 空いた枠に新規候補を生成 (コアシード or ランダム)
  → 新規候補は通常通り研磨対象
```

これは **「研磨ターンからの除外」** であり **「戦力外通告」ではない**。
行き止まりチームは一切変更されず、現在の状態のまま保存される。

#### Stage 3: 最終決戦への呼び戻し (Phase 9-11)

```
Phase 9 (再評価):
  確定行き止まりチーム → 再評価プールに呼び戻し
  → 研磨後の新環境 (入れ替わったチーム群) に対して1000ゲーム再評価

Phase 10-11 (エリート研磨 + 最終再評価):
  確定行き止まりチーム → 研磨はスキップ、最終再評価には参加
```

#### Stage 4: 最終ランキング (Phase 12)

```
1. 全 reEvaluatedTeams を compositeScore でソート
2. 各チームの deadEnd フラグを最終WRベースで再計算
3. deadEnd && winRate < 0.80 → deadEndTeams に振り分け
4. deadEnd && winRate ≥ 0.80 → topTeams に残留 (deadEnd: true)
5. 残りから TOP_N_TEAMS (50) を切り出し → topTeams
```

### フロー図

```
Phase 8 R1:  [300 teams] → 研磨 → deadEnd候補を特定
Phase 8 R2:  [300 teams] → 研磨 → 2R連続均等 → 確定行き止まり (N teams)
Phase 8 R3+: [300-N teams + N新規] → 研磨 (行き止まりは除外)
  :
Phase 9:     [top 200 + 確定行き止まり] → 再評価 (1000 games)
Phase 10:    [top 200 + challengers] → エリート研磨 (行き止まりはスキップ)
Phase 11:    [top 512 + 確定行き止まり] → 最終再評価 (1000 games)
Phase 12:    WR < 80% 行き止まり → deadEndTeams / WR ≥ 80% → topTeams残留
```

### ビューア表示
- **matchup viewer**: ランク番号の横に赤い ■ アイコン + ツールチップ「行き止まり」
- **moves viewer**: 同上
- **deadEndTeams**: ビューアには表示しない (JSON出力のみ)

---

## 8. 出力JSON

### パス
`home-data/storage/analysis/{date}-team-matchup.json`

### 型定義

```typescript
// home-data/types/team-matchup.ts

interface TeamMatchupResult {
  generatedAt: string;
  format: string;
  config: {
    totalTeams: number;
    gamesPerTeam: number;
    poolSize: number;             // 拡張プールサイズ (~257)
    poolFiltered?: number;        // 品質フィルタで除外した数
    teamsRejected?: number;       // 役割検証で棄却した数
  };
  pool: PoolMember[];
  damageMatrix: DamageMatrix;
  topTeams: RankedTeam[];          // TOP 50
  deadEndTeams?: RankedTeam[];     // ★NEW: 行き止まり (WR<80%) チーム → §7d参照
  pokemonStats: PokemonTeamStats[];
  topCores?: CoreRanking[];
  pokemonCoreStats?: PokemonCoreStats[];
  metaRepresentatives?: MetaRepresentative[];
}

interface DamageMatrixEntry {
  bestMove: string;
  minPct: number;
  maxPct: number;
  koN: number;                   // 1=OHKO, 2=2HKO, ...; 0=4発以内KO不可
  koChance: number;              // 0.0-1.0
  effectiveness: number;         // タイプ相性倍率
  isContact: boolean;            // bestMoveが接触技か
  chipPctToAttacker: number;     // 攻撃側HP%ダメ/hit (ゴツメ/鉄のトゲ: 12.5)
  weatherChipToDefender: number; // 砂嵐チップ 6.25 (非免疫時)
  priorityMaxPct: number;        // 先制技の最大ダメージ%
  priorityKoN: number;           // 先制技のKO打数
  priorityKoChance: number;      // 先制技のKO確率
  recoilPctToSelf: number;       // bestMoveの反動ダメージ (攻撃側HP%)
}

interface RankedTeam {
  rank: number;
  teamId: string;
  members: string[];
  winRate: number;
  wins: number;
  losses: number;
  draws: number;
  avgScore: number;
  /** 0.6 × WR% + 0.4 × dominance — 正規ランキングスコア */
  compositeScore: number;
  commonSelections: SelectionPattern[];        // TOP 5 選出パターン
  memberSelectionRates: MemberSelectionRate[];  // メンバー別選出率
  deadMemberCount: number;                      // 死に枠数 (選出率 < 15%)
  /** 死に枠あり (deadMemberCount > 0) → 入れ替えで改善余地 */
  growthPotential: boolean;
  /** 均等選出 (deadMemberCount === 0) かつ未回答使用率合計 ≥ 5% → 改善不能 → §7d参照 */
  deadEnd: boolean;
  typeProfile: {
    offensiveTypes: string[];
    defensiveWeaks: string[];
  };
  threatProfile?: ThreatProfile;
}

/** 脅威レベル分類 */
type ThreatLevel = "low" | "medium" | "high" | "critical";

/** 個別対面の脅威エントリ */
interface ThreatEntry {
  opponent: string;
  usagePct: number;            // 相手の使用率
  threatLevel: ThreatLevel;
  ourBestKoN: number;          // 味方最善のKO打数
  ourBestMember: string;       // 最も打点のある味方
  theirBestKoN: number;        // 相手の最善KO打数
  theirBestTarget: string;     // 最も刺される味方
  hasAnswer: boolean;          // meetsAnswerCriteria() を満たす味方がいるか
}

/** チームの脅威プロファイル (全プール対面の集約) */
interface ThreatProfile {
  killPressure: number;        // 0-100: 殺意 (味方→相手の突破力)
  threatResistance: number;    // 0-100: 脅威耐性 (相手→味方の安全度)
  answerRate: number;          // 0-100: 使用率加重回答率
  dominanceScore: number;      // 0-100: 支配度 (compositeScore計算に使用)
  criticalThreats: number;     // critical レベル対面の数
  highThreats: number;         // high レベル対面の数
  unansweredCount: number;     // 未回答対面の総数
  unansweredWeight: number;    // 未回答対面の使用率合計 (§7d判定基準)
  criticalGaps: number;        // TOP10使用率で回答なしの数
  topThreats: ThreatEntry[];   // 上位5件の危険対面
}

interface CoreRanking {
  members: string[];           // ソート済み3体名
  score: number;               // 重み付き勝率 (0-1)
  winCount: number;            // 勝利メタ代表数 (未加重)
  totalReps: number;
}

interface PokemonCoreStats {
  name: string;
  avgCoreScore: number;
  maxCoreScore: number;
  trioCount: number;
  topPartners: { name: string; avgScore: number; count: number }[];
}

interface MetaRepresentative {
  members: string[];
  weight: number;              // 正規化頻度 (合計=1)
  frequency: number;           // 生観測回数
  winRate: number;
}

interface MemberSelectionRate {
  name: string;
  selectionRate: number;       // 選出率 (0-1)
  winRateWhenSelected: number; // 選出時勝率 (0-1)
}

interface SelectionPattern {
  members: string[];
  frequency: number;
  winRate: number;
}

interface PokemonTeamStats {
  name: string;
  pickRate: number;            // TOP50チーム中の採用率
  selectionRate: number;       // チーム内選出率
  winRateWhenSelected: number;
  commonPartners: { name: string; count: number }[];
}
```

### フィールド関係図

```
compositeScore = 0.6 × (winRate × 100) + 0.4 × dominanceScore
growthPotential ←→ deadEnd は排他:
  growthPotential = (deadMemberCount > 0)        → 入れ替え余地あり
  deadEnd = (deadMemberCount === 0) && (unansweredWeight ≥ 5.0) → 改善不能
  unansweredWeight = threatProfile.unansweredWeight = Σ unanswered opponents' usagePct
```

---

## 9. ビューア

### ファイル構成
```
home-data/viewer-matchup/
  main.tsx
  App.tsx
  components/
    MatchupToolbar.tsx     # ソート・検索・言語切替
    TeamRankList.tsx        # 左パネル: 構築ランキング
    TeamDetail.tsx          # 右パネル: 構築詳細+選出
    SelectionSimulator.tsx  # 選出シミュレータ (対戦相手指定)
    DamageMatrixView.tsx    # ダメージ行列表示 (ヒートマップ)
    PokemonStatsView.tsx    # ポケモン別統計
matchup.html               # HTMLエントリ
```

### UI構成

```
┌──────────────────────────────────────────────────────────┐
│ [ソート: 勝率/スコア] [検索] [JP/EN]                      │
├───────────────┬──────────────────────────────────────────┤
│ #1 勝率78.5%  │ ■ チーム #1                              │
│ 🐉🗡️⚔️🛡️🔥💧│                                          │
│               │ ┌────────────────────────────┐           │
│ #2 勝率76.2%  │ │ Great Tusk / Kingambit /   │           │
│ 🐉⚔️🛡️💧🔥⚡│ │ Gholdengo / Iron Valiant / │           │
│               │ │ Darkrai / Dragonite        │           │
│ #3 勝率75.1%  │ └────────────────────────────┘           │
│               │                                          │
│ #4 ...        │ ■ よく出る選出パターン                     │
│               │   1. Great Tusk + Kingambit + Gholdengo  │
│               │      45回 (勝率82%)                      │
│               │   2. Dragonite + Kingambit + Iron Valiant│
│               │      32回 (勝率75%)                      │
│               │                                          │
│               │ ■ 対面表 (ヒートマップ)                   │
│               │      GT  KG  GH  IV  DK  DN             │
│               │  GT  --  45  78  92  67  55              │
│               │  KG  32  --  56  71  88  42              │
│               │  ...                                     │
│               │                                          │
│               │ ■ 選出シミュレータ                        │
│               │   相手: [___][___][___][___][___][___]    │
│               │   → 推奨選出: GT + KG + GH               │
│               │   → 評価スコア: 0.72 (有利)              │
└───────────────┴──────────────────────────────────────────┘
```

### 対面表 (ヒートマップ)
チーム6体×相手6体のダメージ行列をヒートマップで表示。
- **色**: 緑=有利(高ダメ出せる), 赤=不利(高ダメ受ける)
- **値**: maxPct% or KO確定数

### 選出シミュレータ
ユーザーが任意の相手6体を指定 → 選出アルゴリズムを実行 → 推奨3体を表示。
ダメージ行列はJSON内に含まれているため、ブラウザ上で即座に計算可能。

---

## 10. ビルド設定

### vite.config.ts
```typescript
entry === "matchup" → "matchup.html"
```

### package.json
```json
"home:matchup": "tsx home-data/analyzer/team-matchup.ts",
"build:matchup": "cross-env VITE_ENTRY=matchup vite build && node scripts/rename-build.mjs matchup"
```

### tsconfig.app.json
`include` に `"home-data/viewer-matchup/**/*"` を追加

---

## 11. 実装順序

| # | タスク | ファイル | 依存 |
|---|--------|---------|------|
| 1 | 型定義 | NEW: `home-data/types/team-matchup.ts` | - |
| 2 | パイプライン本体 | NEW: `home-data/analyzer/team-matchup.ts` | #1 |
| 3 | パイプライン実行・JSON検証 | - | #2 |
| 4 | ビルド設定 (vite, package, tsconfig, html) | MODIFY + NEW | - |
| 5 | ビューアApp + 全コンポーネント | NEW: `home-data/viewer-matchup/` | #3,4 |
| 6 | ビルド・動作確認 | `npm run build:matchup` | #5 |

---

## 12. 検証方法

1. **ダメージ行列**: 既知ペアのダメージ値が `singles-ranking.ts` の結果と一致
2. **選出**: 人間が「こう選出するだろう」と思うケースと一致するか目視確認
3. **構築ランキング**: 使用率の高いポケモンが多い構築ほど上位に来る傾向があるか
4. **再現性**: 同じシードで実行した場合に同一結果が得られるか

---

## 13. 技一貫性ビューア (Move Consistency Viewer)

### 概要
構築・選出分析の拡張として、個体/チーム/脅威の3モードで技レベルのダメージ分析を提供する。
ダメージ行列の事前計算データではなく、`calculate()` エンジンをブラウザ上でオンザフライ実行する。

### ファイル構成
```
home-data/viewer-moves/
  App.tsx                        # 3モードRouter (individual/team/threat)
  main.tsx                       # エントリポイント
  moveCalc.ts                    # ダメージ計算ラッパー + 脅威分析ロジック
  components/
    MoveConsistencyToolbar.tsx    # モードタブ + 検索 + 言語/ダーク切替
    PokemonSidebar.tsx           # 個体モード: overallScore降順リスト
    TeamSidebar.tsx              # チームモード: 勝率降順リスト
    MoveConsistencyDetail.tsx    # 個体モード右パネル: 技別×相手ダメージ
    TeamMoveDetail.tsx           # チームモード右パネル: 6体展開+MoveMatrix
    MoveMatrix.tsx               # 技×相手マトリクス (色分け付き)
    OpponentSelector.tsx         # 6スロット個別相手選択 (チームクイックロード付き)
    ThreatAnalysis.tsx           # 脅威分析モード (4セクション)
moves.html                      # HTMLエントリ
```

### ビルド
```bash
npm run build:moves   # → build/moves.html (viteSingleFile, ~658KB)
```

### 3つのモード

#### Mode 1: Individual (個体分析)
- 左サイドバー: プール全ポケモン (overallScore降順、検索可)
- 右パネル: 選択ポケモンの全技 × 指定相手6体のダメージマトリクス
- OpponentSelectorで相手を自由入力 or Top50チームからクイックロード

#### Mode 2: Team (チーム分析)
- 左サイドバー: Top50チーム (勝率降順)
- 右パネル: 選択チームの6体を展開、各メンバーのMoveMatrixを表示
- OpponentSelectorで相手を自由入力 (他チームのクイックロード対応)
- チーム全体のカバレッジサマリー表示

#### Mode 3: Threat (脅威分析)
- サイドバーなし (チーム選択はパネル内ドロップダウン)
- デフォルト: #1チームを「自構成」として分析
- 4セクション構成:

##### Section 1: 危険な技と回答 (Dangerous Moves & Answers)
味方3体以上に等倍以上で20%以上のダメージを与える技を検出。
各技に対してチーム内に「回答」があるかを判定。

**回答チェックロジック (`findAnswer`)**:
相手の全4技を考慮した完全1v1対面評価:
1. **無効受け (immune_threat)**: 危険技が無効 + 相手のカバー技でOHKOされない + (1v1勝利 or 2HKO可 or 相手3HKO以上)
2. **半減受け (resist_threat)**: 危険技を半減 + 相手の全技考慮で1v1勝利必須
3. **上から確1 (outspeed_ohko)**: 先手取れて確1 (リベンジキル)

1v1勝利判定: `outspeeds ? ourKoN <= theirKoN : ourKoN < theirKoN`

**回答率 (Answer Rate)**: 回答ありの危険技数 / 全危険技数 (%)

##### Section 2: 脅威ランキング (Threat Ranking)
プール全ポケモンを脅威度順にソート。

脅威度分類:
- **CRITICAL**: 味方最善確3以上 AND 相手確2以下
- **HIGH**: 味方確3以上 OR (相手確2 AND 相手先手)
- **MEDIUM**: 味方確2
- **LOW**: 味方確1

##### Section 3: カバレッジギャップ (Coverage Gaps)
18タイプを走査し、チーム全体でSE技がないタイプを特定。
該当タイプのプール内ポケモンも表示。

##### Section 4: 厳しいチーム構成 (Dangerous Teams)
Top50チームに対する脅威度を `computeTeamThreat()` で評価。
difficulty 0-100スコア + 最も問題のあるマッチアップペアを表示。

### 型定義 (moveCalc.ts)

```typescript
type ThreatLevel = "low" | "medium" | "high" | "critical";

interface ThreatResult {
  opponent: PoolMember;
  ourBest: { member: string; move: string; maxPct: number; koN: number };
  theirBest: { move: string; target: string; maxPct: number; koN: number };
  speedMatchup: "faster" | "slower" | "tie";
  threatLevel: ThreatLevel;
}

interface ThreatAnswer {
  member: string;
  reason: "outspeed_ohko" | "resist_threat" | "immune_threat";
  ourDmg: number;
  ourKoN: number;
}

interface DangerousMove {
  user: string; move: string; moveType: string;
  targets: { name: string; maxPct: number; koN: number }[];
  ohkoCount: number;
  answer: ThreatAnswer | null;
}

interface ThreatAnalysisResult {
  threats: ThreatResult[];
  coverageGaps: string[];
  dangerousMoves: DangerousMove[];
  uncoveredCount: number;
  answerRate: number;     // 0-100
}

interface TeamThreatResult {
  threats: ThreatResult[];
  overallDifficulty: number;  // 0-100
  worstMatchups: { ours: string; theirs: string; theirDmg: number }[];
}
```

### 計算量
- 脅威分析: 49体 × (6味方×4技 + 4相手技×6味方) ≈ 2,400計算 → 1秒未満
- ブラウザ上で `calculate()` をリアルタイム実行 (事前計算不要)

---

## 14. 既知の差異: matchup viewer vs moves viewer の「未回答」

matchup viewer と moves viewer は同じ構築データを表示するが、「未回答」の定義が**根本的に異なる**。
両者は異なる観点からの脅威分析であり、いずれも有用な情報を提供する。**統一は行わない。**

### matchup viewer の未回答 (per-opponent)

**定義**: 「この相手ポケモンに対して、味方に回答がいるか？」

- **実装**: `computeTeamThreatProfile()` → `meetsAnswerCriteria()` (team-matchup.ts)
- **評価単位**: 相手ポケモン1体 (プール全体 ~257体を走査)
- **回答判定** (`meetsAnswerCriteria`):
  1. 味方の best move が相手を effective KO できる (chipダメージ込み)
  2. 味方が相手から OHKO されない (砂嵐/ステロ/反動/接触チップ考慮)
  3. 味方が相手より速い、または相手の攻撃を耐えて反撃可能
  4. メガ競合チェック: 同チームの他のメガと同時選出できるか
- **チップダメージの考慮**:
  - 砂嵐 (6.25%/turn, 非免疫のみ)
  - ステルスロック (SR, チーム能力次第)
  - 接触技ダメージ (ゴツメ/鉄のトゲ 12.5%)
  - 反動ダメージ (攻撃側HP%)
- **出力**: `ThreatProfile.unansweredCount` (例: "未回答 3体")
- **使用箇所**: パイプライン Phase 12 のランキング + §7c 脅威指向研磨

### moves viewer の未回答 (per-dangerous-move)

**定義**: 「この危険な技に対して、味方に回答がいるか？」

- **実装**: `computeFullThreatAnalysis()` → `findAnswer()` (moveCalc.ts)
- **評価単位**: 危険な技 (味方3+体に等倍以上で20%以上のダメージ)
- **回答判定** (`findAnswer`):
  1. **無効受け (immune_threat)**: 危険技が無効 + カバー技で OHKO されない + 1v1有利 or 2HKO可
  2. **半減受け (resist_threat)**: 危険技半減 + 相手の全技考慮で1v1勝利
  3. **上から確1 (outspeed_ohko)**: 先手 + OHKO (リベンジキル)
  4. 1v1勝利判定: `outspeeds ? ourKoN ≤ theirKoN : ourKoN < theirKoN`
- **技単位の分析**:
  - 1体が複数の危険技の発信源になりうる (例: Excadrill の Earthquake と Iron Head)
  - 各危険技ごとに独立した回答が必要
  - ブラウザ上で `calculate()` をフル実行 (事前計算の行列ではなく、全ビルドバリアントを考慮)
- **出力**: `uncoveredCount` (例: "未回答 5技")
- **使用箇所**: moves viewer の脅威分析モード (ブラウザ上のみ)

### 差異の具体例

| チーム | matchup 未回答 | moves 未回答 | 理由 |
| ------ | -------------- | ------------ | ---- |
| #1 | 3体 | 1技 | matchup: 3体の相手ポケモンに個別回答なし。moves: 危険技1つのみ未回答 |
| #2 | 0体 | 4技 | matchup: 全相手に回答あり。moves: 広範囲技が複数未回答 |

### 統一しない理由

1. **計算コストの差**: `findAnswer()` はブラウザ上でフル `calculate()` を実行するため、パイプラインの257体×6体走査には重すぎる
2. **分析軸が異なる**: per-opponent は「誰に弱いか」、per-move は「何の技に弱いか」
3. **両者とも有用**: matchupの回答は研磨の指針に最適 (候補選定)、movesの回答はプレイヤーへの情報提供に最適 (実戦での注意点)
4. **パイプラインは matchup 定義を使用**: 脅威指向研磨 (§7c) と行き止まり検出 (§7d) は `meetsAnswerCriteria()` ベース

---

## Appendix A: 仕様決定記録 (ADR)

設計判断の経緯・根拠・帰結を記録する。各エントリは以下の形式に従う:

```
### ADR-{番号}: {タイトル}
- **日付**: YYYY-MM-DD
- **ステータス**: 採用 / 棄却 / 保留 / 採用→要修正
- **背景**: 何が問題だったか、どういう文脈で判断が必要になったか
- **決定**: 何をどうすることに決めたか
- **根拠**: なぜその決定に至ったか
- **帰結**: この決定によって生じる影響・制約・リスク
- **未解決事項**: 決定後に判明した課題（後から追記可）
```markdown

### ADR-001: メガ枠上限の撤廃

- **日付**: 2026-04-14
- **ステータス**: 採用→要修正
- **背景**: 元の仕様では `MAX_MEGAS_PER_TEAM = 2`（1構築に最大2メガ）としていた。
  しかしメガ進化ポケモンは個体パワーが高く、1体で広範な相手を処理できるため、
  選出幅を狭めてでも成立する高メガ構成が存在する可能性があった。
- **決定**: チーム構築時のメガ数上限を撤廃し、何体でもメガを採用可能とした。
  選出時の排他制約（1戦で最大1メガ）はゲームルールとして維持。
- **根拠**: メガ1体1体が補完しきれる範囲が大きく、たとえば4メガ+2非メガ構成で
  非メガ2体は固定選出、メガ4体から対面に最適な1体を選ぶ戦略が成立しうる。
  上限を設けると、このような構成が探索空間から排除されてしまう。
- **帰結**:
  - TOP50の80%が3メガ以上の構成になった（3メガ: 20チーム、4メガ: 20チーム）
  - 選出率0-2%の「死にメガ」が大量発生（TOP50中41メンバーが選出率<1%）
  - 研磨フェーズが `scoreCandidateByCore()` でメガ候補を高評価するため、
    補完枠としてメガが投入されるが、既存の強メガに選出競合で負けて永久に選出されない
- **未解決事項**:
  1. **研磨のメガ選出競合チェック**: `scoreCandidateByCore()` はトリオ勝率で候補を
     評価するが、チーム内の他メガとの選出競合を考慮しない。候補がメガの場合、
     既存メガとの attackerScore 比較を行い、選出される見込みがない候補を除外すべき
  2. **脅威分析のメガ競合調整**: `calculateThreatProfile()` のメガ競合調整
     （L1713-1720）は `megaExclusiveAnswers` の最小値のみ減算しており、
     3-4メガ構成では不十分。実際に選出可能な1メガのみの回答能力で再計算すべき
  3. → ADR-002 で attackerScore の根本改修を決定。実装後に上記1,2の必要性を再評価する

### ADR-002: attackerScore 速度加重キル評価への改修

- **日付**: 2026-04-14
- **ステータス**: 採用（実装済み）
- **背景**: メガ枠上限撤廃 (ADR-001) 後、TOP50で選出率0%のメガが大量発生。
  調査の結果、`attackerScore` が OHKO と 2HKO を二値 (kills=1) で同一視し、
  速度関係を無視していたことが根本原因と判明。

  具体例: Team #2 (4メガ構成) vs 水タイプ6体
  - Ampharos-Mega: 5体OHKO、avgDmg=126 → score=1.104
  - Golurk-Mega: 1体OHKO/5体2HKO、avgDmg=90 → score=0.961
  - 差はわずか **0.143**。水相手ではAmpharosが圧倒的に優れるのに、
    非水対面の平均ダメージ差で逆転され、Ampharosの選出率は0%。

  実戦では:
  - **後攻1HKO×6一貫**: 毎回被弾、3体で3回被弾 → 生存不可能
  - **先行1HKO×2**: 被弾0で2体処理、HP温存して3体目へ → 継続戦闘力で圧倒
  この差が `kills=1` の二値評価では完全に消失していた。
- **決定**: attackerScore を速度加重キル評価 `matchupValue` に置換する。
  §5 Step 1 に新仕様を記載。主要パラメータ:
  - 先行1HKO: 2.5 / 後攻1HKO: 1.3 / 先行2HKO: 1.0 (基準) / 後攻2HKO: 0.3
  - 先制技1HKO: 2.5 (速度不問)
  - 3HKO以上: 0
  - SECONDARY_ATTACKER_THRESHOLD: 0.3 → 0.4 に調整
- **根拠**:
  1. OHKO→被弾0、2HKO→被弾1の差は「継続戦闘能力」に直結する
  2. 先後関係は被弾回数を決定する最重要ファクター
  3. 基準点を先行2HKO=1.0とし、先行1HKO=2.5で約2.5倍の価値差をつけることで、
     スペシャリストが得意対面で正しくACEに選出される
  4. `evaluate3v3` は既にOHKO重み(0.25)を持つが、選出アルゴリズムには未反映だった
- **帰結**:
  - 対面ごとに最適なメガが選出されるようになり、多メガ構成の真価が発揮される
  - メタ収束に対するジェネラリスト偏重が緩和される
  - ウェイト値は仮設定。パイプライン実行後に結果を見て調整する
- **変更箇所**:
  1. `team-matchup-core.ts`: `selectTeam()` に `poolSpeeds` 引数追加、
     `matchupValue()` / `attackerScore()` を新実装
  2. `team-matchup-worker.ts`: `selectTeam()` 呼び出しに `simEnv.poolSpeeds` を渡す
  3. 定数 `SECONDARY_ATTACKER_THRESHOLD`: 0.3 → 0.4
- **変更しない箇所**:
  - `complementScore()`: 防御的補完の評価。attackerScoreとは独立
  - `scoreCandidateByCore()`: コア研磨はトリオ勝率ベース。独立
- **未解決事項**:
  1. → ADR-003 で `evaluate3v3()` を `matchupValue` 統一方式に改修決定。
     ADR-002 時点では `evaluate3v3` を「変更しない」としていたが誤りだった:
     `selectTeam` は `matchupValue` で速度加重評価するのに `evaluate3v3` は速度を無視しており、
     「良い選出が勝率に反映されない」乖離が発生していた。
     ADR-003 で `evaluate3v3` にも同じ `matchupValue` を適用し、評価基準を統一する。

### ADR-003: evaluate3v3 の matchupValue 統一

- **日付**: 2026-04-14
- **ステータス**: 採用（実装待ち）→ 改訂 2026-04-14
- **背景**: ADR-002 で `selectTeam` に速度加重キル評価 (`matchupValue`) を導入した。
  しかし `evaluate3v3` は速度を一切考慮せず、静的な kill count / kill pressure /
  survive rate / avgDmg の4要素モデルでスコアリングしていた。
  この結果、以下の乖離が発生:

  **問題の具体的な現れ方**:
  - Team #2 (WR=57%): Rampardos が selectTeam で 94% 選出されるが、WR 58%
    - matchupValue 上は高スコア (多くの相手をOHKO可能)
    - しかし evaluate3v3 では Rampardos が先に倒されるケースも同等に評価される
    - 相互確1の対面で、先行側が一方的に1-0交換する実戦を evaluate3v3 が引き分け扱い
  - Top 15 で Dead=0 チームのWRが 48-57% (ほぼコインフリップ)
  - `selectTeam` の速度加重判断と `evaluate3v3` の無速度判断が **別のゲームを評価** している

  **核心的な乖離**:
  ```
  selectTeam: "先行確1は2.5点、後攻確1は1.3点 → 先行側を優先選出"
  evaluate3v3: "相互確1 → 両側ともkills+1、killPressure加算 → ほぼ同スコア"
  ```
  selectTeam が "先行側有利" と判断して選出しても、evaluate3v3 がその有利さを反映しない。

- **初期案と棄却理由**:
  初期案では `pairKills()` 関数を新規作成し、ペア別に boolean
  `{aKillsB, bKillsA}` を返す方式を検討した。しかしこれは
  `matchupValue` が既に持つ速度・確定数ロジックを **二値に劣化させて再実装** しているに過ぎず、
  以下の理由で棄却:
  1. matchupValue は連続値 (0〜2.5) で先行確1=2.5 / 後攻確2=0.3 の8倍差を表現するが、
     pairKills は両者とも `true` に潰れ、キル品質の差が消失する
  2. 同じ速度判定ロジックを2関数で重複管理する保守コスト
  3. 4要素の重み (0.35/0.25/0.20/0.20) が新たなチューニング変数を生む

- **決定**: `evaluate3v3` の4要素モデルを廃止し、既存の `matchupValue()` を
  全ペアに適用した合計スコアで勝敗を判定する。
  新規関数は作成せず、`matchupValue` のシグネチャにオプショナル引数
  `defenderChipPct` を追加するのみ。

- **仕様**: §6 に全コード記載。要点:

  #### 1. matchupValue シグネチャ拡張

  evaluate3v3 では SR/天候 chip で実効確定数が変化するため、
  `defenderChipPct?: number` を追加。chip > 0 なら `adjustedEKoN` を使用。

  ```typescript
  export function matchupValue(
    me: string, opp: string,
    matrix: DamageMatrix, poolSpeeds: Map<string, number>,
    defenderChipPct?: number,  // ★ 追加。省略時は 0 (従来動作)
  ): number {
    const entry = matrix[me]?.[opp];
    if (!entry) return 0;
    const eKoN = defenderChipPct && defenderChipPct > 0
      ? adjustedEKoN(entry, defenderChipPct)
      : effectiveKoN(entry);
    // ... 以降は既存ロジック (速度判定+倍率テーブル) 変更なし
  }
  ```

  **後方互換**: `selectTeam` → `attackerScore` の呼び出しは引数変更なし。

  #### 2. evaluate3v3 の改修

  ```typescript
  // 旧: 4要素 (kills Set, killPressure, survive Set, avgDmg) + 重み
  // 新: matchupValue 合計の比較
  let A_total = 0, B_total = 0;
  for (const a of selA) {
    for (const b of selB) {
      A_total += matchupValue(a, b, matrix, env.poolSpeeds, chipFor(b, srFromA));
      B_total += matchupValue(b, a, matrix, env.poolSpeeds, chipFor(a, srFromB));
    }
  }
  const scoreA = A_total / 22.5;  // max = 3×3×2.5
  const scoreB = B_total / 22.5;
  ```

  #### 3. 廃止する要素

  | 廃止 | 理由 |
  |------|------|
  | `B_killed` / `A_killed` (Set) | 二値キル判定 → matchupValue の連続値に包含 |
  | `calcKillPressure()` (evaluate3v3内のみ) | eKoN→連続値変換 → matchupValue の倍率に包含 |
  | `A_totalDmg` / `B_totalDmg` | 確3+の打点 → 実戦無意味。matchupValue が 0 で正しく無視 |
  | 4要素の重み (0.35/0.25/0.20/0.20) | 要素統合により不要 |
  | `pairKills()` (初期案) | 設計段階で棄却。実装なし |

  **注**: `calcKillPressure()` 自体は他で使用される場合は残置。evaluate3v3 内での使用を廃止。

- **根拠**:
  1. matchupValue は速度・確定数・先制技を連続値で統合済み。evaluate3v3 が同じ関数を
     使うことで、selectTeam と evaluate3v3 が **同一の物差し** で対面を評価する
  2. 新規関数不要 — 既存のテスト済みコードを再利用し、保守コストを増やさない
  3. 4要素の重み調整が不要になり、チューニング変数が減少
  4. chip 対応は `adjustedEKoN` への委譲のみ。matchupValue 内の速度判定ロジックは不変
  5. 計算量: evaluate3v3 内の matchupValue 呼び出しは 9 ペア。性能影響なし

- **帰結**:
  - selectTeam と evaluate3v3 が同じ評価基準で動作 → 「良い選出が勝率に反映されない」問題が原理的に解消
  - 先行確1 (2.5) と後攻確2 (0.3) の8倍差がスコアに直接反映 → 高速チームのWRが適正化
  - Rampardos のような中速高火力が、速度負けする対面で適切に減点される
  - WR 50% 台の「嘘勝率」問題が解消される見込み

- **変更箇所**:
  1. `team-matchup-core.ts`:
     - `matchupValue()`: 第5引数 `defenderChipPct?: number` 追加
     - `evaluate3v3()`: 4要素モデル → matchupValue 合計方式に書き換え
  2. `team-matchup-worker.ts`: 変更不要 (SimEnv 経由)
  3. **テスト**:
     - `matchupValue` の chip 付きテスト (chip で確3→確2 に変化するケース)
     - `evaluate3v3` の速度反映テスト (先行確1チーム vs 後攻確1チームでWR差が出ること)
     - `evaluate3v3` の chip 連携テスト (SR 込みで確定数が変化するケース)

- **変更しない箇所**:
  - `selectTeam()`: 既に ADR-002 で matchupValue 使用済み。chip 引数なしで従来通り
  - `matchupValue()` の速度判定ロジック: 倍率テーブル (2.5/1.9/1.3/1.0/0.65/0.3) は不変
  - SR / 天候判定ロジック (`canSetSR`, `resolveTeamWeather`): 既存維持
  - `MatchEvaluation` 型: `{scoreA, scoreB, winner}` の構造は不変

### ADR-004: 脅威指向研磨の実装 + メガ採用優先度制御

- **日付**: 2026-04-14
- **ステータス**: 採用（実装待ち）
- **背景**: §7c「脅威指向研磨」は仕様に詳細記載があるが **完全未実装**。
  研磨フェーズは `scoreCandidateByCore()` のみで候補をランキングしており、
  チーム固有の未回答脅威を解消できる候補にボーナスを与える仕組みが存在しない。
  加えて ADR-001 未解決事項1（研磨のメガ選出競合チェック）も未実装のため、
  研磨がメガ候補を投入し続け、既存メガと選出競合で死にメガが大量発生する。

  **実害**:
  - TOP50中32チームに死に枠。25体が死にメガ
  - 全構成に未回答脅威が存在するが、研磨は脅威を無視して「平均的に強い」候補を選ぶ
  - Glimmora-Mega (選出率0%) が #1 チームに残り続ける

- **決定**: 以下の4項目を一括実装する。

  #### 4a. `meetsAnswerCriteria` の独立関数化

  `computeTeamThreatProfile()` 内のクロージャ (team-matchup.ts L1673-1732) を
  独立関数 + `AnswerContext` パラメータに抽出する。

  **配置**: `meetsAnswerCriteria` は pure function なので `team-matchup-core.ts` にエクスポート。
  `buildAnswerContext` は `SimEnv` からの算出のみで `pool` 不要なため同じく `team-matchup-core.ts`。

  ```typescript
  // team-matchup-core.ts にエクスポート

  /** meetsAnswerCriteria が参照する全コンテキスト */
  export interface AnswerContext {
    matrix: DamageMatrix;
    poolSpeeds: Map<string, number>;  // SimEnv.poolSpeeds をそのまま渡す
                                       // チームメンバーはプール部分集合のため
                                       // poolSpeeds.get(me) でメンバー速度が取れる
    teamHasSand: boolean;             // チームが砂セッターを持つか
    teamHasSR: boolean;               // チームがSRセッターを持つか
    srChipPct: Map<string, number>;   // SimEnv.srChipPct
    sandChipImmune: Set<string>;      // SimEnv.sandChipImmune
    weatherUsers: Map<string, string>; // SimEnv.weatherUsers (相手の天候判定に必要)
  }

  /** SimEnv + メンバー情報から AnswerContext を構築 */
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

  /** 味方 me が相手 oppName に対して「回答」できるかの判定 */
  export function meetsAnswerCriteria(
    me: string, oppName: string, oppSpeed: number, ctx: AnswerContext,
  ): boolean {
    // 既存クロージャロジック (team-matchup.ts L1673-1732) を移植
    // 外部変数 → ctx フィールドに置換:
    //   memberSpeeds.get(me)  → ctx.poolSpeeds.get(me)
    //   matrix                → ctx.matrix
    //   teamHasSand           → ctx.teamHasSand
    //   teamHasSR             → ctx.teamHasSR
    //   env.srChipPct         → ctx.srChipPct
    //   env.sandChipImmune    → ctx.sandChipImmune
    //   env.weatherUsers      → ctx.weatherUsers
    // oppChipFor / myChipFrom ヘルパーも関数内にインライン化
  }
  ```

  **検証**: 独立化前後で `computeTeamThreatProfile()` の出力が同一であることをテストで保証。

  #### 4b. `scoreTargetedCandidate` の実装

  ```typescript
  // team-matchup.ts に配置 (scoreCandidateByCore を呼ぶため)
  function scoreTargetedCandidate(
    candidateName: string,
    remaining: string[],
    unanswered: UnansweredThreat[],
    metaReps: MetaRepresentative[],
    matrix: DamageMatrix,
    simEnv: SimEnv,
    megaCapable: Set<string>,
  ): { baseScore: number; threatBonus: number; answeredCount: number } {
    const baseScore = scoreCandidateByCore(candidateName, remaining, metaReps, matrix, simEnv, megaCapable);

    // 入れ替え後のメンバーでコンテキスト構築
    const postSwapMembers = [...remaining, candidateName];
    const ctx = buildAnswerContext(postSwapMembers, matrix, simEnv);

    let threatBonus = 0;
    let answeredCount = 0;
    for (const threat of unanswered) {
      if (meetsAnswerCriteria(candidateName, threat.opponentName, threat.oppSpeed, ctx)) {
        threatBonus += threat.usagePct;  // usagePct: 0-100
        answeredCount++;
      }
    }

    return { baseScore, threatBonus, answeredCount };
  }
  ```

  **`UnansweredThreat` 型定義** (types/team-matchup.ts に追加):
  ```typescript
  export interface UnansweredThreat {
    opponentName: string;   // 未回答の相手ポケモン名
    oppSpeed: number;       // 相手の素早さ
    usagePct: number;       // 相手の使用率 (0-100)
  }
  ```

  **`ThreatProfile` 拡張** (types/team-matchup.ts):
  ```typescript
  export interface ThreatProfile {
    // ... 既存9フィールド ...
    unansweredOpponents: UnansweredThreat[];  // ★ 追加: 未回答脅威の詳細リスト
  }
  ```

  `computeTeamThreatProfile()` の戻り値に `unansweredOpponents` を追加:
  opponent ループ内で `hasAnswer === false` の相手を `UnansweredThreat` として収集。

  #### 4c. `selectTopCandidates` への脅威スコア統合

  ```typescript
  // 現行シグネチャに unanswered を追加
  function selectTopCandidates(
    candidates: { name: string; members: string[]; teamKey: string }[],
    remaining: string[],
    metaReps: MetaRepresentative[],
    matrix: DamageMatrix,
    simEnv: SimEnv,
    megaCapable: Set<string>,
    limit: number,
    unanswered?: UnansweredThreat[],  // ★ 追加
  ): { name: string; members: string[]; teamKey: string }[] {
    if (metaReps.length > 0) {
      const scored = candidates.map(c => {
        if (unanswered && unanswered.length > 0) {
          const { baseScore, threatBonus, answeredCount } = scoreTargetedCandidate(
            c.name, remaining, unanswered, metaReps, matrix, simEnv, megaCapable,
          );
          return { ...c, finalScore: baseScore + THREAT_BONUS_WEIGHT * threatBonus, answeredCount };
        } else {
          return { ...c, finalScore: scoreCandidateByCore(c.name, remaining, metaReps, matrix, simEnv, megaCapable), answeredCount: 0 };
        }
      });

      // メガペナルティ (4d) をソート前に適用
      const existingMegaCount = remaining.filter(m => megaCapable.has(m)).length;
      for (const c of scored) {
        if (megaCapable.has(c.name) && existingMegaCount >= 2) {
          c.finalScore *= MEGA_OVERSATURATION_PENALTY;
        }
      }

      scored.sort((a, b) => b.finalScore - a.finalScore || b.answeredCount - a.answeredCount);
      // simulateSelectionRate ゲート: 既存ロジック維持
      const shortlist = scored.slice(0, limit * 2);
      const gated = shortlist.filter(c => {
        const simRate = simulateSelectionRate(c.members, c.name, metaReps, matrix, megaCapable, simEnv.poolSpeeds);
        return simRate >= REFINE_MIN_SIM_SEL_RATE;
      });
      return gated.slice(0, limit);
    }
    if (candidates.length <= limit) return candidates;
    return candidates.slice(0, limit);
  }
  ```

  **呼び出し側の変更**:
  `generateTieredSwaps` / `generateDualSwaps` は入れ替え対象チームの
  `computeTeamThreatProfile()` を呼び、戻り値の `unansweredOpponents` を
  `selectTopCandidates` に渡す。

  ```typescript
  // generateTieredSwaps 内 (既存コードへの追加)
  const threatProfile = computeTeamThreatProfile(team.members, opponents, pool, matrix, env, megaCapable);
  const selected = selectTopCandidates(
    candidates, remaining, metaReps, matrix, simEnv, megaCapable, candidatesPerSlot,
    threatProfile.unansweredOpponents,  // ★ 追加
  );
  ```

  #### 4d. メガ採用優先度制御

  チームに既にメガが2体以上いる場合、追加のメガ候補の `finalScore` にペナルティを適用:

  ```typescript
  // selectTopCandidates 内
  const existingMegaCount = remaining.filter(m => megaCapable.has(m)).length;
  for (const c of scored) {
    if (megaCapable.has(c.name) && existingMegaCount >= 2) {
      c.finalScore *= MEGA_OVERSATURATION_PENALTY; // 0.3 — メガ3体目以降は大幅減点
    }
  }
  ```

  定数:
  ```typescript
  export const MEGA_OVERSATURATION_PENALTY = 0.3;  // 既にメガ2体のチームへの追加メガ
  ```

  **理由**: メガ排他制約（1戦1メガ）により、チームにメガが3体以上いると
  少なくとも2体は選出されない。メガ追加は構築の選出幅を狭めるだけで、
  非メガの補完枠を消費するデメリットが大きい。
  完全禁止ではなく重ペナルティとすることで、
  例外的にメガ3体が最適な構成が存在した場合に対応。

- **根拠**:
  1. §7c は仕様書に 100 行以上の詳細設計があり、合意済みの仕様である
  2. `meetsAnswerCriteria` の独立化は他の改修（ADR-005等）の前提条件
  3. メガ2体制限は ADR-001 未解決事項1 の直接的な対処
  4. TOP50の 64% (32/50) が死に枠を持つ現状は、研磨がメガ競合を無視している直接的な結果

- **帰結**:
  - 研磨が未回答脅威の解消を優先するようになり、構築の完成度が向上
  - 死にメガの発生が大幅に減少
  - `computeTeamThreatProfile` の計算コスト: 研磨1ラウンドあたり ~300チーム分追加 (< 1s)
  - `scoreTargetedCandidate` の追加コスト: < 0.2s/ラウンド (§7c 見積もり通り)

- **変更箇所**:
  1. `team-matchup-core.ts`: `meetsAnswerCriteria` / `buildAnswerContext` / `AnswerContext` をエクスポート
  2. `team-matchup.ts`:
     - `computeTeamThreatProfile()` を独立関数呼び出しに書き換え
     - `scoreTargetedCandidate()` 新規実装
     - `selectTopCandidates()` に脅威スコア統合 + メガペナルティ追加
     - `generateTieredSwaps()` / `generateDualSwaps()` から `unanswered` を渡す
  3. `team-matchup-core.ts`: `THREAT_BONUS_WEIGHT = 2.0` / `MEGA_OVERSATURATION_PENALTY = 0.3` 定数追加

- **テスト**:
  - `meetsAnswerCriteria` 独立関数の単体テスト (免疫/半減/先行確1/KOレース勝利の各ケース)
  - `scoreTargetedCandidate` の脅威ボーナス計算テスト
  - メガペナルティ: メガ2体チームにメガ候補追加時のスコア減衰を検証

### ADR-005: moves viewer の禁止技除外 + 2軸脅威ケア

- **日付**: 2026-04-14
- **ステータス**: 採用（実装待ち）
- **背景**: §14「既知の差異」に記載の通り、matchup viewer と moves viewer は
  異なる「未回答」定義を持つ。これは **2軸評価** として両方有用だが、以下の問題がある:

  1. **moves viewer が禁止技を脅威として評価**: Hyper Beam / Giga Impact / Solar Beam が
     `computeFullThreatAnalysis` → `findAnswer` で脅威として評価される。
     しかしこれらの技は recharge/charge ペナルティがあり、対戦相手も使用しない前提
     (matchup パイプラインで双方向に禁止済み)。moves viewer だけが含めているのは不整合。
  2. **matchup パイプラインが moves 軸のアラートを無視**: §7c の脅威指向研磨は
     matchup 定義の `meetsAnswerCriteria` (per-opponent) のみ使用。
     moves 定義の per-dangerous-move 分析は研磨に反映されない。

  **ユーザーの方針**: 2軸は統一ではなく **両方ケア** する。
  matchup 軸 (per-opponent) と moves 軸 (per-dangerous-move) の両方を改善の指針に使う。

- **決定**: 以下の2項目を実装する。

  #### 5a. moves viewer への禁止技フィルタ

  `moveCalc.ts` の **2箇所** で禁止技を除外する。
  matchup パイプラインと同じルール: recharge 技は無条件除外、charge 技は免除特性なしで除外。

  ```typescript
  // moveCalc.ts 冒頭に追加
  import { CHARGE_TURN_MOVES, CHARGE_EXEMPT_ABILITIES, RECHARGE_MOVES }
    from "../analyzer/team-matchup-core";
  ```

  **変更箇所 1**: `computeFullThreatAnalysis` 内の敵技ループ (L565)
  ```typescript
  for (const moveName of enemy.moves) {
    // Skip banned moves (same rules as matchup pipeline)
    if (CHARGE_TURN_MOVES.has(moveName) && !CHARGE_EXEMPT_ABILITIES.has(enemy.ability)) continue;
    if (RECHARGE_MOVES.has(moveName)) continue;
    // ... existing dangerous move evaluation ...
  }
  ```

  **変更箇所 2**: `findAnswer` 内の敵技ループ (L421)
  ```typescript
  for (const enmove of enemy.moves) {
    // Skip banned moves
    if (CHARGE_TURN_MOVES.has(enmove) && !CHARGE_EXEMPT_ABILITIES.has(enemy.ability)) continue;
    if (RECHARGE_MOVES.has(enmove)) continue;
    // ... existing enemy damage evaluation ...
  }
  ```

  **理由**: `findAnswer` は敵の全技を走査して「敵の最高ダメージ」を算出する。
  禁止技が含まれるとダメージが過大評価され、1v1 回答判定が歪む。
  両箇所ともフィルタが必須。

  #### 5b. matchup パイプラインの2軸脅威指標

  `computeTeamThreatProfile()` の既存 opponent ループ内で、
  「広範囲高打点」の攻撃者をカウントして ThreatProfile に追加する。

  **方式**: DamageMatrix の `matrix[attacker][defender].maxPct` を使い、
  味方3体以上に 50% 以上入る攻撃者を「広範囲危険攻撃者」と判定する。
  DamageMatrix は bestMove のみ記録のため per-move 分析は不可だが、
  「攻撃者が広範囲に高打点を持つ」危険性は検出できる。

  ```typescript
  // computeTeamThreatProfile() の opponent ループ内に追加
  // (既存の per-opponent 回答判定の直後)
  let wideHitCount = 0;
  for (const me of members) {
    const entry = matrix[opp.name]?.[me];
    if (entry && entry.maxPct >= 50) wideHitCount++;
  }
  if (wideHitCount >= 3) {
    dangerousAttackerCount++;
    if (!hasAnswer) dangerousAttackerUncovered++;
  }
  ```

  **ThreatProfile 追加フィールド** (types/team-matchup.ts):
  ```typescript
  export interface ThreatProfile {
    // ... 既存9フィールド + unansweredOpponents (ADR-004b) ...
    dangerousAttackerCount: number;     // 味方3体以上に50%+入る攻撃者の総数
    dangerousAttackerUncovered: number; // うち回答なしの数
  }
  ```

  **研磨への反映**: なし。per-opponent の `unansweredOpponents` (ADR-004b) が
  未回答攻撃者を全て含むため、広範囲攻撃者も包含される。
  `dangerousAttackerCount` / `dangerousAttackerUncovered` は
  **表示レベルでの情報追加** が目的。ビューアで「広範囲危険攻撃者」として強調表示する。

  **ビューア表示**: `TeamDetail.tsx` の脅威セクションに
  `dangerousAttackerUncovered > 0` の場合に警告バッジを追加。

- **根拠**:
  1. 禁止技除外は matchup と moves の不整合解消として必須
  2. 2軸ケアはユーザー方針。統一ではなく両方の情報を提示
  3. 研磨はper-opponent回答で概ね対応。per-moveの情報は閲覧用として追加

- **帰結**:
  - moves viewer の偽アラート (recharge/charge 技) が解消
  - matchup pipeline の ThreatProfile に広範囲危険攻撃者カウントが追加
  - ビューアで両軸 (per-opponent 未回答 + 広範囲危険攻撃者) の状況を確認可能

- **変更箇所**:
  1. `moveCalc.ts`:
     - `computeFullThreatAnalysis` 内の敵技ループ (L565) に禁止技フィルタ追加
     - `findAnswer` 内の敵技ループ (L421) に禁止技フィルタ追加
     - `team-matchup-core` から禁止技セットを import (新規)
  2. `team-matchup.ts`: `computeTeamThreatProfile()` の opponent ループに広範囲攻撃者カウント追加
  3. `team-matchup-core.ts`: 禁止技セットをエクスポート (既にエクスポート済み — 変更なし)
  4. `types/team-matchup.ts`: `ThreatProfile` に `dangerousAttackerCount` / `dangerousAttackerUncovered` 追加
  5. ビューア: `TeamDetail.tsx` に広範囲危険攻撃者の警告バッジ追加

- **テスト**:
  - `computeFullThreatAnalysis` が recharge/charge 技を除外するテスト
  - `findAnswer` が禁止技を無視して敵最高ダメージを計算するテスト
  - `computeTeamThreatProfile` の `dangerousAttackerCount` / `dangerousAttackerUncovered` 正確性テスト

### ADR-006: Must-Answer Tier — 回答必須脅威の優先的ケア

- **日付**: 2026-04-14
- **ステータス**: 採用・実装済み
- **背景**: ADR-004b で `unansweredOpponents` を研磨に導入したが、
  `threatBonus = THREAT_BONUS_WEIGHT × usagePct` の加算値が
  `baseScore` (0.0-1.0) の差に対して無視できるほど小さい問題が判明。

  **根本原因**: 全プール Pokemon の `usagePct` が均一 (1%) のため、
  `THREAT_BONUS_WEIGHT(2.0) × 1% = 0.02` しか加算されない。
  Palafin-Hero (overallScore=52.3, speed=159.5) の回答者は12体存在するが、
  いずれも overallScore が低く (28-58)、baseScore で負けて選出されない。
  結果: dead member が残り、must-answer 脅威も未回答のまま共存する矛盾。

- **決定**: bonus を増やすのではなく、**候補をティアに分けてソート** する。

  #### Must-Answer Pool の定義

  `buildMustAnswerSet(pool)` が返す Set:
  - **全メガ進化** (~57体): メガ進化は固有の脅威プロファイルを持つ
  - **overallScore 上位50体** (非メガ): singles ranking パイプラインの総合評価

  計 ~107 体。`usageRank` はアルファベット順のため使用不可。

  #### Tiered Sort

  研磨の候補選出 (`selectTopCandidates`, `generateDualSwaps`, `scorePoolCandidates`) で:
  - **Tier 1**: 未回答 must-answer 脅威に回答可能な候補 → 最優先
  - **Tier 2**: 回答不可な候補 → Tier 1 の後

  ティア内は従来通り `finalScore` → `answeredCount` で並べる。
  回答者が 0 の場合は全員 Tier 2 になり、従来ロジックにフォールバック。

  #### UnansweredThreat への isMustAnswer タグ

  `computeTeamThreatProfile` が `mustAnswerSet` を受け取り、
  各 `UnansweredThreat` に `isMustAnswer: boolean` をタグ付け。

- **根拠**:
  1. bonus 方式は `usagePct` の均一性により機能しない
  2. ティア分割は「回答者がいれば必ず選ぶ」という要件を直接実現
  3. フォールバック (回答者0→全Tier2) で既存ロジックに退化するため安全
  4. `overallScore` は singles ranking で計算済み — 新規指標の追加不要

- **検証結果** (--teams 5000 --games 200):

  | 指標 | Before | After | 目標 |
  | --- | --- | --- | --- |
  | Dead member 持ちチーム | 24/50 | 9/50 | <10 |
  | Dead member 総数 | 24 | 9 | <10 |
  | Palafin未回答+Dead共存 | 11 | 2 | 0 |
  | Must-answer未回答(総計) | — | 8 | — |
  | Answer rate min | 98% | 97% | — |
  | WR min | 50.3% | 51.6% | — |

  Dead member 問題は目標達成。Palafin+Dead 共存も 11→2 に大幅改善。

  **既知の副作用**: Mega 3+ チーム数が 7→26 に増加。
  これは ADR-006 の直接的副作用ではなく、Feraligatr-Mega + Hawlucha-Mega +
  Alakazam-Mega のコアが強力で研磨で頻繁に選ばれた結果。
  メガ制限は ADR-006 とは独立した課題として今後対応。

- **変更箇所**:
  1. `types/team-matchup.ts`: `UnansweredThreat` に `isMustAnswer: boolean` 追加
  2. `team-matchup-core.ts`: `MUST_ANSWER_TOP_N` 定数 + `buildMustAnswerSet()` 関数
  3. `team-matchup.ts`:
     - `computeTeamThreatProfile`: `mustAnswerSet` 引数 + `isMustAnswer` タグ付け
     - `scoreTargetedCandidate`: `mustAnswerCount` 返却値追加
     - `selectTopCandidates`: tiered sort 実装
     - `generateDualSwaps`: tiered sort 実装
     - `scorePoolCandidates`: `unanswered` 引数 + tiered sort
     - `generateMultiMemberSwap`: `unanswered` パススルー
     - `iterativeRefinement` / `generateTieredSwaps` / `generateSingleSwaps`: `mustAnswerSet` 伝搬
     - `main()`: `buildMustAnswerSet` 呼び出し + 全関数への伝搬

### ADR-007: クロスラン蓄積 (Cross-Run Accumulation)

- **日付**: 2026-04-15
- **ステータス**: 採用（実装済み）
- **背景**: パイプラインは毎回独立したシード乱数で実行されるため、
  実行間の知識蓄積がゼロで、「一期一会」の結果になっていた。
  同一ロジックバージョンで複数回実行しても結果を比較する手段がなく、
  構築の信頼性（再現性）を評価できなかった。

- **決定**: パイプライン実行ごとにコンパクトなスナップショット (~20KB) を
  `_matchup-history.json` に追記保存し、蓄積データを可視化する History Viewer を構築する。

  #### 7a. スナップショット抽出

  `extractSnapshot()` が 27MB のフル出力から以下を抽出:
  - config (teams/games/pool/seed)
  - TOP10チーム (members, winRate, compositeScore, deadMemberCount)
  - ポケモン採用率/選出率 (TOP50チーム内)
  - TOP10コア (3体組み合わせ)
  - プール統計 (total, megas)

  #### 7b. 自動保存

  `main()` の末尾で `extractSnapshot()` → `_matchup-history.json` に追記。
  ファイルが存在しなければ `{"version":1,"snapshots":[]}` で初期化。

  #### 7c. 遡及抽出

  `home-data/scripts/extract-matchup-snapshots.mjs` が既存の `*-team-matchup.json`
  ファイルからスナップショットを一括抽出し、`_matchup-history.json` をブートストラップ。

  #### 7d. ループ実行モード

  `--loop` フラグで無限ループ実行。Ctrl+C で停止するまで seed をインクリメントしながら
  パイプラインを繰り返し実行する。

  ```bash
  npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200 --loop
  npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200 --loop --seed 100
  ```

  - base seed = `--seed` 引数 (デフォルト 42)
  - iteration N の seed = baseSeed + N
  - `main()` は `seedOverride?: number` を受け取り、ループから呼び出される

  #### 7e. History Viewer

  `build/history.html` — 5タブ構成のビューア:

  | タブ | コンポーネント | 内容 |
  |------|-------------|------|
  | Summary | `SummaryDashboard` | KPI (実行回数/平均WR/最高WR/WR変動幅), MVP Pokemon, TOP1常連, Rising/Falling |
  | Convergence | `ConvergenceChart` | WR推移折れ線 + compositeScore推移 |
  | Pokemon | `PokemonConsistency` | ヒートマップ (行=Pokemon, 列=実行回), Pick/Selection切替, Gap表示 |
  | Cores | `CoreStability` | 複数回出現コアの信頼度 (出現回/総実行回) |
  | Diff | `RunDiff` | 2実行間の比較 (WR差, 採用率変動, 新規参入/脱落, TOP1構築比較) |

- **根拠**:
  1. 実行間の再現性が成功基準 (§1) の核心
  2. スナップショット方式は既存 27MB JSON への影響なし
  3. 蓄積データが Phase A/B (メタ適性評価/補完枠探索) の優先度判断に活用可能

- **変更箇所**:
  1. `home-data/types/matchup-history.ts` (新規): MatchupSnapshot, MatchupHistory 型定義
  2. `home-data/analyzer/team-matchup.ts`: `extractSnapshot()` + 自動保存 + `--loop` モード
  3. `home-data/scripts/extract-matchup-snapshots.mjs` (新規): 遡及抽出スクリプト
  4. `home-data/viewer-history/` (新規): App.tsx + 5コンポーネント + main.tsx
  5. `history.html` (新規): HTMLエントリ
  6. `vite.config.ts`: PAGES に history 追加
  7. `package.json`: `build:history` スクリプト追加

### ADR-008: 耐久型ビルドバリアント (Garchomp-HB, Mimikyu-HD)

- **日付**: 2026-04-15
- **ステータス**: 採用（実装済み）
- **背景**: ダメージ行列は各ポケモンの「最高ウェイトビルド」を代表とするため、
  アタッカー型しか評価されない。HB Garchomp (ステロ撒き) や HD Mimikyu (特殊受け) など
  耐久型ビルドは低ウェイトのため代表にならず、評価対象外だった。

- **決定**: メガ進化と同じく**別名の独立プールエントリ**として耐久型を展開する。

  ```typescript
  const DEFENSIVE_VARIANTS = [
    {
      source: "Garchomp", suffix: "-HB",
      sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 },
      nature: "Impish", item: "Leftovers", ability: "Rough Skin",
      weightMultiplier: 0.3,
      moves: ["Earthquake", "Dragon Claw", "Stealth Rock", "Rock Slide"],
    },
    {
      source: "Mimikyu", suffix: "-HD",
      sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
      nature: "Careful", item: "Leftovers", ability: "Disguise",
      weightMultiplier: 0.25,
      moves: ["Play Rough", "Shadow Sneak", "Shadow Claw"],
    },
  ];
  ```

  #### 種族条項

  `baseSpecies()` を拡張して `-HB` / `-HD` サフィックスを認識:

  ```typescript
  const VARIANT_SUFFIXES = ["-Mega", "-HB", "-HD"];
  export function baseSpecies(poolName: string): string {
    for (const suffix of VARIANT_SUFFIXES) {
      if (poolName.endsWith(suffix)) return poolName.slice(0, -suffix.length);
    }
    return poolName;
  }
  ```

  これにより Garchomp + Garchomp-HB / Garchomp-Mega の同一チーム不可が自動的に成立。

  #### SR検出

  `STEALTH_ROCK_USERS` に "Garchomp" が既にあり、SimEnv 初期化で
  `baseSpecies()` 経由チェックするため、Garchomp-HB も自動的にSRユーザー認識。

- **根拠**:
  1. 耐久型は対面相性が大きく異なるため別エントリが必要
  2. メガと同じ方式を踏襲し、実装・テスト・保守コストを最小化
  3. `baseSpecies()` 一箇所の変更で種族条項・SR検出が全て連動

- **変更箇所**:
  1. `team-matchup-core.ts`: `baseSpecies()` に `-HB` / `-HD` サフィックス追加
  2. `team-matchup.ts`: `DEFENSIVE_VARIANTS` 定義 + Phase 1c でプール展開

### ADR-009: ばけのかわ (Disguise) 実装

- **日付**: 2026-04-15
- **ステータス**: 採用（実装済み）
- **背景**: ミミッキュの特性「ばけのかわ」は初回ダメージ無効化 (実質 +1 KO turn)
  だが、パイプラインでは未実装だった。これにより Mimikyu / Mimikyu-HD の
  防御的価値が過小評価されていた。

- **決定**: `evaluate3v3` 内でばけのかわの事後調整を行う。
  `selectTeam` には影響を与えない (チーム選出は構築段階で完了しているため)。

  #### SimEnv 拡張

  ```typescript
  interface SimEnv {
    // ...既存フィールド...
    disguiseUsers: Set<string>;  // Ability="Disguise" のポケモン
  }
  ```

  SimEnv 初期化ループで `primaryBuild.ability === "Disguise"` をチェック。
  Mimikyu と Mimikyu-HD の両方が登録される。

  #### matchupValue — extraDefenderKoN 引数

  ```typescript
  export function matchupValue(
    me, opp, matrix, poolSpeeds,
    defenderChipPct?: number,
    extraDefenderKoN?: number,  // Disguise用: 防御側の追加打数
  ): number
  ```

  `extraDefenderKoN > 0` なら `eKoN += extraDefenderKoN` で実効確定数を増加。

  #### evaluate3v3 事後調整

  3×3 matchupValue ループの後:
  1. selA の Disguise ユーザーごとに、selB 中で最大 matchupValue の相手を特定
  2. `matchupValue(maxThreat, disguiseUser, ..., extraDefenderKoN=1)` で再計算
  3. `B_total += (再計算値 - 元の値)` で差分更新
  4. selB の Disguise ユーザーも同様に A_total を調整

  **設計判断**: selectTeam への非適用
  - selectTeam は構築段階の「誰を入れるか」の判断。ばけのかわは 3v3 対面でのみ意味を持つ
  - selectTeam に適用すると、Mimikyu が全対面で過大評価され選出が偏る

- **変更箇所**:
  1. `team-matchup-core.ts`: `SimEnv.disguiseUsers`, `matchupValue` に `extraDefenderKoN`
  2. `team-matchup-core.ts`: `evaluate3v3` に Disguise 事後調整ロジック
  3. `team-matchup-core.ts`: `serializeSimEnv` / `deserializeSimEnv` に `disguiseUsers` 追加
  4. `team-matchup.ts`: SimEnv 初期化で `disguiseUsers` セット

---

## 15. クロスラン蓄積システム

### 概要

パイプライン実行ごとにコンパクトなスナップショット (~20KB) を自動保存し、
複数回の実行結果を蓄積・比較・可視化するシステム。

### データフロー

```
team-matchup.ts (1回実行)
  → 27MB フル JSON (従来通り)
  → extractSnapshot() → ~20KB スナップショット
  → _matchup-history.json に追記
  → History Viewer で可視化
```

### スナップショット型定義

`home-data/types/matchup-history.ts` に定義:

- `MatchupSnapshot`: 1回の実行結果のコンパクト表現
- `MatchupHistory`: `{ version: 1, snapshots: MatchupSnapshot[] }`
- `SnapshotTeam`: TOP10チームのコンパクト表現

### ループ実行

```bash
# 基本 (seed 42 から開始)
npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200 --loop

# seed 指定
npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200 --loop --seed 100

# 通常の単発実行 (従来通り)
npx tsx home-data/analyzer/team-matchup.ts --teams 5000 --games 200
```

### History Viewer

```
home-data/viewer-history/
  main.tsx
  App.tsx                         # 5タブ Router
  components/
    RunList.tsx                   # 左サイドバー: 実行一覧
    SummaryDashboard.tsx          # KPI + MVP + Rising/Falling
    ConvergenceChart.tsx          # WR推移折れ線
    PokemonConsistency.tsx        # ポケモン安定性ヒートマップ
    CoreStability.tsx             # コア出現頻度
    RunDiff.tsx                   # 2実行間比較
history.html                     # HTMLエントリ
```

### 12回実行分析結果 (2026-04-15)

パイプライン設定: `--teams 5000 --games 200 --loop` (seed 42-53)
実行時間: 約5.4時間 (27分/回 × 12回)
総計: ~650,000チーム生成、~130,000,000試合

#### WR統計

| 指標 | 値 |
|------|---|
| 平均WR | 76.3% |
| 標準偏差 | 3.7% |
| 最高 | 81.9% |
| 最低 | 70.0% |
| レンジ | 11.9% |

#### ポケモン安定性ティア

| ティア | ポケモン | 出現率 | 平均採用率 | CV |
|--------|---------|--------|-----------|-----|
| S | ヒスイバクフーン (Typhlosion-Hisui) | 12/12 | 96% | 0.12 |
| A | メガオーダイル (Feraligatr-Mega) | 9/12 | 66% | 0.40 |
| B | ヒスイヌメルゴン (Goodra-Hisui) | 8/12 | 56% | — |
| B | パルデアケンタロス水 (Tauros-Paldea-Aqua) | 8/12 | 53% | — |
| B | メスバスラオ (Basculegion-F) | 7/12 | 48% | — |
| B | メガフラエッテ (Floette-Mega) | 7/12 | 45% | — |
| B | メガプテラ (Aerodactyl-Mega) | 7/12 | 43% | — |

CV = 変動係数 (std/mean)。S ティアの CV 0.12 = 非常に安定。

#### 最高信頼度構成 (5/12回出現)

ヒスイバクフーン + メガオーダイル + ヒスイヌメルゴン + カバルドン-HD + メガプテラ + パルデアケンタロス水

- 出現率: 41.7% (5/12)
- 平均WR: 73.2%
- 信頼度スコア: 3.66 (freq × avgWR)

#### 隠れた強者 (Hidden Gems)

| ポケモン | 採用率 | 選出率 | Sel/Pick比 |
|---------|--------|--------|-----------|
| メガアブソル (Absol-Mega) | 8% | 47% | 5.88x |
| キョジオーン (Garganacl) | 15% | 73% | 4.87x |

Sel/Pick 比が高い = 採用されれば高確率で選出される隠れた実力者。

#### 既知の問題

- **Palafin-Hero コア汚染**: build-banned Pokemon (相手専用) がコア評価に混入。
  Froslass-Mega + Palafin-Hero + Typhlosion-Hisui が 12/12 で最頻コアだが、
  Palafin-Hero は自チーム採用不可のため実用的なコアではない。
  → コア評価時に build-banned Pokemon をフィルタすべき (未対応)

---

## 14. Team Builder

### Builder 概要

パイプライン出力 (`_latest-team-matchup.json`) を消費し、
**構築の手動組み立て・SP配分の最適化を支援する対話型ツール**。

プレイヤーが回答を得たい問い:

- 「このポケモンの攻撃SPを削って耐久に回せるか？どこまで削れるか？」
- 「あと何SP振れば確定数が変わるか？」
- 「この構築に足りないカバレッジは何か？」

### Builder ファイル構成

```text
home-data/viewer-builder/
  main.tsx                          # React エントリ
  App.tsx                           # データ読込 + レイアウト
  builderCalc.ts                    # 役割分類・補完スコア計算
  spAnalysisCalc.ts                 # SP 閾値分析 (防御/攻撃/素早さ)
  components/
    BuilderToolbar.tsx              # 検索・フィルタバー
    TeamSlots.tsx                   # 6枠チーム編集
    PoolBrowser.tsx                 # プール一覧 (検索・ソート)
    PokemonRoleCard.tsx             # 個体詳細 (4タブ切替)
    GapAnalysis.tsx                 # カバレッジ未回答分析
    ComplementPanel.tsx             # 補完候補推薦
    TeamSummary.tsx                 # チーム全体サマリ
    DefensiveThresholds.tsx         # 防御SP閾値 UI
    OffensiveThresholds.tsx         # 攻撃SP閾値 UI
    SpeedTierTable.tsx              # 素早さ比較テーブル
builder.html                        # HTML エントリ
build/builder.html                  # ビルド出力
```

### データソース

Data sources:

- **構築分析結果**: `_latest-team-matchup.json` — pool, topTeams, matrix, cores
- **SP グリッド**: `_latest-sp-grid.json` — 事前計算済みダメージグリッド (optional)

### 役割分類 (`builderCalc.ts`)

各ポケモンをダメージ行列から自動分類。

```typescript
type RoleCategory =
  | "physicalAce"    // 物理エース
  | "specialAce"     // 特殊エース
  | "mixedAce"       // 両刀エース
  | "wallBreaker"    // 崩し役
  | "hbWall"         // 物理受け
  | "hdWall"         // 特殊受け
  | "pivot"          // 対面操作
  | "priorityUser"   // 先制技使い
  | "stealthRockSetter"; // SR撒き
```

#### 補完スコア

構築に追加した場合の未回答脅威の解消数で候補をランク付け。
`ANSWER_THRESHOLD = 0.65` (速度同速+確2 以上を "回答" とみなす)。

---

### SP 閾値分析 (`spAnalysisCalc.ts`)

#### タブ構成

各ポケモンの詳細カードは4タブ:

| タブ | 内容 |
|------|------|
| 役割相手 | 誰に有利/不利か (matchup 行列ベース) |
| 防御閾値 | HP/B/D のSP削減余裕 + 追加効果 |
| 攻撃閾値 | A/C のSP削減余裕 + 追加効果 |
| 素早さ | SP調整で抜ける/抜かれる相手一覧 |

#### 確/乱 遷移検知ルール

**閾値分析では、確/乱の切り替わりのみを意味のある遷移として検知する。**
同じ確定数内のkoChanceグラデーション (乱1(85%)→乱1(94%) 等) は
SP調整の判断材料にならないため表示しない。

##### Upgrade (SP追加で改善)

```text
improved =
  koN が変わる (防御: koN↑ / 攻撃: koN↓)
  OR 乱→確 の切り替え (koChance < 1.0 → ≥ 1.0)
```

- 防御側: 乱2→確2 (確2なら確定耐え), 確2→乱3, 確2→確3
- 攻撃側: 乱1→確1 (確定で倒せる), 確2→乱1, 確2→確1

##### Margin (SP削減で悪化)

```text
worsened =
  koN が変わる (防御: koN↓ / 攻撃: koN↑)
  OR 確→乱 の切り替え (koChance ≥ 1.0 → < 1.0)
```

- 防御側: 確2→乱2 (確定耐えが崩れる), 確3→確2, 乱2→確1
- 攻撃側: 確1→乱1 (確定1発が崩れる), 確2→確3, 乱1→確2

##### 設計根拠

以前は ±3%/±5% のkoChance閾値で微小変化も拾っていたが、
乱1(85%)→乱1(90%) で `break` して乱1→確1 を見逃す問題が発生。
「乱数85%→94%のグラデを知って調整しようとは思わない。
確定になる瞬間がほしい」というユーザー要件に基づき、
確/乱 の切り替わりのみに絞った。

#### 制約者スタック

各stat (A/C/B/D/HP) について、SP削減時に確定数が悪化する対面を
margin昇順にスタック表示。各行に以下の情報を持つ:

```text
[-N] [相手名] [投資(A32+補正/B8等)] [技名(物/特)] [速度(先/後/=)] [遷移(確2→乱1)] [使用率%]
```

- margin = 0: 赤 (限界)
- margin ≤ 3: 黄 (要注意)
- margin > 3: 青 (安全)

#### 重複排除 (2パス)

1. 同じ相手+技 → margin が最小のものを残す
2. 同じ baseSpecies+技+margin → 使用率を合算 (メガ/地方フォーム統合)

#### Upgrade エントリ

SP追加でフリップする対面を `+N` コスト順に表示。

---

### SP グリッド事前計算 (`compute-sp-grid.ts`)

#### SP グリッドの目的

ランタイムの `recalcDamage()` 呼び出し (~600-1200回/ポケモン) を排除し、
ビルド時に全SP値 (0-32) のダメージ結果を事前計算する。

#### パイプライン位置

`build-all.mjs` の prebuild ステップ4 (非致命的失敗):

```text
1. compute-meta-ranking      (moves.html 用)
2. compute-firepower-ranking  (firepower.html 用)
3. _latest-*.json コピー     (全ビューア用)
4. compute-sp-grid            (builder.html 用) ← ここ
5. Vite ビルド (全ページ)
```

#### 入力・出力

| 項目     | 内容                                            |
|----------|-------------------------------------------------|
| 入力     | `_latest-team-matchup.json` (pool + topTeams)   |
| 出力     | `_latest-sp-grid.json` (~3.7 MB compact)        |
| 対象     | top-10 チームのメンバー (≈17体) × top-100 相手  |
| 実行時間 | ~1.6秒                                          |

#### グリッド構造

攻撃グリッド: 自分が相手を攻撃 — atk/spa を 0-32 で変化
防御グリッド: 相手が自分を攻撃 — hp/def/spd を 0-32 で変化

キー形式: `"相手名|技名|stat"` → `Array(33)`

#### Compact フォーマット

サイズ削減のため、`{koN, koChance}` オブジェクトではなく
`[koN, koChance]` タプル (null は `0`) で格納:

```typescript
type CompactCell = 0 | [number, number];
// [2, 0.85] = 乱2(85%), [1, 1.0] = 確1, 0 = null
```

デコーダ:

```typescript
function decodeGrid(compact: CompactCell[]): GridCell[] {
  return compact.map(c => c === 0 ? null : { koN: c[0], koChance: c[1] });
}
```

#### フォールバック

SPグリッドが存在しない場合 (初回ビルド、生成失敗時)、
`spAnalysisCalc.ts` はランタイム `recalcDamage()` にフォールバック。
結果は同一 — パフォーマンスのみ異なる。

#### サイズ影響

| 形式                    | サイズ   |
|-------------------------|----------|
| JSON (compact)          | 3.7 MB   |
| builder.html gzip 増分  | +252 KB  |

---

### 素早さ分析 (`SpeedTierTable.tsx`)

自分のS投資を変えた場合に抜ける/抜かれる相手を一覧表示。

| 情報 | 説明 |
|------|------|
| 実速度 | Lv50 実速度値 (種族値×SP×性格) |
| タグ | 無=S0, 準=S32/等倍, 最=S32/+補正 |
| 到達可能 | 現在のSから調整で到達可能か |
| マッチアップフリップ | 抜くことで有利不利が変わる対面数 |
| 削減余裕 | 現在抜いている相手に対して何SP削れるか |
