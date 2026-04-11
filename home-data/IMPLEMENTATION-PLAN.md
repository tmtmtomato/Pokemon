## Pokemon Champions Data Pipeline — Implementation Plan

> 競技 Pokemon Champions の使用率/パターンデータを複数ソースから集約し、HTML 上で多角的に閲覧できるパイプラインを構築する。

---

## 0. Goal & Scope

- **目的**: SV から Champions (2026/4/8 リリース) への移行期において、現実のメタゲーム使用率・型・チーム構成・対面相性を、なるべく多くの公開データから集約する。
- **量的目標**: 「膨大なデータ量を全て使う」前提。1 試合 1 行は捨てずに残し、後段での集計で初めて削る方針。
- **最終成果物**: ローカルブラウザで開くだけで動く単一 HTML (`build/champions-meta.html`)。`viteSingleFile` で JS/CSS 埋め込み。

## 1. Data Sources

| ID | Source | URL pattern | Format(s) | 役割 |
|---|---|---|---|---|
| A1 | Pikalytics LLM markdown | `/ai/pokedex/{format}/{pokemon}` | `championspreview` (Pre-Champions VGC), `gen9vgc2025regi`, `gen9vgc2026regf` | 集計済み使用率の即時取得 |
| A2 | Pikalytics format index | `/ai/pokedex/{format}` | 同上 | 各フォーマットの上位 50 Pokemon リスト |
| A3 | Pikalytics llms-full.txt | `/llms-full.txt` | n/a | API 仕様の不変キャッシュ |
| B1 | vgcpast.es directory | `https://replays.vgcpast.es/{tier}/` | `Gen9VGCRegulationM-A`, `Gen9Pre-ChampionsVGC`, `Gen9Pre-ChampionsVGC(Bo3)`, `Gen9Pre-ChampionsOU` | 全リプレイ URL の列挙 |
| B2 | vgcpast.es replay | `https://replays.vgcpast.es/{tier}/{file}.html` | Showdown protocol log 埋め込み HTML | 生試合データ |
| C1 | Pokemon HOME ranking | (既実装) | SV ladder | クロス検証用 |

## 2. Architecture

```
home-data/
├── IMPLEMENTATION-PLAN.md    # 本ファイル
├── tsconfig.json
├── pikalytics/               # Track A 実装
│   ├── fetch-llms.ts
│   ├── fetch-format-index.ts
│   ├── fetch-pokemon.ts
│   ├── parse-markdown.ts
│   └── README.md
├── vgcpast/                  # Track B 実装
│   ├── enumerate.ts          # 各 tier の listing HTML を取得して URL リストを作成
│   ├── fetch-replays.ts      # rate-limited で全 replay を取得
│   ├── parse-replay.ts       # protocol log → ParsedReplay
│   ├── aggregate.ts          # 複数 ParsedReplay → 集計 JSON
│   └── README.md
├── analyzer/                 # Track C 実装
│   ├── merge-sources.ts      # Pikalytics + vgcpast + HOME を 1 本のメタ JSON に統合
│   ├── distributions.ts      # 確率分布 (move/item/ability/teammate)
│   ├── matchups.ts           # 1v1 相性表 (vgcpast.es ベース)
│   └── README.md
├── viewer/                   # Track D 実装
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.tsx もしくは vanilla TS
│   │   └── components/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json (root の package.json に script 追記でも可)
├── types/
│   ├── api.ts                # HOME (既存)
│   ├── dex.ts                # HOME 辞書 (既存)
│   ├── pikalytics.ts         # 新規: Pikalytics の構造化型
│   ├── replay.ts             # 新規: ParsedReplay 型
│   └── analytics.ts          # 新規: 統合後の MetaSnapshot 型
├── storage/
│   ├── raw-recon/            # 既存の調査用ファイル
│   ├── pikalytics/{date}/{format}/
│   │   ├── _index.json       # 取得した Pokemon の一覧 + meta
│   │   └── {pokemon}.md      # 生 markdown レスポンス
│   ├── vgcpast/
│   │   ├── listings/{tier}.html      # 直近の listing スナップショット
│   │   ├── replays/{tier}/{id}.html  # 生 HTML
│   │   └── parsed/{tier}/{id}.json   # ParsedReplay
│   └── analysis/
│       ├── {date}-meta.json          # 統合済み MetaSnapshot
│       └── {date}-distributions.json
└── fetcher/                  # 既存 (HOME 関連)
```

## 3. Type Definitions (sketch)

### `types/pikalytics.ts`

```ts
export interface PikalyticsPokemonStats {
  pokemon: string;            // "Incineroar"
  format: string;             // "championspreview"
  game: string;               // "Pokémon Scarlet Violet"
  dataDate: string;           // "2026-03"
  moves: UsageRow[];          // up to 10
  abilities: UsageRow[];
  items: UsageRow[];
  teammates: UsageRow[];
  teraTypes?: UsageRow[];
  spreads?: SpreadRow[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number; bst: number };
  rawMarkdown: string;        // 原文も保持
}
export interface UsageRow { name: string; pct: number }   // pct は 0–100
export interface SpreadRow { ev: string; nature: string; pct: number }

export interface PikalyticsFormatIndex {
  format: string;
  fetchedAt: string;
  topPokemon: { name: string; usagePct: number; rank: number; href?: string }[];
}
```

### `types/replay.ts`

```ts
export interface ParsedReplay {
  id: string;                 // battle id (e.g. "716983")
  tier: string;               // "[Gen 9] VGC Regulation M-A"
  tierKey: string;            // "Gen9VGCRegulationM-A"
  gametype: "singles" | "doubles" | "triples" | "multi" | "freeforall";
  rated: boolean;
  startedAt: string;          // ISO from |t:|<unix>
  players: ReplayPlayer[];
  winner?: string;            // username
  ratingChange?: { name: string; before: number; after: number; delta: number }[];
  turns: number;
  teams: ReplayTeam[];        // length 2
  events: ReplayEvent[];      // optional, for matchup mining
  source: { tierDir: string; file: string; url: string; size: number; hash: string };
}
export interface ReplayPlayer { side: "p1" | "p2"; name: string; rating?: number }
export interface ReplayTeam {
  side: "p1" | "p2";
  player: string;
  brought: ReplayMon[];       // 試合中に出てきた Pokemon (poke|side|... と switch から推定)
  preview: ReplayMon[];       // teampreview 列挙の全 6
  bringCount: number;         // teamsize|side|N
}
export interface ReplayMon {
  species: string;            // "Gengar"
  forme?: string;             // "Mega" 等の派生
  level: number;
  gender?: "M" | "F";
  shiny?: boolean;
  itemRevealed?: string;      // Leftovers etc.
  abilityRevealed?: string;
  movesRevealed: string[];    // de-dup, in order of first use
  teraType?: string;
  teraUsed?: boolean;
  megaEvolved?: boolean;
}
export interface ReplayEvent {
  turn: number;
  actor?: string;
  target?: string;
  kind: "move" | "switch" | "faint" | "mega" | "tera" | "ability" | "item" | "weather" | "field";
  detail: string;
}
```

### `types/analytics.ts`

```ts
export interface MetaSnapshot {
  generatedAt: string;
  formats: FormatMeta[];
}
export interface FormatMeta {
  formatKey: string;
  display: string;
  sources: ("pikalytics" | "vgcpast" | "home")[];
  totalReplays: number;
  totalTeams: number;
  pokemon: PokemonMeta[];
}
export interface PokemonMeta {
  name: string;
  usagePct: number;            // 0–100
  rank: number;
  winRate?: number;
  moves: WeightedRow[];
  abilities: WeightedRow[];
  items: WeightedRow[];
  teraTypes?: WeightedRow[];
  teammates: WeightedRow[];
  counters?: WeightedRow[];
  notes: string[];             // どのソースから derived か
}
export interface WeightedRow { name: string; pct: number; n?: number }
```

## 4. Track Specifications

### Track A — Pikalytics fetcher + parser

**Goal**: Pikalytics の公式 markdown API を全フォーマット・全 Pokemon に対して取得し、`PikalyticsPokemonStats[]` に正規化する。

#### A-1. `pikalytics/fetch-llms.ts`
- `https://www.pikalytics.com/llms-full.txt` を取得し `home-data/storage/pikalytics/llms-full.txt` に保存。
- 既に存在しても上書きする (冪等)。
- 失敗時は exit 1。

#### A-2. `pikalytics/fetch-format-index.ts`
- 引数 `--format <format>` (default: `championspreview`)。
- `https://www.pikalytics.com/ai/pokedex/{format}` を取得 → `storage/pikalytics/{date}/{format}/_index.md` に生 markdown を保存。
- markdown から「Top 50 Pokemon usage」テーブルを抽出して `_index.json` を生成。
- スキーマ: `PikalyticsFormatIndex`。
- ローカルから 1 リクエスト/秒以下のスロットリング不要 (1 リクエストのみ)。

#### A-3. `pikalytics/fetch-pokemon.ts`
- 引数 `--format <format>` (default: `championspreview`)。
- `_index.json` を読み、上位 50 全てに対して `https://www.pikalytics.com/ai/pokedex/{format}/{Pokemon}` を取得。
- 1 リクエストごとに 800ms スリープ (Pikalytics に過負荷を与えない)。
- 既に同日 fetch 済みのファイルがあればスキップ (`--force` で再取得)。
- 出力: `storage/pikalytics/{date}/{format}/{pokemon}.md`。
- 失敗 (4xx/5xx) は別 JSON にエラー記録。リトライは指数バックオフで 3 回まで。
- **対象フォーマット (順次実行)**: `championspreview`, `gen9vgc2025regi`, `gen9vgc2026regf`, `gen9ou`。
  - 他のフォーマットは PRD 不要 だが、あれば追加歓迎。

#### A-4. `pikalytics/parse-markdown.ts`
- `storage/pikalytics/{date}/{format}/{pokemon}.md` を読み、`PikalyticsPokemonStats` を生成。
- セクション抽出方式: 行頭 `## Common Moves` 以下から次の `##` までを `UsageRow[]` に変換。`- **Move Name**: 41.092%` のような行を正規表現で。
- 数字 `41.092` は `41.092` のまま (number)。
- 出力: `storage/pikalytics/{date}/{format}/{pokemon}.json`。
- ライブラリは標準ライブラリのみ (regex)。
- ユニットテストは vitest で、`storage/raw-recon/41-pikalytics-incineroar.md` を入力に既知値を assert。

#### A-5. `pikalytics/run-all.ts`
- 上記をひとまとめに走らせるスクリプト。`npm run home:pikalytics` から起動できるよう、ルート package.json に `"home:pikalytics": "tsx home-data/pikalytics/run-all.ts"` を追加。

**A の検証チェックリスト**
- [ ] `tsx home-data/pikalytics/fetch-llms.ts` が成功し、ファイルサイズ > 5KB。
- [ ] `tsx home-data/pikalytics/fetch-format-index.ts --format championspreview` で 50 件以上の Pokemon が抽出される。
- [ ] `tsx home-data/pikalytics/fetch-pokemon.ts --format championspreview` で 50 ファイルが揃う。
- [ ] Vitest: parse-markdown が Incineroar fixture を 既知値 (Fake Out 41.092 など) に展開できる。
- [ ] `npx tsc --noEmit -p home-data/tsconfig.json` がエラー 0。

### Track B — vgcpast.es replay scraper + Showdown protocol parser

**Goal**: vgcpast.es 全リプレイを取得し、protocol log を `ParsedReplay` に正規化する。

#### B-1. `vgcpast/enumerate.ts`
- 対象 tier 配列:
  ```
  ["Gen9VGCRegulationM-A", "Gen9VGCRegulationM-A(Bo3)", "Gen9Pre-ChampionsVGC", "Gen9Pre-ChampionsVGC(Bo3)", "Gen9Pre-ChampionsOU"]
  ```
- 各 tier について `https://replays.vgcpast.es/{tier}/` を fetch (User-Agent 必須)。
- HTML を `storage/vgcpast/listings/{tier}.html` に保存。
- `<a href="...html">` を全部抜き出し、battle id とタイトルを構造化して `storage/vgcpast/listings/{tier}.json` に出力。
- スキーマ:
  ```ts
  interface ListingEntry { tier: string; file: string; url: string; battleId: string; p1: string; p2: string; hasToken: boolean }
  ```

#### B-2. `vgcpast/fetch-replays.ts`
- 上記 listing.json を読み、各 URL を fetch。
- **Rate limit**: 5 並列 worker、各 worker は 250ms 間隔 (実効 20 req/s)。
- 既存のファイルはスキップ。`--force` で再取得。
- 出力: `storage/vgcpast/replays/{tier}/{battleId}.html`。
- 失敗は `failures.json` に記録 (リトライ 3 回, 指数バックオフ 1s/2s/4s)。
- 進捗: 100 件ごとに stderr に `[tier] 100/N done`。
- 必須 HTTP header: `User-Agent: ChampionsBot/1.0 (research; contact: noreply@local)`。
- **データ量上限**: ない。Pre-ChampionsVGC のリスティング 4MB に対応するため、メモリ効率に注意 (URL を全部一気にメモリへ載せて OK)。

#### B-3. `vgcpast/parse-replay.ts`
- `storage/vgcpast/replays/{tier}/{id}.html` を 1 ファイル受け取り、`ParsedReplay` を返す。
- `<script type="text/plain" class="battle-log-data">...</script>` 内のテキストを抽出してパース。
- パース対象タグ:
  - `|gametype|`, `|tier|`, `|rated|`, `|player|side|name|avatar|rating`
  - `|teamsize|side|N`
  - `|teampreview|N`
  - `|poke|side|species, L50, gender|...` (preview)
  - `|switch|sideA: nick|species, L50, ...|HP/MAX`
  - `|move|sideA: nick|MoveName|target` → `mon.movesRevealed.push`
  - `|detailschange|... |Mega...` + `|-mega|...|item` → `mon.megaEvolved=true; mon.itemRevealed=item`
  - `|-terastallize|sideA: nick|TeraType` → `mon.teraType, teraUsed=true`
  - `|-heal|... |[from] item: NAME` → `mon.itemRevealed`
  - `|-item|sideA: nick|NAME` (passive item reveal e.g. Air Balloon)
  - `|-ability|sideA: nick|NAME` → `mon.abilityRevealed`
  - `|raw|<div ...>X's Ability is: NAME</div>` → ability reveal
  - `|win|name`
  - `|raw|name's rating: BEFORE &rarr; <strong>AFTER</strong>` → ratingChange
- ニックネームは `sideA: nick` の `nick` 部分。`switch` で出てくる `species` から正式名を取る (nick → species map)。
- Form 推定: `species, L50, F, shiny` の `species` がそのままキー。`Gengar-Mega` のようなハイフン後を `forme = "Mega"` に切り分け。
- ユニットテストは `storage/raw-recon/48-vgcpast-sample-replay.html` を fixture に。
  - winner === "9wtt"
  - p1.preview.length === 6, brought.length === 4
  - Gengar.megaEvolved === true, itemRevealed === "Gengarite"
  - Politoed.abilityRevealed === "Drizzle"
  - Archaludon.itemRevealed === "Leftovers"
  - p1 rating before=1109, after=1130

#### B-4. `vgcpast/aggregate.ts`
- 全 tier × 全 ParsedReplay を読み、tier 単位で集計。
- 出力 (tier ごと) `storage/vgcpast/parsed/{tier}/_summary.json`:
  ```ts
  {
    tier,
    totalReplays,
    pokemon: {
      [species]: {
        usageCount, usagePct,
        winRate,
        items: { [name]: count },
        abilities: { [name]: count },
        moves: { [name]: count },
        teraTypes: { [type]: count },
        teammates: { [species]: count },   // 同 side
        opponents: { [species]: count }    // 対面 side
      }
    }
  }
  ```
- これを別の analytics layer から再利用しやすい形にしておく。

#### B-5. `vgcpast/run-all.ts`
- enumerate → fetch → parse → aggregate を順番に。
- ルート package.json に `"home:vgcpast": "tsx home-data/vgcpast/run-all.ts"` を追加。

**B の検証チェックリスト**
- [ ] enumerate.ts が 5 tier 全てを処理して listings/*.json を生成。
- [ ] fetch-replays.ts がサンプル 50 件を取得 (full 取得は別途長時間 job)。
- [ ] parse-replay.ts が fixture テストを全 pass。
- [ ] aggregate.ts が tier ごとの summary を生成し、Reg M-A で `Incineroar.usageCount > 0`。
- [ ] tsc 0 error。

### Track C — Analyzer (probability distribution + matchups)

**Goal**: Track A と Track B の出力を統合し、`MetaSnapshot` を生成。

#### C-1. `analyzer/merge-sources.ts`
- 引数 `--date YYYY-MM-DD` (省略時は今日)。
- 入力:
  - `storage/pikalytics/{date}/{format}/*.json`
  - `storage/vgcpast/parsed/{tier}/_summary.json`
- フォーマット対応表:
  ```
  championspreview        ←→ Gen9Pre-ChampionsVGC + Gen9VGCRegulationM-A
  gen9ou                  ←→ Gen9Pre-ChampionsOU
  gen9vgc2026regf         ←→ (vgcpast には対応なし)
  gen9vgc2025regi         ←→ (vgcpast には対応なし)
  ```
- 出力: `storage/analysis/{date}-meta.json` (`MetaSnapshot`)。
- 各 PokemonMeta は両ソースの平均ではなく、優先順位 (Pikalytics > vgcpast 集計) で main 値を採用しつつ、`notes` に「Pikalytics 集計時点 2026-03 / vgcpast N 試合」と書く。

#### C-2. `analyzer/distributions.ts`
- `storage/analysis/{date}-meta.json` から、各 Pokemon の確率分布 (move/item/ability/teammate) を確率質量関数として正規化し、`storage/analysis/{date}-distributions.json` に出力。
- 後続の Bayesian inference (tracker 用) で読みやすい形に。

#### C-3. `analyzer/matchups.ts`
- vgcpast.es の `ReplayEvent[]` を活かして簡易 1v1 win-rate matrix を出力 (オプショナル / time が許せば)。
- `storage/analysis/{date}-matchups.json`。

**C の検証チェックリスト**
- [ ] merge-sources の出力 JSON が `MetaSnapshot` の型と一致する (TypeScript で読み込めること)。
- [ ] 上位 50 Pokemon の `usagePct` 合計 ~100 (Pikalytics ベース)。
- [ ] tsc 0 error。

### Track D — HTML viewer

**Goal**: 単一 HTML をブラウザで開くだけで、Pokemon 別の使用率/型/相性が見られる UI。

#### D-1. ビルドターゲット
- 既存の Vite 設定 (`viteSingleFile()`) を流用。
- `VITE_ENTRY=meta` を新設し、`vite.config.ts` 側で `home-data/viewer/index.html` をエントリにできるよう拡張する。
- ルート package.json に `"build:meta": "vite build --mode meta"` を追加。

#### D-2. データ取り込み
- `home-data/storage/analysis/{latest}-meta.json` をビルド時に `import.meta.glob` か直接 `import` し、HTML に埋め込む (ファイルサイズ MB 級でも可)。
- ファイル名はビルドスクリプトが latest を決定して symlink 不要 (シンプルに `meta-latest.json` にコピー)。

#### D-3. UI 要件 (vanilla TS で十分)
- 上部: フォーマット選択 (championspreview / gen9ou / etc.)
- 左ペイン: Pokemon 一覧 (使用率順、検索可)
- 右ペイン: 選択 Pokemon の詳細
  - 使用率, 順位, 勝率
  - 上位 Move (棒グラフ)
  - 上位 Ability / Item / Tera / Teammate (リスト + バー)
  - データソース (Pikalytics / vgcpast 試合数)
- フィルタ: 「vgcpast 試合数 ≥ N」スライダ
- ダーク/ライトテーマトグル
- フォントは monospace ベース (calc UI と統一)

#### D-4. 既存 UI との関係
- 計算機 (`build/calc.html`) とトラッカー (`build/tracker.html`) には触らない。
- 新しく `build/champions-meta.html` を生成。

#### D-5. テスト
- viewer の純関数 (sort/filter/format) は vitest で軽くカバー。
- 起動確認: `npm run build:meta` → `build/champions-meta.html` をブラウザで開けば全フォーマットが表示される。

**D の検証チェックリスト**
- [ ] `npm run build:meta` がエラー 0 で終わり `build/champions-meta.html` が生成される。
- [ ] 開いたときに championspreview の上位 10 Pokemon が表示される。
- [ ] Pokemon を選択すると Move / Item / Ability の棒グラフが描画される。
- [ ] tsc 0 error。

## 5. Execution Order (Subagent Plan)

各 Track はサブエージェントで並列起動するが、依存関係に注意:

```
[Agent A] Track A: Pikalytics impl  ─┐
[Agent B] Track B: vgcpast impl     ─┼→ [Agent C] Track C: analyzer
                                      │
                                      └→ [Agent D] Track D: viewer
```

- A と B は完全独立 → 並列起動 OK
- C は A と B の出力を読むので両方完了後に起動
- D は C の出力を埋め込むので C の後

**現実的な進行**:
1. A と B のサブエージェントを並列起動
2. 完了次第 C を起動
3. C 完了後 D を起動
4. 各 Agent 完了後にメインで `tsc --noEmit` と vitest を走らせて全体回帰を確認

## 6. Coding Conventions (sub-agent must follow)

- 言語: TypeScript strict mode。実行は `tsx` (既に node_modules にある)。
- ファイル冒頭に目的コメント (英語)。
- 全ての fetch には `User-Agent: ChampionsBot/1.0 (research)` を付与。
- HTTP 失敗時のリトライは指数バックオフ (max 3 回)。
- 標準出力ではなく `console.log` で進捗 (tsx で動かすため)。
- JSON 書き出しは `JSON.stringify(obj, null, 2)`。
- ファイル I/O は `node:fs/promises`。
- 既存ファイル `home-data/types/api.ts`, `home-data/types/dex.ts`, `home-data/fetcher/monitor-bundle.ts` には触らない。
- 新規ファイルだけ作る。既存に追記が必要な場合は明示的に diff を残す。

## 7. Done Definition

全 Track 完了の判定:
1. `npx tsc --noEmit -p home-data/tsconfig.json` がエラー 0
2. `npx tsc --noEmit -p tsconfig.app.json` がエラー 0 (既存コードの型壊しがない)
3. `npm test` がエラー 0 (既存 322 + 新規追加分すべて pass)
4. `home-data/storage/pikalytics/{date}/championspreview/` に 50 個の `.md` と `.json` が揃っている
5. `home-data/storage/vgcpast/parsed/Gen9VGCRegulationM-A/_summary.json` が生成され `pokemon` キー数 > 50
6. `home-data/storage/analysis/{date}-meta.json` が `MetaSnapshot` 型として読める
7. `build/champions-meta.html` をブラウザで開くと championspreview と gen9ou のメタが表示される

## 8. Out of scope (今回はやらない)

- HOME 公式 API の Champions 対応 (まだ存在しない)
- Pokemon GO PvP データ
- リアルタイム自動更新 (cron は別途)
- 機械学習ベースのレコメンド
- 既存 calc / tracker の改修
