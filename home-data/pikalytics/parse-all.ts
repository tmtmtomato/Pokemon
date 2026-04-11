/**
 * parse-all.ts — Track A
 *
 * Walks all `.md` files for the requested format/date and writes a sibling
 * `.json` file produced by `parsePikalyticsMarkdown`.
 *
 * `_index.md` (the format index) is skipped — it's processed separately by
 * `fetch-format-index.ts`.
 *
 * Failures are written to `_parse-failures.json` and execution continues.
 *
 * CLI:
 *   npx tsx home-data/pikalytics/parse-all.ts --format championspreview
 *   npx tsx home-data/pikalytics/parse-all.ts --format gen9ou --date 2026-04-09
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePikalyticsMarkdown } from "./parse-markdown.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_ROOT = resolve(__dirname, "..", "storage", "pikalytics");

interface CliArgs {
  format: string;
  date: string;
}

interface ParseFailureRecord {
  file: string;
  error: string;
  attemptedAt: string;
}

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { format: "championspreview", date: todayUtc() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format" && argv[i + 1]) {
      args.format = argv[i + 1]!;
      i++;
    } else if (a === "--date" && argv[i + 1]) {
      args.date = argv[i + 1]!;
      i++;
    }
  }
  return args;
}

export async function parseAllForFormat(args: CliArgs): Promise<{
  successCount: number;
  failureCount: number;
  failures: ParseFailureRecord[];
}> {
  const dir = resolve(STORAGE_ROOT, args.date, args.format);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  const mdFiles = entries.filter(
    (f) => f.endsWith(".md") && f !== "_index.md",
  );

  console.log(
    `[parse-all] format=${args.format} date=${args.date} files=${mdFiles.length}`,
  );

  const failures: ParseFailureRecord[] = [];
  let successCount = 0;

  for (let i = 0; i < mdFiles.length; i++) {
    const file = mdFiles[i]!;
    const mdPath = resolve(dir, file);
    const jsonPath = mdPath.replace(/\.md$/i, ".json");
    try {
      const md = await readFile(mdPath, "utf8");
      const parsed = parsePikalyticsMarkdown(md);
      await writeFile(jsonPath, JSON.stringify(parsed, null, 2), "utf8");
      successCount++;
    } catch (err) {
      failures.push({
        file,
        error: String(err),
        attemptedAt: new Date().toISOString(),
      });
      console.log(`[parse-all] ERROR ${file}: ${String(err)}`);
    }
    if ((i + 1) % 10 === 0) {
      console.log(
        `[parse-all] progress ${i + 1}/${mdFiles.length} (ok:${successCount} fail:${failures.length})`,
      );
    }
  }

  if (failures.length > 0) {
    const failuresPath = resolve(dir, "_parse-failures.json");
    await writeFile(failuresPath, JSON.stringify(failures, null, 2), "utf8");
    console.log(
      `[parse-all] wrote ${failures.length} failure record(s) to ${failuresPath}`,
    );
  }

  console.log(
    `[parse-all] done format=${args.format} ok=${successCount} fail=${failures.length}`,
  );
  return {
    successCount,
    failureCount: failures.length,
    failures,
  };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  const args = parseCliArgs(process.argv.slice(2));
  parseAllForFormat(args).catch((err) => {
    console.error("[parse-all] FAILED:", err);
    process.exit(1);
  });
}
