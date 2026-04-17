#!/usr/bin/env node
/**
 * Unified build script — builds ALL HTML pages in one go.
 *
 * Usage:  node scripts/build-all.mjs
 * npm:    npm run build:pages
 *
 * Adding a new page:
 *   1. Create the HTML entry file in project root
 *   2. Add the entry to PAGES in vite.config.ts
 *   3. Done — this script reads PAGES from vite.config.ts automatically
 */
import { readFileSync, readdirSync, copyFileSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Extract PAGES entries from vite.config.ts (single source of truth) ──────

const viteConfig = readFileSync(join(ROOT, "vite.config.ts"), "utf-8");
const pagesMatch = viteConfig.match(/const PAGES[^{]*\{([^}]+)\}/s);
if (!pagesMatch) {
  console.error("Could not parse PAGES from vite.config.ts");
  process.exit(1);
}

const entries = [];
for (const line of pagesMatch[1].split("\n")) {
  const m = line.match(/^\s*(\w+)\s*:/);
  if (m) entries.push(m[1]);
}

if (entries.length === 0) {
  console.error("No entries found in PAGES");
  process.exit(1);
}

console.log(`[build:pages] ${entries.length} pages: ${entries.join(", ")}\n`);

// ── Pre-build steps ─────────────────────────────────────────────────────────

// 1. Meta ranking (required by moves.html)
const metaRankingScript = join(ROOT, "home-data/scripts/compute-meta-ranking.mjs");
if (existsSync(metaRankingScript)) {
  console.log("[prebuild] compute-meta-ranking...");
  execSync(`node "${metaRankingScript}"`, { cwd: ROOT, stdio: "inherit" });
}

// 2. Firepower ranking (required by firepower.html)
const firepowerScript = join(ROOT, "home-data/scripts/compute-firepower-ranking.mjs");
if (existsSync(firepowerScript)) {
  console.log("[prebuild] compute-firepower-ranking...");
  execSync(`node "${firepowerScript}"`, { cwd: ROOT, stdio: "inherit" });
}

// 3. Copy latest dated data files → _latest-{type}.json
//    Viewers import _latest-*.json so they never go stale.
const analysisDir = join(ROOT, "home-data/storage/analysis");
const DATED_TYPES = ["meta", "teams", "singles", "team-matchup", "damage-matrix"];

if (existsSync(analysisDir)) {
  for (const type of DATED_TYPES) {
    const suffix = `-${type}.json`;
    const files = readdirSync(analysisDir)
      .filter((f) => f.endsWith(suffix) && !f.startsWith("_"))
      .sort((a, b) =>
        statSync(join(analysisDir, b)).mtimeMs -
        statSync(join(analysisDir, a)).mtimeMs,
      );
    if (files.length > 0) {
      copyFileSync(
        join(analysisDir, files[0]),
        join(analysisDir, `_latest-${type}.json`),
      );
      console.log(`[prebuild] _latest-${type}.json ← ${files[0]}`);
    } else {
      console.warn(`[prebuild] WARNING: no *${suffix} found`);
    }
  }
}

// 4. SP grid precomputation (required by builder.html)
const spGridScript = join(ROOT, "home-data/scripts/compute-sp-grid.ts");
if (existsSync(spGridScript)) {
  console.log("[prebuild] compute-sp-grid...");
  try {
    execSync(`npx tsx "${spGridScript}"`, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    console.warn("[prebuild] SP grid computation failed (non-fatal):", e.message);
  }
}

console.log();

// ── Build each entry ────────────────────────────────────────────────────────

const failed = [];
for (const entry of entries) {
  console.log(`[build] ${entry}...`);
  try {
    execSync(`npx cross-env VITE_ENTRY=${entry} npx vite build`, {
      cwd: ROOT,
      stdio: "inherit",
    });
  } catch {
    failed.push(entry);
    console.error(`[build] FAILED: ${entry}`);
  }
}

// ── Copy landing page ───────────────────────────────────────────────────────

const indexSrc = join(ROOT, "index.html");
const indexDest = join(ROOT, "build", "index.html");
if (existsSync(indexSrc)) {
  copyFileSync(indexSrc, indexDest);
  console.log("[build] Copied index.html → build/index.html");
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log();
if (failed.length > 0) {
  console.error(`[build:pages] ${failed.length} FAILED: ${failed.join(", ")}`);
  process.exit(1);
} else {
  console.log(`[build:pages] All ${entries.length} pages built successfully.`);
}
