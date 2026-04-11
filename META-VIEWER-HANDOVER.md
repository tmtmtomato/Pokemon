# メタビューワー 引き継ぎ書

> 作成日: 2026-04-09
> 対象: 今後の保守・拡張担当（Claude含む）

---

## 1. 現状サマリ

| 項目 | 状態 |
|------|------|
| データパイプライン | **完成** — 4トラック (Pikalytics / vgcpast / Analyzer / Viewer) |
| テスト | **55 passing** (5ファイル、home-data/vitest.config.ts) |
| TypeScript | home-data/ 配下の型エラー **0件** |
| ビルド | `npm run build:meta` → `build/meta.html` (1,031 kB / gzip 205 kB) |
| i18n | JA/EN 完全対応 — ポケモン名 1,430件 + 技名 838件 + 性格名 25件 |
| 対応フォーマット | championspreview (265体) + gen9ou (225体) |
| リプレイ解析 | 2,632件 (4ティア: VGC Reg M-A, Pre-Champions VGC/OU/VGC Bo3) |

---

## 2. ビルドと確認方法

**開発サーバーは使用しない。** 常にビルド済みファイルをブラウザで直接開く。

```bash
# データパイプライン実行 (通常は初回のみ。再実行でデータ更新)
npm run home:pikalytics       # Track A: Pikalytics スクレイパー
npm run home:vgcpast          # Track B: vgcpast リプレイ収集・解析
npm run home:analyze          # Track C: マージ → meta.json 生成

# i18n辞書ビルド (ポケモン名/技名のJP辞書を再生成)
node home-data/i18n/build-pokemon-ja.mjs --check
node home-data/i18n/build-moves-ja.mjs --check

# Viewer ビルド
npm run build:meta            # → build/meta.html (viteSingleFile)

# テスト
npx vitest run -c home-data/vitest.config.ts   # 全55テスト
npx tsc --noEmit -p home-data/tsconfig.json     # 型チェック

# スクリーンショット (Playwright、オプション)
node home-data/viewer/screenshot.mjs
```

コード変更時は必ず「変更 → テスト → ビルド → ブラウザ確認」のサイクルで進行する。

---

## 3. データフロー

```
                  Track A: Pikalytics                    Track B: vgcpast.es
                ┌──────────────────┐                  ┌─────────────────────┐
                │ fetch-llms.ts    │                  │ enumerate.ts        │
                │ fetch-format.ts  │                  │ fetch-replays.ts    │
                │ fetch-pokemon.ts │                  │ parse-replay.ts     │
                │ parse-markdown.ts│                  │ parse-all.ts        │
                │ parse-all.ts     │                  │ aggregate.ts        │
                └────────┬─────────┘                  └──────────┬──────────┘
                         │                                       │
         storage/pikalytics/                      storage/vgcpast/parsed/
           {date}/{format}/*.json                   {tier}/*.json
                         │                                       │
                         └──────────────┬────────────────────────┘
                                        ▼
                              Track C: Analyzer
                         ┌──────────────────────┐
                         │ merge-sources.ts      │
                         │ distributions.ts      │
                         │ matchups.ts           │
                         └──────────┬───────────┘
                                    │
                    storage/analysis/{date}-meta.json
                                    │
                                    ▼
                          Track D: Viewer (React 19)
                    ┌───────────────────────────────┐
                    │ main.tsx → App.tsx             │
                    │ ├── Toolbar.tsx                │
                    │ ├── PokemonList.tsx            │
                    │ ├── PokemonDetail.tsx          │
                    │ │   ├── TopBuildSection        │
                    │ │   ├── Section (×5)           │
                    │ │   └── UsageBar               │
                    │ ├── LanguageContext.tsx (JA/EN) │
                    │ └── i18n.ts (辞書読込)          │
                    └───────────────┬───────────────┘
                                    │
                              build/meta.html
                            (スタンドアロンHTML)
```

---

## 4. ディレクトリ構成

```
home-data/
├── analyzer/              Track C: メタ集計パイプライン
│   ├── run-all.ts         オーケストレータ
│   ├── merge-sources.ts   Pikalytics + vgcpast マージ + parseTopBuild
│   ├── merge-sources.test.ts  10テスト
│   ├── distributions.ts   確率質量関数ビュー生成
│   ├── distributions.test.ts  7テスト
│   └── matchups.ts        1v1 ペア勝率表
│
├── fetcher/               初期偵察スクリプト群 (通常使用しない)
│   ├── recon.ts           HOME API レコン
│   ├── extract-dex.ts     bundle.js から辞書抽出
│   ├── fetch-dicts.ts     HOME辞書JSON取得
│   └── (probe*.ts等)      各種プロービング
│
├── i18n/                  翻訳辞書ビルダー
│   ├── build-pokemon-ja.mjs   → storage/i18n/pokemon-ja.json (1,430件)
│   ├── build-moves-ja.mjs     → storage/i18n/moves-ja.json (838件)
│   ├── pokemon-ja-overrides.json  手動上書き (フォルム等)
│   └── moves-ja-overrides.json    手動上書き (将来用)
│
├── pikalytics/            Track A: Pikalytics スクレイパー
│   ├── run-all.ts         オーケストレータ
│   ├── fetch-llms.ts      API仕様ダウンロード
│   ├── fetch-format-index.ts  フォーマット別Top50取得
│   ├── fetch-pokemon.ts   ポケモン個別markdown取得
│   ├── parse-markdown.ts  純粋パーサー
│   ├── parse-markdown.test.ts  11テスト
│   └── parse-all.ts       バッチ変換
│
├── storage/               全データ保管 (5,500+ファイル)
│   ├── analysis/          Track C 出力: meta.json, sources.json, matchups.json
│   ├── i18n/              翻訳辞書JSON
│   ├── pikalytics/        Track A 出力: {date}/{format}/*.json
│   ├── raw-recon/         初期偵察の生レスポンス
│   └── vgcpast/           Track B: replays/ + parsed/ (2,600+件)
│
├── types/                 全型定義
│   ├── analytics.ts       MetaSnapshot / FormatMeta / PokemonMeta / TopBuild
│   ├── api.ts             HOME API レスポンス型
│   ├── dex.ts             辞書型
│   ├── pikalytics.ts      Pikalytics markdown 構造型
│   └── replay.ts          Showdown リプレイログ型
│
├── vgcpast/               Track B: vgcpast.es リプレイ解析
│   ├── run-all.ts         オーケストレータ
│   ├── enumerate.ts       ティアURL列挙
│   ├── fetch-replays.ts   リプレイHTML取得 (レート制限付)
│   ├── parse-replay.ts    Showdown ログパーサー
│   ├── parse-replay.test.ts  1テスト
│   ├── parse-all.ts       バッチ変換
│   └── aggregate.ts       ティア統計集計
│
├── viewer/                Track D: React 19 ビューワー
│   ├── main.tsx           エントリポイント (LanguageProvider でラップ)
│   ├── App.tsx            ルートコンポーネント (状態管理)
│   ├── LanguageContext.tsx JA/EN 切替コンテキスト + localStorage 永続化
│   ├── i18n.ts            辞書ロード + localize* ヘルパー群
│   ├── utils.ts           純粋ユーティリティ (ソート/フィルタ/検索)
│   ├── utils.test.ts      26テスト
│   ├── styles.css         Tailwind v4 + カスタムスクロール
│   ├── screenshot.mjs     Playwright スクリーンショット (JA+EN)
│   └── components/
│       ├── Toolbar.tsx     フォーマットタブ / 検索 / Sort / Source / JA|EN / Dark
│       ├── PokemonList.tsx 左ペイン (ランク / 名前 / 使用率 / 勝率)
│       ├── PokemonDetail.tsx 右ペイン (ヘッダー / 型調整 / 技 / 特性 / 持ち物 / テラ / 相方)
│       └── UsageBar.tsx    水平バーグラフ
│
├── tsconfig.json          TypeScript 設定
└── vitest.config.ts       テスト設定
```

---

## 5. 主要データ型

### MetaSnapshot (最終出力)

```typescript
interface MetaSnapshot {
  generatedAt: string;       // ISO タイムスタンプ
  formats: FormatMeta[];     // フォーマット別データ
}

interface FormatMeta {
  formatKey: string;         // "championspreview" | "gen9ou"
  display: string;           // "Pokemon Champions VGC 2026 (preview)"
  sources: ("pikalytics" | "vgcpast" | "home")[];
  totalReplays: number;
  totalTeams: number;
  pokemon: PokemonMeta[];    // ランク順
}

interface PokemonMeta {
  name: string;              // "Incineroar", "Ogerpon-Wellspring"
  usagePct: number;          // 0-100 (Pikalytics優先)
  rank: number;              // 1-indexed
  winRate?: number;          // 0-100 (vgcpast由来、未取得時 undefined)
  moves: WeightedRow[];      // 技採用率
  abilities: WeightedRow[];  // 特性採用率
  items: WeightedRow[];      // 持ち物採用率
  teraTypes?: WeightedRow[]; // テラスタイプ分布
  teammates: WeightedRow[];  // 相方出現率
  topBuild?: TopBuild;       // 型調整 (性格+努力値配分)
  notes: string[];           // データ出典 ("Pikalytics 2026-03", "vgcpast 88 games (...)")
}

interface TopBuild {
  nature: string;            // "Jolly", "Relaxed" 等
  evs: string;               // "252/0/4/0/0/252" (HP/Atk/Def/SpA/SpD/Spe)
  pct: number;               // 採用率 0-100
}

interface WeightedRow {
  name: string;              // 技名 / 特性名 / アイテム名 等
  pct: number;               // 0-100
  n?: number;                // vgcpast由来の実数カウント
}
```

---

## 6. i18n アーキテクチャ

### 辞書の生成元

| 辞書 | ソースA | ソースB | エントリ数 |
|------|---------|---------|-----------|
| pokemon-ja.json | Showdown pokedex.js (1,000+ 種) | HOME 10-dex-ja.json (poke) | 1,430 |
| moves-ja.json | Showdown moves.js (954 技) | HOME 10-dex-ja.json (waza) | 838 |
| 性格 (NATURE_JA) | i18n.ts にハードコード | — | 25 |

### ランタイム API (i18n.ts)

```typescript
type Lang = "ja" | "en";

localizePokemon(name: string, lang?: Lang): string;  // デフォルト JA
localizeMove(name: string, lang?: Lang): string;      // デフォルト JA
localizeNature(name: string, lang?: Lang): string;    // デフォルト JA
natureLabel(name: string, lang?: Lang): string;       // "ようき (Jolly)" or "Jolly (ようき)"
localizedSearchKey(name: string): string;             // 検索用: "Incineroar ガオガエン"
```

### 言語コンテキスト (LanguageContext.tsx)

```typescript
const { lang, setLang, toggleLang } = useLang();
// localStorage キー: "champions-meta-viewer:lang"
// デフォルト: "ja"
```

---

## 7. Viewer コンポーネント仕様

### Toolbar

| 機能 | 実装 |
|------|------|
| フォーマット切替 | `<button>` タブ (championspreview / gen9ou) |
| ポケモン検索 | JA/EN 両方でインクリメンタル検索 |
| Min games | vgcpast 最低ゲーム数フィルタ |
| Sort | Rank / Usage % / Win rate / Name |
| Source | All / Pikalytics / vgcpast / Both |
| JA/EN | 言語トグル (10px uppercase バッジ) |
| Dark/Light | テーマトグル |

### PokemonList (左ペイン)

- ランク番号 / 名前 (プライマリ言語 + サブ言語) / 使用率 / 勝率
- Pika / vgcpast バッジ
- 選択行はボーダーハイライト

### PokemonDetail (右ペイン)

- ヘッダー: 名前 (バイリンガル) / ランク / 使用率 / 勝率 / 出典バッジ
- 型調整セクション (TopBuild): 性格ラベル / 採用率 / 6マス EV 表示 (色分: 252=emerald, 0=gray, 中間=amber)
- 5セクション: 技 / 特性 / 持ち物 / テラスタイプ / 相方 (各 UsageBar)

---

## 8. 既知の制限事項

| 制限 | 理由 |
|------|------|
| championspreview の型調整データなし | Pikalytics 側に spread/nature の FAQ がない |
| 特性名・持ち物名は英語のみ | 辞書未作成 (HOME の tokusei / itemname で拡張可能) |
| HOME 公式APIはまだ Champions 未対応 | bundle.js 監視中だが API エンドポイント未発見 |
| gen9ou の勝率データなし | vgcpast が Pre-Champions ティアのみ対象 |

---

## 9. 拡張ポイント

1. **特性名/持ち物名の日本語化**: HOME の `11-tokuseiinfo_ja.json` / `11-itemname_ja.json` から辞書を生成して `localizeAbility()` / `localizeItem()` を追加
2. **新フォーマット追加**: `merge-sources.ts` の `FORMAT_CONFIGS` に新しいエントリを追加
3. **HOME API 対応**: `fetcher/monitor-bundle.ts` で bundle 変更を検出したら `recon.ts` で API を再探査
4. **リプレイ追加取得**: `npm run home:vgcpast` を再実行するだけで差分取得
5. **確率質量関数**: `distributions.ts` の出力を活用してビューワーに PMF チャートを追加
6. **対戦相性表**: `matchups.ts` の出力をビューワーに組み込み (マッチアップチャート)
