# Pokemon Champions — プロジェクト指示書

## ワークフロー: ビルド→開く方式

**開発サーバー (`npm run dev`) は使用しない。** 常にビルド済みファイルをブラウザで直接開く。

### 手順

1. コード変更後、必ずビルドを実行:
   ```bash
   npm run build:tracker    # トラッカーのみ
   npm run build:calc       # 計算機のみ
   npm run build:meta       # メタビューアのみ
   npm run build:teams      # 構築分析のみ
   npm run build:ml         # ML Insightsのみ
   npm run build:ui         # calc + tracker
   ```
2. ビルド成果物をブラウザで直接開く:
   - 計算機: `build/calc.html`
   - トラッカー: `build/tracker.html`
   - メタビューア: `build/meta.html`
   - 構築分析: `build/teams.html`
   - ML Insights: `build/ml.html`
3. `viteSingleFile()` により JS/CSS が HTML に埋め込まれるため、サーバー不要で動作する

### コード変更時の必須ルール

- UI/ロジックを変更したら、**必ず対応するビルドコマンドを実行**してからユーザーに確認を促す
- テストも併せて実行: `npm test`
- ビルドエラーがあれば修正してから再ビルド

## 言語

- ユーザーとの会話: 日本語
- コード/コメント: 英語

## テスト

- フレームワーク: Vitest
- 実行: `npm test`
- 現在: 322 passing (18ファイル)
- TypeScript チェック: `npx tsc --noEmit -p tsconfig.app.json`

## ビルド構成

- バンドラー: Vite + viteSingleFile
- エントリ切替: `VITE_ENTRY` 環境変数 (`calc` / `tracker` / `meta` / `teams` / `ml`)
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

## データパイプライン

集計データの再生成が必要な場合:

```bash
npm run home:teams -- --date 2026-04-08   # 構築分析データ生成
npm run home:analyze -- --date 2026-04-08 # メタ全体分析 (merge + distributions + matchups)
```

生成先: `home-data/storage/analysis/{date}-*.json`
