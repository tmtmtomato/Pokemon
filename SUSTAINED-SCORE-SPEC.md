# 継続戦闘力スコア (Sustained Combat Score) — 仕様書 v2

## 現状 (v1: 実装済み・要再設計)

### 実装済みコード
- `home-data/analyzer/singles-ranking.ts` — `simulate1v1Turn`, `simulate1v1`, scoreBuild Step 7
- `home-data/types/singles-ranking.ts` — `BuildScores` に `sustainedScore`, `winRate1v1`, `sweepPotential`
- `home-data/types/team-matchup.ts` — `PoolMember` に同3フィールド追加
- `home-data/analyzer/team-matchup.ts` — singlesデータからの読み込み・出力
- ビューア: singles (App, RankingToolbar, PokemonRankList, PokemonPowerDetail, ScoreBar) + matchup (TeamDetail)
- overallScore = 0.35×ATK + 0.35×DEF + 0.30×SUSTAINED

### v1 の設計欠陥

**問題1: 独立1v1の平均 ≠ 連続戦闘能力**

現在のsustainedScoreは各メタ対戦相手との1v1を独立に評価し、勝利時の残HP%を使用率加重平均しているだけ。

```
for each opponent in meta:
  simulate independent 1v1 (both start 100%)
  if win: record remaining HP%
sustainedScore = weighted_avg(remaining HP%)
sweepPotential = 1 / (1 - winRate × sustainedScore)  ← 幾何級数近似
```

実際のスイープでは **HPが引き継がれる** ため、この平均は現実と乖離する。
例: 毎回80%残HPで勝てる = sustainedScore 80 だが、実際の連戦では
100→80→60→40→20→0 と線形に減少し、途中で倒される可能性がある。

**問題2: 交代時の先手問題が未反映**

相手をKO → 相手2番手が登場 → **その2番手の素早さで先手後手が決まる**。
低速ポケモンが確1取っても、出てきた高速ポケモンに上から叩かれて落ちる。
この「出てきた相手に先制される」ダイナミクスが抜けている。

**問題3: 一貫性が対メタ個体であり対チーム構成ではない**

coverage/offensiveScoreは「メタ全体の何%に等倍以上取れるか」を測定しており、
「6体構成の同一チームに対して何枠を連続処理できるか」を測定していない。
チーム構成では弱点が偏るため、個体分布への一貫性とは異なる。

---

## v2 再設計方針: チェーンシミュレーション

### 概要

独立1v1 → **使用率加重のランダム順序連続KOチェーン** に変更。
既存の攻撃/防御マッチアップデータ (offMap/defMap) を再利用し、新規 calculate() 呼び出しは不要。

### アルゴリズム

```
CHAIN_SAMPLES = 200  // ランダム順序のサンプル数

function simulateChain(
  atkSpeed: number,
  offMap: Map<key, MatchupResult>,  // 自分→相手のダメージ
  defMap: Map<key, MatchupResult>,  // 相手→自分のダメージ
  allMeta: MetaPokemon[],
  rng: () => number,
): { avgKOs: number; avgMidHP: number }

  // メタ対戦相手プールを構築 (使用率加重サンプリング用)
  opponents = flatten [
    for defMeta in allMeta:
      for di in defMeta.builds:
        { name, buildIndex, speed, weight: usagePct * buildWeight }
  ]

  totalKOs = 0
  totalMidHP = 0  // 途中経過のHP (sustainedScore用)

  for sample in 0..<CHAIN_SAMPLES:
    // 使用率加重でシャッフルした順序を生成
    order = weightedShuffle(opponents, rng)

    currentHP = 100
    kos = 0
    hpSum = 0  // chain中のHP合計 (平均残HP算出用)

    for opp in order:
      if kos >= 6: break  // 最大6連続KO

      offEntry = offMap[opp.key]
      defEntry = defMap[opp.key]

      if !offEntry or offEntry.maxPct <= 0:
        break  // ダメージ出せない相手 = チェーン終了

      ourDmg = offEntry.maxPct
      theirDmg = defEntry?.maxPct ?? 0
      theirSpeed = opp.speed

      // ★核心: currentHP (100%ではない) からスタート
      // ★交代時先手: 相手が速い場合、先制される
      result = simulateFromHP(currentHP, ourDmg, theirDmg, atkSpeed, theirSpeed)

      if result.win:
        remHP = result.remainingHP
        // Self-KO / Palafin ペナルティ
        if selfKO(offEntry.bestMove): remHP = 0
        if palafinHero(attacker): remHP *= 0.8

        currentHP = remHP
        kos++
        hpSum += currentHP
      else:
        break  // 倒された → チェーン終了

    totalKOs += kos
    totalMidHP += kos > 0 ? hpSum / kos : 0

  return {
    avgKOs: totalKOs / CHAIN_SAMPLES,  // = sweepPotential (1.0-6.0)
    avgMidHP: totalMidHP / CHAIN_SAMPLES  // = sustainedScore (0-100)
  }
```

### simulateFromHP (新関数)

`simulate1v1Turn` のHP引き継ぎ版:

```
function simulateFromHP(
  startHP: number,     // 自分の開始HP% (≤100)
  ourDmgPct: number,   // 自分の1ヒットダメージ%
  theirDmgPct: number, // 相手の1ヒットダメージ%
  ourSpeed: number,
  theirSpeed: number,
): { win: boolean; remainingHP: number }

  ourHP = startHP
  theirHP = 100  // 出てきた相手は常に全快

  weFaster = ourSpeed > theirSpeed
  // 同速: 両方シナリオの平均 (既存ロジックと同じ)

  for turn in 0..<10:
    if weFaster:
      theirHP -= ourDmgPct
      if theirHP <= 0: return { win: true, remainingHP: max(0, ourHP) }
      ourHP -= theirDmgPct
      if ourHP <= 0: return { win: false, remainingHP: ... }
    else:
      ourHP -= theirDmgPct      // ★交代直後に先制される
      if ourHP <= 0: return { win: false, ... }
      theirHP -= ourDmgPct
      if theirHP <= 0: return { win: true, remainingHP: max(0, ourHP) }
```

### winRate1v1 の扱い

winRate1v1 は独立1v1での勝率であり、チェーンとは別指標として残す。
ただし overallScore の構成要素としては sustainedScore (チェーンベース) を使う。

### 出力フィールド (変更なし)

| フィールド | 範囲 | v2の意味 |
|---|---|---|
| `sustainedScore` | 0-100 | チェーン中の平均残HP% |
| `winRate1v1` | 0-100 | 独立1v1勝率 (変更なし) |
| `sweepPotential` | 1.0-6.0 | チェーンの平均KO数 (直接計測) |

overallScore = 0.35×ATK + 0.35×DEF + 0.30×SUSTAINED (変更なし)

---

## 実装チェックリスト

### Step 1: singles-ranking.ts の Step 7 書き換え

- [ ] `simulateFromHP()` 関数追加 (startHP引数版)
- [ ] `simulateChain()` 関数追加 (CHAIN_SAMPLES回のモンテカルロ)
- [ ] `weightedShuffle()` ヘルパー追加 (Fisher-Yates + 使用率加重)
- [ ] scoreBuild の Step 7 を `simulateChain()` 呼び出しに置換
- [ ] sweepPotential を幾何級数近似 → チェーンの直接計測に変更
- [ ] seeded RNG 追加 (再現性のため、mulberry32 を team-matchup.ts から流用)

### Step 2: 再生成 + ビルド

- [ ] `npx tsx home-data/analyzer/singles-ranking.ts --date 2026-04-10`
- [ ] `npx tsx home-data/analyzer/team-matchup.ts --date 2026-04-10`
- [ ] `npm run build:singles && npm run build:matchup`
- [ ] `npm test` (322 tests)

### Step 3: ビューア変更なし

型・フィールド名・表示は v1 で対応済み。アルゴリズム変更のみ。

---

## 将来検討: チーム構成ベースの一貫性

現在の coverage/offensiveScore は「メタ全体の個体分布」に対する一貫性。
理想的には「6体チーム構成に対する一貫性」を評価すべき:

- 6体の弱点・耐性の偏りを考慮
- team-matchup.ts で生成された上位チーム群を対戦プールに使う案
- ただし依存関係が循環 (singles → team → singlesの一貫性評価)

この問題は scope が大きいため、sustained score v2 とは別タスクとして扱う。

---

## 計算量の見積もり

現在の v1: O(N_builds × N_builds) ≈ 842² = 710K (既存ループ内)
v2 追加: CHAIN_SAMPLES × avg_chain_length ≈ 200 × 3 = 600 per build, total ≈ 842 × 600 = 505K

全てlookup (Map.get) なので新規 calculate() 呼び出しなし。
既存の1.4M calc から比べれば無視できるコスト。
