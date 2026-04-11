/**
 * selection/predict.ts — Selection prediction API.
 *
 * Given my 6 Pokemon and opponent's 6 Pokemon, recommends which 4 to bring.
 * Uses the trained GBDT model from selection-weights.json.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deserializeGBDT, predictGBDT, type GBDTModel } from "../../lib/gradient-boost.js";
import { buildEmbeddingIndex, type EmbeddingIndex } from "../../features/species-embedding.js";
import { extractPerMonFeatures } from "../../features/matchup-features.js";
import { normalizeMega } from "../../features/replay-walker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ML_DIR = resolve(__dirname, "..", "..", "..", "storage", "ml");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectionRecommendation {
  species: string;
  bringProbability: number;
  recommended: boolean; // in top 4
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

let cachedModel: GBDTModel | null = null;
let cachedEmbeddings: EmbeddingIndex | null = null;

async function ensureModel(): Promise<{ model: GBDTModel; embeddings: EmbeddingIndex }> {
  if (!cachedModel) {
    const raw = JSON.parse(
      await readFile(resolve(ML_DIR, "selection-weights.json"), "utf-8"),
    );
    cachedModel = deserializeGBDT(raw.model);
  }
  if (!cachedEmbeddings) {
    cachedEmbeddings = await buildEmbeddingIndex();
  }
  return { model: cachedModel, embeddings: cachedEmbeddings };
}

/**
 * Predict optimal selection given my team and opponent's team.
 *
 * @param myTeam - My 6 Pokemon species names
 * @param oppTeam - Opponent's 6 Pokemon species names
 * @returns Sorted array of recommendations (highest bringProbability first)
 */
export async function predictSelection(
  myTeam: string[],
  oppTeam: string[],
): Promise<SelectionRecommendation[]> {
  const { model, embeddings } = await ensureModel();

  const normalizedMy = myTeam.map(normalizeMega);
  const normalizedOpp = oppTeam.map(normalizeMega);

  const results: SelectionRecommendation[] = [];

  for (const mon of normalizedMy) {
    const features = await extractPerMonFeatures(mon, normalizedOpp, normalizedMy, embeddings);
    const prob = predictGBDT(model, features);
    results.push({
      species: mon,
      bringProbability: prob,
      recommended: false,
    });
  }

  // Sort by probability descending
  results.sort((a, b) => b.bringProbability - a.bringProbability);

  // Mark top 4 as recommended
  for (let i = 0; i < Math.min(4, results.length); i++) {
    results[i].recommended = true;
  }

  return results;
}

// ---------------------------------------------------------------------------
// CLI demo
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("predict.ts")) {
  // Demo: predict selection for a sample matchup
  const myTeam = ["Charizard", "Farigiraf", "Incineroar", "Torkoal", "Ursaluna", "Venusaur"];
  const oppTeam = ["Garchomp", "Whimsicott", "Archaludon", "Sinistcha", "Sneasler", "Incineroar"];

  predictSelection(myTeam, oppTeam).then((recs) => {
    console.log("=== Selection Recommendation ===\n");
    console.log(`My team:  ${myTeam.join(", ")}`);
    console.log(`Opp team: ${oppTeam.join(", ")}\n`);
    console.log("Recommendations:");
    for (const r of recs) {
      const marker = r.recommended ? "✓" : " ";
      console.log(`  ${marker} ${r.species}: ${(r.bringProbability * 100).toFixed(1)}%`);
    }
  }).catch(console.error);
}
