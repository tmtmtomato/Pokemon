/**
 * Probe Sc/Vi/Sh soft codes against rankmatch/list.
 */

const HEADERS = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "content-type": "application/json",
  countrycode: "304",
  authorization: "Bearer",
  langcode: "1",
  "user-agent": "Mozilla/5.0 (Linux; Android 8.0)",
};

async function main(): Promise<void> {
  const tests = [
    { soft: "Sc" },
    { soft: "Vi" },
    { soft: "Sh" },
    { soft: "ScVi" },
  ];

  for (const body of tests) {
    const res = await fetch(
      "https://api.battle.pokemon-home.com/cbd/competition/rankmatch/list",
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      },
    );
    const txt = await res.text();
    console.log(JSON.stringify(body), "→", res.status, txt.slice(0, 250));
    await new Promise((r) => setTimeout(r, 400));
  }
}

main().catch(console.error);
