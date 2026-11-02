import { describe, expect, it } from "vitest";
import { buildRouteCorridors, inferCorridorSchedules, type ClusterMachineInput } from "./clusters";
import { extractExifDateFromBuffer, extractReceiptTimestampFromText } from "./exif";
import { isImpossibleTravel } from "./safeguards";
import { voteWeight } from "./accuracy";

describe("Route-Cluster Corridor Intelligence", () => {
  const sampleMachines: ClusterMachineInput[] = [
    {
      id: "Q01304",
      retailer: "Safeway",
      street: "13434 Colton Pl",
      city: "Oregon City",
      state: "OR",
      lat: 45.336,
      lng: -122.592,
      intervalMinutes: 60,
      anchorMinute: 12,
      accuracy: 92,
      scheduleVerified: false,
    },
    {
      id: "Q01124",
      retailer: "Safeway",
      street: "95 82nd Dr",
      city: "Gladstone",
      state: "OR",
      lat: 45.381,
      lng: -122.582,
      intervalMinutes: 60,
      anchorMinute: 42,
      accuracy: 94,
      scheduleVerified: false,
    },
    {
      id: "Q00137",
      retailer: "Safeway",
      street: "14840 SE Webster Rd",
      city: "Milwaukie",
      state: "OR",
      lat: 45.415,
      lng: -122.598,
      intervalMinutes: null,
      anchorMinute: null,
      accuracy: null,
      scheduleVerified: false,
    },
  ];

  it("groups neighboring same-family machines into an ordered servicing corridor", () => {
    const corridors = buildRouteCorridors(sampleMachines);
    expect(corridors.length).toBe(1);
    expect(corridors[0].members.map((m) => m.id)).toEqual(["Q01304", "Q01124", "Q00137"]);
    expect(corridors[0].knownCount).toBe(2);
    expect(corridors[0].confirmedCount).toBe(2);
  });

  it("propagates an inferred drop schedule onto unknown corridor stops", () => {
    const corridors = buildRouteCorridors(sampleMachines);
    const inferences = inferCorridorSchedules(corridors);
    expect(inferences.length).toBe(1);
    expect(inferences[0].machineId).toBe("Q00137");
    expect(inferences[0].intervalMinutes).toBe(60);
    expect(inferences[0].anchorMinute).toBeGreaterThanOrEqual(0);
    expect(inferences[0].anchorMinute).toBeLessThan(60);
    expect(inferences[0].basedOnMachineIds).toContain("Q01124");
  });
});

describe("EXIF & Receipt Timestamp Extractor", () => {
  it("extracts DateTimeOriginal from JPEG EXIF ASCII header", () => {
    const fakeHeader = "Exif\x00\x00II*\x00DateTimeOriginal\x002026:10:26 14:43:12\x00";
    const buf = new TextEncoder().encode(fakeHeader);
    const dt = extractExifDateFromBuffer(buf);
    expect(dt).not.toBeNull();
    expect(dt!.getHours()).toBe(14);
    expect(dt!.getMinutes()).toBe(43);
  });

  it("parses receipt time and Q-code from OCR text", () => {
    const parsed = extractReceiptTimestampFromText("POKEMON CENTER KIOSK Q01124 TOTAL $26.94 02:43:19 PM");
    expect(parsed).toEqual({
      hour: 14,
      minute: 43,
      machineCode: "Q01124",
    });
  });
});

describe("Anti-Spam, Impossible Travel & Negative Rep Safeguards", () => {
  it("flags teleportation between Portland OR and Seattle WA within 5 minutes as impossible", () => {
    const now = Date.now();
    const res = isImpossibleTravel(
      { lat: 45.5152, lng: -122.6784, timeMs: now - 5 * 60_000 }, // Portland
      { lat: 47.6062, lng: -122.3321, timeMs: now }, // Seattle (~145 miles)
    );
    expect(res.impossible).toBe(true);
    expect(res.distanceMiles).toBeGreaterThan(140);
    expect(res.impliedMph).toBeGreaterThan(90);
  });

  it("allows normal driving between nearby Gladstone and Oregon City machines", () => {
    const now = Date.now();
    const res = isImpossibleTravel(
      { lat: 45.381, lng: -122.582, timeMs: now - 10 * 60_000 },
      { lat: 45.336, lng: -122.592, timeMs: now },
    );
    expect(res.impossible).toBe(false);
  });

  it("dampens vote weight for penalized spammers with negative reputation", () => {
    expect(voteWeight(-10)).toBe(0.05);
    expect(voteWeight(-5)).toBe(0.05);
    expect(voteWeight(-2)).toBe(0.2);
    expect(voteWeight(0)).toBe(1);
    expect(voteWeight(100)).toBeGreaterThan(1.5);
  });
});
