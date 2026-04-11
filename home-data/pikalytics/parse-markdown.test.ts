/**
 * Tests for `parsePikalyticsMarkdown` against the Incineroar fixture in
 * `home-data/storage/raw-recon/41-pikalytics-incineroar.md`.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parsePikalyticsMarkdown } from "./parse-markdown.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(
  __dirname,
  "..",
  "storage",
  "raw-recon",
  "41-pikalytics-incineroar.md",
);

async function loadFixture() {
  const md = await readFile(FIXTURE_PATH, "utf8");
  return parsePikalyticsMarkdown(md);
}

describe("parsePikalyticsMarkdown — Incineroar fixture", () => {
  it("extracts the Pokemon name", async () => {
    const parsed = await loadFixture();
    expect(parsed.pokemon).toBe("Incineroar");
  });

  it("extracts the format from Quick Info", async () => {
    const parsed = await loadFixture();
    expect(parsed.format).toBe("championspreview");
  });

  it("extracts the data date from Quick Info", async () => {
    const parsed = await loadFixture();
    expect(parsed.dataDate).toBe("2026-03");
  });

  it("parses the top move", async () => {
    const parsed = await loadFixture();
    expect(parsed.moves[0]).toEqual({ name: "Fake Out", pct: 41.092 });
  });

  it("parses 10 moves", async () => {
    const parsed = await loadFixture();
    expect(parsed.moves).toHaveLength(10);
  });

  it("parses the top ability", async () => {
    const parsed = await loadFixture();
    expect(parsed.abilities[0]).toEqual({ name: "Intimidate", pct: 60.647 });
  });

  it("parses the top item", async () => {
    const parsed = await loadFixture();
    expect(parsed.items[0]).toEqual({ name: "Sitrus Berry", pct: 8.305 });
  });

  it("parses the top teammate", async () => {
    const parsed = await loadFixture();
    expect(parsed.teammates[0]).toEqual({ name: "Sinistcha", pct: 31.618 });
  });

  it("parses base stats: HP", async () => {
    const parsed = await loadFixture();
    expect(parsed.baseStats.hp).toBe(95);
  });

  it("parses base stats: Atk", async () => {
    const parsed = await loadFixture();
    expect(parsed.baseStats.atk).toBe(115);
  });

  it("parses base stats: BST", async () => {
    const parsed = await loadFixture();
    expect(parsed.baseStats.bst).toBe(530);
  });
});
