// Copies MapLibre's web-worker bundle into /public so it can be served as a
// plain static file (bundlers can't resolve MapLibre's worker URL reliably).
// Runs automatically before dev/build (see package.json).
import { cpSync, mkdirSync, readdirSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist";
const dest = "public/maplibre";
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (/^maplibre-gl-(worker|shared)\.mjs$/.test(f)) cpSync(`${src}/${f}`, `${dest}/${f}`);
}
console.log("maplibre worker files copied to", dest);
