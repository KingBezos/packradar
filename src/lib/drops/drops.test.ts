import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  dropMinutesForDay,
  getDropState,
  localClock,
  type DropSchedule,
} from "./schedule";
import { inferTimer, observationMatches } from "./inference";
import {
  computeAccuracy,
  pickActiveCandidate,
  scrapedBaseConfidence,
  type CorroborationInput,
} from "./accuracy";

const LA = "America/Los_Angeles";
const hourly37: DropSchedule = {
  intervalMinutes: 60,
  anchorMinute: 37,
  activeStartMinute: 8 * 60,
  activeEndMinute: 22 * 60,
  daysMask: 127,
  timezone: LA,
};

/** UTC ms for a wall-clock time in Los Angeles during PDT (UTC-7). */
const laPdt = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  Date.UTC(y, mo - 1, d, h + 7, mi, s);

describe("schedule math", () => {
  it("reads local clock in a timezone", () => {
    const c = localClock(laPdt(2026, 10, 20, 10, 30), LA);
    expect(Math.floor(c.minuteOfDay)).toBe(10 * 60 + 30);
    expect(c.weekday).toBe(2); // Tuesday
  });

  it("lists drop minutes inside the active window", () => {
    const mins = dropMinutesForDay(hourly37);
    expect(mins[0]).toBe(8 * 60 + 37);
    expect(mins.at(-1)).toBe(21 * 60 + 37);
    expect(mins).toHaveLength(14);
  });

  it("is red (idle) when no drop is close", () => {
    const s = getDropState(hourly37, laPdt(2026, 10, 20, 10, 5));
    expect(s.status).toBe("idle");
    expect(s.secondsToNext).toBe(32 * 60);
  });

  it("is yellow (imminent) within 10 minutes of a drop", () => {
    const s = getDropState(hourly37, laPdt(2026, 10, 20, 10, 28));
    expect(s.status).toBe("imminent");
    expect(s.secondsToNext).toBe(9 * 60);
  });

  it("is green (dropped) for 5 minutes after a drop", () => {
    expect(getDropState(hourly37, laPdt(2026, 10, 20, 10, 37)).status).toBe("dropped");
    expect(getDropState(hourly37, laPdt(2026, 10, 20, 10, 41, 59)).status).toBe("dropped");
    expect(getDropState(hourly37, laPdt(2026, 10, 20, 10, 43)).status).toBe("idle");
  });

  it("rolls over to the next morning after store hours", () => {
    const s = getDropState(hourly37, laPdt(2026, 10, 20, 23, 0));
    expect(s.status).toBe("idle");
    // next is 8:37 next day = 9h37m away
    expect(s.secondsToNext).toBe((9 * 60 + 37) * 60);
  });

  it("respects disabled weekdays", () => {
    const weekdaysOnly = { ...hourly37, daysMask: 0b0111110 };
    // Sat Oct 24 2026 at 10:30 → next drop Monday 8:37
    const s = getDropState(weekdaysOnly, laPdt(2026, 10, 24, 10, 30));
    expect(s.secondsToNext).toBe((13 * 60 + 30 + 24 * 60 + 8 * 60 + 37) * 60);
  });

  it("returns unknown without a schedule", () => {
    expect(getDropState(null).status).toBe("unknown");
  });

  it("describes schedules", () => {
    expect(describeSchedule(hourly37)).toBe("Hourly at :37 · 8:00 AM–10:00 PM");
    expect(describeSchedule({ ...hourly37, intervalMinutes: 30, anchorMinute: 7 })).toContain(
      "Every 30 min (:07, :37)",
    );
  });
});

describe("timer inference", () => {
  it("recovers an hourly :37 timer (not a 15/30 divisor)", () => {
    const obs = [laPdt(2026, 10, 19, 9, 37), laPdt(2026, 10, 19, 13, 38), laPdt(2026, 10, 20, 16, 36)];
    const t = inferTimer(obs, LA)!;
    expect(t.intervalMinutes).toBe(60);
    expect(t.anchorMinute).toBe(37);
  });

  it("recovers a 30-minute timer", () => {
    const obs = [laPdt(2026, 10, 19, 9, 7), laPdt(2026, 10, 19, 9, 37), laPdt(2026, 10, 19, 12, 7)];
    const t = inferTimer(obs, LA)!;
    expect(t.intervalMinutes).toBe(30);
    expect(t.anchorMinute).toBe(7);
  });

  it("assumes hourly with fewer than 3 observations", () => {
    const t = inferTimer([laPdt(2026, 10, 19, 14, 52)], LA)!;
    expect(t).toMatchObject({ intervalMinutes: 60, anchorMinute: 52 });
  });

  it("matches observations within tolerance", () => {
    expect(observationMatches(hourly37, laPdt(2026, 10, 19, 15, 39))).toBe(true);
    expect(observationMatches(hourly37, laPdt(2026, 10, 19, 15, 45))).toBe(false);
  });
});

describe("accuracy meter + consensus", () => {
  const base: CorroborationInput = {
    source: "scraped",
    baseConfidence: 40,
    verified: false,
    confirms: 0,
    disputes: 0,
    matchingObservations: 0,
    conflictingObservations: 0,
    daysSinceLastCorroboration: 1,
  };

  it("starts at base confidence", () => {
    expect(computeAccuracy(base)).toBe(40);
  });

  it("climbs toward (but never reaches) 100% with corroboration", () => {
    const a5 = computeAccuracy({ ...base, confirms: 5 });
    const a20 = computeAccuracy({ ...base, confirms: 10, matchingObservations: 10 });
    expect(a5).toBeGreaterThan(70);
    expect(a20).toBeGreaterThan(a5);
    expect(a20).toBeLessThanOrEqual(99);
  });

  it("falls with disputes", () => {
    expect(computeAccuracy({ ...base, disputes: 3 })).toBeLessThan(25);
  });

  it("verified = 100%", () => {
    expect(computeAccuracy({ ...base, verified: true })).toBe(100);
  });

  it("decays when not re-confirmed for weeks", () => {
    const fresh = computeAccuracy({ ...base, confirms: 5 });
    const stale = computeAccuracy({ ...base, confirms: 5, daysSinceLastCorroboration: 40 });
    expect(stale).toBeLessThan(fresh);
  });

  it("scraped base confidence rewards agreeing sources and penalizes age", () => {
    const one = scrapedBaseConfidence({ sourceReliability: 0.6, agreeingSources: 1, ageDays: 1 });
    const three = scrapedBaseConfidence({ sourceReliability: 0.6, agreeingSources: 3, ageDays: 1 });
    const old = scrapedBaseConfidence({ sourceReliability: 0.6, agreeingSources: 1, ageDays: 60 });
    expect(three).toBeGreaterThan(one);
    expect(old).toBeLessThan(one);
  });

  it("community majority replaces scraped time, with hysteresis", () => {
    const scraped = { id: "s", accuracy: 40, verified: false, supporters: 0, updatedAtMs: 1 };
    const lone = { id: "c1", accuracy: 43, verified: false, supporters: 1, updatedAtMs: 2 };
    expect(pickActiveCandidate([scraped, lone], "s")!.id).toBe("s"); // one person isn't enough
    const crowd = { id: "c2", accuracy: 62, verified: false, supporters: 3, updatedAtMs: 3 };
    expect(pickActiveCandidate([scraped, crowd], "s")!.id).toBe("c2");
    const verified = { id: "v", accuracy: 100, verified: true, supporters: 0, updatedAtMs: 0 };
    expect(pickActiveCandidate([crowd, verified], "c2")!.id).toBe("v");
  });
});
