// Downloads the US Census ZCTA gazetteer (ZIP → lat/lng) and writes
// src/db/seed/zips.json for fast offline ZIP search.
// Usage: node scripts/fetch-zips.mjs
import { inflateRawSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const YEARS = [2024, 2023, 2022];
let buf;
for (const y of YEARS) {
  const url = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${y}_Gazetteer/${y}_Gaz_zcta_national.zip`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 packradar" } });
  if (res.ok) {
    buf = Buffer.from(await res.arrayBuffer());
    console.log("downloaded", url, buf.length);
    break;
  }
  console.log("miss", url, res.status);
}
if (!buf) throw new Error("could not download gazetteer");

// Minimal ZIP reader: first local file entry.
if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
const method = buf.readUInt16LE(8);
let compSize = buf.readUInt32LE(18);
const nameLen = buf.readUInt16LE(26);
const extraLen = buf.readUInt16LE(28);
const start = 30 + nameLen + extraLen;
if (compSize === 0) {
  // sizes in data descriptor / central directory – find central dir entry
  const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  compSize = buf.readUInt32LE(cd + 20);
}
const data = buf.subarray(start, start + compSize);
const text = (method === 8 ? inflateRawSync(data) : data).toString("utf8");

const lines = text.split(/\r?\n/);
const header = lines[0].split("\t").map((h) => h.trim());
const iZip = header.indexOf("GEOID");
const iLat = header.indexOf("INTPTLAT");
const iLng = header.indexOf("INTPTLONG");
const out = {};
for (const line of lines.slice(1)) {
  const c = line.split("\t");
  if (c.length < 3) continue;
  out[c[iZip].trim()] = [Number(Number(c[iLat]).toFixed(4)), Number(Number(c[iLng]).toFixed(4))];
}
writeFileSync("src/db/seed/zips.json", JSON.stringify(out));
console.log("zips:", Object.keys(out).length);
