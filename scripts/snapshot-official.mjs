// One-off: capture a snapshot of real machines from the official locator for
// a handful of metros, used as offline seed data. Throttled to avoid blocks.
// Usage: node scripts/snapshot-official.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const METROS = {
  Seattle: [47.61, -122.33],
  Portland: [45.52, -122.68],
  "San Francisco": [37.77, -122.42],
  "Los Angeles": [34.05, -118.25],
  "San Diego": [32.72, -117.16],
  Phoenix: [33.45, -112.07],
  Denver: [39.74, -104.99],
  Dallas: [32.78, -96.8],
  Houston: [29.76, -95.37],
  Chicago: [41.88, -87.63],
  Atlanta: [33.75, -84.39],
  Cincinnati: [39.1, -84.51],
  Columbus: [39.96, -83.0],
  Indianapolis: [39.77, -86.16],
  Nashville: [36.16, -86.78],
  "Las Vegas": [36.17, -115.14],
  "Salt Lake City": [40.76, -111.89],
  Washington: [38.9, -77.04],
};

const HALF = 0.35; // ~25 miles box
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const all = new Map();

for (const [name, [lat, lng]] of Object.entries(METROS)) {
  const url = `https://api.vending.prod.pokemon.com/v1/machines?swLat=${lat - HALF}&swLng=${lng - HALF}&neLat=${lat + HALF}&neLng=${lng + HALF}&unit=mi`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Origin: "https://vending.pokemon.com",
        Referer: "https://vending.pokemon.com/",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.log(name, "HTTP", res.status);
    } else {
      const j = await res.json();
      for (const m of j.machines ?? []) all.set(m.id, m);
      console.log(name, (j.machines ?? []).length);
    }
  } catch (e) {
    console.log(name, "ERR", e.message);
  }
  await sleep(4000 + Math.random() * 2000);
}

mkdirSync("src/db/seed", { recursive: true });
const list = [...all.values()].map(({ distance, ...rest }) => rest);
writeFileSync("src/db/seed/official-machines.json", JSON.stringify(list, null, 1));
console.log("TOTAL", list.length);
