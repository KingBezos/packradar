import { describe, expect, it } from "vitest";
import { extractDropTimers, matchMachines, type MachineRef } from "./extract";
import { detectStock } from "./adapters/retail";

describe("detectStock strict MSRP verifier", () => {
  it("never marks search result pages as in stock from generic Add to Cart text", () => {
    const html = `<html><body><div>Search results for Journey Together Booster Bundle. <button>Add to Cart</button></div>` + "x".repeat(400) + `</body></html>`;
    const r1 = detectStock(html, "https://www.pokemoncenter.com/search/journey-together-booster-bundle", 26.94);
    expect(r1.inStock).toBe(false);

    const r2 = detectStock(html, "https://www.amazon.com/s?k=pokemon+prismatic+evolutions+booster+bundle", 26.94);
    expect(r2.inStock).toBe(false);
  });

  it("rejects 3rd-party scalper prices above MSRP even when JSON-LD says InStock", () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"Product","offers":{"availability":"https://schema.org/InStock","price":"78.99"}}</script></head><body>` + "x".repeat(300) + `</body></html>`;
    const r = detectStock(html, "https://www.amazon.com/dp/B0DT45XYZ", 26.94);
    expect(r.inStock).toBe(false);
    expect(r.reason).toBe("above_msrp_scalper");
  });

  it("accepts verified JSON-LD InStock when price is at MSRP", () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"Product","offers":{"availability":"https://schema.org/InStock","price":"26.94"}}</script></head><body>` + "x".repeat(300) + `</body></html>`;
    const r = detectStock(html, "https://www.target.com/p/pokemon-booster-bundle/-/A-91234567", 26.94);
    expect(r.inStock).toBe(true);
    expect(r.reason).toBe("verified_msrp");
  });
});

describe("extractDropTimers", () => {
  it("finds ':37' hourly timers", () => {
    const r = extractDropTimers("The Safeway on Madison drops every hour at :37, got 2 ETBs");
    expect(r[0]).toMatchObject({ intervalMinutes: 60, anchorMinute: 37 });
    expect(r[0].confidence).toBeGreaterThan(0.8);
  });

  it("finds minute-mark phrasing", () => {
    const r = extractDropTimers("Machine resets and drops at the 52 minute mark now");
    expect(r[0]).toMatchObject({ intervalMinutes: 60, anchorMinute: 52 });
  });

  it("handles 'every 30 minutes' with x:07", () => {
    const r = extractDropTimers("QFC broadway restocks every 30 minutes, x:07 and x:37");
    expect(r.map((x) => x.anchorMinute)).toContain(7);
    expect(r.every((x) => x.intervalMinutes === 30)).toBe(true);
  });

  it("infers from explicit clock times", () => {
    const r = extractDropTimers("It dropped at 2:14pm and again at 3:14pm, then 4:14");
    expect(r[0]).toMatchObject({ intervalMinutes: 60, anchorMinute: 14 });
  });

  it("finds 'on the hour'", () => {
    expect(extractDropTimers("drops right on the hour")[0]).toMatchObject({ anchorMinute: 0 });
  });

  it("ignores text without drop context", () => {
    expect(extractDropTimers("Meet me at 10:30 for lunch")).toEqual([]);
  });
});

describe("matchMachines", () => {
  const all: MachineRef[] = [
    { id: "Q01168", retailer: "Safeway", city: "Seattle", state: "WA", street: "2201 E Madison St" },
    { id: "Q00245", retailer: "QFC", city: "Seattle", state: "WA", street: "1401 Broadway" },
    { id: "Q00159", retailer: "Safeway", city: "Seattle", state: "WA", street: "1410 E John St" },
  ];
  it("resolves direct codes", () => {
    expect(matchMachines("machine q00245 drops at :10", all)).toEqual([{ id: "Q00245", score: 10 }]);
  });
  it("resolves by retailer + street", () => {
    expect(matchMachines("The Safeway on Madison in Seattle drops at :37", all)[0].id).toBe("Q01168");
  });
  it("refuses ambiguous matches", () => {
    expect(matchMachines("some safeway drops at :37", all)).toEqual([]);
  });
});
