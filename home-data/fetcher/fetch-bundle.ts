/**
 * Fetch t_rankmatch.html and bundle.js to discover current API call shape.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "home-data", "storage", "raw-recon");

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  // 1. Fetch the HTML viewer page
  console.log("Fetching t_rankmatch.html...");
  const htmlRes = await fetch(
    "https://resource.pokemon-home.com/battledata/t_rankmatch.html",
  );
  const html = await htmlRes.text();
  await writeFile(join(OUT, "00-t_rankmatch.html"), html);
  console.log(`  ${htmlRes.status} (${html.length} bytes)`);

  // 2. Find bundle.js URL in HTML
  const m = html.match(/(?:src=["'])([^"']*bundle\.js[^"']*)/);
  let bundleUrl = "https://resource.pokemon-home.com/battledata/js/bundle.js";
  if (m) {
    const rel = m[1];
    bundleUrl = rel.startsWith("http")
      ? rel
      : new URL(rel, "https://resource.pokemon-home.com/battledata/").href;
    console.log(`  found bundle ref: ${rel}`);
  }

  console.log(`\nFetching ${bundleUrl}...`);
  const bundleRes = await fetch(bundleUrl);
  const bundle = await bundleRes.text();
  await writeFile(join(OUT, "00-bundle.js"), bundle);
  console.log(`  ${bundleRes.status} (${bundle.length} bytes)`);

  // 3. Try to extract API call patterns
  console.log("\n--- Searching bundle.js for API patterns ---");
  const patterns: Array<{ name: string; re: RegExp }> = [
    { name: "rankmatch/list URL", re: /[^"'`]*rankmatch\/list[^"'`]*/g },
    { name: "soft assignments", re: /soft\s*[:=]\s*["'][A-Za-z]+["']/g },
    { name: "countrycode", re: /countrycode["'\s:,]+[^,}]{1,30}/g },
    { name: "authorization", re: /authorization["'\s:,]+[^,}]{1,60}/g },
    { name: "langcode", re: /langcode["'\s:,]+[^,}]{1,30}/g },
    {
      name: "request bodies near rankmatch",
      re: /\{[^{}]*soft[^{}]{0,200}\}/g,
    },
  ];

  for (const p of patterns) {
    const matches = bundle.match(p.re);
    if (matches && matches.length > 0) {
      console.log(`\n[${p.name}] (${matches.length} matches)`);
      const unique = [...new Set(matches)].slice(0, 10);
      for (const m of unique) console.log(`  ${m}`);
    } else {
      console.log(`\n[${p.name}] no matches`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
