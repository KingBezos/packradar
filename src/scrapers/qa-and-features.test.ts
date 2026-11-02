import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { INITIAL_TICKER_ACTIVITY, lookupZipCentroid, SEED_RELEASES } from "@/db/seed";
import { getVapidPublicKey, pushConfigured } from "@/lib/notify/channels";
import { BASELINE_NEWS_ARTICLES, buildOriginalArticleBody, classifyNews } from "./adapters/news";
import { FULL_RELEASE_CATALOG } from "@/app/releases/page";
import { generateSpotterHandle } from "@/lib/auth";
import { signIdentityCookie, verifyIdentityCookie } from "@/lib/session";

describe("PackRadar Production Readiness & QA Verification", () => {
  it("verifies all INITIAL_TICKER_ACTIVITY machine links exist in official-machines.json", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src", "db", "seed", "official-machines.json"), "utf8"),
    ) as { name: string; lat: number; lng: number; street: string; city: string; stateProvince: string }[];
    const codes = new Set(raw.map((m) => m.name.toUpperCase()));

    for (const item of INITIAL_TICKER_ACTIVITY) {
      if (item.machineId) {
        expect(codes.has(item.machineId)).toBe(true);
        expect(item.url).toBe(`/machines/${item.machineId}`);
      }
    }

    const q00810 = raw.find((m) => m.name === "Q00810");
    expect(q00810).toBeDefined();
    expect(q00810!.city.toUpperCase()).toBe("SEATTLE");
    expect(q00810!.lat).toBeCloseTo(47.67066, 3);
    expect(q00810!.lng).toBeCloseTo(-122.38727, 3);
  });

  it("verifies Alerts page ZIP centroid lookup and VAPID Web Push configuration", () => {
    expect(pushConfigured()).toBe(true);
    expect(getVapidPublicKey().length).toBeGreaterThan(60);

    for (const zip of ["97201", "98107", "90210", "10001", "60601", "75201"]) {
      const pt = lookupZipCentroid(zip);
      expect(pt).not.toBeNull();
      expect(Number.isFinite(pt!.lat)).toBe(true);
      expect(Number.isFinite(pt!.lng)).toBe(true);
    }
  });

  it("verifies Releases catalog has individual product SKUs and screenshots for every set", () => {
    expect(SEED_RELEASES.every((r) => r.imageUrl.startsWith("https://images.pokemontcg.io/"))).toBe(true);
    expect(FULL_RELEASE_CATALOG.length).toBeGreaterThanOrEqual(8);

    for (const set of FULL_RELEASE_CATALOG) {
      expect(set.heroImage).toMatch(/^https:\/\/images\.pokemontcg\.io\//);
      expect(set.products.length).toBeGreaterThanOrEqual(2);
      for (const prod of set.products) {
        expect(prod.imageUrl).toMatch(/^https:\/\/images\.pokemontcg\.io\//);
        expect(prod.msrp).toBeGreaterThan(0);
      }
    }
  });

  it("verifies 6-hour News Bot baseline articles and original article generator", () => {
    expect(BASELINE_NEWS_ARTICLES.length).toBeGreaterThanOrEqual(5);
    for (const art of BASELINE_NEWS_ARTICLES) {
      expect(art.body.length).toBeGreaterThan(300);
      expect(art.imageUrl).toMatch(/^https:\/\/images\.pokemontcg\.io\//);
    }

    const generated = buildOriginalArticleBody(
      {
        title: "Pokémon TCG Prismatic Evolutions Booster Bundle Reprint Wave Announced",
        link: "https://example.com/prismatic-reprint",
        text: "The Pokémon Company confirmed additional reprint waves of Prismatic Evolutions Booster Bundles and Elite Trainer Boxes arriving at retailers.",
        html: "",
        published: new Date(),
        imageUrl: null,
        author: null,
        source: "PokémonBlog",
      },
      classifyNews("Prismatic Evolutions Booster Bundle Reprint", "TCG restock"),
    );
    expect(generated).toContain("## Key Collector Takeaways");
    expect(generated).toContain("## Retail, Drop & Vending Impact");
    expect(generated).toContain("$26.94");
  });

  it("generates privacy-safe spotter handles and preserves King_Bezos permanently", () => {
    const h1 = generateSpotterHandle("seed-user-1");
    const h2 = generateSpotterHandle("seed-user-2");
    expect(h1).toMatch(/^[A-Za-z]+\d{3}$/);
    expect(h2).toMatch(/^[A-Za-z]+\d{3}$/);
    expect(h1).not.toBe(h2);
    expect(generateSpotterHandle("james@jpegtown.com")).toBe("King_Bezos");

    const signed = signIdentityCookie({
      id: "owner-1",
      email: "james@jpegtown.com",
      name: "King_Bezos",
      role: "admin",
      plan: "premium",
      reputation: 100,
      homeZip: "97201",
      sessionToken: "tok123",
    });
    const verified = verifyIdentityCookie(signed);
    expect(verified?.name).toBe("King_Bezos");
    expect(verified?.role).toBe("admin");
  });
});
