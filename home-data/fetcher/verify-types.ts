/**
 * Type verification: load every captured raw recon file and assert the
 * declared TypeScript types are correct. Will fail at compile time if a
 * field doesn't exist or at runtime if the actual data deviates from
 * the type. This is the bridge from "real data" to "trusted types".
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SeasonListResponse,
  PokemonRankingResponse,
  PokemonDetailResponse,
} from "../types/index.js";

const RAW = join(process.cwd(), "home-data", "storage", "raw-recon");

async function loadJson<T>(name: string): Promise<T> {
  const text = await readFile(join(RAW, name), "utf-8");
  return JSON.parse(text) as T;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main(): Promise<void> {
  // 1. Season list
  const list = await loadJson<SeasonListResponse>("01-season-list-sv.json");
  assert(typeof list.code === "number", "list.code is number");
  assert(typeof list.list === "object", "list.list is object");
  const seasonNums = Object.keys(list.list);
  assert(seasonNums.length > 0, "list has at least one season");
  console.log(`✓ season list: ${seasonNums.length} seasons`);

  const latestSeason = seasonNums.sort((a, b) => Number(b) - Number(a))[0];
  const entries = list.list[latestSeason];
  for (const cId of Object.keys(entries)) {
    const e = entries[cId];
    assert(e.cId === cId, `entry.cId matches key for ${cId}`);
    assert(typeof e.name === "string", "entry.name is string");
    assert(typeof e.cnt === "number", "entry.cnt is number");
    assert(e.rule === 0 || e.rule === 1, "entry.rule is 0 or 1");
    assert(typeof e.rst === "number", "entry.rst is number");
    assert(typeof e.ts2 === "number", "entry.ts2 is number");
  }
  console.log(`✓ latest season ${latestSeason}: ${Object.keys(entries).length} entries`);

  // 2. Pokemon ranking (single + double)
  for (const rule of ["single", "double"] as const) {
    const r = await loadJson<PokemonRankingResponse>(
      `02-pokemon-ranking-${rule}.json`,
    );
    const ranks = Object.keys(r);
    assert(ranks.length > 0, `${rule} ranking has entries`);
    for (const k of ranks.slice(0, 5)) {
      const e = r[k];
      assert(typeof e.id === "number", `rank ${k}.id is number`);
      assert(typeof e.form === "number", `rank ${k}.form is number`);
    }
    console.log(`✓ pokemon ranking (${rule}): ${ranks.length} entries, top=${JSON.stringify(r["0"])}`);
  }

  // 3. pdetail-1..6 for both rules
  for (const rule of ["single", "double"] as const) {
    let totalPokemon = 0;
    let totalForms = 0;
    let nonEmptyTemoti = 0;
    let nonEmptyWin = 0;

    for (let i = 1; i <= 6; i++) {
      const p = await loadJson<PokemonDetailResponse>(
        `03-pdetail-${i}-${rule}.json`,
      );
      const ids = Object.keys(p);
      totalPokemon += ids.length;

      for (const id of ids) {
        for (const form of Object.keys(p[id])) {
          totalForms++;
          const d = p[id][form];

          assert(d.temoti !== undefined, `${id}.${form}.temoti exists`);
          assert(d.win !== undefined, `${id}.${form}.win exists`);
          assert(d.lose !== undefined, `${id}.${form}.lose exists`);

          assert(Array.isArray(d.temoti.waza), "temoti.waza is array");
          assert(Array.isArray(d.temoti.tokusei), "temoti.tokusei is array");
          assert(Array.isArray(d.temoti.seikaku), "temoti.seikaku is array");
          assert(Array.isArray(d.temoti.motimono), "temoti.motimono is array");
          assert(Array.isArray(d.temoti.pokemon), "temoti.pokemon is array");
          assert(Array.isArray(d.temoti.terastal), "temoti.terastal is array");
          assert(Array.isArray(d.win.waza), "win.waza is array");
          assert(Array.isArray(d.win.pokemon), "win.pokemon is array");
          assert(Array.isArray(d.lose.waza), "lose.waza is array");
          assert(Array.isArray(d.lose.pokemon), "lose.pokemon is array");

          if (d.temoti.waza.length > 0) {
            nonEmptyTemoti++;
            const w = d.temoti.waza[0];
            assert(typeof w.id === "string", "waza.id is string");
            assert(typeof w.val === "string", "waza.val is string");
          }
          if (d.win.waza.length > 0) {
            nonEmptyWin++;
          }
          // Spot check teammates use number ids
          if (d.temoti.pokemon.length > 0) {
            const t = d.temoti.pokemon[0];
            assert(typeof t.id === "number", "teammate.id is number");
            assert(typeof t.form === "number", "teammate.form is number");
          }
        }
      }
    }
    console.log(
      `✓ pdetail (${rule}): ${totalPokemon} pokemon / ${totalForms} forms ` +
        `(${nonEmptyTemoti} with temoti.waza, ${nonEmptyWin} with win.waza)`,
    );
  }

  console.log("\nAll type assertions passed.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
