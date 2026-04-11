/**
 * Probe variations to find the working request shape for cbd/competition/rankmatch/list.
 */

const URL = "https://api.battle.pokemon-home.com/cbd/competition/rankmatch/list";

const BASE_HEADERS: Record<string, string> = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "content-type": "application/json",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 8.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

interface Variation {
  name: string;
  headers: Record<string, string>;
  body: unknown;
}

const variations: Variation[] = [
  {
    name: "v1: Sv + langcode 1 + countrycode 304 + Bearer",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "Sv" },
  },
  {
    name: "v2: Sv only, no auth",
    headers: { ...BASE_HEADERS, countrycode: "304", langcode: "1" },
    body: { soft: "Sv" },
  },
  {
    name: "v3: Sw (Sword/Shield)",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "Sw" },
  },
  {
    name: "v4: empty body",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: {},
  },
  {
    name: "v5: Sv + cnt(1) + hash",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "Sv", cnt: 1 },
  },
  {
    name: "v6: Sv + asc",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "Sv", asc: false },
  },
  {
    name: "v7: PT (Pokemon Champions guess?)",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "Pc" },
  },
  {
    name: "v8: lowercase sv",
    headers: {
      ...BASE_HEADERS,
      countrycode: "304",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "sv" },
  },
  {
    name: "v9: countrycode JP=392",
    headers: {
      ...BASE_HEADERS,
      countrycode: "392",
      authorization: "Bearer",
      langcode: "1",
    },
    body: { soft: "Sv" },
  },
];

async function probe(v: Variation): Promise<void> {
  console.log(`\n--- ${v.name} ---`);
  console.log(`  headers: ${JSON.stringify(v.headers).slice(0, 200)}`);
  console.log(`  body: ${JSON.stringify(v.body)}`);
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: v.headers,
      body: JSON.stringify(v.body),
    });
    const text = await res.text();
    console.log(`  → ${res.status}: ${text.slice(0, 300)}`);
  } catch (e) {
    console.log(`  → ERROR: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  for (const v of variations) {
    await probe(v);
    await new Promise((r) => setTimeout(r, 500)); // be polite
  }
}

main().catch(console.error);
