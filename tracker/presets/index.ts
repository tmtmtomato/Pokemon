import standardTxt from './standard.txt?raw';
import sandTxt from './sand.txt?raw';
import megaKangaTxt from './mega-kangaskhan.txt?raw';
import sunTxt from './sun.txt?raw';
import dragonTxt from './dragon.txt?raw';

export interface PresetTeam {
  id: string;
  name: { ja: string; en: string };
  text: string;
}

export const PRESET_TEAMS: PresetTeam[] = [
  { id: 'standard', name: { ja: 'スタンダード', en: 'Standard' }, text: standardTxt },
  { id: 'sand', name: { ja: '砂パーティ', en: 'Sand Team' }, text: sandTxt },
  { id: 'mega-kanga', name: { ja: 'メガガルーラ', en: 'Mega Kangaskhan' }, text: megaKangaTxt },
  { id: 'sun', name: { ja: '晴れパーティ', en: 'Sun Team' }, text: sunTxt },
  { id: 'dragon', name: { ja: 'ドラゴン', en: 'Dragon' }, text: dragonTxt },
];
