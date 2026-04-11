/**
 * Try the /tt/ prefixed endpoint and other variations.
 */

const HEADERS = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "content-type": "application/json",
  countrycode: "304",
  authorization: "Bearer",
  langcode: "1",
  "user-agent": "Mozilla/5.0 (Linux; Android 8.0)",
};

const urls = [
  "https://api.battle.pokemon-home.com/tt/cbd/competition/rankmatch/list",
  "https://api.battle.pokemon-home.com/cbd/competition/rankmatch/list",
];

const bodies = [
  { soft: "Sc" },
  { soft: "Vi" },
  { soft: "Sw" },
  {},
];

async function main(): Promise<void> {
  for (const url of urls) {
    for (const body of bodies) {
      const res = await fetch(url, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const txt = await res.text();
      console.log(
        url.replace("https://api.battle.pokemon-home.com", ""),
        JSON.stringify(body),
        "→",
        res.status,
        txt.slice(0, 250),
      );
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

main().catch(console.error);
