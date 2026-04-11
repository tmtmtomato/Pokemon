import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("home-data/storage/pikalytics/2026-04-08/gen9ou");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json");
const d = JSON.parse(readFileSync(resolve(dir, files[0]), "utf8"));
console.log("file:", files[0]);
console.log("keys:", Object.keys(d));
console.log("teraTypes:", JSON.stringify(d.teraTypes, null, 2));
console.log("spreads:", JSON.stringify(d.spreads, null, 2));
console.log("\nrawMarkdown excerpt (first 4000 chars):");
console.log(d.rawMarkdown?.slice(0, 4000));
