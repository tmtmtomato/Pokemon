# Pokemon Champions — プロジェクト指示書

## ワークフロー: ビルド→開く方式

**開発サーバー (`npm run dev`) は使用しない。** 常にビルド済みファイルをブラウザで直接開く。

### 手順

1. コード変更後、必ずビルドを実行:
   ```bash
   npm run build:pages      # 全ページ一括ビルド（推奨）
   npm run build:calc       # 個別ビルド（開発中の高速ビルド用）
   ```
2. ビルド成果物をブラウザで直接開く:
   - 計算機: `build/calc.html`
   - トラッカー: `build/tracker.html`
   - メタビューア: `build/meta.html`
   - 構築分析: `build/teams.html`
   - 構築ビルダー: `build/builder.html`
   - ML Insights: `build/ml.html`
3. `viteSingleFile()` により JS/CSS が HTML に埋め込まれるため、サーバー不要で動作する

### コード変更時の必須ルール

- UI/ロジックを変更したら、**必ず対応するビルドコマンドを実行**してからユーザーに確認を促す
- テストも併せて実行: `npm test`
- ビルドエラーがあれば修正してから再ビルド
- **都度の作業後、Codex がレビュワーになる。** 実装の区切りごとにユーザーが Codex にコードレビューを依頼するため、レビュー指摘があれば対応すること

## 言語

- ユーザーとの会話: 日本語
- コード/コメント: 英語
- **スクリプト出力・分析結果: ポケモン名・技名は全て日本語（英語表記禁止）**
  - `home-data/storage/i18n/pokemon-ja.json` / `moves-ja.json` を参照
  - ビューア: `home-data/viewer/i18n.ts` の `localizePokemon()` / `localizeMove()`
  - スクリプト: `readFileSync` で JSON を読み込み、変換関数で日本語化

## KO表記ルール（厳守）

**"1HKO"/"2HKO"/"OHKO" 表記は全面禁止。** 必ず 確/乱 表記を使用する:

- 確1 = 確定1発 (guaranteed OHKO, koChance = 1.0)
- 乱1(75%) = 75%で1発 (random OHKO, koChance = 0.75)
- 確2 = 確定2発, 乱2(87%) = 87%で2発, etc.
- 閾値分析では 確2→乱1→確1 の遷移を区別する（確/乱の粒度がないと閾値の話ができない）

## テスト

- フレームワーク: Vitest
- 実行: `npm test`
- 現在: 343 passing (19ファイル)
- TypeScript チェック: `npx tsc --noEmit -p tsconfig.app.json`

## ビルド構成

- バンドラー: Vite + viteSingleFile
- **一括ビルド**: `npm run build:pages` — 前処理 + 全11ページビルド
- ページ追加: `vite.config.ts` の `PAGES` マップに追加するだけ
- 個別ビルド: `cross-env VITE_ENTRY=<name> vite build`
- 出力: `build/` ディレクトリ

## 主要ドキュメント

| ファイル | 内容 |
|---------|------|
| SPEC.md | プロジェクト全体仕様 (ゲーム仕様+機能要件) |
| HANDOVER.md | 計算エンジン引き継ぎ (API+データ) |
| TRACKER-SPEC.md | トラッカー実装仕様 |
| TRACKER-HANDOVER.md | トラッカー引き継ぎ |
| TRACKER-AUDIT-REPORT.md | トラッカー監査レポート |
| TEAM-ANALYSIS-SPEC.md | 構築・選出分析ツール仕様 |
| TEAM-MATCHUP-SPEC.md | 構築シミュ13フェーズパイプライン + Team Builder仕様 (§14) |

## データパイプライン

集計データの再生成が必要な場合:

```bash
npm run home:teams -- --date 2026-04-08   # 構築分析データ生成
npm run home:analyze -- --date 2026-04-08 # メタ全体分析 (merge + distributions + matchups)
```

生成先: `home-data/storage/analysis/{date}-*.json`
