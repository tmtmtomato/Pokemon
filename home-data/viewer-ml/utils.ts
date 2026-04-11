/**
 * Utility functions for the ML Insights Viewer.
 */

import type { Lang } from "../viewer/i18n";

export function fmtPct(pct: number, digits = 1): string {
  return (pct * 100).toFixed(digits) + "%";
}

export function fmtScore(score: number, digits = 3): string {
  return score.toFixed(digits);
}

/** Color for a score 0-1 (red → yellow → green). */
export function scoreColor(score: number): string {
  if (score >= 0.7) return "text-green-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

/** Background color for a score bar 0-1. */
export function scoreBg(score: number): string {
  if (score >= 0.7) return "bg-green-500/60";
  if (score >= 0.5) return "bg-yellow-500/60";
  return "bg-red-500/60";
}

/** Severity label. */
export function severityLabel(severity: number, lang: Lang): string {
  if (lang === "ja") {
    if (severity >= 0.3) return "深刻";
    if (severity >= 0.15) return "中程度";
    return "軽微";
  }
  if (severity >= 0.3) return "Critical";
  if (severity >= 0.15) return "Moderate";
  return "Minor";
}

export function severityColor(severity: number): string {
  if (severity >= 0.3) return "text-red-400";
  if (severity >= 0.15) return "text-yellow-400";
  return "text-gray-400";
}

/** Feature name to readable label. */
export function featureLabel(name: string, lang?: Lang): string {
  if (lang === "ja") return featureLabelJa(name);
  return name
    .replace(/^(my_|opp_|emb_)/, (m) =>
      m === "my_" ? "[My] " : m === "opp_" ? "[Opp] " : "[Emb] ",
    )
    .replace(/_/g, " ");
}

// --- Japanese feature name translations ---

const FEATURE_JA: Record<string, string> = {
  // Move Advisor (20)
  faint_differential: "瀕死数差", turn_normalized: "ターン進行度",
  my_remaining: "自残数", opp_remaining: "相手残数",
  is_priority: "先制技", base_power: "威力", type_eff_vs_target: "タイプ相性",
  speed_relative: "相対素早さ", moved_first: "先手行動", partner_active: "パートナー場",
  is_protect: "まもる", is_spread: "全体技", is_status: "変化技",
  move_repeated: "技連打", consecutive_protects: "連続まもる",
  is_special: "特殊技", is_physical: "物理技", is_stab: "タイプ一致",
  weather_favorable: "天候有利", is_switch: "交代",
  // Selection
  type_adv_vs_opp: "タイプ有利", teammate_synergy: "チームシナジー",
  meta_sel_rate: "メタ選出率", type_disadv_from_opp: "タイプ不利",
  avg_move_winrate: "技平均勝率", team_has_other_mega: "他メガあり",
  threat_count: "脅威数", partymate_synergy: "パーティシナジー",
  check_count: "チェック数", defensive_niche: "防御ニッチ",
  best_matchup_wr: "最良対面勝率", matchup_confidence: "対面信頼度",
  hist_wr_vs_opp: "相手対戦勝率", worst_matchup_wr: "最悪対面勝率",
  speed_adv_vs_opp: "素早さ優位", is_unique_coverage: "ユニークカバレッジ",
  archetype_fit: "アーキタイプ適合", is_mega: "メガシンカ",
  favorable_matchup_count: "有利対面数", unfavorable_matchup_count: "不利対面数",
  is_intimidate: "いかく持ち", is_unique_role: "ユニーク役割",
  // Team Eval cross features
  historical_matchup: "過去対戦勝率", net_type_advantage: "タイプ有利差",
  speed_advantage: "素早さ優位", intimidate_diff: "いかく差",
  weather_conflict: "天候衝突", trick_room_asymmetry: "TR非対称性",
};

const PREFIXED_JA: Record<string, string> = {
  team_win_rate: "チーム勝率", best_core_win_rate: "ベストコア勝率",
  hp_mean: "HP平均", hp_max: "HP最大",
  atk_mean: "攻撃平均", atk_max: "攻撃最大",
  def_mean: "防御平均", def_max: "防御最大",
  spa_mean: "特攻平均", spa_max: "特攻最大",
  spd_mean: "特防平均", spd_max: "特防最大",
  spe_mean: "素早さ平均", spe_max: "素早さ最大",
  spe_min: "素早さ最遅", spe_median: "素早さ中央", spe_fastest: "最速",
  teammate_synergy_mean: "シナジー平均", teammate_synergy_max: "シナジー最大",
  physical_ratio: "物理比率", special_ratio: "特殊比率",
  has_snow: "雪あり", has_sand: "砂あり", has_sun: "晴あり", has_rain: "雨あり",
  has_intimidate: "いかくあり", has_fake_out: "ねこだましあり",
  has_trick_room: "TRあり", has_tailwind: "おいかぜあり",
  has_redirect: "リダイレクトあり", has_mega: "メガあり",
};

const EMB_JA: Record<string, string> = {
  selrate: "選出率", usage: "使用率", winrate: "勝率",
  bulk_phys: "物理耐久", bulk_spec: "特殊耐久",
  spe: "素早さ", atk: "攻撃", def: "防御", spa: "特攻", spd: "特防", hp: "HP",
  bst: "種族値合計", speed_pctile: "素早さ順位",
  phys_ratio: "物理比率", spec_ratio: "特殊比率",
  role_phys: "物理AT", role_spec: "特殊AT", has_mega: "メガ可能",
};

const TYPE_JA: Record<string, string> = {
  Normal: "ノーマル", Fire: "ほのお", Water: "みず", Grass: "くさ",
  Electric: "でんき", Ice: "こおり", Fighting: "かくとう", Poison: "どく",
  Ground: "じめん", Flying: "ひこう", Psychic: "エスパー", Bug: "むし",
  Rock: "いわ", Ghost: "ゴースト", Dragon: "ドラゴン", Dark: "あく",
  Steel: "はがね", Fairy: "フェアリー",
};

function featureLabelJa(name: string): string {
  if (FEATURE_JA[name]) return FEATURE_JA[name];

  if (name.startsWith("emb_")) {
    const rest = name.slice(4);
    if (EMB_JA[rest]) return EMB_JA[rest];
    const m = rest.match(/^type_(\d+)$/);
    if (m) return `タイプ埋込(${m[1]})`;
    return rest.replace(/_/g, " ");
  }

  let prefix = "";
  let rest = name;
  if (name.startsWith("my_")) { prefix = "自"; rest = name.slice(3); }
  else if (name.startsWith("opp_")) { prefix = "相手"; rest = name.slice(4); }

  if (prefix && PREFIXED_JA[rest]) return prefix + PREFIXED_JA[rest];

  const cov = rest.match(/^coverage_(\w+)$/);
  if (cov && TYPE_JA[cov[1]]) return prefix + TYPE_JA[cov[1]] + "打点";

  const weak = rest.match(/^weakness_(\w+)$/);
  if (weak && TYPE_JA[weak[1]]) return prefix + TYPE_JA[weak[1]] + "弱点数";

  return name.replace(/_/g, " ");
}

// --- Japanese bad play description translations ---

const BAD_PLAY_DESC_JA: Record<string, string> = {
  "Consecutive Protect/Detect": "連続まもる/みきり",
  "Non-STAB low-power Weather Ball": "不一致低威力ウェザーボール",
  "Status move late game while behind": "不利時の終盤で変化技使用",
};

const MOVE_NAME_JA: Record<string, string> = {
  "Electro Shot": "エレクトロビーム",
  "Sucker Punch": "ふいうち",
  "Flare Blitz": "フレアドライブ",
  "Dire Claw": "フェイタルクロー",
  "Matcha Gotcha": "マッチャガッチャ",
};

export function badPlayDescJa(desc: string): string {
  if (BAD_PLAY_DESC_JA[desc]) return BAD_PLAY_DESC_JA[desc];
  const m = desc.match(/^(.+) into resisted target$/);
  if (m) return `半減相手に${MOVE_NAME_JA[m[1]] ?? m[1]}`;
  return desc;
}

export type Tab = "teams" | "moves" | "badplays" | "models";

export function tabLabel(tab: Tab, lang: Lang): string {
  const labels: Record<Tab, [string, string]> = {
    teams: ["チームランキング", "Team Rankings"],
    moves: ["技品質マップ", "Move Quality"],
    badplays: ["悪手パターン", "Bad Plays"],
    models: ["モデル分析", "Model Analysis"],
  };
  return labels[tab][lang === "ja" ? 0 : 1];
}
