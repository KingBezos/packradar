import * as maplibregl from "maplibre-gl";

let ready = false;

/** Load MapLibre with its worker served from /public (works under Turbopack/webpack). */
export function getMaplibre() {
  if (!ready) {
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    ready = true;
  }
  return maplibregl;
}
