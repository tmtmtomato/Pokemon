/**
 * Probe for any Champions-related references in bundle.js,
 * and try a handful of likely Champions API endpoints.
 *
 * Hypothesis: Champions launched today (2026/4/8). The HOME bundle is from
 * before launch but ILCA owns both, so endpoint patterns may be reusable.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const BUNDLE = join(ROOT, "home-data", "storage", "raw-recon", "00-bundle.js");
const OUT_DIR = join(ROOT, "home-data", "storage", "raw-recon");

const HEADERS = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "content-type": "application/json",
  countrycode: "304",
  authorization: "Bearer",
  langcode: "1",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 8.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

/** Find all occurrences of regex in bundle and print surrounding context. */
function searchBundle(
  bundle: string,
  pattern: RegExp,
  ctx = 80,
): Array<{ pos: number; snippet: string }> {
  const out: Array<{ pos: number; snippet: string }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  while ((m = re.exec(bundle)) !== null) {
    const start = Math.max(0, m.index - ctx);
    const end = Math.min(bundle.length, m.index + m[0].length + ctx);
    out.push({ pos: m.index, snippet: bundle.slice(start, end) });
    if (out.length > 30) break;
  }
  return out;
}

async function tryGet(url: string, init?: RequestInit): Promise<{ status: number; bodySnippet: string }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return { status: res.status, bodySnippet: text.slice(0, 200) };
  } catch (e) {
    return { status: -1, bodySnippet: (e as Error).message };
  }
}

async function main(): Promise<void> {
  const bundle = await readFile(BUNDLE, "utf-8");
  console.log(`Bundle size: ${bundle.length} bytes\n`);

  // -- 1. Search bundle for Champions / Cm / pcm / OmniRing / Mega-A references --
  console.log("=== Searching bundle.js for Champions hints ===\n");

  const patterns: Array<{ name: string; re: RegExp }> = [
    { name: "champion (case-insensitive)", re: /champion/gi },
    { name: '"Cm" or "Pc" soft codes', re: /soft\s*[:=]\s*["'](?:Cm|Pc|Pcm|Ch|Pch)["']/g },
    { name: "OmniRing", re: /omniring|omniRing|OmniRing/g },
    { name: "Mega-A regulation", re: /reg-?[Aa]\b|"M-?A"|'M-?A'/g },
    { name: "/cm/ /pc/ /pcm/ /ch/ paths", re: /\/(?:cm|pc|pcm|ch|pch)\/cbd/g },
    { name: "ranking/[a-z]+ paths (excluding scvi)", re: /ranking\/[a-z]+/g },
    { name: "battledata subdirs", re: /battledata\/[a-zA-Z]+/g },
    { name: "VictoryPoint / vp", re: /victoryPoint|VictoryPoint|"VP"/g },
    { name: "rankmatch subdomains", re: /[a-z]+\.battle\.pokemon-/gi },
    { name: ".pokemon-champions / pokemon\\.com\\/champions", re: /pokemon-champions|pokemon\.com\/champions/gi },
    { name: "scvi alternatives", re: /["'](?:scvi|swsh|usum|oras|xy|bw|hgss|dpp|gsc|rby|pccm|cmst|cmpz)["']/g },
  ];

  for (const p of patterns) {
    const hits = searchBundle(bundle, p.re);
    console.log(`-- ${p.name}: ${hits.length} hits --`);
    for (const h of hits.slice(0, 8)) {
      const clean = h.snippet.replace(/\s+/g, " ").slice(0, 200);
      console.log(`  @${h.pos}: ${clean}`);
    }
    if (hits.length === 0) console.log("  (none)");
    console.log();
  }

  // -- 2. Try probing likely Champions API endpoints --
  console.log("\n=== Probing potential Champions endpoints ===\n");

  const endpoints: Array<{ name: string; url: string; init?: RequestInit }> = [
    // resource.* base, "scvi" replacements
    {
      name: "resource ranking/cm/ (list dir)",
      url: "https://resource.pokemon-home.com/battledata/ranking/cm/",
    },
    {
      name: "resource ranking/pc/",
      url: "https://resource.pokemon-home.com/battledata/ranking/pc/",
    },
    {
      name: "resource ranking/pcm/",
      url: "https://resource.pokemon-home.com/battledata/ranking/pcm/",
    },
    {
      name: "resource ranking/ch/",
      url: "https://resource.pokemon-home.com/battledata/ranking/ch/",
    },
    {
      name: "resource ranking/champions/",
      url: "https://resource.pokemon-home.com/battledata/ranking/champions/",
    },

    // Try the rankmatch list with new soft codes against /tt/
    {
      name: "battle.api /tt/ list with soft=Cm",
      url: "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Cm" }) },
    },
    {
      name: "battle.api /tt/ list with soft=Pc",
      url: "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Pc" }) },
    },
    {
      name: "battle.api /tt/ list with soft=Pcm",
      url: "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Pcm" }) },
    },
    {
      name: "battle.api /tt/ list with soft=Ch",
      url: "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Ch" }) },
    },

    // Maybe the path prefix changes (e.g., new game gets new prefix like "/cm/")
    {
      name: "battle.api /cm/ list",
      url: "https://api.battle.pokemon-home.com/cm/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Cm" }) },
    },
    {
      name: "battle.api /pcm/ list",
      url: "https://api.battle.pokemon-home.com/pcm/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Pcm" }) },
    },
    {
      name: "battle.api /champions/ list",
      url: "https://api.battle.pokemon-home.com/champions/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Pc" }) },
    },

    // Maybe a separate Champions battle API host
    {
      name: "api.battle.pokemon-champions.com",
      url: "https://api.battle.pokemon-champions.com/cbd/competition/rankmatch/list",
      init: { method: "POST", headers: HEADERS, body: JSON.stringify({ soft: "Pc" }) },
    },
    {
      name: "resource.pokemon-champions.com",
      url: "https://resource.pokemon-champions.com/battledata/ranking/",
    },
    {
      name: "champions.pokemon.com /battledata/",
      url: "https://champions.pokemon.com/battledata/",
    },
  ];

  const results: Array<{ name: string; url: string; status: number; bodySnippet: string }> = [];
  for (const ep of endpoints) {
    const r = await tryGet(ep.url, ep.init);
    console.log(`  [${r.status}] ${ep.name}`);
    console.log(`         ${ep.url}`);
    if (r.status >= 200 && r.status < 400) {
      console.log(`         body: ${r.bodySnippet.replace(/\s+/g, " ").slice(0, 150)}`);
    }
    results.push({ name: ep.name, url: ep.url, status: r.status, bodySnippet: r.bodySnippet });
    await new Promise((r) => setTimeout(r, 200));
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "20-champions-probe.json"),
    JSON.stringify(results, null, 2),
    "utf-8",
  );
  console.log(`\nSaved → ${join(OUT_DIR, "20-champions-probe.json")}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
