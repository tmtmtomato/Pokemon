# 3/6 シングル選出メタ構築システム — 仕様書

## 1. 概要

ポケモンシングルバトルにおける「6体構築 → 3体選出」のメタ分析システム。
既存のダメージ計算エンジンを活用し、以下を実現する：

1. **ダメージ行列の事前計算**: 49体×49体の全対面ダメージを1回だけ計算
2. **ランダム構築生成**: 49体から6体を選んだチームを大量生成
3. **選出アルゴリズム**: 相手の6体に対し最適な3体を自動選出
4. **3v3マッチ評価**: 両者の選出3体同士の有利不利を判定
5. **トップ構築の洗い出し**: 勝率の高い構築TOP50を特定
6. **HTMLビューア**: 結果を対話的に表示

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

### 目的
全49体の「代表ビルド」同士のダメージを1回だけ計算し、以降の選出・評価で高速参照。

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

### Step 1: アタッカー一貫性スコア

各味方ポケモンの、相手6体に対する「一貫性」を算出：

```typescript
function attackerScore(me: string, opponents: string[]): number {
  let kills = 0;      // 2HKO以内に落とせる相手の数
  let totalDmg = 0;   // 相手6体への合計maxDmg%

  for (const opp of opponents) {
    const entry = matrix[me][opp];
    if (entry.koN >= 1 && entry.koN <= 2 && entry.koChance >= 0.5) kills++;
    totalDmg += entry.maxPct;
  }

  const consistency = kills / opponents.length;        // 0-1
  const avgDamage = totalDmg / opponents.length / 100; // 0-1 (正規化)
  return 0.6 * consistency + 0.4 * avgDamage;
}
```

### Step 2: アタッカー1〜2体を選出

1. 味方6体をattackerScoreで降順ソート
2. 1位を「エース」として選出
3. 2位のスコアが閾値以上 (≥0.3) かつエースと合わせて相手6体中5体以上をカバーできる場合、2体目も選出
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

### 評価指標

```typescript
function evaluate3v3(selA: string[], selB: string[]): {
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "draw";
} {
  // A → B: Aの各メンバーがBの3体にどれだけ打点を持つか
  let A_kills = 0;     // Aが2HKO以内に落とせるBの数 (重複排除)
  let A_ohkos = 0;     // AがOHKOできるBの数
  let A_totalDmg = 0;  // Aの合計ダメージ

  const B_killed = new Set<number>();
  for (const a of selA) {
    for (let j = 0; j < selB.length; j++) {
      const entry = matrix[a][selB[j]];
      if (entry.koN <= 2 && entry.koChance >= 0.5) B_killed.add(j);
      if (entry.koN === 1 && entry.koChance >= 0.5) A_ohkos++;
      A_totalDmg += entry.maxPct;
    }
  }
  A_kills = B_killed.size;

  // B → A: 同様
  let B_kills = 0;
  let B_ohkos = 0;
  let B_totalDmg = 0;
  const A_killed = new Set<number>();
  for (const b of selB) {
    for (let i = 0; i < selA.length; i++) {
      const entry = matrix[b][selA[i]];
      if (entry.koN <= 2 && entry.koChance >= 0.5) A_killed.add(i);
      if (entry.koN === 1 && entry.koChance >= 0.5) B_ohkos++;
      B_totalDmg += entry.maxPct;
    }
  }
  B_kills = A_killed.size;

  // スコア計算
  const A_avgDmg = A_totalDmg / 9;   // 3×3 = 9組み合わせ
  const B_avgDmg = B_totalDmg / 9;

  const scoreA = 0.35 * (A_kills / 3)
               + 0.25 * (A_ohkos / 9)
               + 0.20 * (1 - B_kills / 3)       // Aの生存性
               + 0.20 * (A_avgDmg / 100);

  const scoreB = 0.35 * (B_kills / 3)
               + 0.25 * (B_ohkos / 9)
               + 0.20 * (1 - A_kills / 3)
               + 0.20 * (B_avgDmg / 100);

  return {
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
  };
}
```

### 重み
| 要素 | 重み | 理由 |
|------|------|------|
| 突破力 (2HKO以内) | 0.35 | 相手を倒せる数が最重要 |
| 即死力 (OHKO) | 0.25 | 確1は先手で決まる=テンポ有利 |
| 生存性 | 0.20 | 落とされにくさ |
| 平均ダメージ | 0.20 | 全体的な打点 |

---

## 7. パイプライン全体フロー (8フェーズ)

```
[1/8] Pool building
      singles-ranking出力からビルドロード → メガ分離 → 拡張プール (~257エントリ)
      品質ゲート: 技数 < 2 の個体を除外
                ↓
[2/8] ダメージ行列計算
      257×257×平均3.5技 ≈ 252,000回 → DamageMatrix + SimEnv (天候/SR/砂チップ)
                ↓
[3/8] 構築生成 (モンテカルロ)
      10,000チーム × 6体 (アイテム排他 + 種族排他 + 役割検証)
      roleScore < 25 のメンバーがいるチームは棄却 (50K回再試行上限)
                ↓
[4/8] ラウンドロビン評価
      各チーム vs ランダム200対戦相手 → selectTeam(3体選出) + evaluate3v3
      天候・SR・先制技・反動・チップダメージを考慮
                ↓
[5/8] 3-Core メタ評価 ★NEW
      Phase 4の選出パターンからメタ代表100チームを抽出
      全有効3体コンボ (~2.4M通り) をメタ代表に対してevaluate3v3で評価
      制約: 同種族不可 + メガ最大1体
      コンボスコア = 重み付き勝率 (win=1, draw=0.5, loss=0)
      → 上位200コア + ポケモン別コア統計 + トップパートナー情報
                ↓
[6/8] 精練 (core-guided refinement)
      上位100チームの死に枠 (選出率<5%) を特定
      各死に枠をプール全候補で入れ替え → scoreCandidateByCore()で候補をランキング
      上位30候補のみフルシミュレーション (200ゲーム)
      死に枠ペナルティ: DEAD_MEMBER_PENALTY = ×0.92/枠
                ↓
[7/8] ランキング (脅威分析付き)
      勝率×支配度×死に枠ペナルティでスコア化 → TOP 50構築
      各構築の脅威プロファイル: 殺意/脅威耐性/使用率加重回答率/critical gap
      メガ排他を考慮した回答チェック (非メガ回答優先)
                ↓
[8/8] JSON出力
      {date}-team-matchup.json (topTeams + topCores + pokemonCoreStats)
```

### 計算量見積もり
| フェーズ | 計算量 | 所要時間 |
|---------|--------|---------|
| ダメージ行列 | ~252,000回 calculate() | ~8秒 |
| 構築生成 | 10,000チーム (+ ~3,500棄却) | ~1秒 |
| 選出+評価 | 2,000,000回 | ~20秒 |
| 3-Core評価 | ~2.4M × 100 evaluate3v3 | ~5分 |
| 精練 (core-guided) | ~2,200チーム × 200ゲーム | ~10秒 |
| 脅威分析 | 50チーム × 257対面 | ~2秒 |
| **合計** | | **~6分** |

`--skip-cores` フラグで Phase 5 をスキップ → 従来の全数精練にフォールバック (~54秒)

---

## 7b. 3-Core メタ評価 (Phase 5/8) ★NEW

### 目的
全有効3体コンボ (~2.4M通り) を網羅的に評価し、チーム構築分析とコアガイド精練に活用する。

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
3. 各コンボを100メタ代表に対して evaluate3v3 で評価
4. 有効コンボのスコア平均 → 候補スコア
5. 上位30候補のみフルシミュレーションに進む

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
    poolSize: number;         // 拡張プールサイズ (~257)
    poolFiltered?: number;    // 品質フィルタで除外した数
    teamsRejected?: number;   // 役割検証で棄却した数
  };
  pool: PoolMember[];
  damageMatrix: DamageMatrix;
  topTeams: RankedTeam[];      // TOP 50
  pokemonStats: PokemonTeamStats[];
  topCores?: CoreRanking[];            // ★NEW: 上位200の3体コア
  pokemonCoreStats?: PokemonCoreStats[]; // ★NEW: ポケモン別コア統計
  metaRepresentatives?: MetaRepresentative[]; // ★NEW: メタ代表100チーム
}

interface DamageMatrixEntry {
  bestMove: string;
  minPct: number;
  maxPct: number;
  koN: number;
  koChance: number;
  effectiveness: number;
  isContact: boolean;
  chipPctToAttacker: number;
  weatherChipToDefender: number;
  priorityMaxPct: number;      // 先制技の最大ダメージ%
  priorityKoN: number;
  priorityKoChance: number;
  recoilPctToSelf: number;     // 反動ダメージ%
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
  commonSelections: SelectionPattern[];   // TOP 5 選出パターン
  memberSelectionRates: MemberSelectionRate[];  // メンバー別選出率
  deadMemberCount: number;                      // 死に枠数
  typeProfile: {
    offensiveTypes: string[];
    defensiveWeaks: string[];
  };
  threatProfile?: ThreatProfile;   // 脅威プロファイル
}

interface CoreRanking {
  members: string[];    // ソート済み3体名
  score: number;        // 重み付き勝率 (0-1)
  winCount: number;     // 勝利メタ代表数
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
  weight: number;      // 正規化頻度 (合計=1)
  frequency: number;   // 生観測回数
  winRate: number;
}

interface MemberSelectionRate {
  name: string;
  selectionRate: number;      // 選出率 (0-1)
  winRateWhenSelected: number; // 選出時勝率 (0-1)
}

interface ThreatProfile {
  killPressure: number;      // 0-100: 殺意
  threatResistance: number;  // 0-100: 脅威耐性
  answerRate: number;        // 0-100: 使用率加重回答率
  dominanceScore: number;    // 0-100: 支配度
  criticalGaps: number;      // TOP10使用率で回答なしの数
}

interface SelectionPattern {
  members: string[];
  frequency: number;
  winRate: number;
}

interface PokemonTeamStats {
  name: string;
  pickRate: number;
  selectionRate: number;
  winRateWhenSelected: number;
  commonPartners: { name: string; count: number }[];
}
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
