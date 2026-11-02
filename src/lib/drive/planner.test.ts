import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_OPTIONS, planDrive, type PlanMachine } from "./planner";
import type { DropSchedule } from "@/lib/drops/schedule";

const LA = "America/Los_Angeles";
const sched = (anchor: number, interval = 60): DropSchedule => ({
  intervalMinutes: interval,
  anchorMinute: anchor,
  activeStartMinute: 0,
  activeEndMinute: 0,
  daysMask: 127,
  timezone: LA,
});
const at = (h: number, m: number) => Date.UTC(2026, 9, 20, h + 7, m); // PDT
const mk = (id: string, lat: number, lng: number, anchor: number, acc = 95): PlanMachine => ({
  id,
  label: id,
  lat,
  lng,
  schedule: sched(anchor),
  accuracy: acc,
  verified: false,
});
const base = { ...DEFAULT_PLAN_OPTIONS, start: { lat: 47.6, lng: -122.3 }, startMs: at(10, 0) };

describe("planDrive", () => {
  it("orders stops so each drop is caught", () => {
    // A drops at :10 (near), B at :40 (a bit further)
    const a = mk("A", 47.61, -122.3, 10);
    const b = mk("B", 47.65, -122.3, 30);
    const p = planDrive([b, a], { ...base, horizonMin: 60, maxStops: 2 });
    expect(p.stops.map((s) => s.machine.id)).toEqual(["A", "B"]);
    for (const s of p.stops) expect(s.arriveMs).toBeLessThanOrEqual(s.dropMs + 5 * 60_000);
  });

  it("skips machines without a schedule", () => {
    const x: PlanMachine = { ...mk("X", 47.6, -122.3, 0), schedule: null };
    const p = planDrive([x], base);
    expect(p.stops).toHaveLength(0);
    expect(p.skipped[0].reason).toMatch(/No known/);
  });

  it("skips machines too far to reach in time", () => {
    const far = mk("FAR", 40.0, -122.3, 12); // ~500 miles
    expect(planDrive([far], { ...base, horizonMin: 30 }).stops).toHaveLength(0);
  });

  it("prefers high-confidence drops when it can only do one", () => {
    // both drop at :20 at opposite sides; can only reach one
    const hi = mk("HI", 47.7, -122.3, 20, 98);
    const lo = mk("LO", 47.5, -122.3, 20, 30);
    const p = planDrive([lo, hi], { ...base, horizonMin: 25, maxStops: 1 });
    expect(p.stops[0].machine.id).toBe("HI");
  });

  it("never visits a machine twice and respects maxStops", () => {
    const ms = [10, 20, 30, 40, 50].map((a, i) => mk(`M${i}`, 47.6 + i * 0.005, -122.3, a));
    const p = planDrive(ms, { ...base, maxStops: 3 });
    expect(p.stops.length).toBeLessThanOrEqual(3);
    expect(new Set(p.stops.map((s) => s.machine.id)).size).toBe(p.stops.length);
  });
});
