import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PackRadar – Pokémon Vending Drop Times",
    short_name: "PackRadar",
    description: "Live Pokémon TCG vending machine drop times, alerts, news and releases.",
    start_url: "/map",
    display: "standalone",
    background_color: "#070b16",
    theme_color: "#070b16",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
