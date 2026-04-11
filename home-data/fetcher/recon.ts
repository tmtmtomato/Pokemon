/**
 * Reconnaissance script for Pokemon HOME SV battle data API.
 *
 * Hits the discovered SV endpoints and saves raw responses to
 * home-data/storage/raw-recon/ for schema inspection.
 *
 * Usage: npx tsx home-data/fetcher/recon.ts
 *
 * Discoveries (2026-04-08):
 *   - SV uses /tt/cbd/... prefix (not /cbd/...)
 *   - SV soft codes: "Sc" (Scarlet) or "Vi" (Violet)
 *   - List entries are keyed by string IDs (cId) not numeric ones
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "home-data", "storage", "raw-recon");

const HEADERS = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "content-type": "application/json",
  countrycode: "304",
  authorization: "Bearer",
  langcode: "1",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 8.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

async function save(name: string, data: unknown): Promise<void> {
  const path = join(OUT_DIR, name);
  const body =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  await writeFile(path, body, "utf-8");
  const size = Buffer.byteLength(body, "utf-8");
  console.log(`  saved ${name} (${(size / 1024).toFixed(1)} KB)`);
}

async function fetchUrl(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, init);
  console.log(`  ${res.status} ${url}`);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, data };
}

interface SeasonEntry {
  cId: string;
  name: string;
  start: string;
  end: string;
  cnt: number;
  rankCnt?: number;
  rule: number;
  season: number;
  rst: number;
  ts1: number;
  ts2: number;
  reg?: string;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Output dir: ${OUT_DIR}\n`);

  // ---- 1. Season list (SV via /tt/) ----
  console.log("[1/4] Fetching SV season list...");
  const listResult = await fetchUrl(
    "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list",
    {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ soft: "Sc" }),
    },
  );
  await save("01-season-list-sv.json", listResult.data);

  if (listResult.status !== 200) {
    console.log("FATAL: season list failed");
    return;
  }

  const list = (listResult.data as { list?: Record<string, Record<string, SeasonEntry>> })
    .list;
  if (!list) {
    console.log("FATAL: no list field");
    return;
  }

  // Schema: list[seasonNumber][cId] = entry
  const seasons = Object.keys(list).sort((a, b) => Number(b) - Number(a));
  console.log(`  → seasons: [${seasons.join(", ")}]`);
  const latestSeasonNum = seasons[0];
  const latestSeasonEntries = list[latestSeasonNum];
  const cIds = Object.keys(latestSeasonEntries);
  console.log(`  → season ${latestSeasonNum} has ${cIds.length} entries: [${cIds.join(", ")}]`);

  // Try each entry in the latest season
  for (const cId of cIds) {
    const entry = latestSeasonEntries[cId];
    console.log(`\n  entry: ${JSON.stringify(entry).slice(0, 250)}`);

    // SV resource base discovered from bundle.js:
    //   t_rankingEndpoint = "https://resource.pokemon-home.com/battledata/ranking/scvi"
    // URL = {base}/{cId}/{rst}/{ts2}/{pokemon|pdetail-N}
    const base = `https://resource.pokemon-home.com/battledata/ranking/scvi/${cId}/${entry.rst}/${entry.ts2}`;
    console.log(`\n  base: ${base}`);

    let workingBase: string | null = null;
    const ruleSuffix = entry.rule === 0 ? "single" : "double";
    const r = await fetchUrl(`${base}/pokemon`);
    if (r.status === 200 && typeof r.data === "object") {
      workingBase = base;
      await save(`02-pokemon-ranking-${ruleSuffix}.json`, r.data);
      console.log("  ✓ pokemon ranking fetched");
    }

    if (workingBase) {
      // Fetch pdetail-1..N. Try up to 10 (we'll stop on first 404).
      console.log("\n  Fetching pdetail-1..N...");
      for (let i = 1; i <= 10; i++) {
        const r = await fetchUrl(`${workingBase}/pdetail-${i}`);
        if (r.status === 200) {
          await save(`03-pdetail-${i}-${ruleSuffix}.json`, r.data);
        } else {
          console.log(`  pdetail-${i} returned ${r.status}, stopping`);
          break;
        }
      }
      // Save the working entry for reference
      await save(`00-working-entry-${ruleSuffix}.json`, {
        cId,
        base: workingBase,
        entry,
      });
      // continue to next entry (other rule)
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
