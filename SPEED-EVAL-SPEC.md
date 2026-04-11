# 素早さ評価仕様書 (Speed Evaluation Specification)

## 概要

シングルメタ パワーランキングに**素早さ評価軸**を追加する。
現行システムではダメージ量と耐久のみで評価しているが、
「先手を取れるか」「上を取られたら倒されるか」を考慮することで、
いじっぱり(Adamant)vs ようき(Jolly) 等の性格トレードオフを定量化する。

## 設計原則

- **上を取られた場合**: 相手の最良技で被弾 → KO なら攻撃貢献値 = 0
- **生存なら通常評価**: 被弾後に生存すれば攻撃貢献は100%計上
- **先制技は速度無視**: priority > 0 の技は素早さ比較をバイパス（常に先手扱い）
- **こだわりスカーフ**: Choice Scarf 装備者の Speed 実数値 × 1.5
- **同速は50/50**: 同速で KO される場合、攻撃貢献を 0.5 倍

## 1. Speed 実数値の計算

各ビルドの Speed 実数値を `calcStat()` で算出:

```typescript
speedStat = calcStat(baseSpe, sp.spe, getNatureModifier(nature, 'spe'))
// メガ進化の場合は megatBaseSpe を使用
// Choice Scarf 装備: Math.floor(speedStat * 1.5)
```

### 計算例

| ポケモン | 種族値Spe | SP | 性格 | 実数値 | スカーフ有 |
|---------|----------|-----|------|--------|-----------|
| Kingambit | 50 | 32 | Adamant(×1.0) | 102 | 153 |
| Kingambit | 50 | 32 | Jolly(×1.1) | 112 | 168 |
| Great Tusk | 87 | 32 | Adamant(×1.0) | 139 | 208 |
| Great Tusk | 87 | 32 | Jolly(×1.1) | 152 | 228 |
| Darkrai | 125 | 32 | Timid(×1.1) | 194 | 291 |

## 2. ターンオーダー判定

各 (攻撃側ビルド A, 防御側ビルド D) ペアについて:

```
if A の最良技の priority > 0:
  → A が先手 (speedMultiplier = 1.0)
elif A.speedStat > D.speedStat:
  → A が先手 (speedMultiplier = 1.0)
elif A.speedStat < D.speedStat:
  → D が先手
  → D の最良技で A を確1 (koN=1, koChance≥0.5) ?
    → YES: A の攻撃貢献 = 0 (speedMultiplier = 0.0)
    → NO:  A は生存して攻撃 (speedMultiplier = 1.0)
elif A.speedStat == D.speedStat:
  → 50/50
  → D の最良技で A を確1 ?
    → YES: speedMultiplier = 0.5
    → NO:  speedMultiplier = 1.0
```

### 先制技の扱い

- `priority > 0` の攻撃技を持つ場合、**その技を使う場合に限り**速度チェック不要
- 非先制技を「最良技」として選んだ場合は通常の速度比較が適用される
- 実装: 各技ごとに速度チェックし、speed-adjusted damage が最大の技を最良技とする

### 先制技リスト (moves.json 内の priority > 0 攻撃技)

| 技名 | Priority | 威力 | タイプ |
|------|----------|------|--------|
| Extreme Speed | +2 | 80 | Normal |
| Sucker Punch | +1 | 70 | Dark |
| Thunderclap | +1 | 70 | Electric |
| Upper Hand | +3 | 65 | Fighting |
| Jet Punch | +1 | 60 | Water |
| Accelerock | +1 | 40 | Rock |
| Aqua Jet | +1 | 40 | Water |
| Bullet Punch | +1 | 40 | Steel |
| Ice Shard | +1 | 40 | Ice |
| Mach Punch | +1 | 40 | Fighting |
| Quick Attack | +1 | 40 | Normal |
| Shadow Sneak | +1 | 40 | Ghost |
| Vacuum Wave | +1 | 40 | Fighting |
| Fake Out | +3 | 40 | Normal |
| Feint | +2 | 30 | Normal |
| Water Shuriken | +1 | 15 | Water |

## 3. 攻撃側スコアへの反映

### 現行の攻撃スコア計算

```
offensiveScore = 0.3 × coverage + 0.3 × normalizedDamage + 0.4 × twoHkoRate
```

### 変更後: speed-adjusted 攻撃スコア

各マッチアップの攻撃貢献に `speedMultiplier` (0.0 / 0.5 / 1.0) を適用:

```typescript
// speedMultiplier の決定 (上記ロジック)
// → speedMultiplier を各 matchup に付与

// coverage: neutral+ かつ speedMultiplier > 0 のもののみカウント
// 厳密には speedMultiplier で加重
coverage = Σ(effectiveness >= 1 ? speedMultiplier : 0) / Σ(speedMultiplier の最大値=1 で正規化)

// weightedDamage: maxPct × speedMultiplier × usageWeight の加重平均
weightedDamage = Σ(maxPct × speedMultiplier × usageWeight) / Σ(usageWeight)

// ohkoRate: 確1 かつ speedMultiplier > 0
ohkoRate = Σ(isOHKO ? speedMultiplier : 0) / totalMatchups × 100

// twoHkoRate: 確2以内 かつ speedMultiplier > 0
twoHkoRate = Σ(is2HKO ? speedMultiplier : 0) / totalMatchups × 100
```

**結果**: 被弾で落ちるマッチアップは自動的に攻撃貢献0になり、
速い性格のポケモンほど「使える」マッチアップが増える。

### 防御スコア: 変更なし

防御スコアは「何発耐えるか」の純粋な耐久評価であり、
速度は攻撃側の視点でのみ考慮する。

## 4. 速度性格の強制追加

### 目的

すべてのアタッカービルドについて、速度を上げる性格バリアントも評価し、
火力性格 vs 速度性格のトレードオフを可視化する。

### ルール

```
物理アタッカー (physicalAT パターンのビルドが存在):
  → Jolly が性格リストにない場合、pct=5% で強制追加

特殊アタッカー (specialAT パターンのビルドが存在):
  → Timid が性格リストにない場合、pct=5% で強制追加
```

- raw-recon に既に Jolly/Timid がある場合は追加しない (重複防止)
- pct=5% は MIN_NATURE_PCT (5%) と同値であり、ビルドとして生成される最低ライン
- ウェイト正規化後に全体バランスが保たれる

## 5. 新規メトリクス

### BuildScores への追加

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `speedStat` | number | Lv50 Speed 実数値 (スカーフ込み) |
| `speedAdvantage` | number | 0-100: メタ全ビルドのうち上を取れる割合 |
| `speedTier` | string | "fast" / "mid" / "slow" (目安表示用) |

### speedAdvantage の計算

```typescript
const totalMetaBuilds = allMeta.flatMap(m => m.builds).length;
let outspeeds = 0;
for (const defMeta of allMeta) {
  for (const defBuild of defMeta.builds) {
    const defSpeed = calcSpeed(defMeta, defBuild);
    if (mySpeed > defSpeed) outspeeds++;
    else if (mySpeed === defSpeed) outspeeds += 0.5; // 50/50
  }
}
speedAdvantage = (outspeeds / totalMetaBuilds) * 100;
```

### speedTier の分類

```
speedStat >= 150 → "fast"
speedStat >= 100 → "mid"
speedStat <  100 → "slow"
```

## 6. 逆引き防御マトリクスの高速化

### 課題

攻撃側 A が防御側 D より遅い場合、D→A のダメージ計算結果が必要。
現行の `scoreBuild()` は攻撃側と防御側を別ループで計算しており、
防御側マッチアップ (`defensiveMatchups`) から D の最良技を取得可能。

### 実装

1. まず全ビルドの **Speed 実数値**をプリコンピュートしてマップに保存
2. 全ビルドの **防御側マッチアップ** (被弾時の最良技ダメージ) をプリコンピュート
3. 攻撃側スコアリング時に、防御側から攻撃されたときの結果を参照して speedMultiplier を決定

```typescript
// Step 1: プリコンピュート
interface BuildSpeedInfo {
  speedStat: number;
  // 各攻撃者からの最良被弾結果
  incomingBest: Map<string, { koN: number; koChance: number }>;
  // key = `${attackerName}:${attackerBuildIndex}`
}

// Step 2: scoreBuild() 内で参照
// 攻撃スコア計算時に defenderBuild の速度と、defender→attacker の被弾結果を使う
```

### 計算量

現行: ~881,792 calc (変更なし)
追加: 防御側マッチアップ参照は O(1) ルックアップのみ。
Speed 計算は純粋な算術 (ビルド数 × 1回)。
**計算量の増加はほぼなし。**

## 7. ビューア変更

### PokemonPowerDetail (右パネル)

- ビルド詳細に **Speed 実数値** と **速度優位率** を表示
- speedAdvantage をバー表示
- speedTier をタグで表示 ("fast" = green, "mid" = yellow, "slow" = red)

### PokemonRankList (左パネル)

- 各ポケモンのミニスコアバーに Speed 指標を追加 (任意)

### ソート

- 既存ソートキー: overall / offensive / defensive / usage
- 新規ソートキー: `speed` (speedAdvantage でソート)

## 8. 検証方法

1. **Known matchup check**: Adamant vs Jolly の Kingambit を比較
   - Jolly は Adamant より速い → 上を取れる相手が増える
   - Adamant は火力が高い → 確定数が有利な相手がある
   - 確定数が変わらないなら Jolly が優位 → overallScore で Jolly > Adamant

2. **先制技持ちの検証**: Dragonite (Extreme Speed) の速度調整後スコア
   - Extreme Speed は priority+2 → 速度無関係で常に先手
   - 他の技は速度依存 → Jolly の方が通常技でも先手取れる相手が増える

3. **スカーフ効果**: Choice Scarf ビルドの speedAdvantage が大幅に高いことを確認

4. **同速ケース**: 同じ Speed 実数値のマッチアップで 0.5 倍が適用されることを確認

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `home-data/types/singles-ranking.ts` | BuildScores に speedStat, speedAdvantage, speedTier 追加 |
| `home-data/analyzer/singles-ranking.ts` | 速度性格強制追加、Speed計算、speed-adjusted scoring |
| `home-data/viewer-singles/App.tsx` | "speed" ソートキー追加 |
| `home-data/viewer-singles/components/PokemonPowerDetail.tsx` | Speed メトリクス表示 |
| `home-data/viewer-singles/components/PokemonRankList.tsx` | Speed バー表示 (任意) |
| `SPEED-EVAL-SPEC.md` | 本仕様書 |
