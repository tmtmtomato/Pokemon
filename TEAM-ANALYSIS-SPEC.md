# Team Analysis Viewer — 構築・選出分析ツール仕様書

## 概要

vgcpastリプレイデータから、**構築単位の出現頻度・選出パターン・コア分析**を行い、
`build/teams.html` として単一HTMLに出力する。meta.html（個体単位の統計）の**補完ツール**。

### 想定ユーザー質問

- 「今のメタで多い構築は何？」
- 「この6体だと何を選出すべき？」
- 「このコアと一緒に入れるべき残り枠は？」
- 「この3体は構築に入れるけど一緒に選出するの？別々に出すの？」

---

## データソース

| 情報 | ソース | 場所 |
|------|--------|------|
| 6体構築 (preview) | vgcpast parsed replay | `team.preview[].species` |
| 4体選出 (brought) | vgcpast parsed replay | `team.brought[].species` |
| 勝敗 | vgcpast parsed replay | `parsed.winner` |
| メガ進化 | brought内のspecies変化 | `Charizard` → `Charizard-Mega-Y` |

### データ規模 (2026-04-08時点)

| Tier | リプレイ数 | チーム観測 | ユニーク構築 | 10回以上出現 |
|------|-----------|-----------|-------------|-------------|
| Gen9Pre-ChampionsVGC | 2,000 | 4,000 | 2,484 | 33 |
| Gen9VGCRegulationM-A | 225 | 450 | 268 | 2 |
| Gen9VGCRegulationM-A(Bo3) | 44 | 88 | 45 | 0 |

3体コアは **43件が100回以上** 出現しており、統計的に信頼できる分析が可能。

---

## 分析パイプライン

### Step 1: team-aggregate.ts

リプレイJSONを走査し、以下を生成:

```typescript
interface TeamEntry {
  /** ソート済みspeciesリスト (canonical key) */
  species: string[];       // ["Charizard", "Farigiraf", "Incineroar", ...]
  key: string;             // "Charizard / Farigiraf / Incineroar / ..."
  count: number;           // 出現回数
  wins: number;
  winRate: number;         // 0-100
  /** 選出パターン: ソート済み4体key → 統計 */
  selections: SelectionEntry[];
  /** ポケモン別の選出率 (この構築においてbroughtに含まれた割合) */
  perMonSelectionRate: Record<string, number>;  // species → 0-100
}

interface SelectionEntry {
  /** ソート済みbrought species (メガ形態は基本形に正規化) */
  species: string[];
  key: string;
  count: number;
  wins: number;
  winRate: number;
  /** この構築におけるこの選出の選択率 */
  pickRate: number;  // 0-100
}
```

**メガ進化の正規化**: `Charizard-Mega-Y` → `Charizard` に戻す。
brought内のメガ形態は試合中に進化した結果であり、選出時点では基本形で選んでいるため。

### Step 2: core-aggregate.ts

3体コア（C(6,3)=20通り/チーム）を集計:

```typescript
interface CoreEntry {
  species: string[];       // 3体
  key: string;
  /** コアがpreviewに含まれる回数 */
  teamCount: number;
  /** コアの3体全員がbroughtに含まれる回数 */
  coPickCount: number;
  /** 3体同時選出率: coPickCount / teamCount */
  coPickRate: number;      // 0-100
  /** 3体同時選出時の勝率 */
  coPickWinRate: number;
  /** 3体のうち2体だけ選出される場合のパターン */
  partialPicks: { pair: string[]; count: number; winRate: number }[];
  /** このコアを含む構築リスト (上位N件) */
  topTeams: { teamKey: string; count: number; winRate: number }[];
  /** コアと同居する残り3枠の頻出ポケモン */
  companions: { name: string; count: number; pct: number }[];
}
```

### Step 3: 出力JSON

```
home-data/storage/analysis/{date}-teams.json
```

```typescript
interface TeamAnalysis {
  generatedAt: string;
  tiers: string[];
  totalReplays: number;
  totalTeams: number;
  /** 出現N回以上の構築 (降順) */
  teams: TeamEntry[];
  /** 出現N回以上の3体コア (降順) */
  cores: CoreEntry[];
}
```

**足切りライン**:
- チーム: `count >= 3` (最低3回観測)
- コア: `count >= 10` (最低10回観測)

---

## ビューア画面構成

### ヘッダー

```
[タブ: 構築一覧 | コア分析]    [Tier選択]    [最小出現数スライダー]
```

### タブ1: 構築一覧

**左パネル**: 構築リスト (スクロール可能)

```
┌──────────────────────────────────┐
│ #1  55回  勝率47.3%              │
│ リザードン / キリンアルマ /       │
│ ガオガエン / コータス /           │
│ ガチグマ / フシギバナ             │
│──────────────────────────────────│
│ #2  34回  勝率41.2%              │
│ ...                              │
└──────────────────────────────────┘
```

**右パネル**: 選択した構築の詳細

```
┌──────────────────────────────────────────┐
│ ■ 構築概要                                │
│   出現: 55回  勝率: 47.3%                 │
│                                           │
│ ■ メンバー別 選出率                        │
│   ガオガエン    ████████████░░  82%        │
│   ガチグマ      ██████████░░░░  75%        │
│   リザードン    ████████░░░░░░  62%        │
│   フシギバナ    ███████░░░░░░░  56%        │
│   キリンアルマ  █████░░░░░░░░░  45%        │
│   コータス      ████░░░░░░░░░░  38%        │
│                                           │
│ ■ 選出パターン TOP 5                       │
│   1. ガオガエン/ガチグマ/リザ/フシギ       │
│      → 9回 (16.4%) 勝率 55.6%             │
│   2. キリン/ガオガエン/コータス/ガチグマ    │
│      → 8回 (14.5%) 勝率 37.5%             │
│   3. ...                                  │
│                                           │
│ ■ 同時選出相関                             │
│   よく一緒に出す:                          │
│     ガオガエン+ガチグマ: 68%               │
│     リザードン+フシギバナ: 72%  ← 晴れ軸   │
│   出し分け:                                │
│     リザードン vs コータス: 同時15%のみ     │
└──────────────────────────────────────────┘
```

### タブ2: コア分析

**左パネル**: コアリスト

```
┌──────────────────────────────────┐
│ #1  320回  同時選出58%  勝率52%  │
│ キリンアルマ / ガオガエン /       │
│ ガチグマ                          │
│──────────────────────────────────│
│ #2  319回  同時選出44%  勝率49%  │
│ アーキテウス / バスラオ /         │
│ ペリッパー                        │
└──────────────────────────────────┘
```

**右パネル**: コア詳細

```
┌──────────────────────────────────────────┐
│ ■ キリンアルマ / ガオガエン / ガチグマ    │
│   出現: 320構築  同時選出: 58.1%          │
│   同時選出時勝率: 52.3%                   │
│                                           │
│ ■ 部分選出パターン                        │
│   3体全員選出:    186回 (58.1%)  wr 52.3% │
│   キリン+ガオガ:   52回 (16.3%)  wr 48.1% │
│   ガオガ+ガチグマ: 38回 (11.9%)  wr 44.7% │
│   キリン+ガチグマ: 21回  (6.6%)  wr 42.9% │
│                                           │
│ ■ このコアを含む構築 TOP 5                 │
│   1. +コータス/リザードン/フシギバナ 55回  │
│   2. +シンチャ/トルネロス/フシギバナ 12回  │
│   3. ...                                  │
│                                           │
│ ■ 残り3枠の頻出ポケモン                   │
│   フシギバナ    32.5%                      │
│   リザードン    28.1%                      │
│   コータス      25.0%                      │
│   シンチャ      18.4%                      │
│   フシギバナ    15.6%                      │
└──────────────────────────────────────────┘
```

---

## 同時選出相関 (Pair Co-Selection)

構築内の全ペア C(6,2)=15 について:
- **同時選出率**: 2体が同時にbroughtに含まれる確率
- **期待値との差**: ランダム選出なら C(4,2)/C(6,2) = 40%。
  これより高い → セット運用、低い → 出し分け

表示方法: 6×6ヒートマップ（対角線を除く上三角）

```
          ガオガエン  ガチグマ  リザードン  フシギバナ  キリン  コータス
ガオガエン    -        68%↑     55%↑      48%       45%    32%↓
ガチグマ              -        52%↑      44%       58%↑   30%↓
リザードン                     -         72%↑↑     38%    15%↓↓
...
```

`↑` = 期待値40%より有意に高い (セット運用)
`↓` = 期待値40%より有意に低い (出し分け)

---

## 実装構成

```
home-data/
  analyzer/
    team-aggregate.ts     # Step 1+2: リプレイ → teams.json
  viewer-teams/
    App.tsx               # ルートコンポーネント
    components/
      TeamList.tsx        # 構築一覧 (左パネル)
      TeamDetail.tsx      # 構築詳細 (右パネル)
      CoreList.tsx        # コア一覧 (左パネル)
      CoreDetail.tsx      # コア詳細 (右パネル)
      PairHeatmap.tsx     # 同時選出ヒートマップ
      SelectionBar.tsx    # 選出パターン表示バー
    utils.ts              # ソート/フィルタ/日本語化
  types/
    team-analysis.ts      # 型定義
```

### ビルド

```bash
npm run build:teams    # → build/teams.html
```

`vite.config.ts` に `VITE_ENTRY=teams` エントリを追加。
`viteSingleFile()` で単一HTMLに埋め込み。

---

## 日本語化

- ポケモン名: 既存の `i18n.ts` / `localizePokemon()` を流用
- UI ラベル: `LanguageContext` を流用
- コア名は `localizePokemon()` で各メンバーを変換して ` / ` 結合

---

## 優先順位

### P0 (MVP)

1. `team-aggregate.ts`: リプレイ → `teams.json` 生成
2. 構築一覧 + 詳細表示（メンバー別選出率、選出パターンTOP N）
3. コア一覧 + 詳細表示（同時選出率、部分選出、残り枠）
4. 日本語ポケモン名表示

### P1 (次フェーズ)

5. 同時選出ペアヒートマップ
6. Tier選択切り替え（現在は全tier合算のみ）
7. ソート切り替え（出現順/勝率順/選出率順）

### P2 (将来)

8. 対面依存選出: 「相手の構築に X がいるとき Y の選出率が上がる」
9. リード分析: brought配列の先頭2体 = 初手先発と仮定した分析
10. 時系列変化: 日付別のメタ推移

---

## 注意事項

- **メガ進化の正規化**: `brought` 内の `Charizard-Mega-Y` → `Charizard` に戻す。
  preview は基本形、brought はメガ後なので一致させる必要がある。
  正規化マップ: `species.json` の `mega` フィールドから自動生成可能。
- **preview欠損**: 一部リプレイで preview が6体未満（4-5体）あり。
  `preview.length < 6` の場合は構築分析からは除外（選出分析のみに使う）。
- **Bo3**: 同一マッチの複数戦は同じ構築の重複カウントになる。
  Bo3 tierを分離するか、同一対戦IDでの重複除去を検討。
- **サンプルサイズ警告**: 出現回数が少ない構築/コアには信頼度インジケータを表示。
  `n < 5`: 「参考値」、`n < 10`: 「少量サンプル」
