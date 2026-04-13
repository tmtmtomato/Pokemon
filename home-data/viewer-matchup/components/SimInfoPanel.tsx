/**
 * Collapsible panel that lists all mechanics and systems considered
 * in the team matchup simulation.
 */

interface SimInfoPanelProps {
  lang: "ja" | "en";
  onClose: () => void;
}

interface Section {
  titleJa: string;
  titleEn: string;
  items: { ja: string; en: string }[];
}

const SECTIONS: Section[] = [
  {
    titleJa: "ダメージ計算エンジン",
    titleEn: "Damage Calculation Engine",
    items: [
      { ja: "4096固定小数点演算 (ゲーム内計算の完全再現)", en: "4096-base fixed-point arithmetic (exact game reproduction)" },
      { ja: "16段階乱数ロール (85-100)", en: "16-step random rolls (85-100)" },
      { ja: "18×18 タイプ相性表", en: "18x18 type effectiveness chart" },
      { ja: "STAB (タイプ一致ボーナス)", en: "STAB (Same Type Attack Bonus)" },
      { ja: "テラスタル STAB 計算対応", en: "Tera STAB calculation support" },
      { ja: "急所・複数ヒット技対応", en: "Critical hits & multi-hit moves" },
    ],
  },
  {
    titleJa: "特性によるタイプ免疫",
    titleEn: "Ability-Based Type Immunities",
    items: [
      { ja: "ふゆう → 地面無効", en: "Levitate → Ground immune" },
      { ja: "もらいび → 炎無効", en: "Flash Fire → Fire immune" },
      { ja: "ちょすい → 水無効", en: "Water Absorb → Water immune" },
      { ja: "ちくでん → 電気無効", en: "Volt Absorb → Electric immune" },
      { ja: "でんきエンジン → 電気無効", en: "Motor Drive → Electric immune" },
      { ja: "ひらいしん → 電気無効", en: "Lightning Rod → Electric immune" },
      { ja: "よびみず → 水無効", en: "Storm Drain → Water immune" },
      { ja: "そうしょく → 草無効", en: "Sap Sipper → Grass immune" },
      { ja: "どしょく → 地面無効", en: "Earth Eater → Ground immune" },
      { ja: "たいねつボディ → 炎無効", en: "Well-Baked Body → Fire immune" },
      { ja: "かんそうはだ → 水無効 / 炎1.25倍", en: "Dry Skin → Water immune / Fire 1.25x" },
      { ja: "※ かたやぶり / テラボルテージ / ターボブレイズ で貫通", en: "* Bypassed by Mold Breaker / Teravolt / Turboblaze" },
    ],
  },
  {
    titleJa: "特性によるダメージ補正",
    titleEn: "Ability Damage Modifiers",
    items: [
      { ja: "あついしぼう → 炎/氷 半減", en: "Thick Fat → Fire/Ice halved" },
      { ja: "フェアリーオーラ / ダークオーラ → 1.33倍", en: "Fairy Aura / Dark Aura → 1.33x" },
      { ja: "オーラブレイク → オーラ効果逆転", en: "Aura Break → reverses Aura effects" },
      { ja: "わざわいの器/剣/札/玉 → 攻/防/特攻/特防 0.75倍", en: "Ruin abilities → Atk/Def/SpA/SpD 0.75x" },
      { ja: "おやこあい → 2撃目 0.25倍合算", en: "Parental Bond → 2nd hit at 0.25x" },
      { ja: "ごりむちゅう → 物理技1.5倍", en: "Gorilla Tactics → Physical 1.5x" },
      { ja: "パンクロック / アナライズ / バッテリー 等", en: "Punk Rock / Analytic / Battery etc." },
    ],
  },
  {
    titleJa: "天候システム",
    titleEn: "Weather System",
    items: [
      { ja: "すなおこし (砂嵐): 岩タイプ特防1.5倍 + 非岩/地/鋼に6.25%チップ", en: "Sand Stream: Rock SpD 1.5x + 6.25% chip to non-Rock/Ground/Steel" },
      { ja: "ひでり (晴れ): 炎技1.5倍 / 水技0.5倍", en: "Drought (Sun): Fire 1.5x / Water 0.5x" },
      { ja: "あめふらし (雨): 水技1.5倍 / 炎技0.5倍", en: "Drizzle (Rain): Water 1.5x / Fire 0.5x" },
      { ja: "ゆきふらし (雪): 氷タイプ防御1.5倍", en: "Snow Warning (Snow): Ice-type Def 1.5x" },
      { ja: "天候競合: 遅い方の天候セッターが優先 (後出し)", en: "Weather conflict: slower setter's weather wins (sets last)" },
      { ja: "チーム単位で適用: 選出に天候セッターがいれば全対面に影響", en: "Team-level: affects all matchups if weather setter in selection" },
      { ja: "Magic Guard / Overcoat は砂チップ免疫", en: "Magic Guard / Overcoat immune to sand chip" },
    ],
  },
  {
    titleJa: "接触技チップダメージ",
    titleEn: "Contact Move Chip Damage",
    items: [
      { ja: "さめはだ / てつのトゲ → 接触技使用者に 12.5% チップ", en: "Rough Skin / Iron Barbs → 12.5% chip per contact hit" },
      { ja: "KOレースに反映: 累積チップで実効HP低下", en: "Applied in KO race: cumulative chip reduces effective HP" },
    ],
  },
  {
    titleJa: "ステルスロック (仮想ダメージ)",
    titleEn: "Stealth Rock (Virtual Damage)",
    items: [
      { ja: "SR設置者がいるチーム → 相手全員にSRチップ", en: "Team with SR setter → all opponents take SR chip" },
      { ja: "設置条件: SR設置者が確定1発されない場合のみ", en: "Condition: SR setter must not be guaranteed OHKOd" },
      { ja: "チップ量: 岩相性×12.5% (2倍弱点25%, 4倍弱点50%)", en: "Chip: Rock effectiveness × 12.5% (2x weak=25%, 4x=50%)" },
      { ja: "設置者: カバルドン, バンギラス, ガブリアス, エアームド, コーヴィナイト 他24種", en: "Setters: Hippowdon, Tyranitar, Garchomp, Skarmory, Corviknight +19 more" },
    ],
  },
  {
    titleJa: "KO評価システム",
    titleEn: "KO Evaluation System",
    items: [
      { ja: "effectiveKoN: 確率込み連続KO数 (乱1=1.5, 確2=2.0)", en: "effectiveKoN: probability-aware KO number (random OHKO=1.5, guaranteed 2HKO=2.0)" },
      { ja: "adjustedEKoN: 砂チップ+SRチップで防御側実効HP減少を反映", en: "adjustedEKoN: factors in sand + SR chip reducing defender's effective HP" },
      { ja: "calcKillPressure: 連続的キル圧力スコア (max(0, min(3, 4-eKoN)))", en: "calcKillPressure: continuous kill pressure (max(0, min(3, 4-eKoN)))" },
    ],
  },
  {
    titleJa: "チーム構成・選出ルール",
    titleEn: "Team & Selection Rules",
    items: [
      { ja: "6体構築 → 3体選出 (シングル)", en: "6-member team → 3 selected (Singles)" },
      { ja: "メガ進化: 選出中最大1体", en: "Mega Evolution: max 1 per selection" },
      { ja: "アイテム重複不可 (チーム内)", en: "No duplicate items within team" },
      { ja: "デッドウェイト検出: roleScore < 25 のメンバーがいるチームは棄却", en: "Dead-weight rejection: teams with roleScore < 25 members are discarded" },
      { ja: "roleScore = 0.5×攻撃ニッチ + 0.5×防御ニッチ", en: "roleScore = 0.5 × atkNiche + 0.5 × defNiche" },
    ],
  },
  {
    titleJa: "脅威分析",
    titleEn: "Threat Analysis",
    items: [
      { ja: "回答判定: eKoN≤2.5 かつ KOレース勝利 (速度・チップ込み)", en: "Answer criteria: eKoN≤2.5 and wins KO race (speed + chip aware)" },
      { ja: "脅威レベル: LOW / MEDIUM / HIGH / CRITICAL", en: "Threat levels: LOW / MEDIUM / HIGH / CRITICAL" },
      { ja: "使用率加重回答率: 人気ポケモンの回答漏れを重罰", en: "Usage-weighted answer rate: penalizes unanswered popular Pokemon" },
      { ja: "メガ競合ペナルティ: 2体以上のメガが排他的回答を持つ場合に減点", en: "Mega contention penalty: deducted when 2+ megas have exclusive answers" },
    ],
  },
  {
    titleJa: "スコアリング",
    titleEn: "Scoring",
    items: [
      { ja: "3v3勝敗 = 0.35×キル数 + 0.25×キル圧力 + 0.20×被KO耐性 + 0.20×平均ダメージ", en: "3v3 result = 0.35×kills + 0.25×killPressure + 0.20×surviveRate + 0.20×avgDmg" },
      { ja: "総合ランク = 0.60×勝率 + 0.40×支配力スコア", en: "Combined rank = 0.60×winRate + 0.40×dominanceScore" },
      { ja: "支配力 = 0.30×殺意 + 0.30×脅威耐性 + 0.40×回答率", en: "Dominance = 0.30×killPressure + 0.30×threatResistance + 0.40×answerRate" },
      { ja: "クリティカルギャップ: 使用率Top10への回答漏れ1件ごとに×0.85", en: "Critical gap: ×0.85 per unanswered top-10 usage opponent" },
    ],
  },
  {
    titleJa: "先制技によるKOレース補正",
    titleEn: "Priority Move KO Race Override",
    items: [
      { ja: "しんそく (+2), バレットパンチ, アクアジェット, かげうち 等 (+1)", en: "Extreme Speed (+2), Bullet Punch, Aqua Jet, Shadow Sneak etc. (+1)" },
      { ja: "先制技持ちは素早さ負けでも先制扱い → KOレースで有利", en: "Priority user treated as faster even if slower → KO race advantage" },
      { ja: "先制技ダメージでKOレース計算: 先制eKoN ≤ 相手eKoN なら勝利", en: "Priority KO race: priority eKoN ≤ opponent eKoN → wins" },
      { ja: "双方先制技持ちの場合: 優先度比較 → 同優先度なら素早さ順", en: "Both have priority: compare priority levels → speed tiebreak" },
    ],
  },
  {
    titleJa: "未考慮の要素",
    titleEn: "Not Yet Modeled",
    items: [
      { ja: "ターン進行・交代読み", en: "Turn-by-turn play / prediction" },
      { ja: "状態異常 (やけど, まひ等)", en: "Status conditions (burn, paralysis etc.)" },
      { ja: "壁技 (ひかりのかべ, リフレクター)", en: "Screens (Light Screen, Reflect)" },
      { ja: "回復技 (なまける, じこさいせい等)", en: "Recovery moves (Slack Off, Recover etc.)" },
      { ja: "チーム内シナジー (トリックルーム等)", en: "Team synergies (Trick Room etc.)" },
    ],
  },
];

export function SimInfoPanel({ lang, onClose }: SimInfoPanelProps) {
  return (
    <div className="border-b border-gray-700 bg-gray-950/95 px-4 py-3 text-xs max-h-[60vh] overflow-y-auto viewer-scroll">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-200">
          {lang === "ja" ? "シミュレーション仕様 — 考慮されているシステム" : "Simulation Specs — Modeled Systems"}
        </h2>
        <button
          onClick={onClose}
          className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition"
        >
          {lang === "ja" ? "閉じる" : "Close"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {SECTIONS.map((sec) => (
          <div key={sec.titleEn} className="rounded border border-gray-800 bg-gray-900/60 p-2.5">
            <h3 className="text-[11px] font-semibold text-gray-300 mb-1.5 uppercase tracking-wide">
              {lang === "ja" ? sec.titleJa : sec.titleEn}
            </h3>
            <ul className="space-y-0.5">
              {sec.items.map((item, i) => (
                <li key={i} className="text-[11px] text-gray-400 leading-relaxed pl-2 border-l border-gray-800">
                  {lang === "ja" ? item.ja : item.en}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
