# メタビューワー 仕様書

> 作成日: 2026-04-09
> バージョン: 1.0 (初期リリース)
> 対象: Champions Meta Viewer (build/meta.html)

---

## 1. 概要

Pokemon Champions (2026/4/8 リリース) の競技メタゲームを多角的に分析するための
スタンドアロン HTML ビューワー。複数の公開データソースから使用率・勝率・型調整・
技採用率などを集約し、フォーマット切替・検索・ソート・言語切替に対応した
インタラクティブな UI を提供する。

### 設計方針

- **完全オフライン**: `viteSingleFile` により JS/CSS/データを全て HTML に埋め込み
- **ネットワーク不要**: `file://` プロトコルでブラウザから直接閲覧可能
- **バイリンガル**: 日本語/英語の完全切替（ポケモン名・技名・性格名・UIラベル）
- **ダークモード**: デフォルトダーク、ワンクリックでライト切替

---

## 2. データソース

### 2.1 Track A — Pikalytics (1次ソース)

| 項目 | 値 |
|------|---|
| エンドポイント | `pikalytics.com/ai/pokedex/{format}/{pokemon}` |
| データ形式 | Markdown (LLM向けAI API) |
| 取得データ | 使用率 / ランク / 技採用率 / 特性 / 持ち物 / テラタイプ / 相方 / 型調整(FAQ) |
| 対応フォーマット | `championspreview`, `gen9ou` |
| 対象ポケモン数 | 各フォーマット上位50体 |
| 更新頻度 | 手動実行 (`npm run home:pikalytics`) |

**型調整データ**: Pikalytics markdown の FAQ セクションに含まれる自然言語テキスト:
> "The top build for X features a **Jolly** nature with an EV spread of \`0/252/4/0/0/252\`. This configuration accounts for 22.21% of competitive builds."

これを正規表現で解析し `TopBuild` 型に変換する。
championspreview フォーマットではこのデータが提供されていないため、`topBuild` は `undefined` になる。

### 2.2 Track B — vgcpast.es (2次ソース)

| 項目 | 値 |
|------|---|
| エンドポイント | `replays.vgcpast.es/{tier}/{battleId}.html` |
| データ形式 | Showdown プロトコルログ (HTML 埋め込み) |
| 取得データ | 勝率 / テラタイプ / チーム構成 / 対面相性 |
| 対応ティア | Gen9VGCRegulationM-A, Gen9Pre-ChampionsVGC (+ Bo3), Gen9Pre-ChampionsOU |
| リプレイ件数 | 2,632件 |

### 2.3 マージ戦略

1. **Pikalytics 優先**: 使用率 / ランク / 技 / 特性 / 持ち物 / 相方は Pikalytics を採用
2. **vgcpast 補完**: 勝率 / テラタイプは vgcpast から取得
3. **vgcpast 専用**: Pikalytics 上位50に含まれないポケモンは vgcpast のカウントから WeightedRow を生成
4. **出典注記**: 各ポケモンの `notes[]` にデータ元を記録 (例: "Pikalytics 2026-03", "vgcpast 88 games (VGC Reg M-A + Pre-Champions VGC)")

---

## 3. UI 仕様

### 3.1 画面構成

```
┌──────────────────────────────────────────────────────────────┐
│ [Header] Champions Meta Viewer  [format tabs] [toolbar]     │
├──────────────┬───────────────────────────────────────────────┤
│ Left Pane    │ Right Pane                                    │
│ (Pokemon     │ (Pokemon Detail)                              │
│  List)       │                                               │
│              │ ┌─────────────────────────────────────────┐   │
│ #1 xxxxxx    │ │ Header: name / rank / usage / winRate   │   │
│ #2 xxxxxx    │ │ / sources                               │   │
│ #3 xxxxxx    │ └─────────────────────────────────────────┘   │
│ ...          │ ┌─────────────────────────────────────────┐   │
│              │ │ 型調整 / Top Build                      │   │
│              │ │ 性格 / EV配分 / 採用率                   │   │
│              │ └─────────────────────────────────────────┘   │
│              │ ┌──────────────┐ ┌──────────────┐            │
│              │ │ Top Moves    │ │ Top Abilities│            │
│              │ ├──────────────┤ ├──────────────┤            │
│              │ │ Top Items    │ │ Tera Types   │            │
│              │ ├──────────────┤ ├──────────────┤            │
│              │ │ Top Teammates│ │              │            │
│              │ └──────────────┘ └──────────────┘            │
├──────────────┴───────────────────────────────────────────────┤
│ [Footer] Generated at ... / formats / data sources          │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 ツールバー

| 要素 | 機能 | 型 | デフォルト |
|------|------|----|----------|
| フォーマットタブ | championspreview / gen9ou 切替 | ボタン群 | 先頭フォーマット |
| 検索ボックス | ポケモン名インクリメンタル検索 (JA/EN 両対応) | テキスト入力 | 空 |
| Min games | vgcpast 最低ゲーム数フィルタ | 数値入力 | 0 |
| Sort | ソート順切替 | セレクト | Rank |
| Source | データソースフィルタ | セレクト | All |
| JA/EN | 言語切替トグル | ボタン | JA |
| Dark/Light | テーマ切替 | ボタン | Dark |

### 3.3 ソート仕様

| キー | ソート方向 | 備考 |
|------|-----------|------|
| Rank | 昇順 | Pikalytics 使用率ランク (1=最高) |
| Usage % | 降順 | 使用率パーセンテージ |
| Win rate | 降順 | 勝率 (vgcpast 由来、未取得は最下位) |
| Name | 昇順 | 日本語 collation (localeCompare "ja") |

### 3.4 ソースフィルタ

| 値 | 表示条件 |
|----|---------|
| All | フィルタなし |
| Pikalytics | notes に "Pikalytics" を含むもののみ |
| vgcpast | notes に "vgcpast" を含むもののみ |
| Both | 両方を含むもののみ |

### 3.5 左ペイン — ポケモンリスト

各行の表示内容:

| フィールド | 位置 | 表示例 |
|-----------|------|--------|
| ランク | 左端 | #1 |
| プライマリ名 | 中央上段 | イダイナキバ (JA) / Great Tusk (EN) |
| サブ名 | 中央下段 | Great Tusk (JA) / イダイナキバ (EN) |
| ソースバッジ | 中央最下段 | `PIKA` `VGCPAST 88` |
| 使用率 | 右端上段 | 30.59% |
| 勝率 | 右端下段 | wr 40.9% |

選択行はボーダー左 4px ブルー + 背景ハイライト。

### 3.6 右ペイン — ポケモン詳細

#### ヘッダー

| フィールド | 表示 |
|-----------|------|
| フォーマット名 | 上部サブタイトル |
| ポケモン名 (プライマリ) | 見出し 2xl bold |
| ポケモン名 (サブ) | サブテキスト |
| ランク | 右上 #N |
| 使用率 | 数値 + ラベル |
| 勝率 | 数値 + ラベル (未取得時 "-") |
| 出典 | バッジ群 |

#### 型調整セクション (TopBuild)

`topBuild` が存在する場合のみ表示。

| フィールド | 表示例 (JA) | 表示例 (EN) |
|-----------|------------|------------|
| セクション見出し | 型調整 / Top Build | Top Build / 型調整 |
| 性格 | ようき (Jolly) | Jolly (ようき) |
| 採用率 | 採用率 22.21% | Adoption 22.21% |
| EV 6マス | HP:0, 攻:252, 防:4, 特攻:0, 特防:0, 速:252 | HP:0, ATK:252, DEF:4, SPA:0, SPD:0, SPE:252 |
| 色分け | 252=emerald, 0=gray, 中間値=amber | 同左 |
| 生EV文字列 | EV: 0/252/4/0/0/252 | 同左 |

#### 5セクション (2列グリッド)

各セクションの構造:

| セクション | タイトル (JA) | タイトル (EN) | アクセントカラー | 翻訳 |
|-----------|-------------|-------------|----------------|------|
| 技 | 技 / Top Moves | Top Moves | blue | ✅ (moves-ja.json) |
| 特性 | 特性 / Top Abilities | Top Abilities | emerald | ❌ (英語のまま) |
| 持ち物 | 持ち物 / Top Items | Top Items | amber | ❌ (英語のまま) |
| テラスタイプ | テラスタイプ / Tera Types | Tera Types | violet | ❌ |
| 相方 | 相方 / Top Teammates | Top Teammates | pink | ✅ (pokemon-ja.json) |

各セクション最大 10 行表示。各行は `UsageBar` コンポーネント (ラベル + 水平バー + パーセント)。

---

## 4. i18n 仕様

### 4.1 対応範囲

| カテゴリ | JA対応 | 辞書サイズ | ソース |
|---------|--------|-----------|--------|
| ポケモン名 | ✅ | 1,430件 | Showdown pokedex + HOME dex + 手動上書き |
| 技名 | ✅ | 838件 | Showdown moves.js + HOME waza |
| 性格名 | ✅ | 25件 | i18n.ts ハードコード |
| 特性名 | ❌ | — | 未実装 (HOME tokusei で拡張可能) |
| 持ち物名 | ❌ | — | 未実装 (HOME itemname で拡張可能) |
| UIラベル | ✅ | — | PokemonDetail.tsx 内インライン |

### 4.2 辞書生成フロー

```
Showdown pokedex.js ──┐                HOME 10-dex-ja.json (poke)
                      ├─ build-pokemon-ja.mjs ──→ pokemon-ja.json
overrides.json ───────┘

Showdown moves.js ────┐                HOME 10-dex-ja.json (waza)
                      ├─ build-moves-ja.mjs ───→ moves-ja.json
overrides.json ───────┘
```

### 4.3 言語切替

- React Context (`LanguageContext.tsx`) で `Lang = "ja" | "en"` を管理
- `localStorage` キー `champions-meta-viewer:lang` に永続化
- デフォルト `"ja"` (日本語)
- 未翻訳エントリは英語にフォールバック

### 4.4 検索仕様

検索は常に JA + EN 両方の名前にマッチする（UIの言語設定に関係なく）。
`localizedSearchKey(name)` が `"Incineroar ガオガエン"` のようなキーを生成し、
部分一致で検索する。

---

## 5. 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | React 19 |
| 状態管理 | React useState + useContext (外部ライブラリ不使用) |
| CSS | Tailwind CSS v4 |
| バンドラー | Vite + vite-plugin-singlefile |
| 言語 | TypeScript (strict) |
| テスト | Vitest |
| スクリーンショット | Playwright (オプション) |
| データ取得 | Node.js スクリプト (tsx で実行) |

---

## 6. npm スクリプト

```bash
# データパイプライン
npm run home:pikalytics        # Track A: Pikalytics 全取得・パース
npm run home:vgcpast           # Track B: vgcpast 全取得・解析・集計
npm run home:vgcpast:enum      # Track B: 列挙のみ
npm run home:analyze           # Track C: マージ・分布・対戦表

# i18n
node home-data/i18n/build-pokemon-ja.mjs [--check]
node home-data/i18n/build-moves-ja.mjs [--check]

# ビルド
npm run build:meta             # → build/meta.html

# テスト
npx vitest run -c home-data/vitest.config.ts       # home-data 全テスト (55)
npx tsc --noEmit -p home-data/tsconfig.json         # 型チェック

# スクリーンショット
node home-data/viewer/screenshot.mjs
```

---

## 7. テスト一覧

| テストファイル | テスト数 | 対象 |
|-------------|---------|------|
| analyzer/merge-sources.test.ts | 10 | mergeFormat / parseTopBuild / combineVgcpastTiers |
| analyzer/distributions.test.ts | 7 | buildDistributions / toPmf |
| pikalytics/parse-markdown.test.ts | 11 | parsePikalyticsMarkdown |
| vgcpast/parse-replay.test.ts | 1 | parseReplay (フィクスチャ) |
| viewer/utils.test.ts | 26 | matchesQuery / sort / filter / formatPct / barWidth |
| **合計** | **55** | — |

---

## 8. ファイルサイズ

| コンポーネント | サイズ | gzip |
|-------------|--------|------|
| build/meta.html | 1,031 kB | 205 kB |
| うち meta.json (データ) | ~650 kB | ~150 kB |
| うち pokemon-ja.json | ~45 kB | ~15 kB |
| うち moves-ja.json | ~25 kB | ~8 kB |
| うち React + Tailwind + ロジック | ~300 kB | ~32 kB |

---

## 9. 既知の制約と今後の拡張

### 制約

1. **championspreview の型調整なし** — Pikalytics がこのフォーマットの spread FAQ を提供していない
2. **特性名・持ち物名は未翻訳** — Showdown の abilities.js / items.js と HOME 辞書の結合が必要
3. **HOME 公式 API 未対応** — Champions 用 API エンドポイントが未発見 (bundle.js 監視中)
4. **gen9ou は勝率データなし** — vgcpast のティアマッピングに gen9ou が含まれない
5. **データ更新は手動** — パイプライン各ステップを手動実行する必要がある

### 拡張候補

| 優先度 | 機能 | 実装コスト |
|-------|------|----------|
| 高 | 特性名/持ち物名の日本語化 | 小 (build-abilities-ja.mjs / build-items-ja.mjs を新規作成) |
| 高 | 確率質量関数チャート (PMF) | 中 (distributions.ts 出力の可視化) |
| 中 | 対戦相性マトリクス | 中 (matchups.ts 出力の可視化) |
| 中 | ティア比較ビュー | 中 (2フォーマットのポケモン使用率差分) |
| 低 | 自動更新 CI | 大 (GitHub Actions + 定期スクレイプ) |
| 低 | HOME 公式データ統合 | 不明 (API エンドポイント発見待ち) |
