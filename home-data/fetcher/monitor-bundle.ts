/**
 * Bundle.js change monitor.
 *
 * Pokemon HOME serves bundle.js with `?v={scriptVer}` cache-busting where
 * scriptVer ticks every 600 seconds. The script itself can change at any
 * time. We watch for *meaningful* changes (new endpoints, new soft codes,
 * Champions references) so we get notified the moment HOME starts serving
 * Champions data via the same infrastructure.
 *
 * Algorithm:
 *   1. Fetch t_rankmatch.html and bundle.js
 *   2. Compute SHA-256 of bundle.js
 *   3. Compare against last-seen hash in monitor-state.json
 *   4. If changed:
 *      a. Save new bundle to home-data/storage/bundle-history/{date}.js
 *      b. Diff for interesting patterns (champion/Cm/Pc/OmniRing/new paths)
 *      c. Print a report and update state
 *
 * Run manually or via cron/Task Scheduler:
 *     npx tsx home-data/fetcher/monitor-bundle.ts
 *
 * Exit code 0 = no change, 1 = change detected, 2 = error.
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = process.cwd();
const HIST_DIR = join(ROOT, "home-data", "storage", "bundle-history");
const STATE_FILE = join(HIST_DIR, "monitor-state.json");

// Verified working URLs as of 2026-04-08:
//   https://resource.pokemon-home.com/battledata/t_rankmatch.html
//   https://resource.pokemon-home.com/battledata/js/bundle.js?v={ver}
const HOME_BASE = "https://resource.pokemon-home.com/battledata";
const RANKMATCH_HTML = `${HOME_BASE}/t_rankmatch.html`;
const BUNDLE_PATH = `${HOME_BASE}/js/bundle.js`;

interface MonitorState {
  /** ISO timestamp of the last successful check. */
  lastCheckedAt: string;
  /** SHA-256 of the most recent bundle.js (lowercase hex). */
  bundleSha256: string;
  /** Number of bytes in the most recent bundle.js. */
  bundleBytes: number;
  /** Path of the most recently saved bundle (relative to project root). */
  bundlePath: string;
  /** Pattern hits at last check (for noise reduction in diffs). */
  patternHits: Record<string, number>;
}

/** Patterns that would indicate Champions infrastructure has been added. */
const WATCH_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "champion", re: /champion/gi },
  { name: "softCm", re: /soft\s*[:=]\s*["']Cm["']/g },
  { name: "softPc", re: /soft\s*[:=]\s*["']Pc["']/g },
  { name: "softPcm", re: /soft\s*[:=]\s*["']Pcm["']/g },
  { name: "omniRing", re: /omniring|omniRing|OmniRing/g },
  { name: "victoryPoint", re: /victoryPoint|VictoryPoint/g },
  { name: "rankingScvi", re: /ranking\/scvi/g },
  { name: "rankingCm", re: /ranking\/cm\b/g },
  { name: "rankingPcm", re: /ranking\/pcm\b/g },
  { name: "rankingChampions", re: /ranking\/champions/g },
  { name: "rankingScvi2", re: /\/scvi2?\//g },
  { name: "regulationMA", re: /\bM-?A\b/g },
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadState(): Promise<MonitorState | null> {
  if (!(await fileExists(STATE_FILE))) return null;
  const text = await readFile(STATE_FILE, "utf-8");
  return JSON.parse(text) as MonitorState;
}

async function saveState(s: MonitorState): Promise<void> {
  await mkdir(HIST_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(s, null, 2), "utf-8");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function countPattern(text: string, re: RegExp): number {
  const r = new RegExp(
    re.source,
    re.flags.includes("g") ? re.flags : `${re.flags}g`,
  );
  let n = 0;
  while (r.exec(text) !== null) n++;
  return n;
}

function scanPatterns(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of WATCH_PATTERNS) {
    out[p.name] = countPattern(text, p.re);
  }
  return out;
}

function diffPatterns(
  prev: Record<string, number> | undefined,
  curr: Record<string, number>,
): Array<{ name: string; from: number; to: number }> {
  const changes: Array<{ name: string; from: number; to: number }> = [];
  for (const k of Object.keys(curr)) {
    const from = prev?.[k] ?? 0;
    const to = curr[k] ?? 0;
    if (from !== to) changes.push({ name: k, from, to });
  }
  return changes;
}

/** Today's date as YYYY-MM-DD (UTC). */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Monitoring HOME bundle.js\n`);

  // 1. Fetch with cache-bust
  const ver = Math.floor(Date.now() / 1000 / 600);
  const bundleUrl = `${BUNDLE_PATH}?v=${ver}`;
  console.log(`Fetching ${bundleUrl}`);
  const res = await fetch(bundleUrl);
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${res.statusText}`);
    process.exit(2);
  }
  const text = await res.text();
  const hash = sha256(text);
  const bytes = Buffer.byteLength(text, "utf-8");
  console.log(`  ${(bytes / 1024).toFixed(1)} KB, sha256=${hash.slice(0, 12)}…\n`);

  // 2. Compare against state
  const prev = await loadState();
  if (prev && prev.bundleSha256 === hash) {
    console.log(`No change since ${prev.lastCheckedAt}.`);
    // Update only the timestamp
    await saveState({ ...prev, lastCheckedAt: new Date().toISOString() });
    process.exit(0);
  }

  const isFirstRun = prev === null;
  if (isFirstRun) {
    console.log("First run — establishing baseline (no diff comparison).\n");
  } else {
    console.log("CHANGE DETECTED.");
    console.log(`  prev: ${prev.bundleBytes} bytes, sha=${prev.bundleSha256.slice(0, 12)}…`);
    console.log(`  curr: ${bytes} bytes, sha=${hash.slice(0, 12)}…`);
    console.log(`  delta: ${bytes - prev.bundleBytes} bytes\n`);
  }

  // 3. Save snapshot
  await mkdir(HIST_DIR, { recursive: true });
  const snapshotName = `bundle-${todayStamp()}-${hash.slice(0, 8)}.js`;
  const snapshotPath = join(HIST_DIR, snapshotName);
  await writeFile(snapshotPath, text, "utf-8");
  console.log(`  Saved snapshot → ${snapshotPath}`);

  // 4. Pattern scan + diff
  const currHits = scanPatterns(text);
  console.log("\n=== Pattern hits ===");
  for (const [k, v] of Object.entries(currHits)) {
    console.log(`  ${k}: ${v}`);
  }
  if (!isFirstRun) {
    const changes = diffPatterns(prev.patternHits, currHits);
    if (changes.length > 0) {
      console.log("\n=== PATTERN CHANGES ===");
      for (const c of changes) {
        const arrow = c.from === 0 && c.to > 0 ? "🆕 " : "   ";
        console.log(`${arrow}${c.name}: ${c.from} → ${c.to}`);
      }
      // Highlight new champion-related patterns
      const championLike = changes.filter(
        (c) =>
          c.from === 0 &&
          c.to > 0 &&
          [
            "softCm",
            "softPc",
            "softPcm",
            "omniRing",
            "victoryPoint",
            "rankingCm",
            "rankingPcm",
            "rankingChampions",
          ].includes(c.name),
      );
      if (championLike.length > 0) {
        console.log("\n!!! POTENTIAL CHAMPIONS API SIGNAL !!!");
        console.log("Inspect snapshot:", snapshotPath);
      }
    } else {
      console.log("\nPattern hits unchanged (only obfuscated/comment churn).");
    }
  }

  // 5. Update state
  await saveState({
    lastCheckedAt: new Date().toISOString(),
    bundleSha256: hash,
    bundleBytes: bytes,
    bundlePath: snapshotPath,
    patternHits: currHits,
  });

  process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
