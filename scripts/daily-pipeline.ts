/**
 * Daily data pipeline — fetches fresh data, runs analysis, trains ML, rebuilds viewers.
 *
 * Usage:
 *   npm run pipeline                         # full pipeline
 *   npm run pipeline -- --skip-fetch         # skip Pikalytics/VGCPast fetch
 *   npm run pipeline -- --skip-ml            # skip ML training
 *   npm run pipeline -- --skip-build         # skip viewer builds
 *   npm run pipeline -- --skip-analysis      # skip analysis steps
 *   npm run pipeline -- --date 2026-04-11    # override date
 */

import { execSync } from "child_process";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

// ── Helpers ────────────────────────────────────────────────────────

const ROOT = process.cwd();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(): { date: string; skipFetch: boolean; skipAnalysis: boolean; skipMl: boolean; skipBuild: boolean } {
  const args = process.argv.slice(2);
  let date = todayUtc();
  let skipFetch = false;
  let skipAnalysis = false;
  let skipMl = false;
  let skipBuild = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) { date = args[++i]; }
    if (args[i] === "--skip-fetch") skipFetch = true;
    if (args[i] === "--skip-analysis") skipAnalysis = true;
    if (args[i] === "--skip-ml") skipMl = true;
    if (args[i] === "--skip-build") skipBuild = true;
  }
  return { date, skipFetch, skipAnalysis, skipMl, skipBuild };
}

// ── Logging ────────────────────────────────────────────────────────

const logDir = join(ROOT, "logs");
mkdirSync(logDir, { recursive: true });

let logFile: string;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + "\n");
}

// ── Step runner ────────────────────────────────────────────────────

interface Step {
  name: string;
  cmd: string;
  critical: boolean;     // if true, abort pipeline on failure
  timeoutMin: number;    // per-step timeout in minutes
}

function runStep(step: Step): boolean {
  log(`▶ ${step.name}`);
  log(`  cmd: ${step.cmd}`);
  const start = Date.now();
  try {
    execSync(step.cmd, {
      cwd: ROOT,
      stdio: "inherit",
      timeout: step.timeoutMin * 60 * 1000,
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`✓ ${step.name} (${elapsed}s)`);
    return true;
  } catch (err: unknown) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    log(`✗ ${step.name} FAILED (${elapsed}s): ${msg}`);
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────

const { date, skipFetch, skipAnalysis, skipMl, skipBuild } = parseArgs();
logFile = join(logDir, `pipeline-${date}.log`);

log("══════════════════════════════════════════════════════");
log(`  Daily Pipeline START  (date: ${date})`);
log("══════════════════════════════════════════════════════");

const steps: (Step & { skip?: boolean })[] = [
  // --- Phase 1: Data Fetch ---
  { name: "Pikalytics取得",         cmd: `npm run home:pikalytics -- --date ${date}`, critical: false, timeoutMin: 10, skip: skipFetch },
  { name: "VGCPastリプレイ取得",    cmd: `npm run home:vgcpast`,                      critical: false, timeoutMin: 30, skip: skipFetch },

  // --- Phase 2: Analysis ---
  { name: "メタ分析 (merge+dist+matchups)", cmd: `npm run home:analyze -- --date ${date}`,  critical: true, timeoutMin: 5, skip: skipAnalysis },
  { name: "チーム分析",              cmd: `npm run home:teams -- --date ${date}`,       critical: true, timeoutMin: 5, skip: skipAnalysis },
  { name: "シングルランキング",      cmd: `npm run home:singles -- --date ${date}`,     critical: true, timeoutMin: 15, skip: skipAnalysis },
  { name: "チームマッチアップ",      cmd: `npm run home:matchup -- --date ${date}`,     critical: false, timeoutMin: 30, skip: skipAnalysis },

  // --- Phase 3: ML Training ---
  { name: "ML学習データ抽出",       cmd: `npm run ml:extract`,     critical: true,  timeoutMin: 10, skip: skipMl },
  { name: "MLデータ分割",           cmd: `npm run ml:split`,       critical: true,  timeoutMin: 5,  skip: skipMl },
  { name: "MLチーム評価モデル",      cmd: `npm run ml:team-eval`,   critical: false, timeoutMin: 45, skip: skipMl },
  { name: "ML選出予測モデル",        cmd: `npm run ml:selection`,   critical: false, timeoutMin: 45, skip: skipMl },
  { name: "ML技選択モデル",          cmd: `npm run ml:move-advisor`, critical: false, timeoutMin: 45, skip: skipMl },

  // --- Phase 4: Viewer Builds ---
  { name: "ビルド: メタビューア",    cmd: `npm run build:meta`,     critical: false, timeoutMin: 3, skip: skipBuild },
  { name: "ビルド: 構築分析",        cmd: `npm run build:teams`,    critical: false, timeoutMin: 3, skip: skipBuild },
  { name: "ビルド: シングル",        cmd: `npm run build:singles`,  critical: false, timeoutMin: 3, skip: skipBuild },
  { name: "ビルド: マッチアップ",    cmd: `npm run build:matchup`,  critical: false, timeoutMin: 3, skip: skipBuild },
  { name: "ビルド: ML Insights",    cmd: `npm run build:ml`,       critical: false, timeoutMin: 3, skip: skipBuild },
];

const t0 = Date.now();
let passed = 0;
let failed = 0;
let skipped = 0;

for (const step of steps) {
  if (step.skip) {
    log(`⊘ ${step.name} (skipped)`);
    skipped++;
    continue;
  }
  const ok = runStep(step);
  if (ok) {
    passed++;
  } else {
    failed++;
    if (step.critical) {
      log("⚠ CRITICAL FAILURE — pipeline aborted.");
      process.exit(1);
    }
  }
}

const total = ((Date.now() - t0) / 1000).toFixed(0);
log("══════════════════════════════════════════════════════");
log(`  Pipeline DONE: ${passed} passed, ${failed} failed, ${skipped} skipped (${total}s)`);
log("══════════════════════════════════════════════════════");

if (failed > 0) process.exit(1);
