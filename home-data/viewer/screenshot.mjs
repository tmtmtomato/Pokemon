/**
 * Capture a 1024x768 full-page PNG of the freshly built meta viewer.
 *
 * Usage:
 *   node home-data/viewer/screenshot.mjs
 *
 * Loads build/meta.html via file:// and writes the image into
 * home-data/viewer/screenshots/meta.png. If Playwright cannot launch a
 * browser (missing system dependencies on some Windows sandboxes), the
 * script prints a warning and exits 0 so that it never breaks the build.
 */

import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
const htmlPath = join(repoRoot, "build", "meta.html");
const outDir = join(__dirname, "screenshots");
const outFile = join(outDir, "meta.png");

async function main() {
  mkdirSync(outDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.warn("playwright launch failed, skipping screenshot:", err?.message ?? err);
    return;
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const url = pathToFileURL(htmlPath).href;
    console.log("loading", url);
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    // Give React a moment to hydrate after load.
    await page.waitForTimeout(500);
    // Viewport-only screenshot (default for the viewer UX).
    await page.screenshot({ path: outFile, fullPage: false });
    console.log("wrote", outFile);
    // Also a full-page version for completeness.
    const fullFile = join(outDir, "meta-fullpage.png");
    await page.screenshot({ path: fullFile, fullPage: true });
    console.log("wrote", fullFile);
    // Switch to a Pokemon other than the default (verifies UI interaction works).
    const items = page.locator("ul.divide-y > li > button");
    if ((await items.count()) > 5) {
      await items.nth(2).click();
      await page.waitForTimeout(200);
      const file2 = join(outDir, "meta-rank3.png");
      await page.screenshot({ path: file2, fullPage: false });
      console.log("wrote", file2);
    }
    // Switch to the gen9ou format tab (the only one with EV spread data) and
    // capture the rank-1 detail to verify the new "Top Build" section.
    const tabs = page.locator("header button", { hasText: "Gen 9 OU" });
    if ((await tabs.count()) > 0) {
      await tabs.first().click();
      await page.waitForTimeout(300);
      const gen9File = join(outDir, "meta-gen9ou.png");
      await page.screenshot({ path: gen9File, fullPage: false });
      console.log("wrote", gen9File);
      const gen9Full = join(outDir, "meta-gen9ou-fullpage.png");
      await page.screenshot({ path: gen9Full, fullPage: true });
      console.log("wrote", gen9Full);

      // Toggle to English UI and capture the same view to verify the
      // language switch + move-name localization both directions.
      const langBtn = page.locator('button[aria-label="toggle language"]');
      if ((await langBtn.count()) > 0) {
        await langBtn.first().click();
        await page.waitForTimeout(200);
        const enFile = join(outDir, "meta-gen9ou-en.png");
        await page.screenshot({ path: enFile, fullPage: false });
        console.log("wrote", enFile);
        // Toggle back to JA so subsequent runs reset to default.
        await langBtn.first().click();
        await page.waitForTimeout(200);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.warn("screenshot script failed:", err?.message ?? err);
  process.exit(0);
});
