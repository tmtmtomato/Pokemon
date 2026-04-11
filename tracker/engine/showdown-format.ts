/**
 * Showdown / PokePaste format parser and exporter.
 * Handles SP ↔ EV conversion for Champions (SP 0-32, EV 0-252).
 */
import type { StatID, NatureName, TypeName } from '../../src/types.js';
import type { MyPokemonSlot } from '../hooks/useTracker';
import { getSpecies } from '../../src/data/index.js';
import { ALL_NATURES } from '../../app/lib/constants';

// ===== SP ↔ EV conversion =====

/** Champions SP → Showdown EV (at Lv50 IV31, both yield identical stats) */
export function spToEv(sp: number): number {
  return sp === 32 ? 252 : sp * 8;
}

/** Showdown EV → Champions SP */
export function evToSp(ev: number): number {
  return ev >= 252 ? 32 : Math.floor(ev / 8);
}

// Stat abbreviation ↔ StatID mapping
const STAT_ABBREV: Record<string, StatID> = {
  'HP': 'hp', 'Atk': 'atk', 'Def': 'def',
  'SpA': 'spa', 'SpD': 'spd', 'Spe': 'spe',
};
const STAT_TO_ABBREV: Record<StatID, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

// ===== Export =====

export function exportTeam(team: MyPokemonSlot[]): string {
  return team
    .filter(s => s.species)
    .map(exportSlot)
    .join('\n\n');
}

function exportSlot(slot: MyPokemonSlot): string {
  const lines: string[] = [];

  // Line 1: Species @ Item
  let line1 = slot.species;
  if (slot.item) line1 += ` @ ${slot.item}`;
  lines.push(line1);

  // Ability
  if (slot.ability) lines.push(`Ability: ${slot.ability}`);

  // Level (Champions is always 50)
  lines.push('Level: 50');

  // Tera Type
  if (slot.teraType) lines.push(`Tera Type: ${slot.teraType}`);

  // EVs (converted from SP)
  const evParts: string[] = [];
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatID[]) {
    const ev = spToEv(slot.sp[stat]);
    if (ev > 0) evParts.push(`${ev} ${STAT_TO_ABBREV[stat]}`);
  }
  if (evParts.length > 0) lines.push(`EVs: ${evParts.join(' / ')}`);

  // Nature
  lines.push(`${slot.nature} Nature`);

  // Moves
  for (const move of slot.moves) {
    if (move) lines.push(`- ${move}`);
  }

  return lines.join('\n');
}

// ===== Import =====

export function importTeam(text: string): MyPokemonSlot[] {
  const blocks = text.trim().split(/\n\s*\n/);
  const team: MyPokemonSlot[] = [];

  for (const block of blocks) {
    const slot = parseSlot(block.trim());
    if (slot) team.push(slot);
    if (team.length >= 6) break;
  }

  return team;
}

function parseSlot(block: string): MyPokemonSlot | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Parse line 1: [Nickname] (Species) @ Item  OR  Species @ Item
  let species = '';
  let item = '';
  const line1 = lines[0];

  // Split on " @ " for item
  const atIdx = line1.indexOf(' @ ');
  const namePart = atIdx >= 0 ? line1.substring(0, atIdx).trim() : line1.trim();
  if (atIdx >= 0) item = line1.substring(atIdx + 3).trim();

  // Check for nickname: "Nickname (Species)" pattern
  // Also handle gender: (M) or (F) at the end
  let cleaned = namePart.replace(/\s*\([MF]\)\s*$/, '');
  const parenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    // Nickname (Species)
    species = parenMatch[2].trim();
  } else {
    species = cleaned.trim();
  }

  // Validate species exists in our data
  const speciesData = getSpecies(species);
  if (!speciesData) return null;

  let ability = speciesData.abilities[0] ?? '';
  let nature: NatureName = 'Hardy';
  let teraType: TypeName | 'Stellar' | '' = '';
  const sp: Record<StatID, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const moves: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('Ability:') || line.startsWith('Trait:')) {
      const val = line.replace(/^(Ability|Trait):\s*/, '').trim();
      // L-9: Accept mega abilities too (not just base form abilities)
      if (speciesData.abilities.includes(val) || speciesData.mega?.ability === val) ability = val;
    } else if (line.startsWith('Tera Type:')) {
      const val = line.replace('Tera Type:', '').trim();
      if (val === 'Stellar' || isTypeName(val)) teraType = val;
    } else if (line.startsWith('EVs:')) {
      const evStr = line.replace('EVs:', '').trim();
      for (const part of evStr.split('/')) {
        const m = part.trim().match(/^(\d+)\s+(\w+)$/);
        if (m) {
          const statId = STAT_ABBREV[m[2]];
          if (statId) sp[statId] = evToSp(Number(m[1]));
        }
      }
    } else if (/^[A-Za-z]+\s+[Nn]ature$/.test(line)) {
      const n = line.replace(/\s+[Nn]ature$/, '').trim();
      if (ALL_NATURES.includes(n as NatureName)) nature = n as NatureName;
    } else if (line.startsWith('- ') || line.startsWith('~ ')) {
      const move = line.substring(2).trim();
      if (move && moves.length < 4) moves.push(move);
    }
    // Skip Level, IVs, Shiny, etc. (not relevant for Champions)
  }

  return { species, sp, nature, ability, item, moves, teraType, isMega: false };
}

const TYPE_NAMES = new Set([
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
]);

function isTypeName(s: string): s is TypeName {
  return TYPE_NAMES.has(s);
}
