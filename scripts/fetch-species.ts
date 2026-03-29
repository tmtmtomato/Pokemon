/**
 * Fetch Pokemon species data from PokeAPI and merge into src/data/species.json.
 *
 * Usage: npx tsx scripts/fetch-species.ts
 *
 * - Fetches base form data (types, stats, weight, abilities) from PokeAPI
 * - Preserves all existing entries in species.json (Champions-specific megas etc.)
 * - Only adds NEW Pokemon not already in species.json
 * - Caches API responses in scripts/.cache/ for fast re-runs
 * - Rate-limited to ~90 req/min (650ms delay)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// Types
// ============================================================

type TypeName =
  | 'Normal' | 'Fire' | 'Water' | 'Electric' | 'Grass' | 'Ice'
  | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug'
  | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy';

interface StatsTable {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

interface SpeciesData {
  id: number;
  name: string;
  types: [TypeName] | [TypeName, TypeName];
  baseStats: StatsTable;
  weightKg: number;
  abilities: string[];
  mega?: {
    stone: string;
    types: [TypeName] | [TypeName, TypeName];
    baseStats: StatsTable;
    ability: string;
    weightKg?: number;
  };
}

// ============================================================
// PokeAPI type/stat mappings
// ============================================================

const TYPE_MAP: Record<string, TypeName> = {
  normal: 'Normal', fire: 'Fire', water: 'Water', electric: 'Electric',
  grass: 'Grass', ice: 'Ice', fighting: 'Fighting', poison: 'Poison',
  ground: 'Ground', flying: 'Flying', psychic: 'Psychic', bug: 'Bug',
  rock: 'Rock', ghost: 'Ghost', dragon: 'Dragon', dark: 'Dark',
  steel: 'Steel', fairy: 'Fairy',
};

const STAT_MAP: Record<string, keyof StatsTable> = {
  hp: 'hp', attack: 'atk', defense: 'def',
  'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe',
};

// ============================================================
// Master Pokemon list — JP name → displayName + PokeAPI slug
// ============================================================

interface PokemonEntry {
  displayName: string;       // Key in species.json
  pokeApiId: string;         // PokeAPI endpoint slug
  megaApiId?: string;        // PokeAPI slug for standard mega form
  megaStone?: string;        // Name of the mega stone
}

const POKEMON_LIST: PokemonEntry[] = [
  // ===== Doubles Top 150 =====
  // 1. ガオガエン (already exists)
  // 2. バドレックス(黒馬)
  { displayName: 'Calyrex-Shadow', pokeApiId: 'calyrex-shadow-rider' },
  // 3. ミライドン
  { displayName: 'Miraidon', pokeApiId: 'miraidon' },
  // 4. ウーラオス(連撃)
  { displayName: 'Urshifu-Rapid-Strike', pokeApiId: 'urshifu-rapid-strike' },
  // 5. ゴリランダー
  { displayName: 'Rillaboom', pokeApiId: 'rillaboom' },
  // 6. ザマゼンタ
  { displayName: 'Zamazenta', pokeApiId: 'zamazenta-crowned' },
  // 7. バドレックス(白馬)
  { displayName: 'Calyrex-Ice', pokeApiId: 'calyrex-ice-rider' },
  // 8. パオジアン
  { displayName: 'Chien-Pao', pokeApiId: 'chien-pao' },
  // 9. コライドン
  { displayName: 'Koraidon', pokeApiId: 'koraidon' },
  // 10. トルネロス(化身)
  { displayName: 'Tornadus', pokeApiId: 'tornadus-incarnate' },
  // 11. カイオーガ
  { displayName: 'Kyogre', pokeApiId: 'kyogre' },
  // 12. エルフーン
  { displayName: 'Whimsicott', pokeApiId: 'whimsicott' },
  // 13. タケルライコ
  { displayName: 'Raging Bolt', pokeApiId: 'raging-bolt' },
  // 14. ハバタクカミ
  { displayName: 'Flutter Mane', pokeApiId: 'flutter-mane' },
  // 15. ルナアーラ
  { displayName: 'Lunala', pokeApiId: 'lunala' },
  // 16. モロバレル
  { displayName: 'Amoonguss', pokeApiId: 'amoonguss' },
  // 17. イエッサン(メス)
  { displayName: 'Indeedee-F', pokeApiId: 'indeedee-female' },
  // 18. オーロンゲ
  { displayName: 'Grimmsnarl', pokeApiId: 'grimmsnarl' },
  // 19. ランドロス(化身)
  { displayName: 'Landorus', pokeApiId: 'landorus-incarnate' },
  // 20. オーガポン
  { displayName: 'Ogerpon', pokeApiId: 'ogerpon' },
  // 21. イーユイ
  { displayName: 'Chi-Yu', pokeApiId: 'chi-yu' },
  // 22. ドーブル
  { displayName: 'Smeargle', pokeApiId: 'smeargle' },
  // 23. ガチグマ
  { displayName: 'Ursaluna', pokeApiId: 'ursaluna' },
  // 24. リキキリン
  { displayName: 'Farigiraf', pokeApiId: 'farigiraf' },
  // 25. ウルガモス (already exists)
  // 26. ザシアン
  { displayName: 'Zacian', pokeApiId: 'zacian-crowned' },
  // 27. テラパゴス
  { displayName: 'Terapagos', pokeApiId: 'terapagos' },
  // 28. テツノカイナ
  { displayName: 'Iron Hands', pokeApiId: 'iron-hands' },
  // 29. グラードン
  { displayName: 'Groudon', pokeApiId: 'groudon' },
  // 30. ピッピ
  { displayName: 'Clefairy', pokeApiId: 'clefairy' },
  // 31. カイリュー (already exists)
  // 32. アラブルタケ
  { displayName: 'Brute Bonnet', pokeApiId: 'brute-bonnet' },
  // 33. ウーラオス(一撃)
  { displayName: 'Urshifu', pokeApiId: 'urshifu-single-strike' },
  // 34. ディンルー
  { displayName: 'Ting-Lu', pokeApiId: 'ting-lu' },
  // 35. ホウオウ
  { displayName: 'Ho-Oh', pokeApiId: 'ho-oh' },
  // 36. ガチグマ(アカツキ)
  { displayName: 'Ursaluna-Bloodmoon', pokeApiId: 'ursaluna-bloodmoon' },
  // 37. トドロクツキ
  { displayName: 'Roaring Moon', pokeApiId: 'roaring-moon' },
  // 38. ウネルミナモ
  { displayName: 'Walking Wake', pokeApiId: 'walking-wake' },
  // 39. テツノコウベ
  { displayName: 'Iron Jugulis', pokeApiId: 'iron-jugulis' },
  // 40. コノヨザル
  { displayName: 'Annihilape', pokeApiId: 'annihilape' },
  // 41. ドドゲザン (already exists as Kingambit)
  // 42. テツノブジン
  { displayName: 'Iron Valiant', pokeApiId: 'iron-valiant' },
  // 43. イッカネズミ
  { displayName: 'Maushold', pokeApiId: 'maushold-family-of-four' },
  // 44. テツノワダチ
  { displayName: 'Iron Treads', pokeApiId: 'iron-treads' },
  // 45. オオニューラ
  { displayName: 'Sneasler', pokeApiId: 'sneasler' },
  // 46. コータス (already exists as Torkoal)
  // 47. ヘイラッシャ
  { displayName: 'Dondozo', pokeApiId: 'dondozo' },
  // 48. ヤミラミ
  { displayName: 'Sableye', pokeApiId: 'sableye' },
  // 49. メタモン
  { displayName: 'Ditto', pokeApiId: 'ditto' },
  // 50. マタドガス(ガラル)
  { displayName: 'Weezing-Galar', pokeApiId: 'weezing-galar' },
  // 51. ヤバソチャ
  { displayName: 'Sinistcha', pokeApiId: 'sinistcha' },
  // 52. テツノツツミ
  { displayName: 'Iron Bundle', pokeApiId: 'iron-bundle' },
  // 53. ペリッパー (already exists)
  // 54. エンテイ
  { displayName: 'Entei', pokeApiId: 'entei' },
  // 55. カラミンゴ
  { displayName: 'Flamigo', pokeApiId: 'flamigo' },
  // 56. レックウザ
  { displayName: 'Rayquaza', pokeApiId: 'rayquaza' },
  // 57. キュウコン(アローラ)
  { displayName: 'Ninetales-Alola', pokeApiId: 'ninetales-alola' },
  // 58. ムゲンダイナ
  { displayName: 'Eternatus', pokeApiId: 'eternatus' },
  // 59. ベトベトン(アローラ)
  { displayName: 'Muk-Alola', pokeApiId: 'muk-alola' },
  // 60. ボルトロス(化身)
  { displayName: 'Thundurus', pokeApiId: 'thundurus-incarnate' },
  // 61. ヤミカラス
  { displayName: 'Murkrow', pokeApiId: 'murkrow' },
  // 62. キラフロル
  { displayName: 'Glimmora', pokeApiId: 'glimmora' },
  // 63. ライチュウ
  { displayName: 'Raichu', pokeApiId: 'raichu' },
  // 64. シャリタツ
  { displayName: 'Tatsugiri', pokeApiId: 'tatsugiri-curly' },
  // 65. ランドロス(霊獣)
  { displayName: 'Landorus-Therian', pokeApiId: 'landorus-therian' },
  // 66. イダイトウ(オス)
  { displayName: 'Basculegion', pokeApiId: 'basculegion-male' },
  // 67. ブリジュラス
  { displayName: 'Archaludon', pokeApiId: 'archaludon' },
  // 68. バンギラス (already exists)
  // 69. ウガツホムラ
  { displayName: 'Gouging Fire', pokeApiId: 'gouging-fire' },
  // 70. ワタッコ
  { displayName: 'Jumpluff', pokeApiId: 'jumpluff' },
  // 71. グレンアルマ
  { displayName: 'Armarouge', pokeApiId: 'armarouge' },
  // 72. チオンジェン
  { displayName: 'Wo-Chien', pokeApiId: 'wo-chien' },
  // 73. トリトドン
  { displayName: 'Gastrodon', pokeApiId: 'gastrodon' },
  // 74. アマージョ
  { displayName: 'Tsareena', pokeApiId: 'tsareena' },
  // 75. クレセリア
  { displayName: 'Cresselia', pokeApiId: 'cresselia' },
  // 76. オニシズクモ
  { displayName: 'Araquanid', pokeApiId: 'araquanid' },
  // 77. ヤレユータン
  { displayName: 'Oranguru', pokeApiId: 'oranguru' },
  // 78. キョジオーン
  { displayName: 'Garganacl', pokeApiId: 'garganacl' },
  // 79. ゾロアーク(ヒスイ)
  { displayName: 'Zoroark-Hisui', pokeApiId: 'zoroark-hisui' },
  // 80. イイネイヌ
  { displayName: 'Okidogi', pokeApiId: 'okidogi' },
  // 81. ファイアロー
  { displayName: 'Talonflame', pokeApiId: 'talonflame' },
  // 82. サケブシッポ
  { displayName: 'Scream Tail', pokeApiId: 'scream-tail' },
  // 83. コジョンド
  { displayName: 'Mienshao', pokeApiId: 'mienshao' },
  // 84. ハリーマン
  { displayName: 'Overqwil', pokeApiId: 'overqwil' },
  // 86. イエッサン(オス)
  { displayName: 'Indeedee', pokeApiId: 'indeedee-male' },
  // 87. ソルガレオ
  { displayName: 'Solgaleo', pokeApiId: 'solgaleo' },
  // 88. モスノウ
  { displayName: 'Frosmoth', pokeApiId: 'frosmoth' },
  // 89. レジギガス
  { displayName: 'Regigigas', pokeApiId: 'regigigas' },
  // 90. ルギア
  { displayName: 'Lugia', pokeApiId: 'lugia' },
  // 91. リザードン (already exists)
  // 92. エルレイド
  { displayName: 'Gallade', pokeApiId: 'gallade' },
  // 93. ミミッキュ (already exists)
  // 94. ドサイドン
  { displayName: 'Rhyperior', pokeApiId: 'rhyperior' },
  // 95. キュワワー
  { displayName: 'Comfey', pokeApiId: 'comfey' },
  // 96. マタドガス(通常)
  { displayName: 'Weezing', pokeApiId: 'weezing' },
  // 97. キュレム(ブラック)
  { displayName: 'Kyurem-Black', pokeApiId: 'kyurem-black' },
  // 98. バクフーン(ヒスイ)
  { displayName: 'Typhlosion-Hisui', pokeApiId: 'typhlosion-hisui' },
  // 99. ギラティナ(アナザー)
  { displayName: 'Giratina', pokeApiId: 'giratina-altered' },
  // 100. ドヒドイデ
  { displayName: 'Toxapex', pokeApiId: 'toxapex' },
  // 101. ソウブレイズ
  { displayName: 'Ceruledge', pokeApiId: 'ceruledge' },
  // 102. アシレーヌ
  { displayName: 'Primarina', pokeApiId: 'primarina' },
  // 103. サーフゴー
  { displayName: 'Gholdengo', pokeApiId: 'gholdengo' },
  // 104. フシギバナ
  { displayName: 'Venusaur', pokeApiId: 'venusaur' },
  // 105. ネクロズマ(ウルトラ) → Use Dusk Mane as the competitive form
  { displayName: 'Necrozma-Dusk-Mane', pokeApiId: 'necrozma-dusk-mane' },
  // 106. ドレディア(ヒスイ)
  { displayName: 'Lilligant-Hisui', pokeApiId: 'lilligant-hisui' },
  // 107. レジエレキ
  { displayName: 'Regieleki', pokeApiId: 'regieleki' },
  // 108. テツノドクガ
  { displayName: 'Iron Moth', pokeApiId: 'iron-moth' },
  // 109. ズルッグ
  { displayName: 'Scraggy', pokeApiId: 'scraggy' },
  // 110. カポエラー
  { displayName: 'Hitmontop', pokeApiId: 'hitmontop' },
  // 111. サンダー(ガラル)
  { displayName: 'Zapdos-Galar', pokeApiId: 'zapdos-galar' },
  // 112. ポリゴン2
  { displayName: 'Porygon2', pokeApiId: 'porygon2' },
  // 113. レシラム
  { displayName: 'Reshiram', pokeApiId: 'reshiram' },
  // 114. ライチュウ(アローラ)
  { displayName: 'Raichu-Alola', pokeApiId: 'raichu-alola' },
  // 115. チラチーノ
  { displayName: 'Cinccino', pokeApiId: 'cinccino' },
  // 116. マスカーニャ
  { displayName: 'Meowscarada', pokeApiId: 'meowscarada' },
  // 117. ミュウツー
  { displayName: 'Mewtwo', pokeApiId: 'mewtwo' },
  // 118. ブリムオン (already exists as Hatterene)
  // 119. ディアルガ(オリジン)
  { displayName: 'Dialga-Origin', pokeApiId: 'dialga-origin' },
  // 120. ニンフィア
  { displayName: 'Sylveon', pokeApiId: 'sylveon' },
  // 121. レジドラゴ
  { displayName: 'Regidrago', pokeApiId: 'regidrago' },
  // 122. ヒードラン
  { displayName: 'Heatran', pokeApiId: 'heatran' },
  // 123. ドラパルト (already exists)
  // 124. ハッサム (already exists)
  // 125. ミロカロス
  { displayName: 'Milotic', pokeApiId: 'milotic' },
  // 126. ブラッキー
  { displayName: 'Umbreon', pokeApiId: 'umbreon' },
  // 127. ダーテング
  { displayName: 'Shiftry', pokeApiId: 'shiftry' },
  // 128. ファイヤー(ガラル)
  { displayName: 'Moltres-Galar', pokeApiId: 'moltres-galar' },
  // 129. テツノカシラ
  { displayName: 'Iron Crown', pokeApiId: 'iron-crown' },
  // 130. マホイップ
  { displayName: 'Alcremie', pokeApiId: 'alcremie' },
  // 131. サンダー(通常)
  { displayName: 'Zapdos', pokeApiId: 'zapdos' },
  // 132. デカヌチャン
  { displayName: 'Tinkaton', pokeApiId: 'tinkaton' },
  // 133. ゴチルゼル
  { displayName: 'Gothitelle', pokeApiId: 'gothitelle' },
  // 134. メレシー
  { displayName: 'Carbink', pokeApiId: 'carbink' },
  // 135. メタグロス (already exists)
  // 136. フワライド
  { displayName: 'Drifblim', pokeApiId: 'drifblim' },
  // 137. ハギギシリ
  { displayName: 'Bruxish', pokeApiId: 'bruxish' },
  // 139. サイドン
  { displayName: 'Rhydon', pokeApiId: 'rhydon' },
  // 140. マンムー
  { displayName: 'Mamoswine', pokeApiId: 'mamoswine' },
  // 141. ネオラント
  { displayName: 'Lumineon', pokeApiId: 'lumineon' },
  // 142. ボルトロス(霊獣)
  { displayName: 'Thundurus-Therian', pokeApiId: 'thundurus-therian' },
  // 143. ネクロズマ(日食/Dawn Wings)
  { displayName: 'Necrozma-Dawn-Wings', pokeApiId: 'necrozma-dawn-wings' },
  // 144. ダグトリオ
  { displayName: 'Dugtrio', pokeApiId: 'dugtrio' },
  // 145. イルミーゼ
  { displayName: 'Illumise', pokeApiId: 'illumise' },
  // 146. マリルリ
  { displayName: 'Azumarill', pokeApiId: 'azumarill' },
  // 147. ウインディ(ヒスイ)
  { displayName: 'Arcanine-Hisui', pokeApiId: 'arcanine-hisui' },
  // 148. ガブリアス (already exists)
  // 149. セグレイブ
  { displayName: 'Baxcalibur', pokeApiId: 'baxcalibur' },
  // 150. ニャオニクス
  { displayName: 'Meowstic', pokeApiId: 'meowstic-male' },

  // ===== Singles Top 150 (unique additions not in doubles) =====
  // 17. グライオン
  { displayName: 'Gliscor', pokeApiId: 'gliscor' },
  // 21. ドオー
  { displayName: 'Clodsire', pokeApiId: 'clodsire' },
  // 30. ママンボウ
  { displayName: 'Alomomola', pokeApiId: 'alomomola' },
  // 45. ラウドボーン
  { displayName: 'Skeledirge', pokeApiId: 'skeledirge' },
  // 46. キノガッサ
  { displayName: 'Breloom', pokeApiId: 'breloom' },
  // 54. ラッキー
  { displayName: 'Chansey', pokeApiId: 'chansey' },
  // 60. キュレム(ホワイト)
  { displayName: 'Kyurem-White', pokeApiId: 'kyurem-white' },
  // 69. バシャーモ
  { displayName: 'Blaziken', pokeApiId: 'blaziken' },
  // 72. オリーヴァ
  { displayName: 'Arboliva', pokeApiId: 'arboliva' },
  // 81. ヌメルゴン
  { displayName: 'Goodra', pokeApiId: 'goodra' },
  // 83. フォレトス
  { displayName: 'Forretress', pokeApiId: 'forretress' },
  // 84. ラグラージ
  { displayName: 'Swampert', pokeApiId: 'swampert' },
  // 85. ウインディ(通常)
  { displayName: 'Arcanine', pokeApiId: 'arcanine' },
  // 88. パルシェン
  { displayName: 'Cloyster', pokeApiId: 'cloyster' },
  // 90. イダイナキバ
  { displayName: 'Great Tusk', pokeApiId: 'great-tusk' },
  // 92. エーフィ
  { displayName: 'Espeon', pokeApiId: 'espeon' },
  // 93. クレッフィ
  { displayName: 'Klefki', pokeApiId: 'klefki' },
  // 94. ウェーニバル
  { displayName: 'Quaquaval', pokeApiId: 'quaquaval' },
  // 95. ピクシー
  { displayName: 'Clefable', pokeApiId: 'clefable' },
  // 96. ギャラドス
  { displayName: 'Gyarados', pokeApiId: 'gyarados' },
  // 98. ハピナス
  { displayName: 'Blissey', pokeApiId: 'blissey' },
  // 100. ジャローダ
  { displayName: 'Serperior', pokeApiId: 'serperior' },
  // 102. アブリボン
  { displayName: 'Ribombee', pokeApiId: 'ribombee' },
  // 103. クエスパトラ
  { displayName: 'Espathra', pokeApiId: 'espathra' },
  // 104. ラティオス
  { displayName: 'Latios', pokeApiId: 'latios' },
  // 109. カビゴン
  { displayName: 'Snorlax', pokeApiId: 'snorlax' },
  // 113. ロトム
  { displayName: 'Rotom', pokeApiId: 'rotom' },
  // 117. ダイケンキ(ヒスイ)
  { displayName: 'Samurott-Hisui', pokeApiId: 'samurott-hisui' },
  // 118. ランクルス
  { displayName: 'Reuniclus', pokeApiId: 'reuniclus' },
  // 120. バサギリ
  { displayName: 'Kleavor', pokeApiId: 'kleavor' },
  // 121. ロトム(ウォッシュ)
  { displayName: 'Rotom-Wash', pokeApiId: 'rotom-wash' },
  // 123. パーモット
  { displayName: 'Pawmot', pokeApiId: 'pawmot' },
  // 129. ゲッコウガ
  { displayName: 'Greninja', pokeApiId: 'greninja' },
  // 130. ディアルガ
  { displayName: 'Dialga', pokeApiId: 'dialga' },
  // 132. シャンデラ
  { displayName: 'Chandelure', pokeApiId: 'chandelure' },
  // 133. タギングル
  { displayName: 'Grafaiai', pokeApiId: 'grafaiai' },
  // 135. ドンファン
  { displayName: 'Donphan', pokeApiId: 'donphan' },
  // 137. キチキギス
  { displayName: 'Fezandipiti', pokeApiId: 'fezandipiti' },
  // 138. ヤドキング(ガラル)
  { displayName: 'Slowking-Galar', pokeApiId: 'slowking-galar' },
  // 141. ラティアス
  { displayName: 'Latias', pokeApiId: 'latias' },
  // 142. ウッウ
  { displayName: 'Cramorant', pokeApiId: 'cramorant' },
  // 143. ジバコイル
  { displayName: 'Magnezone', pokeApiId: 'magnezone' },
  // 144. ギラティナ(オリジン)
  { displayName: 'Giratina-Origin', pokeApiId: 'giratina-origin' },
  // 147. エアームド
  { displayName: 'Skarmory', pokeApiId: 'skarmory' },
  // 148. エンニュート
  { displayName: 'Salazzle', pokeApiId: 'salazzle' },

  // ===== Additional competitive staples not in rankings but useful =====
  // Kyurem base form (for reference)
  { displayName: 'Kyurem', pokeApiId: 'kyurem' },
  // Necrozma base
  { displayName: 'Necrozma', pokeApiId: 'necrozma' },
  // Tornadus-Therian
  { displayName: 'Tornadus-Therian', pokeApiId: 'tornadus-therian' },
];

// PokeAPI identifiers that need fallback (may not exist or use different slugs)
const FALLBACK_IDS: Record<string, string> = {
  'calyrex-shadow-rider': 'calyrex-shadow',
  'calyrex-ice-rider': 'calyrex-ice',
  'zacian-crowned': 'zacian',
  'zamazenta-crowned': 'zamazenta',
  'necrozma-dusk-mane': 'necrozma-dusk',
  'necrozma-dawn-wings': 'necrozma-dawn',
  'dialga-origin': 'dialga',
  'giratina-origin': 'giratina',
  'ursaluna-bloodmoon': 'ursaluna',
  'basculegion-male': 'basculegion',
  'indeedee-male': 'indeedee',
};

// ============================================================
// PokeAPI client with caching + rate limiting
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, '.cache');
const SPECIES_JSON_PATH = join(__dirname, '..', 'src', 'data', 'species.json');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2/pokemon';

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

function getCachePath(slug: string): string {
  return join(CACHE_DIR, `${slug}.json`);
}

function readCache(slug: string): any | null {
  const path = getCachePath(slug);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
  return null;
}

function writeCache(slug: string, data: any): void {
  writeFileSync(getCachePath(slug), JSON.stringify(data));
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFromPokeAPI(slug: string): Promise<any | null> {
  // Check cache first
  const cached = readCache(slug);
  if (cached) return cached;

  const url = `${POKEAPI_BASE}/${slug}`;
  let retries = 3;

  while (retries > 0) {
    try {
      await delay(650); // Rate limit
      const response = await fetch(url);

      if (response.status === 404) {
        // Try fallback ID
        const fallback = FALLBACK_IDS[slug];
        if (fallback && fallback !== slug) {
          console.log(`  404 for ${slug}, trying fallback: ${fallback}`);
          return fetchFromPokeAPI(fallback);
        }
        console.warn(`  ❌ 404: ${slug} not found`);
        return null;
      }

      if (response.status === 429) {
        console.warn(`  Rate limited, waiting 10s...`);
        await delay(10000);
        retries--;
        continue;
      }

      if (!response.ok) {
        console.warn(`  HTTP ${response.status} for ${slug}`);
        retries--;
        await delay(2000);
        continue;
      }

      const data = await response.json();
      writeCache(slug, data);
      return data;
    } catch (err: any) {
      console.warn(`  Network error for ${slug}: ${err.message}`);
      retries--;
      await delay(3000);
    }
  }

  return null;
}

// ============================================================
// Transformers: PokeAPI response → SpeciesData
// ============================================================

function extractTypes(data: any): [TypeName] | [TypeName, TypeName] {
  const sorted = [...data.types].sort((a: any, b: any) => a.slot - b.slot);
  const types = sorted.map((t: any) => TYPE_MAP[t.type.name]).filter(Boolean);
  if (types.length === 0) throw new Error('No types found');
  return types.length === 1 ? [types[0]] : [types[0], types[1]];
}

function extractStats(data: any): StatsTable {
  const stats: Partial<StatsTable> = {};
  for (const s of data.stats) {
    const key = STAT_MAP[s.stat.name];
    if (key) stats[key] = s.base_stat;
  }
  return stats as StatsTable;
}

function formatAbilityName(apiName: string): string {
  return apiName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractAbilities(data: any): string[] {
  return data.abilities.map((a: any) => formatAbilityName(a.ability.name));
}

function extractNationalDexId(data: any): number {
  // For base forms, data.id is the national dex number
  // For alternate forms, extract from species URL
  if (data.id < 10000) return data.id;

  // Extract from species URL: https://pokeapi.co/api/v2/pokemon-species/645/
  const speciesUrl = data.species?.url;
  if (speciesUrl) {
    const match = speciesUrl.match(/\/(\d+)\/?$/);
    if (match) return parseInt(match[1], 10);
  }
  return data.id;
}

function transformToSpeciesData(entry: PokemonEntry, apiData: any): SpeciesData {
  return {
    id: extractNationalDexId(apiData),
    name: entry.displayName,
    types: extractTypes(apiData),
    baseStats: extractStats(apiData),
    weightKg: Math.round(apiData.weight / 10 * 10) / 10, // hectograms to kg
    abilities: extractAbilities(apiData),
  };
}

// ============================================================
// Validation
// ============================================================

function validateEntry(name: string, data: SpeciesData): string[] {
  const errors: string[] = [];

  if (!data.id || data.id < 1) errors.push(`${name}: invalid id ${data.id}`);
  if (!data.name) errors.push(`${name}: missing name`);
  if (!data.types || data.types.length === 0) errors.push(`${name}: missing types`);

  for (const t of data.types) {
    if (!TYPE_MAP[t.toLowerCase()]) errors.push(`${name}: invalid type "${t}"`);
  }

  const stats = data.baseStats;
  for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
    const val = stats[key];
    if (typeof val !== 'number' || val < 1 || val > 300) {
      errors.push(`${name}: invalid stat ${key}=${val}`);
    }
  }

  if (typeof data.weightKg !== 'number' || data.weightKg <= 0) {
    errors.push(`${name}: invalid weight ${data.weightKg}`);
  }

  if (!data.abilities || data.abilities.length === 0) {
    errors.push(`${name}: missing abilities`);
  }

  return errors;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('=== Pokemon Species Data Fetcher ===\n');

  // 1. Load existing species.json
  const existingData: Record<string, SpeciesData> = JSON.parse(
    readFileSync(SPECIES_JSON_PATH, 'utf-8')
  );
  const existingNames = new Set(Object.keys(existingData));
  console.log(`Existing species: ${existingNames.size}`);

  // 2. Filter to only new Pokemon
  const toFetch = POKEMON_LIST.filter(e => !existingNames.has(e.displayName));
  console.log(`New Pokemon to fetch: ${toFetch.length}\n`);

  // 3. Fetch from PokeAPI
  let successCount = 0;
  let failCount = 0;
  const newEntries: Record<string, SpeciesData> = {};

  for (let i = 0; i < toFetch.length; i++) {
    const entry = toFetch[i];
    const progress = `[${i + 1}/${toFetch.length}]`;
    process.stdout.write(`${progress} Fetching ${entry.displayName} (${entry.pokeApiId})...`);

    const data = await fetchFromPokeAPI(entry.pokeApiId);
    if (!data) {
      console.log(' FAILED');
      failCount++;
      continue;
    }

    try {
      const speciesData = transformToSpeciesData(entry, data);
      const errors = validateEntry(entry.displayName, speciesData);

      if (errors.length > 0) {
        console.log(` VALIDATION ERRORS: ${errors.join(', ')}`);
        failCount++;
        continue;
      }

      newEntries[entry.displayName] = speciesData;
      console.log(` OK (${speciesData.types.join('/')})`);
      successCount++;
    } catch (err: any) {
      console.log(` TRANSFORM ERROR: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n--- Fetch Summary ---`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Skipped (existing): ${existingNames.size}\n`);

  // 4. Merge: existing data + new entries, sorted alphabetically
  const merged: Record<string, SpeciesData> = { ...existingData, ...newEntries };
  const sorted: Record<string, SpeciesData> = {};
  for (const key of Object.keys(merged).sort()) {
    sorted[key] = merged[key];
  }

  // 5. Write to species.json
  writeFileSync(SPECIES_JSON_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Written ${Object.keys(sorted).length} species to species.json`);

  // 6. Spot-check known Pokemon
  console.log('\n--- Spot Checks ---');
  const garchomp = sorted['Garchomp'];
  if (garchomp) {
    console.log(`Garchomp: ${garchomp.types.join('/')} ATK=${garchomp.baseStats.atk} (expected 130) ${garchomp.baseStats.atk === 130 ? 'OK' : 'MISMATCH'}`);
  }
  if (sorted['Meganium']?.mega?.ability === 'Mega Sol') {
    console.log('Meganium Champions mega preserved: OK');
  }
  if (sorted['Feraligatr']?.mega?.ability === 'Dragonize') {
    console.log('Feraligatr Champions mega preserved: OK');
  }

  console.log('\nDone! Run "npx vitest run" to verify tests.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
