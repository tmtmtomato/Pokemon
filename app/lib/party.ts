// Party data types, localStorage persistence, and Showdown format conversion
import type { StatID, NatureName, TypeName } from '../../src/types.js';
import { getSpecies } from '../../src/data/index.js';
import { ALL_NATURES } from './constants';

// ===== Types =====

export interface PartyMember {
  species: string;
  nature: NatureName;
  ability: string;
  item: string;
  sp: Record<StatID, number>;
  teraType: TypeName | 'Stellar' | '';
  moves: [string, string, string, string]; // 4 move slots (empty string = unused)
}

export interface Party {
  id: string;
  name: string;
  members: PartyMember[];
}

// ===== Defaults =====

export function defaultMember(): PartyMember {
  return {
    species: '',
    nature: 'Hardy',
    ability: '',
    item: '',
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    teraType: '',
    moves: ['', '', '', ''],
  };
}

// ===== localStorage =====

const STORAGE_KEY = 'champions-calc-parties';

export function loadParties(): Party[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Party[];
  } catch {
    return [];
  }
}

export function saveParties(parties: Party[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parties));
}

export function addParty(name: string): Party {
  const parties = loadParties();
  const party: Party = {
    id: crypto.randomUUID(),
    name,
    members: [],
  };
  parties.push(party);
  saveParties(parties);
  return party;
}

export function updateParty(updated: Party): void {
  const parties = loadParties();
  const idx = parties.findIndex(p => p.id === updated.id);
  if (idx >= 0) {
    parties[idx] = updated;
  } else {
    parties.push(updated);
  }
  saveParties(parties);
}

export function deleteParty(id: string): void {
  const parties = loadParties().filter(p => p.id !== id);
  saveParties(parties);
}

// ===== SP ↔ EV conversion =====
// Champions SP: 0-32 per stat, 66 total
// Showdown EV: 0-252 per stat, 510 total
// At Lv50 with IV=31: SP*1 maps to EV via SP===32→252, else SP*8

export function spToEV(sp: number): number {
  return sp === 32 ? 252 : sp * 8;
}

export function evToSP(ev: number): number {
  return ev >= 252 ? 32 : Math.floor(ev / 8);
}

// ===== Showdown format =====

const STAT_NAMES: Record<StatID, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

const STAT_FROM_NAME: Record<string, StatID> = {
  'hp': 'hp', 'atk': 'atk', 'def': 'def', 'spa': 'spa', 'spd': 'spd', 'spe': 'spe',
  'HP': 'hp', 'Atk': 'atk', 'Def': 'def', 'SpA': 'spa', 'SpD': 'spd', 'Spe': 'spe',
  'Attack': 'atk', 'Defense': 'def', 'Sp. Atk': 'spa', 'Sp. Def': 'spd', 'Speed': 'spe',
};

/** Convert a single PartyMember to Showdown paste format */
export function memberToShowdown(m: PartyMember): string {
  if (!m.species) return '';
  const lines: string[] = [];

  // Line 1: Name @ Item
  let line1 = m.species;
  if (m.item) line1 += ` @ ${m.item}`;
  lines.push(line1);

  // Ability
  if (m.ability) lines.push(`Ability: ${m.ability}`);

  // Tera Type
  if (m.teraType) lines.push(`Tera Type: ${m.teraType}`);

  // EVs (converted from SP)
  const evParts: string[] = [];
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatID[]) {
    const ev = spToEV(m.sp[stat]);
    if (ev > 0) evParts.push(`${ev} ${STAT_NAMES[stat]}`);
  }
  if (evParts.length > 0) lines.push(`EVs: ${evParts.join(' / ')}`);

  // Nature
  lines.push(`${m.nature} Nature`);

  // Moves
  for (const move of m.moves) {
    if (move) lines.push(`- ${move}`);
  }

  return lines.join('\n');
}

/** Convert entire party to Showdown paste format */
export function partyToShowdown(party: Party): string {
  return party.members
    .map(m => memberToShowdown(m))
    .filter(s => s !== '')
    .join('\n\n');
}

/** Parse Showdown paste text into PartyMember array */
export function fromShowdown(text: string): PartyMember[] {
  const blocks = text.trim().split(/\n\s*\n/);
  const members: PartyMember[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) continue;

    const member = defaultMember();
    let moveIdx = 0;

    // Line 1: "Name @ Item" or "Name (nickname) @ Item"
    const firstLine = lines[0];
    const atSplit = firstLine.split(' @ ');
    let speciesPart = atSplit[0].trim();
    if (atSplit.length > 1) member.item = atSplit[1].trim();

    // Handle nickname: "Nickname (Species)"
    const parenMatch = speciesPart.match(/^.+\((.+)\)$/);
    if (parenMatch) {
      speciesPart = parenMatch[1].trim();
    }
    // Handle gender suffix: "Species (M)" or "Species (F)"
    speciesPart = speciesPart.replace(/\s*\([MF]\)\s*$/, '').trim();

    member.species = speciesPart;

    // Rest of lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('Ability:')) {
        member.ability = line.slice(8).trim();
      } else if (line.startsWith('Tera Type:')) {
        const tt = line.slice(10).trim();
        member.teraType = tt as TypeName | 'Stellar' | '';
      } else if (line.startsWith('EVs:')) {
        const evStr = line.slice(4).trim();
        const parts = evStr.split('/').map(p => p.trim());
        for (const part of parts) {
          const match = part.match(/^(\d+)\s+(.+)$/);
          if (match) {
            const ev = parseInt(match[1], 10);
            const statName = match[2].trim();
            const statId = STAT_FROM_NAME[statName];
            if (statId) member.sp[statId] = evToSP(ev);
          }
        }
      } else if (line.match(/^\w+ Nature$/)) {
        const natureName = line.replace(' Nature', '').trim();
        if (ALL_NATURES.includes(natureName as NatureName)) {
          member.nature = natureName as NatureName;
        }
      } else if (line.startsWith('- ') && moveIdx < 4) {
        member.moves[moveIdx] = line.slice(2).trim();
        moveIdx++;
      }
      // Skip: IVs, Level, Shiny, Happiness, etc.
    }

    // Auto-fill ability from species data if not specified
    if (!member.ability && member.species) {
      const data = getSpecies(member.species);
      if (data) member.ability = data.abilities[0] ?? '';
    }

    if (member.species) members.push(member);
  }

  return members;
}
