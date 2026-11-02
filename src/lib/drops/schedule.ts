/**
 * Drop-time math for Pokémon vending machines.
 *
 * Machines "drip" product on an internal timer: every `intervalMinutes`
 * minutes, aligned to `anchorMinute` (minutes after local midnight), but only
 * inside the machine's active window (store hours) and on enabled weekdays.
 *
 * Everything here is pure + isomorphic (runs in the browser for live map
 * pins, and on the server for alerts/notifications).
 */

export type DropSchedule = {
  /** Minutes between drops (e.g. 60 = hourly). 1440 = once per day. */
  intervalMinutes: number;
  /** Reference drop, minutes after local midnight (0..1439). e.g. 37 => hourly at :37 */
  anchorMinute: number;
  /** Local minute-of-day when drops begin (inclusive). */
  activeStartMinute: number;
  /** Local minute-of-day when drops end (inclusive). May be < start to span midnight. */
  activeEndMinute: number;
  /** Bitmask of enabled weekdays. bit0 = Sunday … bit6 = Saturday. 127 = every day. */
  daysMask: number;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
};

export type DropStatus = "dropped" | "imminent" | "idle" | "unknown";

/** Green window after a drop (minutes). */
export const DROPPED_WINDOW_MIN = 5;
/** Yellow window before a drop (minutes). */
export const IMMINENT_WINDOW_MIN = 10;
/** Accuracy (0-100) below which a schedule is flagged as unconfirmed. */
export const CONFIRMED_ACCURACY_THRESHOLD = 90;

const MIN_MS = 60_000;
const DAY_MIN = 1440;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function getFormatter(timezone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timezone, f);
  }
  return f;
}

export type LocalClock = {
  /** 0 = Sunday */
  weekday: number;
  /** Fractional minute of day, e.g. 637.5 = 10:37:30 */
  minuteOfDay: number;
  year: number;
  month: number;
  day: number;
};

/** Local wall-clock for a UTC instant in the given timezone. */
export function localClock(nowMs: number, timezone: string): LocalClock {
  const parts = getFormatter(timezone).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const ms = nowMs % 1000;
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minuteOfDay: hour * 60 + minute + (second + ms / 1000) / 60,
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function inActiveWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return true; // treat as 24h
  if (start < end) return minute >= start && minute <= end;
  return minute >= start || minute <= end; // spans midnight
}

const dropMinutesCache = new Map<string, number[]>();

/** Sorted list of local minutes-of-day when the machine drops. */
export function dropMinutesForDay(s: DropSchedule): number[] {
  const interval = Math.max(1, Math.round(s.intervalMinutes));
  const key = `${interval}|${s.anchorMinute}|${s.activeStartMinute}|${s.activeEndMinute}`;
  const cached = dropMinutesCache.get(key);
  if (cached) return cached;
  const first = (((Math.round(s.anchorMinute) % interval) + interval) % interval);
  const out: number[] = [];
  for (let m = first; m < DAY_MIN; m += interval) {
    if (inActiveWindow(m, s.activeStartMinute, s.activeEndMinute)) out.push(m);
  }
  dropMinutesCache.set(key, out);
  return out;
}

function dayEnabled(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0;
}

export type DropWindow = {
  /** UTC ms of the most recent drop (or null if none within the past 8 days). */
  prevDropMs: number | null;
  /** UTC ms of the next drop (or null if none within the next 8 days). */
  nextDropMs: number | null;
};

/**
 * Find the previous and next drop around `nowMs`.
 * Uses local minute arithmetic (DST shifts inside the window are ignored,
 * which is accurate to within the hour on the two transition days a year).
 */
export function getDropWindow(s: DropSchedule, nowMs: number): DropWindow {
  const minutes = dropMinutesForDay(s);
  if (minutes.length === 0 || s.daysMask === 0) {
    return { prevDropMs: null, nextDropMs: null };
  }
  const clock = localClock(nowMs, s.timezone);
  let prevDelta = -Infinity;
  let nextDelta = Infinity;

  for (let d = -8; d <= 8; d++) {
    const weekday = (((clock.weekday + d) % 7) + 7) % 7;
    if (!dayEnabled(s.daysMask, weekday)) continue;
    for (const m of minutes) {
      // For windows spanning midnight, minutes before the start belong to the
      // previous "business day" but are still real wall-clock drops on this
      // calendar day, so no special handling is needed.
      const delta = d * DAY_MIN + m - clock.minuteOfDay;
      if (delta <= 0 && delta > prevDelta) prevDelta = delta;
      if (delta > 0 && delta < nextDelta) nextDelta = delta;
    }
    if (d > 0 && nextDelta !== Infinity && prevDelta !== -Infinity) break;
  }

  return {
    prevDropMs: Number.isFinite(prevDelta) ? nowMs + prevDelta * MIN_MS : null,
    nextDropMs: Number.isFinite(nextDelta) ? nowMs + nextDelta * MIN_MS : null,
  };
}

/** All drop instants in (fromMs, toMs], capped at `max`. */
export function dropTimesBetween(s: DropSchedule, fromMs: number, toMs: number, max = 12): number[] {
  const out: number[] = [];
  let t = fromMs;
  while (out.length < max) {
    const next = getDropWindow(s, t).nextDropMs;
    if (next == null || next > toMs) break;
    out.push(next);
    t = next + 1000;
  }
  return out;
}

export type DropState = DropWindow & {
  status: DropStatus;
  /** Seconds until next drop (null if unknown). */
  secondsToNext: number | null;
  /** Seconds since last drop (null if unknown). */
  secondsSincePrev: number | null;
};

/** Compute pin status: green (dropped ≤5 min ago), yellow (≤10 min to go), red otherwise. */
export function getDropState(
  s: DropSchedule | null | undefined,
  nowMs: number = Date.now(),
): DropState {
  if (!s) {
    return {
      status: "unknown",
      prevDropMs: null,
      nextDropMs: null,
      secondsToNext: null,
      secondsSincePrev: null,
    };
  }
  const w = getDropWindow(s, nowMs);
  const secondsToNext =
    w.nextDropMs != null ? Math.max(0, Math.round((w.nextDropMs - nowMs) / 1000)) : null;
  const secondsSincePrev =
    w.prevDropMs != null ? Math.max(0, Math.round((nowMs - w.prevDropMs) / 1000)) : null;

  let status: DropStatus = "idle";
  if (secondsSincePrev != null && secondsSincePrev <= DROPPED_WINDOW_MIN * 60) {
    status = "dropped";
  } else if (secondsToNext != null && secondsToNext <= IMMINENT_WINDOW_MIN * 60) {
    status = "imminent";
  }
  return { ...w, status, secondsToNext, secondsSincePrev };
}

/** "10:37 AM" style label for a minute-of-day. */
export function formatMinuteOfDay(minute: number): string {
  const m = ((Math.round(minute) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDays(mask: number): string {
  if ((mask & 127) === 127) return "Every day";
  if (mask === 0b0111110) return "Weekdays";
  if (mask === 0b1000001) return "Weekends";
  return DAY_LABELS.filter((_, i) => mask & (1 << i)).join(", ");
}

/** Human description, e.g. "Every 60 min at :37 · 8:00 AM–10:00 PM". */
export function describeSchedule(s: DropSchedule): string {
  const interval = Math.round(s.intervalMinutes);
  let core: string;
  if (interval >= DAY_MIN) {
    core = `Daily at ${formatMinuteOfDay(s.anchorMinute)}`;
  } else if (interval === 60) {
    core = `Hourly at :${String(Math.round(s.anchorMinute) % 60).padStart(2, "0")}`;
  } else if (60 % interval === 0) {
    const offsets = dropMinutesForDay({ ...s, activeStartMinute: 0, activeEndMinute: 0 })
      .filter((m) => m < 60)
      .map((m) => `:${String(m).padStart(2, "0")}`);
    core = `Every ${interval} min (${offsets.join(", ")})`;
  } else {
    core = `Every ${interval} min from ${formatMinuteOfDay(
      ((s.anchorMinute % interval) + interval) % interval,
    )}`;
  }
  const window =
    s.activeStartMinute === s.activeEndMinute
      ? "24 hours"
      : `${formatMinuteOfDay(s.activeStartMinute)}–${formatMinuteOfDay(s.activeEndMinute)}`;
  const days = formatDays(s.daysMask);
  return `${core} · ${window}${days === "Every day" ? "" : ` · ${days}`}`;
}

export function formatCountdown(totalSeconds: number | null): string {
  if (totalSeconds == null) return "—";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
