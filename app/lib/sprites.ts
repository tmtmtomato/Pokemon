/** Sprite path utilities for all downloaded assets */

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

/** Move category icon: Physical/Special/Status */
export function categoryIcon(category: string): string {
  // Capitalize first letter
  const name = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  return `${BASE}/categories/${name}.png`;
}
