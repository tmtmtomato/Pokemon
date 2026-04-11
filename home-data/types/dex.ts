/**
 * Type definitions for ID → Japanese name dictionaries extracted from
 * the HOME bundle.js (`this.dex={...}`) and saved to 10-dex-ja.json.
 *
 * These are the lookup tables used to resolve numeric IDs in the API
 * responses to human-readable names.
 */

/**
 * Combined dex dictionary. All values are id → Japanese name maps.
 *
 * IMPORTANT: Pokemon IDs are 1-based in the original array, so they have
 * been shifted by extract-dex.ts to be 1-indexed in this map (key "1" =
 * フシギダネ). All other dictionaries use their original 0-based or
 * 1-based indices as found in the bundle.
 */
export interface DexJa {
  /** National Pokedex ID → name (1025 entries). */
  poke: Record<string, string>;
  /** Type ID → name (18 entries, 0-indexed). */
  pokeType: Record<string, string>;
  /** Move ID → name (919 entries). */
  waza: Record<string, string>;
  /** Ability ID → name (310 entries). */
  tokusei: Record<string, string>;
  /** Nature ID → name (25 entries, 0-indexed). */
  seikaku: Record<string, string>;
  /** Tera type ID → name (19 entries, includes 99 = ステラ). */
  teraType: Record<string, string>;
}

// ---------------------------------------------------------------------------
// External dictionary files from resource.pokemon-home.com/battledata/json/
// ---------------------------------------------------------------------------

/**
 * Single move definition from wazainfo_ja.json. Provides extra metadata
 * (type, category, power, accuracy, PP, etc.) on top of the bare name in
 * the dex.
 *
 * NOTE: Field names below are placeholders; actual schema must be confirmed
 * against 11-wazainfo_ja.json once we begin using these files. Mark fields
 * `unknown` until we lock the schema.
 */
export type WazaInfoJa = Record<string, unknown>;

/** tokuseiinfo_ja.json — ability descriptions/metadata. */
export type TokuseiInfoJa = Record<string, unknown>;

/** iteminfo_ja.json — held item metadata. */
export type ItemInfoJa = Record<string, unknown>;

/** itemname_ja.json — item ID → name (alternative to iteminfo). */
export type ItemNameJa = Record<string, string>;

/**
 * zkn_form_ja.json — alternate-form names. Likely keyed by
 * "{pokemonId}_{formIndex}" or similar; schema TBD.
 */
export type ZknFormJa = Record<string, unknown>;
