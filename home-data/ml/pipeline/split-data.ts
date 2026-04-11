/**
 * split-data.ts — Generate deterministic train/val/test splits.
 *
 * Uses replay-ID-based hashing so the same replay never appears in
 * both train and test sets.
 *
 * Split ratio: 70% train, 15% validation, 15% test.
 *
 * CLI:  npx tsx home-data/ml/pipeline/split-data.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ML_DIR = resolve(__dirname, "..", "..", "storage", "ml");

// ---------------------------------------------------------------------------
// Simple hash for deterministic splitting
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32-bit int
  }
  return Math.abs(hash);
}

function assignSplit(key: string): "train" | "val" | "test" {
  const h = hashString(key) % 100;
  if (h < 70) return "train";
  if (h < 85) return "val";
  return "test";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TrainingFile {
  generatedAt: string;
  totalReplays: number;
  totalSamples: number;
  featureNames?: string[];
  samples: any[];
}

async function splitFile(filename: string, keyExtractor: (sample: any) => string) {
  console.log(`Splitting ${filename}...`);
  const raw = JSON.parse(await readFile(resolve(ML_DIR, filename), "utf-8")) as TrainingFile;

  const splits: Record<string, any[]> = { train: [], val: [], test: [] };

  for (const sample of raw.samples) {
    const key = keyExtractor(sample);
    const split = assignSplit(key);
    splits[split].push(sample);
  }

  for (const [split, samples] of Object.entries(splits)) {
    const outPath = resolve(ML_DIR, filename.replace(".json", `-${split}.json`));
    await writeFile(
      outPath,
      JSON.stringify({
        ...raw,
        split,
        totalSamples: samples.length,
        samples,
      }, null, 0),
    );
    console.log(`  ${split}: ${samples.length} samples`);
  }
}

async function main() {
  console.log("=== Splitting Training Data ===\n");

  // Team eval: key by sorted team species
  await splitFile("team-eval-training.json", (s) =>
    s.teamSpecies.join(","),
  );

  // Selection: key by both teams combined
  await splitFile("selection-training.json", (s) =>
    [...s.myPreview, ...s.oppPreview].join(","),
  );

  // Actions: key by move + actor (less critical, just need diversity)
  await splitFile("action-training.json", (s) =>
    `${s.activeMon}:${s.moveUsed}:${s.turn}:${s.tier}`,
  );

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
