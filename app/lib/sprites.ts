/** Sprite path utilities for all downloaded assets */

import { MENU_SPRITE_MAP } from './menu-sprite-map';

const BASE = './sprites';

/** Pokemon official artwork (475x475) */
export function pokemonArtwork(id: number, shiny = false): string {
  return shiny
    ? `${BASE}/pokemon/artwork-shiny/${id}.png`
    : `${BASE}/pokemon/artwork/${id}.png`;
}

/** Pokemon front sprite (96x96, for compact views) */
export function pokemonFront(id: number, shiny = false): string {
  return shiny
    ? `${BASE}/pokemon/front-shiny/${id}.png`
    : `${BASE}/pokemon/front/${id}.png`;
}

/** Item sprite (30x30). Converts "Choice Band" → "choice-band" */
export function itemSprite(itemName: string): string {
  const slug = itemName.toLowerCase().replace(/\s+/g, '-');
  return `${BASE}/items/${slug}.png`;
}

/** Type icon from Showdown (32x14) */
export function typeIcon(typeName: string): string {
  return `${BASE}/types/${typeName}.png`;
}

/**
 * Pokemon Champions menu sprite (128x128).
 * Takes a species name (species.json key) and optional mega flag.
 * Falls back to front sprite if menu sprite unavailable.
 */
export function pokemonMenu(speciesName: string, isMega = false): string {
  const key = isMega ? `${speciesName}-Mega` : speciesName;
  const file = MENU_SPRITE_MAP[key];
  if (file) return `${BASE}/pokemon/menu/${file}`;
  // Fallback: not in menu sprite set
  return '';
}

/** Check if a menu sprite exists for the given species */
export function hasMenuSprite(speciesName: string, isMega = false): boolean {
  const key = isMega ? `${speciesName}-Mega` : speciesName;
  return key in MENU_SPRITE_MAP;
}

/** Move category icon: Physical/Special/Status */
export function categoryIcon(category: string): string {
  // Capitalize first letter
  const name = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  return `${BASE}/categories/${name}.png`;
}
