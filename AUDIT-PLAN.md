# Pokemon Champions Damage Calculator - 包括的監査計画

> 作成日: 2026-03-29
> 対象: 計算エンジン v0.1.0 (106 tests passing)

---

## 監査ベクトル一覧

### A. ステータス計算 (stats.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| A1 | HP計算（偶数ベース） | Garchomp(108) → HP=108+75+SP |
| A2 | HP計算（奇数ベース） | Gengar(60) → floor exact |
| A3 | 非HP計算（性格補正なし） | Hardy → ×1.0 |
| A4 | 非HP計算（上昇性格） | Adamant Atk → ×1.1 |
| A5 | 非HP計算（下降性格） | Adamant SpA → ×0.9（実際はSpa下降ではない、要確認） |
| A6 | SP=0 vs SP=32 の差分が32であること | 1SP=1stat point検証 |
| A7 | SP合計66バリデーション | 超過時エラー |

### B. コアダメージ式 (damage.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| B1 | 基本式手計算一致 | floor(floor(22*BP*A/D)/50)+2 |
| B2 | 乱数16段階（85-100） | 全ロール確認 |
| B3 | 最小ダメージ1保証 | 極低ダメでも1 |
| B4 | 修正値適用順序 | Spread→Weather→Crit→Random→STAB→Type→Burn→Screen→Ability→Item |

### C. タイプ相性 (type-effectiveness.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| C1 | 全18タイプの免疫 | Normal→Ghost, Ground→Flying, etc. |
| C2 | 4倍弱点 | Ice→Dragon/Ground=4x |
| C3 | 1/4耐性 | Fighting→Ghost/Fairy (Ghost免疫+Fairy半減) → 実際は0 |
| C4 | 単タイプの相性 | 各2x, 0.5x, 0x パターン |

### D. 特性修正 (abilities.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| D1 | テクニシャン（BP≤60 → 1.5x） | Bullet Punch(40) |
| D2 | テクニシャン（BP>60 → 効果なし） | Earthquake(100) |
| D3 | ちからずく（追加効果あり → ~1.3x） | Iron Head(secondaryEffect) |
| D4 | てつのこぶし（パンチ技 → 1.2x） | Bullet Punch |
| D5 | すてみ（反動技 → 1.2x） | Flare Blitz, Brave Bird |
| D6 | がんじょうあご（かみつき技 → 1.5x） | Crunch |
| D7 | メガランチャー（波動技 → 1.5x） | Aura Sphere |
| D8 | かたいつめ（接触技 → ~1.3x） | Close Combat |
| D9 | きれあじ（斬撃技 → 1.5x） | Shadow Claw, Dragon Claw |
| D10 | すなのちから（砂嵐+岩/地/鋼 → ~1.3x） | Earthquake in Sand |
| D11 | ドラゴナイズ（Normal→Dragon+1.2x） | Return |
| D12 | ピクシレイト（Normal→Fairy+1.2x） | Return→Fairy |
| D13 | ちからもち/ヨガパワー（物理Atk 2x） | |
| D14 | こんじょう（状態異常+物理 Atk 1.5x） | Burned+Guts |
| D15 | サンパワー（特殊 SpA 1.5x）★要天候チェック | 晴れ時のみ有効のはず |
| D16 | マルチスケイル（HP満タン → 被ダメ0.5x） | |
| D17 | フィルター/ハードロック（抜群 → 0.75x） | |
| D18 | もふもふ（接触 → 0.5x, 炎 → 2.0x） | |
| D19 | こおりのりんぷん（特殊 → 0.5x） | |
| D20 | スナイパー（急所 → さらに1.5x） | |
| D21 | いろめがね（いまひとつ → 2.0x） | |
| D22 | ブレインフォース（抜群 → 1.25x） | |
| D23 | かたやぶり（防御特性無視） | Mold Breaker vs Multiscale |
| D24 | てきおうりょく（STAB 2.0x） | |
| D25 | メガソル（常に晴れ扱い） | |
| D26 | くさのけがわ（グラスフィールド+物理Def 1.5x） | |

### E. アイテム修正 (items.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| E1 | こだわりハチマキ（物理Atk 1.5x） | Choice Band |
| E2 | こだわりメガネ（特殊SpA 1.5x） | Choice Specs |
| E3 | とつげきチョッキ（特殊SpD 1.5x） | Assault Vest |
| E4 | いのちのたま（5324/4096 ≈ 1.3x） | Life Orb |
| E5 | たつじんのおび（抜群時 4915/4096 ≈ 1.2x） | Expert Belt |
| E6 | タイプ強化（4915/4096） | Charcoal + Fire move |
| E7 | 半減実（抜群時 0.5x） | Yache Berry vs Ice |
| E8 | 半減実（等倍時は効果なし） | Yache Berry vs non-SE |

### F. 特殊技 (moves.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| F1 | イカサマ（相手のAtk使用） | Foul Play |
| F2 | ボディプレス（自分のDef使用） | Body Press |
| F3 | サイコショック（特殊だがDef参照） | Psyshock |
| F4 | はたきおとす（持ち物 → BP 1.5x） | Knock Off |
| F5 | アクロバット（持ち物なし → BP 2x） | Acrobatics |
| F6 | からげんき（状態異常 → BP 2x） | Facade + burn |
| F7 | たたりめ（相手状態異常 → BP 2x） | Hex |
| F8 | からげんき+やけど（BP2x, やけどペナルティ無効） | Facade cancels burn |

### G. フィールド条件
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| G1 | 晴れ+炎技=1.5x | Sun + Fire |
| G2 | 晴れ+水技=0.5x | Sun + Water |
| G3 | 雨+水技=1.5x | Rain + Water |
| G4 | 雨+炎技=0.5x | Rain + Fire |
| G5 | 砂嵐+岩タイプSpD 1.5x | Sand + Rock defender |
| G6 | 雪+氷タイプDef 1.5x | Snow + Ice defender |
| G7 | エレキフィールド+電気技1.3x | Electric Terrain |
| G8 | グラスフィールド+草技1.3x | Grassy Terrain |
| G9 | サイコフィールド+エスパー技1.3x | Psychic Terrain |
| G10 | ミストフィールド+ドラゴン技0.5x | Misty + Dragon |
| G11 | リフレクター（シングル0.5x, ダブル0.667x） | Reflect |
| G12 | ひかりのかべ（特殊版） | Light Screen |
| G13 | オーロラベール（物理+特殊両方） | Aurora Veil |
| G14 | ダブル範囲技 0.75x | Spread in Doubles |
| G15 | てだすけ 1.5x | Helping Hand |
| G16 | フレンドガード 0.75x | Friend Guard |

### H. 急所
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| H1 | 急所 1.5x | Critical hit multiplier |
| H2 | 急所+リフレクター無視 | Crit ignores Reflect |
| H3 | 急所+防御側ランク上昇無視 | Crit ignores +Def |
| H4 | 急所+攻撃側ランク低下無視 | Crit ignores -Atk |

### I. やけど
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| I1 | やけど+物理=0.5x | Burn halves physical |
| I2 | やけど+特殊=影響なし | Burn doesn't affect special |
| I3 | やけど+こんじょう=やけどペナルティ無効+1.5x | Guts + burn |
| I4 | やけど+からげんき=BP2x, ペナルティ無効 | Facade + burn |

### J. 4096ベース演算 (util.ts)
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| J1 | pokeRound: 0.5→0 | Round half to zero |
| J2 | applyMod正確性 | Known values |
| J3 | MOD定数正確性 | 全定数検証 |

### K. データ整合性
| # | テスト項目 | 検証内容 |
|---|-----------|---------|
| K1 | 種族値正確性（主要ポケモン） | Garchomp, Metagross等 |
| K2 | 技データ正確性（BP, タイプ, カテゴリ） | 全38技 |
| K3 | タイプ相性表完全性 | 18x18全エントリ |

### L. 未実装/バグ候補
| # | 項目 | 状態 |
|---|------|------|
| L1 | Solar Power天候チェック欠如 | ★BUG: 常時発動している |
| L2 | Ability final modでMath.round使用 | ★BUG: pokeRoundであるべき |
| L3 | Parental Bond未実装 | 未実装 |
| L4 | Battery/Power Spot未実装 | 未実装 |
| L5 | Flower Gift未実装 | 未実装 |
| L6 | Steely Spirit未実装 | 未実装 |
| L7 | Ruin abilities未実装 | 未実装 |
| L8 | Fairy Aura/Dark Aura未実装 | 未実装 |
| L9 | Analyze未実装 | 未実装 |
| L10 | Gorilla Tactics未実装 | 未実装 |
| L11 | Eviolite未実装 | データあるが適用されていない |
| L12 | Punk Rock (音技被弾0.5x) 未実装 | 仕様にあるが未実装 |

---

## 監査エージェント定義

| Agent ID | 担当 | テストファイル |
|----------|------|-------------|
| audit-A | ステータス計算 | tests/audit-stats.test.ts |
| audit-B | コアダメージ式 | tests/audit-damage-formula.test.ts |
| audit-C | タイプ相性 | tests/audit-type-chart.test.ts |
| audit-D | 特性修正 | tests/audit-abilities.test.ts |
| audit-E | アイテム修正 | tests/audit-items.test.ts |
| audit-F | 特殊技 | tests/audit-special-moves.test.ts |
| audit-G | フィールド条件 | tests/audit-field.test.ts |
| audit-H+I | 急所+やけど | tests/audit-crit-burn.test.ts |
| audit-L | バグ・未実装検出 | tests/audit-bugs.test.ts |
